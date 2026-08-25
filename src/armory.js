import { SKINS, SLOTS, getWeapon, weaponsInSlot } from "./catalog.js";
import {
  MAX_LEVEL,
  OPERATOR_TRACKS,
  WEAPON_TRACKS,
  applyWeaponUpgrades,
  operatorUpgradeCost,
  weaponUpgradeCost,
} from "./upgrades.js";

const clamp01 = (value) => Math.max(0.05, Math.min(1, value));
const hex = (value) => `#${value.toString(16).padStart(6, "0")}`;

const statBars = (weapon) => [
  ["DAMAGE", clamp01((weapon.damage * weapon.pellets) / 100)],
  ["FIRE RATE", clamp01(weapon.rpm / 1050)],
  ["RANGE", clamp01(weapon.range / 200)],
  ["CONTROL", clamp01(1 - weapon.recoil / 0.06)],
  ["CAPACITY", clamp01(weapon.magazine / 75)],
];

const pips = (level) =>
  Array.from({ length: MAX_LEVEL }, (_, index) => `<i class="pip${index < level ? " on" : ""}"></i>`).join("");

export class Armory {
  constructor(profile, callbacks = {}) {
    this.profile = profile;
    this.callbacks = callbacks;
    this.weaponGrid = document.querySelector("#weapon-grid");
    this.skinGrid = document.querySelector("#skin-grid");
    this.upgradePanel = document.querySelector("#upgrade-panel");
    this.accountPanel = document.querySelector("#account-panel");
    this.gemLabel = document.querySelector("#lobby-gems");
    this.playingAs = document.querySelector("#playing-as");
    this.status = document.querySelector("#lobby-status");
    this.tabs = [...document.querySelectorAll("[data-tab]")];
    this.tab = "weapons";

    for (const tab of this.tabs) {
      tab.addEventListener("click", () => this.showTab(tab.dataset.tab));
    }

    profile.subscribe(() => this.render());
  }

  showTab(name) {
    this.tab = name;
    for (const tab of this.tabs) tab.classList.toggle("active", tab.dataset.tab === name);
    this.weaponGrid.classList.toggle("hidden", name !== "weapons");
    this.skinGrid.classList.toggle("hidden", name !== "skins");
    this.upgradePanel.classList.toggle("hidden", name !== "upgrades");
    this.accountPanel.classList.toggle("hidden", name !== "account");
  }

  setStatus(message, tone = "neutral") {
    this.status.textContent = message;
    this.status.dataset.tone = tone;
  }

  handleSelect(kind, item) {
    if (this.profile.owns(kind, item.id)) {
      this.profile.equip(kind, item.id);
      this.setStatus(`${item.name} EQUIPPED`, "good");
      this.callbacks.onPurchase?.(false);
      return;
    }
    if (this.profile.purchase(kind, item)) {
      this.setStatus(`${item.name} PURCHASED AND EQUIPPED`, "good");
      this.profile.save();
      this.callbacks.onPurchase?.(true);
      return;
    }
    const missing = item.price - this.profile.gems;
    this.setStatus(`NEED ${missing.toLocaleString()} MORE GEMS FOR ${item.name}`, "bad");
  }

  card(kind, item, body) {
    const owned = this.profile.owns(kind, item.id);
    const equipped = kind === "weapons"
      ? this.profile.data.loadout[item.slot] === item.id
      : this.profile.data.equippedSkin === item.id;
    const affordable = this.profile.canAfford(item.price);

    const card = document.createElement("button");
    card.type = "button";
    card.className = `gear-card${owned ? " owned" : ""}${equipped ? " equipped" : ""}${!owned && !affordable ? " locked" : ""}`;
    card.innerHTML = `
      ${body}
      <div class="gear-foot">
        <span class="gear-state">${equipped ? "EQUIPPED" : owned ? "EQUIP" : "PURCHASE"}</span>
        <span class="gear-price">${owned ? "OWNED" : `${item.price.toLocaleString()} <i class="gem"></i>`}</span>
      </div>
    `;
    card.addEventListener("click", () => this.handleSelect(kind, item));
    return card;
  }

  upgradeRow(track, level, cost, onBuy) {
    const row = document.createElement("div");
    const maxed = level >= MAX_LEVEL;
    const affordable = this.profile.canAfford(cost);
    row.className = `upgrade-row${maxed ? " maxed" : ""}`;
    row.innerHTML = `
      <div class="upgrade-meta">
        <b>${track.name}</b>
        <span>${track.detail}</span>
      </div>
      <div class="pips">${pips(level)}</div>
      <button type="button" class="upgrade-buy${!maxed && !affordable ? " locked" : ""}" ${maxed ? "disabled" : ""}>
        ${maxed ? "MAXED" : `${cost.toLocaleString()} <i class="gem"></i>`}
      </button>
    `;
    if (!maxed) row.querySelector("button").addEventListener("click", onBuy);
    return row;
  }

