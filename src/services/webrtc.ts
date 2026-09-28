/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { collection, addDoc, onSnapshot, query, where, Unsubscribe, deleteDoc } from 'firebase/firestore';
import { db, ensureAuthReady } from './firebase';
import { StorageService } from './storage';
import { sanitizeIceCandidate } from './crypto';

export interface WebRtcSignalPayload {
  roomId: string;
  senderId: string;
  type: 'webrtc_offer' | 'webrtc_answer' | 'webrtc_ice' | 'webrtc_ready';
  sdp?: string;
  candidate?: RTCIceCandidateInit;
  timestamp: number;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.services.mozilla.com' },
  ],
  iceCandidatePoolSize: 10,
};

/**
 * Enhances WebRTC SDP to enforce Opus discontinuous transmission (DTX),
 * forward error correction (FEC), pure mono transmission (to eliminate speakerphone echo),
 * and voice-optimized bandwidth.
 */
function enhanceOpusVoiceSdp(sdp: string): string {
  if (!sdp) return sdp;

  // Find opus payload type (typically 111)
  const opusMatch = sdp.match(/a=rtpmap:(\d+)\s+opus\/48000/i);
  if (!opusMatch) return sdp;

  const opusPayloadType = opusMatch[1];
  const fmtpRegex = new RegExp(`a=fmtp:${opusPayloadType}\\s+([^\\r\\n]+)`, 'i');

  const extraVoiceParams = [
    'minptime=10',
    'useinbandfec=1',
    'usedtx=1',             // Discontinuous transmission: zero packets transmitted during silence (removes background hiss)
    'stereo=0',             // Mono transmission: eliminates acoustic phase reflections
    'sprop-stereo=0',
    'cbr=0',
    'maxaveragebitrate=32000' // Wideband voice clarity
  ];

  if (fmtpRegex.test(sdp)) {
    return sdp.replace(fmtpRegex, (_match, existingParams: string) => {
      let params = existingParams;
      if (!params.includes('usedtx=')) params += ';usedtx=1';
      else params = params.replace(/usedtx=\d+/g, 'usedtx=1');

      if (!params.includes('useinbandfec=')) params += ';useinbandfec=1';
      else params = params.replace(/useinbandfec=\d+/g, 'useinbandfec=1');

      if (!params.includes('stereo=')) params += ';stereo=0;sprop-stereo=0';
      else params = params.replace(/stereo=\d+/g, 'stereo=0').replace(/sprop-stereo=\d+/g, 'sprop-stereo=0');

      if (!params.includes('maxaveragebitrate=')) params += ';maxaveragebitrate=32000';

      return `a=fmtp:${opusPayloadType} ${params}`;
    });
  } else {
    const rtpmapLine = `a=rtpmap:${opusPayloadType} opus/48000/2`;
    const newFmtpLine = `${rtpmapLine}\r\na=fmtp:${opusPayloadType} ${extraVoiceParams.join(';')}`;
    return sdp.replace(rtpmapLine, newFmtpLine);
  }
}

export class WebRtcManager {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private processedStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private remoteAudioElement: HTMLAudioElement | null = null;

  // Real-time Web Audio DSP Voice Pipeline
  private audioCtx: AudioContext | null = null;
  private rawMicSource: MediaStreamAudioSourceNode | null = null;
  private highpassFilter: BiquadFilterNode | null = null;
  private presenceFilter: BiquadFilterNode | null = null;
  private lowpassFilter: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private voiceGateGain: GainNode | null = null;
  private micMasterGain: GainNode | null = null;
  private dspDestination: MediaStreamAudioDestinationNode | null = null;

  // Voice Activity Detection / Noise Gate Interval
  private vadInterval: any = null;
  private lastVoiceTime: number = 0;

  // Echo Loopback for Automated Node testing
  private echoSource: MediaStreamAudioSourceNode | null = null;
  private echoDelay: DelayNode | null = null;
  private echoGain: GainNode | null = null;

  // Audio Analysis for Visualizer
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array = new Uint8Array(32);
  private zeroFreqData: Uint8Array = new Uint8Array(32);

