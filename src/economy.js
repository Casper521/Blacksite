import { SKINS, WEAPONS } from "./catalog.js";

const STORAGE_KEY = "blacksite-profile-v1";

const defaults = () => ({
  gems: 600,
  callsign: "OPERATOR",
  weapons: [WEAPONS[0].id],
  skins: [SKINS[0].id],
  equippedWeapon: WEAPONS[0].id,
  equippedSkin: SKINS[0].id,
  kills: 0,
  missions: 0,
});

export class Profile {
  constructor() {
    this.data = defaults();
    this.listeners = new Set();
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.data = { ...defaults(), ...JSON.parse(raw) };
    } catch {
      this.data = defaults();
    }
    if (!this.data.weapons.includes(WEAPONS[0].id)) this.data.weapons.push(WEAPONS[0].id);
    if (!this.data.skins.includes(SKINS[0].id)) this.data.skins.push(SKINS[0].id);
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Storage can be unavailable in private browsing; the session still runs.
    }
    for (const listener of this.listeners) listener(this.data);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.data);
    return () => this.listeners.delete(listener);
  }

  get gems() {
    return this.data.gems;
  }

  owns(kind, id) {
    return this.data[kind].includes(id);
  }

  canAfford(price) {
    return this.data.gems >= price;
  }

  purchase(kind, item) {
    if (this.owns(kind, item.id) || !this.canAfford(item.price)) return false;
    this.data.gems -= item.price;
    this.data[kind].push(item.id);
    this.equip(kind, item.id);
    return true;
  }

  equip(kind, id) {
    if (!this.owns(kind, id)) return false;
    this.data[kind === "weapons" ? "equippedWeapon" : "equippedSkin"] = id;
    this.save();
    return true;
  }

  setCallsign(name) {
    this.data.callsign = name.trim().slice(0, 14).toUpperCase() || "OPERATOR";
    this.save();
  }

  award(amount) {
    this.data.gems += amount;
    this.save();
    return this.data.gems;
  }

  registerKill() {
    this.data.kills += 1;
  }

  registerMission() {
    this.data.missions += 1;
    this.save();
  }
}
