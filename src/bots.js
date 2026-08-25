import * as THREE from "three";
import { playGunshot } from "./audio.js";

export function createSoldier(palette = {}) {
  const group = new THREE.Group();
  const uniform = new THREE.MeshStandardMaterial({ color: palette.uniform ?? 0x434b3c, roughness: 0.92 });
  const vest = new THREE.MeshStandardMaterial({ color: palette.vest ?? 0x242a25, roughness: 0.86 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x8c725c, roughness: 0.95 });
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x151817, metalness: 0.6, roughness: 0.45 });
  const accentColor = palette.accent ?? 0xd7ff43;
  const accent = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: 0.7,
    roughness: 0.5,
  });

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.7, 0.32), uniform);
  legs.position.y = 0.37;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.82, 0.38), uniform);
  torso.position.y = 1.1;
  const armor = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.56, 0.43), vest);
  armor.position.set(0, 1.12, -0.02);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.1, 0.45), accent);
  band.position.set(0, 1.34, -0.02);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 10), skin);
  head.position.y = 1.72;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), vest);
  helmet.position.y = 1.77;
  const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.86), gunMat);
  rifle.position.set(0.28, 1.25, -0.42);
  rifle.rotation.x = -0.1;

  group.add(legs, torso, armor, band, head, helmet, rifle);
  group.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  head.userData.hitZone = "head";
  return { group, hitMeshes: [legs, torso, armor, head], head, rifle };
}

class Bot {
  constructor(context, spawn) {
    this.context = context;
    const model = createSoldier({ uniform: 0x4a3f33, vest: 0x2b2620, accent: 0xff5a3d });
    this.group = model.group;
    this.rifle = model.rifle;
    this.hitMeshes = model.hitMeshes;
    this.logical = spawn.clone();
    this.group.position.copy(spawn);
    context.scene.add(this.group);
    for (const target of this.hitMeshes) target.userData.bot = this;

    this.health = 100;
    this.state = "idle";
    this.stateTime = Math.random() * 2;
    this.patrolTarget = this.randomPatrolPoint();
    this.alerted = false;
    this.dead = false;
    this.lastShot = Math.random();
    this.raycaster = new THREE.Raycaster();
    this.walkPhase = Math.random() * 8;
    this.targetYaw = 0;
  }

  randomPatrolPoint() {
    return new THREE.Vector3(
      THREE.MathUtils.clamp(this.logical.x + (Math.random() - 0.5) * 22, -42, 42),
      0,
      THREE.MathUtils.clamp(this.logical.z + (Math.random() - 0.5) * 22, -42, 42)
    );
  }

  alert() {
    if (!this.dead) {
      this.alerted = true;
      if (this.state === "idle" || this.state === "patrol") this.state = "chase";
    }
  }

  takeDamage(amount, headshot = false) {
    if (this.dead) return;
    this.health -= amount;
    this.alert();
    if (this.health <= 0) {
      this.dead = true;
      this.state = "dead";
      for (const mesh of this.hitMeshes) mesh.userData.bot = null;
      this.context.onDeath(this, headshot);
    }
  }

  canSeePlayer() {
    const origin = this.logical.clone().add(new THREE.Vector3(0, 1.45, 0));
    const player = this.context.player.position;
    const target = new THREE.Vector3(player.x, player.y + 0.3, player.z);
    const direction = target.clone().sub(origin);
    const distance = direction.length();
    this.raycaster.set(origin, direction.normalize());
    this.raycaster.far = distance;
    return this.raycaster.intersectObjects(this.context.colliders(), false).length === 0;
  }

