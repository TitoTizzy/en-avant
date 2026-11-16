/* EN AVANT — Nettoyage HTML par liste blanche (articles).
 * Toute balise ou tout attribut absent de la liste est supprimé ; les
 * gestionnaires on*, styles, scripts, iframes et URL javascript: disparaissent.
 * Doublé côté serveur par api/_lib/sanitize.js au moment de l'enregistrement. */
(() => {
  "use strict";
  const TAGS = new Set(["p", "br", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li",
    "h2", "h3", "h4", "blockquote", "pre", "code", "img", "span", "figure", "figcaption", "hr"]);
  const DROP_WITH_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "template",
    "noscript", "svg", "math", "form", "input", "button", "textarea", "select", "link", "meta", "base"]);
  const ATTRS = { a: ["href", "title"], img: ["src", "alt", "width", "height"] };

  function safeUrl(value, { image = false } = {}) {
    const v = String(value || "").trim();
    if (!v) return null;
    if (v.startsWith("/") && !v.startsWith("//")) return v;
    try {
      const u = new URL(v);
      if (u.protocol === "https:" || (!image && (u.protocol === "http:" || u.protocol === "mailto:"))) return u.href;
    } catch { /* URL invalide */ }
    return null;
  }

  function clean(node) {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) continue;                 // texte
      if (child.nodeType !== 1) { child.remove(); continue; } // commentaires, etc.
      const tag = child.tagName.toLowerCase();
      if (DROP_WITH_CONTENT.has(tag)) { child.remove(); continue; }
      clean(child);
      if (!TAGS.has(tag)) { child.replaceWith(...child.childNodes); continue; }
      const allowed = ATTRS[tag] || [];
      for (const attr of [...child.attributes]) {
        const name = attr.name.toLowerCase();
        const keepClass = name === "class" && /^(ql-[\w-]+\s*)+$/.test(attr.value);
        if (!allowed.includes(name) && !keepClass) child.removeAttribute(attr.name);
      }
      if (tag === "a") {
        const href = safeUrl(child.getAttribute("href"));
        if (href) {
          child.setAttribute("href", href);
          child.setAttribute("rel", "noopener noreferrer nofollow");
          child.setAttribute("target", "_blank");
        } else child.removeAttribute("href");
      }
      if (tag === "img") {
        const src = safeUrl(child.getAttribute("src"), { image: true });
        if (!src) { child.remove(); continue; }
        child.setAttribute("src", src);
        child.setAttribute("loading", "lazy");
      }
    }
  }

  function sanitizeHTML(html) {
    const tpl = document.createElement("template");
    tpl.innerHTML = String(html ?? "");
    clean(tpl.content);
    return tpl.innerHTML;
  }

  window.EA_sanitizeHTML = sanitizeHTML;
})();
