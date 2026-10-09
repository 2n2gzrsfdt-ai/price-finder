(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const progress = document.createElement('div');
  progress.className = 'pf-scroll-progress'; progress.setAttribute('aria-hidden', 'true');
  document.body.append(progress);
  let scheduled = false;
  function paintProgress() {
    const range = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${range > 0 ? Math.min(1, Math.max(0, scrollY / range)) : 0})`;
    scheduled = false;
  }
  addEventListener('scroll', () => { if (!scheduled) { scheduled = true; requestAnimationFrame(paintProgress); } }, { passive: true });
  addEventListener('resize', paintProgress); paintProgress();
  const dock = document.createElement('nav');
  dock.className = 'pf-mobile-dock'; dock.setAttribute('aria-label', '価格検索とウォッチへのショートカット');
  for (const [label, id] of [['価格を比較する', 'search'], ['値下がりウォッチ', 'priceWatch']]) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.addEventListener('click', () => {
      document.getElementById(id)?.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'start' });
    });
    dock.append(button);
  }
  document.body.append(dock);
  if ('IntersectionObserver' in window) {
    const observed = new WeakSet();
    const reveal = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        reveal.unobserve(entry.target);
        if (!reduced.matches && typeof entry.target.animate === 'function') {
          entry.target.animate([{ opacity: .35, transform: 'translateY(18px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 560, easing: 'cubic-bezier(.2,.7,.2,1)' });
        }
      }
    }, { threshold: .08 });
    function observeCards() {
      document.querySelectorAll('.pf-feature,.pf-section-head,.watchCard,.pf-home .card,.pf-home .result').forEach(node => {
        if (!observed.has(node)) { observed.add(node); reveal.observe(node); }
      });
    }
    observeCards();
    const results = document.getElementById('results');
    if (results) new MutationObserver(observeCards).observe(results, { childList: true, subtree: true });
  }
  const button = document.getElementById('compareButton');
  if (button) {
    const updateBusy = () => {
      const busy = button.disabled;
      button.classList.toggle('pf-search-busy', busy);
      button.setAttribute('aria-busy', String(busy));
    };
    new MutationObserver(updateBusy).observe(button, { attributes: true, attributeFilter: ['disabled'] });
    updateBusy();
  }
})();
