// Dispatcher /api/admin/* → /api/_admin/:action
// vercel.json redirige /api/admin/:path → /api/admin?action=:path
import dashboardHandler from './_admin/dashboard.js';
import articlesHandler from './_admin/articles.js';
import eventsHandler from './_admin/events.js';
import mediaHandler from './_admin/media.js';
import teamHandler from './_admin/team.js';
import triviaHandler from './_admin/trivia.js';
import integrationsHandler from './_admin/integrations.js';
import settingsHandler from './_admin/settings.js';
import usersHandler from './_admin/users.js';
import digestHandler from './_admin/digest.js';
import notificationsHandler from './_admin/notifications.js';
import pushHandler from './_admin/push.js';
import statsHandler from './_admin/stats.js';
import newsletterHandler from './_admin/newsletter.js';
import quizCronHandler from './_admin/quiz-cron.js';
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
    case 'settings':     return settingsHandler(req, res);
    case 'users':        return usersHandler(req, res);
    case 'digest':       return digestHandler(req, res);
    case 'notifications': return notificationsHandler(req, res);
    case 'push':         return pushHandler(req, res);
    case 'stats':        return statsHandler(req, res);
    case 'newsletter':   return newsletterHandler(req, res);
    case 'quiz-cron':    return quizCronHandler(req, res);
    default:             return json(res, 404, { error: 'Route inconnue.' });
  }
}
