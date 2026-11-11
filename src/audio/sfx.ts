// Synthesized sound effects (Web Audio). Voices are rate-limited and pitch-randomized so
// a 1,000-stickman fight sounds like a crowd instead of a machine gun.

type SfxName = 'clash' | 'arrow' | 'thud' | 'rumble' | 'click' | 'buy' | 'boom' | 'magic' | 'horn' | 'split' | 'coin' | 'error' | 'win' | 'lose' | 'pop';

class Sfx {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  noise: AudioBuffer | null = null;
  muted = false;
  private budget: Record<string, number> = {};
  private last = 0;

  constructor() {
    try {
      this.muted = localStorage.getItem('stickstorm.muted') === '1';
    } catch {
      /* ignore */
    }
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem('stickstorm.muted', m ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  /** limit voices per name per 1/20 s window */
  private allow(name: string, max: number): boolean {
    if (!this.ctx || this.muted) return false;
    const now = this.ctx.currentTime;
    if (now - this.last > 0.05) {
      this.budget = {};
      this.last = now;
    }
    const n = (this.budget[name] ?? 0) + 1;
    this.budget[name] = n;
    return n <= max;
  }

  private noiseBurst(t: number, dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass', sweepTo?: number) {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.01, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private tone(t: number, dur: number, f0: number, f1: number, gain: number, type: OscillatorType = 'sine') {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** intensity 0..1 scales loudness; crowd sounds quieter per voice */
  play(name: SfxName, intensity = 1) {
    const caps: Partial<Record<SfxName, number>> = { clash: 3, arrow: 2, thud: 2, split: 2, magic: 2, pop: 3, coin: 2 };
    if (!this.allow(name, caps[name] ?? 1)) return;
    const c = this.ctx!;
    const t = c.currentTime + Math.random() * 0.02;
    const r = 0.85 + Math.random() * 0.3;
    const v = Math.min(1, intensity);
    switch (name) {
      case 'clash':
        this.noiseBurst(t, 0.08, 2800 * r, 3, 0.22 * v);
        this.tone(t, 0.07, 1800 * r, 1200 * r, 0.05 * v, 'square');
        break;
      case 'arrow':
        this.noiseBurst(t, 0.18, 1200 * r, 2, 0.1 * v, 'bandpass', 4000 * r);
        break;
      case 'thud':
        this.tone(t, 0.25, 140 * r, 45, 0.5 * v);
        this.noiseBurst(t, 0.12, 400, 1, 0.25 * v, 'lowpass');
        break;
      case 'boom':
        this.tone(t, 0.6, 90 * r, 30, 0.8 * v);
        this.noiseBurst(t, 0.5, 600, 0.7, 0.6 * v, 'lowpass', 80);
        break;
      case 'rumble':
        this.noiseBurst(t, 2.2, 180, 0.6, 0.9, 'lowpass', 40);
        this.tone(t, 2.0, 60, 25, 0.6);
        break;
      case 'magic':
        this.tone(t, 0.25, 600 * r, 1400 * r, 0.08 * v, 'triangle');
        break;
      case 'split':
      case 'pop':
        this.tone(t, 0.06, 900 * r, 1600 * r, 0.06 * v, 'sine');
        break;
      case 'horn':
        this.tone(t, 0.5, 220, 233, 0.25, 'sawtooth');
        this.tone(t, 0.5, 330, 349, 0.15, 'sawtooth');
        break;
      case 'click':
        this.tone(t, 0.04, 1200, 900, 0.12, 'square');
        break;
      case 'buy':
        this.tone(t, 0.08, 660, 990, 0.15, 'triangle');
        this.tone(t + 0.07, 0.12, 990, 1320, 0.12, 'triangle');
        break;
      case 'coin':
        this.tone(t, 0.1, 1400 * r, 2000 * r, 0.08, 'square');
        break;
      case 'error':
        this.tone(t, 0.15, 200, 150, 0.15, 'square');
        break;
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(t + i * 0.12, 0.3, f, f, 0.18, 'triangle'));
        break;
      case 'lose':
        [392, 330, 262].forEach((f, i) => this.tone(t + i * 0.2, 0.4, f, f * 0.95, 0.18, 'triangle'));
        break;
    }
  }
}

export const sfx = new Sfx();
