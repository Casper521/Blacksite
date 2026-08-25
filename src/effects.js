import * as THREE from "three";

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  tracer(start, end, hostile = false) {
    const direction = end.clone().sub(start);
    const length = direction.length();
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.025, length, 4),
      new THREE.MeshBasicMaterial({ color: hostile ? 0xff4b36 : 0xffe18a, transparent: true, opacity: 0.9 })
    );
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    this.scene.add(mesh);
    this.items.push({ object: mesh, life: 0.055, maxLife: 0.055 });
  }

  impact(point, normal, surface = "stone") {
    const color = surface === "metal" ? 0xffd06a : surface === "wood" ? 0xd4af79 : 0xbfc5b9;
    for (let i = 0; i < 7; i++) {
      const particle = new THREE.Mesh(
        new THREE.SphereGeometry(0.018 + Math.random() * 0.018, 4, 4),
        new THREE.MeshBasicMaterial({ color, transparent: true })
      );
      particle.position.copy(point).addScaledVector(normal, 0.025);
      const velocity = normal.clone().multiplyScalar(1.3 + Math.random() * 2.4);
      velocity.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.1, Math.random() - 0.5).multiplyScalar(2));
      this.scene.add(particle);
      this.items.push({ object: particle, velocity, life: 0.32 + Math.random() * 0.3, maxLife: 0.6, gravity: true });
    }

    const mark = new THREE.Mesh(
      new THREE.CircleGeometry(0.055 + Math.random() * 0.035, 8),
      new THREE.MeshBasicMaterial({ color: 0x151817, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -4 })
    );
    mark.position.copy(point).addScaledVector(normal, 0.012);
    mark.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    this.scene.add(mark);
    this.items.push({ object: mark, life: 14, maxLife: 14 });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.life -= dt;
      if (item.velocity) {
        item.object.position.addScaledVector(item.velocity, dt);
        if (item.gravity) item.velocity.y -= 7 * dt;
      }
      const opacity = Math.min(1, item.life / Math.min(0.2, item.maxLife));
      if (item.object.material) item.object.material.opacity = opacity;
      if (item.life <= 0) {
        this.scene.remove(item.object);
        item.object.geometry?.dispose();
        item.object.material?.dispose();
        this.items.splice(i, 1);
      }
    }
  }
}
