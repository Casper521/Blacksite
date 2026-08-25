import { SKINS, defaultLoadout, getWeapon, starterIds } from "./catalog.js";
import { MAX_LEVEL, operatorLevels, weaponLevels } from "./upgrades.js";

const STORAGE_KEY = "blacksite-profile-v1";

const defaults = () => ({
  gems: 600,
  callsign: "OPERATOR",
  weapons: starterIds(),
  skins: [SKINS[0].id],
  loadout: defaultLoadout(),
  activeSlot: "rifle",
  equippedWeapon: defaultLoadout().rifle,
  equippedSkin: SKINS[0].id,
  upgrades: {},
  operator: { armor: 0, mobility: 0, reserves: 0 },
  settings: { music: true, musicVolume: 0.55 },
  kills: 0,
  missions: 0,
  updatedAt: 0,
});

export class Profile {
  constructor() {
    this.data = defaults();
    this.listeners = new Set();
    this.cloud = null;
    this.pushTimer = null;
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.adopt(JSON.parse(raw), { persist: false, notify: false });
    } catch {
      this.data = defaults();
    }
  }

  adopt(data, { persist = true, notify = true } = {}) {
    const base = defaults();
    this.data = {
      ...base,
      ...data,
      operator: { ...base.operator, ...(data.operator ?? {}) },
      settings: { ...base.settings, ...(data.settings ?? {}) },
      upgrades: { ...(data.upgrades ?? {}) },
      loadout: { ...base.loadout, ...(data.loadout ?? {}) },
      weapons: [...new Set([...base.weapons, ...(data.weapons ?? [])])],
      skins: [...new Set([...base.skins, ...(data.skins ?? [])])],
    };
    const active = getWeapon(this.data.loadout[this.data.activeSlot] ?? this.data.equippedWeapon);
    this.data.activeSlot = active.slot;
    this.data.equippedWeapon = active.id;
    if (persist) this.save();
    else if (notify) this.emit();
  }

  emit() {
    for (const listener of this.listeners) listener(this.data);
  }

  save() {
    this.data.updatedAt = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Storage can be unavailable in private browsing; the session still runs.
    }
    this.emit();
    this.schedulePush();
  }

  setCloud(push) {
    this.cloud = push;
  }

  schedulePush() {
    if (!this.cloud) return;
    clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => this.cloud?.(this.data), 900);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.data);
    return () => this.listeners.delete(listener);
  }

  get gems() {
    return this.data.gems;
  }

  get settings() {
    return this.data.settings;
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
    if (kind === "skins") {
      this.data.equippedSkin = id;
    } else {
      const weapon = getWeapon(id);
      this.data.loadout[weapon.slot] = id;
      this.data.activeSlot = weapon.slot;
      this.data.equippedWeapon = id;
    }
    this.save();
    return true;
  }

  equippedIn(slot) {
    return this.data.loadout[slot] ?? defaultLoadout()[slot];
  }

  weaponLevels(weaponId) {
    return weaponLevels(this, weaponId);
  }

  operatorLevels() {
    return operatorLevels(this);
  }

  upgradeWeapon(weaponId, trackId, cost) {
    const levels = this.weaponLevels(weaponId);
    if (levels[trackId] >= MAX_LEVEL || !this.canAfford(cost)) return false;
    this.data.gems -= cost;
    this.data.upgrades[weaponId] = { ...levels, [trackId]: levels[trackId] + 1 };
    this.save();
    return true;
  }

  upgradeOperator(trackId, cost) {
    const levels = this.operatorLevels();
    if (levels[trackId] >= MAX_LEVEL || !this.canAfford(cost)) return false;
    this.data.gems -= cost;
    this.data.operator = { ...levels, [trackId]: levels[trackId] + 1 };
    this.save();
    return true;
  }

  setSetting(key, value) {
    this.data.settings = { ...this.data.settings, [key]: value };
    this.save();
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

  reset() {
    this.data = defaults();
    this.save();
  }
}
