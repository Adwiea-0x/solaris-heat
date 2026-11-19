// audio.js — every sound in Solaris Bay is synthesized with WebAudio.
//
// No audio files ship with the game. This engine builds the lot from
// oscillators and filtered noise: the two radio stations (a synthwave loop
// and a latin groove, sequenced note by note), the engine, the horn, police
// sirens that swell as a unit closes in, gunshots, crashes and the little
// cha-ching of a payout. The context wakes on the first user gesture, as
// browsers require; every call is safe before that and simply stays silent.

const NOTE = { A1: 55, C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98, A2: 110, B2: 123.47, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196, A3: 220, B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, C5: 523.25, D5: 587.33, E5: 659.25 };

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.radioStation = -1; // -1 off, 0 Solana FM, 1 Bahía Beats
    this.radioTimer = null;
    this.step = 0;
    this.nextNoteTime = 0;
  }

  /** Create (or resume) the context. Call from any user gesture. */
  wake() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      this.buildEngine();
      this.buildSiren();
      this.buildRadio();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.55;
  }

  // ---- continuous voices: engine and siren ------------------------------
  buildEngine() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
  }

  /** rpm: 0..1 throttle/speed blend; on: the player is driving. */
  setEngine(rpm, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(50 + rpm * 165, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(280 + rpm * 900, t, 0.08);
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + rpm * 0.05 : 0, t, 0.09);
  }

  buildSiren() {
    const ctx = this.ctx;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain).connect(this.master);
    this.sirenOsc.start();
    this.sirenLFO = ctx.createOscillator();
    this.sirenLFO.frequency.value = 0.55;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    this.sirenLFO.connect(lfoGain).connect(this.sirenOsc.frequency);
    this.sirenLFO.start();
  }

  /** level: 0..1 by the nearest unit's distance; 0 silences the siren. */
  setSiren(level) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(level * 0.045, this.ctx.currentTime, 0.15);
  }

  // ---- one-shots ----------------------------------------------------------
  noiseBurst({ duration = 0.15, freq = 1200, type = 'highpass', gain = 0.25, sweepTo = null }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, ctx.currentTime + duration);
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(this.master);
    src.start();
  }

  shot() {
    this.noiseBurst({ duration: 0.14, freq: 900, type: 'highpass', gain: 0.5, sweepTo: 300 });
  }

  dryFire() {
    this.noiseBurst({ duration: 0.04, freq: 2500, type: 'bandpass', gain: 0.12 });
  }

  crash(intensity = 0.5) {
    this.noiseBurst({ duration: 0.28, freq: 300, type: 'lowpass', gain: 0.25 + intensity * 0.45, sweepTo: 90 });
  }

  thud() {
    this.noiseBurst({ duration: 0.1, freq: 180, type: 'lowpass', gain: 0.3 });
  }

  horn() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    for (const f of [370, 466]) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.06, ctx.currentTime);
      g.gain.setValueAtTime(0.06, ctx.currentTime + 0.22);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
      osc.connect(g).connect(this.master);
      osc.start();
      osc.stop(ctx.currentTime + 0.32);
    }
  }

  blip(freq = 880, when = 0, dur = 0.09, type = 'square', gain = 0.08) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime + when;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  cashRegister() {
    this.blip(1320, 0, 0.08);
    this.blip(1760, 0.07, 0.12);
  }

  pickup() {
    this.blip(660, 0, 0.08, 'triangle', 0.12);
    this.blip(990, 0.06, 0.1, 'triangle', 0.12);
  }

  sting() {
    this.blip(196, 0, 0.35, 'sawtooth', 0.14);
    this.blip(185, 0.05, 0.4, 'sawtooth', 0.14);
  }

  // ---- radio ---------------------------------------------------------------
  buildRadio() {
    this.radioGain = this.ctx.createGain();
    this.radioGain.gain.value = 0;
    this.radioGain.connect(this.master);
  }

  /** station: -1 off, 0 Solana FM (synthwave), 1 Bahía Beats (latin). */
  setRadio(station) {
    if (!this.ctx) return;
    this.radioStation = station;
    this.radioGain.gain.setTargetAtTime(station >= 0 ? 0.16 : 0, this.ctx.currentTime, 0.1);
    if (station >= 0 && !this.radioTimer) {
      this.step = 0;
      this.nextNoteTime = this.ctx.currentTime + 0.06;
      this.radioTimer = setInterval(() => this.scheduleRadio(), 40);
    }
    if (station < 0 && this.radioTimer) {
      clearInterval(this.radioTimer);
      this.radioTimer = null;
    }
  }

  radioNote(freq, t, dur, type, gain, dest = null) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(dest ?? this.radioGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  scheduleRadio() {
    if (!this.ctx || this.radioStation < 0) return;
    const bpm = this.radioStation === 0 ? 112 : 96;
    const stepDur = 60 / bpm / 2; // eighth notes
    while (this.nextNoteTime < this.ctx.currentTime + 0.14) {
      this.playStep(this.step, this.nextNoteTime, stepDur);
      this.step = (this.step + 1) % 64;
      this.nextNoteTime += stepDur;
    }
  }

  playStep(step, t, stepDur) {
    if (this.radioStation === 0) {
      // Solana FM: driving synthwave — A minor bass pulse, sparkle arp, pads.
      const bassLine = [NOTE.A1, NOTE.A1, NOTE.F2 / 2 + 43.65, NOTE.A1, NOTE.C2, NOTE.A1, NOTE.G2 / 2 + 49, NOTE.A1];
      const bass = bassLine[Math.floor(step / 2) % 8];
      if (step % 2 === 0) this.radioNote(bass, t, stepDur * 1.8, 'sawtooth', 0.16);
      const arp = [NOTE.A3, NOTE.C4, NOTE.E4, NOTE.A4, NOTE.E4, NOTE.C4, NOTE.D4, NOTE.B3];
      this.radioNote(arp[step % 8] * (step >= 32 ? 1.5 : 1), t, stepDur * 0.9, 'square', 0.05);
      if (step % 32 === 0) {
        for (const f of [NOTE.A2, NOTE.E3, NOTE.A3]) this.radioNote(f, t, stepDur * 30, 'triangle', 0.05);
      }
      if (step % 4 === 2) this.noiseHat(t, 0.03);
    } else {
      // Bahía Beats: latin groove — tumbao bass, montuno plucks, clave hats.
      const tumbao = [NOTE.A1, 0, NOTE.E2, 0, NOTE.A1, 0, NOTE.C2, NOTE.E2, NOTE.F2 / 2 + 43.65, 0, NOTE.C2, 0, NOTE.G2 / 2 + 49, 0, NOTE.B2 / 2 + 61.7, 0];
      const b = tumbao[step % 16];
      if (b) this.radioNote(b, t, stepDur * 1.4, 'triangle', 0.2);
      const montuno = [NOTE.E4, NOTE.A4, NOTE.C5, NOTE.A4, NOTE.D4, NOTE.F4, NOTE.A4, NOTE.F4];
      if (step % 2 === 1) this.radioNote(montuno[(step >> 1) % 8], t, stepDur * 0.8, 'triangle', 0.07);
      if ([0, 3, 6, 10, 12].includes(step % 16)) this.noiseHat(t, 0.05); // clave-ish
      if (step % 8 === 0) this.radioNote(NOTE.A1 / 2, t, stepDur * 2.4, 'sine', 0.3); // kick thump
    }
  }

  noiseHat(t, gain) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 0.03);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6000;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(this.radioGain);
    src.start(t);
  }
}
