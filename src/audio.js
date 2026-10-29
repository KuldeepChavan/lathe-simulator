// Procedural Web Audio: motor hum, cut noise, chatter rattle, chips, crack,
// scorch pop, honing hiss, oil whoosh, and the completion chime.
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.master = null;
    this.nodes = {};
  }

  init() {
    if (this.ctx) return;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = (this.ctx = new C());
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // motor hum
    const motorGain = ctx.createGain();
    motorGain.gain.value = 0;
    motorGain.connect(this.master);
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = 50;
    const og1 = ctx.createGain();
    og1.gain.value = 0.5;
    o1.connect(og1).connect(motorGain);
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = 120;
    const og2 = ctx.createGain();
    og2.gain.value = 0.35;
    o2.connect(og2).connect(motorGain);
    o1.start();
    o2.start();
    this.nodes.motorGain = motorGain;
    this.nodes.o1 = o1;
    this.nodes.o2 = o2;

    // cutting noise (shared with sanding at a lower band)
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1200;
    bp.Q.value = 0.9;
    const cutGain = ctx.createGain();
    cutGain.gain.value = 0;
    this.makeNoise(ctx).connect(bp).connect(cutGain).connect(this.master);
    this.nodes.cutGain = cutGain;
    this.nodes.cutBP = bp;

    // chatter rattle
    const bp2 = ctx.createBiquadFilter();
    bp2.type = 'bandpass';
    bp2.frequency.value = 3000;
    bp2.Q.value = 4;
    const chGain = ctx.createGain();
    chGain.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 26;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.5;
    lfo.connect(lfoG).connect(chGain.gain);
    this.makeNoise(ctx).connect(bp2).connect(chGain).connect(this.master);
    lfo.start();
    this.nodes.chGain = chGain;

    // honing hiss
    const bpH = ctx.createBiquadFilter();
    bpH.type = 'bandpass';
    bpH.frequency.value = 3800;
    bpH.Q.value = 2;
    const honeGain = ctx.createGain();
    honeGain.gain.value = 0;
    this.makeNoise(ctx).connect(bpH).connect(honeGain).connect(this.master);
    this.nodes.honeGain = honeGain;
  }

  makeNoise(ctx) {
    const len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.start();
    return src;
  }

  oneShotNoise(ctx, t, { freq = 800, type = 'lowpass', dur = 0.2, vol = 0.3, q = 1 }) {
    const src = this.makeNoise(ctx);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.stop(t + dur);
  }

  setEnabled(on) {
    this.enabled = on;
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.master.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.08);
  }

  update(s) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const f = this.nodes;
    const rpmN = Math.min(1, s.rpm / 2400);
    f.motorGain.gain.setTargetAtTime(rpmN * 0.1, t, 0.1);
    f.o1.frequency.setTargetAtTime(38 + s.rpm * 0.018, t, 0.1);
    f.o2.frequency.setTargetAtTime(110 + s.rpm * 0.05, t, 0.1);
    const cutting = s.status === 'CUTTING' || s.status === 'CHATTER';
    const sanding = s.status === 'SANDING';
    const honing = s.status === 'HONING';
    const active = cutting || sanding;
    f.cutGain.gain.setTargetAtTime(
      cutting ? 0.1 + rpmN * 0.18 : sanding ? 0.05 : 0,
      t, active ? 0.04 : 0.09
    );
    f.cutBP.frequency.setTargetAtTime(cutting ? 700 + s.rpm * 0.55 : sanding ? 420 : 1200, t, 0.15);
    f.chGain.gain.setTargetAtTime(Math.max(0, s.chatter - 0.25) * 0.22, t, 0.05);
    f.honeGain.gain.setTargetAtTime(honing ? 0.09 : 0, t, 0.05);
  }

  onEvent(ev, s) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (ev.type === 'chip' || ev.type === 'crack') {
      const dur = ev.type === 'crack' ? 0.35 : 0.12;
      this.oneShotNoise(ctx, t, { freq: ev.type === 'crack' ? 500 : 900, type: 'lowpass', dur, vol: ev.type === 'crack' ? 0.5 : 0.3 });
      if (ev.type === 'crack') {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
        const og = ctx.createGain();
        og.gain.setValueAtTime(0.4, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.connect(og).connect(this.master);
        o.start(t);
        o.stop(t + 0.3);
      }
    } else if (ev.type === 'scorch') {
      this.oneShotNoise(ctx, t, { freq: 260, type: 'lowpass', dur: 0.18, vol: 0.25 });
    } else if (ev.type === 'hone') {
      this.oneShotNoise(ctx, t, { freq: 3800, type: 'bandpass', dur: 1.2, vol: 0.12, q: 2 });
    } else if (ev.type === 'oil') {
      this.oneShotNoise(ctx, t, { freq: 700, type: 'lowpass', dur: 0.8, vol: 0.18 });
    } else if (ev.type === 'done') {
      [660, 880, 1320].forEach((f0, i) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f0;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.22, t + i * 0.09 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.5);
        o.connect(g).connect(this.master);
        o.start(t + i * 0.09);
        o.stop(t + i * 0.09 + 0.55);
      });
    }
  }
}
