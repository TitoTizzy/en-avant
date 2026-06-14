// GET /api/admin/integrations - Diagnostic de configuration sans exposer les secrets.
import { getServiceClient, requireRole } from '../_lib/supabase.js';
import { json, handleError } from '../_lib/http.js';

const present = (name) => Boolean(String(process.env[name] || '').trim());

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    await requireRole(req, ['superadmin']);

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return json(res, 405, { error: 'Méthode non autorisée.' });
    }

    const supabase = getServiceClient();
    const textPath = process.env.LIVRE_BLANC_TEXT_PATH || 'livre-blanc.txt';
    const pdfPath = process.env.LIVRE_BLANC_PDF_PATH || 'livre-blanc.pdf';
    const { data: documents, error: documentsError } = await supabase.storage
      .from('documents')
      .list('', { limit: 100 });
    const names = new Set((documents || []).map((item) => item.name));

    const stripeKey = String(process.env.STRIPE_SECRET_KEY || '');
    return json(res, 200, {
      integrations: [
        {
          id: 'stripe',
          label: 'Stripe',
          configured: present('STRIPE_SECRET_KEY') && present('STRIPE_WEBHOOK_SECRET'),
          detail: !present('STRIPE_SECRET_KEY')
            ? 'STRIPE_SECRET_KEY manquante'
            : !present('STRIPE_WEBHOOK_SECRET')
              ? 'STRIPE_WEBHOOK_SECRET manquante'
              : stripeKey.startsWith('sk_test_') ? 'Mode test configuré' : 'Mode production configuré',
        },
        {
          id: 'resend',
          label: 'Resend',
          configured: present('RESEND_API_KEY') && present('RESEND_FROM'),
          detail: present('RESEND_API_KEY') ? 'Clé et expéditeur configurés' : 'RESEND_API_KEY manquante',
        },
        {
          id: 'anthropic',
          label: 'Anthropic',
          configured: present('ANTHROPIC_API_KEY') && names.has(textPath),
          detail: !present('ANTHROPIC_API_KEY')
            ? 'ANTHROPIC_API_KEY manquante'
            : names.has(textPath) ? 'Clé et Livre blanc texte disponibles' : `${textPath} absent du bucket documents`,
        },
        {
          id: 'documents',
          label: 'Documents Supabase',
          configured: !documentsError && names.has(pdfPath) && names.has(textPath),
          detail: documentsError
            ? 'Bucket documents inaccessible'
            : `PDF ${names.has(pdfPath) ? 'présent' : 'absent'} · TXT ${names.has(textPath) ? 'présent' : 'absent'}`,
        },
      ],
      site_url: process.env.SITE_URL || null,
    });
  } catch (error) {
    return handleError(res, error, 'Diagnostic des intégrations impossible.');
  }
}
