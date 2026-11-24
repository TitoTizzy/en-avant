/* ==========================================================================
   EN AVANT — QUIZ DES MEMBRES (/quiz)
   Parties de 15 questions, chrono 15 s, séries, défi de la semaine, duels,
   badges, titres, classements et carte de score à partager.
   Les points et le chrono sont calculés côté serveur : cette page n'affiche
   que ce que l'API renvoie.
   ========================================================================== */
(() => {
  "use strict";

  const CHRONO_MS = 15000;
  const SITE = "https://enavant.org";
  const PUBLIC_QUIZ = `${SITE}/trivia`;
  const TITRES = [
    { min: 0, titre: "Sympathisant" },
    { min: 1000, titre: "Militant" },
    { min: 5000, titre: "Cadre" },
    { min: 15000, titre: "Stratège" },
    { min: 40000, titre: "Visionnaire" },
  ];
  const BADGES = [
    { code: "premier_pas", nom: "Premier pas", description: "Terminer sa première partie", icone: "fa-shoe-prints" },
    { code: "serie_de_feu", nom: "Série de feu", description: "5 bonnes réponses d’affilée", icone: "fa-fire" },
    { code: "inarretable", nom: "Inarrêtable", description: "15 bonnes réponses d’affilée", icone: "fa-bolt-lightning" },
    { code: "eclair", nom: "Éclair", description: "10 réponses en moins de 5 s dans une partie", icone: "fa-bolt" },
    { code: "assidu", nom: "Assidu", description: "Jouer 7 jours différents", icone: "fa-calendar-check" },
    { code: "champion_semaine", nom: "Champion de la semaine", description: "Finir 1er du défi de la semaine", icone: "fa-trophy" },
    { code: "duelliste", nom: "Duelliste", description: "Gagner 5 duels", icone: "fa-khanda" },
    { code: "ambassadeur", nom: "Ambassadeur", description: "Faire jouer 3 personnes en duel", icone: "fa-bullhorn" },
  ];
  const SERIES = { 3: "Série en cours !", 5: "En feu !", 8: "Inarrêtable !", 12: "Légendaire !" };
  const MODES = { libre: "Partie libre", defi: "Défi de la semaine", duel: "Duel" };

  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const state = {
    client: null,
    profile: null,
    board: "general",
    game: null, // { id, mode, total, duelId, createdDuel }
    question: null,
    answering: false,
    timer: null,
    lastResult: null,
  };

  /* ---------- Outils d'affichage ---------- */
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : value);
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  const fmt = (n) => Number(n || 0).toLocaleString("fr-FR");

  function show(id) {
    document.querySelectorAll(".qz-screen").forEach((s) => { s.hidden = s.id !== id; });
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }

  let toastTimer = null;
  function toast(message) {
    const box = $("qz-toast");
    box.textContent = message;
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.hidden = true; }, 3500);
  }

  function fatal(title, text) {
    $("qz-error-title").textContent = title;
    $("qz-error-text").textContent = text;
    show("qz-error");
  }

  function titreFor(cumul) {
    return [...TITRES].reverse().find((t) => cumul >= t.min).titre;
  }

  /* ---------- API ---------- */
  class ApiError extends Error {
    constructor(message, status, data) { super(message); this.status = status; this.data = data; }
  }

  async function api(params, body) {
    const { data } = await state.client.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) { goLogin(); throw new ApiError("Session expirée.", 401); }
    const url = body ? "/api/trivia/membre" : `/api/trivia/membre?${new URLSearchParams(params)}`;
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let payload = {};
    try { payload = await res.json(); } catch { /* réponse vide */ }
    if (res.status === 401) { goLogin(); throw new ApiError("Session expirée.", 401, payload); }
    if (!res.ok) throw new ApiError(payload.error || "Erreur du quiz.", res.status, payload);
    return payload;
  }

  function goLogin() {
    try { sessionStorage.setItem("ea-retour", location.pathname + location.search); } catch { /* ignore */ }
    location.href = "/login.html";
  }

  /* ---------- Accueil ---------- */
  async function loadProfile() {
    state.profile = await api({ op: "profil" });
    renderProfile();
  }

  function renderProfile() {
    const p = state.profile;
    $("qz-pseudo").textContent = p.pseudo;
    $("qz-avatar").textContent = (p.pseudo || "?").trim().charAt(0).toUpperCase() || "?";
    $("qz-titre").textContent = p.titre;
    $("qz-cumul").textContent = fmt(p.cumul);
    $("qz-parties").textContent = fmt(p.parties);
    $("qz-best").textContent = fmt(p.meilleure_serie);

    const current = [...TITRES].reverse().find((t) => p.cumul >= t.min);
    const next = TITRES.find((t) => t.min > p.cumul);
    const fill = next ? ((p.cumul - current.min) / (next.min - current.min)) * 100 : 100;
    $("qz-level-fill").style.width = `${Math.max(2, Math.min(100, fill))}%`;
    $("qz-level-text").textContent = next
      ? `Encore ${fmt(next.min - p.cumul)} points pour devenir ${next.titre}.`
      : "Vous avez atteint le titre le plus élevé. Bravo !";

    const defi = p.defi || {};
    const defiBtn = $("qz-defi-btn");
    if (defi.joue && defi.termine) {
      $("qz-defi-status").textContent = `Déjà joué cette semaine : ${fmt(defi.points)} pts. Nouveau défi lundi.`;
      defiBtn.classList.add("is-done");
    } else if (defi.joue) {
      $("qz-defi-status").textContent = "Partie commencée : reprenez où vous en étiez.";
      defiBtn.classList.remove("is-done");
    } else {
      $("qz-defi-status").textContent = "Mêmes questions pour tous, une seule tentative.";
      defiBtn.classList.remove("is-done");
    }

    const earned = new Map((p.badges || []).map((b) => [b.code, b]));
    const list = $("qz-badges");
    list.replaceChildren();
    for (const badge of BADGES) {
      const has = earned.has(badge.code);
      list.append(badgeItem(badge, has));
    }
    for (const badge of p.badges || []) {
      if (badge.code.startsWith("expert_chantier_")) list.append(badgeItem(badge, true));
    }
    list.append(badgeItem({ nom: "Expert d’un chantier", description: "20 bonnes réponses sur un même chantier (un badge par chantier)", icone: "fa-medal" }, false, true));
  }

  function badgeItem(badge, earned, hint = false) {
    return el("li", { class: `qz-badge${earned ? " is-earned" : ""}${hint ? " is-hint" : ""}`, title: badge.description },
      el("i", { class: `fa-solid ${earned ? badge.icone : hint ? badge.icone : "fa-lock"}`, "aria-hidden": "true" }),
      el("strong", { text: badge.nom }),
      el("span", { text: badge.description }));
  }

  async function loadBoard(type = state.board) {
    state.board = type;
    document.querySelectorAll(".qz-tab").forEach((tab) => {
      const active = tab.dataset.board === type;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    const list = $("qz-board");
    list.replaceChildren(el("li", { class: "qz-board-empty", text: "Chargement…" }));
    try {
      const data = await api({ op: "classement", type });
      list.replaceChildren();
      if (!data.top.length) {
        list.append(el("li", { class: "qz-board-empty", text: type === "semaine" ? "Personne n’a encore joué le défi de cette semaine." : "Aucun score pour l’instant. Soyez le premier !" }));
      }
      for (const row of data.top) {
        list.append(el("li", { class: `qz-board-row${row.moi ? " is-me" : ""}${row.rang <= 3 ? ` is-top${row.rang}` : ""}` },
          el("span", { class: "qz-rank", text: row.rang <= 3 ? ["🥇", "🥈", "🥉"][row.rang - 1] : String(row.rang) }),
          el("span", { class: "qz-name" }, el("b", { text: row.pseudo }), el("small", { text: row.titre })),
          el("span", { class: "qz-pts", text: `${fmt(row.points)} pts` })));
      }
      const me = $("qz-board-me");
      const inTop = data.top.some((r) => r.moi);
      if (data.moi && !inTop) {
        me.textContent = `Votre rang : ${data.moi.rang} (${fmt(data.moi.points)} pts)`;
        me.hidden = false;
      } else {
        me.hidden = true;
      }
      if (type === "general") $("qz-rang").textContent = data.moi ? `${data.moi.rang}` : "—";
    } catch (error) {
      list.replaceChildren(el("li", { class: "qz-board-empty", text: error.message }));
    }
  }

  async function goHome() {
    stopTimer();
    state.game = null;
    history.replaceState(null, "", "/quiz");
    show("qz-home");
    try {
      await Promise.all([loadProfile(), loadBoard()]);
    } catch (error) {
      toast(error.message);
    }
  }

  /* ---------- Partie ---------- */
  async function startGame(mode, duelId = null) {
    try {
      const data = await api(null, { op: "start", mode, duel: duelId });
      state.game = {
        id: data.game_id,
        mode: data.mode,
        total: data.total,
        duelId: data.duel_id || duelId,
        createdDuel: mode === "duel" && !duelId,
      };
      $("qz-points").textContent = `${fmt(data.points)} pts`;
      setStreak(0);
      show("qz-game");
      await nextQuestion();
    } catch (error) {
      const code = error.data?.code;
      if (code === "defi_joue") {
        toast(`Défi déjà joué cette semaine (${fmt(error.data.points)} pts). Rendez-vous lundi !`);
      } else if (code === "duel_joue" && error.data.duel_id) {
        await showDuelResult(error.data.duel_id);
      } else {
        toast(error.message);
      }
    }
  }

  async function nextQuestion() {
    const data = await api(null, { op: "next", game: state.game.id });
    if (data.finished) return endGame();
    state.question = data;
    state.answering = false;
    renderQuestion(data);
    startTimer(data.elapsed_ms || 0);
  }

  function renderQuestion(q) {
    $("qz-feedback").hidden = true;
    $("qz-question-card").classList.remove("is-answered");
    $("qz-counter").textContent = `${q.index + 1} / ${q.total}`;
    $("qz-points").textContent = `${fmt(q.points)} pts`;
    setStreak(q.streak || 0, false);

    const chantier = q.chantier ? `Chantier ${q.chantier}` : "Livre blanc";
    const formatLabel = { qcm: "QCM", vrai_faux: "Vrai ou faux", chiffre: "Le bon chiffre", citation: "Qui a dit ça ?", image: "Question en image", ordre: "Remettez dans l’ordre" }[q.format] || "";
    $("qz-qmeta").textContent = `${formatLabel} · ${chantier}`;
    $("qz-question").textContent = q.question;

    const figure = $("qz-figure");
    if (q.image?.src) {
      $("qz-img").src = q.image.src;
      $("qz-img").alt = q.image.alt || "";
      $("qz-img-mobile").srcset = q.image.src_mobile || q.image.src;
      figure.hidden = false;
    } else {
      figure.hidden = true;
      $("qz-img").removeAttribute("src");
    }

    const box = $("qz-answers");
    box.replaceChildren();
    box.className = `qz-answers qz-answers--${q.format}`;
    if (q.format === "chiffre") renderNumber(box, q.meta || {});
    else if (q.format === "ordre") renderOrder(box, q.options || []);
    else renderOptions(box, q.options || []);
  }

  function renderOptions(box, options) {
    options.forEach((option, i) => {
      box.append(el("button", {
        type: "button",
        class: "qz-option",
        "data-value": option,
        onclick: () => submit(option),
      }, el("span", { class: "qz-letter", text: "ABCDEF"[i] || "•" }), el("span", { text: option })));
    });
  }

  function renderNumber(box, meta) {
    const min = Number(meta.min ?? 0);
    const max = Number(meta.max ?? 100);
    const step = Number(meta.step || 1);
    const start = Math.round(((min + max) / 2) / step) * step;
    const unite = meta.unite ? ` ${meta.unite}` : "";
    const value = el("output", { class: "qz-number-value", text: `${fmt(start)}${unite}` });
    const range = el("input", {
      type: "range", min, max, step, value: start, class: "qz-range", "aria-label": "Votre estimation",
      oninput: () => { value.textContent = `${fmt(range.value)}${unite}`; },
    });
    const minus = el("button", { type: "button", class: "qz-step", "aria-label": "Diminuer", onclick: () => nudge(-1) }, el("i", { class: "fa-solid fa-minus", "aria-hidden": "true" }));
    const plus = el("button", { type: "button", class: "qz-step", "aria-label": "Augmenter", onclick: () => nudge(1) }, el("i", { class: "fa-solid fa-plus", "aria-hidden": "true" }));
    function nudge(dir) {
      const v = Math.min(max, Math.max(min, Number(range.value) + dir * step));
      range.value = String(v);
      value.textContent = `${fmt(v)}${unite}`;
    }
    box.append(
      value,
      el("div", { class: "qz-number-row" }, minus, range, plus),
      el("div", { class: "qz-number-bounds" }, el("span", { text: `${fmt(min)}${unite}` }), el("span", { text: `${fmt(max)}${unite}` })),
      el("button", { type: "button", class: "btn btn-primary qz-validate", onclick: () => submit(String(range.value)) }, "Valider"),
    );
  }

  function renderOrder(box, options) {
    const items = [...options];
    const list = el("ol", { class: "qz-order" });
    function draw() {
      list.replaceChildren();
      items.forEach((item, i) => {
        list.append(el("li", { class: "qz-order-item" },
          el("span", { class: "qz-order-n", text: String(i + 1) }),
          el("span", { class: "qz-order-text", text: item }),
          el("span", { class: "qz-order-btns" },
            el("button", { type: "button", "aria-label": "Monter", disabled: i === 0, onclick: () => move(i, -1) }, el("i", { class: "fa-solid fa-chevron-up", "aria-hidden": "true" })),
            el("button", { type: "button", "aria-label": "Descendre", disabled: i === items.length - 1, onclick: () => move(i, 1) }, el("i", { class: "fa-solid fa-chevron-down", "aria-hidden": "true" })))));
      });
    }
    function move(i, dir) {
      if (state.answering) return;
      const j = i + dir;
      [items[i], items[j]] = [items[j], items[i]];
      draw();
      list.children[j]?.querySelector("button:not([disabled])")?.focus();
    }
    draw();
    box.append(list, el("button", { type: "button", class: "btn btn-primary qz-validate", onclick: () => submit(JSON.stringify(items)) }, "Valider l’ordre"));
  }

  /* ---------- Chrono ---------- */
  function startTimer(elapsedMs) {
    stopTimer();
    const timer = $("qz-timer");
    const fill = $("qz-timer-fill");
    const num = $("qz-timer-num");
    const startedAt = performance.now() - elapsedMs;
    timer.classList.remove("is-urgent", "is-critical", "is-over");
    let lastSecond = null;
    const tick = () => {
      const remaining = Math.max(0, CHRONO_MS - (performance.now() - startedAt));
      fill.style.transform = `scaleX(${remaining / CHRONO_MS})`;
      const seconds = Math.ceil(remaining / 1000);
      if (seconds !== lastSecond) {
        lastSecond = seconds;
        num.textContent = String(seconds);
        timer.classList.toggle("is-urgent", seconds <= 5 && seconds > 3);
        timer.classList.toggle("is-critical", seconds <= 3);
        if (seconds <= 3 && seconds > 0 && !reduceMotion) {
          num.classList.remove("is-beat");
          void num.offsetWidth;
          num.classList.add("is-beat");
        }
      }
      if (remaining <= 0) {
        state.timer = null;
        timer.classList.add("is-over");
        submit(null);
        return;
      }
      state.timer = requestAnimationFrame(tick);
    };
    state.timer = requestAnimationFrame(tick);
  }

  function stopTimer() {
    if (state.timer) cancelAnimationFrame(state.timer);
    state.timer = null;
  }

  /* ---------- Réponse ---------- */
  async function submit(answer) {
    if (state.answering || !state.question) return;
    state.answering = true;
    stopTimer();
    const q = state.question;
    $("qz-question-card").classList.add("is-answered");
    $("qz-answers").querySelectorAll("button, input").forEach((node) => { node.disabled = true; });

    let result;
    try {
      result = await api(null, { op: "answer", game: state.game.id, index: q.index, answer });
    } catch (error) {
      toast(error.message);
      // Resynchronise avec le serveur (question déjà répondue, partie terminée…).
      try { await nextQuestion(); } catch { goHome(); }
      return;
    }
    state.lastResult = result;
    markOptions(q, answer, result);
    showFeedback(q, result);
  }

  function markOptions(q, answer, result) {
    if (!["qcm", "vrai_faux", "citation", "image"].includes(q.format)) return;
    $("qz-answers").querySelectorAll(".qz-option").forEach((button) => {
      const value = button.dataset.value;
      if (value === result.correct_answer) button.classList.add("is-correct");
      else if (value === answer) button.classList.add("is-wrong");
    });
  }

  function correctText(q, result) {
    if (q.format === "ordre") {
      try {
        return JSON.parse(result.correct_answer).map((item, i) => `${i + 1}. ${item}`).join("  ");
      } catch { return result.correct_answer; }
    }
    if (q.format === "chiffre") {
      const unite = q.meta?.unite ? ` ${q.meta.unite}` : "";
      return `${result.correct_answer}${unite}`;
    }
    return result.correct_answer;
  }

  function showFeedback(q, result) {
    const card = $("qz-feedback");
    card.classList.remove("is-good", "is-bad", "is-timeout");
    if (result.correct) {
      card.classList.add("is-good");
      $("qz-verdict").textContent = result.fast ? "Bonne réponse, et rapide !" : "Bonne réponse !";
      const parts = ["10"];
      if (result.fast) parts.push("5 rapidité");
      if (result.streak >= 3) parts.push(`${2 * (result.streak - 2)} série`);
      $("qz-gain").textContent = `+${result.points_gagnes} pts${parts.length > 1 ? ` (${parts.join(" + ")})` : ""}`;
      $("qz-correct").textContent = "";
    } else {
      card.classList.add(result.timed_out ? "is-timeout" : "is-bad");
      $("qz-verdict").textContent = result.timed_out ? "Temps écoulé !" : "Pas tout à fait…";
      $("qz-gain").textContent = "0 pt, aucune pénalité. On continue !";
      $("qz-correct").textContent = `Bonne réponse : ${correctText(q, result)}`;
    }
    $("qz-explain").textContent = result.explication || "";
    $("qz-source").textContent = result.source ? `Livre blanc : ${result.source}` : "";
    $("qz-points").textContent = `${fmt(result.points)} pts`;
    bump($("qz-points"));
    setStreak(result.streak, true);

    $("qz-next").textContent = result.finished ? "Voir mon résultat" : "Question suivante";
    card.hidden = false;
    $("qz-next").focus({ preventScroll: true });
    if (window.innerWidth < 760) card.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
  }

  function bump(node) {
    if (reduceMotion) return;
    node.classList.remove("is-bump");
    void node.offsetWidth;
    node.classList.add("is-bump");
  }

  function setStreak(n, announce = false) {
    const badge = $("qz-streak");
    const app = $("qz-app");
    badge.hidden = n < 2;
    $("qz-streak-n").textContent = String(n);
    app.classList.toggle("is-streak", n >= 3);
    app.classList.toggle("is-hot", n >= 5);
    app.classList.toggle("is-blazing", n >= 8);
    const banner = $("qz-banner");
    if (!announce) { banner.className = "qz-banner"; banner.textContent = ""; return; }
    if (n >= 3) {
      const msg = SERIES[n] || `Série ×${n} !`;
      banner.textContent = `${msg} 🔥 ${n} d’affilée`;
      banner.className = "qz-banner";
      void banner.offsetWidth;
      banner.classList.add("is-on", ...(SERIES[n] ? ["is-big"] : []));
      bump(badge);
    } else {
      banner.className = "qz-banner";
      banner.textContent = "";
    }
  }

  /* ---------- Fin de partie ---------- */
  async function endGame() {
    stopTimer();
    const game = state.game;
    const result = state.lastResult || {};
    const before = new Set((state.profile?.badges || []).map((b) => b.code));
    try { await loadProfile(); } catch { /* profil indisponible : on affiche quand même */ }
    const p = state.profile || { cumul: 0, titre: "Sympathisant", badges: [] };
    const fresh = (p.badges || []).filter((b) => !before.has(b.code));

    $("qz-end-mode").textContent = `${MODES[game.mode] || "Partie"} terminée`;
    $("qz-end-points").textContent = fmt(result.points);
    $("qz-end-bonnes").textContent = `${result.bonnes ?? 0}/${result.total ?? game.total}`;
    $("qz-end-serie").textContent = fmt(result.meilleure_serie);
    $("qz-end-cumul").textContent = fmt(p.cumul);
    $("qz-end-title").textContent = `Titre : ${p.titre}`;

    const badgesBox = $("qz-new-badges");
    badgesBox.replaceChildren();
    if (fresh.length) {
      badgesBox.append(el("p", { class: "qz-new-badges-title", text: fresh.length > 1 ? "Nouveaux badges débloqués !" : "Nouveau badge débloqué !" }));
      for (const badge of fresh) badgesBox.append(badgeItem(badge, true));
      badgesBox.hidden = false;
    } else {
      badgesBox.hidden = true;
    }

    const duelShare = $("qz-duel-share");
    const duelTable = $("qz-end-duel");
    duelShare.hidden = true;
    duelTable.hidden = true;
    if (game.mode === "duel" && game.duelId) {
      if (game.createdDuel) {
        const link = `${SITE}/quiz?duel=${game.duelId}`;
        const text = `Je te défie au Quiz du Livre blanc d’En Avant ! J’ai fait ${fmt(result.points)} points. Bats-moi (7 jours) : ${link}`;
        $("qz-duel-score").textContent = fmt(result.points);
        $("qz-duel-wa").href = `https://wa.me/?text=${encodeURIComponent(text)}`;
        $("qz-duel-copy").onclick = () => copy(link, "Lien du duel copié.");
        duelShare.hidden = false;
      } else {
        try {
          const duel = await api({ op: "duel", id: game.duelId });
          renderDuelTable(duelTable, duel);
          duelTable.hidden = false;
        } catch { /* tableau facultatif */ }
      }
    }

    $("qz-replay").textContent = game.mode === "libre" ? "Rejouer" : "Faire une partie libre";
    state.share = { points: result.points || 0, pseudo: p.pseudo, titre: p.titre, badge: fresh[0] || (p.badges || []).at(-1) || null, bonnes: result.bonnes, total: result.total };
    drawShareCard();
    show("qz-end");
    if (!reduceMotion) countUp($("qz-end-points"), result.points || 0);
  }

  function countUp(node, target) {
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 900);
      node.textContent = fmt(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function renderDuelTable(box, duel) {
    box.replaceChildren();
    const players = duel.joueurs.filter((j) => j.termine);
    if (!players.length) {
      box.append(el("p", { text: "Personne n’a encore terminé ce duel." }));
      return;
    }
    box.append(el("div", { class: "qz-duel-grid" }, players.map((j, i) =>
      el("div", { class: `qz-duel-player${i === 0 ? " is-leader" : ""}${j.moi ? " is-me" : ""}` },
        el("span", { class: "qz-duel-crown", text: i === 0 ? "👑" : "" }),
        el("strong", { text: j.moi ? `${j.pseudo} (vous)` : j.pseudo }),
        el("span", { class: "qz-duel-pts", text: `${fmt(j.points)} pts` }),
        el("small", { text: `${j.bonnes}/15 bonnes réponses${j.createur ? " · lanceur" : ""}` })))));
  }

  /* ---------- Duel reçu par lien ---------- */
  async function openDuel(id) {
    let duel;
    try {
      duel = await api({ op: "duel", id });
    } catch (error) {
      toast(error.status === 404 ? "Ce duel n’existe pas." : error.message);
      return goHome();
    }
    const mine = duel.joueurs.find((j) => j.moi);
    if (mine?.termine) return showDuelResult(id, duel);
    const creator = duel.joueurs.find((j) => j.createur);
    $("qz-duel-title").textContent = duel.expire ? "Ce duel a expiré" : `${duel.createur} vous défie !`;
    $("qz-duel-text").textContent = duel.expire
      ? "Le délai de 7 jours est passé. Lancez votre propre duel depuis l’accueil du quiz."
      : `${creator?.termine ? `Score à battre : ${fmt(creator.points)} pts. ` : ""}Mêmes 15 questions, 15 secondes chacune. Vos points comptent aussi dans votre score cumulé.`;
    $("qz-duel-accept").hidden = duel.expire;
    $("qz-duel-accept").onclick = () => startGame("duel", id);
    renderDuelTable($("qz-duel-table"), duel);
    show("qz-duel-intro");
  }

  async function showDuelResult(id, duel = null) {
    try {
      duel = duel || await api({ op: "duel", id });
    } catch (error) {
      toast(error.message);
      return goHome();
    }
    $("qz-duel-title").textContent = "Résultats du duel";
    $("qz-duel-text").textContent = "Vous avez déjà joué ce duel.";
    $("qz-duel-accept").hidden = true;
    renderDuelTable($("qz-duel-table"), duel);
    show("qz-duel-intro");
  }

  /* ---------- Partage ---------- */
  function shareText() {
    const s = state.share;
    return `J’ai marqué ${fmt(s.points)} points au Quiz du Livre blanc d’En Avant (titre : ${s.titre}). Et vous, connaissez-vous le programme ? ${PUBLIC_QUIZ}`;
  }

  function drawShareCard() {
    const canvas = $("qz-share-canvas");
    const ctx = canvas.getContext("2d");
    const s = state.share;
    const W = canvas.width;
    const H = canvas.height;

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#071229");
    bg.addColorStop(1, "#16305c");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W * 0.8, H * 0.15, 20, W * 0.8, H * 0.15, 520);
    glow.addColorStop(0, "rgba(255,106,42,0.45)");
    glow.addColorStop(1, "rgba(255,106,42,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffd9c6";
    ctx.font = "700 40px Manrope, Arial, sans-serif";
    ctx.fillText("QUIZ DU LIVRE BLANC", W / 2, 230);

    ctx.fillStyle = "#ffffff";
    ctx.font = "800 64px Manrope, Arial, sans-serif";
    ctx.fillText(truncate(ctx, s.pseudo || "Membre", W - 160), W / 2, 330);

    const grad = ctx.createLinearGradient(W * 0.25, 0, W * 0.75, 0);
    grad.addColorStop(0, "#ffd9c6");
    grad.addColorStop(0.7, "#ff6a2a");
    ctx.fillStyle = grad;
    ctx.font = "800 220px 'Space Grotesk', Manrope, Arial, sans-serif";
    ctx.fillText(fmt(s.points), W / 2, 560);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "700 48px Manrope, Arial, sans-serif";
    ctx.fillText(`points · ${s.bonnes ?? 0}/${s.total ?? 15} bonnes réponses`, W / 2, 640);

    ctx.fillStyle = "#ff6a2a";
    roundRect(ctx, W / 2 - 230, 690, 460, 84, 42);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 44px Manrope, Arial, sans-serif";
    ctx.fillText(s.titre || "Sympathisant", W / 2, 748);

    if (s.badge) {
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "600 38px Manrope, Arial, sans-serif";
      ctx.fillText(truncate(ctx, `Badge : ${s.badge.nom}`, W - 160), W / 2, 840);
    }

    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "600 38px Manrope, Arial, sans-serif";
    ctx.fillText("Et vous, connaissez-vous le programme ?", W / 2, 940);
    ctx.fillStyle = "#ff8a4c";
    ctx.font = "800 42px Manrope, Arial, sans-serif";
    ctx.fillText("enavant.org/trivia", W / 2, 1000);

    const logo = new Image();
    logo.onload = () => {
      const h = 120;
      const w = (logo.width / logo.height) * h;
      ctx.drawImage(logo, (W - w) / 2, 50, w, h);
    };
    logo.src = "/pictures/logo/logo.png";

    $("qz-share-wa").href = `https://wa.me/?text=${encodeURIComponent(shareText())}`;
    $("qz-share-fb").href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(PUBLIC_QUIZ)}`;
    $("qz-share-native").hidden = !navigator.share;
  }

  function truncate(ctx, text, max) {
    if (ctx.measureText(text).width <= max) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
    return `${t}…`;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function cardBlob() {
    return new Promise((resolve) => $("qz-share-canvas").toBlob(resolve, "image/png"));
  }

  async function shareNative() {
    try {
      const blob = await cardBlob();
      const file = blob ? new File([blob], "score-quiz-en-avant.png", { type: "image/png" }) : null;
      const payload = { title: "Quiz du Livre blanc — En Avant", text: shareText(), url: PUBLIC_QUIZ };
      if (file && navigator.canShare?.({ files: [file] })) payload.files = [file];
      await navigator.share(payload);
    } catch (error) {
      if (error?.name !== "AbortError") toast("Partage impossible sur cet appareil.");
    }
  }

  async function downloadCard() {
    const blob = await cardBlob();
    if (!blob) return toast("Image indisponible.");
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: "score-quiz-en-avant.png" });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function copy(text, message) {
    try {
      await navigator.clipboard.writeText(text);
      toast(message);
    } catch {
      window.prompt("Copiez ce lien :", text);
    }
  }

  /* ---------- Démarrage ---------- */
  function bind() {
    document.querySelectorAll(".qz-mode").forEach((button) => {
      button.addEventListener("click", () => startGame(button.dataset.mode));
    });
    document.querySelectorAll(".qz-tab").forEach((tab) => {
      tab.addEventListener("click", () => loadBoard(tab.dataset.board));
    });
    document.querySelectorAll("[data-go-home]").forEach((button) => button.addEventListener("click", goHome));
    $("qz-next").addEventListener("click", async () => {
      $("qz-next").disabled = true;
      try {
        if (state.lastResult?.finished) await endGame();
        else await nextQuestion();
      } catch (error) {
        toast(error.message);
      } finally {
        $("qz-next").disabled = false;
      }
    });
    $("qz-replay").addEventListener("click", () => startGame("libre"));
    $("qz-share-native").addEventListener("click", shareNative);
    $("qz-share-copy").addEventListener("click", () => copy(PUBLIC_QUIZ, "Lien du quiz copié."));
    $("qz-share-dl").addEventListener("click", downloadCard);
    document.addEventListener("keydown", (event) => {
      if ($("qz-game").hidden || state.answering) return;
      const index = "abcdef".indexOf(event.key.toLowerCase());
      const options = $("qz-answers").querySelectorAll(".qz-option");
      if (index >= 0 && options[index]) options[index].click();
    });
  }

  async function init() {
    const env = window.EA_ENV || {};
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !window.supabase) {
      return fatal("Quiz indisponible", "La configuration du site est incomplète.");
    }
    state.client = window.supabase.createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
    const { data } = await state.client.auth.getSession();
    if (!data?.session) return goLogin();

    bind();
    const duelId = new URLSearchParams(location.search).get("duel");
    try {
      await loadProfile();
    } catch (error) {
      if (error.status === 403) {
        return fatal("Réservé aux membres", "Le module complet du quiz est réservé aux membres d’En Avant. Vous pouvez jouer au quiz public en attendant.");
      }
      if (error.status === 401) return;
      return fatal("Quiz indisponible", error.message);
    }
    if (duelId && /^[0-9a-f-]{36}$/i.test(duelId)) return openDuel(duelId);
    show("qz-home");
    loadBoard("general");
  }

  init().catch((error) => fatal("Quiz indisponible", error?.message || "Erreur inattendue."));
})();
