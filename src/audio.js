let context;
let masterGain;
let sfxGain;
let musicGain;

function build() {
  context = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = context.createGain();
  masterGain.gain.value = 0.9;
  masterGain.connect(context.destination);
  sfxGain = context.createGain();
  sfxGain.gain.value = 1;
  sfxGain.connect(masterGain);
  musicGain = context.createGain();
  musicGain.gain.value = 0;
  musicGain.connect(masterGain);
}

export function getAudio() {
  if (!context) build();
  if (context.state === "suspended") context.resume();
  return { context, masterGain, sfxGain, musicGain };
}

export const musicBus = () => getAudio().musicGain;

export function setMasterVolume(value) {
  const { context: ctx, masterGain: gain } = getAudio();
  gain.gain.setTargetAtTime(value, ctx.currentTime, 0.05);
}

function noise(duration, volume, filterFrequency) {
  const { context: ctx, sfxGain: out } = getAudio();
  const frames = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = buffer;
  filter.type = "lowpass";
  filter.frequency.value = filterFrequency;
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  source.connect(filter).connect(gain).connect(out);
  source.start();
}

function tone(frequency, endFrequency, duration, volume, type = "sine") {
  const { context: ctx, sfxGain: out } = getAudio();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, ctx.currentTime + duration);
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  oscillator.connect(gain).connect(out);
  oscillator.start();
  oscillator.stop(ctx.currentTime + duration);
}

export function playGunshot(enemy = false) {
  noise(enemy ? 0.09 : 0.14, enemy ? 0.055 : 0.12, enemy ? 1700 : 2400);
  tone(enemy ? 90 : 115, 45, 0.11, enemy ? 0.025 : 0.055, "sawtooth");
}

export function playHitmarker() {
  tone(1050, 760, 0.045, 0.025, "square");
}

export function playReload() {
  noise(0.045, 0.035, 4200);
  setTimeout(() => noise(0.065, 0.04, 3000), 620);
  setTimeout(() => tone(680, 430, 0.06, 0.025, "square"), 1320);
}

export function playEmpty() {
  tone(240, 180, 0.035, 0.02, "square");
}

export function playSlash() {
  noise(0.07, 0.05, 3200);
  tone(520, 180, 0.09, 0.03, "sawtooth");
}

export function playThrow() {
  noise(0.05, 0.03, 900);
  tone(180, 90, 0.08, 0.02, "triangle");
}

export function playExplosion() {
  noise(0.32, 0.16, 420);
  tone(90, 32, 0.28, 0.08, "sawtooth");
}

export function playPurchase() {
  tone(520, 780, 0.09, 0.03, "triangle");
  setTimeout(() => tone(780, 1180, 0.12, 0.028, "triangle"), 95);
}

export function playUiClick() {
  tone(420, 320, 0.035, 0.016, "square");
}
