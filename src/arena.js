import * as THREE from "three";
import * as CANNON from "cannon-es";
import { createRng, intRange, pick, range } from "./rng.js";

export const THEMES = [
  {
    id: "sunset-docks",
    name: "SUNSET DOCKS",
    sky: 0x35211c,
    fog: 0x4a2a20,
    fogDensity: 0.0125,
    sun: 0xffb066,
    sunIntensity: 3.4,
    hemiIntensity: 1.15,
    ambient: 0.32,
    hemiSky: 0xffbf8a,
    hemiGround: 0x2a1a16,
    ground: 0x7c6a5c,
    facades: [0xc4674a, 0xe0a05c, 0xa8543e, 0xdcc59a, 0x8c6f52],
    accents: [0xffd166, 0xff7043, 0xffe0b2],
    neon: [0xff7b3d, 0xffc46b, 0xff4f6d],
    glass: 0xffd9a0,
  },
  {
    id: "neon-district",
    name: "NEON DISTRICT",
    sky: 0x0e0b1f,
    fog: 0x150f2b,
    fogDensity: 0.019,
    sun: 0x8f9dff,
    sunIntensity: 2.4,
    hemiIntensity: 1.9,
    ambient: 0.72,
    hemiSky: 0x8f7bff,
    hemiGround: 0x241c42,
    ground: 0x2c2a3d,
    facades: [0x2a2542, 0x3b2c58, 0x1f2b47, 0x442a55, 0x262c4d],
    accents: [0xff3ea5, 0x27e5ff, 0xb14dff],
    neon: [0xff2fa0, 0x22e8ff, 0xa855f7, 0x39ff88],
    glass: 0x7be6ff,
  },
  {
    id: "verdant-ruins",
    name: "VERDANT RUINS",
    sky: 0x1d2a1d,
    fog: 0x27351f,
    fogDensity: 0.0155,
    sun: 0xffe9b0,
    sunIntensity: 3.1,
    hemiIntensity: 1.25,
    ambient: 0.34,
    hemiSky: 0xc9e6a8,
    hemiGround: 0x1b2416,
    ground: 0x6d7a52,
    facades: [0x8fa46a, 0xc9c6a2, 0x6f8455, 0xa8b482, 0x54663f],
    accents: [0xf2e8c9, 0x9bd45f, 0xe8c07d],
    neon: [0x9bff5f, 0xf5e17a, 0x5fd0ff],
    glass: 0xcbe9b8,
  },
  {
    id: "cobalt-yard",
    name: "COBALT YARD",
    sky: 0x101c2a,
    fog: 0x16283a,
    fogDensity: 0.0145,
    sun: 0xd8ecff,
    sunIntensity: 3.3,
    hemiIntensity: 1.3,
    ambient: 0.36,
    hemiSky: 0x9fd0ff,
    hemiGround: 0x111c26,
    ground: 0x5f6f7d,
    facades: [0x3f6d94, 0x6f9dc0, 0x2f4f6d, 0xa9c6d8, 0x4c7a99],
    accents: [0xffd23f, 0x4fd6ff, 0xf1f7fb],
    neon: [0x3fd0ff, 0xffd23f, 0xff6b6b],
    glass: 0xa5dcff,
  },
  {
    id: "crimson-foundry",
    name: "CRIMSON FOUNDRY",
    sky: 0x241012,
    fog: 0x30171a,
    fogDensity: 0.017,
    sun: 0xffc09a,
    sunIntensity: 2.9,
    hemiIntensity: 1.4,
    ambient: 0.44,
    hemiSky: 0xff9d8a,
    hemiGround: 0x2a1618,
    ground: 0x6b5250,
    facades: [0x8f3a34, 0xb5564a, 0x5f2b28, 0xd08a6a, 0x74403a],
    accents: [0xffb703, 0xff5c39, 0xffe9d0],
    neon: [0xff4d2e, 0xffb703, 0xff7ea8],
    glass: 0xffc7a3,
  },
];

function noiseTexture(base, fleck, density = 2200) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < density; i++) {
    ctx.globalAlpha = Math.random() * 0.16;
    ctx.fillStyle = fleck;
    const size = 1 + Math.random() * 4;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, size, size);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

