/* ==========================================================================
   EN AVANT — PREMIUM.JS
   Micro-interactions partagées par toutes les pages (vanilla, zéro dépendance).
   Chaque module est défensif : il ne s'active que si la page s'y prête.
   ========================================================================== */

document.documentElement.classList.add("js-ready");

(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.addEventListener("DOMContentLoaded", () => {
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
     S'appuie sur le cookie `googtrans` + widget Google Translate masqué. */
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

    const getLang = () => {
      const match = document.cookie.match(/(?:^|;\s*)googtrans=([^;]+)/);
      const code = match ? decodeURIComponent(match[1]).split("/")[2] : "fr";
      return LANGS.some(([c]) => c === code) ? code : "fr";
    };

    const current = getLang();

    const GLOBE =
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/>' +
      '<path d="M12 2c2.5 2.7 4 6.2 4 10s-1.5 7.3-4 10c-2.5-2.7-4-6.2-4-10s1.5-7.3 4-10z"/></svg>';

    const build = () => {
      const wrap = document.createElement("div");
      wrap.className = "ea-lang notranslate";
      wrap.setAttribute("translate", "no");
      wrap.innerHTML =
        '<button type="button" class="ea-lang-btn" aria-haspopup="true" aria-expanded="false" ' +
        `aria-label="Changer de langue">${GLOBE}<span>${current.toUpperCase()}</span></button>` +
        '<div class="ea-lang-menu" role="menu">' +
        LANGS.map(
          ([code, label]) =>
            `<button type="button" role="menuitem" data-lang="${code}"` +
            ` class="${code === current ? "active" : ""}">${label}<span>${code.toUpperCase()}</span></button>`
        ).join("") +
        "</div>";
      return wrap;
    };

    const apply = (code) => {
      if (code === getLang()) return;

      const host = window.location.hostname;
      const expire = "expires=Thu, 01 Jan 1970 00:00:00 GMT";
      document.cookie = `googtrans=;path=/;${expire}`;
      document.cookie = `googtrans=;path=/;domain=${host};${expire}`;
      document.cookie = `googtrans=;path=/;domain=.${host};${expire}`;

      if (code !== "fr") {
        document.cookie = `googtrans=/fr/${code};path=/`;
        document.cookie = `googtrans=/fr/${code};path=/;domain=${host}`;
      }

      window.location.reload();
    };

    // Injection : barre desktop (avant « Faire un don ») + menu mobile
    const mounts = [];
    const actions = document.querySelector(".u-nav-actions");
    if (actions) mounts.push([actions, actions.querySelector(".btn-primary")]);
    const linksCta = document.querySelector(".u-links-cta");
    if (linksCta) mounts.push([linksCta, linksCta.querySelector(".btn-primary")]);

    // Aucun point de montage (page sans nav publique) : pas de sélecteur.
    if (!mounts.length) return;

    mounts.forEach(([parent, before]) => {
      const ui = build();
      parent.insertBefore(ui, before || null);

      const toggle = ui.querySelector(".ea-lang-btn");
      toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        const open = ui.classList.toggle("open");
        toggle.setAttribute("aria-expanded", String(open));
      });

      ui.querySelectorAll("[data-lang]").forEach((item) =>
        item.addEventListener("click", () => apply(item.dataset.lang))
      );
    });

    const closeAll = () =>
      document.querySelectorAll(".ea-lang.open").forEach((el) => {
        el.classList.remove("open");
        el.querySelector(".ea-lang-btn").setAttribute("aria-expanded", "false");
      });

    document.addEventListener("click", closeAll);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeAll();
    });

    // Le widget reste invisible mais est chargé sur chaque page. Le site est
    // codé une seule fois en français ; Google traduit le DOM à la demande.
    if (!document.getElementById("ea-gt")) {
      const slot = document.createElement("div");
      slot.id = "ea-gt";
      document.body.appendChild(slot);

      window.eaGtInit = () => {
        /* global google */
        new google.translate.TranslateElement(
          { pageLanguage: "fr", includedLanguages: "fr,en,ht,es", autoDisplay: false },
          "ea-gt"
        );
      };

      const script = document.createElement("script");
      script.src = "https://translate.google.com/translate_a/element.js?cb=eaGtInit";
      script.async = true;
      document.head.appendChild(script);
    }
  }

  /* Chatbot (placeholder en attendant le module IA) */
  function initChatbot() {
    const fab = document.getElementById("chatbotFab");
    if (!fab || fab.dataset.eaBound) return;
    fab.dataset.eaBound = "1";

    fab.addEventListener("click", () => {
      alert("Le module de chat sera bientôt disponible.");
    });
  }

  /* Navigation auth-aware : "Connexion" → prénom du membre si session active */
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
        link.innerHTML = `<i class="fa-solid fa-circle-user" aria-hidden="true"></i> <span>${display}</span>`;
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
