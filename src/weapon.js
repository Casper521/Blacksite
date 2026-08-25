import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { playEmpty, playGunshot, playReload, playSlash, playThrow } from "./audio.js";
import { SLOTS, getSkin, getWeapon } from "./catalog.js";

const HIP = new THREE.Vector3(0.31, -0.29, -0.5);
const ADS = new THREE.Vector3(0, -0.205, -0.42);
const KNIFE_HIP = new THREE.Vector3(0.22, -0.24, -0.42);
const GRENADE_HIP = new THREE.Vector3(0.24, -0.22, -0.4);
const BASE_FOV = 75;
const SLOT_KEYS = { Digit1: "rifle", Digit2: "pistol", Digit3: "knife", Digit4: "grenade" };

function part(geometry, material, position, parent) {
  const object = new THREE.Mesh(geometry, material);
  object.position.copy(position);
  parent.add(object);
  return object;
}

function palette(skin) {
  return {
    body: new THREE.MeshStandardMaterial({
      color: skin.body,
      roughness: skin.gloss,
      metalness: 0.75,
      emissive: skin.emissive ?? 0x000000,
      emissiveIntensity: skin.emissive ? 0.35 : 0,
    }),
    polymer: new THREE.MeshStandardMaterial({
      color: skin.accent,
      roughness: Math.min(0.95, skin.gloss + 0.35),
      metalness: 0.12,
      emissive: skin.emissive ?? 0x000000,
      emissiveIntensity: skin.emissive ? 0.5 : 0,
    }),
    steel: new THREE.MeshStandardMaterial({ color: skin.metal, roughness: 0.3, metalness: 0.92 }),
    hands: new THREE.MeshStandardMaterial({ color: 0x3d342b, roughness: 1 }),
  };
}

function proceduralGun(spec, skin) {
  const gun = new THREE.Group();
  const build = spec.build;
  const { body, polymer, steel, hands } = palette(skin);

  part(new THREE.BoxGeometry(0.12, 0.14, 0.48), body, new THREE.Vector3(0, 0, -0.05), gun);
  part(new THREE.BoxGeometry(0.105, 0.11, build.barrel * 0.8), polymer, new THREE.Vector3(0, 0.015, -0.42), gun);
  part(new THREE.CylinderGeometry(0.025, 0.025, build.barrel, 10), steel, new THREE.Vector3(0, 0.015, -0.5 - build.barrel / 2), gun).rotation.x = Math.PI / 2;
  part(new THREE.CylinderGeometry(0.042, 0.032, 0.14, 10), body, new THREE.Vector3(0, 0.015, -build.muzzle + 0.08), gun).rotation.x = Math.PI / 2;
  part(new THREE.BoxGeometry(0.07, build.magazine, 0.15), polymer, new THREE.Vector3(0, -0.12 - build.magazine / 2, -0.04), gun).rotation.x = -0.16;
  part(new THREE.BoxGeometry(0.09, 0.27, 0.15), body, new THREE.Vector3(0, -0.17, -0.26), gun).rotation.x = 0.18;
  if (build.stock > 0) part(new THREE.BoxGeometry(0.11, 0.09, build.stock), polymer, new THREE.Vector3(0, 0, 0.18 + build.stock / 2), gun);

  if (build.optic && build.optic !== "none") {
    part(new THREE.BoxGeometry(0.09, 0.035, 0.22), body, new THREE.Vector3(0, 0.11, -0.08), gun);
    const scoped = build.optic === "scope";
    const radius = scoped ? 0.075 : build.optic === "acog" ? 0.065 : 0.05;
    const length = scoped ? 0.42 : 0.18;
    const tube = part(new THREE.CylinderGeometry(radius, radius, length, 14), body, new THREE.Vector3(0, 0.2, -0.12), gun);
    tube.rotation.x = Math.PI / 2;
    const glass = part(
      new THREE.CircleGeometry(radius * 0.72, 14),
      new THREE.MeshBasicMaterial({ color: skin.emissive ?? 0x79b09a, transparent: true, opacity: 0.72 }),
      new THREE.Vector3(0, 0.2, -0.12 - length / 2 - 0.002),
      gun
    );
    gun.userData.glass = glass;
  }

  part(new THREE.BoxGeometry(0.12, 0.12, 0.3), hands, new THREE.Vector3(-0.075, -0.11, -0.42 - build.barrel * 0.3), gun).rotation.z = -0.15;
  part(new THREE.BoxGeometry(0.12, 0.12, 0.28), hands, new THREE.Vector3(0.105, -0.14, -0.03), gun).rotation.z = 0.12;

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.015, -build.muzzle);
  gun.add(muzzle);
  gun.userData.muzzle = muzzle;
  gun.traverse((object) => {
    if (object.isMesh) object.castShadow = false;
  });
  return gun;
}

