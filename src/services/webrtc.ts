/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { collection, addDoc, onSnapshot, query, where, Unsubscribe, deleteDoc } from 'firebase/firestore';
import { db, ensureAuthReady } from './firebase';
import { StorageService } from './storage';

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

export class WebRtcManager {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private remoteAudioElement: HTMLAudioElement | null = null;

  // Echo Loopback for Automated Node testing
  private audioCtx: AudioContext | null = null;
  private echoSource: MediaStreamAudioSourceNode | null = null;
  private echoDelay: DelayNode | null = null;
  private echoGain: GainNode | null = null;

  // Audio Analysis for Visualizer
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array = new Uint8Array(32);

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
   * Initializes full-duplex WebRTC audio connection for a room session.
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

    try {
      // 1. Acquire local microphone stream
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          this.localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: 1,
            },
            video: false,
          });
        } catch (micErr) {
          console.warn('Microphone hardware access restricted:', micErr);
        }
      }

      // 2. Setup AnalyserNode for live sound wave visualization
      const ctx = this.getAudioContext();
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.8;

      if (this.localStream) {
        const source = ctx.createMediaStreamSource(this.localStream);
        source.connect(this.analyser);
      }

      // 3. Automated Echo Loopback Mode (for @echo_node)
      if (this.isEcho) {
        if (this.localStream) {
          this.echoSource = ctx.createMediaStreamSource(this.localStream);
          this.echoDelay = ctx.createDelay();
          this.echoDelay.delayTime.value = 0.22; // 220ms cybernetic echo delay

          this.echoGain = ctx.createGain();
          this.echoGain.gain.value = 0.7; // Attenuated loopback to avoid feedback

          this.echoSource.connect(this.echoDelay);
          this.echoDelay.connect(this.echoGain);
          this.echoGain.connect(ctx.destination);
        }

        if (this.onRemoteTrackCallback) {
          this.onRemoteTrackCallback(true);
        }
        return true;
      }

      // 4. Peer-to-Peer WebRTC Mode (between real registered subscribers)
      this.peerConnection = new RTCPeerConnection(ICE_SERVERS);

      // Add local audio tracks to peer connection
      if (this.localStream) {
        this.localStream.getAudioTracks().forEach((track) => {
          this.peerConnection?.addTrack(track, this.localStream!);
        });
      }

      // Handle receiving remote peer audio stream
      this.peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          this.remoteStream = event.streams[0];
          if (this.remoteAudioElement) {
            this.remoteAudioElement.srcObject = this.remoteStream;
            this.remoteAudioElement.play().catch(() => {
              // Retry on user gesture if browser autoplay blocked
              const unlock = () => {
                this.remoteAudioElement?.play().catch(() => {});
                document.removeEventListener('click', unlock);
              };
              document.addEventListener('click', unlock, { once: true });
            });
          }

          // Connect remote stream to visualizer analyser
          try {
            const remoteSource = ctx.createMediaStreamSource(this.remoteStream);
            remoteSource.connect(this.analyser!);
          } catch {}

          if (this.onRemoteTrackCallback) {
            this.onRemoteTrackCallback(true);
          }
        }
      };

      // Handle ICE Candidates
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
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

      // 5. Start listening to remote WebRTC signaling
      this.subscribeSignaling();

      // 6. If caller (initiator), create and broadcast WebRTC Offer
      if (this.isInitiator) {
        const offer = await this.peerConnection.createOffer({
          offerToReceiveAudio: true,
        });
        await this.peerConnection.setLocalDescription(offer);

        await this.dispatchSignal({
          roomId: this.roomId,
          senderId: this.peerId,
          type: 'webrtc_offer',
          sdp: offer.sdp,
          timestamp: Date.now(),
        });
      } else {
        // Announce readiness to the initiator
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
              // Clean up signal after processing
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

        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        await this.dispatchSignal({
          roomId: this.roomId,
          senderId: this.peerId,
          type: 'webrtc_answer',
          sdp: answer.sdp,
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
        // Callee just joined and reported ready; re-negotiate if needed
        const offer = await this.peerConnection.createOffer({ offerToReceiveAudio: true });
        await this.peerConnection.setLocalDescription(offer);
        await this.dispatchSignal({
          roomId: this.roomId,
          senderId: this.peerId,
          type: 'webrtc_offer',
          sdp: offer.sdp,
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
   * Toggles microphone mute.
   */
  setMicrophoneMuted(isMuted: boolean): void {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted;
      });
    }
    if (this.echoSource && this.echoGain) {
      this.echoGain.gain.value = isMuted ? 0 : 0.7;
    }
  }

  /**
   * Toggles speaker output.
   */
  setSpeakerEnabled(isEnabled: boolean): void {
    if (this.remoteAudioElement) {
      this.remoteAudioElement.muted = !isEnabled;
    }
    if (this.echoGain) {
      this.echoGain.gain.value = isEnabled ? 0.7 : 0;
    }
  }

  /**
   * Retrieves real-time audio frequencies for the visualizer.
   */
  getAudioFrequencies(): Uint8Array {
    if (this.analyser) {
      const data = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(data);
      return data;
    }
    // Fallback synth values if audio hardware not yet attached
    for (let i = 0; i < 32; i++) {
      this.freqData[i] = Math.floor(Math.sin(Date.now() / 250 + i * 0.4) * 35 + 50);
    }
    return this.freqData;
  }

  /**
   * Shuts down WebRTC connections, audio hardware, and listeners.
   */
  cleanup(): void {
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

    if (this.remoteAudioElement) {
      this.remoteAudioElement.srcObject = null;
      this.remoteAudioElement.pause();
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.echoSource) {
      try {
        this.echoSource.disconnect();
      } catch {}
      this.echoSource = null;
    }
    if (this.echoDelay) {
      try {
        this.echoDelay.disconnect();
      } catch {}
      this.echoDelay = null;
    }
    if (this.echoGain) {
      try {
        this.echoGain.disconnect();
      } catch {}
      this.echoGain = null;
    }

    this.remoteDescriptionSet = false;
    this.iceCandidatesQueue = [];
    this.onRemoteTrackCallback = null;
  }
}

export const webRtcManager = new WebRtcManager();
