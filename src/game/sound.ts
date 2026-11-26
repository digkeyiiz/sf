import type { MapId, Vec3, WeaponId } from '../shared/types';
import type { AudioMixSettings } from '../shared/controls';

export type FloorSurface = 'sand' | 'concrete' | 'asphalt';
export type MovementStance = 'walk' | 'sprint' | 'crouch';
export type ImpactSurface = 'wall' | 'metal' | 'flesh' | 'headshot';
export type AudioChannel = 'sfx' | 'ambience' | 'ui' | 'voice';

export interface SpatialSoundPos {
  pos: Vec3;
  occluded?: boolean;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private uiGain: GainNode | null = null;
  private voiceGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private reverbSendGain: GainNode | null = null;
  private saturatorCurve: Float32Array<ArrayBuffer> | null = null;

  // Precomputed procedural noise buffers (zero runtime GC)
  private whiteNoise: AudioBuffer | null = null;
  private pinkNoise: AudioBuffer | null = null;
  private brownNoise: AudioBuffer | null = null;

  // Map environment & ambience state
  private currentMap: MapId = 'desert_camp';
  private currentSurface: FloorSurface = 'sand';
  private ambienceNodes: {
    source: AudioBufferSourceNode;
    lfo?: OscillatorNode;
    gain: GainNode;
  } | null = null;
  private ambienceDesiredMap: MapId | null = null;

  // Footstep alternation & rate-limit guards
  private stepFootIndex = 0;
  private lastDryFireMs = 0;
  private lastWhizMs = 0;

  private _volume = 0.75;
  private _mix: AudioMixSettings = {
    master: 75,
    sfx: 100,
    ambience: 65,
    ui: 80,
    voice: 90,
  };

