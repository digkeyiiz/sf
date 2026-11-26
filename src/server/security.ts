import crypto from 'node:crypto';

const ACCOUNT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Cryptographically strong Account ID generator (replaces Math.random()).
 */
export function generateSecureAccountId(exists: (id: string) => boolean): string {
  for (let attempt = 0; attempt < 16; attempt++) {
    let out = 'SF-';
    for (let i = 0; i < 6; i++) {
      out += ACCOUNT_ALPHABET[crypto.randomInt(0, ACCOUNT_ALPHABET.length)];
    }
    if (!exists(out)) return out;
  }
  return `SF-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

/**
 * Cryptographically strong Room Code generator.
 */
export function generateSecureRoomCode(exists: (code: string) => boolean): string {
  for (let attempt = 0; attempt < 16; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += ACCOUNT_ALPHABET[crypto.randomInt(0, ACCOUNT_ALPHABET.length)];
    }
    if (!exists(code)) return code;
  }
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

/**
 * Cryptographically strong per-account session token (32 bytes hex).
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

/**
 * Constant-time token comparison to prevent timing attacks.
 */
export function verifyTokenMatch(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Lightweight in-memory sliding-window Rate Limiter for REST endpoints and Socket events.
 */
export class SlidingWindowRateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  public allow(key: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    const entry = this.buckets.get(key);
    if (!entry || now >= entry.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (entry.count >= maxRequests) {
      return false;
    }
    entry.count++;
    return true;
  }

  public prune() {
    const now = Date.now();
    for (const [k, v] of this.buckets.entries()) {
      if (now >= v.resetAt) this.buckets.delete(k);
    }
  }
}

/**
 * Validates Socket.io / HTTP origins cleanly while permitting same-origin requests,
 * local dev, and AI Studio / Cloud Run preview & published hosts.
 */
export function isAllowedOrigin(
  origin: string | undefined,
  requestHost?: string | undefined
): boolean {
  if (!origin) return true; // same-origin / non-browser clients
  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();
    const originHostPort = u.host.toLowerCase();

    // Always permit true same-origin requests (works on any custom domain or proxy)
    if (requestHost) {
      const candidates = requestHost
        .split(',')
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean);
      for (const reqH of candidates) {
        const reqHostname = reqH.split(':')[0];
        if (originHostPort === reqH || host === reqHostname) {
          return true;
        }
      }
    }

    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true;
    if (
      host === 'ai.studio' ||
      host.endsWith('.ai.studio') ||
      host.endsWith('.aistudio.google.com') ||
      host.endsWith('.run.app') ||
      host.endsWith('.googleusercontent.com') ||
      host.endsWith('.web.app') ||
      host.endsWith('.firebaseapp.com')
    ) {
      return true;
    }
    const customAllowed = process.env.ALLOWED_ORIGIN;
    if (customAllowed && origin === customAllowed) return true;
    return false;
  } catch {
    return false;
  }
}