function proceduralKnife(spec, skin) {
  const knife = new THREE.Group();
  const { polymer, steel, hands } = palette(skin);
  part(new THREE.BoxGeometry(0.05, 0.08, 0.16), polymer, new THREE.Vector3(0, 0, 0.04), knife);
  const blade = part(new THREE.BoxGeometry(0.015, 0.07, spec.build.blade), steel, new THREE.Vector3(0, 0.01, -spec.build.blade / 2), knife);
  blade.rotation.z = 0.04;
  part(new THREE.BoxGeometry(0.12, 0.12, 0.22), hands, new THREE.Vector3(0.08, -0.08, 0.08), knife).rotation.z = 0.2;
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -spec.build.blade);
  knife.add(muzzle);
  knife.userData.muzzle = muzzle;
  return knife;
}

function proceduralGrenade(spec, skin) {
  const grenade = new THREE.Group();
  const { polymer, steel, hands } = palette(skin);
  const body = part(new THREE.SphereGeometry(spec.build.body, 10, 8), polymer, new THREE.Vector3(0, 0, 0), grenade);
  body.scale.set(0.85, 1.15, 0.85);
  part(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 8), steel, new THREE.Vector3(0, spec.build.body + 0.02, 0), grenade);
  part(new THREE.BoxGeometry(0.12, 0.12, 0.22), hands, new THREE.Vector3(0.08, -0.06, 0.06), grenade).rotation.z = 0.18;
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -0.08);
  grenade.add(muzzle);
  grenade.userData.muzzle = muzzle;
  return grenade;
}

function buildModel(spec, skin) {
  if (spec.kind === "melee") return proceduralKnife(spec, skin);
  if (spec.kind === "grenade") return proceduralGrenade(spec, skin);
  return proceduralGun(spec, skin);
}

export class Weapon {
  constructor(camera, player, effects, callbacks = {}) {
    this.camera = camera;
    this.player = player;
    this.effects = effects;
    this.callbacks = callbacks;
    this.group = new THREE.Group();
    this.group.position.copy(HIP);
    camera.add(this.group);

    this.spec = getWeapon();
    this.skin = getSkin();
    this.model = null;
    this.mixer = null;
    this.actions = {};
    this.currentAction = null;
    this.specs = {};
    this.ammo = {};
    this.slot = "rifle";

    this.magazine = 0;
    this.reserve = 0;
    this.trigger = false;
    this.semiReady = true;
    this.aiming = false;
    this.adsAmount = 0;
    this.reloading = false;
    this.reloadTimer = 0;
    this.lastShot = -1;
    this.emptyClicked = false;
    this.flashTimer = 0;
    this.shotKick = 0;
    this.enabled = false;
    this.raycaster = new THREE.Raycaster();

    this.flash = new THREE.PointLight(0xffa642, 0, 5, 2);
    this.group.add(this.flash);
    this.flashSprite = part(
      new THREE.SphereGeometry(0.055, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 }),
      new THREE.Vector3(0, 0.02, -1.28),
      this.group
    );

    this.equip(this.spec, this.skin);

