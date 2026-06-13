/* ==========================================================================
   EN AVANT — MODULE TRIVIA v2
   Mode public  : questions pré-générées via /api/trivia/questions
   Mode membre  : questions IA générées à la volée via /api/trivia/generate-session
   ========================================================================== */

(() => {
  "use strict";

  const startScreen = document.getElementById("tq-start");
  if (!startScreen) return;

  const gameScreen  = document.getElementById("tq-game");
  const endScreen   = document.getElementById("tq-end");
  const memberCta   = document.getElementById("tq-member-cta");
  const modeBadge   = document.getElementById("tq-mode-badge");
  const beginBtn    = document.getElementById("tq-begin");
  const nextBtn     = document.getElementById("tq-next");
  const progressEl  = document.getElementById("tq-progress");
  const coachEl     = document.getElementById("tq-coach");
  const qnumEl      = document.getElementById("tq-qnum");
  const questionEl  = document.getElementById("tq-question");
  const optionsEl   = document.getElementById("tq-options");
  const feedbackEl  = document.getElementById("tq-feedback");
  const srcLabel    = document.getElementById("tq-src");
  const pseudoInput = document.getElementById("tq-pseudo");
  const scoreStatus = document.getElementById("tq-score-status");
  const rankingList = document.getElementById("tq-ranking-list");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const LETTERS = ["A", "B", "C", "D"];

  let questions    = [];
  let index        = 0;
  let score        = 0;
  let locked       = false;
  let isMemberMode = false;

  /* ------------------------------------------------------------------ */
  /* AUTH — lit le token Supabase depuis localStorage                    */
  /* ------------------------------------------------------------------ */
  function getAuthToken() {
    try {
      const url = (window.EA_ENV || {}).SUPABASE_URL || "";
      const ref = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
      if (!ref) return null;
      const raw = localStorage.getItem(`sb-${ref}-auth-token`);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data?.access_token || null;
    } catch {
      return null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* QUESTIONS DE SECOURS                                                 */
  /* ------------------------------------------------------------------ */
  const FALLBACK_QUESTIONS = [
    {
      question: "Combien de chantiers prioritaires le parti En Avant propose-t-il pour relever Haïti ?",
      options: ["10", "15", "20", "25"],
      correct_answer: "20",
      explication: "Le programme du parti s'articule autour de 20 chantiers prioritaires, de la sécurité aux collectivités territoriales.",
      source_livre_blanc: "Les 20 chantiers",
    },
    {
      question: "Quelle année symbolique sert de cap au projet national d'En Avant ?",
      options: ["2030", "2040", "2054", "2060"],
      correct_answer: "2054",
      explication: "2054 marquera les 250 ans de l'indépendance d'Haïti : c'est l'horizon fixé pour une économie émergente.",
      source_livre_blanc: "Vision — Livre blanc",
    },
    {
      question: "En quelle année le mouvement En Avant a-t-il été officiellement lancé ?",
      options: ["2010", "2016", "2020", "2023"],
      correct_answer: "2020",
      explication: "En 2020, l'ancien député de Pétion-Ville Jerry Tardieu et des leaders de différents secteurs lancent le mouvement En Avant.",
      source_livre_blanc: "Historique",
    },
    {
      question: "Quel idéal historique le parti revendique-t-il comme guide de son combat ?",
      options: ["L'idéal bolivarien", "L'idéal christophien", "L'idéal napoléonien", "L'idéal jeffersonien"],
      correct_answer: "L'idéal christophien",
      explication: "Le parti revendique l'héritage d'Henri Christophe : grandeur, rigueur administrative, modernité et progrès.",
      source_livre_blanc: "À propos — nos valeurs",
    },
    {
      question: "Où se situe En Avant sur l'échiquier politique ?",
      options: [
        "À l'extrême droite",
        "Au centre, avec un centre de gravité au centre-gauche",
        "À l'extrême gauche",
        "Il refuse toute position",
      ],
      correct_answer: "Au centre, avec un centre de gravité au centre-gauche",
      explication: "Parti réformiste, centriste et social-démocrate, En Avant refuse les extrêmes et les clivages dogmatiques.",
      source_livre_blanc: "À propos — repère idéologique",
    },
    {
      question: "Quelle est la grande ambition affichée par le parti En Avant ?",
      options: [
        "Remettre de l'ordre en Haïti",
        "Déplacer la capitale",
        "Changer la monnaie nationale",
        "Supprimer les départements",
      ],
      correct_answer: "Remettre de l'ordre en Haïti",
      explication: "« Remettre de l'Ordre en Haïti » : justice, finances publiques, institutions, éducation, sécurité, diplomatie.",
      source_livre_blanc: "Historique — grande ambition",
    },
    {
      question: "En Avant priorise trois segments démographiques majeurs. Lesquels ?",
      options: [
        "Les entrepreneurs, les fonctionnaires et les médecins",
        "La jeunesse, les femmes et la diaspora",
        "Les agriculteurs, les enseignants et les policiers",
        "Les étudiants, les artistes et les militaires",
      ],
      correct_answer: "La jeunesse, les femmes et la diaspora",
      explication: "Dès son lancement, En Avant a choisi d'aller vers la population en priorisant la jeunesse, les femmes et la diaspora.",
      source_livre_blanc: "Historique — naissance du mouvement",
    },
    {
      question: "Quel chantier concerne directement la sécurité alimentaire dans le programme d'En Avant ?",
      options: [
        "Modernisation de l'agriculture",
        "Réforme du Code civil",
        "Digitalisation des services publics",
        "Réforme fiscale",
      ],
      correct_answer: "Modernisation de l'agriculture",
      explication: "La modernisation de l'agriculture et la sécurité alimentaire figurent parmi les 20 chantiers fondamentaux du programme.",
      source_livre_blanc: "Les 20 chantiers — Agriculture",
    },
  ];

  /* ------------------------------------------------------------------ */
  /* CHARGEMENT DES QUESTIONS                                             */
  /* ------------------------------------------------------------------ */
  async function loadQuestions() {
    const token = getAuthToken();

    // Mode membre : génération IA depuis le Livre Blanc
    if (token) {
      try {
        const response = await fetch("/api/trivia/generate-session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(40000),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.ok && Array.isArray(payload.questions) && payload.questions.length >= 4) {
          isMemberMode = true;
          if (srcLabel) srcLabel.textContent = "Questions générées par l'IA depuis le Livre blanc.";
          return payload.questions;
        }
        // 401/403 → token expiré ou rôle insuffisant, bascule public
      } catch { /* timeout ou réseau → bascule public */ }
    }

    // Mode public : questions pré-générées
    isMemberMode = false;
    try {
      const response = await fetch("/api/trivia/questions?count=8", {
        signal: AbortSignal.timeout(5000),
      });
      const payload = await response.json();
      if (response.ok && Array.isArray(payload.questions) && payload.questions.length > 0) {
        if (srcLabel) srcLabel.textContent = "Questions tirées du Livre blanc.";
        return payload.questions;
      }
      throw new Error("vide");
    } catch {
      if (srcLabel) srcLabel.textContent = "Mode découverte : questions tirées du site En Avant.";
      return FALLBACK_QUESTIONS;
    }
  }

  /* ------------------------------------------------------------------ */
  /* RENDU                                                                */
  /* ------------------------------------------------------------------ */
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  function renderProgress() {
    progressEl.innerHTML = "";
    questions.forEach((_, i) => {
      const seg = document.createElement("span");
      seg.className = "seg" + (i < index ? " done" : i === index ? " now" : "");
      progressEl.appendChild(seg);
    });
  }

  function renderQuestion() {
    const q = questions[index];
    locked = false;

    renderProgress();
    coachEl.className = "tq-coach";
    qnumEl.textContent = `Question ${index + 1} / ${questions.length}`;
    questionEl.textContent = q.question;
    feedbackEl.hidden = true;
    feedbackEl.className = "tq-feedback";
    nextBtn.hidden = true;
    optionsEl.innerHTML = "";

    shuffle(q.options).forEach((option, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tq-opt";
      btn.innerHTML = `<span class="tq-letter">${LETTERS[i]}</span><span></span>`;
      btn.lastElementChild.textContent = option;
      btn.addEventListener("click", () => selectOption(btn, option, q));
      optionsEl.appendChild(btn);
    });
  }

  function selectOption(clicked, option, q) {
    if (locked) return;
    locked = true;

    const isCorrect = option === q.correct_answer;
    if (isCorrect) score++;

    optionsEl.querySelectorAll(".tq-opt").forEach((btn) => {
      btn.disabled = true;
      const value = btn.lastElementChild.textContent;
      if (value === q.correct_answer) btn.classList.add("is-correct");
      else if (btn === clicked) btn.classList.add("is-wrong");
    });

    coachEl.classList.add(isCorrect ? "happy" : "sad");

    feedbackEl.className = `tq-feedback ${isCorrect ? "ok" : "ko"}`;
    feedbackEl.innerHTML = "";
    const strong = document.createElement("strong");
    strong.textContent = isCorrect ? "Bonne réponse ! " : "Pas tout à fait. ";
    const text = document.createTextNode(q.explication || "");
    feedbackEl.append(strong, text);
    if (q.source_livre_blanc) {
      const src = document.createElement("span");
      src.className = "tq-src";
      src.textContent = `Source : ${q.source_livre_blanc}`;
      feedbackEl.appendChild(src);
    }
    feedbackEl.hidden = false;

    nextBtn.hidden = false;
    nextBtn.innerHTML =
      index + 1 < questions.length
        ? 'Question suivante <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>'
        : 'Voir mon score <i class="fa-solid fa-flag-checkered" aria-hidden="true"></i>';
    nextBtn.focus();
  }

  /* ------------------------------------------------------------------ */
  /* FIN DE PARTIE                                                        */
  /* ------------------------------------------------------------------ */
  function finish() {
    gameScreen.hidden = true;
    endScreen.hidden = false;

    const total = questions.length;
    const ratio = score / total;

    document.getElementById("tq-trophy").textContent = `${score}/${total}`;

    const verdict = document.getElementById("tq-verdict");
    const verdictText = document.getElementById("tq-verdict-text");

    if (ratio === 1) {
      verdict.textContent = "Parfait ! Un sans-faute !";
      verdictText.textContent = "Score impeccable — vous maîtrisez le projet En Avant sur le bout des doigts.";
    } else if (ratio >= 0.7) {
      verdict.textContent = "Excellent !";
      verdictText.textContent = "Vous connaissez très bien le Livre blanc. Encore un petit effort pour le sans-faute.";
    } else if (ratio >= 0.4) {
      verdict.textContent = "Pas mal du tout.";
      verdictText.textContent = "Vous avez les bases — relisez le Livre blanc pour devenir incollable.";
    } else {
      verdict.textContent = "C'est un début !";
      verdictText.textContent = "Le Livre blanc n'attend que vous : téléchargez-le et retentez le quiz.";
    }

    launchConfetti(ratio);
    pseudoInput.value = localStorage.getItem("ea-trivia-pseudo") || "";
    scoreStatus.textContent = "";
    loadLeaderboard();

    // CTA Membre uniquement en mode public
    if (memberCta) memberCta.hidden = isMemberMode;
  }

  /* ------------------------------------------------------------------ */
  /* CONFETTIS                                                            */
  /* ------------------------------------------------------------------ */
  function launchConfetti(ratio) {
    if (reduceMotion || ratio < 0.4) return;
    const box = document.getElementById("tq-confetti");
    const colors = ["#ff6a2a", "#ffd9c6", "#ffffff", "#2fd08f", "#4d7cff"];
    const count = ratio === 1 ? 70 : 45;
    for (let i = 0; i < count; i++) {
      const piece = document.createElement("i");
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[i % colors.length];
      piece.style.animationDuration = `${2.4 + Math.random() * 1.8}s`;
      piece.style.animationDelay = `${Math.random() * 0.7}s`;
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      box.appendChild(piece);
    }
    setTimeout(() => { box.innerHTML = ""; }, 5200);
  }

  /* ------------------------------------------------------------------ */
  /* SCORE & LEADERBOARD                                                  */
  /* ------------------------------------------------------------------ */
  async function submitScore() {
    const total = questions.length;
    const pseudo = pseudoInput.value.trim();
    if (pseudo.length < 2) {
      scoreStatus.textContent = "Choisissez un pseudonyme d'au moins 2 caractères.";
      pseudoInput.focus();
      return;
    }

    let session = localStorage.getItem("ea-session");
    if (!session) {
      session = (crypto.randomUUID && crypto.randomUUID()) || `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem("ea-session", session);
    }

    const button = document.getElementById("tq-save-score");
    button.classList.add("btn-loading");
    try {
      const response = await fetch("/api/trivia/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_session: session, pseudo, score, total }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Enregistrement impossible.");
      localStorage.setItem("ea-trivia-pseudo", pseudo);
      scoreStatus.textContent = "Votre score est enregistré.";
      await loadLeaderboard();
    } catch (error) {
      scoreStatus.textContent = error.message;
    } finally {
      button.classList.remove("btn-loading");
    }
  }

  async function loadLeaderboard() {
    rankingList.innerHTML = "<li>Chargement…</li>";
    try {
      const response = await fetch("/api/trivia/score", { signal: AbortSignal.timeout(4000) });
      const payload = await response.json();
      if (!response.ok) throw new Error();
      rankingList.innerHTML = "";
      if (!payload.leaderboard?.length) {
        rankingList.innerHTML = "<li>Soyez la première personne au classement.</li>";
        return;
      }
      payload.leaderboard.forEach((item) => {
        const row = document.createElement("li");
        const name = document.createElement("strong");
        name.textContent = `${item.rank}. ${item.pseudo}`;
        const result = document.createElement("span");
        result.textContent = `${item.score}/${item.total}`;
        row.append(name, result);
        rankingList.appendChild(row);
      });
    } catch {
      rankingList.innerHTML = "<li>Classement indisponible pour le moment.</li>";
    }
  }

  /* ------------------------------------------------------------------ */
  /* PARTAGE                                                              */
  /* ------------------------------------------------------------------ */
  async function share() {
    const total = questions.length;
    const status = document.getElementById("tq-share-status");
    const modeLabel = isMemberMode ? " (Trivia IA)" : "";
    const text = `J'ai fait ${score}/${total}${modeLabel} au Quiz du Livre blanc d'En Avant ! Et vous, connaissez-vous le projet ? 🇭🇹`;
    const url = window.location.href.split("#")[0];

    if (navigator.share) {
      try {
        await navigator.share({ title: "Quiz En Avant", text, url });
        return;
      } catch { /* annulé */ }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      status.textContent = "Message copié ! Collez-le sur WhatsApp ou X.";
    } catch {
      status.textContent = url;
    }
  }

  function reset() {
    index = 0;
    score = 0;
    isMemberMode = false;
    endScreen.hidden = true;
    if (memberCta) memberCta.hidden = true;
    startScreen.hidden = false;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }

  /* ------------------------------------------------------------------ */
  /* INIT                                                                 */
  /* ------------------------------------------------------------------ */

  // Afficher le badge IA si l'utilisateur est déjà connecté
  if (modeBadge && getAuthToken()) {
    modeBadge.hidden = false;
  }

  beginBtn.addEventListener("click", async () => {
    beginBtn.classList.add("btn-loading");
    beginBtn.innerHTML = getAuthToken()
      ? '<i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Génération par l\'IA…'
      : '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Chargement…';

    questions = shuffle(await loadQuestions()).slice(0, 8);

    beginBtn.classList.remove("btn-loading");
    beginBtn.innerHTML = '<i class="fa-solid fa-play" aria-hidden="true"></i> Commencer le quiz';

    document.getElementById("tq-total-label").textContent = `${questions.length} questions`;
    index = 0;
    score = 0;
    startScreen.hidden = true;
    endScreen.hidden = true;
    if (memberCta) memberCta.hidden = true;
    gameScreen.hidden = false;
    renderQuestion();
  });

  nextBtn.addEventListener("click", () => {
    if (index + 1 < questions.length) {
      index++;
      renderQuestion();
    } else {
      finish();
    }
  });

  document.getElementById("tq-share").addEventListener("click", share);
  document.getElementById("tq-save-score").addEventListener("click", submitScore);
  document.getElementById("tq-refresh-ranking").addEventListener("click", loadLeaderboard);
  document.getElementById("tq-replay").addEventListener("click", reset);
})();
