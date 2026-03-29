const revealEls = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.14 }
);
revealEls.forEach((el) => observer.observe(el));

for (const card of document.querySelectorAll('.accordion-card')) {
  const button = card.querySelector('.accordion-toggle');
  button?.addEventListener('click', () => {
    const isOpen = card.classList.contains('open');
    card.classList.toggle('open', !isOpen);
    button.setAttribute('aria-expanded', String(!isOpen));
  });
}
