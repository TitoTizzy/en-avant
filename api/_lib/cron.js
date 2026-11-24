// Authentification des tâches planifiées (Vercel Cron) : en-tête
// « Authorization: Bearer <CRON_SECRET> » ajouté par Vercel. Sans secret configuré, refus.
import { timingSafeEqual } from 'node:crypto';

export function cronAuthorized(req) {
  const secret = process.env.CRON_SECRET || '';
  const header = String(req.headers?.authorization || '');
  const expected = `Bearer ${secret}`;
  if (secret.length < 16 || header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}
