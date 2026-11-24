// Dispatcher /api/trivia/* → /api/_trivia/:action
// vercel.json redirige /api/trivia/:path → /api/trivia?action=:path
import questionsHandler from './_trivia/questions.js';
import answerHandler from './_trivia/answer.js';
import scoreHandler from './_trivia/score.js';
import generateHandler from './_trivia/generate.js';
import membreHandler from './_trivia/membre.js';
import classementHandler from './_trivia/classement.js';
import { json } from './_lib/http.js';

export default async function handler(req, res) {
  const action = req.query?.action;
  switch (action) {
    case 'questions':         return questionsHandler(req, res);
    case 'answer': return answerHandler(req, res);
    case 'score':             return scoreHandler(req, res);
    case 'generate':          return generateHandler(req, res);
    case 'membre':            return membreHandler(req, res);
    case 'classement':        return classementHandler(req, res);
    default:                  return json(res, 404, { error: 'Route inconnue.' });
  }
}
