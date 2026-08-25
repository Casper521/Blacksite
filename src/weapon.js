import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { playEmpty, playGunshot, playReload } from "./audio.js";
import { getSkin, getWeapon } from "./catalog.js";

const HIP = new THREE.Vector3(0.31, -0.29, -0.5);
const ADS = new THREE.Vector3(0, -0.205, -0.42);
const BASE_FOV = 75;

function part(geometry, material, position, parent) {
  const object = new THREE.Mesh(geometry, material);
  object.position.copy(position);
  parent.add(object);
  return object;
}

function proceduralGun(spec, skin) {
  const gun = new THREE.Group();
  const build = spec.build;
  const body = new THREE.MeshStandardMaterial({
    color: skin.body,
    roughness: skin.gloss,
    metalness: 0.75,
    emissive: skin.emissive ?? 0x000000,
    emissiveIntensity: skin.emissive ? 0.35 : 0,
  });
  const polymer = new THREE.MeshStandardMaterial({
    color: skin.accent,
    roughness: Math.min(0.95, skin.gloss + 0.35),
    metalness: 0.12,
    emissive: skin.emissive ?? 0x000000,
    emissiveIntensity: skin.emissive ? 0.5 : 0,
  });
  const steel = new THREE.MeshStandardMaterial({ color: skin.metal, roughness: 0.3, metalness: 0.92 });
  const hands = new THREE.MeshStandardMaterial({ color: 0x3d342b, roughness: 1 });

  part(new THREE.BoxGeometry(0.12, 0.14, 0.48), body, new THREE.Vector3(0, 0, -0.05), gun);
  part(new THREE.BoxGeometry(0.105, 0.11, build.barrel * 0.8), polymer, new THREE.Vector3(0, 0.015, -0.42), gun);
  part(new THREE.CylinderGeometry(0.025, 0.025, build.barrel, 10), steel, new THREE.Vector3(0, 0.015, -0.5 - build.barrel / 2), gun).rotation.x = Math.PI / 2;
  part(new THREE.CylinderGeometry(0.042, 0.032, 0.14, 10), body, new THREE.Vector3(0, 0.015, -build.muzzle + 0.08), gun).rotation.x = Math.PI / 2;
  part(new THREE.BoxGeometry(0.07, build.magazine, 0.15), polymer, new THREE.Vector3(0, -0.12 - build.magazine / 2, -0.04), gun).rotation.x = -0.16;
  part(new THREE.BoxGeometry(0.09, 0.27, 0.15), body, new THREE.Vector3(0, -0.17, -0.26), gun).rotation.x = 0.18;
  if (build.stock > 0) part(new THREE.BoxGeometry(0.11, 0.09, build.stock), polymer, new THREE.Vector3(0, 0, 0.18 + build.stock / 2), gun);

  if (build.optic !== "none") {
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
      if (event.code === "KeyR" && this.enabled) this.reload();
    });
  }

  equip(spec, skin) {
    this.spec = spec;
    this.skin = skin;
    if (this.model) {
      this.group.remove(this.model);
      this.model.traverse((object) => {
        object.geometry?.dispose();
        object.material?.dispose();
      });
    }
    this.model = proceduralGun(spec, skin);
    this.group.add(this.model);
    this.flash.position.set(0, 0.02, -spec.build.muzzle);
    this.flashSprite.position.set(0, 0.02, -spec.build.muzzle - 0.04);

    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const name of ["Idle", "Walk", "Sprint", "Fire", "Reload"]) {
      this.actions[name] = this.mixer.clipAction(new THREE.AnimationClip(name, name === "Reload" ? spec.reloadTime : 0.25, []));
    }
    this.currentAction = this.actions.Idle;
    this.currentAction.play();
    this.fireInterval = 60 / spec.rpm;
    this.reset();
  }

  // Production GLTF weapons drop in here while keeping the same animation state names.
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
    this.callbacks.onState?.(this);
  }

  reload() {
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
    this.transition("Idle");
    this.callbacks.onState?.(this);
  }

  fire(now) {
    if (this.reloading || now - this.lastShot < this.fireInterval) return;
    if (!this.spec.auto && !this.semiReady) return;
    if (this.magazine <= 0) {
      if (!this.emptyClicked) playEmpty();
      this.emptyClicked = true;
      return;
    }
    this.lastShot = now;
    this.semiReady = false;
    this.magazine--;
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

    const aimingNow = this.enabled && this.aiming && !this.reloading && !this.player.sprinting;
    this.adsAmount = THREE.MathUtils.damp(this.adsAmount, aimingNow ? 1 : 0, 14, dt);
    const targetFov = THREE.MathUtils.lerp(BASE_FOV, this.spec.adsFov, this.adsAmount);
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 13, dt);
      this.camera.updateProjectionMatrix();
    }

    const moveBob = this.player.moving && this.player.grounded ? Math.sin(elapsed * (this.player.sprinting ? 12 : 8)) : 0;
    const swayScale = THREE.MathUtils.lerp(0.0007, 0.00018, this.adsAmount);
    const target = HIP.clone().lerp(ADS, this.adsAmount);
    target.x += -this.player.mouseDelta.x * swayScale + moveBob * 0.007 * (1 - this.adsAmount);
    target.y += this.player.mouseDelta.y * swayScale + Math.abs(moveBob) * 0.007 * (1 - this.adsAmount);
    target.z += this.shotKick;
    this.group.position.lerp(target, 1 - Math.exp(-18 * dt));
    this.group.rotation.y = THREE.MathUtils.damp(this.group.rotation.y, -this.player.mouseDelta.x * 0.0007, 10, dt);
    this.group.rotation.x = THREE.MathUtils.damp(this.group.rotation.x, -this.player.mouseDelta.y * 0.0005, 10, dt);
    this.shotKick *= Math.exp(-17 * dt);

    this.flashTimer -= dt;
    const flashing = this.flashTimer > 0;
    this.flash.intensity = flashing ? 32 : 0;
    this.flashSprite.material.opacity = flashing ? 1 : 0;

    if (this.reloading) {
      const progress = Math.min(1, (this.spec.reloadTime - this.reloadTimer) / this.spec.reloadTime);
      this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, -0.6, Math.sin(progress * Math.PI));
    } else if (this.player.sprinting) {
      this.transition("Sprint");
      this.group.rotation.z = THREE.MathUtils.damp(this.group.rotation.z, -0.3, 8, dt);
    } else {
      this.transition(this.player.moving ? "Walk" : "Idle");
      this.group.rotation.z = THREE.MathUtils.damp(this.group.rotation.z, 0, 8, dt);
    }
  }
}