  public get volume(): number {
    return this._volume;
  }
  public set volume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    this._mix.master = Math.round(this._volume * 100);
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this._volume, this.ctx.currentTime, 0.02);
    }
  }

  public applyAudioMix(mix: AudioMixSettings) {
    this._mix = { ...mix };
    this._volume = Math.max(0, Math.min(1, mix.master / 100));
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.masterGain?.gain.setTargetAtTime(this._volume, t, 0.02);
    this.sfxGain?.gain.setTargetAtTime(Math.max(0, Math.min(1, mix.sfx / 100)), t, 0.02);
    this.ambienceGain?.gain.setTargetAtTime(Math.max(0, Math.min(1, mix.ambience / 100)), t, 0.02);
    this.uiGain?.gain.setTargetAtTime(Math.max(0, Math.min(1, mix.ui / 100)), t, 0.02);
    this.voiceGain?.gain.setTargetAtTime(Math.max(0, Math.min(1, mix.voice / 100)), t, 0.02);
  }

  /**
   * Updates the Web Audio 3D HRTF Listener transform every frame from the player's camera.
   */
  public updateListener(pos: Vec3, forward: Vec3, up: Vec3) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const listener = ctx.listener;
    const now = ctx.currentTime;
    if (listener.positionX) {
      listener.positionX.setValueAtTime(pos.x, now);
      listener.positionY.setValueAtTime(pos.y, now);
      listener.positionZ.setValueAtTime(pos.z, now);
      listener.forwardX.setValueAtTime(forward.x, now);
      listener.forwardY.setValueAtTime(forward.y, now);
      listener.forwardZ.setValueAtTime(forward.z, now);
      listener.upX.setValueAtTime(up.x, now);
      listener.upY.setValueAtTime(up.y, now);
      listener.upZ.setValueAtTime(up.z, now);
    } else if (typeof listener.setPosition === 'function') {
      listener.setPosition(pos.x, pos.y, pos.z);
      listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();

      // Master studio compressor + 5-channel gain buses
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this._volume;

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this._mix.sfx / 100;
      this.sfxGain.connect(this.masterGain);

      this.ambienceGain = this.ctx.createGain();
      this.ambienceGain.gain.value = this._mix.ambience / 100;
      this.ambienceGain.connect(this.masterGain);

      this.uiGain = this.ctx.createGain();
      this.uiGain.gain.value = this._mix.ui / 100;
      this.uiGain.connect(this.masterGain);

      this.voiceGain = this.ctx.createGain();
      this.voiceGain.gain.value = this._mix.voice / 100;
      this.voiceGain.connect(this.masterGain);

      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -13;
      this.compressor.knee.value = 18;
      this.compressor.ratio.value = 6;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.14;

      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);

      // Convolution Reverb Bus routed into SFX channel
      this.reverbNode = this.ctx.createConvolver();
      this.reverbSendGain = this.ctx.createGain();
      this.reverbSendGain.gain.value = 0.45;
      this.reverbSendGain.connect(this.reverbNode);
      this.reverbNode.connect(this.sfxGain);

      this.buildNoiseBuffers(this.ctx);
      this.buildSaturatorCurve();
      this.rebuildReverbImpulse(this.ctx, this.currentMap);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().then(() => {
        if (this.ambienceDesiredMap && !this.ambienceNodes) {
          this.startAmbience(this.ambienceDesiredMap);
        }
      }).catch(() => {});
    }

    return this.ctx;
  }

  private buildNoiseBuffers(ctx: AudioContext) {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 2.5);

    // 1. White Noise (transients, gun cracks, grit, metallic scrapes)
    const white = ctx.createBuffer(1, len, sr);
    const wd = white.getChannelData(0);
    for (let i = 0; i < len; i++) {
      wd[i] = Math.random() * 2 - 1;
    }
    this.whiteNoise = white;

    // 2. Pink Noise (Voss-McCartney approximation — realistic fabric, sand, wind, ballistic roar)
    const pink = ctx.createBuffer(1, len, sr);
    const pd = pink.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      pd[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.14;
      b6 = w * 0.115926;
    }
    this.pinkNoise = pink;

    // 3. Brown Noise (deep sub-bass shockwaves, concrete resonance, heavy boot impact)
    const brown = ctx.createBuffer(1, len, sr);
    const bd = brown.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.025 * w) / 1.025;
      bd[i] = Math.max(-1, Math.min(1, lastOut * 3.4));
    }
    this.brownNoise = brown;
  }

  private buildSaturatorCurve() {
    const n = 256;
    const buf = new ArrayBuffer(n * 4);
    const curve = new Float32Array(buf);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = Math.tanh(x * 2.6);
    }
    this.saturatorCurve = curve;
  }

  /**
   * Generates a realistic Stereo Acoustic Impulse Response tailored to each battlefield:
   * - Warehouse: tight dense concrete & steel roof reflections + 1.35s industrial hall tail
   * - Crossroad: distinct urban building canyon slapback echoes + 1.15s night street tail
   * - Desert Camp: crisp compound wall early bounce + wide arid canyon tail
   */
  private rebuildReverbImpulse(ctx: AudioContext, mapId: MapId) {
    if (!this.reverbNode) return;
    const sr = ctx.sampleRate;
    const dur = mapId === 'warehouse' ? 1.35 : mapId === 'crossroad' ? 1.15 : 0.95;
    const len = Math.floor(sr * dur);
    const ir = ctx.createBuffer(2, len, sr);

    const decayPower = mapId === 'warehouse' ? 2.4 : mapId === 'crossroad' ? 3.1 : 3.6;
    const slapTimes =
      mapId === 'warehouse'
        ? [0.012, 0.026, 0.044, 0.072, 0.11]
        : mapId === 'crossroad'
          ? [0.038, 0.088, 0.155, 0.24]
          : [0.024, 0.095, 0.21];

    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      let lp = 0;
      const lpAlpha = mapId === 'warehouse' ? 0.34 : mapId === 'crossroad' ? 0.28 : 0.22;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const env = Math.pow(1 - t, decayPower);
        const raw = (Math.random() * 2 - 1) * env;
        lp = lp + lpAlpha * (raw - lp);
        data[i] = lp * (mapId === 'warehouse' ? 0.85 : 0.62);
      }
      // Inject discrete early architectural reflections / canyon slapback
      for (let s = 0; s < slapTimes.length; s++) {
        const idx = Math.floor((slapTimes[s] + ch * 0.004) * sr);
        if (idx < len - 12) {
          const amp = (0.55 - s * 0.1) * (ch === 0 ? 1 : 0.92);
          for (let k = 0; k < 12; k++) {
            data[idx + k] += (Math.random() * 2 - 1) * amp * (1 - k / 12);
          }
        }
      }
    }

    this.reverbNode.buffer = ir;
    if (this.reverbSendGain) {
      this.reverbSendGain.gain.value =
        mapId === 'warehouse' ? 0.62 : mapId === 'crossroad' ? 0.44 : 0.34;
    }
  }

  public setEnvironment(mapId: MapId, surface: FloorSurface) {
    this.currentMap = mapId;
    this.currentSurface = surface;
    if (this.ctx) {
      this.rebuildReverbImpulse(this.ctx, mapId);
    }
  }

  private getChannelBus(channel: AudioChannel): GainNode | null {
    if (channel === 'ambience') return this.ambienceGain ?? this.masterGain;
    if (channel === 'ui') return this.uiGain ?? this.masterGain;
    if (channel === 'voice') return this.voiceGain ?? this.masterGain;
    return this.sfxGain ?? this.masterGain;
  }

  /**
   * Routes a sound node through optional 3D HRTF PannerNode (with wall-occlusion muffler)
   * or stereo panning + channel bus + map reverb send.
   */
  private routeOutput(
    ctx: AudioContext,
    sourceNode: AudioNode,
    pan = 0,
    reverbSend = 0.25,
    channel: AudioChannel = 'sfx',
    spatial?: SpatialSoundPos
  ) {
    const bus = this.getChannelBus(channel);
    if (!bus) return;
    let out: AudioNode = sourceNode;

    if (spatial && typeof ctx.createPanner === 'function') {
      if (spatial.occluded) {
        const occ = ctx.createBiquadFilter();
        occ.type = 'lowpass';
        occ.frequency.value = 920;
        occ.Q.value = 0.7;
        out.connect(occ);
        out = occ;
      }
      const p3d = ctx.createPanner();
      p3d.panningModel = 'HRTF';
      p3d.distanceModel = 'inverse';
      p3d.refDistance = 3.5;
      p3d.maxDistance = 85;
      p3d.rolloffFactor = 1.25;
      if (p3d.positionX) {
        p3d.positionX.value = spatial.pos.x;
        p3d.positionY.value = spatial.pos.y;
        p3d.positionZ.value = spatial.pos.z;
      } else {
        p3d.setPosition(spatial.pos.x, spatial.pos.y, spatial.pos.z);
      }
      out.connect(p3d);
      out = p3d;
    } else if (Math.abs(pan) > 0.01 && typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-0.96, Math.min(0.96, pan));
      out.connect(panner);
      out = panner;
    }

    out.connect(bus);
    if (channel === 'sfx' && reverbSend > 0.01 && this.reverbSendGain) {
      const wet = ctx.createGain();
      wet.gain.value = reverbSend;
      out.connect(wet);
      wet.connect(this.reverbSendGain);
    }
  }

  /**
   * Starts subtle map-authentic ambient soundscape (desert breeze / dusk port warehouse / morning SEA urban).
   */
  public startAmbience(mapId: MapId) {
    this.ambienceDesiredMap = mapId;
    const ctx = this.ensureContext();
    const ambBus = this.ambienceGain ?? this.masterGain;
    if (!ctx || !this.pinkNoise || !this.brownNoise || !ambBus) return;
    if (ctx.state === 'suspended') return;
    this.stopAmbience(false);

    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = mapId === 'warehouse' ? this.brownNoise : this.pinkNoise;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    let lfo: OscillatorNode | undefined;

    if (mapId === 'desert_camp') {
      filter.type = 'bandpass';
      filter.frequency.value = 340;
      filter.Q.value = 1.6;
      lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.14;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 135;
      lfo.connect(lfoGain).connect(filter.frequency);
      lfo.start(now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.052, now + 1.5);
    } else if (mapId === 'warehouse') {
      filter.type = 'lowpass';
      filter.frequency.value = 155;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.06, now + 1.2);
    } else {
      // Crossroad misty morning city breeze
      filter.type = 'bandpass';
      filter.frequency.value = 260;
      filter.Q.value = 0.9;
      lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.11;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 60;
      lfo.connect(lfoGain).connect(filter.frequency);
      lfo.start(now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.045, now + 1.5);
    }

    src.connect(filter).connect(gain).connect(ambBus);
    src.start(now);
    this.ambienceNodes = { source: src, lfo, gain };
  }

  public stopAmbience(clearDesired = true) {
    if (clearDesired) this.ambienceDesiredMap = null;
    if (!this.ambienceNodes) return;
    try {
      this.ambienceNodes.source.stop();
      this.ambienceNodes.source.disconnect();
      this.ambienceNodes.lfo?.stop();
      this.ambienceNodes.lfo?.disconnect();
      this.ambienceNodes.gain.disconnect();
    } catch {
      // Ignore already stopped audio nodes
    }
    this.ambienceNodes = null;
  }

  private activeSpatial: SpatialSoundPos | undefined;

  /**
   * Helper: Plays a shaped noise burst with filter sweep and optional reverb + 3D spatial/pan.
   */
  private triggerNoiseLayer(
    ctx: AudioContext,
    buffer: AudioBuffer,
    startTime: number,
    dur: number,
    filterType: BiquadFilterType,
    freqStart: number,
    freqEnd: number,
    q: number,
    gainPeak: number,
    pan = 0,
    reverbSend = 0,
    useSaturator = false,
    attack = 0.002,
    channel: AudioChannel = 'sfx'
  ) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const maxOffset = Math.max(0.01, buffer.duration - dur - 0.05);
    const offset = Math.random() * maxOffset;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(Math.max(25, freqStart), startTime);
    if (Math.abs(freqEnd - freqStart) > 2) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(25, freqEnd), startTime + dur);
    }

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(Math.max(0.0002, gainPeak), startTime + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

    if (useSaturator && this.saturatorCurve) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = this.saturatorCurve;
      src.connect(filter).connect(shaper).connect(env);
    } else {
      src.connect(filter).connect(env);
    }

    this.routeOutput(ctx, env, pan, reverbSend, channel, this.activeSpatial);
    src.start(startTime, offset, dur + 0.03);
    src.stop(startTime + dur + 0.03);
  }

  /**
   * Helper: Plays a pitched transient body/metallic tone.
   */
  private triggerToneLayer(
    ctx: AudioContext,
    type: OscillatorType,
    startTime: number,
    dur: number,
    freqStart: number,
    freqEnd: number,
    gainPeak: number,
    pan = 0,
    reverbSend = 0,
    attack = 0.002,
    channel: AudioChannel = 'sfx'
  ) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(18, freqStart), startTime);
    if (Math.abs(freqEnd - freqStart) > 1) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(18, freqEnd), startTime + dur);
    }
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(Math.max(0.0002, gainPeak), startTime + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

    osc.connect(env);
    this.routeOutput(ctx, env, pan, reverbSend, channel, this.activeSpatial);
    osc.start(startTime);
    osc.stop(startTime + dur + 0.02);
  }

  /**
   * Convenience wrapper to play any positional combat SFX with true 3D HRTF + wall occlusion.
   */
  public playSpatialGunshot(
    weaponId: WeaponId,
    distance: number,
    pan: number,
    pos: Vec3,
    occluded = false
  ) {
    this.activeSpatial = { pos, occluded };
    try {
      this.playGunshot(weaponId, distance, pan);
    } finally {
      this.activeSpatial = undefined;
    }
  }

  public playSpatialExplosion(distance: number, pan: number, pos: Vec3, occluded = false) {
    this.activeSpatial = { pos, occluded };
    try {
      this.playExplosion(distance, pan);
    } finally {
      this.activeSpatial = undefined;
    }
  }

  public playSpatialFootstep(opts: {
    surface?: FloorSurface;
    stance?: MovementStance;
    distance: number;
    pan: number;
    pos: Vec3;
    occluded?: boolean;
  }) {
    this.activeSpatial = { pos: opts.pos, occluded: opts.occluded };
    try {
      this.playFootstep(opts);
    } finally {
      this.activeSpatial = undefined;
    }
  }

  /* ==========================================================================
   * 1. HYPER-REALISTIC 5-LAYER FIREARM ACOUSTICS + SHELL CASING FLOOR BOUNCES
   * ========================================================================== */

  public playGunshot(weaponId: WeaponId, distance = 0, pan = 0) {
    const ctx = this.ensureContext();
    if (!ctx || !this.whiteNoise || !this.pinkNoise || !this.brownNoise || this._volume <= 0.01) {
      return;
    }

    const now = ctx.currentTime;
    const isLocal = distance < 0.8;
    // Physical inverse-distance rolloff + air high-frequency absorption
    const distNorm = Math.min(1, distance / 64);
    const atten = isLocal ? 1.0 : Math.max(0.06, 1 / (1 + distance * 0.11));
    const airLp = isLocal ? 1.0 : Math.max(0.22, 1 - distNorm * 0.78);
    const tailSend = isLocal
      ? weaponId === 'mp5'
        ? 0.14
        : 0.48
      : Math.min(0.85, 0.35 + distNorm * 0.55);
    const pitchJitter = 0.96 + Math.random() * 0.08;

    // Combat Knife Swing: sharp steel air-slash whoosh + metallic ring shimmer
    if (weaponId === 'knife') {
      this.triggerNoiseLayer(
        ctx,
        this.pinkNoise,
        now,
        0.16,
        'bandpass',
        2600 * pitchJitter,
        520,
        2.2,
        0.42 * atten,
        pan,
        0.12,
        false,
        0.014
      );
      this.triggerToneLayer(
        ctx,
        'sine',
        now + 0.01,
        0.09,
        3400 * pitchJitter,
        2100,
        0.05 * atten,
        pan,
        0.1
      );
      return;
    }

    if (weaponId === 'm870') {
      // 12-GAUGE COMBAT SHOTGUN: Massive cannon crack + chest sub-boom + wide roar + iconic pump rack
      // Layer 1: Supersonic blast transient crack
      this.triggerNoiseLayer(
        ctx,
        this.whiteNoise,
        now,
        0.06,
        'bandpass',
        2800 * airLp * pitchJitter,
        650,
        0.8,
        0.95 * atten,
        pan,
        tailSend,
        true
      );
      // Layer 2: Gargantuan gunpowder low-mid roar
      this.triggerNoiseLayer(
        ctx,
        this.pinkNoise,
        now,
        0.42,
        'lowpass',
        1850 * airLp,
        130,
        0.7,
        0.98 * atten,
        pan,
        tailSend * 1.15,
        true
      );
      // Layer 3: Heavy sub-bass chest cannon punch
      this.triggerToneLayer(
        ctx,
        'triangle',
        now,
        0.28,
        138 * pitchJitter,
        28,
        0.88 * atten,
        pan,
        tailSend * 0.4
      );
      this.triggerNoiseLayer(
        ctx,
        this.brownNoise,
        now,
        0.34,
        'lowpass',
        260,
        55,
        0.6,
        0.68 * atten,
        pan,
        tailSend * 0.5
      );

      // Layer 4 & 5: Mechanical M870 Pump-Action Rack (*CHKK-CHKK*) + hollow plastic 12ga shell drop
      if (isLocal) {
        // Pull-back pump ratchet + ejector click
        this.triggerNoiseLayer(ctx, this.whiteNoise, now + 0.22, 0.085, 'bandpass', 1450, 920, 3.2, 0.34, 0.08, 0.14);
        this.triggerToneLayer(ctx, 'triangle', now + 0.23, 0.045, 760, 420, 0.14, 0.08, 0.08);
        // Forward chamber lock heavy metallic slam
        this.triggerNoiseLayer(ctx, this.whiteNoise, now + 0.36, 0.09, 'bandpass', 1950, 1280, 3.4, 0.38, 0.08, 0.16);
        this.triggerToneLayer(ctx, 'triangle', now + 0.365, 0.05, 1180, 580, 0.16, 0.08, 0.1);
        // Hollow plastic 12-gauge shell bouncing on ground
        this.scheduleShellBounce(ctx, now + 0.58, 'shotgun');
      }
      return;
    }

    if (weaponId === 'awp') {
      // .338 LAPUA MAGNUM AWM BOLT-ACTION SNIPER: Colossal sonic boom + cannon shockwave + mechanical bolt rack!
      this.triggerNoiseLayer(
        ctx,
        this.whiteNoise,
        now,
        0.06,
        'highpass',
        1450 * airLp,
        650 * airLp,
        0.7,
        1.0 * atten,
        pan,
        tailSend * 1.25,
        true
      );
      this.triggerNoiseLayer(
        ctx,
        this.pinkNoise,
        now,
        0.58,
        'lowpass',
        2600 * airLp * pitchJitter,
        110,
        0.8,
        1.0 * atten,
        pan,
        tailSend * 1.35,
        true
      );
      this.triggerToneLayer(
        ctx,
        'sawtooth',
        now,
        0.32,
        125 * pitchJitter,
        24,
        0.92 * atten,
        pan,
        tailSend * 0.55
      );
      this.triggerNoiseLayer(
        ctx,
        this.brownNoise,
        now,
        0.48,
        'lowpass',
        240,
        38,
        0.65,
        0.82 * atten,
        pan,
        tailSend * 0.7
      );
      if (isLocal) {
        // Iconic AWM Bolt-Action Cycle: lift & pull back -> eject heavy .338 brass -> push forward & lock!
        this.triggerNoiseLayer(ctx, this.whiteNoise, now + 0.34, 0.065, 'bandpass', 2800, 1600, 3.6, 0.32, 0.14, 0.14);
        this.triggerToneLayer(ctx, 'triangle', now + 0.345, 0.04, 1050, 620, 0.15, 0.14, 0.08);
        this.triggerNoiseLayer(ctx, this.whiteNoise, now + 0.54, 0.07, 'bandpass', 3200, 1400, 3.8, 0.36, 0.14, 0.16);
        this.triggerToneLayer(ctx, 'triangle', now + 0.55, 0.045, 1380, 520, 0.18, 0.14, 0.1);
        this.scheduleShellBounce(ctx, now + 0.72, 'rifle');
      }
      return;
    }

    if (weaponId === 'psg1') {
      // 7.62x51mm PRECISION SNIPER: Thunderous supersonic whip + massive barrel resonance + long canyon echo
      this.triggerNoiseLayer(
        ctx,
        this.whiteNoise,
        now,
        0.045,
        'highpass',
        1800 * airLp,
        900 * airLp,
        0.7,
        0.92 * atten,
        pan,
        tailSend * 1.1,
        true
      );
      this.triggerNoiseLayer(
        ctx,
        this.pinkNoise,
        now,
        0.48,
        'lowpass',
        2900 * airLp * pitchJitter,
        150,
        0.8,
        0.92 * atten,
        pan,
        tailSend * 1.25,
        true
      );
      this.triggerToneLayer(
        ctx,
        'sawtooth',
        now,
        0.24,
        155 * pitchJitter,
        29,
        0.78 * atten,
        pan,
        tailSend * 0.45
      );
      this.triggerNoiseLayer(
        ctx,
        this.brownNoise,
        now,
        0.38,
        'lowpass',
        300,
        48,
        0.7,
        0.65 * atten,
        pan,
        tailSend * 0.6
      );
      if (isLocal) {
        // Heavy roller-delayed steel bolt slam + heavy rifle brass casing clink
        this.triggerNoiseLayer(ctx, this.whiteNoise, now + 0.045, 0.055, 'bandpass', 3100, 1800, 4.0, 0.2, 0.15, 0.1);
        this.scheduleShellBounce(ctx, now + 0.42, 'rifle');
      }
      return;
    }

    if (weaponId === 'scar') {
      // SCAR-H 7.62x51mm NATO BATTLE RIFLE: Heavy muscular punch + sharp muzzle brake crack + tight CNC bolt
      this.triggerNoiseLayer(
        ctx,
        this.whiteNoise,
        now,
        0.036,
        'bandpass',
        3100 * airLp * pitchJitter,
        1050,
        1.0,
        0.84 * atten,
        pan,
        tailSend * 1.05,
        true
      );
      this.triggerNoiseLayer(
        ctx,
        this.pinkNoise,
        now,
        0.28,
        'lowpass',
        2350 * airLp * pitchJitter,
        175,
        0.85,
        0.84 * atten,
        pan,
        tailSend * 1.08,
        true
      );
      this.triggerToneLayer(
        ctx,
        'triangle',
        now,
        0.16,
        152 * pitchJitter,
        36,
        0.76 * atten,
        pan,
        tailSend * 0.35
      );
      if (isLocal) {
        this.triggerNoiseLayer(ctx, this.whiteNoise, now + 0.028, 0.042, 'bandpass', 2900, 1750, 4.2, 0.24, 0.14, 0.12);
        this.scheduleShellBounce(ctx, now + 0.4, 'rifle');
      }
      return;
    }

    if (weaponId === 'p90') {
      // FN P90 5.7x28mm TACTICAL PDW: Crisp ultra-fast high-velocity zip + snappy polymer bullpup bolt
      this.triggerNoiseLayer(
        ctx,
        this.whiteNoise,
        now,
        0.026,
        'bandpass',
        4100 * airLp * pitchJitter,
        1550,
        1.3,
        0.64 * atten,
        pan,
        tailSend * 0.72,
        true
      );
      this.triggerNoiseLayer(
        ctx,
        this.pinkNoise,
        now,
        0.13,
        'lowpass',
        2450 * airLp * pitchJitter,
        320,
        0.95,
        0.58 * atten,
        pan,
        tailSend * 0.75
      );
      this.triggerToneLayer(
        ctx,
        'triangle',
        now,
        0.08,
        220 * pitchJitter,
        66,
        0.48 * atten,
        pan,
        0.18
      );
      if (isLocal) {
        this.triggerNoiseLayer(ctx, this.whiteNoise, now + 0.02, 0.028, 'bandpass', 3800, 2200, 4.4, 0.2, 0.1, 0.08);
        this.scheduleShellBounce(ctx, now + 0.34, 'pistol');
      }
      return;
    }

    if (weaponId === 'mp5') {
      // SUPPRESSED 9mm MP5-N: Authentic suppressed tactical *THWIP-CLACK* (subsonic gas puff + crisp steel bolt!)
      this.triggerNoiseLayer(
        ctx,
        this.whiteNoise,
        now,
        0.042,
        'bandpass',
        3600 * airLp * pitchJitter,
        1350,
        1.6,
        0.34 * atten,
        pan,
        tailSend,
        false
      );
      this.triggerNoiseLayer(
        ctx,
        this.pinkNoise,
        now,
        0.095,
        'lowpass',
        1400 * airLp,
        280,
        0.9,
        0.38 * atten,
        pan,
        tailSend
      );
      this.triggerToneLayer(
        ctx,
        'sine',
        now,
        0.065,
        245 * pitchJitter,
        74,
        0.36 * atten,
        pan,
        0.08
      );
      if (isLocal) {
        // Crisp mechanical H&K bolt clack (prominent on suppressed SMG!)
        this.triggerNoiseLayer(ctx, this.whiteNoise, now + 0.022, 0.032, 'bandpass', 4200, 2600, 4.5, 0.22, 0.14, 0.08);
        this.scheduleShellBounce(ctx, now + 0.36, 'pistol');
      }
      return;
    }

    if (weaponId === 'ak74') {
      // AK-74M ASSAULT RIFLE: Raw throatier mid-bark + heavy stamped-steel bolt clatter
      this.triggerNoiseLayer(
        ctx,
        this.whiteNoise,
        now,
        0.032,
        'bandpass',
        2700 * airLp * pitchJitter,
        950,
        1.0,
        0.78 * atten,
        pan,
        tailSend,
        true
      );
      this.triggerNoiseLayer(
        ctx,
        this.pinkNoise,
        now,
        0.24,
        'lowpass',
        2150 * airLp * pitchJitter,
        210,
        0.9,
        0.76 * atten,
        pan,
        tailSend,
        true
      );
      this.triggerToneLayer(
        ctx,
        'triangle',
        now,
        0.14,
        175 * pitchJitter,
        42,
        0.64 * atten,
        pan,
        tailSend * 0.3
      );
      if (isLocal) {
        // Iconic gritty AK steel piston/bolt clank
        this.triggerNoiseLayer(ctx, this.whiteNoise, now + 0.03, 0.045, 'bandpass', 2400, 1450, 3.8, 0.24, 0.14, 0.12);
        this.triggerToneLayer(ctx, 'square', now + 0.032, 0.028, 1650 * pitchJitter, 980, 0.06, 0.14, 0.08);
        this.scheduleShellBounce(ctx, now + 0.38, 'rifle');
      }
      return;
    }

    if (weaponId === 'deagle') {
      // DESERT EAGLE .50 AE: Sharp metallic hand-cannon crack + heavy ringing slide snap
      this.triggerNoiseLayer(
        ctx,
        this.whiteNoise,
        now,
        0.04,
        'bandpass',
        3600 * airLp * pitchJitter,
        1100,
        0.9,
        0.86 * atten,
        pan,
        tailSend * 1.1,
        true
      );
      this.triggerNoiseLayer(
        ctx,
        this.pinkNoise,
        now,
        0.28,
        'lowpass',
        2750 * airLp,
        240,
        0.85,
        0.8 * atten,
        pan,
        tailSend,
        true
      );
      this.triggerToneLayer(
        ctx,
        'sawtooth',
        now,
        0.16,
        205 * pitchJitter,
        46,
        0.66 * atten,
        pan,
        tailSend * 0.35
      );
      if (isLocal) {
        this.triggerNoiseLayer(ctx, this.whiteNoise, now + 0.028, 0.04, 'bandpass', 4100, 2200, 4.2, 0.24, 0.1, 0.1);
        this.scheduleShellBounce(ctx, now + 0.4, 'rifle');
      }
      return;
    }

    // DEFAULT: M4A1 TACTICAL (5.56mm NATO): Tight crisp supersonic crack + punchy AR-15 buffer spring
    this.triggerNoiseLayer(
      ctx,
      this.whiteNoise,
      now,
      0.028,
      'bandpass',
      3500 * airLp * pitchJitter,
      1150,
      1.1,
      0.74 * atten,
      pan,
      tailSend,
      true
    );
    this.triggerNoiseLayer(
      ctx,
      this.pinkNoise,
      now,
      0.19,
      'lowpass',
      2650 * airLp * pitchJitter,
      280,
      0.85,
      0.68 * atten,
      pan,
      tailSend,
      true
    );
    this.triggerToneLayer(
      ctx,
      'triangle',
      now,
      0.11,
      205 * pitchJitter,
      48,
      0.56 * atten,
      pan,
      tailSend * 0.28
    );
    if (isLocal) {
      // Crisp AR-15 bolt cycle + subtle buffer spring metallic ping
      this.triggerNoiseLayer(ctx, this.whiteNoise, now + 0.024, 0.036, 'bandpass', 3800, 2100, 4.4, 0.18, 0.14, 0.08);
      this.triggerToneLayer(ctx, 'sine', now + 0.028, 0.055, 1980 * pitchJitter, 1820, 0.032, 0.12, 0.06);
      this.scheduleShellBounce(ctx, now + 0.36, 'rifle');
    }
  }

  /**
   * Schedules authentic surface-aware brass casing or plastic shotgun shell bounces on the ground.
   */
  private scheduleShellBounce(
    ctx: AudioContext,
    baseTime: number,
    kind: 'rifle' | 'pistol' | 'shotgun'
  ) {
    if (!this.whiteNoise) return;
    const isSoftSand = this.currentSurface === 'sand';
    const pan = 0.28 + Math.random() * 0.34; // ejects to player's right!

    if (kind === 'shotgun') {
      // Hollow polymer 12ga hull clack-clack
      const bounces = isSoftSand ? [0, 0.14] : [0, 0.13, 0.23];
      bounces.forEach((dt, idx) => {
        const amp = (isSoftSand ? 0.055 : 0.11) * Math.pow(0.6, idx);
        this.triggerNoiseLayer(
          ctx,
          this.whiteNoise!,
          baseTime + dt,
          0.028,
          'bandpass',
          1350 + Math.random() * 240,
          950,
          5.0,
          amp,
          pan,
          0.08
        );
      });
      return;
    }

    // Metallic brass casing high-Q resonant tinkle on concrete/asphalt vs muffled on sand
    const baseFreq = kind === 'pistol' ? 5600 : 4650;
    const bounces = isSoftSand ? [0, 0.11] : [0, 0.12, 0.21];
    bounces.forEach((dt, idx) => {
      const f = baseFreq + (Math.random() - 0.5) * 650 + idx * 180;
      const amp = (isSoftSand ? 0.022 : 0.068) * Math.pow(0.58, idx);
      const decay = isSoftSand ? 0.022 : 0.052;
      this.triggerToneLayer(ctx, 'sine', baseTime + dt, decay, f, f * 0.985, amp, pan, 0.1);
      this.triggerToneLayer(ctx, 'triangle', baseTime + dt, decay * 0.7, f * 1.41, f * 1.38, amp * 0.45, pan, 0.08);
    });
  }

  /* ==========================================================================
   * 2. AUTHENTIC MULTI-STAGE WEAPON RELOAD, DRY FIRE, EQUIP, ADS & INSPECT FOLEY
   * ========================================================================== */

  public playReload(weaponId: WeaponId = 'm4a1', durationSec = 2.0) {
    const ctx = this.ensureContext();
    if (!ctx || !this.whiteNoise || !this.pinkNoise || this._volume <= 0.01) return;
    const now = ctx.currentTime;
    const d = Math.max(1.0, Math.min(3.4, durationSec));

    if (weaponId === 'm870') {
      // Tactical shotgun shell-by-shell thumb loading into under-barrel tube + final pump rack!
      const shellCount = 4;
      for (let i = 0; i < shellCount; i++) {
        const t = now + 0.18 + i * (d * 0.17);
        // Shell sliding past spring gate
        this.triggerNoiseLayer(ctx, this.pinkNoise, t, 0.055, 'bandpass', 1100, 1800, 2.5, 0.16, -0.05, 0.08);
        // Metallic loading gate *click-snap*
        this.triggerNoiseLayer(ctx, this.whiteNoise, t + 0.045, 0.03, 'bandpass', 3200, 1900, 4.2, 0.2, 0, 0.1);
        this.triggerToneLayer(ctx, 'triangle', t + 0.045, 0.025, 1450, 720, 0.08, 0, 0.06);
      }
      // Final pump chamber check
      const tRack = now + d * 0.82;
      this.triggerNoiseLayer(ctx, this.whiteNoise, tRack, 0.08, 'bandpass', 1500, 950, 3.0, 0.28, 0.05, 0.12);
      this.triggerNoiseLayer(ctx, this.whiteNoise, tRack + 0.13, 0.08, 'bandpass', 2000, 1200, 3.2, 0.32, 0.05, 0.14);
      return;
    }

    // STAGE 1: Magazine release catch *click* + metallic magwell slide-out scrape
    this.triggerNoiseLayer(ctx, this.whiteNoise, now + 0.04, 0.028, 'bandpass', 3600, 2200, 5.0, 0.22, 0.08, 0.08);
    this.triggerNoiseLayer(ctx, this.pinkNoise, now + 0.11, 0.15, 'bandpass', 1450, 620, 2.4, 0.18, 0.05, 0.1);

    // STAGE 2: Tactical vest pouch cloth rustle drawing fresh magazine
    const tDraw = now + d * 0.34;
    this.triggerNoiseLayer(ctx, this.pinkNoise, tDraw, 0.2, 'bandpass', 950, 1650, 1.3, 0.15, -0.18, 0.06, false, 0.03);

    // STAGE 3: Firm fresh magazine slam + latch lock *THUNK-CLACK*
    const tInsert = now + d * 0.58;
    this.triggerNoiseLayer(ctx, this.pinkNoise, tInsert, 0.07, 'lowpass', 720, 180, 1.2, 0.34, 0.04, 0.14);
    this.triggerToneLayer(ctx, 'triangle', tInsert, 0.055, 220, 78, 0.26, 0.04, 0.08);
    this.triggerNoiseLayer(ctx, this.whiteNoise, tInsert + 0.042, 0.035, 'bandpass', 3100, 1750, 4.5, 0.28, 0.04, 0.12);

    // STAGE 4: Charging handle pull / bolt release metallic *CLACK-SLAP*
    const tBolt = now + d * 0.8;
    this.triggerNoiseLayer(ctx, this.whiteNoise, tBolt, 0.06, 'bandpass', 2400, 3400, 3.5, 0.24, 0.1, 0.12);
    this.triggerNoiseLayer(ctx, this.whiteNoise, tBolt + 0.095, 0.055, 'bandpass', 3600, 1600, 3.8, 0.34, 0.1, 0.16);
    this.triggerToneLayer(ctx, 'triangle', tBolt + 0.095, 0.04, 1280, 460, 0.14, 0.1, 0.1);
  }

  public playDryFire() {
    const nowMs = performance.now();
    if (nowMs - this.lastDryFireMs < 160) return;
    this.lastDryFireMs = nowMs;

    const ctx = this.ensureContext();
    if (!ctx || !this.whiteNoise || this._volume <= 0.01) return;
    const now = ctx.currentTime;
    // Crisp metallic firing-pin hammer *click*
    this.triggerNoiseLayer(ctx, this.whiteNoise, now, 0.022, 'bandpass', 4400, 2600, 5.5, 0.24, 0.06, 0.08);
    this.triggerToneLayer(ctx, 'triangle', now, 0.018, 2200, 900, 0.09, 0.06, 0.05);
  }

  public playEquip(weaponId: WeaponId = 'm4a1') {
    const ctx = this.ensureContext();
    if (!ctx || !this.whiteNoise || !this.pinkNoise || this._volume <= 0.01) return;
    const now = ctx.currentTime;

    if (weaponId === 'knife') {
      // Tactical kydex sheath draw + razor steel *shing*
      this.triggerNoiseLayer(ctx, this.whiteNoise, now, 0.13, 'bandpass', 3200, 6200, 4.5, 0.18, 0.14, 0.12, false, 0.012);
      this.triggerToneLayer(ctx, 'sine', now + 0.015, 0.12, 4200, 5100, 0.055, 0.14, 0.12);
      return;
    }

    if (weaponId === 'frag') {
      // Pouch rustle + metal safety ring jingle
      this.triggerNoiseLayer(ctx, this.pinkNoise, now, 0.12, 'bandpass', 1100, 750, 1.5, 0.14, 0.1, 0.06);
      this.triggerToneLayer(ctx, 'sine', now + 0.05, 0.07, 5200, 4800, 0.05, 0.12, 0.08);
      return;
    }

    // Tactical rifle sling & nylon rustle + receiver safety selector *click*
    this.triggerNoiseLayer(ctx, this.pinkNoise, now, 0.15, 'bandpass', 880, 520, 1.2, 0.18, 0.1, 0.08, false, 0.018);
    this.triggerNoiseLayer(ctx, this.whiteNoise, now + 0.075, 0.032, 'bandpass', 3100, 1900, 4.2, 0.2, 0.12, 0.1);
    this.triggerToneLayer(ctx, 'triangle', now + 0.08, 0.026, 920, 480, 0.08, 0.12, 0.06);
  }

  public playAds(entering: boolean) {
    const ctx = this.ensureContext();
    if (!ctx || !this.pinkNoise || !this.whiteNoise || this._volume <= 0.01) return;
    const now = ctx.currentTime;
    // Soft rifle-stock shoulder contact + tactical uniform cloth rub
    this.triggerNoiseLayer(
      ctx,
      this.pinkNoise,
      now,
      0.095,
      'bandpass',
      entering ? 720 : 540,
      entering ? 1150 : 380,
      1.6,
      0.11,
      0.1,
      0.04,
      false,
      0.015
    );
    if (entering) {
      this.triggerNoiseLayer(ctx, this.whiteNoise, now + 0.035, 0.022, 'bandpass', 2400, 1600, 3.6, 0.075, 0.1, 0.04);
    }
  }

  public playInspect() {
    const ctx = this.ensureContext();
    if (!ctx || !this.pinkNoise || !this.whiteNoise || this._volume <= 0.01) return;
    const now = ctx.currentTime;
    this.triggerNoiseLayer(ctx, this.pinkNoise, now, 0.14, 'bandpass', 900, 1300, 1.4, 0.1, 0.05, 0.06, false, 0.02);
    this.triggerNoiseLayer(ctx, this.whiteNoise, now + 0.11, 0.03, 'bandpass', 2900, 2100, 4.0, 0.12, 0.08, 0.08);
  }

  /* ==========================================================================
   * 3. LIFELIKE SURFACE-AWARE HUMAN MOVEMENT FOLEY (WALK, SPRINT, CROUCH, JUMP,
   *    LANDING, TACTICAL SLIDE & LEAN GEAR SHIFT)
   * ========================================================================== */

  public playFootstep(
    sprintingOrOpts:
      | boolean
      | {
          surface?: FloorSurface;
          stance?: MovementStance;
          distance?: number;
          pan?: number;
        } = false
  ) {
    const ctx = this.ensureContext();
    if (!ctx || !this.whiteNoise || !this.pinkNoise || !this.brownNoise || this._volume <= 0.01) {
      return;
    }

    const opts =
      typeof sprintingOrOpts === 'boolean'
        ? { surface: this.currentSurface, stance: (sprintingOrOpts ? 'sprint' : 'walk') as MovementStance, distance: 0, pan: 0 }
        : {
            surface: sprintingOrOpts.surface ?? this.currentSurface,
            stance: sprintingOrOpts.stance ?? 'walk',
            distance: sprintingOrOpts.distance ?? 0,
            pan: sprintingOrOpts.pan ?? 0,
          };

    const isLocal = opts.distance < 0.8;
    const atten = isLocal ? 1.0 : Math.max(0.05, 1 / (1 + opts.distance * 0.24));
    if (atten < 0.06) return;

    const now = ctx.currentTime;
    // Left / right foot slight natural pitch & stereo cadence alternation
    this.stepFootIndex = (this.stepFootIndex + 1) % 2;
    const footPitch = (this.stepFootIndex === 0 ? 0.94 : 1.06) * (0.96 + Math.random() * 0.08);
    const footPan = isLocal ? (this.stepFootIndex === 0 ? -0.1 : 0.1) : opts.pan;

    const stanceGain =
      opts.stance === 'sprint' ? 1.0 : opts.stance === 'crouch' ? 0.34 : 0.68;
    const g = stanceGain * atten;
    const rev = this.currentMap === 'warehouse' ? 0.22 : 0.08;

    if (opts.surface === 'sand') {
      // SAND: Soft earth heel compression + granular sandy grit crunch & toe-push scatter!
      // Heel thud
      this.triggerNoiseLayer(ctx, this.brownNoise, now, 0.075, 'lowpass', 180 * footPitch, 68, 0.9, 0.26 * g, footPan, rev * 0.5);
      // Granular sand crunch (heel)
      this.triggerNoiseLayer(ctx, this.pinkNoise, now + 0.005, 0.085, 'bandpass', 1350 * footPitch, 780, 1.4, 0.22 * g, footPan, rev, false, 0.008);
      // Toe push-off fine sand scatter
      this.triggerNoiseLayer(ctx, this.whiteNoise, now + 0.045, 0.075, 'bandpass', 2800 * footPitch, 1650, 1.8, 0.12 * g, footPan, rev, false, 0.01);
    } else if (opts.surface === 'concrete') {
      // CONCRETE: Crisp combat-boot rubber lug heel strike + solid slab knock + toe scuff
      // Solid boot heel thump
      this.triggerToneLayer(ctx, 'triangle', now, 0.052, 128 * footPitch, 48, 0.24 * g, footPan, rev);
      // Crisp hard rubber-on-concrete slap
      this.triggerNoiseLayer(ctx, this.pinkNoise, now, 0.055, 'bandpass', 620 * footPitch, 290, 1.8, 0.25 * g, footPan, rev * 1.3);
      // Subtle toe roll & fine warehouse dust grit
      this.triggerNoiseLayer(ctx, this.whiteNoise, now + 0.042, 0.045, 'bandpass', 1900 * footPitch, 1100, 2.2, 0.095 * g, footPan, rev);
    } else {
      // ASPHALT: Firm street sole strike + coarse tarmac gravel grit crunch
      this.triggerToneLayer(ctx, 'triangle', now, 0.048, 115 * footPitch, 44, 0.22 * g, footPan, rev);
      this.triggerNoiseLayer(ctx, this.pinkNoise, now, 0.065, 'bandpass', 840 * footPitch, 420, 1.5, 0.24 * g, footPan, rev);
      this.triggerNoiseLayer(ctx, this.whiteNoise, now + 0.032, 0.06, 'bandpass', 3100 * footPitch, 1800, 2.0, 0.13 * g, footPan, rev);
    }

    // Tactical Gear & Ripstop Trouser Foley Layer (louder on sprint, quiet on crouch stealth)
    if (isLocal && opts.stance !== 'crouch') {
      const gearAmp = opts.stance === 'sprint' ? 0.12 : 0.055;
      // Uniform nylon leg swish
      this.triggerNoiseLayer(ctx, this.pinkNoise, now + 0.015, 0.09, 'bandpass', 1050 * footPitch, 680, 1.2, gearAmp, footPan, 0.04, false, 0.018);
      // Subtle sling/pouch buckle rattle when sprinting
      if (opts.stance === 'sprint') {
        this.triggerNoiseLayer(ctx, this.whiteNoise, now + 0.025, 0.028, 'bandpass', 3600 * footPitch, 2500, 4.8, 0.055, 0.05, 0.05);
      }
    }
  }

  public playJump(surface: FloorSurface = this.currentSurface) {
    const ctx = this.ensureContext();
    if (!ctx || !this.pinkNoise || !this.brownNoise || !this.whiteNoise || this._volume <= 0.01) return;
    const now = ctx.currentTime;

    // 1. Energetic boot push-off against surface
    this.triggerNoiseLayer(
      ctx,
      this.pinkNoise,
      now,
      0.11,
      'bandpass',
      surface === 'sand' ? 1450 : 780,
      surface === 'sand' ? 680 : 320,
      1.3,
      0.24,
      0,
      0.1
    );
    this.triggerToneLayer(ctx, 'triangle', now, 0.07, 130, 52, 0.2, 0, 0.06);

    // 2. Tactical gear / ballistic plate upward shift + uniform cloth whoosh
    this.triggerNoiseLayer(ctx, this.pinkNoise, now + 0.02, 0.16, 'bandpass', 620, 1280, 1.4, 0.16, 0, 0.05, false, 0.02);
    this.triggerNoiseLayer(ctx, this.whiteNoise, now + 0.045, 0.04, 'bandpass', 3200, 2200, 4.2, 0.075, 0.06, 0.05);
  }

  public playLand(surface: FloorSurface = this.currentSurface, impactStrength = 0.75) {
    const ctx = this.ensureContext();
    if (!ctx || !this.brownNoise || !this.pinkNoise || !this.whiteNoise || this._volume <= 0.01) return;
    const now = ctx.currentTime;
    const s = Math.max(0.4, Math.min(1.4, impactStrength));
    const rev = this.currentMap === 'warehouse' ? 0.28 : 0.12;

    // 1. Heavy dual-boot body weight thud
    this.triggerToneLayer(ctx, 'sine', now, 0.11, 108, 34, 0.44 * s, 0, rev * 0.5);
    this.triggerNoiseLayer(ctx, this.brownNoise, now, 0.13, 'lowpass', 240, 55, 0.8, 0.42 * s, 0, rev);

    // 2. Surface-authentic boot scuff & grit burst (left + slight 25ms right foot settle)
    const surfFreq = surface === 'sand' ? 1600 : surface === 'asphalt' ? 1200 : 740;
    this.triggerNoiseLayer(ctx, this.pinkNoise, now, 0.12, 'bandpass', surfFreq, 420, 1.3, 0.3 * s, -0.1, rev);
    this.triggerNoiseLayer(ctx, this.pinkNoise, now + 0.028, 0.095, 'bandpass', surfFreq * 1.15, 480, 1.4, 0.22 * s, 0.1, rev);

    // 3. Heavy Plate Carrier & mag pouch gear compression jolt
    this.triggerNoiseLayer(ctx, this.whiteNoise, now + 0.02, 0.06, 'bandpass', 2900, 1600, 3.6, 0.14 * s, 0.05, 0.08);
    this.triggerNoiseLayer(ctx, this.pinkNoise, now + 0.015, 0.15, 'bandpass', 850, 420, 1.1, 0.16 * s, 0, 0.06);
  }

  public playCrouch(entering: boolean) {
    const ctx = this.ensureContext();
    if (!ctx || !this.pinkNoise || !this.whiteNoise || this._volume <= 0.01) return;
    const now = ctx.currentTime;

    // Authentic heavy ripstop trouser fold + tactical knee-pad & vest shift
    this.triggerNoiseLayer(
      ctx,
      this.pinkNoise,
      now,
      0.16,
      'bandpass',
      entering ? 960 : 620,
      entering ? 460 : 1080,
      1.3,
      0.17,
      0,
      0.04,
      false,
      0.024
    );
    // Subtle leather duty-belt / gear creak
    this.triggerNoiseLayer(
      ctx,
      this.whiteNoise,
      now + 0.035,
      0.055,
      'bandpass',
      entering ? 2100 : 2500,
      1350,
      3.4,
      0.065,
      0.06,
      0.04
    );
  }

  public playLean() {
    const ctx = this.ensureContext();
    if (!ctx || !this.pinkNoise || this._volume <= 0.01) return;
    const now = ctx.currentTime;
    // Quiet tactical jacket & shoulder sling shift when peeking corners
    this.triggerNoiseLayer(ctx, this.pinkNoise, now, 0.1, 'bandpass', 780, 520, 1.5, 0.085, 0, 0.03, false, 0.016);
  }

  public playSlide(surface: FloorSurface = this.currentSurface) {
    const ctx = this.ensureContext();
    if (!ctx || !this.pinkNoise || !this.whiteNoise || !this.brownNoise || this._volume <= 0.01) return;
    const now = ctx.currentTime;
    const rev = this.currentMap === 'warehouse' ? 0.25 : 0.12;

    // Initial knee-pad drop impact
    this.triggerToneLayer(ctx, 'triangle', now, 0.08, 125, 42, 0.28, 0, 0.08);
    // Sustained gritty surface skid (sand spray / concrete scrape / asphalt grind)
    const startF = surface === 'sand' ? 2200 : surface === 'asphalt' ? 1750 : 1250;
    this.triggerNoiseLayer(ctx, this.pinkNoise, now, 0.48, 'bandpass', startF, 340, 1.3, 0.36, 0, rev, false, 0.02);
    this.triggerNoiseLayer(ctx, this.whiteNoise, now + 0.02, 0.42, 'bandpass', startF * 1.4, 620, 2.0, 0.18, 0, rev, false, 0.03);
    // Heavy uniform friction & vest gear settle at end of slide
    this.triggerNoiseLayer(ctx, this.brownNoise, now, 0.38, 'lowpass', 220, 75, 0.8, 0.24, 0, rev * 0.5);
  }

  /* ==========================================================================
   * 4. BALLISTIC IMPACTS, BULLET FLYBY WHIZ, GRENADES & CINEMATIC EXPLOSIONS
   * ========================================================================== */

  public playBulletWhiz(pan = 0) {
    const nowMs = performance.now();
    if (nowMs - this.lastWhizMs < 130) return;
    this.lastWhizMs = nowMs;

    const ctx = this.ensureContext();
    if (!ctx || !this.whiteNoise || !this.pinkNoise || this._volume <= 0.01) return;
    const now = ctx.currentTime;

    // Supersonic ballistic *CRACK-WHIZZ* Doppler zip past player's head!
    this.triggerNoiseLayer(ctx, this.whiteNoise, now, 0.022, 'highpass', 3200, 1400, 0.9, 0.38, pan, 0.18, true);
    this.triggerNoiseLayer(ctx, this.pinkNoise, now + 0.012, 0.14, 'bandpass', 2900, 480, 4.2, 0.32, pan, 0.12, false, 0.008);
    this.triggerToneLayer(ctx, 'sine', now + 0.01, 0.11, 1850 + Math.random() * 450, 390, 0.12, pan, 0.08);
  }

  public playBulletImpact(surface: ImpactSurface, distance = 8, pan = 0) {
    const ctx = this.ensureContext();
    if (!ctx || !this.whiteNoise || !this.pinkNoise || !this.brownNoise || this._volume <= 0.01) return;
    const atten = Math.max(0.06, 1 / (1 + distance * 0.14));
    if (atten < 0.08) return;
    const now = ctx.currentTime;

    if (surface === 'headshot') {
      // Visceral ballistic helmet crack + crisp impact snap
      this.triggerNoiseLayer(ctx, this.whiteNoise, now, 0.05, 'bandpass', 2800, 1100, 1.8, 0.42 * atten, pan, 0.12, true);
      this.triggerToneLayer(ctx, 'triangle', now, 0.075, 1950, 620, 0.24 * atten, pan, 0.1);
      return;
    }

    if (surface === 'flesh') {
      // Dense Kevlar/body kinetic thump
      this.triggerNoiseLayer(ctx, this.brownNoise, now, 0.07, 'lowpass', 340, 90, 0.9, 0.36 * atten, pan, 0.06);
      this.triggerNoiseLayer(ctx, this.pinkNoise, now, 0.045, 'bandpass', 950, 380, 1.4, 0.2 * atten, pan, 0.04);
      return;
    }

    if (surface === 'metal') {
      // Steel container ricochet *ZING!*
      this.triggerNoiseLayer(ctx, this.whiteNoise, now, 0.04, 'bandpass', 4200, 2200, 4.0, 0.28 * atten, pan, 0.22);
      this.triggerToneLayer(ctx, 'sine', now, 0.18, 3400 + Math.random() * 1100, 1650, 0.14 * atten, pan, 0.24);
      return;
    }

    // Concrete / Sandstone / Cover chip & dust spray
    this.triggerNoiseLayer(ctx, this.pinkNoise, now, 0.085, 'bandpass', 1550, 420, 1.2, 0.26 * atten, pan, 0.18);
    this.triggerNoiseLayer(ctx, this.whiteNoise, now + 0.015, 0.07, 'highpass', 2400, 1200, 1.0, 0.12 * atten, pan, 0.14);
  }

  public playGrenadeThrow() {
    const ctx = this.ensureContext();
    if (!ctx || !this.whiteNoise || !this.pinkNoise || this._volume <= 0.01) return;
    const now = ctx.currentTime;
    // Steel pin pull *zing* + safety spoon release *ping* + arm throw air whoosh
    this.triggerToneLayer(ctx, 'sine', now, 0.05, 4800, 5600, 0.08, 0.1, 0.08);
    this.triggerNoiseLayer(ctx, this.whiteNoise, now + 0.045, 0.025, 'bandpass', 3800, 2600, 5.0, 0.14, 0.1, 0.08);
    this.triggerNoiseLayer(ctx, this.pinkNoise, now + 0.07, 0.17, 'bandpass', 1200, 380, 1.5, 0.26, 0.06, 0.08, false, 0.02);
  }

  public playExplosion(distance = 0, pan = 0) {
    const ctx = this.ensureContext();
    if (!ctx || !this.whiteNoise || !this.pinkNoise || !this.brownNoise || this._volume <= 0.01) return;
    const atten = Math.max(0.1, 1 / (1 + distance * 0.055));
    const airLp = Math.max(0.28, 1 - Math.min(1, distance / 65) * 0.72);
    const now = ctx.currentTime;

    // Layer 1: Supersonic detonation pressure crack
    this.triggerNoiseLayer(ctx, this.whiteNoise, now, 0.085, 'bandpass', 2400 * airLp, 420, 0.7, 1.0 * atten, pan, 0.65, true);
    // Layer 2: Massive sub-bass chest shockwave
    this.triggerToneLayer(ctx, 'sine', now, 0.68, 92, 19, 0.96 * atten, pan, 0.35);
    this.triggerNoiseLayer(ctx, this.brownNoise, now, 0.95, 'lowpass', 320, 36, 0.7, 0.95 * atten, pan, 0.7, true);
    // Layer 3: Rolling concussive fireball roar
    this.triggerNoiseLayer(ctx, this.pinkNoise, now + 0.015, 1.15, 'lowpass', 1350 * airLp, 78, 0.8, 0.88 * atten, pan, 0.85, true);
    // Layer 4: Delayed falling shrapnel & gravel debris patter
    for (let i = 0; i < 6; i++) {
      const dt = 0.24 + i * 0.1 + Math.random() * 0.09;
      this.triggerNoiseLayer(
        ctx,
        this.whiteNoise,
        now + dt,
        0.045,
        'bandpass',
        1800 + Math.random() * 2200,
        750,
        2.6,
        (0.14 - i * 0.016) * atten,
        Math.max(-0.9, Math.min(0.9, pan + (Math.random() - 0.5) * 0.6)),
        0.2
      );
    }
  }

  public playDamageTaken(headshot = false) {
    const ctx = this.ensureContext();
    if (!ctx || !this.brownNoise || !this.pinkNoise || !this.whiteNoise || this._volume <= 0.01) return;
    const now = ctx.currentTime;
    // Heavy Kevlar punch + sub-bass wind knocked out of chest
    this.triggerToneLayer(ctx, 'sine', now, 0.14, 118, 36, 0.52, 0, 0.06);
    this.triggerNoiseLayer(ctx, this.brownNoise, now, 0.16, 'lowpass', 280, 70, 0.9, 0.44, 0, 0.08);
    if (headshot) {
      // Helmet dink + brief high-pitched concussion ring
      this.triggerNoiseLayer(ctx, this.whiteNoise, now, 0.055, 'bandpass', 3200, 1400, 2.2, 0.38, 0, 0.15, true);
      this.triggerToneLayer(ctx, 'sine', now + 0.02, 0.35, 3650, 3580, 0.075, 0, 0.1);
    }
  }

  /* ==========================================================================
   * 5. CRISP MODERN TACTICAL COMBAT FEEDBACK & UI SOUNDS
   * ========================================================================== */

  public playHitmarker(headshot: boolean) {
    const ctx = this.ensureContext();
    if (!ctx || !this.whiteNoise || this._volume <= 0.01) return;
    const now = ctx.currentTime;
    if (headshot) {
      // Ultra-satisfying tactical helmet *DINK-CRUNCH* confirmation!
      this.triggerNoiseLayer(ctx, this.whiteNoise, now, 0.032, 'bandpass', 3600, 1800, 3.0, 0.3, 0, 0.08);
      this.triggerToneLayer(ctx, 'sine', now, 0.095, 1980, 2650, 0.28, 0, 0.1);
      this.triggerToneLayer(ctx, 'triangle', now + 0.015, 0.07, 1320, 1780, 0.16, 0, 0.08);
    } else {
      // Crisp percussive modern FPS hit tick
      this.triggerNoiseLayer(ctx, this.whiteNoise, now, 0.024, 'bandpass', 2400, 1200, 2.6, 0.22, 0, 0.04);
      this.triggerToneLayer(ctx, 'triangle', now, 0.045, 980, 440, 0.18, 0, 0.03);
    }
  }

  public playKillChime() {
    const ctx = this.ensureContext();
    if (!ctx || this._volume <= 0.01) return;
    const now = ctx.currentTime;
    // Tight heroic modern tactical elimination chord (clean, never arcade-y)
    this.triggerToneLayer(ctx, 'triangle', now, 0.11, 587.33, 587.33, 0.14, 0, 0.12);
    this.triggerToneLayer(ctx, 'sine', now + 0.04, 0.16, 880, 880, 0.15, 0, 0.16);
    this.triggerToneLayer(ctx, 'sine', now + 0.085, 0.2, 1174.66, 1174.66, 0.11, 0, 0.2);
  }

  public playSupplyPickup() {
    const ctx = this.ensureContext();
    if (!ctx || !this.whiteNoise || !this.pinkNoise || this._volume <= 0.01) return;
    const now = ctx.currentTime;
    // Ammo crate latch pop + pouch zip + crisp tactical confirmation tone
    this.triggerNoiseLayer(ctx, this.whiteNoise, now, 0.035, 'bandpass', 2600, 1500, 3.4, 0.2, 0, 0.08);
    this.triggerNoiseLayer(ctx, this.pinkNoise, now + 0.04, 0.12, 'bandpass', 1400, 2400, 1.8, 0.14, 0, 0.06);
    this.triggerToneLayer(ctx, 'sine', now + 0.06, 0.12, 660, 880, 0.12, 0, 0.12);
    this.triggerToneLayer(ctx, 'sine', now + 0.12, 0.16, 990, 990, 0.11, 0, 0.14);
  }

  public playCountdownBeep(final = false) {
    const ctx = this.ensureContext();
    if (!ctx || this._volume <= 0.01) return;
    const now = ctx.currentTime;
    if (final) {
      this.triggerToneLayer(ctx, 'triangle', now, 0.22, 880, 1318.5, 0.2, 0, 0.18);
      this.triggerToneLayer(ctx, 'sine', now + 0.05, 0.28, 1318.5, 1318.5, 0.16, 0, 0.22);
    } else {
      this.triggerToneLayer(ctx, 'sine', now, 0.11, 659.25, 659.25, 0.13, 0, 0.12);
    }
  }

  public playUiClick() {
    const ctx = this.ensureContext();
    if (!ctx || !this.whiteNoise || this._volume <= 0.01) return;
    const now = ctx.currentTime;
    // Crisp tactile hardware switch click routed to UI bus
    this.triggerNoiseLayer(ctx, this.whiteNoise, now, 0.015, 'bandpass', 3200, 1800, 3.5, 0.08, 0, 0, false, 0.002, 'ui');
    this.triggerToneLayer(ctx, 'triangle', now, 0.03, 920, 520, 0.06, 0, 0, 0.002, 'ui');
  }

  public playRadioChirp() {
    const ctx = this.ensureContext();
    if (!ctx || !this.whiteNoise || this._volume <= 0.01) return;
    const now = ctx.currentTime;
    // Authentic Tactical PTT squelch burst + dual-tone roger beep routed to Voice bus
    this.triggerNoiseLayer(ctx, this.whiteNoise, now, 0.045, 'bandpass', 2200, 1800, 3.2, 0.14, 0, 0, false, 0.002, 'voice');
    this.triggerToneLayer(ctx, 'sine', now + 0.035, 0.042, 1480, 1480, 0.11, 0, 0, 0.002, 'voice');
    this.triggerToneLayer(ctx, 'sine', now + 0.08, 0.048, 1980, 1980, 0.11, 0, 0, 0.002, 'voice');
    this.triggerNoiseLayer(ctx, this.whiteNoise, now + 0.13, 0.038, 'bandpass', 2400, 1700, 3.0, 0.1, 0, 0, false, 0.002, 'voice');
  }
}

export const soundEngine = new SoundEngine();
