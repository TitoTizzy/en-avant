import {
  createHmac,
  timingSafeEqual,
} from 'node:crypto';

const COOKIE_NAME = 'ea_admin_pin';
const MAX_AGE_SECONDS = 30 * 60;

function secret() {
  const value = process.env.ADMIN_PIN_COOKIE_SECRET;
  if (!value || value.length < 32) {
    throw new Error('ADMIN_PIN_COOKIE_SECRET manquant ou trop court.');
  }
  return value;
}

function sign(payload) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function parseCookies(req) {
  return String(req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim().split('='))
    .reduce((cookies, [name, ...rest]) => {
      if (name) cookies[name] = rest.join('=');
      return cookies;
    }, {});
}

function secureAttribute(req) {
  const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '');
  return process.env.VERCEL || forwardedProto === 'https' ? '; Secure' : '';
}

export function createPinCookie(req, userId) {
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  })).toString('base64url');

  return `${COOKIE_NAME}=${payload}.${sign(payload)}; Path=/; HttpOnly${secureAttribute(req)}; SameSite=Strict; Max-Age=${MAX_AGE_SECONDS}`;
}

export function clearPinCookie(req) {
  return `${COOKIE_NAME}=; Path=/; HttpOnly${secureAttribute(req)}; SameSite=Strict; Max-Age=0`;
}

export function hasValidPinCookie(req, userId) {
  try {
    const token = parseCookies(req)[COOKIE_NAME];
    if (!token) return false;

    const [payload, receivedSignature] = token.split('.');
    if (!payload || !receivedSignature) return false;

    const expected = Buffer.from(sign(payload));
    const received = Buffer.from(receivedSignature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      return false;
    }

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.sub === userId && Number(data.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}
