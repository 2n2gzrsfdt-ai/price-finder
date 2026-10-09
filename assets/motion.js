(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const hero = document.querySelector('.pf-home .hero');
  const heading = hero?.querySelector('h1');
  if (heading && !reduced.matches) {
    heading.setAttribute('aria-label', heading.textContent);
    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    let index = 0;
    for (const node of nodes) {
      const fragment = document.createDocumentFragment();
      for (const char of Array.from(node.textContent)) {
        const span = document.createElement('span'); span.className = 'pf-letter';
        span.textContent = char; span.setAttribute('aria-hidden', 'true');
        span.style.setProperty('--pf-letter-index', index++); fragment.append(span);
      }
      node.replaceWith(fragment);
    }
  }
  if (hero) {
    const ornaments = document.createElement('div'); ornaments.className = 'pf-hero-ornaments'; ornaments.setAttribute('aria-hidden', 'true');
    for (const cls of ['pf-orbit', 'pf-orbit', 'pf-floating-tag']) { const node = document.createElement('i'); node.className = cls; ornaments.append(node); }
    if (!reduced.matches) {
      const aurora = document.createElement('div'); aurora.className = 'pf-aurora'; ornaments.prepend(aurora);
      for (let i = 0; i < 8; i++) {
        const spark = document.createElement('i'); spark.className = 'pf-spark';
        spark.style.setProperty('--spark-x', ((i * 37 + 9) % 100) + '%');
        spark.style.setProperty('--spark-y', ((i * 23 + 12) % 100) + '%');
        spark.style.setProperty('--spark-time', (4 + i % 5) + 's');
        spark.style.setProperty('--spark-delay', (-i * .65) + 's'); ornaments.append(spark);
      }
    }
    hero.prepend(ornaments);
    const cue = document.createElement('div'); cue.className = 'pf-scroll-cue'; cue.textContent = 'SCROLL TO EXPLORE'; cue.setAttribute('aria-hidden', 'true'); hero.append(cue);
  }
  const progress = document.createElement('div');
  progress.className = 'pf-scroll-progress'; progress.setAttribute('aria-hidden', 'true');
  document.body.append(progress);
  let scheduled = false;
  function paintProgress() {
    const range = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${range > 0 ? Math.min(1, Math.max(0, scrollY / range)) : 0})`;
    if (hero && !reduced.matches) {
      const bounds = hero.getBoundingClientRect();
      if (bounds.bottom > 0 && bounds.top < innerHeight) {
        const ratio = Math.min(1, Math.max(0, -bounds.top / bounds.height));
        hero.style.setProperty('--pf-scroll-turn', (ratio * 75) + 'deg');
        hero.style.setProperty('--pf-scroll-drift', (ratio * 32) + 'px');
        hero.style.setProperty('--pf-photo-drift', (ratio * 12) + 'px');
      }
    }
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
          const card = entry.target.classList.contains('pf-feature');
          const order = card ? Array.from(entry.target.parentElement.children).indexOf(entry.target) : 0;
          entry.target.animate([{ opacity: .1, transform: 'translateY(55px) scale(.91) rotate(3deg)' }, { opacity: 1, transform: 'translateY(-5px) scale(1.01) rotate(-.5deg)', offset: .8 }, { opacity: 1, transform: 'translateY(0) scale(1) rotate(0deg)' }], { duration: 750, delay: order * 110, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
          const photo = entry.target.querySelector('.pf-feature-art');
          if (photo) photo.animate([{ clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0% 0 0 0)' }], { duration: 900, delay: order * 110, easing: 'cubic-bezier(.2,.7,.2,1)' });
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
  document.addEventListener('click', event => {
    if (reduced.matches || event.detail === 0 || !(event.target instanceof Element) || !event.target.closest('button,.pf-feature')) return;
    const wave = document.createElement('i'); wave.className = 'pf-tap-wave'; wave.setAttribute('aria-hidden', 'true');
    wave.style.left = event.clientX + 'px'; wave.style.top = event.clientY + 'px'; document.body.append(wave);
    setTimeout(() => wave.remove(), 700);
  });
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
