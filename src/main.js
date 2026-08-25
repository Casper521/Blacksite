import "./style.css";
import { Game } from "./game.js";
import { Armory } from "./armory.js";
import { Profile } from "./economy.js";

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

const profile = new Profile();
const armory = new Armory(profile);
let lastMode = "campaign";

const game = new Game(canvas, profile, {
  onResume() {
    startScreen.classList.add("hidden");
    pauseScreen.classList.add("hidden");
    endScreen.classList.add("hidden");
    readyScreen.classList.add("hidden");
  },
  onPause() {
    pauseScreen.classList.remove("hidden");
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
      readySummary.textContent = `${operators} operator${operators === 1 ? "" : "s"} in the sector. First to ${game.net.killLimit} eliminations wins.`;
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
  armory.render();
}

document.querySelector("#deploy-campaign").addEventListener("click", () => deploy("campaign"));
document.querySelector("#deploy-pvp").addEventListener("click", () => deploy("pvp"));
document.querySelector("#enter-button").addEventListener("click", () => game.resume());
document.querySelector("#resume-button").addEventListener("click", () => game.resume());
document.querySelector("#abort-button").addEventListener("click", () => {
  game.end(false, "You withdrew from the sector.");
  openArmory();
});
document.querySelector("#restart-button").addEventListener("click", () => {
  endScreen.classList.add("hidden");
  deploy(lastMode);
});
document.querySelector("#armory-button").addEventListener("click", openArmory);

if (import.meta.env.DEV) window.__blacksite = { game, profile, armory };
