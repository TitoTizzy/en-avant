// Nettoyage HTML côté serveur (articles) — même liste blanche que js/sanitize-html.js.
import sanitizeHtml from 'sanitize-html';

const OPTIONS = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li',
    'h2', 'h3', 'h4', 'blockquote', 'pre', 'code', 'img', 'span', 'figure', 'figcaption', 'hr'],
  allowedAttributes: {
    a: ['href', 'title', 'rel', 'target'],
    img: ['src', 'alt', 'width', 'height'],
    '*': ['class'],
  },
  allowedClasses: { '*': [/^ql-[\w-]+$/] },
  allowedSchemes: ['https', 'http', 'mailto'],
  allowedSchemesByTag: { img: ['https'] },
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'svg', 'math'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow', target: '_blank' }),
  },
};

/** Retourne un HTML ne contenant que des balises et attributs autorisés. */
export function sanitizeArticleHtml(html) {
  return sanitizeHtml(String(html ?? ''), OPTIONS).trim();
}
