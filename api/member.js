// /api/member — Dispatcher pour les opérations membres (12e fonction Vercel).
// Routes : /api/member/articles → _member/articles.js
//          /api/member/adhesion → _member/adhesion.js
import memberArticlesHandler from './_member/articles.js';
import memberAdhesionHandler from './_member/adhesion.js';
import { json } from './_lib/http.js';

export default async function handler(req, res) {
  const action = req.query?.action;
  switch (action) {
    case 'articles': return memberArticlesHandler(req, res);
    case 'adhesion': return memberAdhesionHandler(req, res);
    default:         return json(res, 404, { error: 'Route inconnue.' });
  }
}