  moveToward(target, speed, dt) {
    const direction = target.clone().sub(this.logical);
    direction.y = 0;
    if (direction.lengthSq() < 0.25) return true;
    direction.normalize();
    this.raycaster.set(this.logical.clone().add(new THREE.Vector3(0, 0.8, 0)), direction);
    this.raycaster.far = 1.6;
    if (this.raycaster.intersectObjects(this.context.colliders(), false).length) {
      direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * 0.5);
    }
    this.logical.addScaledVector(direction, speed * dt);
    this.logical.x = THREE.MathUtils.clamp(this.logical.x, -44, 44);
    this.logical.z = THREE.MathUtils.clamp(this.logical.z, -44, 44);
    this.targetYaw = Math.atan2(direction.x, direction.z);
    this.walkPhase += dt * speed * 6;
    this.logical.y = Math.abs(Math.sin(this.walkPhase)) * 0.02;
    return false;
  }

  attack(elapsed, distance) {
    const player = this.context.player.position;
    const target = new THREE.Vector3(player.x, player.y, player.z);
    const direction = target.clone().sub(this.logical);
    this.targetYaw = Math.atan2(direction.x, direction.z);
    if (elapsed - this.lastShot < 0.55 + Math.random() * 0.35) return;
    this.lastShot = elapsed;
    playGunshot(true);
    const start = this.rifle.getWorldPosition(new THREE.Vector3());
    const accuracy = THREE.MathUtils.clamp(0.62 - distance * 0.012, 0.16, 0.55);
    const hit = Math.random() < accuracy;
    const end = target.clone();
    if (!hit) end.add(new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 2.5 - 0.5, (Math.random() - 0.5) * 4));
    this.context.effects.tracer(start, end, true);
    if (hit) this.context.player.applyDamage(5 + Math.random() * 6, "HOSTILE");
  }

  stepFixed(dt, elapsed) {
    if (this.dead) return;

    this.stateTime += dt;
    const player = this.context.player.position;
    const playerPosition = new THREE.Vector3(player.x, 0, player.z);
    const flat = new THREE.Vector3(this.logical.x, 0, this.logical.z);
    const distance = flat.distanceTo(playerPosition);
    const visible = this.context.player.alive && distance < 30 && this.canSeePlayer();
    if (visible || this.alerted) {
      this.alerted = true;
      this.state = visible && distance < 18 ? "attack" : "chase";
    }

    if (this.state === "idle" && this.stateTime > 1.3) {
      this.state = "patrol";
      this.stateTime = 0;
    } else if (this.state === "patrol") {
      if (this.moveToward(this.patrolTarget, 1.4, dt)) {
        this.patrolTarget = this.randomPatrolPoint();
        this.state = "idle";
        this.stateTime = 0;
      }
    } else if (this.state === "chase") {
      if (distance > 10) this.moveToward(playerPosition, 2.4, dt);
      if (!visible && distance > 36) {
        this.alerted = false;
        this.state = "patrol";
      }
    } else if (this.state === "attack") {
      this.attack(elapsed, distance);
      if (distance < 6.5) {
        const away = flat.clone().sub(playerPosition).normalize().multiplyScalar(6).add(flat);
        this.moveToward(away, 1.6, dt);
      }
    }
  }

  render(dt) {
    if (this.dead) {
      this.group.rotation.z = THREE.MathUtils.damp(this.group.rotation.z, Math.PI / 2, 7, dt);
      this.group.position.y = THREE.MathUtils.damp(this.group.position.y, 0.32, 7, dt);
      return;
    }
    this.group.position.x = THREE.MathUtils.damp(this.group.position.x, this.logical.x, 18, dt);
    this.group.position.y = THREE.MathUtils.damp(this.group.position.y, this.logical.y, 18, dt);
    this.group.position.z = THREE.MathUtils.damp(this.group.position.z, this.logical.z, 18, dt);
    let delta = this.targetYaw - this.group.rotation.y;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.group.rotation.y += delta * (1 - Math.exp(-11 * dt));
  }

  dispose() {
    this.group.traverse((object) => {
      object.geometry?.dispose();
      object.material?.dispose();
    });
    this.context.scene.remove(this.group);
  }
}

export class BotManager {
  constructor(scene, player, colliders, effects, callbacks = {}) {
    this.context = {
      scene,
      player,
      colliders,
      effects,
      onDeath: (bot, headshot) => {
        callbacks.onKill?.(bot, headshot);
        callbacks.onCountChange?.(this.aliveCount);
      },
    };
    this.callbacks = callbacks;
    this.bots = [];
  }

  spawn(spawnPoints, count) {
    this.clear();
    const available = [...spawnPoints];
    for (let i = 0; i < count && available.length; i++) {
      const index = Math.floor(Math.random() * available.length);
      const [spawn] = available.splice(index, 1);
      this.bots.push(new Bot(this.context, spawn.clone().setY(0)));
    }
    this.callbacks.onCountChange?.(this.aliveCount);
  }

  clear() {
    for (const bot of this.bots) bot.dispose();
    this.bots = [];
  }

  get aliveCount() {
    return this.bots.filter((bot) => !bot.dead).length;
  }

  get targets() {
    return this.bots.flatMap((bot) => (bot.dead ? [] : bot.hitMeshes));
  }

  alertNearby(position, radius = 26) {
    const point = new THREE.Vector3(position.x, 0, position.z);
    for (const bot of this.bots) {
      if (new THREE.Vector3(bot.logical.x, 0, bot.logical.z).distanceTo(point) < radius) bot.alert();
    }
  }

  stepFixed(dt, elapsed) {
    for (const bot of this.bots) bot.stepFixed(dt, elapsed);
  }

  render(dt) {
    for (const bot of this.bots) bot.render(dt);
  }
}
