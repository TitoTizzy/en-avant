/* Extrait de vingt-chantiers.html (Content-Security-Policy : aucun script inline). */
(() => {
  "use strict";

  const modal      = document.getElementById("ch-modal");
  const modalImg   = document.getElementById("ch-modal-img");
  const modalNum   = document.getElementById("ch-modal-num");
  const modalTitle = document.getElementById("ch-modal-title");
  const modalDesc  = document.getElementById("ch-modal-desc");
  const modalTag   = document.getElementById("ch-modal-tag");
  const closeBtn   = document.getElementById("ch-modal-close");

  // Injecter image + overlay dans chaque carte
  document.querySelectorAll(".chantier-card[data-img]").forEach(card => {
    // Couche image
    const bgDiv = document.createElement("div");
    bgDiv.className = "card-bg-img";
    const img = document.createElement("img");
    // Vignette légère (800 px) pour la carte ; l'image complète reste pour la fenêtre de détail.
    img.src = card.dataset.img.replace(/\.webp$/, "-800.webp");
    img.loading = "lazy";
    img.decoding = "async";
    img.onerror = () => { img.onerror = null; img.src = card.dataset.img; };
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    bgDiv.appendChild(img);

    // Couche gradient
    const overlay = document.createElement("div");
    overlay.className = "card-bg-overlay";

    card.prepend(overlay);
    card.prepend(bgDiv);

    // Clic → modal
    card.addEventListener("click", () => {
      const num   = card.querySelector(".card-index").textContent;
      const title = card.querySelector("h3").textContent;
      const desc  = card.querySelector("p").textContent;
      const tag   = card.querySelector(".card-theme").textContent;

      modalImg.src           = card.dataset.img;
      modalImg.alt           = title;
      modalNum.textContent   = "Chantier " + num;
      modalTitle.textContent = title;
      modalDesc.textContent  = desc;
      modalTag.textContent   = tag;

      modal.classList.add("open");
      document.body.style.overflow = "hidden";
      closeBtn.focus();
    });
  });

  function closeModal() {
    modal.classList.remove("open");
    document.body.style.overflow = "";
  }

  closeBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
})();

