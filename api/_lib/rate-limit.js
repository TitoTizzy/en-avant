import { createHash } from 'node:crypto';
import { getServiceClient } from './supabase.js';
import { json } from './http.js';

// Atomic counters shared by every serverless instance. Missing migration fails closed.
export async function enforceDurableRateLimit(req, res, {
  key, limit = 10, windowMs = 600000, subject, message = 'Limite atteinte. Réessayez plus tard.',
}) {
  const ip = String(req.headers['x-vercel-forwarded-for']
    || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const digest = createHash('sha256').update(`${key}:${subject || ip}`).digest('hex');
  try {
    const { data, error } = await getServiceClient().rpc('ea_take_rate_limit', {
      p_key: digest, p_limit: limit, p_window_seconds: Math.ceil(windowMs / 1000),
    });
    if (error) throw error;
    if (data === true) return true;
    res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
    json(res, 429, { error: message });
  } catch (error) {
    console.error('Rate limit unavailable:', error.code || 'unknown');
    json(res, 503, { error: 'Service temporairement indisponible.' });
  }
  return false;
}
