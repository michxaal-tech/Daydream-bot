/**
 * Signed-cookie sessions. No session store, no database — the cookie carries
 * the user id and an expiry, HMAC-signed with SESSION_SECRET so it can't be
 * forged. Rotating the secret logs everyone out, which is the intended panic
 * button.
 */
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { logger } from '../lib/logger.js';

const log = logger('web');
const COOKIE = 'daydream_session';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

let secret = process.env.SESSION_SECRET || '';
if (!secret) {
  secret = randomBytes(32).toString('hex');
  log.warn('SESSION_SECRET not set — generated a temporary one, so every restart signs you out');
}

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const sign = (payload) => createHmac('sha256', secret).update(payload).digest('base64url');

export function createSession(user) {
  const payload = b64(JSON.stringify({ ...user, exp: Date.now() + MAX_AGE_MS }));
  return `${payload}.${sign(payload)}`;
}

export function readSession(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  const expected = sign(payload);

  // Constant-time compare — a length mismatch alone is already a rejection.
  if (signature?.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

export function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim().split('='))
      .filter(([k, v]) => k && v !== undefined)
      .map(([k, ...v]) => [k, decodeURIComponent(v.join('='))])
  );
}

export function setCookie(res, name, value, { maxAgeMs = MAX_AGE_MS, secure } = {}) {
  const bits = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (secure) bits.push('Secure');
  res.append('Set-Cookie', bits.join('; '));
}

export function clearCookie(res, name) {
  res.append('Set-Cookie', `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export const SESSION_COOKIE = COOKIE;
