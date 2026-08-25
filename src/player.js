import * as THREE from "three";
import * as CANNON from "cannon-es";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const UP = new THREE.Vector3(0, 1, 0);
const STAND_EYE = 1.55;
const CROUCH_EYE = 0.95;

export class Player {
  constructor(camera, canvas, world, callbacks = {}) {
    this.camera = camera;
    this.world = world;
    this.callbacks = callbacks;
    this.controls = new PointerLockControls(camera, canvas);
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
    this.mouseDelta = new THREE.Vector2();
    this.velocity = new THREE.Vector3();
    this.previous = new THREE.Vector3(0, 1.05, 28);
    this.current = new THREE.Vector3(0, 1.05, 28);
    this.bobOffset = new THREE.Vector2();

    this.body = new CANNON.Body({
      mass: 78,
      shape: new CANNON.Box(new CANNON.Vec3(0.35, 0.9, 0.35)),
      position: new CANNON.Vec3(0, 1.05, 28),
      linearDamping: 0.12,
      fixedRotation: true,
      material: new CANNON.Material({ friction: 0 }),
    });
    this.body.allowSleep = false;
    this.body.updateMassProperties();
    world.addBody(this.body);

    this.onKeyDown = (event) => {
      this.keys.add(event.code);
      if (event.code === "Space") {
        event.preventDefault();
        if (this.grounded && this.alive) this.body.velocity.y = 6.3;
      }
    };
    this.onKeyUp = (event) => this.keys.delete(event.code);
    this.onMouseMove = (event) => {
      if (this.controls.isLocked) {
        this.mouseDelta.x += event.movementX;
        this.mouseDelta.y += event.movementY;
      }
    };
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("mousemove", this.onMouseMove);
  }

  get position() {
    return this.body.position;
  }

  get yaw() {
    return this.camera.rotation.y;
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
    this.camera.rotation.set(0, 0, 0);
    this.teleport(spawn ?? new THREE.Vector3(0, 1.05, 28));
  }

  lock() {
    // Browsers reject pointer lock outside a user gesture, so surface it instead of stalling.
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

  applyRecoil(pitch, yaw, roll) {
    this.camera.rotation.x = THREE.MathUtils.clamp(this.camera.rotation.x - pitch, -Math.PI / 2, Math.PI / 2);
    this.camera.rotation.y += yaw;
    this.camera.rotation.z += roll;
  }

  stepFixed(dt) {
    this.previous.copy(this.current);

    this.grounded = this.world.contacts.some((contact) => {
      const involvesPlayer = contact.bi === this.body || contact.bj === this.body;
      return involvesPlayer && Math.abs(contact.ni.y) > 0.55;
    });

    if (!this.alive) {
      this.body.velocity.x *= 0.85;
      this.body.velocity.z *= 0.85;
      this.current.set(this.body.position.x, this.body.position.y, this.body.position.z);
      return;
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
    this.camera.rotation.z *= Math.exp(-12 * dt);
    this.mouseDelta.multiplyScalar(Math.exp(-15 * dt));
  }

  dispose() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("mousemove", this.onMouseMove);
  }
}
