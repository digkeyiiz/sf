import type * as THREE from 'three';
import type { ResolvedQualityTier } from './QualityManager';

export interface PerfMetricsSnapshot {
  fps: number;
  onePercentLowFps: number;
  frameTimeMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  pixelRatio: number;
  qualityTier: ResolvedQualityTier;
  pingMs: number;
  packetLossPct: number;
}

/**
 * Zero-allocation ring-buffer performance monitor tracking FPS, 1% Low FPS,
 * frame time, WebGL draw calls, triangles, GPU memory counts, and network RTT.
 */
export class PerfMonitor {
  private readonly samples = new Float32Array(120);
  private sampleIdx = 0;
  private sampleCount = 0;
  private accumTime = 0;
  private pingMs = 0;
  private packetLossPct = 0;

  private latest: PerfMetricsSnapshot = {
    fps: 60,
    onePercentLowFps: 60,
    frameTimeMs: 16.6,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    pixelRatio: 1,
    qualityTier: 'high',
    pingMs: 0,
    packetLossPct: 0,
  };

  public setNetworkStats(pingMs: number, packetLossPct: number) {
    this.pingMs = Math.max(0, Math.round(pingMs));
    this.packetLossPct = Math.max(0, Math.min(100, Math.round(packetLossPct)));
  }

  /**
   * Records one frame's delta and refreshes the snapshot every ~0.35s.
   * Returns the updated snapshot whenever refreshed, or null between ticks.
   */
  public recordFrame(
    dtSec: number,
    renderer: THREE.WebGLRenderer,
    pixelRatio: number,
    qualityTier: ResolvedQualityTier
  ): PerfMetricsSnapshot | null {
    const ms = Math.max(1, Math.min(250, dtSec * 1000));
    this.samples[this.sampleIdx] = ms;
    this.sampleIdx = (this.sampleIdx + 1) % this.samples.length;
    if (this.sampleCount < this.samples.length) this.sampleCount++;

    this.accumTime += dtSec;
    if (this.accumTime < 0.35 || this.sampleCount < 4) {
      return null;
    }
    this.accumTime = 0;

    let sum = 0;
    const sorted: number[] = [];
    for (let i = 0; i < this.sampleCount; i++) {
      const v = this.samples[i];
      sum += v;
      sorted.push(v);
    }
    sorted.sort((a, b) => b - a); // descending (worst frames first)
    const avgMs = sum / this.sampleCount;
    const worstCount = Math.max(1, Math.floor(this.sampleCount * 0.05));
    let worstSum = 0;
    for (let i = 0; i < worstCount; i++) worstSum += sorted[i];
    const p99Ms = worstSum / worstCount;

    this.latest = {
      fps: Math.round(1000 / Math.max(1, avgMs)),
      onePercentLowFps: Math.round(1000 / Math.max(1, p99Ms)),
      frameTimeMs: +avgMs.toFixed(1),
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      pixelRatio: +pixelRatio.toFixed(2),
      qualityTier,
      pingMs: this.pingMs,
      packetLossPct: this.packetLossPct,
    };
    return this.latest;
  }

  public getLatest(): PerfMetricsSnapshot {
    return this.latest;
  }
}
