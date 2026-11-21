(() => {
  'use strict';
  window.EASecurity = Object.freeze({
    escapeText: value => String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c])),
    article: value => window.DOMPurify
      ? window.DOMPurify.sanitize(String(value ?? ''), {
        ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h2', 'h3', 'h4',
          'blockquote', 'ul', 'ol', 'li', 'a', 'pre', 'code'],
        ALLOWED_ATTR: ['href', 'title'], ALLOW_DATA_ATTR: false,
      }) : '', // Fail closed if the sanitizer cannot load.
  });
})();
