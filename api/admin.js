// Dispatcher /api/admin/* → /api/_admin/:action
// vercel.json redirige /api/admin/:path → /api/admin?action=:path
import dashboardHandler from './_admin/dashboard.js';
import articlesHandler from './_admin/articles.js';
import eventsHandler from './_admin/events.js';
import mediaHandler from './_admin/media.js';
import teamHandler from './_admin/team.js';
import triviaHandler from './_admin/trivia.js';
import integrationsHandler from './_admin/integrations.js';
import { json } from './_lib/http.js';

export default async function handler(req, res) {
  const action = req.query?.action;
  switch (action) {
    case 'dashboard':    return dashboardHandler(req, res);
    case 'articles':     return articlesHandler(req, res);
    case 'events':       return eventsHandler(req, res);
    case 'media':        return mediaHandler(req, res);
    case 'team':         return teamHandler(req, res);
    case 'trivia':       return triviaHandler(req, res);
    case 'integrations': return integrationsHandler(req, res);
    default:             return json(res, 404, { error: 'Route inconnue.' });
  }
}
