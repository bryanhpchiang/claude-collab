import { $ } from "../lib/dom.js";

export function initTreats({ state, onAnnounce }) {
  const treatsWrap = $("treats-wrap");
  const treatsButton = $("treats-btn");
  const treatsPopup = $("treats-popup");

  function fireTreat(kind) {
    treatsPopup.classList.remove("open");
    const overlay = document.createElement("div");
    overlay.id = "reaction-overlay";
    document.body.appendChild(overlay);

    const count = 40;
    const colors = ["#ff9a56", "#ff6b6b", "#58a6ff", "#3fb950", "#d29922"];

    for (let index = 0; index < count; index += 1) {
      const particle = document.createElement("div");
      particle.className = "r-particle";
      const delay = Math.random() * 0.8;
      const duration = 2 + Math.random() * 1.2;
      const x = Math.random() * 100;
      const size = 16 + Math.random() * 20;
      particle.style.fontSize = `${size}px`;
      particle.style.left = `${x}vw`;
      particle.style.animationDelay = `${delay}s`;
      particle.style.animationDuration = `${duration}s`;
      particle.style.animationFillMode = "forwards";

      if (kind === "confetti") {
        const shapes = ["■", "●", "▲", "★"];
        particle.textContent = shapes[index % shapes.length];
        particle.style.color = colors[index % colors.length];
        particle.style.top = "-30px";
        particle.style.animation = `fall-down ${duration}s ${delay}s ease-in forwards`;
      } else if (kind === "hearts") {
        particle.textContent = ["❤️", "💕", "💖", "💗"][index % 4];
        particle.style.bottom = "-30px";
        particle.style.top = "auto";
        particle.style.animation = `float-up ${duration}s ${delay}s ease-out forwards`;
      } else if (kind === "stars") {
        particle.textContent = ["⭐", "✨", "🌟", "💫"][index % 4];
        particle.style.left = "50vw";
        particle.style.top = "50vh";
        const angle = (index / count) * Math.PI * 2;
        const distance = 40 + Math.random() * 50;
        const tx = `${Math.cos(angle) * distance}vw`;
        const ty = `${Math.sin(angle) * distance}vh`;
        particle.animate(
          [
            { transform: "translate(0,0) scale(0.3)", opacity: 1 },
            { transform: `translate(${tx},${ty}) scale(1.2)`, opacity: 0 },
          ],
          { duration: duration * 1000, delay: delay * 1000, fill: "forwards" },
        );
      } else if (kind === "fire") {
        particle.textContent = ["🔥", "🔥", "💥", "✨"][index % 4];
        particle.style.bottom = "-30px";
        particle.style.top = "auto";
        particle.style.animation = `float-up ${duration}s ${delay}s ease-out forwards`;
      }

      overlay.appendChild(particle);
    }

    const label = {
      confetti: "confetti",
      hearts: "hearts",
      stars: "stars",
      fire: "fire",
    }[kind];
    onAnnounce(`${state.myName || "Someone"} sent ${label}!`);
    setTimeout(() => overlay.remove(), 3500);
  }

  treatsButton.addEventListener("click", () => {
    treatsPopup.classList.toggle("open");
  });

  treatsPopup.querySelectorAll("[data-treat]").forEach((button) => {
    button.addEventListener("click", () => fireTreat(button.dataset.treat));
  });

  document.addEventListener("click", (event) => {
    if (!treatsWrap.contains(event.target)) treatsPopup.classList.remove("open");
  });
}
