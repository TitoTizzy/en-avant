import sanitizeHtml from 'sanitize-html';

// Deliberately excludes images, embeds, styles and event handlers.
export function sanitizeArticle(value) {
  return sanitizeHtml(String(value ?? ''), {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h2', 'h3', 'h4',
      'blockquote', 'ul', 'ol', 'li', 'a', 'pre', 'code'],
    allowedAttributes: { a: ['href', 'title'] },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowProtocolRelative: false,
  });
}

export function escapeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
