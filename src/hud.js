import { playHitmarker } from "./audio.js";

const query = (selector) => document.querySelector(selector);

export class HUD {
  constructor() {
    this.root = query("#hud");
    this.healthValue = query("#health-value");
    this.healthFill = query("#health-fill");
    this.ammoCurrent = query("#ammo-current");
    this.ammoReserve = query("#ammo-reserve");
    this.ammoPanel = query(".ammo-panel");
    this.weaponLabel = query("#weapon-label");
    this.weaponCaliber = query("#weapon-caliber");
    this.reloadPrompt = query("#reload-prompt");
    this.objectiveText = query("#objective-text");
    this.objectiveCount = query("#objective-count");
    this.crosshair = query("#crosshair");
    this.hitmarker = query("#hitmarker");
    this.damageOverlay = query("#damage-overlay");
    this.gemTotal = query("#gem-total");
    this.gemToast = query("#gem-toast");
    this.killfeed = query("#killfeed");
    this.scoreboard = query("#scoreboard");
    this.netStatusEl = query("#net-status");
    this.respawnOverlay = query("#respawn-overlay");
    this.respawnTimer = query("#respawn-timer");
    this.damageTimer = 0;
    this.toastTimer = 0;
  }

  health(value) {
    this.healthValue.textContent = Math.ceil(value);
    this.healthFill.style.width = `${value}%`;
    this.healthFill.style.background = value < 30 ? "var(--danger)" : "var(--lime)";
    this.damageTimer = 0.22;
    this.damageOverlay.style.opacity = `${0.18 + (1 - value / 100) * 0.45}`;
  }

  ammo(weapon) {
    this.weaponLabel.textContent = weapon.spec.name;
    this.weaponCaliber.textContent = weapon.spec.caliber;
    this.ammoCurrent.textContent = weapon.magazine.toString().padStart(2, "0");
    this.ammoReserve.textContent = weapon.reserve.toString().padStart(3, "0");
    const low = weapon.magazine <= Math.max(2, Math.ceil(weapon.spec.magazine * 0.25));
    this.ammoPanel.classList.toggle("low", low && !weapon.reloading);
    this.ammoPanel.classList.toggle("reloading", weapon.reloading);
    this.reloadPrompt.innerHTML = weapon.reloading ? "RELOADING..." : "R&nbsp;&nbsp;RELOAD";
  }

  objective(text, count) {
    this.objectiveText.textContent = text;
    this.objectiveCount.innerHTML = count ?? "";
  }

  gems(total) {
    this.gemTotal.textContent = total.toLocaleString();
  }

  gemGain(amount, label = "GEMS") {
    this.gemToast.textContent = `+${amount} ${label}`;
    this.gemToast.classList.remove("show");
    void this.gemToast.offsetWidth;
    this.gemToast.classList.add("show");
  }

  feed(text, tone = "neutral") {
    const entry = document.createElement("div");
    entry.className = `feed-entry ${tone}`;
    entry.textContent = text;
    this.killfeed.prepend(entry);
    while (this.killfeed.children.length > 5) this.killfeed.lastChild.remove();
    setTimeout(() => entry.classList.add("fade"), 4200);
    setTimeout(() => entry.remove(), 5000);
  }

  setScoreboard(players, selfId, killLimit) {
    if (!players.length) {
      this.scoreboard.classList.add("hidden");
      return;
    }
    this.scoreboard.classList.remove("hidden");
    this.scoreboard.innerHTML = `<div class="score-head">FIRST TO ${killLimit}</div>`;
    for (const player of players.slice(0, 6)) {
      const row = document.createElement("div");
      row.className = `score-row${player.id === selfId ? " self" : ""}`;
      row.innerHTML = `<span>${player.name}</span><b>${player.score}</b>`;
      this.scoreboard.appendChild(row);
    }
  }

  netStatus(status, detail = "") {
    const visible = status !== "hidden" && this.mode === "pvp";
    this.netStatusEl.classList.toggle("hidden", !visible);
    this.netStatusEl.dataset.status = status;
    this.netStatusEl.textContent = detail || status.toUpperCase();
  }

  respawn(seconds) {
    if (seconds === null) {
      this.respawnOverlay.classList.add("hidden");
      return;
    }
    this.respawnOverlay.classList.remove("hidden");
    this.respawnTimer.textContent = Math.ceil(seconds);
  }

  hit(headshot = false) {
    this.hitmarker.classList.remove("show");
    void this.hitmarker.offsetWidth;
    this.hitmarker.classList.add("show");
    this.hitmarker.style.filter = headshot ? "sepia(1) saturate(8)" : "";
    playHitmarker();
  }

  setMode(mode) {
    this.mode = mode;
    this.root.dataset.mode = mode;
    if (mode !== "pvp") {
      this.scoreboard.classList.add("hidden");
      this.netStatus("hidden");
    }
  }

  update(dt, player, weapon) {
    this.damageTimer -= dt;
    if (this.damageTimer <= 0) this.damageOverlay.style.opacity = "0";
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    const spread = weapon.adsAmount > 0.8 ? 3 : 7 + speed * 1.35 + (weapon.trigger ? 5 : 0);
    this.crosshair.style.setProperty("--gap", `${spread.toFixed(1)}px`);
    this.crosshair.classList.toggle("ads", weapon.adsAmount > 0.75);
  }
}