  // Mute & State Flags
  private isMuted: boolean = false;
  private isSpeakerEnabled: boolean = true;

  // Signaling state
  private roomId: string = '';
  private peerId: string = 'peer_' + Math.random().toString(36).substring(2, 9);
  private isInitiator: boolean = false;
  private isEcho: boolean = false;
  private unsubscribeFirestore: Unsubscribe | null = null;
  private unsubscribeBroadcast: (() => void) | null = null;
  private iceCandidatesQueue: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet: boolean = false;
  private onRemoteTrackCallback: ((active: boolean) => void) | null = null;

  constructor() {
    this.createAudioElement();
  }

  private createAudioElement(): void {
    if (typeof document === 'undefined') return;
    let audio = document.getElementById('webrtc-remote-audio') as HTMLAudioElement;
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = 'webrtc-remote-audio';
      audio.autoplay = true;
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('webkit-playsinline', 'true');
      audio.style.display = 'none';
      document.body.appendChild(audio);
    }
    this.remoteAudioElement = audio;
  }

  private getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  /**
   * Initializes full-duplex WebRTC audio connection with DSP Voice Isolation.
   */
  async startCallSession(params: {
    roomId: string;
    isInitiator: boolean;
    isEchoNode: boolean;
    onRemoteAudioActive?: (active: boolean) => void;
  }): Promise<boolean> {
    this.cleanup();
    this.createAudioElement();

    this.roomId = params.roomId;
    this.isInitiator = params.isInitiator;
    this.isEcho = params.isEchoNode;
    this.onRemoteTrackCallback = params.onRemoteAudioActive || null;
    this.remoteDescriptionSet = false;
    this.iceCandidatesQueue = [];
    this.isMuted = false;
    this.isSpeakerEnabled = true;

    try {
      // 1. Acquire local microphone stream with high-fidelity hardware AEC & noise suppression
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const audioConstraints: any = {
            echoCancellation: { ideal: true },
            noiseSuppression: { ideal: true },
            autoGainControl: { ideal: true },
            googEchoCancellation: { ideal: true },
            googAutoGainControl: { ideal: true },
            googNoiseSuppression: { ideal: true },
            googHighpassFilter: { ideal: true },
            googTypingNoiseDetection: { ideal: true },
            googAudioMirroring: { ideal: false },
            channelCount: { ideal: 1 },
            sampleRate: { ideal: 48000 },
          };

          this.localStream = await navigator.mediaDevices.getUserMedia({
            audio: audioConstraints,
            video: false,
          });
        } catch (micErr) {
          console.warn('Microphone hardware access restricted:', micErr);
        }
      }

      const ctx = this.getAudioContext();

      // 2. Setup AnalyserNode for spectrum visualization
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.8;

      // 3. Automated Echo Loopback Mode (for @echo_node only)
      if (this.isEcho) {
        if (this.localStream) {
          this.echoSource = ctx.createMediaStreamSource(this.localStream);
          this.echoDelay = ctx.createDelay();
          this.echoDelay.delayTime.value = 0.22; // 220ms cybernetic echo delay

          this.echoGain = ctx.createGain();
          this.echoGain.gain.value = 0.7; // Attenuated loopback

          this.echoSource.connect(this.echoDelay);
          this.echoDelay.connect(this.echoGain);
          this.echoGain.connect(ctx.destination);
          this.echoSource.connect(this.analyser);
        }

        if (this.onRemoteTrackCallback) {
          this.onRemoteTrackCallback(true);
        }
        return true;
      }

      // 4. Build Real-Time Web Audio DSP Voice Purification Pipeline
      // Raw Mic -> Highpass (85Hz) -> Presence Peak (2.8kHz) -> Lowpass (7.8kHz) -> Dynamics Compressor -> Voice Gate -> Mic Master Gain -> Stream Destination
      if (this.localStream && this.localStream.getAudioTracks().length > 0) {
        this.rawMicSource = ctx.createMediaStreamSource(this.localStream);

        // Highpass Filter (85Hz): Strips HVAC rumble, desk thumps, fan vibrations, AC hum
        this.highpassFilter = ctx.createBiquadFilter();
        this.highpassFilter.type = 'highpass';
        this.highpassFilter.frequency.setValueAtTime(85, ctx.currentTime);
        this.highpassFilter.Q.setValueAtTime(0.7, ctx.currentTime);

        // Peaking Presence Filter (2800Hz): Maximizes vocal clarity and articulation
        this.presenceFilter = ctx.createBiquadFilter();
        this.presenceFilter.type = 'peaking';
        this.presenceFilter.frequency.setValueAtTime(2800, ctx.currentTime);
        this.presenceFilter.gain.setValueAtTime(2.5, ctx.currentTime); // +2.5dB vocal presence
        this.presenceFilter.Q.setValueAtTime(1.0, ctx.currentTime);

        // Lowpass Filter (7800Hz): Cuts out electrical whine, high-frequency hiss
        this.lowpassFilter = ctx.createBiquadFilter();
        this.lowpassFilter.type = 'lowpass';
        this.lowpassFilter.frequency.setValueAtTime(7800, ctx.currentTime);
        this.lowpassFilter.Q.setValueAtTime(0.7, ctx.currentTime);

        // Dynamics Compressor: Prevents speech distortion spikes and lifts whisper clarity
        this.compressor = ctx.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-36, ctx.currentTime);
        this.compressor.knee.setValueAtTime(12, ctx.currentTime);
        this.compressor.ratio.setValueAtTime(3.5, ctx.currentTime);
        this.compressor.attack.setValueAtTime(0.003, ctx.currentTime);
        this.compressor.release.setValueAtTime(0.15, ctx.currentTime);

        // Dynamic Voice Activity Gate: Attenuates background silence to prevent acoustic loopback
        this.voiceGateGain = ctx.createGain();
        this.voiceGateGain.gain.setValueAtTime(1.0, ctx.currentTime);

        // Master Mic Gain: For instantaneous hardware-clean muting
        this.micMasterGain = ctx.createGain();
        this.micMasterGain.gain.setValueAtTime(1.0, ctx.currentTime);

        // Destination for WebRTC Peer Transmission
        this.dspDestination = ctx.createMediaStreamDestination();

        // Connect DSP chain
        this.rawMicSource.connect(this.highpassFilter);
        this.highpassFilter.connect(this.presenceFilter);
        this.presenceFilter.connect(this.lowpassFilter);
        this.lowpassFilter.connect(this.compressor);
        this.compressor.connect(this.voiceGateGain);
        this.voiceGateGain.connect(this.micMasterGain);
        this.micMasterGain.connect(this.dspDestination);
        this.micMasterGain.connect(this.analyser); // Connect to visualizer without feeding to speakers

        this.processedStream = this.dspDestination.stream;

        // Start Voice Activity Detection (VAD) / Noise Gate Loop
        this.startVoiceActivityDetector();
      }

      // 5. Peer-to-Peer WebRTC Mode (between registered subscribers)
      this.peerConnection = new RTCPeerConnection(ICE_SERVERS);

      // Add processed stream tracks (or raw fallback) to peer connection
      const streamToSend = this.processedStream || this.localStream;
      if (streamToSend) {
        streamToSend.getAudioTracks().forEach((track) => {
          this.peerConnection?.addTrack(track, streamToSend);
        });
      }

      // Handle receiving remote peer audio stream
      this.peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          this.remoteStream = event.streams[0];
          if (this.remoteAudioElement) {
            this.remoteAudioElement.srcObject = this.remoteStream;
            this.remoteAudioElement.muted = !this.isSpeakerEnabled;
            this.remoteAudioElement.play().catch(() => {
              const unlock = () => {
                this.remoteAudioElement?.play().catch(() => {});
                document.removeEventListener('click', unlock);
                document.removeEventListener('touchend', unlock);
              };
              document.addEventListener('click', unlock, { once: true });
              document.addEventListener('touchend', unlock, { once: true });
            });
          }

          if (this.onRemoteTrackCallback) {
            this.onRemoteTrackCallback(true);
          }
        }
      };

      // Handle ICE Candidates with Anti-Metadata / Local IP Leak Protection
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          if (event.candidate.candidate) {
            const sanitized = sanitizeIceCandidate(event.candidate.candidate);
            if (!sanitized) {
              // Strip private LAN IP / host leakage
              return;
            }
          }
          this.dispatchSignal({
            roomId: this.roomId,
            senderId: this.peerId,
            type: 'webrtc_ice',
            candidate: event.candidate.toJSON(),
            timestamp: Date.now(),
          });
        }
      };

      this.peerConnection.onconnectionstatechange = () => {
        if (this.peerConnection?.connectionState === 'connected') {
          if (this.onRemoteTrackCallback) {
            this.onRemoteTrackCallback(true);
          }
        }
      };

      // 6. Start listening to remote WebRTC signaling
      this.subscribeSignaling();

      // 7. If caller (initiator), create and broadcast enhanced WebRTC Offer
      if (this.isInitiator) {
        const rawOffer = await this.peerConnection.createOffer({
          offerToReceiveAudio: true,
        });

        // Munge SDP to enforce Opus DTX, FEC, and mono anti-echo transmission
        const cleanSdp = enhanceOpusVoiceSdp(rawOffer.sdp || '');
        const cleanOffer = new RTCSessionDescription({ type: 'offer', sdp: cleanSdp });
        await this.peerConnection.setLocalDescription(cleanOffer);

        await this.dispatchSignal({
          roomId: this.roomId,
          senderId: this.peerId,
          type: 'webrtc_offer',
          sdp: cleanSdp,
          timestamp: Date.now(),
        });
      } else {
        // Callee: Announce readiness to the initiator
        await this.dispatchSignal({
          roomId: this.roomId,
          senderId: this.peerId,
          type: 'webrtc_ready',
          timestamp: Date.now(),
        });
      }

      return true;
    } catch (err) {
      console.warn('WebRTC connection setup error:', err);
      return false;
    }
  }

  /**
   * Adaptive Voice Activity Detector (VAD) and Noise Gate:
   * Smoothly attenuates mic gain by -36dB when user is silent,
   * completely eliminating background noise and preventing speaker echo.
   */
  private startVoiceActivityDetector(): void {
    if (this.vadInterval) clearInterval(this.vadInterval);
    this.lastVoiceTime = Date.now();

    const sampleBuffer = new Uint8Array(32);

    this.vadInterval = setInterval(() => {
      if (!this.analyser || !this.voiceGateGain || !this.audioCtx || this.isMuted) return;

      this.analyser.getByteFrequencyData(sampleBuffer);
      let sum = 0;
      for (let i = 0; i < sampleBuffer.length; i++) {
        sum += sampleBuffer[i];
      }
      const avg = sum / sampleBuffer.length;

      const now = Date.now();
      const ctx = this.audioCtx;

      // Threshold: speech energy above ambient noise floor
      if (avg > 18) {
        this.lastVoiceTime = now;
        // Instant voice open (4ms)
        this.voiceGateGain.gain.setTargetAtTime(1.0, ctx.currentTime, 0.005);
      } else {
        // Hold open for 160ms so word endings aren't clipped, then smoothly attenuate
        if (now - this.lastVoiceTime > 160) {
          this.voiceGateGain.gain.setTargetAtTime(0.02, ctx.currentTime, 0.05); // -34dB reduction during silence
        }
      }
    }, 30);
  }

  /**
   * Dispatches WebRTC SDP / ICE signals via Firestore and local BroadcastChannel.
   */
  private async dispatchSignal(signal: WebRtcSignalPayload): Promise<void> {
    try {
      // 1. Broadcast locally for multi-tab testing
      StorageService.broadcastSync('WEBRTC_SIGNAL', signal);

      // 2. Dispatch to Cloud Firestore for cross-device calling worldwide
      await ensureAuthReady();
      await addDoc(collection(db, 'signals'), {
        ...signal,
        targetRoom: this.roomId,
      });
    } catch (e) {
      console.warn('WebRTC dispatch notice:', e);
    }
  }

  /**
   * Subscribes to WebRTC signaling messages for this room.
   */
  private subscribeSignaling(): void {
    // 1. BroadcastChannel (multi-tab / same machine)
    this.unsubscribeBroadcast = StorageService.subscribeSync((data) => {
      if (data.action === 'WEBRTC_SIGNAL') {
        const payload = data.payload as WebRtcSignalPayload;
        if (payload && payload.roomId === this.roomId && payload.senderId !== this.peerId) {
          this.handleIncomingSignal(payload);
        }
      }
    });

    // 2. Cloud Firestore (cross-device worldwide)
    try {
      const q = query(
        collection(db, 'signals'),
        where('roomId', '==', this.roomId)
      );

      this.unsubscribeFirestore = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data() as WebRtcSignalPayload;
            if (data.senderId !== this.peerId) {
              this.handleIncomingSignal(data);
              deleteDoc(change.doc.ref).catch(() => {});
            }
          }
        });
      }, (err) => {
        console.warn('WebRTC Firestore signals notice:', err);
      });
    } catch {}
  }

  /**
   * Handles incoming WebRTC SDP Offer / Answer and ICE candidate packets.
   */
  private async handleIncomingSignal(signal: WebRtcSignalPayload): Promise<void> {
    if (!this.peerConnection || this.isEcho) return;

    try {
      if (signal.type === 'webrtc_offer' && !this.isInitiator) {
        if (!signal.sdp) return;
        await this.peerConnection.setRemoteDescription(
          new RTCSessionDescription({ type: 'offer', sdp: signal.sdp })
        );
        this.remoteDescriptionSet = true;
        this.processQueuedCandidates();

        const rawAnswer = await this.peerConnection.createAnswer();
        const cleanAnswerSdp = enhanceOpusVoiceSdp(rawAnswer.sdp || '');
        const cleanAnswer = new RTCSessionDescription({ type: 'answer', sdp: cleanAnswerSdp });
        await this.peerConnection.setLocalDescription(cleanAnswer);

        await this.dispatchSignal({
          roomId: this.roomId,
          senderId: this.peerId,
          type: 'webrtc_answer',
          sdp: cleanAnswerSdp,
          timestamp: Date.now(),
        });
      } else if (signal.type === 'webrtc_answer' && this.isInitiator) {
        if (!signal.sdp) return;
        await this.peerConnection.setRemoteDescription(
          new RTCSessionDescription({ type: 'answer', sdp: signal.sdp })
        );
        this.remoteDescriptionSet = true;
        this.processQueuedCandidates();
      } else if (signal.type === 'webrtc_ice' && signal.candidate) {
        if (this.remoteDescriptionSet) {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } else {
          this.iceCandidatesQueue.push(signal.candidate);
        }
      } else if (signal.type === 'webrtc_ready' && this.isInitiator && this.peerConnection.signalingState === 'stable') {
        const rawOffer = await this.peerConnection.createOffer({ offerToReceiveAudio: true });
        const cleanOfferSdp = enhanceOpusVoiceSdp(rawOffer.sdp || '');
        await this.peerConnection.setLocalDescription(
          new RTCSessionDescription({ type: 'offer', sdp: cleanOfferSdp })
        );
        await this.dispatchSignal({
          roomId: this.roomId,
          senderId: this.peerId,
          type: 'webrtc_offer',
          sdp: cleanOfferSdp,
          timestamp: Date.now(),
        });
      }
    } catch (e) {
      console.warn('WebRTC signal process notice:', e);
    }
  }

  private async processQueuedCandidates(): Promise<void> {
    if (!this.peerConnection) return;
    while (this.iceCandidatesQueue.length > 0) {
      const cand = this.iceCandidatesQueue.shift();
      if (cand) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
        } catch {}
      }
    }
  }

  /**
   * Toggles microphone mute across all hardware tracks, Web Audio gain nodes,
   * and WebRTC peer connection senders.
   */
  setMicrophoneMuted(isMuted: boolean): void {
    this.isMuted = isMuted;

    // 1. Web Audio Master Gain attenuation
    if (this.micMasterGain && this.audioCtx) {
      this.micMasterGain.gain.setValueAtTime(isMuted ? 0 : 1.0, this.audioCtx.currentTime);
    }

    // 2. Hardware microphone tracks
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted;
      });
    }

    // 3. DSP Processed output tracks
    if (this.processedStream) {
      this.processedStream.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted;
      });
    }

    // 4. WebRTC Peer Connection Senders
    if (this.peerConnection) {
      this.peerConnection.getSenders().forEach((sender) => {
        if (sender.track && sender.track.kind === 'audio') {
          sender.track.enabled = !isMuted;
        }
      });
    }

    // 5. Echo Loopback Node (if active)
    if (this.echoSource && this.echoGain) {
      this.echoGain.gain.value = isMuted ? 0 : 0.7;
    }
  }

  /**
   * Toggles speaker output.
   */
  setSpeakerEnabled(isEnabled: boolean): void {
    this.isSpeakerEnabled = isEnabled;
    if (this.remoteAudioElement) {
      this.remoteAudioElement.muted = !isEnabled;
    }
    if (this.echoGain) {
      this.echoGain.gain.value = isEnabled ? 0.7 : 0;
    }
  }

  /**
   * Retrieves real-time audio frequencies for the visualizer.
   * Returns flatline zero data if muted.
   */
  getAudioFrequencies(): Uint8Array {
    if (this.isMuted) {
      return this.zeroFreqData;
    }

    if (this.analyser) {
      const data = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(data);
      return data;
    }

    for (let i = 0; i < 32; i++) {
      this.freqData[i] = Math.floor(Math.sin(Date.now() / 250 + i * 0.4) * 35 + 50);
    }
    return this.freqData;
  }

  /**
   * Shuts down WebRTC connections, DSP pipelines, audio hardware, and listeners.
   */
  cleanup(): void {
    if (this.vadInterval) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }

    if (this.unsubscribeFirestore) {
      this.unsubscribeFirestore();
      this.unsubscribeFirestore = null;
    }
    if (this.unsubscribeBroadcast) {
      this.unsubscribeBroadcast();
      this.unsubscribeBroadcast = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }

    if (this.processedStream) {
      this.processedStream.getTracks().forEach((t) => t.stop());
      this.processedStream = null;
    }

    if (this.remoteAudioElement) {
      this.remoteAudioElement.srcObject = null;
      this.remoteAudioElement.pause();
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // Clean up Web Audio DSP nodes
    if (this.rawMicSource) {
      try { this.rawMicSource.disconnect(); } catch {}
      this.rawMicSource = null;
    }
    if (this.highpassFilter) {
      try { this.highpassFilter.disconnect(); } catch {}
      this.highpassFilter = null;
    }
    if (this.presenceFilter) {
      try { this.presenceFilter.disconnect(); } catch {}
      this.presenceFilter = null;
    }
    if (this.lowpassFilter) {
      try { this.lowpassFilter.disconnect(); } catch {}
      this.lowpassFilter = null;
    }
    if (this.compressor) {
      try { this.compressor.disconnect(); } catch {}
      this.compressor = null;
    }
    if (this.voiceGateGain) {
      try { this.voiceGateGain.disconnect(); } catch {}
      this.voiceGateGain = null;
    }
    if (this.micMasterGain) {
      try { this.micMasterGain.disconnect(); } catch {}
      this.micMasterGain = null;
    }
    if (this.dspDestination) {
      try { this.dspDestination.disconnect(); } catch {}
      this.dspDestination = null;
    }

    if (this.echoSource) {
      try { this.echoSource.disconnect(); } catch {}
      this.echoSource = null;
    }
    if (this.echoDelay) {
      try { this.echoDelay.disconnect(); } catch {}
      this.echoDelay = null;
    }
    if (this.echoGain) {
      try { this.echoGain.disconnect(); } catch {}
      this.echoGain = null;
    }

    this.remoteDescriptionSet = false;
    this.iceCandidatesQueue = [];
    this.onRemoteTrackCallback = null;
    this.isMuted = false;
  }
}

export const webRtcManager = new WebRtcManager();

