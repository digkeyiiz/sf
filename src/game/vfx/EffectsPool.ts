import * as THREE from 'three';

interface TracerSlot {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  active: boolean;
  life: number;
  maxLife: number;
}

interface ParticleSlot {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  active: boolean;
  life: number;
  maxLife: number;
  gravity: number;
  scaleStart: number;
  scaleEnd: number;
}

interface ShellSlot {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  active: boolean;
  life: number;
  bounces: number;
}

interface ExplosionSlot {
  sphere: THREE.Mesh;
  sphereMat: THREE.MeshBasicMaterial;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  smoke: THREE.Mesh;
  smokeMat: THREE.MeshBasicMaterial;
  active: boolean;
  age: number;
  duration: number;
}

/**
 * Zero-GC Pre-Allocated VFX Pool for Tracers, Impacts, Dust/Blood Particles,
 * Shell Casings, Bullet Decals, and Explosions (including a pre-mounted PointLight
 * so explosions NEVER trigger GPU shader recompilation!).
 */
export class EffectsPool {
  private scene: THREE.Scene;
  private tracers: TracerSlot[] = [];
  private particles: ParticleSlot[] = [];
  private shells: ShellSlot[] = [];
  private decals: THREE.Mesh[] = [];
  private decalCursor = 0;
  private maxDecals = 48;
  private explosions: ExplosionSlot[] = [];

