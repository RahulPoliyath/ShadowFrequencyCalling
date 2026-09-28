/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private ringOsc1: OscillatorNode | null = null;
  private ringOsc2: OscillatorNode | null = null;
  private ringGain: GainNode | null = null;
  private ringInterval: any = null;
  private isMuted: boolean = false;

  // Analyser and microphone stream
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private synthInterval: any = null;
  private synthFreqData: Uint8Array = new Uint8Array(32);

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (muted) {
      this.stopRinging();
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public initAutoUnlock(): void {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      try {
        const ctx = this.getContext();
        if (ctx && ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
      } catch {}
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('touchend', unlock);
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('touchstart', unlock, { passive: true, capture: true });
    window.addEventListener('touchend', unlock, { passive: true, capture: true });
    window.addEventListener('click', unlock, { passive: true, capture: true });
    window.addEventListener('keydown', unlock, { passive: true, capture: true });
  }

  private getContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Plays standard Dual-Tone Multi-Frequency (DTMF) telecom frequencies.
   */
  playDtmf(digit: string, duration = 0.15): void {
    if (this.isMuted) return;
    try {
      const ctx = this.getContext();
      const dtmfFrequencies: Record<string, [number, number]> = {
        '1': [697, 1209],
        '2': [697, 1336],
        '3': [697, 1477],
        '4': [770, 1209],
        '5': [770, 1336],
        '6': [770, 1477],
        '7': [852, 1209],
        '8': [852, 1336],
        '9': [852, 1477],
        '*': [941, 1209],
        '0': [941, 1336],
        '#': [941, 1477],
      };

      const freqs = dtmfFrequencies[digit] || [700, 1200];
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.frequency.value = freqs[0];
      osc2.frequency.value = freqs[1];
      osc1.type = 'sine';
      osc2.type = 'sine';

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + duration);
      osc2.stop(now + duration);
    } catch {
      // Ignore audio block
    }
  }

  /**
   * Plays ringtone for incoming or outgoing calls.
   */
  startRinging(isIncoming = false): void {
    if (this.isMuted) return;
    this.stopRinging();
    try {
      const ctx = this.getContext();
      const ring = () => {
        if (!this.ctx) return;
        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        // Standard ring tone pair: 440Hz + 480Hz
        osc1.frequency.value = isIncoming ? 520 : 440;
        osc2.frequency.value = isIncoming ? 660 : 480;

        osc1.type = 'sine';
        osc2.type = 'sine';

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 0.1);
        gain.gain.setValueAtTime(0.08, now + 1.2);
        gain.gain.linearRampToValueAtTime(0.001, now + 1.4);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 1.4);
        osc2.stop(now + 1.4);
      };

      ring();
      this.ringInterval = setInterval(ring, 3200);
    } catch {
      // Audio context might be restricted
    }
  }

  stopRinging(): void {
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
    if (this.ringGain && this.ctx) {
      try {
        this.ringGain.gain.setValueAtTime(0, this.ctx.currentTime);
      } catch {}
    }
  }

  /**
   * Plays a connected, ended, verified, alert, or secure chime.
   */
  playChime(type: 'connected' | 'disconnected' | 'verified' | 'alert' | 'secure'): void {
    if (this.isMuted) return;
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (type === 'connected') {
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.25);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      } else if (type === 'verified' || type === 'secure') {
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.1);
        osc.frequency.setValueAtTime(783.99, now + 0.2);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      } else if (type === 'alert') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(440, now + 0.08);
        osc.frequency.setValueAtTime(880, now + 0.16);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      } else {
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.3);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      }

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    } catch {}
  }

  /**
   * Initializes real microphone or synthetic fallback analyzer.
   */
  async initMicrophoneStream(): Promise<{ success: boolean; isRealMic: boolean }> {
    try {
      const ctx = this.getContext();
      if (!this.analyserNode) {
        this.analyserNode = ctx.createAnalyser();
        this.analyserNode.fftSize = 64;
        this.analyserNode.smoothingTimeConstant = 0.8;
      }

      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
          this.mediaStream = stream;
          this.sourceNode = ctx.createMediaStreamSource(stream);
          this.sourceNode.connect(this.analyserNode);
          // Do NOT connect to ctx.destination to avoid feedback loop
          return { success: true, isRealMic: true };
        } catch {
          // User denied or no hardware available
        }
      }
    } catch {}

    // Fallback: active simulated audio pattern so visualizer shows live activity
    this.startSyntheticAudioData();
    return { success: true, isRealMic: false };
  }

  private startSyntheticAudioData(): void {
    if (this.synthInterval) return;
    this.synthInterval = setInterval(() => {
      for (let i = 0; i < 32; i++) {
        // Natural speech modulation simulation
        const base = Math.sin(Date.now() / 200 + i * 0.3) * 40 + 60;
        const noise = Math.random() * 50;
        this.synthFreqData[i] = Math.min(255, Math.max(10, Math.floor(base + noise)));
      }
    }, 50);
  }

  /**
   * Retrieves visualizer frequencies (array of numbers 0-255).
   */
  getAudioFrequencies(): Uint8Array {
    if (this.analyserNode && this.sourceNode) {
      const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
      this.analyserNode.getByteFrequencyData(dataArray);
      return dataArray;
    }
    return this.synthFreqData;
  }

  /**
   * Stops audio recording and cleanups.
   */
  cleanupCallAudio(): void {
    this.stopRinging();
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }
    if (this.synthInterval) {
      clearInterval(this.synthInterval);
      this.synthInterval = null;
    }
  }
}

export const soundEngine = new SoundEngine();
soundEngine.initAutoUnlock();