  renderUpgrades() {
    const weapon = getWeapon(this.profile.data.equippedWeapon);
    const weaponUpgrades = this.profile.weaponLevels(weapon.id);
    const operator = this.profile.operatorLevels();

    this.upgradePanel.innerHTML = `
      <section class="upgrade-group">
        <header><h3>${weapon.name}</h3><p>EQUIPPED WEAPON · ${weapon.className}</p></header>
        <div class="upgrade-list" data-list="weapon"></div>
      </section>
      <section class="upgrade-group">
        <header><h3>OPERATOR</h3><p>APPLIES TO EVERY LOADOUT</p></header>
        <div class="upgrade-list" data-list="operator"></div>
      </section>
      <p class="upgrade-hint">Upgrades apply the moment you deploy. Swap weapons to tune each one separately.</p>
    `;

    const weaponList = this.upgradePanel.querySelector('[data-list="weapon"]');
    for (const track of WEAPON_TRACKS) {
      const level = weaponUpgrades[track.id];
      const cost = weaponUpgradeCost(weapon, level);
      weaponList.appendChild(
        this.upgradeRow(track, level, cost, () => {
          if (this.profile.upgradeWeapon(weapon.id, track.id, cost)) {
            this.setStatus(`${weapon.name} ${track.name} → LEVEL ${level + 1}`, "good");
            this.callbacks.onPurchase?.(true);
            this.callbacks.onUpgrade?.();
          } else {
            this.setStatus(`NEED ${(cost - this.profile.gems).toLocaleString()} MORE GEMS`, "bad");
          }
        })
      );
    }

    const operatorList = this.upgradePanel.querySelector('[data-list="operator"]');
    for (const track of OPERATOR_TRACKS) {
      const level = operator[track.id];
      const cost = operatorUpgradeCost(level);
      operatorList.appendChild(
        this.upgradeRow(track, level, cost, () => {
          if (this.profile.upgradeOperator(track.id, cost)) {
            this.setStatus(`${track.name} → LEVEL ${level + 1}`, "good");
            this.callbacks.onPurchase?.(true);
            this.callbacks.onUpgrade?.();
          } else {
            this.setStatus(`NEED ${(cost - this.profile.gems).toLocaleString()} MORE GEMS`, "bad");
          }
        })
      );
    }
  }

  render() {
    this.gemLabel.textContent = this.profile.gems.toLocaleString();
    this.playingAs.innerHTML = `PLAYING AS <b>${this.profile.data.callsign}</b> · SET YOUR NAME IN ACCOUNT`;
    const operator = this.profile.operatorLevels();

    this.weaponGrid.innerHTML = "";
    for (const slot of SLOTS) {
      const heading = document.createElement("div");
      heading.className = "slot-heading";
      heading.innerHTML = `<span>SLOT ${slot.key}</span><b>${slot.name}</b>`;
      this.weaponGrid.appendChild(heading);
      for (const base of weaponsInSlot(slot.id)) {
        const levels = this.profile.weaponLevels(base.id);
        const weapon = applyWeaponUpgrades(base, levels, operator);
        const total = Object.values(levels).reduce((sum, level) => sum + level, 0);
        const bars = statBars(weapon)
          .map(
            ([label, value]) => `
        <div class="stat-row">
          <span>${label}</span>
          <i><b style="width:${(value * 100).toFixed(0)}%"></b></i>
        </div>`
          )
          .join("");
        this.weaponGrid.appendChild(
          this.card(
            "weapons",
            base,
            `<div class="gear-head">
            <h3>${base.name}</h3>
            <p>${base.className} · ${base.caliber}${total ? ` · <b class="tuned">TUNED +${total}</b>` : ""}</p>
          </div>
          <div class="stat-block">${bars}</div>`
          )
        );
      }
    }

    this.skinGrid.innerHTML = "";
    for (const skin of SKINS) {
      this.skinGrid.appendChild(
        this.card(
          "skins",
          skin,
          `<div class="swatch" style="background:linear-gradient(135deg, ${hex(skin.body)} 0%, ${hex(skin.accent)} 55%, ${hex(skin.metal)} 100%)">
            ${skin.emissive ? `<i class="swatch-glow" style="background:${hex(skin.emissive)}"></i>` : ""}
          </div>
          <div class="gear-head">
            <h3>${skin.name}</h3>
            <p>WEAPON FINISH</p>
          </div>`
        )
      );
    }

    this.renderUpgrades();
  }
}