function facadeTexture(rng, wallColor, glassColor) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = `#${wallColor.toString(16).padStart(6, "0")}`;
  ctx.fillRect(0, 0, 128, 256);
  const glass = `#${glassColor.toString(16).padStart(6, "0")}`;
  const columns = intRange(rng, 3, 5);
  const rows = intRange(rng, 7, 11);
  const cellWidth = 128 / columns;
  const cellHeight = 256 / rows;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const lit = rng() > 0.45;
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(column * cellWidth + 4, row * cellHeight + 5, cellWidth - 8, cellHeight - 12);
      ctx.globalAlpha = lit ? 0.95 : 0.32;
      ctx.fillStyle = lit ? glass : "#0d1113";
      ctx.fillRect(column * cellWidth + 6, row * cellHeight + 7, cellWidth - 12, cellHeight - 16);
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  return map;
}

export class Arena {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = [];
    this.bodies = [];
    this.spawnPoints = [];
    this.disposables = new Set();
    this.theme = THEMES[0];
    this.half = 48;
  }

  track(object) {
    if (object.geometry) this.disposables.add(object.geometry);
    if (object.material) this.disposables.add(object.material);
    return object;
  }

  box(position, size, material, options = {}) {
    const mesh = this.track(new THREE.Mesh(new THREE.BoxGeometry(...size), material));
    mesh.position.set(...position);
    mesh.castShadow = options.castShadow ?? true;
    mesh.receiveShadow = true;
    mesh.userData.surface = options.surface ?? "stone";
    if (options.rotation) mesh.rotation.y = options.rotation;
    this.group.add(mesh);

    if (options.solid !== false) {
      const body = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)),
      });
      body.position.set(...position);
      if (options.rotation) body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), options.rotation);
      this.world.addBody(body);
      this.bodies.push(body);
      this.colliders.push(mesh);
    } else {
      this.colliders.push(mesh);
    }
    return mesh;
  }

  cylinder(position, radiusTop, radiusBottom, height, material, options = {}) {
    const mesh = this.track(new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, options.segments ?? 12), material));
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.surface = options.surface ?? "metal";
    this.group.add(mesh);
    this.colliders.push(mesh);
    if (options.solid !== false) {
      // Boxes keep the static solver cheap; the visual cylinder hides the approximation.
      const radius = Math.max(radiusTop, radiusBottom);
      const body = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(radius * 0.85, height / 2, radius * 0.85)),
      });
      body.position.set(...position);
      this.world.addBody(body);
      this.bodies.push(body);
    }
    return mesh;
  }

  glow(color, position, intensity = 14, distance = 16) {
    const light = new THREE.PointLight(color, intensity, distance, 2);
    light.position.set(...position);
    this.group.add(light);
    return light;
  }

  material(options) {
    const material = new THREE.MeshStandardMaterial(options);
    this.disposables.add(material);
    return material;
  }

  dispose() {
    for (const body of this.bodies) this.world.removeBody(body);
    this.bodies = [];
    this.colliders = [];
    this.spawnPoints = [];
    this.group.clear();
    for (const resource of this.disposables) resource.dispose?.();
    this.disposables.clear();
  }

  build(seed) {
    this.dispose();
    const rng = createRng(seed);
    const theme = pick(rng, THEMES);
    this.theme = theme;
    const half = this.half;

    const groundMap = noiseTexture(`#${theme.ground.toString(16).padStart(6, "0")}`, "#ffffff", 2600);
    groundMap.repeat.set(26, 26);
    this.disposables.add(groundMap);
    const groundMaterial = this.material({ map: groundMap, roughness: 0.96, metalness: 0.04 });
    this.box([0, -0.5, 0], [half * 2, 1, half * 2], groundMaterial, { castShadow: false });

    const wallMaterial = this.material({ color: theme.facades[2], roughness: 0.85, metalness: 0.1 });
    this.box([0, 5, -half], [half * 2, 10, 1.2], wallMaterial);
    this.box([0, 5, half], [half * 2, 10, 1.2], wallMaterial);
    this.box([-half, 5, 0], [1.2, 10, half * 2], wallMaterial);
    this.box([half, 5, 0], [1.2, 10, half * 2], wallMaterial);

    this.paintGround(rng, theme);

    const cells = [];
    const step = 16;
    for (let x = -2; x <= 2; x++) {
      for (let z = -2; z <= 2; z++) {
        if (Math.abs(x) + Math.abs(z) === 0) continue;
        cells.push([x * step + range(rng, -2.5, 2.5), z * step + range(rng, -2.5, 2.5)]);
      }
    }

    const builders = [
      (x, z) => this.tower(rng, theme, x, z),
      (x, z) => this.shopfront(rng, theme, x, z),
      (x, z) => this.containerStack(rng, theme, x, z),
      (x, z) => this.billboard(rng, theme, x, z),
      (x, z) => this.waterTower(rng, theme, x, z),
      (x, z) => this.plaza(rng, theme, x, z),
    ];

    for (const [x, z] of cells) {
      if (rng() < 0.16) {
        this.spawnPoints.push(new THREE.Vector3(x, 1.05, z));
        continue;
      }
      pick(rng, builders)(x, z);
    }

    this.coverField(rng, theme);
    this.streetLights(rng, theme);

    const perimeter = [
      [0, half - 6], [0, -half + 6], [half - 6, 0], [-half + 6, 0],
      [half - 8, half - 8], [-half + 8, half - 8], [half - 8, -half + 8], [-half + 8, -half + 8],
    ];
    for (const [x, z] of perimeter) this.spawnPoints.push(new THREE.Vector3(x, 1.05, z));

    return { theme, colliders: this.colliders, spawnPoints: this.spawnPoints };
  }

  paintGround(rng, theme) {
    const laneColor = pick(rng, theme.accents);
    for (let i = 0; i < 26; i++) {
      const horizontal = rng() > 0.5;
      const length = range(rng, 6, 22);
      const material = new THREE.MeshBasicMaterial({
        color: rng() > 0.4 ? laneColor : pick(rng, theme.accents),
        transparent: true,
        opacity: range(rng, 0.16, 0.42),
        polygonOffset: true,
        polygonOffsetFactor: -3,
      });
      this.disposables.add(material);
      const geometry = new THREE.PlaneGeometry(horizontal ? length : 0.4, horizontal ? 0.4 : length);
      this.disposables.add(geometry);
      const mark = new THREE.Mesh(geometry, material);
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(range(rng, -40, 40), 0.014, range(rng, -40, 40));
      this.group.add(mark);
    }

    const padCount = intRange(rng, 3, 6);
    for (let i = 0; i < padCount; i++) {
      const size = range(rng, 8, 16);
      const material = new THREE.MeshBasicMaterial({
        color: pick(rng, theme.accents),
        transparent: true,
        opacity: 0.12,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      });
      this.disposables.add(material);
      const geometry = new THREE.CircleGeometry(size / 2, 24);
      this.disposables.add(geometry);
      const pad = new THREE.Mesh(geometry, material);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(range(rng, -36, 36), 0.013, range(rng, -36, 36));
      this.group.add(pad);
    }
  }

  tower(rng, theme, x, z) {
    const width = range(rng, 6, 11);
    const depth = range(rng, 6, 11);
    const height = range(rng, 7, 20);
    const wallColor = pick(rng, theme.facades);
    const map = facadeTexture(rng, wallColor, theme.glass);
    map.repeat.set(Math.max(1, Math.round(width / 4)), Math.max(1, Math.round(height / 5)));
    this.disposables.add(map);
    const material = this.material({ map, roughness: 0.82, metalness: 0.12 });
    this.box([x, height / 2, z], [width, height, depth], material);

    const trimColor = pick(rng, theme.accents);
    const trim = this.material({ color: trimColor, roughness: 0.55, metalness: 0.3, emissive: trimColor, emissiveIntensity: 0.25 });
    const bands = intRange(rng, 1, 3);
    for (let i = 0; i < bands; i++) {
      const y = height * ((i + 1) / (bands + 1));
      this.box([x, y, z], [width + 0.5, 0.42, depth + 0.5], trim, { solid: false });
    }

    const roofMaterial = this.material({ color: theme.facades[4], roughness: 0.7, metalness: 0.25 });
    this.box([x, height + 0.7, z], [width * 0.45, 1.4, depth * 0.45], roofMaterial);

    if (rng() > 0.45) {
      const neonColor = pick(rng, theme.neon);
      const signMaterial = this.material({
        color: neonColor,
        emissive: neonColor,
        emissiveIntensity: 2.6,
        roughness: 0.4,
      });
      const signHeight = range(rng, 2, 4.5);
      const facing = rng() > 0.5;
      this.box(
        [x + (facing ? width / 2 + 0.2 : 0), height * range(rng, 0.55, 0.85), z + (facing ? 0 : depth / 2 + 0.2)],
        facing ? [0.25, signHeight, depth * 0.5] : [width * 0.5, signHeight, 0.25],
        signMaterial,
        { solid: false }
      );
      this.glow(neonColor, [x + (facing ? width / 2 + 1.2 : 0), height * 0.7, z + (facing ? 0 : depth / 2 + 1.2)], 11, 15);
    }
  }

  shopfront(rng, theme, x, z) {
    const width = range(rng, 8, 13);
    const depth = range(rng, 5, 8);
    const height = range(rng, 3.6, 5.4);
    const bodyColor = pick(rng, theme.facades);
    const material = this.material({ color: bodyColor, roughness: 0.88, metalness: 0.06 });
    this.box([x, height / 2, z], [width, height, depth], material);

    const stripeCount = intRange(rng, 4, 7);
    const awningA = pick(rng, theme.accents);
    const awningB = pick(rng, theme.neon);
    for (let i = 0; i < stripeCount; i++) {
      const stripeMaterial = this.material({ color: i % 2 === 0 ? awningA : awningB, roughness: 0.6 });
      this.box(
        [x - width / 2 + (width / stripeCount) * (i + 0.5), height * 0.72, z + depth / 2 + 0.75],
        [width / stripeCount, 0.16, 1.6],
        stripeMaterial,
        { solid: false }
      );
    }

    const signColor = pick(rng, theme.neon);
    const signMaterial = this.material({ color: signColor, emissive: signColor, emissiveIntensity: 2.2, roughness: 0.45 });
    this.box([x, height + 0.75, z + depth / 2 - 0.1], [width * 0.65, 1.1, 0.3], signMaterial, { solid: false });
    this.glow(signColor, [x, height + 1.1, z + depth / 2 + 1.4], 9, 13);

    const counterMaterial = this.material({ color: theme.facades[1], roughness: 0.8 });
    this.box([x, 0.55, z + depth / 2 + 1.9], [width * 0.7, 1.1, 0.7], counterMaterial, { surface: "wood" });
  }

  containerStack(rng, theme, x, z) {
    const palette = [...theme.accents, ...theme.neon, ...theme.facades];
    const count = intRange(rng, 2, 5);
    const rotation = rng() > 0.5 ? 0 : Math.PI / 2;
    for (let i = 0; i < count; i++) {
      const color = pick(rng, palette);
      const material = this.material({ color, roughness: 0.62, metalness: 0.45 });
      const level = Math.floor(i / 2);
      const offset = (i % 2) * 6.4 - 3.2;
      const width = 6.1;
      const height = 2.6;
      const depth = 2.5;
      const position = rotation === 0 ? [x + offset, height / 2 + level * height, z] : [x, height / 2 + level * height, z + offset];
      this.box(position, [width, height, depth], material, { rotation, surface: "metal" });

      const ribMaterial = this.material({ color, roughness: 0.5, metalness: 0.6 });
      this.box(
        rotation === 0 ? [position[0], position[1], position[2] + depth / 2] : [position[0] + depth / 2, position[1], position[2]],
        rotation === 0 ? [width * 0.96, height * 0.7, 0.12] : [0.12, height * 0.7, width * 0.96],
        ribMaterial,
        { solid: false, surface: "metal" }
      );
    }
  }

  billboard(rng, theme, x, z) {
    const poleMaterial = this.material({ color: 0x1b1f20, roughness: 0.5, metalness: 0.7 });
    const height = range(rng, 6, 9);
    for (const offset of [-2.6, 2.6]) {
      this.cylinder([x + offset, height / 2, z], 0.2, 0.26, height, poleMaterial, { solid: true, segments: 8 });
    }
    const panelColor = pick(rng, theme.neon);
    const panelMaterial = this.material({
      color: panelColor,
      emissive: panelColor,
      emissiveIntensity: 1.9,
      roughness: 0.5,
      metalness: 0.2,
    });
    this.box([x, height + 1.6, z], [8.4, 3.4, 0.35], panelMaterial, { solid: false });

    const bandColor = pick(rng, theme.accents);
    const bandMaterial = this.material({ color: bandColor, emissive: bandColor, emissiveIntensity: 1.4 });
    this.box([x, height + 0.3, z], [8.4, 0.4, 0.42], bandMaterial, { solid: false });
    this.glow(panelColor, [x, height + 1.6, z + 2.2], 16, 20);
    this.spawnPoints.push(new THREE.Vector3(x, 1.05, z + 4));
  }

  waterTower(rng, theme, x, z) {
    const legMaterial = this.material({ color: 0x23282a, roughness: 0.55, metalness: 0.65 });
    const height = range(rng, 5.5, 8);
    for (const [lx, lz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
      this.cylinder([x + lx, height / 2, z + lz], 0.16, 0.22, height, legMaterial, { segments: 6 });
    }
    const tankColor = pick(rng, theme.facades);
    const tankMaterial = this.material({ color: tankColor, roughness: 0.7, metalness: 0.3 });
    this.cylinder([x, height + 1.9, z], 3.1, 3.1, 3.8, tankMaterial, { segments: 16, surface: "metal" });
    const capMaterial = this.material({ color: pick(rng, theme.accents), roughness: 0.6, metalness: 0.4 });
    this.cylinder([x, height + 4.1, z], 1.1, 3.1, 1.1, capMaterial, { segments: 16, solid: false });
  }

  plaza(rng, theme, x, z) {
    const planterMaterial = this.material({ color: pick(rng, theme.facades), roughness: 0.9 });
    const foliageColor = pick(rng, ["#4f8f3a", "#6fae4a", "#3f7d46", "#8bc34a"]);
    const foliageMaterial = this.material({ color: new THREE.Color(foliageColor), roughness: 0.95 });
    const count = intRange(rng, 2, 4);
    for (let i = 0; i < count; i++) {
      const px = x + range(rng, -5, 5);
      const pz = z + range(rng, -5, 5);
      this.box([px, 0.45, pz], [2.6, 0.9, 2.6], planterMaterial, { surface: "stone" });
      const trunk = this.track(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.5, 6), planterMaterial));
      trunk.position.set(px, 1.6, pz);
      trunk.castShadow = true;
      this.group.add(trunk);
      const canopy = this.track(new THREE.Mesh(new THREE.IcosahedronGeometry(range(rng, 1.1, 1.7), 1), foliageMaterial));
      canopy.position.set(px, range(rng, 2.6, 3.3), pz);
      canopy.castShadow = true;
      this.group.add(canopy);
      this.colliders.push(canopy);
    }
    const benchMaterial = this.material({ color: pick(rng, theme.accents), roughness: 0.75 });
    this.box([x, 0.5, z + range(rng, -6, 6)], [range(rng, 3, 5), 0.9, 1], benchMaterial, { surface: "wood" });
  }

  coverField(rng, theme) {
    const crateMaterial = this.material({ color: pick(rng, theme.facades), roughness: 0.9 });
    const barrelPalette = [...theme.accents, ...theme.neon];
    const crateCount = intRange(rng, 14, 22);
    for (let i = 0; i < crateCount; i++) {
      const x = range(rng, -42, 42);
      const z = range(rng, -42, 42);
      const stacked = rng() > 0.7;
      this.box([x, 1.1, z], [2.2, 2.2, 2.2], crateMaterial, { surface: "wood", rotation: range(rng, 0, Math.PI) });
      if (stacked) this.box([x, 3.2, z], [1.9, 1.9, 1.9], crateMaterial, { surface: "wood", rotation: range(rng, 0, Math.PI) });
    }

    const barrelCount = intRange(rng, 8, 16);
    for (let i = 0; i < barrelCount; i++) {
      const color = pick(rng, barrelPalette);
      const material = this.material({ color, roughness: 0.45, metalness: 0.55 });
      this.cylinder([range(rng, -42, 42), 0.62, range(rng, -42, 42)], 0.55, 0.55, 1.25, material, { segments: 12 });
    }

    const barrierMaterial = this.material({ color: theme.facades[3], roughness: 0.92 });
    const barrierCount = intRange(rng, 6, 11);
    for (let i = 0; i < barrierCount; i++) {
      const horizontal = rng() > 0.5;
      const length = range(rng, 5, 11);
      this.box(
        [range(rng, -38, 38), 0.7, range(rng, -38, 38)],
        horizontal ? [length, 1.4, 0.6] : [0.6, 1.4, length],
        barrierMaterial
      );
    }
  }

  streetLights(rng, theme) {
    const poleMaterial = this.material({ color: 0x1a1e1f, roughness: 0.5, metalness: 0.7 });
    const count = intRange(rng, 4, 7);
    for (let i = 0; i < count; i++) {
      const x = range(rng, -40, 40);
      const z = range(rng, -40, 40);
      const height = range(rng, 6, 9);
      this.cylinder([x, height / 2, z], 0.14, 0.2, height, poleMaterial, { segments: 8 });
      const color = pick(rng, theme.neon);
      const headMaterial = this.material({ color, emissive: color, emissiveIntensity: 2.4 });
      this.box([x, height + 0.25, z], [1.5, 0.35, 0.7], headMaterial, { solid: false });
      this.glow(color, [x, height, z], 18, 22);
    }
  }
}
