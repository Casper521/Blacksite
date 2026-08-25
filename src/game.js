import * as THREE from "three";
import * as CANNON from "cannon-es";
import { Arena } from "./arena.js";
import { Player } from "./player.js";
import { Weapon } from "./weapon.js";
import { BotManager } from "./bots.js";
import { Effects } from "./effects.js";
import { HUD } from "./hud.js";
import { NetClient } from "./net.js";
import { RemotePlayers } from "./remote.js";
import { GEM_REWARDS, SLOTS, getSkin, getWeapon } from "./catalog.js";
import { applyWeaponUpgrades, operatorStats } from "./upgrades.js";
import { randomSeed } from "./rng.js";
import { playExplosion, playGunshot } from "./audio.js";
import { Music } from "./music.js";

const FIXED_STEP = 1 / 60;
const MAX_STEPS = 5;
const RESPAWN_DELAY = 3.5;
const CAMPAIGN_BOTS = 9;

export class Game {
  constructor(canvas, profile, callbacks = {}) {
    this.canvas = canvas;
    this.profile = profile;
    this.callbacks = callbacks;
    this.mode = "campaign";
    this.running = false;
    this.started = false;
    this.finished = false;
    this.elapsed = 0;
    this.accumulator = 0;
    this.respawnCountdown = 0;
    this.lastAttacker = null;
    this.sessionGems = 0;
    this.sessionKills = 0;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 260);
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.hemi = new THREE.HemisphereLight(0xb8cdbf, 0x1a201b, 1.05);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.32);
    this.scene.add(this.hemi, this.ambient);
    this.sun = new THREE.DirectionalLight(0xffe6bd, 3.2);
    this.sun.position.set(-32, 48, 22);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 140;
    this.sun.shadow.camera.left = -56;
    this.sun.shadow.camera.right = 56;
    this.sun.shadow.camera.top = 56;
    this.sun.shadow.camera.bottom = -56;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);

    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) });
    this.world.defaultContactMaterial.friction = 0;
    this.world.defaultContactMaterial.restitution = 0;
    this.world.solver.iterations = 10;

    this.arena = new Arena(this.scene, this.world);
    this.effects = new Effects(this.scene);
    this.hud = new HUD();
    this.remotes = new RemotePlayers(this.scene);

    this.music = new Music();
    this.music.setEnabled(profile.settings.music);
    this.music.setVolume(profile.settings.musicVolume);

    this.player = new Player(this.camera, this.canvas, this.world, {
      onDamage: (health) => this.hud.health(health, this.player.maxHealth),
      onDeath: () => this.handlePlayerDeath(),
      onLockBlocked: () => this.callbacks.onLockBlocked?.(),
    });

    this.bots = new BotManager(this.scene, this.player, () => this.arena.colliders, this.effects, {
      onCountChange: (count) => this.updateObjective(count),
      onKill: (bot, headshot) => this.rewardKill(headshot),
    });

    this.weapon = new Weapon(this.camera, this.player, this.effects, {
      getTargets: () => [...this.arena.colliders, ...this.bots.targets, ...this.remotes.targets],
      onState: (weapon) => this.hud.ammo(weapon),
      onImpact: (hit, damage, headshot) => this.handleImpact(hit, damage, headshot),
      onFire: (position) => this.handleFire(position),
      onThrow: (payload) => this.spawnGrenade(payload),
    });
    this.grenades = [];

    this.net = new NetClient({
      onStatus: (status) => this.hud.netStatus(status === "online" ? "online" : status),
      onJoined: (player) => {
        this.remotes.add(player);
        this.hud.feed(`${player.name} JOINED THE MATCH`);
        this.reportOperators();
      },
      onLeft: (id) => {
        const player = this.remotes.find(id);
        if (player) this.hud.feed(`${player.name} LEFT THE MATCH`);
        this.remotes.remove(id);
        this.reportOperators();
      },
      onSnapshot: (players) => this.remotes.applySnapshot(players, this.net.id),
      onShot: (message) => this.handleRemoteShot(message),
      onDamaged: (message) => this.handleRemoteDamage(message),
      onKill: (message) => this.handleRemoteKill(message),
      onMatchEnd: (message) => this.handleMatchEnd(message),
      onRound: (message) => this.handleRoundReset(message),
      onClose: () => {
        if (this.mode === "pvp" && this.running) this.hud.netStatus("offline", "RELAY LOST");
      },
    });

    this.clock = new THREE.Clock();
    this.player.controls.addEventListener("lock", () => {
      if (this.started && !this.finished) {
        this.running = true;
        this.clock.getDelta();
        this.accumulator = 0;
        this.callbacks.onResume?.();
      }
    });
    this.player.controls.addEventListener("unlock", () => {
      this.weapon.trigger = false;
      this.weapon.aiming = false;
      if (this.started && !this.finished) {
        this.running = false;
        this.callbacks.onPause?.();
      }
    });

    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.hud.gems(this.profile.gems);
    this.animate();
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  applyTheme(theme) {
    this.scene.background = new THREE.Color(theme.sky);
    this.scene.fog = new THREE.FogExp2(theme.fog, theme.fogDensity);
    this.hemi.color.setHex(theme.hemiSky);
    this.hemi.groundColor.setHex(theme.hemiGround);
    this.hemi.intensity = theme.hemiIntensity ?? 1.1;
    this.ambient.intensity = theme.ambient ?? 0.32;
    this.sun.color.setHex(theme.sun);
    this.sun.intensity = theme.sunIntensity;
  }

  buildWorld(seed) {
    const { theme, spawnPoints } = this.arena.build(seed);
    this.applyTheme(theme);
    this.spawnPoints = spawnPoints;
    this.callbacks.onSector?.(theme.name);
    return theme;
  }

  randomSpawn() {
    const points = this.spawnPoints?.length ? this.spawnPoints : [new THREE.Vector3(0, 1.05, 28)];
    return points[Math.floor(Math.random() * points.length)].clone().setY(1.05);
  }

  displayName() {
    return this.profile.data.callsign || "OPERATOR";
  }

  equipLoadout() {
    const operator = this.profile.operatorLevels();
    const specs = {};
    for (const slot of SLOTS) {
      const base = getWeapon(this.profile.equippedIn(slot.id));
      specs[slot.id] = applyWeaponUpgrades(base, this.profile.weaponLevels(base.id), operator);
    }
    this.weapon.setLoadout(specs, getSkin(this.profile.data.equippedSkin), this.profile.data.activeSlot ?? "rifle");
    this.player.setStats(operatorStats(operator));
  }

  // Kept synchronous for the campaign so pointer lock still runs inside the click gesture.
  start(mode) {
    this.mode = mode;
    this.started = true;
    this.finished = false;
    this.running = false;
    this.elapsed = 0;
    this.accumulator = 0;
    this.sessionGems = 0;
    this.sessionKills = 0;
    this.respawnCountdown = 0;
    this.lastAttacker = null;
    this.hud.setMode(mode);
    this.hud.setOperator(this.displayName());
    this.hud.respawn(null);
    this.hud.gems(this.profile.gems);
    this.equipLoadout();
    this.weapon.enabled = true;
    this.remotes.clear();
    for (const nade of this.grenades) {
      this.scene.remove(nade.mesh);
      nade.mesh.geometry.dispose();
      nade.mesh.material.dispose();
    }
    this.grenades = [];
    this.music.setState("patrol");

    if (mode === "pvp") return this.startOnline();

    this.net.disconnect();
    this.buildWorld(randomSeed());
    this.bots.spawn(this.spawnPoints, CAMPAIGN_BOTS);
    this.player.reset(this.randomSpawn());
    this.hud.health(this.player.health, this.player.maxHealth);
    this.player.lock();
    return Promise.resolve({ gated: false });
  }

  async startOnline() {
    this.hud.netStatus("connecting", `CONNECTING AS ${this.displayName()}`);
    const welcome = await this.net.connect({
      name: this.displayName(),
      weapon: this.profile.equippedIn("rifle"),
      skin: this.profile.data.equippedSkin,
    });
    this.buildWorld(welcome.seed);
    for (const peer of welcome.players) this.remotes.add(peer);
    this.reportOperators();
    this.hud.setScoreboard(
      [...welcome.players, { id: this.net.id, name: this.displayName(), score: 0 }],
      this.net.id,
      this.net.killLimit
    );
    this.bots.clear();
    this.updateObjective(0);
    this.player.reset(this.randomSpawn());
    this.hud.health(this.player.health, this.player.maxHealth);
    // The relay handshake consumes the click activation, so the player re-enters through a gate.
    return { gated: true, operators: welcome.players.length + 1 };
  }

  reportOperators() {
    if (this.mode !== "pvp" || !this.net.connected) return;
    const count = this.remotes.players.size + 1;
    this.hud.netStatus("online", `${this.displayName()} · RELAY ONLINE · ${count} OPERATOR${count === 1 ? "" : "S"}`);
  }

  resume() {
    if (!this.finished) this.player.lock();
  }

  end(victory, summary) {
    if (this.finished) return;
    this.finished = true;
    this.running = false;
    this.weapon.trigger = false;
    this.weapon.enabled = false;
    if (this.mode === "campaign" && victory) {
      this.awardGems(GEM_REWARDS.victory, "MISSION BONUS");
      this.profile.registerMission();
    }
    this.net.disconnect();
    this.music.setState("lobby");
    this.player.controls.unlock();
    this.callbacks.onEnd?.({
      victory,
      summary,
      gems: this.sessionGems,
      kills: this.sessionKills,
      mode: this.mode,
    });
  }

  awardGems(amount, label) {
    this.sessionGems += amount;
    this.hud.gems(this.profile.award(amount));
    this.hud.gemGain(amount, label ?? "GEMS");
  }

  rewardKill(headshot) {
    this.sessionKills += 1;
    this.profile.registerKill();
    const reward = GEM_REWARDS.kill + (headshot ? GEM_REWARDS.headshot : 0);
    this.awardGems(reward, headshot ? "HEADSHOT" : "GEMS");
    this.hud.feed(headshot ? "HOSTILE DOWN · HEADSHOT" : "HOSTILE DOWN", "good");
  }

  updateObjective(remaining) {
    if (this.mode === "pvp") {
      this.hud.objective("TEAM DEATHMATCH", `<b>${this.sessionKills}</b> ELIMINATIONS`);
      return;
    }
    this.hud.objective("ELIMINATE HOSTILES", `<b>${remaining}</b> REMAINING`);
    if (this.running && remaining === 0) this.end(true, "All hostile forces have been neutralized.");
  }

  handleFire(position) {
    if (this.mode === "campaign") {
      this.bots.alertNearby(position);
      return;
    }
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.net.sendShot(origin, origin.clone().addScaledVector(forward, this.weapon.spec.range * 0.6));
  }

  handleImpact(hit, damage, headshot) {
    const scaled = headshot ? damage * 1.75 : damage;
    const bot = hit.object.userData.bot;
    if (bot) {
      bot.takeDamage(scaled, headshot);
      this.hud.hit(headshot);
      return;
    }
    const remoteId = hit.object.userData.remoteId;
    if (remoteId) {
      this.net.sendHit(remoteId, scaled, headshot);
      this.hud.hit(headshot);
      return;
    }
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    this.effects.impact(hit.point, normal, hit.object.userData.surface);
  }

  spawnGrenade({ origin, velocity, damage, radius, fuse }) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x3a4a32, roughness: 0.55, metalness: 0.45 })
    );
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.grenades.push({
      mesh,
      velocity: velocity.clone(),
      damage,
      radius,
      life: fuse,
      ray: new THREE.Raycaster(),
    });
  }

  explodeGrenade(nade) {
    const point = nade.mesh.position.clone();
    this.scene.remove(nade.mesh);
    nade.mesh.geometry.dispose();
    nade.mesh.material.dispose();
    this.effects.explosion(point);
    playExplosion();

    for (const bot of this.bots.bots) {
      if (bot.dead) continue;
      const distance = bot.group.position.distanceTo(point);
      if (distance >= nade.radius) continue;
      bot.takeDamage(nade.damage * (1 - distance / nade.radius), false);
      this.hud.hit(false);
    }
    for (const remote of this.remotes.players.values()) {
      if (!remote.alive) continue;
      const distance = remote.group.position.distanceTo(point);
      if (distance >= nade.radius) continue;
      this.net.sendHit(remote.id, nade.damage * (1 - distance / nade.radius), false);
      this.hud.hit(false);
    }
  }

  updateGrenades(dt) {
    for (let index = this.grenades.length - 1; index >= 0; index--) {
      const nade = this.grenades[index];
      nade.life -= dt;
      nade.velocity.y -= 18 * dt;
      const move = nade.velocity.clone().multiplyScalar(dt);
      const length = move.length() || 0.001;
      nade.ray.set(nade.mesh.position.clone(), move.clone().normalize());
      nade.ray.far = length + 0.04;
      const hits = nade.ray.intersectObjects(this.arena.colliders, true);
      if (hits[0]) {
        nade.mesh.position.copy(hits[0].point);
        if (nade.life < 0.15) {
          this.explodeGrenade(nade);
          this.grenades.splice(index, 1);
          continue;
        }
        const normal = hits[0].face.normal.clone().transformDirection(hits[0].object.matrixWorld);
        nade.velocity.reflect(normal).multiplyScalar(0.38);
        nade.mesh.position.addScaledVector(normal, 0.08);
      } else {
        nade.mesh.position.add(move);
      }
      if (nade.life <= 0) {
        this.explodeGrenade(nade);
        this.grenades.splice(index, 1);
      }
    }
  }

  handleRemoteShot(message) {
    const origin = new THREE.Vector3(...message.o);
    const end = new THREE.Vector3(...message.e);
    this.effects.tracer(origin, end, true);
    if (origin.distanceTo(this.camera.position) < 55) playGunshot(true);
  }

  handleRemoteDamage(message) {
    this.lastAttacker = message.by;
    this.player.applyDamage(message.d, message.by);
  }

  handleRemoteKill(message) {
    if (message.killer === this.net.id) {
      this.sessionKills += 1;
      this.profile.registerKill();
      this.awardGems(GEM_REWARDS.pvpKill, "ELIMINATION");
      this.updateObjective(0);
    }
    this.hud.feed(`${message.killerName} ▸ ${message.victimName}`, message.killer === this.net.id ? "good" : "neutral");
    this.hud.setScoreboard(message.players, this.net.id, this.net.killLimit);
  }

  handleMatchEnd(message) {
    const victory = message.winner === this.net.id;
    this.end(victory, victory ? "You topped the scoreboard." : `${message.winnerName} reached the elimination limit first.`);
  }

  handleRoundReset(message) {
    this.buildWorld(message.seed);
    this.player.reset(this.randomSpawn());
    this.hud.health(this.player.health, this.player.maxHealth);
    this.hud.setScoreboard(message.players, this.net.id, this.net.killLimit);
    this.hud.feed("NEW SECTOR DEPLOYED");
  }

  handlePlayerDeath() {
    if (this.mode === "campaign") {
      this.end(false, "The task force lost contact with your unit.");
      return;
    }
    this.net.sendDeath(this.lastAttacker);
    this.respawnCountdown = RESPAWN_DELAY;
    this.weapon.enabled = false;
    this.weapon.trigger = false;
  }

  respawnPlayer() {
    const spawn = this.randomSpawn();
    this.player.reset(spawn);
    this.weapon.enabled = true;
    this.weapon.refill();
    this.hud.health(this.player.health, this.player.maxHealth);
    this.hud.respawn(null);
    this.lastAttacker = null;
    this.net.sendRespawn(spawn);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const frame = Math.min(this.clock.getDelta(), 0.25);

    if (this.running) {
      this.accumulator += frame;
      let steps = 0;
      while (this.accumulator >= FIXED_STEP && steps < MAX_STEPS) {
        this.stepFixed(FIXED_STEP);
        this.accumulator -= FIXED_STEP;
        steps += 1;
      }
      if (steps === MAX_STEPS) this.accumulator = 0;
      this.render(frame, this.accumulator / FIXED_STEP);
    }

    this.renderer.render(this.scene, this.camera);
  }

  // Music intensity tracks how close and how alert the nearest threat is.
  updateMusicThreat() {
    if (!this.player.alive) {
      this.music.setThreat(0.15);
      return;
    }
    const origin = this.camera.position;
    let threat = 0;
    if (this.mode === "campaign") {
      for (const bot of this.bots.bots) {
        if (bot.state === "dead") continue;
        const distance = bot.group.position.distanceTo(origin);
        const engaged = bot.state === "chase" || bot.state === "attack";
        threat = Math.max(threat, (engaged ? 1 : 0.5) * Math.max(0, 1 - distance / 45));
      }
    } else {
      for (const remote of this.remotes.players.values()) {
        const distance = remote.group.position.distanceTo(origin);
        threat = Math.max(threat, Math.max(0, 1 - distance / 55));
      }
      threat = Math.max(threat, 0.4);
    }
    this.music.setThreat(threat);
  }

  stepFixed(dt) {
    this.elapsed += dt;
    this.player.stepFixed(dt);
    this.world.step(dt);
    this.bots.stepFixed(dt, this.elapsed);
    this.updateGrenades(dt);
    this.threatTimer = (this.threatTimer ?? 0) + dt;
    if (this.threatTimer > 0.3) {
      this.threatTimer = 0;
      this.updateMusicThreat();
    }

    if (this.mode === "pvp") {
      this.net.sendState(this.elapsed, this.player);
      if (this.respawnCountdown > 0) {
        this.respawnCountdown -= dt;
        this.hud.respawn(Math.max(0, this.respawnCountdown));
        if (this.respawnCountdown <= 0) this.respawnPlayer();
      }
    }
  }

  render(dt, alpha) {
    this.player.render(alpha, dt);
    this.weapon.update(dt, this.elapsed);
    this.bots.render(dt);
    this.remotes.render(dt);
    this.effects.update(dt);
    this.hud.update(dt, this.player, this.weapon);
  }
}
