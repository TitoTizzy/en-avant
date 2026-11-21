/* Harden the established editorial whitelist while preserving Quill formatting. */
(() => {
  'use strict';
  const purifier = window.DOMPurify;
  if (!purifier) { window.EA_sanitizeHTML = () => ''; return; }
  purifier.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.attrName === 'class' && !/^(ql-[\w-]+\s*)+$/.test(data.attrValue)) data.keepAttr = false;
    if (node.nodeName === 'IMG' && data.attrName === 'src') {
      const value = data.attrValue.trim();
      if (value.startsWith('/') && !value.startsWith('//')) return;
      try { if (new URL(value).protocol !== 'https:') data.keepAttr = false; }
      catch { data.keepAttr = false; }
    }
  });
  purifier.addHook('afterSanitizeAttributes', node => {
    if (node.nodeName === 'A' && node.hasAttribute('href')) {
      node.setAttribute('rel', 'noopener noreferrer nofollow');
      node.setAttribute('target', '_blank');
    }
    if (node.nodeName === 'IMG') node.setAttribute('loading', 'lazy');
  });
  window.EA_sanitizeHTML = html => purifier.sanitize(String(html ?? ''), {
    ALLOWED_TAGS: ['p','br','strong','b','em','i','u','s','a','ul','ol','li','h2','h3','h4',
      'blockquote','pre','code','img','span','figure','figcaption','hr'],
    ALLOWED_ATTR: ['href','title','src','alt','width','height','class'],
    ALLOW_DATA_ATTR: false,
  });
})();
