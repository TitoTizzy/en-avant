document.addEventListener("DOMContentLoaded", () => {
  const trigger = document.getElementById("scrollToStructure");
  const target = document.getElementById("structure");

  if (!trigger || !target) return;

  trigger.addEventListener("click", (event) => {
    event.preventDefault();

    target.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

    target.classList.remove("flash-target");
    void target.offsetWidth;
    target.classList.add("flash-target");

    window.setTimeout(() => {
      target.classList.remove("flash-target");
    }, 1400);
  });
});

/* Le bouton du chatbot est géré par js/premium.js (Assistant En Avant). */
