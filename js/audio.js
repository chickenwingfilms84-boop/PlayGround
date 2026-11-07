/* Synthesised combat audio — no external samples. */

const clampGain = (v) => Math.max(0.0001, Math.min(1, v));

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.noiseBuffer = null;
    this.ambientGain = null;
    this.ambientStarted = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }

    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.42 : 0;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 20;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.22;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    const len = Math.floor(this.ctx.sampleRate * 1.2);
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.startAmbience();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(on ? 0.42 : 0.0001, this.ctx.currentTime + 0.08);
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }

  get t() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  startAmbience() {
    if (!this.ctx || this.ambientStarted) return;
    this.ambientStarted = true;

    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = 0.055;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 240;
    filter.Q.value = 2.5;

    const freqs = [41.2, 55, 82.4, 110];
    freqs.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = i % 2 ? "triangle" : "sine";
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.value = 0.2 / (i + 1);
      osc.connect(g);
      g.connect(filter);
      osc.start();
    });

    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.065;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 100;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    filter.connect(this.ambientGain);
    this.ambientGain.connect(this.master);
  }

  tone(opts) {
    if (!this.ctx || !this.enabled) return;
    const {
      type = "sine",
      freq = 440,
      endFreq = null,
      dur = 0.15,
      vol = 0.2,
      attack = 0.004,
      release = dur,
      delay = 0,
      filter = null,
      q = 1,
      pan = 0,
    } = opts;

    const t0 = this.t + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (endFreq != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
    }

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(clampGain(vol), t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(attack + 0.01, release));

    let node = gain;
    if (filter != null) {
      const bq = this.ctx.createBiquadFilter();
      bq.type = "lowpass";
      bq.frequency.setValueAtTime(filter, t0);
      bq.Q.value = q;
      gain.connect(bq);
      node = bq;
    }

    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      p.connect(this.master);
    } else {
      node.connect(this.master);
    }

    osc.connect(gain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  noise(opts = {}) {
    if (!this.ctx || !this.enabled || !this.noiseBuffer) return;
    const {
      dur = 0.2,
      vol = 0.15,
      filter = 1200,
      type = "lowpass",
      delay = 0,
      q = 0.8,
      playbackRate = 1,
    } = opts;
    const t0 = this.t + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = playbackRate;
    const bq = this.ctx.createBiquadFilter();
    bq.type = type;
    bq.frequency.setValueAtTime(filter, t0);
    bq.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(clampGain(vol), t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bq);
    bq.connect(g);
    g.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  shoot() {
    if (!this.ctx) return;
    this.noise({ dur: 0.075, vol: 0.14, filter: 3600, type: "highpass" });
    this.tone({ type: "sawtooth", freq: 168, endFreq: 48, dur: 0.11, vol: 0.16, filter: 1600, q: 4 });
    this.tone({ type: "square", freq: 820, endFreq: 240, dur: 0.045, vol: 0.045 });
    this.tone({ type: "sine", freq: 72, endFreq: 40, dur: 0.13, vol: 0.1 });
  }

  enemyShoot() {
    if (!this.ctx) return;
    this.tone({ type: "square", freq: 300, endFreq: 620, dur: 0.12, vol: 0.055, filter: 2200 });
    this.tone({ type: "sawtooth", freq: 80, endFreq: 55, dur: 0.18, vol: 0.05 });
  }

  hit(head = false) {
    if (!this.ctx) return;
    const f = head ? 1550 : 980;
    this.tone({ type: "square", freq: f, endFreq: f * 1.2, dur: head ? 0.075 : 0.045, vol: head ? 0.085 : 0.055 });
    this.tone({ type: "sine", freq: head ? 600 : 430, endFreq: 280, dur: 0.06, vol: 0.05 });
  }

  kill() {
    if (!this.ctx) return;
    this.noise({ dur: 0.4, vol: 0.2, filter: 900 });
    this.tone({ type: "sawtooth", freq: 160, endFreq: 36, dur: 0.42, vol: 0.18, filter: 900, q: 3 });
    this.tone({ type: "square", freq: 88, endFreq: 30, dur: 0.3, vol: 0.1 });
  }

  explosion() {
    if (!this.ctx) return;
    this.noise({ dur: 0.65, vol: 0.25, filter: 700 });
    this.tone({ type: "sine", freq: 90, endFreq: 24, dur: 0.55, vol: 0.23 });
    this.tone({ type: "sawtooth", freq: 130, endFreq: 32, dur: 0.36, vol: 0.08, filter: 500 });
  }

  reloadStart() {
    if (!this.ctx) return;
    this.tone({ type: "square", freq: 340, dur: 0.035, vol: 0.035 });
    this.noise({ dur: 0.09, vol: 0.05, filter: 1900, type: "bandpass" });
    this.tone({ type: "square", freq: 220, dur: 0.05, vol: 0.04, delay: 0.13 });
    this.tone({ type: "sine", freq: 520, endFreq: 720, dur: 0.16, vol: 0.025, delay: 0.5 });
  }

  reloadEnd() {
    if (!this.ctx) return;
    this.noise({ dur: 0.06, vol: 0.07, filter: 2400, type: "highpass" });
    this.tone({ type: "square", freq: 310, dur: 0.045, vol: 0.05 });
    this.tone({ type: "square", freq: 520, dur: 0.045, vol: 0.04, delay: 0.06 });
    this.tone({ type: "sine", freq: 1100, endFreq: 1500, dur: 0.12, vol: 0.03, delay: 0.08 });
  }

  empty() {
    if (!this.ctx) return;
    this.tone({ type: "square", freq: 160, dur: 0.035, vol: 0.035 });
    this.tone({ type: "square", freq: 120, dur: 0.03, vol: 0.03, delay: 0.07 });
  }

  hurt() {
    if (!this.ctx) return;
    this.noise({ dur: 0.18, vol: 0.12, filter: 420 });
    this.tone({ type: "sawtooth", freq: 110, endFreq: 44, dur: 0.24, vol: 0.12, filter: 600 });
    this.tone({ type: "sine", freq: 58, endFreq: 34, dur: 0.3, vol: 0.08 });
  }

  shieldHit() {
    if (!this.ctx) return;
    this.tone({ type: "triangle", freq: 920, endFreq: 280, dur: 0.18, vol: 0.075 });
    this.noise({ dur: 0.11, vol: 0.05, filter: 3200, type: "highpass" });
  }

  pickup(kind = "ammo") {
    if (!this.ctx) return;
    const base = kind === "health" ? 360 : kind === "shield" ? 500 : 300;
    [1, 1.25, 1.5].forEach((m, i) => {
      this.tone({
        type: "sine",
        freq: base * m,
        endFreq: base * m * 1.08,
        dur: 0.12,
        vol: 0.05,
        delay: i * 0.055,
      });
    });
  }

  waveStart() {
    if (!this.ctx) return;
    this.tone({ type: "sawtooth", freq: 55, endFreq: 110, dur: 1.2, vol: 0.09, filter: 400 });
    this.tone({ type: "square", freq: 220, dur: 0.18, vol: 0.045, delay: 0.2 });
    this.tone({ type: "square", freq: 330, dur: 0.18, vol: 0.04, delay: 0.42 });
    this.tone({ type: "square", freq: 440, dur: 0.3, vol: 0.045, delay: 0.64 });
  }

  waveClear() {
    if (!this.ctx) return;
    [440, 554, 660, 880].forEach((f, i) => {
      this.tone({ type: "triangle", freq: f, dur: 0.38, vol: 0.055, delay: i * 0.11 });
    });
  }

  gameOver() {
    if (!this.ctx) return;
    this.tone({ type: "sawtooth", freq: 220, endFreq: 42, dur: 1.8, vol: 0.12, filter: 700 });
    this.tone({ type: "sine", freq: 55, endFreq: 28, dur: 2.2, vol: 0.12 });
    this.noise({ dur: 1.1, vol: 0.09, filter: 500 });
  }

  ui() {
    if (!this.ctx) return;
    this.tone({ type: "square", freq: 660, endFreq: 880, dur: 0.04, vol: 0.025 });
  }

  footstep(sprint = false) {
    if (!this.ctx) return;
    this.noise({ dur: 0.075, vol: sprint ? 0.035 : 0.021, filter: sprint ? 280 : 200 });
    this.tone({ type: "sine", freq: 65, endFreq: 42, dur: 0.07, vol: 0.022 });
  }
}