  // Shared geometries & materials (disposed cleanly once in dispose())
  private tracerGeo = new THREE.CylinderGeometry(0.011, 0.018, 1, 5);
  private particleGeo = new THREE.BoxGeometry(0.045, 0.045, 0.045);
  private shellGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.036, 6);
  private shotgunShellGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.052, 6);
  private decalGeo = new THREE.PlaneGeometry(0.15, 0.15);
  private sphereGeo = new THREE.SphereGeometry(0.65, 14, 10);
  private ringGeo = new THREE.RingGeometry(0.4, 0.72, 20);
  private smokeGeo = new THREE.DodecahedronGeometry(0.55, 0);

  private sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc857 });
  private bloodMat = new THREE.MeshBasicMaterial({ color: 0xb91c1c });
  private dustMat = new THREE.MeshBasicMaterial({
    color: 0xd6cfc2,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  });
  private brassMat = new THREE.MeshStandardMaterial({
    color: 0xe0b54c,
    metalness: 0.9,
    roughness: 0.25,
  });
  private redShellMat = new THREE.MeshStandardMaterial({
    color: 0xc8232c,
    metalness: 0.15,
    roughness: 0.45,
  });
  private decalMat = new THREE.MeshBasicMaterial({
    color: 0x111318,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });

  // Pre-mounted reusable explosion flash PointLight (intensity 0 when idle — ZERO shader compile hitch!)
  private explosionLight: THREE.PointLight;
  private explosionLightTimer = 0;

  private readonly _up = new THREE.Vector3(0, 1, 0);
  private readonly _tmpDir = new THREE.Vector3();
  private readonly _tmpMid = new THREE.Vector3();
  private readonly _tmpLook = new THREE.Vector3();

  constructor(scene: THREE.Scene, allowDynamicExplosionLight: boolean) {
    this.scene = scene;

    // 1. Tracer Pool (32 concurrent trails)
    for (let i = 0; i < 32; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffe08a,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.tracerGeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.tracers.push({ mesh, mat, active: false, life: 0, maxLife: 0.095 });
    }

    // 2. Impact Sparks / Blood / Dust Pool (96 concurrent particles)
    for (let i = 0; i < 96; i++) {
      const mesh = new THREE.Mesh(this.particleGeo, this.sparkMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vel: new THREE.Vector3(),
        active: false,
        life: 0,
        maxLife: 0.3,
        gravity: 9.8,
        scaleStart: 1,
        scaleEnd: 0.15,
      });
    }

    // 3. Shell Casing Pool (28 concurrent shells)
    for (let i = 0; i < 28; i++) {
      const mesh = new THREE.Mesh(this.shellGeo, this.brassMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.shells.push({
        mesh,
        vel: new THREE.Vector3(),
        rotVel: new THREE.Vector3(),
        active: false,
        life: 0,
        bounces: 0,
      });
    }

    // 4. Bullet Decal Pool (64 max, dynamically capped by quality)
    for (let i = 0; i < 64; i++) {
      const mesh = new THREE.Mesh(this.decalGeo, this.decalMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.decals.push(mesh);
    }

    // 5. Explosion Pool (4 concurrent blasts)
    for (let i = 0; i < 4; i++) {
      const sphereMat = new THREE.MeshBasicMaterial({
        color: 0xff9238,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
      });
      const sphere = new THREE.Mesh(this.sphereGeo, sphereMat);
      sphere.visible = false;

      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffd27a,
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(this.ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;

      const smokeMat = new THREE.MeshBasicMaterial({
        color: 0x3b3d42,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      });
      const smoke = new THREE.Mesh(this.smokeGeo, smokeMat);
      smoke.visible = false;

      this.scene.add(sphere, ring, smoke);
      this.explosions.push({
        sphere,
        sphereMat,
        ring,
        ringMat,
        smoke,
        smokeMat,
        active: false,
        age: 0,
        duration: 0.58,
      });
    }

    // Pre-mounted Explosion Light (always in scene graph with intensity 0 when idle)
    this.explosionLight = new THREE.PointLight(0xff9238, 0, 22, 1.6);
    this.explosionLight.position.set(0, -50, 0);
    this.explosionLight.visible = allowDynamicExplosionLight;
    this.scene.add(this.explosionLight);
  }

  public setQualityBudget(maxDecals: number, allowDynamicLight: boolean) {
    this.maxDecals = Math.max(12, Math.min(this.decals.length, maxDecals));
    for (let i = this.maxDecals; i < this.decals.length; i++) {
      this.decals[i].visible = false;
    }
    this.explosionLight.visible = allowDynamicLight;
    if (!allowDynamicLight) {
      this.explosionLight.intensity = 0;
    }
  }

  public spawnTracer(start: THREE.Vector3, end: THREE.Vector3, isSniper = false) {
    let slot = this.tracers.find((t) => !t.active);
    if (!slot) slot = this.tracers[0];

    this._tmpDir.subVectors(end, start);
    const dist = this._tmpDir.length();
    if (dist < 0.2) return;

    this._tmpMid.addVectors(start, end).multiplyScalar(0.5);
    this._tmpDir.normalize();

    slot.active = true;
    slot.maxLife = isSniper ? 0.14 : 0.085;
    slot.life = slot.maxLife;
    slot.mat.color.setHex(isSniper ? 0xfff0b8 : 0xffd57a);
    slot.mat.opacity = isSniper ? 0.92 : 0.78;

    slot.mesh.position.copy(this._tmpMid);
    slot.mesh.quaternion.setFromUnitVectors(this._up, this._tmpDir);
    slot.mesh.scale.set(isSniper ? 1.55 : 1.0, dist, isSniper ? 1.55 : 1.0);
    slot.mesh.visible = true;
  }

  public spawnImpact(point: THREE.Vector3, kind: 'spark' | 'blood' | 'dust', count = 5) {
    let spawned = 0;
    const mat = kind === 'blood' ? this.bloodMat : kind === 'dust' ? this.dustMat : this.sparkMat;
    for (let i = 0; i < this.particles.length && spawned < count; i++) {
      const p = this.particles[i];
      if (p.active) continue;
      p.active = true;
      p.maxLife = kind === 'dust' ? 0.36 + Math.random() * 0.18 : 0.22 + Math.random() * 0.16;
      p.life = p.maxLife;
      p.gravity = kind === 'dust' ? -0.9 : 10.5;
      p.scaleStart = kind === 'dust' ? 1.8 : kind === 'blood' ? 1.2 : 0.9;
      p.scaleEnd = kind === 'dust' ? 4.4 : 0.12;
      p.mesh.material = mat;
      p.mesh.position.copy(point);
      p.mesh.scale.setScalar(p.scaleStart);
      p.mesh.visible = true;

      const spread = kind === 'dust' ? 2.4 : 4.2;
      p.vel.set(
        (Math.random() - 0.5) * spread,
        (kind === 'dust' ? 0.9 : 1.2) + Math.random() * 2.6,
        (Math.random() - 0.5) * spread
      );
      spawned++;
    }
  }

  public spawnShellCasing(
    origin: THREE.Vector3,
    rightDir: THREE.Vector3,
    upDir: THREE.Vector3,
    forwardDir: THREE.Vector3,
    isShotgun: boolean
  ) {
    let slot = this.shells.find((s) => !s.active);
    if (!slot) slot = this.shells[0];

    slot.active = true;
    slot.life = 1.65;
    slot.bounces = 0;
    slot.mesh.geometry = isShotgun ? this.shotgunShellGeo : this.shellGeo;
    slot.mesh.material = isShotgun ? this.redShellMat : this.brassMat;
    slot.mesh.position.copy(origin);
    slot.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    slot.mesh.visible = true;

    slot.vel
      .copy(rightDir)
      .multiplyScalar(1.9 + Math.random() * 0.85)
      .addScaledVector(upDir, 1.35 + Math.random() * 0.65)
      .addScaledVector(forwardDir, -0.35 + Math.random() * 0.45);
    slot.rotVel.set(
      (Math.random() - 0.5) * 18,
      (Math.random() - 0.5) * 18,
      (Math.random() - 0.5) * 18
    );
  }

  public spawnDecal(point: THREE.Vector3, normal: THREE.Vector3) {
    const idx = this.decalCursor % this.maxDecals;
    this.decalCursor++;
    const mesh = this.decals[idx];
    mesh.position.copy(point).addScaledVector(normal, 0.012);
    this._tmpLook.copy(mesh.position).add(normal);
    mesh.lookAt(this._tmpLook);
    mesh.rotation.z = Math.random() * Math.PI * 2;
    const s = 0.82 + Math.random() * 0.42;
    mesh.scale.set(s, s, 1);
    mesh.visible = true;
  }

  public spawnExplosion(pos: THREE.Vector3) {
    let slot = this.explosions.find((e) => !e.active);
    if (!slot) slot = this.explosions[0];

    slot.active = true;
    slot.age = 0;
    slot.duration = 0.62;

    slot.sphere.position.copy(pos);
    slot.sphere.scale.setScalar(1);
    slot.sphereMat.opacity = 0.9;
    slot.sphere.visible = true;

    slot.ring.position.set(pos.x, Math.max(0.08, pos.y), pos.z);
    slot.ring.scale.setScalar(1);
    slot.ringMat.opacity = 0.82;
    slot.ring.visible = true;

    slot.smoke.position.set(pos.x, pos.y + 0.35, pos.z);
    slot.smoke.scale.setScalar(1.2);
    slot.smokeMat.opacity = 0.65;
    slot.smoke.visible = true;

    if (this.explosionLight.visible) {
      this.explosionLight.position.set(pos.x, pos.y + 1.0, pos.z);
      this.explosionLight.intensity = 12;
      this.explosionLightTimer = 0.35;
    }

    // Burst debris sparks & dust from pool
    this.spawnImpact(pos, 'spark', 10);
    this.spawnImpact(pos, 'dust', 8);
  }

  public update(dt: number) {
    // 1. Tracers
    for (let i = 0; i < this.tracers.length; i++) {
      const t = this.tracers[i];
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.active = false;
        t.mesh.visible = false;
      } else {
        t.mat.opacity = Math.max(0, (t.life / t.maxLife) * 0.88);
      }
    }

    // 2. Particles
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const frac = 1 - p.life / p.maxLife;
      const sc = p.scaleStart + (p.scaleEnd - p.scaleStart) * frac;
      p.mesh.scale.setScalar(Math.max(0.05, sc));
    }

    // 3. Shells
    for (let i = 0; i < this.shells.length; i++) {
      const s = this.shells[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      s.vel.y -= 13.5 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += s.rotVel.x * dt;
      s.mesh.rotation.y += s.rotVel.y * dt;
      s.mesh.rotation.z += s.rotVel.z * dt;
      if (s.mesh.position.y < 0.035) {
        s.mesh.position.y = 0.035;
        if (s.bounces < 2) {
          s.vel.y = Math.abs(s.vel.y) * 0.36;
          s.vel.x *= 0.55;
          s.vel.z *= 0.55;
          s.rotVel.multiplyScalar(0.5);
          s.bounces++;
        } else {
          s.vel.set(0, 0, 0);
          s.rotVel.set(0, 0, 0);
        }
      }
    }

    // 4. Explosions
    for (let i = 0; i < this.explosions.length; i++) {
      const ex = this.explosions[i];
      if (!ex.active) continue;
      ex.age += dt;
      const t = Math.min(1, ex.age / ex.duration);
      const s = 1 + t * 7.2;
      ex.sphere.scale.setScalar(s);
      ex.sphereMat.opacity = Math.max(0, 0.9 * (1 - t * 1.15));

      const rs = 1 + t * 9.8;
      ex.ring.scale.setScalar(rs);
      ex.ringMat.opacity = Math.max(0, 0.8 * (1 - t));

      const ss = 1.2 + t * 5.8;
      ex.smoke.scale.setScalar(ss);
      ex.smoke.position.y += dt * 2.4;
      ex.smokeMat.opacity = Math.max(0, 0.65 * (1 - t));

      if (t >= 1) {
        ex.active = false;
        ex.sphere.visible = false;
        ex.ring.visible = false;
        ex.smoke.visible = false;
      }
    }

    if (this.explosionLightTimer > 0) {
      this.explosionLightTimer = Math.max(0, this.explosionLightTimer - dt);
      this.explosionLight.intensity = (this.explosionLightTimer / 0.35) * 12;
      if (this.explosionLightTimer <= 0) {
        this.explosionLight.position.set(0, -50, 0);
      }
    }
  }

  public dispose() {
    for (const t of this.tracers) {
      this.scene.remove(t.mesh);
      t.mat.dispose();
    }
    for (const p of this.particles) this.scene.remove(p.mesh);
    for (const s of this.shells) this.scene.remove(s.mesh);
    for (const d of this.decals) this.scene.remove(d);
    for (const ex of this.explosions) {
      this.scene.remove(ex.sphere, ex.ring, ex.smoke);
      ex.sphereMat.dispose();
      ex.ringMat.dispose();
      ex.smokeMat.dispose();
    }
    this.scene.remove(this.explosionLight);

    this.tracerGeo.dispose();
    this.particleGeo.dispose();
    this.shellGeo.dispose();
    this.shotgunShellGeo.dispose();
    this.decalGeo.dispose();
    this.sphereGeo.dispose();
    this.ringGeo.dispose();
    this.smokeGeo.dispose();

    this.sparkMat.dispose();
    this.bloodMat.dispose();
    this.dustMat.dispose();
    this.brassMat.dispose();
    this.redShellMat.dispose();
    this.decalMat.dispose();
  }
}
