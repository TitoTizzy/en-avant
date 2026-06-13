// Dispatcher /api/trivia/* → /api/_trivia/:action
// vercel.json redirige /api/trivia/:path → /api/trivia?action=:path
import questionsHandler from './_trivia/questions.js';
import scoreHandler from './_trivia/score.js';
import generateHandler from './_trivia/generate.js';
import generateSessionHandler from './_trivia/generate-session.js';
import { json } from './_lib/http.js';

export default async function handler(req, res) {
  const action = req.query?.action;
  switch (action) {
    case 'questions':         return questionsHandler(req, res);
    case 'score':             return scoreHandler(req, res);
    case 'generate':          return generateHandler(req, res);
    case 'generate-session':  return generateSessionHandler(req, res);
    default:                  return json(res, 404, { error: 'Route inconnue.' });
  }
}
