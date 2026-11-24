/* ==========================================================================
   EN AVANT — PREMIUM.JS
   Micro-interactions partagées par toutes les pages (vanilla, zéro dépendance).
   Chaque module est défensif : il ne s'active que si la page s'y prête.
   ========================================================================== */

document.documentElement.classList.add("js-ready");

(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const activityKey = "ea-last-activity";
  let lastActivityWrite = 0;

  function recordActivity() {
    const now = Date.now();
    if (now - lastActivityWrite < 5000) return;
    lastActivityWrite = now;
    localStorage.setItem(activityKey, String(now));
  }

  ["pointerdown", "keydown", "touchstart"].forEach((eventName) => {
    document.addEventListener(eventName, recordActivity, { passive: true });
  });
  window.addEventListener("scroll", recordActivity, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) recordActivity();
  });

  document.addEventListener("DOMContentLoaded", () => {
    if (!localStorage.getItem(activityKey)) recordActivity();
    initScrollProgress();
    initSmartHeader();
    initMobileMenu();
    initRevealEngine();
    initGlowCards();
    initBackToTop();
    initBrandFallback();
    initCounters();
    initTeamAvatars();
    initLanguage();
    initChatbot();
    initNudges();
    initAuthNav();
  });

  /* Organigramme : initiales en placeholder dans chaque pastille photo.
     Chaque emplacement est tagué [data-team-slot] — le Dashboard SuperAdmin
     pourra y associer une vraie photo (bucket `assets`) sans toucher au HTML. */
  function initTeamAvatars() {
    document.querySelectorAll(".orga-card").forEach((card) => {
      const avatar = card.querySelector(".orga-avatar");
      if (!avatar || avatar.dataset.eaInit) return;
      avatar.dataset.eaInit = "1";

      const label = (card.querySelector("p, span")?.textContent || "").trim();
      if (!label) return;

      const initials = label
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0] || "")
        .join("")
        .toUpperCase();

      avatar.textContent = initials;
      avatar.setAttribute("data-team-slot", label);
      avatar.setAttribute("title", `Photo de « ${label} » — gérable depuis le Dashboard (à venir)`);
    });
  }

  /* Barre de progression de lecture */
  function initScrollProgress() {
    const bar = document.createElement("div");
    bar.className = "ea-progress";
    bar.setAttribute("aria-hidden", "true");
    document.body.appendChild(bar);

    let ticking = false;

    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? Math.min(window.scrollY / max, 1) : 0})`;
      ticking = false;
    };

    window.addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(update);
        }
      },
      { passive: true }
    );

    update();
  }

  /* Header intelligent : verre au scroll, se masque en descendant,
     réapparaît dès qu'on remonte (uniquement si le header est fixe/sticky). */
  function initSmartHeader() {
    const header =
      document.querySelector(".u-nav") ||
      document.querySelector(".site-header") ||
      document.querySelector(".blog-header") ||
      document.querySelector("header.header");

    if (!header) return;

    const position = getComputedStyle(header).position;
    // La barre principale (.u-nav) est STATIQUE : elle ne se masque jamais.
    const canHide =
      (position === "fixed" || position === "sticky") &&
      !header.classList.contains("u-nav");

    let lastY = window.scrollY;
    let ticking = false;

    const update = () => {
      const y = window.scrollY;

      header.classList.toggle("scrolled", y > 24);

      if (canHide && !document.body.classList.contains("menu-open")) {
        const goingDown = y > lastY + 6;
        const goingUp = y < lastY - 6;

        if (goingDown && y > 240) header.classList.add("ea-header-hidden");
        else if (goingUp || y <= 240) header.classList.remove("ea-header-hidden");
      }

      lastY = y;
      ticking = false;
    };

    window.addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(update);
        }
      },
      { passive: true }
    );

    update();
  }

  /* Menu mobile unifié (.u-nav) — un seul binding même si app.js est chargé */
  function initMobileMenu() {
    const btn = document.getElementById("btn-mobile-menu");
    const nav = document.getElementById("main-nav");
    if (!btn || !nav || btn.dataset.eaBound) return;
    btn.dataset.eaBound = "1";

    const close = () => {
      nav.classList.remove("open", "menu-open", "is-open");
      btn.classList.remove("is-active");
      btn.setAttribute("aria-expanded", "false");
      document.body.classList.remove("menu-open");
    };

    btn.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("open");
      btn.classList.toggle("is-active", isOpen);
      btn.setAttribute("aria-expanded", String(isOpen));
      document.body.classList.toggle("menu-open", isOpen);
    });

    nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", close));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
  }

  /* Reveal au scroll :
     1) prend en charge les classes historiques .reveal-up/left/right
     2) tague automatiquement les composants connus avec [data-ea-reveal]
     3) cascade automatique dans les grilles (stagger) */
  function initRevealEngine() {
    const AUTO_SELECTORS = [
      ".section-head", ".section-heading",
      ".feature-card", ".mini-news-card", ".news-cta-box",
      ".process-card", ".value-card", ".order-card", ".about-card",
      ".statement-box", ".history-photo", ".history-highlight",
      ".christophe-panel", ".ea-glass-card", ".ea-form-aside",
      ".u-tile", ".u-stat", ".u-frame", ".u-cta-inner",
      ".panel-card", ".orga-card", ".structure-list li",
      ".lb-book-scene", ".lb-copy"
    ].join(",");

    document.querySelectorAll(AUTO_SELECTORS).forEach((el) => {
      const hasLegacyReveal = /(^|\s)reveal-(up|left|right)/.test(el.className);
      if (!hasLegacyReveal && !el.hasAttribute("data-ea-reveal")) {
        el.setAttribute("data-ea-reveal", "");
      }
    });

    // Cascade : décale les éléments frères révélés au sein d'un même parent
    const staggerGroups = new Map();
    document.querySelectorAll("[data-ea-reveal]").forEach((el) => {
      const parent = el.parentElement;
      if (!parent) return;
      const index = staggerGroups.get(parent) || 0;
      el.style.setProperty("--ea-delay", `${Math.min(index * 0.09, 0.45)}s`);
      staggerGroups.set(parent, index + 1);
    });

    const targets = document.querySelectorAll(
      ".reveal-up, .reveal-left, .reveal-right, .reveal-hidden, [data-ea-reveal]"
    );
    if (!targets.length) return;

    if (reduceMotion || !("IntersectionObserver" in window)) {
      targets.forEach((el) => el.classList.add("visible", "ea-in"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("visible", "ea-in");
          obs.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
    );

    targets.forEach((el) => observer.observe(el));
  }

  /* Lueur qui suit le curseur sur les cartes */
  function initGlowCards() {
    const GLOW_SELECTORS =
      ".feature-card, .mini-news-card, .process-card, .value-card," +
      " .order-card, .about-card, .ea-glass-card, .u-tile, .u-card," +
      " .chantier-card, .manifesto-card, .panel-card, .premium-blog-card," +
      " .orga-card, .statement-box, .history-highlight, .christophe-panel";

    document.querySelectorAll(GLOW_SELECTORS).forEach((el) => {
      el.setAttribute("data-ea-glow", "");
    });

    if (reduceMotion) return;

    document.querySelectorAll("[data-ea-glow]").forEach((card) => {
      card.addEventListener("pointermove", (event) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--ea-mx", `${((event.clientX - rect.left) / rect.width) * 100}%`);
        card.style.setProperty("--ea-my", `${((event.clientY - rect.top) / rect.height) * 100}%`);
      });
    });
  }

  /* Bouton retour en haut : réutilise celui de la page s'il existe, sinon l'injecte */
  function initBackToTop() {
    let button =
      document.getElementById("backToTop") || document.getElementById("back-top");

    if (!button) {
      button = document.createElement("button");
      button.className = "ea-top";
      button.type = "button";
      button.setAttribute("aria-label", "Remonter en haut");
      button.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<path d="M12 19V5m0 0-6 6m6-6 6 6" stroke="currentColor" stroke-width="2.4" ' +
        'stroke-linecap="round" stroke-linejoin="round"/></svg>';
      document.body.appendChild(button);
    }

    const toggle = () => {
      button.classList.toggle("show", window.scrollY > 480);
    };

    window.addEventListener("scroll", toggle, { passive: true });
    toggle();

    button.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    });
  }

  /* Logo absent → bascule élégante en wordmark typographié */
  function initBrandFallback() {
    document
      .querySelectorAll(".brand img, .header-logo img, .loader-logo, .footer-logo")
      .forEach((img) => {
        const swap = () => {
          const host = img.closest(".brand, .header-logo a");
          img.remove();
          if (host && !host.classList.contains("ea-no-logo")) {
            host.classList.add("ea-no-logo");
            host.insertAdjacentHTML("afterbegin", "EN AVANT<i>.</i>");
          }
        };

        if (img.complete && img.naturalWidth === 0) swap();
        else img.addEventListener("error", swap, { once: true });
      });
  }

  /* Compteurs animés ([data-ea-count] ou stats de la home) */
  function initCounters() {
    const targets = document.querySelectorAll("[data-ea-count], .vision-strip-stats strong");
    if (!targets.length || !("IntersectionObserver" in window)) return;

    const animate = (el) => {
      const raw = el.getAttribute("data-ea-count") || el.textContent.trim();
      const value = parseInt(raw, 10);
      if (Number.isNaN(value) || reduceMotion) return;

      const duration = 1200;
      const start = performance.now();

      const frame = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 4);
        el.textContent = String(Math.round(value * eased));
        if (progress < 1) requestAnimationFrame(frame);
      };

      requestAnimationFrame(frame);
    };

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          animate(entry.target);
          obs.unobserve(entry.target);
        });
      },
      { threshold: 0.6 }
    );

    targets.forEach((el) => observer.observe(el));
  }

  /* Sélecteur de langue (FR/EN/Kreyòl/ES) — injecté à côté de « Faire un don ».
     Moteur : bibliothèque gratuite GTranslate (le widget Google Translate a été
     retiré par Google le 1er octobre 2026). La langue choisie est gardée par
     GTranslate dans localStorage (`__GT_TRANSLATE_LANGS`) et réappliquée à
     chaque page. Le site reste codé une seule fois, en français. */
  function initLanguage() {
    // Jamais de traduction dans l'espace d'administration (connexion, dashboard) :
    // interfaces sensibles, français uniquement — et plus de chevauchement de boutons.
    if (document.querySelector(".adm-top, .auth-wrap")) return;

    const LANGS = [
      ["fr", "Français"],
      ["en", "English"],
      ["ht", "Kreyòl Ayisyen"],
      ["es", "Español"],
    ];
    const GT_LIB = "https://cdn.gtranslate.net/widgets/latest/lib.min.js";
    const STORE = "__GT_TRANSLATE_LANGS";

    // Nettoyage de l'ancien cookie Google (plus utilisé).
    const host = window.location.hostname;
    const expire = "expires=Thu, 01 Jan 1970 00:00:00 GMT";
    [`path=/`, `path=/;domain=${host}`, `path=/;domain=.${host}`].forEach((scope) => {
      document.cookie = `googtrans=;${scope};${expire}`;
    });

    const getLang = () => {
      try {
        const stored = JSON.parse(localStorage.getItem(STORE) || "null");
        const code = stored && stored.tgtLang;
        return LANGS.some(([c]) => c === code) ? code : "fr";
      } catch (e) {
        return "fr";
      }
    };

    let libPromise = null;
    const loadLib = () => {
      if (window.__GT && window.__GT.translator) return Promise.resolve();
      if (!libPromise) {
        libPromise = new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = GT_LIB;
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => {
            libPromise = null;
            reject(new Error("GTranslate indisponible"));
          };
          document.head.appendChild(script);
        });
      }
      return libPromise;
    };

    const GLOBE =
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/>' +
      '<path d="M12 2c2.5 2.7 4 6.2 4 10s-1.5 7.3-4 10c-2.5-2.7-4-6.2-4-10s1.5-7.3 4-10z"/></svg>';

    const build = (current) => {
      const wrap = document.createElement("div");
      wrap.className = "ea-lang notranslate";
      wrap.setAttribute("translate", "no");
      wrap.innerHTML =
        '<button type="button" class="ea-lang-btn" aria-haspopup="true" aria-expanded="false" ' +
        `aria-label="Changer de langue">${GLOBE}<span class="ea-lang-code">${current.toUpperCase()}</span></button>` +
        '<div class="ea-lang-menu" role="menu">' +
        LANGS.map(
          ([code, label]) =>
            `<button type="button" role="menuitem" data-lang="${code}"` +
            ` class="${code === current ? "active" : ""}">${label}<span>${code.toUpperCase()}</span></button>`
        ).join("") +
        "</div>";
      return wrap;
    };

    const refreshUi = (code) => {
      // Signale la langue choisie (l'assistant répond et s'affiche dans cette langue).
      document.dispatchEvent(new CustomEvent("ea:lang", { detail: code }));
      document.querySelectorAll(".ea-lang").forEach((ui) => {
        const label = ui.querySelector(".ea-lang-code");
        if (label) label.textContent = code.toUpperCase();
        ui.querySelectorAll("[data-lang]").forEach((item) =>
          item.classList.toggle("active", item.dataset.lang === code)
        );
      });
    };

    const translate = (code) =>
      loadLib()
        .then(() => {
          window.__GT.translator.translate("fr", code);
          refreshUi(code);
        })
        .catch(() => refreshUi(getLang()));

    const apply = (code) => {
      if (code === getLang()) return;
      translate(code);
    };

    // Injection : barre desktop (avant « Faire un don ») + menu mobile
    const mounts = [];
    const actions = document.querySelector(".u-nav-actions");
    if (actions) mounts.push([actions, actions.querySelector(".btn-primary")]);
    const linksCta = document.querySelector(".u-links-cta");
    if (linksCta) mounts.push([linksCta, linksCta.querySelector(".btn-primary")]);

    // Aucun point de montage (page sans nav publique) : pas de sélecteur.
    if (!mounts.length) return;

    const current = getLang();

    const closeAll = () =>
      document.querySelectorAll(".ea-lang.open").forEach((el) => {
        el.classList.remove("open");
        el.querySelector(".ea-lang-btn").setAttribute("aria-expanded", "false");
      });

    mounts.forEach(([parent, before]) => {
      const ui = build(current);
      parent.insertBefore(ui, before || null);

      const toggle = ui.querySelector(".ea-lang-btn");
      toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        const open = ui.classList.toggle("open");
        toggle.setAttribute("aria-expanded", String(open));
      });

      ui.querySelectorAll("[data-lang]").forEach((item) =>
        item.addEventListener("click", () => {
          closeAll();
          apply(item.dataset.lang);
        })
      );
    });

    document.addEventListener("click", closeAll);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeAll();
    });

    // Langue déjà choisie sur une page précédente : on la réapplique.
    if (current !== "fr") translate(current);
  }

  /* ------------------------------------------------------------------ */
  /* ASSISTANT EN AVANT (chatbot IA fondé sur le Livre blanc)             */
  /* ------------------------------------------------------------------ */
  const CHAT_KEY = "ea-chat";
  const CHAT_EXCLUDED = /^\/(admin|login|mot-de-passe)(\.html)?$/;
  // Textes de l'assistant dans les 4 langues du site (la fenêtre n'est pas passée au traducteur automatique).
  const CHAT_UI = {
    fr: {
      open: "Ouvrir l’assistant En Avant", title: "Assistant En Avant", subtitle: "Réponses tirées du Livre blanc et du site",
      welcome: "Bonjour ! Je suis l’assistant d’En Avant. Posez-moi vos questions sur le parti, le Livre blanc et ses 20 chantiers, ou sur la façon de vous engager.",
      welcomeNamed: "Bonjour {nom} ! Ravi de te revoir. De quoi veux-tu discuter aujourd’hui : le Livre blanc, un des 20 chantiers, les prochains événements ?",
      suggestions: ["Que sont les 20 chantiers ?", "Que propose En Avant pour la sécurité ?", "Comment adhérer au parti ?", "Comment faire un don ?"],
      placeholder: "Posez votre question…", send: "Envoyer", reset: "Nouvelle conversation", close: "Fermer l’assistant",
      note: "Réponses générées par une IA à partir des documents d’En Avant : elles peuvent contenir des erreurs. Ne partagez aucune donnée personnelle.",
      sources: "Sources", thinking: "Réflexion en cours", typing: "L’assistant écrit…", tooLong: "Votre question est trop longue (800 caractères au maximum).",
      offline: "Connexion impossible. Réessayez.",
    },
    en: {
      open: "Open the En Avant assistant", title: "En Avant Assistant", subtitle: "Answers from the White Paper and the website",
      welcome: "Hello! I am the En Avant assistant. Ask me about the party, its White Paper and its 20 priority areas, or how to get involved.",
      welcomeNamed: "Hi {nom}! Good to see you. What would you like to talk about today: the White Paper, one of the 20 priority areas, upcoming events?",
      suggestions: ["What are the 20 priority areas?", "What does En Avant propose for security?", "How do I join the party?", "How can I donate?"],
      placeholder: "Ask your question…", send: "Send", reset: "New conversation", close: "Close the assistant",
      note: "AI-generated answers based on En Avant’s documents: they may contain mistakes. Do not share any personal data.",
      sources: "Sources", thinking: "Thinking", typing: "The assistant is typing…", tooLong: "Your question is too long (800 characters maximum).",
      offline: "Connection failed. Please try again.",
    },
    ht: {
      open: "Louvri asistan En Avant", title: "Asistan En Avant", subtitle: "Repons ki soti nan Liv blan an ak sit la",
      welcome: "Bonjou ! Mwen se asistan En Avant. Poze m kesyon sou pati a, Liv blan an ak 20 chantye li yo, oswa sou kijan pou w angaje w.",
      welcomeNamed: "Bonjou {nom} ! Kontan wè w ankò. Sou ki sa ou vle nou pale jodi a : Liv blan an, youn nan 20 chantye yo, pwochen evènman yo ?",
      suggestions: ["Ki sa 20 chantye yo ye ?", "Ki sa En Avant pwopoze pou sekirite ?", "Kijan pou m vin manm pati a ?", "Kijan pou m fè yon don ?"],
      placeholder: "Poze kesyon ou…", send: "Voye", reset: "Nouvo konvèsasyon", close: "Fèmen asistan an",
      note: "Repons sa yo soti nan yon IA ki baze sou dokiman En Avant : yo ka gen erè. Pa pataje okenn done pèsonèl.",
      sources: "Sous", thinking: "M ap reflechi", typing: "Asistan an ap ekri…", tooLong: "Kesyon ou twò long (800 karaktè maksimòm).",
      offline: "Pa ka konekte. Eseye ankò.",
    },
    es: {
      open: "Abrir el asistente de En Avant", title: "Asistente de En Avant", subtitle: "Respuestas basadas en el Libro blanco y el sitio",
      welcome: "¡Hola! Soy el asistente de En Avant. Pregúnteme sobre el partido, su Libro blanco y sus 20 ejes de trabajo, o sobre cómo participar.",
      welcomeNamed: "¡Hola, {nom}! Qué gusto verte. ¿De qué quieres hablar hoy: el Libro blanco, uno de los 20 ejes, los próximos eventos?",
      suggestions: ["¿Cuáles son los 20 ejes de trabajo?", "¿Qué propone En Avant para la seguridad?", "¿Cómo afiliarse al partido?", "¿Cómo hacer una donación?"],
      placeholder: "Escriba su pregunta…", send: "Enviar", reset: "Nueva conversación", close: "Cerrar el asistente",
      note: "Respuestas generadas por una IA a partir de los documentos de En Avant: pueden contener errores. No comparta datos personales.",
      sources: "Fuentes", thinking: "Pensando", typing: "El asistente está escribiendo…", tooLong: "Su pregunta es demasiado larga (800 caracteres como máximo).",
      offline: "No se pudo conectar. Inténtelo de nuevo.",
    },
  };

  /** Session Supabase du navigateur (membre connecté) : jeton et nom d'usage, ou null. */
  function chatSession() {
    try {
      const url = (window.EA_ENV || {}).SUPABASE_URL || "";
      const ref = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || "rgtzwnihabkpudhwiuik";
      const session = JSON.parse(localStorage.getItem(`sb-${ref}-auth-token`) || "null");
      if (!session?.access_token) return null;
      if (session.expires_at && session.expires_at < Date.now() / 1000) return null;
      const meta = session.user?.user_metadata || {};
      const nom = String(meta.pseudo || String(meta.nom || "").trim().split(/\s+/)[0] || "").slice(0, 40);
      return { token: session.access_token, nom };
    } catch {
      return null;
    }
  }

  /** Langue choisie sur le site (sélecteur de langue), français par défaut. */
  function siteLanguage() {
    try {
      const code = JSON.parse(localStorage.getItem("__GT_TRANSLATE_LANGS") || "null")?.tgtLang;
      return Object.hasOwn(CHAT_UI, code) ? code : "fr";
    } catch {
      return "fr";
    }
  }

  function chatEscape(text) {
    return String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /** Lien sûr : chemin du site ou https://enavant.org uniquement. */
  function chatSafeUrl(url) {
    const u = String(url || "").trim();
    if (/^\/(?!\/)[\w\-./?=&#%]*$/.test(u)) return u;
    if (/^https:\/\/(www\.)?enavant\.org(\/[\w\-./?=&#%]*)?$/.test(u)) return u;
    if (/^mailto:contact@enavant\.org$/.test(u)) return u;
    return null;
  }

  /** Mise en forme minimale et sûre : **gras**, listes « - », liens internes, retours à la ligne. */
  function chatFormat(text) {
    const lines = chatEscape(text).split(/\n/);
    let html = "";
    let inList = false;
    for (const raw of lines) {
      let line = raw
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\[([^\]]{1,120})\]\(([^)\s]{1,300})\)/g, (m, label, url) => {
          const safe = chatSafeUrl(url.replace(/&amp;/g, "&"));
          return safe ? `<a href="${chatEscape(safe)}">${label}</a>` : label;
        })
        .replace(/\bcontact@enavant\.org\b/g, '<a href="mailto:contact@enavant.org">contact@enavant.org</a>');
      const item = /^\s*[-•]\s+(.*)$/.exec(line);
      if (item) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += `<li>${item[1]}</li>`;
        continue;
      }
      if (inList) { html += "</ul>"; inList = false; }
      if (line.trim()) html += `<p>${line}</p>`;
    }
    if (inList) html += "</ul>";
    return html;
  }

  function initChatbot() {
    if (CHAT_EXCLUDED.test(location.pathname)) return;
    let fab = document.getElementById("chatbotFab");
    if (!fab) {
      fab = document.createElement("button");
      fab.className = "chatbot-fab";
      fab.id = "chatbotFab";
      fab.innerHTML = '<span class="chatbot-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5C4 4.12 5.12 3 6.5 3h11C18.88 3 20 4.12 20 5.5v7c0 1.38-1.12 2.5-2.5 2.5H11l-4.2 3.4c-.33.27-.8.03-.8-.4V15.8C4.84 15.57 4 14.62 4 13.5v-8z" fill="currentColor"/></svg></span><span class="chatbot-dot"></span>';
      document.body.appendChild(fab);
    }
    if (fab.dataset.eaBound) return;
    fab.dataset.eaBound = "1";
    fab.type = "button";
    fab.classList.add("notranslate");
    fab.setAttribute("translate", "no");
    fab.setAttribute("aria-expanded", "false");
    let lang = siteLanguage();
    const t = () => CHAT_UI[lang];
    fab.setAttribute("aria-label", t().open);

    let panel = null;
    let busy = false;
    let history = [];
    try { history = JSON.parse(sessionStorage.getItem(CHAT_KEY) || "[]").slice(-20); } catch { history = []; }
    // Langue de la conversation (sert seulement quand un message n'a pas de langue identifiable : « ok »).
    let convLang = { conv: null };
    try { convLang = { ...convLang, ...JSON.parse(sessionStorage.getItem(`${CHAT_KEY}-langue`) || "{}") }; } catch { /* ignore */ }
    const save = () => {
      try {
        sessionStorage.setItem(CHAT_KEY, JSON.stringify(history.slice(-20)));
        sessionStorage.setItem(`${CHAT_KEY}-langue`, JSON.stringify(convLang));
      } catch { /* ignore */ }
    };

    function bubble(role, html, sources) {
      const log = panel.querySelector(".eac-log");
      const el = document.createElement("div");
      el.className = `eac-msg eac-msg--${role}`;
      el.innerHTML = html;
      if (sources?.length) {
        const s = document.createElement("p");
        s.className = "eac-sources";
        s.innerHTML = `${t().sources} : ` + sources.map((src) => {
          const url = chatSafeUrl(src.url);
          return url ? `<a href="${chatEscape(url)}">${chatEscape(src.titre)}</a>` : chatEscape(src.titre);
        }).join(" · ");
        el.appendChild(s);
      }
      log.appendChild(el);
      log.scrollTop = log.scrollHeight;
      return el;
    }

    function renderAll() {
      const log = panel.querySelector(".eac-log");
      log.innerHTML = "";
      const nom = chatSession()?.nom;
      bubble("bot", chatFormat(nom ? t().welcomeNamed.replace("{nom}", nom) : t().welcome));
      history.forEach((m) => bubble(m.role === "user" ? "user" : "bot",
        m.role === "user" ? `<p>${chatEscape(m.content)}</p>` : chatFormat(m.content), m.sources));
      panel.querySelector(".eac-suggest").hidden = history.length > 0;
    }

    async function send(question) {
      const text = String(question || "").trim();
      if (!text || busy) return;
      if (text.length > 800) {
        bubble("bot", `<p>${chatEscape(t().tooLong)}</p>`);
        return;
      }
      busy = true;
      const input = panel.querySelector("textarea");
      input.value = "";
      input.style.height = "";
      panel.querySelector(".eac-suggest").hidden = true;
      bubble("user", `<p>${chatEscape(text)}</p>`);
      const typing = bubble("bot eac-typing",
        `<span class="eac-thinking">${chatEscape(t().thinking)}</span><span></span><span></span><span></span>`);
      typing.setAttribute("aria-label", t().typing);
      const previous = history.map(({ role, content }) => ({ role, content }));
      let answer = null;
      try {
        const session = chatSession();
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
          body: JSON.stringify({
            question: text, langue: lang, langue_conv: convLang.conv,
            history: previous, stream: true,
          }),
        });
        const type = String(res.headers?.get?.("Content-Type") || "");
        if (!res.ok || !type.includes("ndjson") || !res.body?.getReader) {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || t().offline);
          typing.remove();
          answer = bubble("bot", chatFormat(data.reponse), data.sources);
          if (data.langue) convLang = { conv: data.langue };
          history.push({ role: "user", content: text }, { role: "assistant", content: data.reponse, sources: data.sources || [] });
          save();
          return;
        }
        // Réponse en flux : le texte apparaît progressivement, à un rythme régulier.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let target = "";
        let shown = 0;
        let final = null;
        let failure = null;
        let timer = null;
        const render = () => {
          if (!answer) { typing.remove(); answer = bubble("bot eac-streaming", ""); }
          answer.innerHTML = chatFormat(target.slice(0, shown)) || "<p></p>";
          const last = answer.lastElementChild?.tagName === "UL" ? answer.lastElementChild.lastElementChild : answer.lastElementChild;
          if (last && shown < target.length) last.insertAdjacentHTML("beforeend", '<span class="eac-caret"></span>');
          const log = panel.querySelector(".eac-log");
          log.scrollTop = log.scrollHeight;
        };
        const revealed = new Promise((resolve) => {
          const tick = () => {
            if (shown < target.length) {
              shown = Math.min(target.length, shown + Math.max(2, Math.ceil((target.length - shown) / 24)));
              render();
            } else if (final || failure) {
              clearInterval(timer);
              resolve();
            }
          };
          timer = setInterval(tick, 28);
        });
        const handle = (raw) => {
          if (!raw.trim()) return;
          let msg;
          try { msg = JSON.parse(raw); } catch { return; }
          if (msg.type === "meta") convLang = { conv: msg.langue || convLang.conv };
          else if (msg.type === "delta") target += msg.text;
          else if (msg.type === "done") { final = msg; target = msg.reponse; }
          else if (msg.type === "error") failure = msg.error;
        };
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop();
          lines.forEach(handle);
        }
        handle(buffer + decoder.decode());
        if (!final && !failure) failure = t().offline;
        await revealed;
        if (failure && !target) throw new Error(failure);
        typing.remove();
        if (!answer) answer = bubble("bot", "");
        answer.className = "eac-msg eac-msg--bot";
        answer.innerHTML = chatFormat(target);
        const sources = final?.sources || [];
        if (sources.length) {
          const s = document.createElement("p");
          s.className = "eac-sources";
          s.innerHTML = `${t().sources} : ` + sources.map((src) => {
            const url = chatSafeUrl(src.url);
            return url ? `<a href="${chatEscape(url)}">${chatEscape(src.titre)}</a>` : chatEscape(src.titre);
          }).join(" · ");
          answer.appendChild(s);
        }
        history.push({ role: "user", content: text }, { role: "assistant", content: target, sources });
        save();
      } catch (error) {
        typing.remove();
        if (answer && !answer.textContent.trim()) answer.remove();
        bubble("bot eac-error", `<p>${chatEscape(error.message || t().offline)}</p>`);
      } finally {
        busy = false;
        input.focus();
      }
    }

    function build() {
      panel = document.createElement("section");
      panel.className = "eac-panel";
      panel.id = "eaChatPanel";
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "Assistant En Avant");
      panel.hidden = true;
      panel.classList.add("notranslate");
      panel.setAttribute("translate", "no");
      panel.innerHTML = `
        <header class="eac-head">
          <img src="/pictures/logo/logo.png" alt="" width="34" height="34">
          <div class="eac-title"><strong data-t="title"></strong><span data-t="subtitle"></span></div>
          <button type="button" class="eac-icon" data-chat="reset" data-t-label="reset"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z" fill="currentColor"/></svg></button>
          <button type="button" class="eac-icon" data-chat="close" data-t-label="close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z" fill="currentColor"/></svg></button>
        </header>
        <div class="eac-log" role="log" aria-live="polite"></div>
        <div class="eac-suggest"></div>
        <form class="eac-form">
          <textarea rows="1" maxlength="800"></textarea>
          <button type="submit" data-t-label="send"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" fill="currentColor"/></svg></button>
        </form>
        <p class="eac-note" data-t="note"></p>`;
      renderTexts();
      document.body.appendChild(panel);

      const input = panel.querySelector("textarea");
      panel.querySelector(".eac-form").addEventListener("submit", (event) => { event.preventDefault(); send(input.value); });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(input.value); }
      });
      input.addEventListener("input", () => {
        input.style.height = "";
        input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
      });
      panel.addEventListener("click", (event) => {
        const q = event.target.closest("[data-chat-q]");
        if (q) send(q.dataset.chatQ);
        const action = event.target.closest("[data-chat]")?.dataset.chat;
        if (action === "close") toggle(false);
        if (action === "reset") {
          history = [];
          convLang = { conv: null };
          save();
          renderAll();
          input.focus();
        }
      });
      panel.addEventListener("keydown", (event) => { if (event.key === "Escape") toggle(false); });
      renderAll();
    }

    /** Textes fixes de la fenêtre dans la langue du site. */
    function renderTexts() {
      if (!panel) return;
      const tx = t();
      panel.setAttribute("aria-label", tx.title);
      panel.setAttribute("lang", lang);
      panel.querySelectorAll("[data-t]").forEach((el) => { el.textContent = tx[el.dataset.t]; });
      panel.querySelectorAll("[data-t-label]").forEach((el) => {
        el.setAttribute("aria-label", tx[el.dataset.tLabel]);
        el.title = tx[el.dataset.tLabel];
      });
      const input = panel.querySelector("textarea");
      input.placeholder = tx.placeholder;
      input.setAttribute("aria-label", tx.placeholder);
      panel.querySelector(".eac-suggest").innerHTML = tx.suggestions
        .map((q) => `<button type="button" data-chat-q="${chatEscape(q)}">${chatEscape(q)}</button>`).join("");
    }

    // Changement de langue sur le site : la fenêtre suit, les réponses suivantes aussi.
    document.addEventListener("ea:lang", (event) => {
      if (!Object.hasOwn(CHAT_UI, event.detail) || event.detail === lang) return;
      lang = event.detail;
      fab.setAttribute("aria-label", t().open);
      if (panel) {
        renderTexts();
        renderAll();
      }
    });

    function toggle(open) {
      if (!panel) build();
      const show = open ?? panel.hidden;
      panel.hidden = !show;
      document.body.classList.toggle("eac-open", show);
      fab.setAttribute("aria-expanded", String(show));
      fab.classList.toggle("is-open", show);
      if (show) panel.querySelector("textarea").focus();
      else fab.focus();
    }

    fab.addEventListener("click", () => toggle());
  }

  /* Navigation auth-aware : "Connexion" → prénom du membre si session active */
  /* ------------------------------------------------------------------ */
  /* CARTES D'INVITATION (s'engager / faire un don)                      */
  /* Petite carte en bas à gauche, qui alterne à chaque page visitée.    */
  /* ------------------------------------------------------------------ */
  const NUDGE_KEY = "ea-nudge-n";
  const NUDGE_EXCLUDED = /^\/(admin|login|mot-de-passe)(\.html)?\/?$/;
  const NUDGE_UI = {
    fr: {
      engage: { title: "Haïti a besoin de vous", text: "Rejoignez En Avant et participez à la reconstruction du pays.", cta: "Adhérer" },
      don: { title: "Soutenez En Avant", text: "Chaque contribution aide à porter le projet des 20 chantiers.", cta: "Faire un don" },
      close: "Fermer",
    },
    en: {
      engage: { title: "Haiti needs you", text: "Join En Avant and take part in rebuilding the country.", cta: "Join" },
      don: { title: "Support En Avant", text: "Every contribution helps carry the 20-priority-area project forward.", cta: "Donate" },
      close: "Close",
    },
    ht: {
      engage: { title: "Ayiti bezwen w", text: "Vin jwenn En Avant epi patisipe nan rebati peyi a.", cta: "Vin manm" },
      don: { title: "Sipòte En Avant", text: "Chak kontribisyon ede pote pwojè 20 chantye yo.", cta: "Fè yon don" },
      close: "Fèmen",
    },
    es: {
      engage: { title: "Haití le necesita", text: "Únase a En Avant y participe en la reconstrucción del país.", cta: "Afiliarse" },
      don: { title: "Apoye a En Avant", text: "Cada contribución ayuda a impulsar el proyecto de los 20 ejes de trabajo.", cta: "Hacer una donación" },
      close: "Cerrar",
    },
  };

  /**
   * Carte à afficher sur cette page : « engage » et « don » alternent d'une page à
   * l'autre ; jamais l'invitation à adhérer sur /adherer ni pour un membre connecté,
   * jamais l'invitation au don sur /don.
   */
  function nudgeFor(path, count, member) {
    const page = path.replace(/\.html$/, "").replace(/\/$/, "") || "/";
    const allowed = ["engage", "don"].filter((kind) =>
      !(kind === "engage" && (member || /^\/adherer$/.test(page))) && !(kind === "don" && /^\/don$/.test(page)));
    if (!allowed.length) return null;
    const preferred = count % 2 === 0 ? "engage" : "don";
    return allowed.includes(preferred) ? preferred : allowed[0];
  }

  function initNudges() {
    if (NUDGE_EXCLUDED.test(location.pathname) || document.getElementById("eaNudge")) return;
    let count = 0;
    try { count = Number.parseInt(sessionStorage.getItem(NUDGE_KEY) || "0", 10) || 0; } catch { /* ignore */ }
    const kind = nudgeFor(location.pathname, count, Boolean(chatSession()));
    if (!kind) return;
    // La carte suivante sera l'autre.
    try { sessionStorage.setItem(NUDGE_KEY, String(kind === "engage" ? 1 : 2)); } catch { /* ignore */ }

    const card = document.createElement("aside");
    card.id = "eaNudge";
    card.className = `ea-nudge ea-nudge--${kind} notranslate`;
    card.setAttribute("translate", "no");
    card.setAttribute("role", "complementary");
    card.hidden = true;
    const href = kind === "engage" ? "/adherer.html" : "/don.html";
    const icon = kind === "engage" ? "fa-people-group" : "fa-heart";
    const render = () => {
      const tx = NUDGE_UI[siteLanguage()] || NUDGE_UI.fr;
      card.setAttribute("aria-label", tx[kind].title);
      card.innerHTML =
        `<span class="ea-nudge-icon" aria-hidden="true"><i class="fa-solid ${icon}"></i></span>` +
        `<div class="ea-nudge-body"><strong>${chatEscape(tx[kind].title)}</strong><p>${chatEscape(tx[kind].text)}</p>` +
        `<a class="ea-nudge-cta" href="${href}" data-nudge="${kind}">${chatEscape(tx[kind].cta)}</a></div>` +
        `<button type="button" class="ea-nudge-close" aria-label="${chatEscape(tx.close)}">&times;</button>`;
    };
    render();
    card.addEventListener("click", (event) => {
      if (!event.target.closest(".ea-nudge-close")) return;
      card.classList.remove("is-visible");
      setTimeout(() => card.remove(), 300);
    });
    document.addEventListener("ea:lang", () => { if (card.isConnected) render(); });
    document.body.appendChild(card);
    setTimeout(() => {
      if (!card.isConnected) return;
      card.hidden = false;
      requestAnimationFrame(() => card.classList.add("is-visible"));
    }, 4000);
  }

  function initAuthNav() {
    try {
      const url = (window.EA_ENV || {}).SUPABASE_URL || "";
      const ref =
        url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ||
        "rgtzwnihabkpudhwiuik";
      const raw = localStorage.getItem(`sb-${ref}-auth-token`);
      if (!raw) return;

      const session = JSON.parse(raw);
      const token = session?.access_token;
      if (!token) return;

      const expiresAt = session?.expires_at;
      if (expiresAt && expiresAt < Date.now() / 1000) return;

      const user = session?.user || {};
      const display =
        user.user_metadata?.pseudo ||
        user.user_metadata?.nom?.trim().split(/\s+/)[0] ||
        user.email?.split("@")[0] ||
        "Mon espace";

      const isAdmin = localStorage.getItem("ea-is-admin") === "1";

      document.querySelectorAll("a.u-login").forEach((link) => {
        link.href = "/membre.html";
        link.innerHTML = '<i class="fa-solid fa-circle-user" aria-hidden="true"></i> <span></span>';
        link.querySelector("span").textContent = display;
        link.setAttribute("aria-label", `Espace membre de ${display}`);

        // Bouton Dashboard visible uniquement pour le superadmin
        if (isAdmin && !link.nextElementSibling?.classList.contains("u-admin-pill")) {
          const adminLink = document.createElement("a");
          adminLink.href = "/admin.html";
          adminLink.className = "u-admin-pill";
          adminLink.title = "Dashboard Admin";
          adminLink.setAttribute("aria-label", "Dashboard Admin");
          adminLink.innerHTML = '<i class="fa-solid fa-gauge-high" aria-hidden="true"></i> <span>Admin</span>';
          link.insertAdjacentElement("afterend", adminLink);
        }
      });
    } catch {
      /* Silencieux — la nav reste inchangée en cas d'erreur */
    }
  }
})();