    window.addEventListener("mousedown", (event) => {
      if (!this.player.controls.isLocked || !this.enabled) return;
      if (event.button === 0) this.trigger = true;
      if (event.button === 2) this.aiming = true;
    });
    window.addEventListener("mouseup", (event) => {
      if (event.button === 0) {
        this.trigger = false;
        this.semiReady = true;
        this.emptyClicked = false;
      }
      if (event.button === 2) this.aiming = false;
    });
    window.addEventListener("contextmenu", (event) => event.preventDefault());
    window.addEventListener("keydown", (event) => {
      if (!this.enabled) return;
      if (event.code === "KeyR") this.reload();
      const slot = SLOT_KEYS[event.code];
      if (slot) this.selectSlot(slot);
    });
    window.addEventListener("wheel", (event) => {
      if (!this.enabled || !this.player.controls.isLocked) return;
      const order = SLOTS.map((entry) => entry.id);
      const index = order.indexOf(this.slot);
      const next = order[(index + (event.deltaY > 0 ? 1 : -1) + order.length) % order.length];
      this.selectSlot(next);
    }, { passive: true });
  }

  hipPose() {
    if (this.spec.kind === "melee") return KNIFE_HIP;
    if (this.spec.kind === "grenade") return GRENADE_HIP;
    return HIP;
  }

  setLoadout(specs, skin, activeSlot = "rifle") {
    this.specs = specs;
    this.skin = skin;
    this.ammo = {};
    for (const spec of Object.values(specs)) {
      this.ammo[spec.id] = { magazine: spec.magazine, reserve: spec.reserve };
    }
    this.selectSlot(activeSlot, true);
  }

  selectSlot(slot, force = false) {
    if (!this.specs[slot] || (slot === this.slot && !force)) return;
    this.storeAmmo();
    this.slot = slot;
    this.equip(this.specs[slot], this.skin, true);
    const stored = this.ammo[this.spec.id];
    if (stored) {
      this.magazine = stored.magazine;
      this.reserve = stored.reserve;
    }
    this.callbacks.onState?.(this);
  }

  storeAmmo() {
    if (!this.spec) return;
    this.ammo[this.spec.id] = { magazine: this.magazine, reserve: this.reserve };
  }

  equip(spec, skin, keepAmmo = false) {
    this.spec = spec;
    this.skin = skin;
    if (this.model) {
      this.group.remove(this.model);
      this.model.traverse((object) => {
        object.geometry?.dispose();
        object.material?.dispose();
      });
    }
    this.model = buildModel(spec, skin);
    this.group.add(this.model);
    const muzzleZ = spec.build.muzzle ?? 0.2;
    this.flash.position.set(0, 0.02, -muzzleZ);
    this.flashSprite.position.set(0, 0.02, -muzzleZ - 0.04);

    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const name of ["Idle", "Walk", "Sprint", "Fire", "Reload"]) {
      this.actions[name] = this.mixer.clipAction(new THREE.AnimationClip(name, name === "Reload" ? spec.reloadTime : 0.25, []));
    }
    this.currentAction = this.actions.Idle;
    this.currentAction.play();
    this.fireInterval = 60 / spec.rpm;
    if (!keepAmmo) this.reset();
    else {
      this.reloading = false;
      this.trigger = false;
      this.semiReady = true;
    }
  }

  loadModel(url) {
    new GLTFLoader().load(url, (gltf) => {
      this.group.remove(this.model);
      this.model = gltf.scene;
      this.group.add(this.model);
      this.mixer = new THREE.AnimationMixer(this.model);
      this.actions = {};
      for (const clip of gltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
      this.currentAction = this.actions.Idle ?? null;
      this.currentAction?.play();
    });
  }

  transition(name, fade = 0.12) {
    const next = this.actions[name];
    if (!next || next === this.currentAction) return;
    next.reset().play();
    if (this.currentAction) this.currentAction.crossFadeTo(next, fade, false);
    this.currentAction = next;
  }

  reset() {
    this.magazine = this.spec.magazine;
    this.reserve = this.spec.reserve;
    this.reloading = false;
    this.trigger = false;
    this.aiming = false;
    this.semiReady = true;
    this.ammo[this.spec.id] = { magazine: this.magazine, reserve: this.reserve };
    this.callbacks.onState?.(this);
  }

  refill() {
    for (const spec of Object.values(this.specs)) {
      this.ammo[spec.id] = { magazine: spec.magazine, reserve: spec.reserve };
    }
    const stored = this.ammo[this.spec.id];
    if (stored) {
      this.magazine = stored.magazine;
      this.reserve = stored.reserve;
    }
    this.reloading = false;
    this.callbacks.onState?.(this);
  }

  reload() {
    if (this.spec.kind === "melee") return;
    if (this.reloading || this.magazine === this.spec.magazine || this.reserve === 0) return;
    this.reloading = true;
    this.reloadTimer = this.spec.reloadTime;
    this.transition("Reload", 0.08);
    playReload();
    this.callbacks.onState?.(this);
  }

  finishReload() {
    const moved = Math.min(this.spec.magazine - this.magazine, this.reserve);
    this.magazine += moved;
    this.reserve -= moved;
    this.reloading = false;
    this.storeAmmo();
    this.transition("Idle");
    this.callbacks.onState?.(this);
  }

  fire(now) {
    if (this.reloading || now - this.lastShot < this.fireInterval) return;
    if (!this.spec.auto && !this.semiReady) return;
    if (this.spec.kind === "melee") {
      this.swing(now);
      return;
    }
    if (this.spec.kind === "grenade") {
      this.throwGrenade(now);
      return;
    }
    if (this.magazine <= 0) {
      if (!this.emptyClicked) playEmpty();
      this.emptyClicked = true;
      return;
    }
    this.lastShot = now;
    this.semiReady = false;
    this.magazine--;
    this.storeAmmo();
    this.shotKick = Math.min(0.14, this.shotKick + this.spec.recoil * 3.4);
    this.flashTimer = 0.045;
    this.transition("Fire", 0.015);
    playGunshot();
    this.callbacks.onFire?.(this.player.position);

    const aimed = this.adsAmount > 0.8;
    const spread = aimed ? this.spec.adsSpread : this.player.sprinting ? this.spec.hipSpread * 2.4 : this.spec.hipSpread;
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const targets = this.callbacks.getTargets?.() ?? [];
    const muzzle = this.model.userData.muzzle?.getWorldPosition(new THREE.Vector3()) ?? origin;

    for (let pellet = 0; pellet < this.spec.pellets; pellet++) {
      const direction = new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * spread,
        -1
      ).applyQuaternion(this.camera.quaternion).normalize();
      this.raycaster.set(origin, direction);
      this.raycaster.far = this.spec.range;
      const hits = this.raycaster.intersectObjects(targets, true);
      const end = origin.clone().addScaledVector(direction, this.spec.range);
      if (hits.length) {
        const hit = hits[0];
        end.copy(hit.point);
        const falloff = 1 - THREE.MathUtils.clamp(hit.distance / this.spec.range, 0, 1) * this.spec.falloff;
        this.callbacks.onImpact?.(hit, this.spec.damage * falloff, hit.object.userData.hitZone === "head");
      }
      if (pellet === 0 || Math.random() > 0.55) this.effects.tracer(muzzle, end);
    }

    this.player.applyRecoil(
      this.spec.recoil + Math.random() * this.spec.recoil * 0.6,
      (Math.random() - 0.5) * this.spec.recoil * 0.7,
      (Math.random() - 0.5) * this.spec.recoil * 0.5
    );
    this.callbacks.onState?.(this);
  }

  swing(now) {
    this.lastShot = now;
    this.semiReady = false;
    this.shotKick = 0.08;
    this.transition("Fire", 0.02);
    playSlash();
    this.callbacks.onFire?.(this.player.position);
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    this.raycaster.set(origin, direction);
    this.raycaster.far = this.spec.range;
    const hits = this.raycaster.intersectObjects(this.callbacks.getTargets?.() ?? [], true);
    if (hits.length && hits[0].distance <= this.spec.range) {
      this.callbacks.onImpact?.(hits[0], this.spec.damage, hits[0].object.userData.hitZone === "head");
    }
    this.callbacks.onState?.(this);
  }

  throwGrenade(now) {
    if (this.magazine <= 0) {
      if (!this.emptyClicked) playEmpty();
      this.emptyClicked = true;
      return;
    }
    this.lastShot = now;
    this.semiReady = false;
    this.magazine--;
    this.storeAmmo();
    this.shotKick = 0.1;
    this.transition("Fire", 0.02);
    playThrow();
    const origin = this.camera.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0.15, -0.08, -0.2).applyQuaternion(this.camera.quaternion));
    const direction = new THREE.Vector3(
      (Math.random() - 0.5) * this.spec.hipSpread,
      0.12 + (Math.random() - 0.5) * this.spec.hipSpread,
      -1
    ).applyQuaternion(this.camera.quaternion).normalize();
    this.callbacks.onThrow?.({
      origin,
      velocity: direction.multiplyScalar(this.spec.throwSpeed),
      damage: this.spec.damage,
      radius: this.spec.range,
      fuse: this.spec.fuse,
    });
    this.callbacks.onFire?.(this.player.position);
    this.callbacks.onState?.(this);
  }

  update(dt, elapsed) {
    this.mixer.update(dt);
    if (this.enabled) {
      if (this.reloading) {
        this.reloadTimer -= dt;
        if (this.reloadTimer <= 0) this.finishReload();
      } else if (this.trigger) {
        this.fire(elapsed);
      }
    }

    const canAds = this.spec.kind === "firearm";
    const aimingNow = this.enabled && canAds && this.aiming && !this.reloading && !this.player.sprinting;
    this.adsAmount = THREE.MathUtils.damp(this.adsAmount, aimingNow ? 1 : 0, 14, dt);
    const targetFov = THREE.MathUtils.lerp(BASE_FOV, this.spec.adsFov, this.adsAmount);
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 13, dt);
      this.camera.updateProjectionMatrix();
    }

    const moveBob = this.player.moving && this.player.grounded ? Math.sin(elapsed * (this.player.sprinting ? 12 : 8)) : 0;
    const swayScale = THREE.MathUtils.lerp(0.0007, 0.00018, this.adsAmount);
    const hip = this.hipPose();
    const target = hip.clone().lerp(ADS, canAds ? this.adsAmount : 0);
    target.x += -this.player.mouseDelta.x * swayScale + moveBob * 0.007 * (1 - this.adsAmount);
    target.y += this.player.mouseDelta.y * swayScale + Math.abs(moveBob) * 0.007 * (1 - this.adsAmount);
    target.z += this.shotKick;
    this.group.position.lerp(target, 1 - Math.exp(-18 * dt));
    this.group.rotation.y = THREE.MathUtils.damp(this.group.rotation.y, -this.player.mouseDelta.x * 0.0007, 10, dt);
    this.group.rotation.x = THREE.MathUtils.damp(this.group.rotation.x, -this.player.mouseDelta.y * 0.0005, 10, dt);
    this.shotKick *= Math.exp(-17 * dt);

    this.flashTimer -= dt;
    const flashing = this.flashTimer > 0 && this.spec.kind === "firearm";
    this.flash.intensity = flashing ? 32 : 0;
    this.flashSprite.material.opacity = flashing ? 1 : 0;

    if (this.reloading) {
      const progress = Math.min(1, (this.spec.reloadTime - this.reloadTimer) / this.spec.reloadTime);
      this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, -0.6, Math.sin(progress * Math.PI));
    } else if (this.player.sprinting) {
      this.transition("Sprint");
      this.group.rotation.z = THREE.MathUtils.damp(this.group.rotation.z, this.spec.kind === "firearm" ? -0.3 : 0.15, 8, dt);
    } else {
      this.transition(this.player.moving ? "Walk" : "Idle");
      this.group.rotation.z = THREE.MathUtils.damp(this.group.rotation.z, 0, 8, dt);
    }
  }
}
