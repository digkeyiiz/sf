import type { GraphicsQuality } from '../../shared/controls';

export type ResolvedQualityTier = 'ultra' | 'high' | 'medium' | 'low';

export interface QualityPresetSpec {
  tier: ResolvedQualityTier;
  maxPixelRatio: number;
  minPixelRatio: number;
  shadowsEnabled: boolean;
  shadowMapSize: number;
  useBlobShadow: boolean;
  bloomEnabled: boolean;
  particlesEnabled: boolean;
  envIntensity: number;
  lodBias: number; // multiplier on LOD switch distances
  maxDecals: number;
}

const PRESETS: Record<ResolvedQualityTier, QualityPresetSpec> = {
  ultra: {
    tier: 'ultra',
    maxPixelRatio: 2.0,
    minPixelRatio: 1.25,
    shadowsEnabled: true,
    shadowMapSize: 2048,
    useBlobShadow: false,
    bloomEnabled: true,
    particlesEnabled: true,
    envIntensity: 1.05,
    lodBias: 1.25,
    maxDecals: 64,
  },
  high: {
    tier: 'high',
    maxPixelRatio: 1.75,
    minPixelRatio: 1.0,
    shadowsEnabled: true,
    shadowMapSize: 1024,
    useBlobShadow: false,
    bloomEnabled: true,
    particlesEnabled: true,
    envIntensity: 0.95,
    lodBias: 1.0,
    maxDecals: 48,
  },
  medium: {
    tier: 'medium',
    maxPixelRatio: 1.35,
    minPixelRatio: 0.85,
    shadowsEnabled: true,
    shadowMapSize: 1024,
    useBlobShadow: false,
    bloomEnabled: false,
    particlesEnabled: true,
    envIntensity: 0.88,
    lodBias: 0.85,
    maxDecals: 32,
  },
  low: {
    tier: 'low',
    maxPixelRatio: 1.0,
    minPixelRatio: 0.72,
    shadowsEnabled: false,
    shadowMapSize: 0,
    useBlobShadow: true,
    bloomEnabled: false,
    particlesEnabled: false,
    envIntensity: 0.8,
    lodBias: 0.65,
    maxDecals: 18,
  },
};

/**
 * Manages graphics quality presets and smooth Dynamic Resolution Scaling (DRS)
 * when quality is set to 'auto' (keeps mobile & mid-tier GPUs locked near 60 FPS).
 */
export class QualityManager {
  public requested: GraphicsQuality = 'auto';
  public resolved: ResolvedQualityTier = 'high';
  public currentPixelRatio = 1.0;
  private isMobile: boolean;
  private isSoftwareGl: boolean;
  private drsCooldown = 0;

  constructor(isMobile: boolean, isSoftwareGl: boolean, initial: GraphicsQuality = 'auto') {
    this.isMobile = isMobile;
    this.isSoftwareGl = isSoftwareGl;
    this.setQuality(initial);
  }

  public setQuality(q: GraphicsQuality): QualityPresetSpec {
    this.requested = q;
    if (this.isSoftwareGl) {
      this.resolved = 'low';
    } else if (q === 'auto') {
      this.resolved = this.isMobile ? 'medium' : 'high';
    } else {
      this.resolved = q;
    }

    const spec = this.getSpec();
    const nativeDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.currentPixelRatio = Math.min(nativeDpr, spec.maxPixelRatio);
    return spec;
  }

  public getSpec(): QualityPresetSpec {
    return PRESETS[this.resolved];
  }

  /**
   * Called once per second with current rolling FPS.
   * Returns a new pixelRatio if Dynamic Resolution Scaling adjusted resolution, otherwise null.
   */
  public tickDynamicResolution(fps: number, dtSec: number): number | null {
    if (this.requested !== 'auto' || this.isSoftwareGl) return null;
    this.drsCooldown -= dtSec;
    if (this.drsCooldown > 0) return null;

    const spec = this.getSpec();
    const nativeDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const maxDpr = Math.min(nativeDpr, spec.maxPixelRatio);
    const minDpr = Math.min(maxDpr, spec.minPixelRatio);

    if (fps < 44 && this.currentPixelRatio > minDpr + 0.04) {
      this.currentPixelRatio = Math.max(minDpr, +(this.currentPixelRatio - 0.12).toFixed(2));
      this.drsCooldown = 2.0;
      return this.currentPixelRatio;
    }
    if (fps > 56 && this.currentPixelRatio < maxDpr - 0.04) {
      this.currentPixelRatio = Math.min(maxDpr, +(this.currentPixelRatio + 0.08).toFixed(2));
      this.drsCooldown = 3.0;
      return this.currentPixelRatio;
    }
    return null;
  }
}
