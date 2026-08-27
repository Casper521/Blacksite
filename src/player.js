import * as THREE from "three";
import * as CANNON from "cannon-es";

const UP = new THREE.Vector3(0, 1, 0);
const STAND_EYE = 1.55;
const CROUCH_EYE = 0.95;
const LOOK_SENSITIVITY = 0.0022;
const JUMP_SPEED = 9.4;
const COYOTE_TIME = 0.14;
const JUMP_BUFFER = 0.16;
const STEP_HEIGHT = 0.55;

class PointerLock {
  constructor(element) {
    this.domElement = element;
    this.isLocked = false;
    this.listeners = { lock: [], unlock: [] };
    document.addEventListener("pointerlockchange", () => {
      const locked = document.pointerLockElement === this.domElement;
      if (locked === this.isLocked) return;
      this.isLocked = locked;
      for (const listener of this.listeners[locked ? "lock" : "unlock"]) listener();
    });
  }

  addEventListener(type, listener) {
    this.listeners[type]?.push(listener);
  }

  unlock() {
    if (document.pointerLockElement === this.domElement) document.exitPointerLock();
  }
}

export class Player {
  constructor(camera, canvas, world, callbacks = {}) {
    this.camera = camera;
    this.world = world;
    this.callbacks = callbacks;
    this.controls = new PointerLock(canvas);
    this.keys = new Set();
    this.maxHealth = 100;
    this.speedMultiplier = 1;
    this.health = this.maxHealth;
    this.alive = true;
    this.grounded = false;
    this.crouching = false;
    this.sprinting = false;
    this.moving = false;
    this.bobTime = 0;
    this.eyeHeight = STAND_EYE;
    this.yaw = 0;
    this.pitch = 0;
    this.mouseDelta = new THREE.Vector2();
    this.velocity = new THREE.Vector3();
    this.previous = new THREE.Vector3(0, 1.05, 28);
    this.current = new THREE.Vector3(0, 1.05, 28);
    this.bobOffset = new THREE.Vector2();
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.rayResult = new CANNON.RaycastResult();
    this.camera.rotation.order = "YXZ";
    this.camera.up.set(0, 1, 0);

    this.body = new CANNON.Body({
      mass: 78,
      shape: new CANNON.Box(new CANNON.Vec3(0.35, 0.9, 0.35)),
      position: new CANNON.Vec3(0, 1.05, 28),
      linearDamping: 0.12,
      fixedRotation: true,
      material: new CANNON.Material({ friction: 0 }),
      collisionFilterGroup: 2,
      collisionFilterMask: 1,
    });
    this.body.allowSleep = false;
    this.body.updateMassProperties();
    world.addBody(this.body);

    this.onKeyDown = (event) => {
      this.keys.add(event.code);
      if (event.code === "Space") {
        event.preventDefault();
        this.jumpBuffer = JUMP_BUFFER;
      }
    };
    this.onKeyUp = (event) => this.keys.delete(event.code);
    this.onMouseMove = (event) => {
      if (!this.controls.isLocked) return;
      this.mouseDelta.x += event.movementX;
      this.mouseDelta.y += event.movementY;
      this.yaw -= event.movementX * LOOK_SENSITIVITY;
      this.pitch -= event.movementY * LOOK_SENSITIVITY;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI / 2 + 0.04, Math.PI / 2 - 0.04);
      this.applyLook();
    };
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("mousemove", this.onMouseMove);
  }

  get position() {
    return this.body.position;
  }

  applyLook() {
    this.camera.up.set(0, 1, 0);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  teleport(position) {
    this.body.position.set(position.x, position.y, position.z);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.previous.set(position.x, position.y, position.z);
    this.current.copy(this.previous);
  }

  setStats({ maxHealth, speedMultiplier }) {
    this.maxHealth = maxHealth;
    this.speedMultiplier = speedMultiplier;
    this.health = Math.min(this.health, this.maxHealth);
  }

  reset(spawn) {
    this.health = this.maxHealth;
    this.alive = true;
    this.keys.clear();
    this.yaw = 0;
    this.pitch = 0;
    this.applyLook();
    this.teleport(spawn ?? new THREE.Vector3(0, 1.05, 28));
  }

  lock() {
    const element = this.controls.domElement;
    try {
      const request = element.requestPointerLock();
      if (request?.catch) request.catch(() => this.callbacks.onLockBlocked?.());
    } catch {
      this.callbacks.onLockBlocked?.();
    }
  }

  applyDamage(amount, source) {
    if (!this.alive) return;
    this.health = Math.max(0, this.health - amount);
    this.callbacks.onDamage?.(this.health, amount);
    if (this.health === 0) {
      this.alive = false;
      this.callbacks.onDeath?.(source);
    }
  }

  applyRecoil(pitch, yaw) {
    this.pitch = THREE.MathUtils.clamp(this.pitch - pitch, -Math.PI / 2 + 0.04, Math.PI / 2 - 0.04);
    this.yaw += yaw;
    this.applyLook();
  }

  raycast(from, to) {
    this.rayResult.reset();
    this.world.raycastClosest(from, to, { skipBackfaces: true, collisionFilterMask: 1 }, this.rayResult);
    return this.rayResult.hasHit;
  }

  probeGround() {
    const { x, y, z } = this.body.position;
    const hit = this.raycast(new CANNON.Vec3(x, y, z), new CANNON.Vec3(x, y - 1.15, z));
    return hit && this.rayResult.distance <= 1.1 && this.body.velocity.y <= 3;
  }

  tryStep() {
    if (!this.moving && Math.hypot(this.body.velocity.x, this.body.velocity.z) < 0.8) return;
    const { x, y, z } = this.body.position;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const ox = x + fx * 0.28;
    const oz = z + fz * 0.28;
    const blocked = this.raycast(
      new CANNON.Vec3(ox, y - 0.45, oz),
      new CANNON.Vec3(ox + fx * 0.55, y - 0.45, oz + fz * 0.55)
    );
    const headroom = !this.raycast(
      new CANNON.Vec3(ox, y + STEP_HEIGHT, oz),
      new CANNON.Vec3(ox + fx * 0.7, y + STEP_HEIGHT, oz + fz * 0.7)
    );
    if (blocked && headroom && this.coyote > 0) {
      this.body.position.y += STEP_HEIGHT * 0.4;
      this.body.velocity.y = Math.max(this.body.velocity.y, 3.4);
    }
  }

  stepFixed(dt) {
    this.previous.copy(this.current);

    const contactGround = this.world.contacts.some((contact) => {
      const involvesPlayer = contact.bi === this.body || contact.bj === this.body;
      if (!involvesPlayer) return false;
      const normalY = contact.bi === this.body ? -contact.ni.y : contact.ni.y;
      return normalY > 0.5;
    });
    this.grounded = this.probeGround() || contactGround;

    if (this.grounded) this.coyote = COYOTE_TIME;
    else this.coyote -= dt;
    this.jumpBuffer -= dt;

    if (!this.alive) {
      this.body.velocity.x *= 0.85;
      this.body.velocity.z *= 0.85;
      this.current.set(this.body.position.x, this.body.position.y, this.body.position.z);
      return;
    }

    if (this.keys.has("Space")) this.jumpBuffer = JUMP_BUFFER;
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.body.velocity.y = JUMP_SPEED;
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.grounded = false;
    }

    this.crouching = this.keys.has("KeyC") || this.keys.has("ControlLeft") || this.keys.has("ControlRight");
    const wantsSprint = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const input = new THREE.Vector2(
      Number(this.keys.has("KeyD")) - Number(this.keys.has("KeyA")),
      Number(this.keys.has("KeyW")) - Number(this.keys.has("KeyS"))
    );
    this.moving = input.lengthSq() > 0;
    if (this.moving) input.normalize();
    this.sprinting = wantsSprint && input.y > 0.3 && !this.crouching && this.moving;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, UP).normalize();
    const desired = forward.multiplyScalar(input.y).add(right.multiplyScalar(input.x));
    const maxSpeed = (this.crouching ? 2.4 : this.sprinting ? 8.7 : 5.1) * this.speedMultiplier;
    desired.multiplyScalar(maxSpeed);

    const accel = this.grounded ? (this.moving ? 14 : 10) : 3.2;
    const blend = 1 - Math.exp(-accel * dt);
    this.body.velocity.x = THREE.MathUtils.lerp(this.body.velocity.x, desired.x, blend);
    this.body.velocity.z = THREE.MathUtils.lerp(this.body.velocity.z, desired.z, blend);
    this.tryStep();

    const horizontalSpeed = Math.hypot(this.body.velocity.x, this.body.velocity.z);
    const stepping = this.grounded && horizontalSpeed > 0.25;
    if (stepping) this.bobTime += dt * (this.sprinting ? 13.5 : this.crouching ? 6.5 : 9.5);
    const amplitude = stepping ? (this.sprinting ? 0.055 : this.crouching ? 0.018 : 0.035) : 0;
    this.bobOffset.set(Math.sin(this.bobTime * 0.5) * amplitude * 0.65, Math.abs(Math.sin(this.bobTime)) * amplitude);
    this.eyeHeight = THREE.MathUtils.damp(this.eyeHeight, this.crouching ? CROUCH_EYE : STAND_EYE, 11, dt);

    this.velocity.set(this.body.velocity.x, this.body.velocity.y, this.body.velocity.z);
    this.current.set(this.body.position.x, this.body.position.y, this.body.position.z);
  }

  render(alpha, dt) {
    const x = THREE.MathUtils.lerp(this.previous.x, this.current.x, alpha);
    const y = THREE.MathUtils.lerp(this.previous.y, this.current.y, alpha);
    const z = THREE.MathUtils.lerp(this.previous.z, this.current.z, alpha);
    this.camera.position.set(x + this.bobOffset.x, y - 0.9 + this.eyeHeight + this.bobOffset.y, z);
    this.applyLook();
    this.mouseDelta.multiplyScalar(Math.exp(-15 * dt));
  }

  dispose() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("mousemove", this.onMouseMove);
  }
}
