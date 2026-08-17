import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'pdm_professional_access';

function encode(value) {
  return Buffer.from(value).toString('base64url');
}

function signature(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function isConfigured() {
  return Boolean(process.env.ANALYSIS_ACCESS_CODE && process.env.ANALYSIS_SESSION_SECRET);
}

export function matchesAccessCode(candidate = '') {
  const expected = Buffer.from(process.env.ANALYSIS_ACCESS_CODE || '');
  const received = Buffer.from(String(candidate));
  return expected.length > 0 && expected.length === received.length && timingSafeEqual(expected, received);
}

export function createAccessToken() {
  const payload = encode(JSON.stringify({ scope: 'professional', exp: Date.now() + (8 * 60 * 60 * 1000) }));
  return `${payload}.${signature(payload, process.env.ANALYSIS_SESSION_SECRET)}`;
}

export function hasProfessionalAccess(cookieHeader = '') {
  const token = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  if (!token || !process.env.ANALYSIS_SESSION_SECRET) return false;
  const [payload, receivedSignature] = token.split('.');
  if (!payload || !receivedSignature) return false;
  const expectedSignature = signature(payload, process.env.ANALYSIS_SESSION_SECRET);
  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return false;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now(); } catch { return false; }
}

export const accessCookie = (token) => `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800`;
