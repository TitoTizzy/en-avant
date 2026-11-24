/* ==========================================================================
   EN AVANT — ŒIL « AFFICHER / MASQUER » SUR LES CHAMPS DE MOT DE PASSE
   Ajoute un bouton œil à chaque <input type="password"> (mots de passe, PIN,
   clés de l'administration), y compris ceux ajoutés plus tard dans la page.
   Le texte révélé est re-masqué à l'envoi du formulaire.
   ========================================================================== */
(() => {
  "use strict";

  const EYE = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  const EYE_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3 3l18 18M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  const LABELS = {
    show: "Afficher le mot de passe",
    hide: "Masquer le mot de passe",
  };
  let counter = 0;

  function enhance(input) {
    if (input.dataset.pwToggle) return;
    input.dataset.pwToggle = "1";
    if (!input.id) input.id = `pw-field-${++counter}`;

    const wrap = document.createElement("span");
    wrap.className = "pw-wrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "pw-toggle";
    button.setAttribute("aria-controls", input.id);
    const render = () => {
      const visible = input.type === "text";
      button.innerHTML = visible ? EYE_OFF : EYE;
      button.setAttribute("aria-label", visible ? LABELS.hide : LABELS.show);
      button.setAttribute("aria-pressed", String(visible));
      button.title = visible ? LABELS.hide : LABELS.show;
    };
    button.addEventListener("click", () => {
      const start = input.selectionStart;
      const end = input.selectionEnd;
      input.type = input.type === "password" ? "text" : "password";
      render();
      input.focus();
      try { if (start !== null) input.setSelectionRange(start, end); } catch { /* type sans sélection */ }
    });
    // Ne jamais laisser un mot de passe en clair après l'envoi.
    input.form?.addEventListener("submit", () => { input.type = "password"; render(); });
    render();
    wrap.appendChild(button);
  }

  function scan(root = document) {
    root.querySelectorAll?.('input[type="password"]').forEach(enhance);
  }

  function start() {
    scan();
    new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.matches?.('input[type="password"]')) enhance(node);
          else scan(node);
        });
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
