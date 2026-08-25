export const MAX_LEVEL = 5;

export const WEAPON_TRACKS = [
  { id: "damage", name: "DAMAGE", detail: "+7% per level" },
  { id: "fireRate", name: "FIRE RATE", detail: "+5% per level" },
  { id: "range", name: "RANGE", detail: "+9% per level" },
  { id: "control", name: "CONTROL", detail: "-9% recoil & spread" },
];

export const OPERATOR_TRACKS = [
  { id: "armor", name: "ARMOR PLATING", detail: "+12 max health per level" },
  { id: "mobility", name: "MOBILITY", detail: "+4% move speed per level" },
  { id: "reserves", name: "AMMO RESERVES", detail: "+15% reserve ammo per level" },
];

export function weaponUpgradeCost(weapon, level) {
  return Math.round((140 + weapon.price * 0.075) * (level + 1));
}

export function operatorUpgradeCost(level) {
  return 260 * (level + 1);
}

export function weaponLevels(profile, weaponId) {
  const stored = profile.data.upgrades?.[weaponId] ?? {};
  return Object.fromEntries(WEAPON_TRACKS.map((track) => [track.id, stored[track.id] ?? 0]));
}

export function operatorLevels(profile) {
  const stored = profile.data.operator ?? {};
  return Object.fromEntries(OPERATOR_TRACKS.map((track) => [track.id, stored[track.id] ?? 0]));
}

export function applyWeaponUpgrades(spec, levels, operator = {}) {
  const damage = levels.damage ?? 0;
  const fireRate = levels.fireRate ?? 0;
  const range = levels.range ?? 0;
  const control = levels.control ?? 0;
  const reserves = operator.reserves ?? 0;
  const controlFactor = Math.pow(0.91, control);

  return {
    ...spec,
    damage: spec.damage * (1 + 0.07 * damage),
    rpm: Math.round(spec.rpm * (1 + 0.05 * fireRate)),
    range: spec.range * (1 + 0.09 * range),
    recoil: spec.recoil * controlFactor,
    hipSpread: spec.hipSpread * controlFactor,
    adsSpread: spec.adsSpread * controlFactor,
    reserve: Math.round(spec.reserve * (1 + 0.15 * reserves)),
    levels: { damage, fireRate, range, control },
  };
}

export function operatorStats(levels) {
  return {
    maxHealth: 100 + 12 * (levels.armor ?? 0),
    speedMultiplier: 1 + 0.04 * (levels.mobility ?? 0),
  };
}
