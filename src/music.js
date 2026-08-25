import { getAudio } from "./audio.js";

const STEPS_PER_BAR = 16;
const midiToHz = (note) => 440 * Math.pow(2, (note - 69) / 12);

// Four-bar minor progression; each entry is the bar root as a MIDI note.
const PROGRESSION = [45, 41, 48, 43];
const ARP_OFFSETS = [0, 7, 12, 15, 12, 7, 3, 7];
const BASS_STEPS = [0, 3, 6, 8, 11, 14];
const KICK_STEPS = [0, 6, 8, 14];
const HAT_STEPS = [2, 4, 6, 10, 12, 14];
const SNARE_STEPS = [4, 12];

const STATE_INTENSITY = { silent: 0, lobby: 0.3, patrol: 0.55, combat: 1 };

export class Music {
  constructor() {
    this.playing = false;
    this.enabled = true;
    this.volume = 0.55;
    this.intensity = 0;
    this.targetIntensity = 0;
    this.state = "silent";
    this.step = 0;
    this.nextStepTime = 0;
    this.timer = null;
    this.nodes = null;
  }

  setup() {
    if (this.nodes) return this.nodes;
    const { context, musicGain } = getAudio();

    const reverb = context.createConvolver();
    const length = Math.floor(context.sampleRate * 1.6);
    const impulse = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.6) * 0.5;
      }
    }
    reverb.buffer = impulse;
    const wet = context.createGain();
    wet.gain.value = 0.32;
    reverb.connect(wet).connect(musicGain);

    const bus = (value) => {
      const gain = context.createGain();
      gain.gain.value = value;
      gain.connect(musicGain);
      gain.connect(reverb);
      return gain;
    };

    const padGain = bus(0);
    const padFilter = context.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 420;
    padFilter.Q.value = 0.8;
    padFilter.connect(padGain);

    const padVoices = [];
    for (let i = 0; i < 3; i++) {
      const oscillator = context.createOscillator();
      oscillator.type = i === 2 ? "triangle" : "sawtooth";
      oscillator.detune.value = (i - 1) * 7;
      const voiceGain = context.createGain();
      voiceGain.gain.value = 0.16;
      oscillator.connect(voiceGain).connect(padFilter);
      oscillator.start();
      padVoices.push({ oscillator, gain: voiceGain });
    }

    this.nodes = {
      context,
      padGain,
      padFilter,
      padVoices,
      bassGain: bus(0),
      arpGain: bus(0),
      drumGain: bus(0),
    };
    return this.nodes;
  }

  start() {
    if (this.playing || !this.enabled) return;
    const { context } = this.setup();
    this.playing = true;
    this.step = 0;
    this.nextStepTime = context.currentTime + 0.08;
    this.applyVolume();
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stop() {
    this.playing = false;
    clearInterval(this.timer);
    this.timer = null;
    if (this.nodes) {
      const { context, padGain, bassGain, arpGain, drumGain } = this.nodes;
      for (const gain of [padGain, bassGain, arpGain, drumGain]) {
        gain.gain.setTargetAtTime(0, context.currentTime, 0.25);
      }
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.stop();
      return;
    }
    this.applyVolume();
    if (this.state !== "silent") this.start();
  }

  setVolume(volume) {
    this.volume = volume;
    this.applyVolume();
  }

  applyVolume() {
    const { context, musicGain } = getAudio();
    const level = this.enabled ? this.volume : 0;
    musicGain.gain.setTargetAtTime(level, context.currentTime, 0.15);
  }

  setState(state) {
    this.state = state;
    this.targetIntensity = STATE_INTENSITY[state] ?? 0;
    if (state === "silent") {
      this.stop();
      return;
    }
    if (this.enabled && !this.playing) this.start();
  }

  // Nudges the mix toward combat as threats close in, without hard state flips.
  setThreat(threat) {
    if (this.state === "silent" || this.state === "lobby") return;
    const base = STATE_INTENSITY.patrol;
    this.targetIntensity = base + (STATE_INTENSITY.combat - base) * Math.min(1, Math.max(0, threat));
  }

  schedule() {
    if (!this.playing || !this.nodes) return;
    const { context } = this.nodes;
    const secondsPerStep = 60 / (88 + this.intensity * 16) / 4;

    while (this.nextStepTime < context.currentTime + 0.2) {
      this.intensity += (this.targetIntensity - this.intensity) * 0.06;
      this.playStep(this.step, this.nextStepTime);
      this.nextStepTime += secondsPerStep;
      this.step = (this.step + 1) % (STEPS_PER_BAR * PROGRESSION.length);
    }
  }

  playStep(step, time) {
    const { context, padGain, padFilter, padVoices, bassGain, arpGain, drumGain } = this.nodes;
    const bar = Math.floor(step / STEPS_PER_BAR);
    const beat = step % STEPS_PER_BAR;
    const root = PROGRESSION[bar];
    const intensity = this.intensity;

    if (beat === 0) {
      const chord = [root, root + 3, root + 7];
      padVoices.forEach((voice, index) => {
        voice.oscillator.frequency.setTargetAtTime(midiToHz(chord[index] + 12), time, 0.25);
      });
      padGain.gain.setTargetAtTime(0.2 + intensity * 0.12, time, 0.4);
      padFilter.frequency.setTargetAtTime(380 + intensity * 900, time, 0.5);
    }

    bassGain.gain.setTargetAtTime(intensity > 0.12 ? 0.3 : 0, time, 0.3);
    arpGain.gain.setTargetAtTime(intensity > 0.38 ? 0.16 + intensity * 0.1 : 0, time, 0.3);
    drumGain.gain.setTargetAtTime(intensity > 0.52 ? 0.32 : 0, time, 0.3);

    if (intensity > 0.12 && BASS_STEPS.includes(beat)) {
      this.pluck(bassGain, midiToHz(root - 12), time, 0.34, "triangle", 0.55);
    }

    if (intensity > 0.38) {
      const arpStep = ARP_OFFSETS[(step + bar) % ARP_OFFSETS.length];
      if (beat % 2 === 0) this.pluck(arpGain, midiToHz(root + 12 + arpStep), time, 0.16, "square", 0.16);
    }

    if (intensity > 0.52) {
      if (KICK_STEPS.includes(beat)) this.kick(drumGain, time);
      if (HAT_STEPS.includes(beat)) this.hat(drumGain, time, 0.12);
      if (SNARE_STEPS.includes(beat)) this.hat(drumGain, time, 0.2, 2400);
    }
  }

  pluck(output, frequency, time, duration, type, peak) {
    const { context } = this.nodes;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(peak, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0008, time + duration);
    oscillator.connect(gain).connect(output);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.05);
  }

  kick(output, time) {
    const { context } = this.nodes;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(140, time);
    oscillator.frequency.exponentialRampToValueAtTime(46, time + 0.14);
    gain.gain.setValueAtTime(0.6, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
    oscillator.connect(gain).connect(output);
    oscillator.start(time);
    oscillator.stop(time + 0.2);
  }

  hat(output, time, peak, frequency = 7200) {
    const { context } = this.nodes;
    const frames = Math.floor(context.sampleRate * 0.06);
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = "highpass";
    filter.frequency.value = frequency;
    gain.gain.setValueAtTime(peak, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
    source.connect(filter).connect(gain).connect(output);
    source.start(time);
  }
}
