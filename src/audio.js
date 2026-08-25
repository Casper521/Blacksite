let context;

function ctx() {
  context ??= new (window.AudioContext || window.webkitAudioContext)();
  if (context.state === "suspended") context.resume();
  return context;
}

function noise(duration, volume, filterFrequency) {
  const audio = ctx();
  const frames = Math.floor(audio.sampleRate * duration);
  const buffer = audio.createBuffer(1, frames, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const source = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const gain = audio.createGain();
  source.buffer = buffer;
  filter.type = "lowpass";
  filter.frequency.value = filterFrequency;
  gain.gain.setValueAtTime(volume, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
  source.connect(filter).connect(gain).connect(audio.destination);
  source.start();
}

function tone(frequency, endFrequency, duration, volume, type = "sine") {
  const audio = ctx();
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, audio.currentTime + duration);
  gain.gain.setValueAtTime(volume, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + duration);
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
