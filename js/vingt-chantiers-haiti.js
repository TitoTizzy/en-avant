document.addEventListener('DOMContentLoaded', () => {
  initHeader();
  initMenu();
  initReveal();
  initBackTop();
  initFilters();
});

function initHeader() {
  const header = document.getElementById('main-header');
  if (!header) return;

  const onScroll = () => {
    header.classList.toggle('is-scrolled', window.scrollY > 16);
  };

  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

function initMenu() {
  const toggle = document.getElementById('menu-toggle');
  const nav = document.getElementById('main-nav');
  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

function initReveal() {
  const items = document.querySelectorAll('.reveal-up');
  if (!items.length) return;

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      obs.unobserve(entry.target);
    });
  }, {
    threshold: 0.14,
    rootMargin: '0px 0px -40px 0px'
  });

  items.forEach(item => observer.observe(item));
}

function initBackTop() {
  const button = document.getElementById('back-top');
  if (!button) return;

  const toggle = () => {
    button.classList.toggle('is-visible', window.scrollY > 400);
  };

  toggle();
  window.addEventListener('scroll', toggle, { passive: true });

  button.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function initFilters() {
  const tabs = document.querySelectorAll('.theme-tab');
  const cards = document.querySelectorAll('.chantier-card');
  if (!tabs.length || !cards.length) return;

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const filter = tab.dataset.filter;

      tabs.forEach(item => item.classList.remove('is-active'));
      tab.classList.add('is-active');

      cards.forEach(card => {
        const matches = filter === 'all' || card.dataset.theme === filter;
        card.classList.toggle('is-hidden', !matches);
      });
    });
  });
}

/*for the chatbot bouton*/

document.addEventListener("DOMContentLoaded", () => {
  const chatbotFab = document.getElementById("chatbotFab");

  if (!chatbotFab) return;

  chatbotFab.addEventListener("click", () => {
    alert("Le module de chat sera bientôt disponible.");
  });
});