/** Конфетти фирменных цветов — при публикации встречи и одобренной заявке. */
export function confetti(n = 70) {
  if (typeof document === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const box = document.createElement("div");
  box.className = "m-confetti";
  const colors = ["#6C3BFF", "#A24DFF", "#FF6FA0", "#FFB27A", "#5AA9FF", "#FFD166"];
  for (let i = 0; i < n; i++) {
    const c = document.createElement("i");
    c.style.left = `${Math.random() * 100}%`;
    c.style.background = colors[i % colors.length] ?? "#6C3BFF";
    c.style.setProperty("--x", `${(Math.random() - 0.5) * 160}px`);
    c.style.setProperty("--r", `${(Math.random() - 0.5) * 900}deg`);
    c.style.setProperty("--d", `${1.2 + Math.random() * 1.1}s`);
    c.style.animationDelay = `${Math.random() * 0.25}s`;
    box.appendChild(c);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 2800);
}
