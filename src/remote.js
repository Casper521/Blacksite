import * as THREE from "three";
import { createSoldier } from "./bots.js";

const TEAM_COLORS = [
  { uniform: 0x35506b, vest: 0x1f2c3a, accent: 0x4fd6ff },
  { uniform: 0x5c3a5f, vest: 0x2e1f30, accent: 0xff3ea5 },
  { uniform: 0x3f5c3a, vest: 0x22301f, accent: 0x9bff5f },
  { uniform: 0x6b5433, vest: 0x352a1c, accent: 0xffc46b },
];

function nameplate(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(6,9,10,0.55)";
  ctx.fillRect(0, 14, 256, 34);
  ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  ctx.fillRect(0, 14, 4, 34);
  ctx.font = "600 24px Inter, sans-serif";
  ctx.fillStyle = "#eef0e8";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 14, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(2.2, 0.55, 1);
  sprite.position.y = 2.25;
  return sprite;
}

class RemotePlayer {
  constructor(scene, profile, index) {
    this.id = profile.id;
    this.name = profile.name;
    this.score = profile.score ?? 0;
    this.alive = true;
    const palette = TEAM_COLORS[index % TEAM_COLORS.length];
    const model = createSoldier(palette);
    this.group = model.group;
    this.hitMeshes = model.hitMeshes;
    this.rifle = model.rifle;
    for (const mesh of this.hitMeshes) mesh.userData.remoteId = this.id;
    this.plate = nameplate(profile.name, palette.accent);
    this.group.add(this.plate);
    this.target = new THREE.Vector3();
    this.targetYaw = 0;
    this.crouching = false;
    scene.add(this.group);
    this.scene = scene;
  }

  applyState(state) {
    this.target.set(state.p[0], state.p[1] - 1.05, state.p[2]);
    this.targetYaw = state.y ?? 0;
    this.crouching = Boolean(state.c);
    const alive = state.a !== false;
    if (alive !== this.alive) {
      this.alive = alive;
      for (const mesh of this.hitMeshes) mesh.userData.remoteId = alive ? this.id : null;
    }
  }

  render(dt) {
    this.group.position.x = THREE.MathUtils.damp(this.group.position.x, this.target.x, 12, dt);
    this.group.position.y = THREE.MathUtils.damp(this.group.position.y, this.alive ? this.target.y : this.target.y - 0.55, 12, dt);
    this.group.position.z = THREE.MathUtils.damp(this.group.position.z, this.target.z, 12, dt);
    this.group.scale.y = THREE.MathUtils.damp(this.group.scale.y, this.crouching ? 0.68 : 1, 10, dt);
    this.group.rotation.z = THREE.MathUtils.damp(this.group.rotation.z, this.alive ? 0 : Math.PI / 2, 8, dt);

    // Yaw is sent as a camera rotation, so the body faces the opposite of the view axis.
    let delta = this.targetYaw + Math.PI - this.group.rotation.y;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.group.rotation.y += delta * (1 - Math.exp(-14 * dt));
    this.plate.visible = this.alive;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((object) => {
      object.geometry?.dispose();
      if (object.material) {
        object.material.map?.dispose();
        object.material.dispose();
      }
    });
  }
}

export class RemotePlayers {
  constructor(scene) {
    this.scene = scene;
    this.players = new Map();
    this.order = 0;
  }

  add(profile) {
    if (this.players.has(profile.id)) return;
    this.players.set(profile.id, new RemotePlayer(this.scene, profile, this.order++));
  }

  remove(id) {
    this.players.get(id)?.dispose();
    this.players.delete(id);
  }

  clear() {
    for (const player of this.players.values()) player.dispose();
    this.players.clear();
    this.order = 0;
  }

  applySnapshot(states, selfId) {
    for (const state of states) {
      if (state.id === selfId) continue;
      const player = this.players.get(state.id);
      if (player) player.applyState(state);
    }
  }

  get targets() {
    return [...this.players.values()].flatMap((player) => (player.alive ? player.hitMeshes : []));
  }

  find(id) {
    return this.players.get(id);
  }

  render(dt) {
    for (const player of this.players.values()) player.render(dt);
  }
}
