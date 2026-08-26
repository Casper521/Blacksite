import "./style.css";
import { Game } from "./game.js";
import { Armory } from "./armory.js";
import { Profile } from "./economy.js";
import { Auth } from "./auth.js";
import { AccountPanel } from "./account.js";
import { playPurchase, playUiClick } from "./audio.js";

const canvas = document.querySelector("#game");
const startScreen = document.querySelector("#start-screen");
const pauseScreen = document.querySelector("#pause-screen");
const endScreen = document.querySelector("#end-screen");
const endTitle = document.querySelector("#end-title");
const endKicker = document.querySelector("#end-kicker");
const endSummary = document.querySelector("#end-summary");
const endKills = document.querySelector("#end-kills");
const endGems = document.querySelector("#end-gems");
const readyScreen = document.querySelector("#ready-screen");
const readySummary = document.querySelector("#ready-summary");

const musicToggle = document.querySelector("#music-toggle");
const musicVolume = document.querySelector("#music-volume");

const profile = new Profile();
const auth = new Auth();
const armory = new Armory(profile, {
  onPurchase(spent) {
    if (spent) playPurchase();
    else playUiClick();
  },
  onUpgrade() {
    game.equipLoadout();
  },
});
new AccountPanel(auth, profile, {
  onSignedIn() {
    armory.setStatus("ACCOUNT LINKED — PROGRESS NOW SYNCS TO THE CLOUD", "good");
  },
});
profile.setCloud((data) => auth.pushProfile(data));
let lastMode = "campaign";

const game = new Game(canvas, profile, {
  onResume() {
    startScreen.classList.add("hidden");
    pauseScreen.classList.add("hidden");
    endScreen.classList.add("hidden");
    readyScreen.classList.add("hidden");
    game.music.setState("patrol");
  },
  onPause() {
    pauseScreen.classList.remove("hidden");
    game.music.setState("lobby");
  },
  onSector(name) {
    armory.setStatus(`SECTOR GENERATED: ${name}`, "good");
  },
  onLockBlocked() {
    startScreen.classList.add("hidden");
    readyScreen.classList.remove("hidden");
    readySummary.textContent = "Your browser needs a direct click to capture the mouse.";
  },
  onEnd({ victory, summary, gems, kills, mode }) {
    pauseScreen.classList.add("hidden");
    endScreen.classList.remove("hidden");
    endKicker.textContent = victory ? "SECTOR SECURED" : "OPERATOR DOWN";
    endTitle.textContent = victory ? (mode === "pvp" ? "MATCH WON" : "MISSION COMPLETE") : "KIA";
    endSummary.textContent = summary ?? "The operation has ended.";
    endKills.textContent = kills;
    endGems.textContent = gems.toLocaleString();
  },
});

function deploy(mode) {
  lastMode = mode;
  armory.setStatus(mode === "pvp" ? "CONNECTING TO PVP RELAY..." : "GENERATING SECTOR...");
  game
    .start(mode)
    .then(({ gated, operators }) => {
      if (!gated) return;
      startScreen.classList.add("hidden");
      readyScreen.classList.remove("hidden");
      readySummary.textContent = `Joining as ${profile.data.callsign}. ${operators} operator${operators === 1 ? "" : "s"} in the sector. First to ${game.net.killLimit} eliminations wins.`;
    })
    .catch((error) => {
      armory.setStatus(
        `PVP RELAY UNAVAILABLE — RUN "npm run server" OR SET VITE_PVP_URL. ${error.message}`,
        "bad"
      );
      startScreen.classList.remove("hidden");
    });
}

function openArmory() {
  startScreen.classList.remove("hidden");
  pauseScreen.classList.add("hidden");
  endScreen.classList.add("hidden");
  readyScreen.classList.add("hidden");
  game.returnToMenu();
  armory.render();
  game.music.setState("lobby");
}

function syncMusicControls() {
  const { music, musicVolume: volume } = profile.settings;
  musicToggle.textContent = music ? "MUSIC ON" : "MUSIC OFF";
  musicToggle.classList.toggle("muted", !music);
  musicVolume.value = String(Math.round(volume * 100));
}

musicToggle.addEventListener("click", () => {
  const enabled = !profile.settings.music;
  profile.setSetting("music", enabled);
  game.music.setEnabled(enabled);
  if (enabled) game.music.setState(game.running ? "patrol" : "lobby");
  syncMusicControls();
  playUiClick();
});

musicVolume.addEventListener("input", () => {
  const volume = Number(musicVolume.value) / 100;
  game.music.setVolume(volume);
  profile.setSetting("musicVolume", volume);
});

syncMusicControls();

// Audio can only start inside a gesture, so the lobby score waits for the first click.
const primeAudio = () => {
  window.removeEventListener("pointerdown", primeAudio);
  if (profile.settings.music && !game.started) game.music.setState("lobby");
};
window.addEventListener("pointerdown", primeAudio);

document.querySelector("#deploy-campaign").addEventListener("click", () => deploy("campaign"));
document.querySelector("#deploy-pvp").addEventListener("click", () => deploy("pvp"));
document.querySelector("#enter-button").addEventListener("click", () => game.resume());
document.querySelector("#resume-button").addEventListener("click", () => game.resume());
document.querySelector("#abort-button").addEventListener("click", () => {
  game.end(false, "You withdrew from the sector.");
  game.returnToMenu();
  openArmory();
});
document.querySelector("#restart-button").addEventListener("click", () => {
  endScreen.classList.add("hidden");
  deploy(lastMode);
});
document.querySelector("#armory-button").addEventListener("click", openArmory);

if (import.meta.env.DEV) window.__blacksite = { game, profile, armory, auth };
