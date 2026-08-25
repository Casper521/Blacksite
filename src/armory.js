import { SKINS, WEAPONS } from "./catalog.js";

const clamp01 = (value) => Math.max(0.05, Math.min(1, value));
const hex = (value) => `#${value.toString(16).padStart(6, "0")}`;

const statBars = (weapon) => [
  ["DAMAGE", clamp01(weapon.damage * weapon.pellets / 100)],
  ["FIRE RATE", clamp01(weapon.rpm / 1050)],
  ["RANGE", clamp01(weapon.range / 200)],
  ["CONTROL", clamp01(1 - weapon.recoil / 0.06)],
  ["CAPACITY", clamp01(weapon.magazine / 75)],
];

export class Armory {
  constructor(profile, callbacks = {}) {
    this.profile = profile;
    this.callbacks = callbacks;
    this.weaponGrid = document.querySelector("#weapon-grid");
    this.skinGrid = document.querySelector("#skin-grid");
    this.gemLabel = document.querySelector("#lobby-gems");
    this.callsignInput = document.querySelector("#callsign-input");
    this.status = document.querySelector("#lobby-status");
    this.tabs = [...document.querySelectorAll("[data-tab]")];

    for (const tab of this.tabs) {
      tab.addEventListener("click", () => this.showTab(tab.dataset.tab));
    }

    this.callsignInput.value = profile.data.callsign;
    this.callsignInput.addEventListener("change", () => {
      profile.setCallsign(this.callsignInput.value);
      this.callsignInput.value = profile.data.callsign;
    });

    profile.subscribe(() => this.render());
  }

  showTab(name) {
    for (const tab of this.tabs) tab.classList.toggle("active", tab.dataset.tab === name);
    this.weaponGrid.classList.toggle("hidden", name !== "weapons");
    this.skinGrid.classList.toggle("hidden", name !== "skins");
  }

  setStatus(message, tone = "neutral") {
    this.status.textContent = message;
    this.status.dataset.tone = tone;
  }

  handleSelect(kind, item) {
    if (this.profile.owns(kind, item.id)) {
      this.profile.equip(kind, item.id);
      this.setStatus(`${item.name} EQUIPPED`, "good");
      return;
    }
    if (this.profile.purchase(kind, item)) {
      this.setStatus(`${item.name} PURCHASED AND EQUIPPED`, "good");
      this.profile.save();
      return;
    }
    const missing = item.price - this.profile.gems;
    this.setStatus(`NEED ${missing.toLocaleString()} MORE GEMS FOR ${item.name}`, "bad");
  }

  card(kind, item, body) {
    const owned = this.profile.owns(kind, item.id);
    const equipped = kind === "weapons"
      ? this.profile.data.equippedWeapon === item.id
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

  render() {
    this.gemLabel.textContent = this.profile.gems.toLocaleString();

    this.weaponGrid.innerHTML = "";
    for (const weapon of WEAPONS) {
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
          weapon,
          `<div class="gear-head">
            <h3>${weapon.name}</h3>
            <p>${weapon.className} · ${weapon.caliber}</p>
          </div>
          <div class="stat-block">${bars}</div>`
        )
      );
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
  }
}
