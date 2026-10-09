(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const canvas = document.querySelector('.pf-particle-logo');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const w = 420, h = 72; canvas.width = w; canvas.height = h;
      ctx.font = 'bold 42px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('PRICE FINDER', w / 2, 52);
      const pixels = ctx.getImageData(0, 0, w, h).data, dots = [];
      for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) if (pixels[(y*w+x)*4+3] > 100) dots.push({ x, y, sx: Math.random()*w, sy: Math.random()*h, delay: Math.random()*.22 });
      let start;
      function draw(now) {
        if (start === undefined) start = now;
        const time = reduced.matches ? 1 : Math.min(1, (now-start)/2300);
        ctx.clearRect(0,0,w,h); ctx.fillStyle = '#dfbc7e';
        for (const dot of dots) {
          const t = Math.max(0, Math.min(1, (time-dot.delay)/(1-dot.delay))), e = 1-Math.pow(1-t,4);
          ctx.globalAlpha = .25+.75*e;
          ctx.fillRect(dot.sx+(dot.x-dot.sx)*e, dot.sy+(dot.y-dot.sy)*e, 2, 2);
        }
        ctx.globalAlpha=1;
        if (time < 1) requestAnimationFrame(draw);
      }
      requestAnimationFrame(draw);
    }
  }
  const section = document.querySelector('.pf-scroll-showcase');
  if (!section) return;
  const frames = Array.from(section.querySelectorAll('.pf-showcase-frame'));
  const steps = Array.from(section.querySelectorAll('.pf-showcase-step'));
  const stage = section.querySelector('.pf-showcase-stage');
  let queued = false;
  function update() {
    queued = false;
    if (reduced.matches) { section.classList.remove('pf-showcase-enhanced'); return; }
    section.classList.add('pf-showcase-enhanced');
    const rect = section.getBoundingClientRect();
    const available = Math.max(1, rect.height-stage.offsetHeight);
    const progress = Math.min(1,Math.max(0,(112-rect.top)/available));
    const position = progress*(frames.length-1);
    frames.forEach((frame,i) => {
      const distance = i-position, opacity = Math.max(0, 1-Math.abs(distance));
      frame.style.opacity = opacity;
      frame.style.transform = `translateY(${distance*65}px) scale(${1-Math.min(.18,Math.abs(distance)*.12)}) rotate(${distance*4}deg)`;
      const active = i === Math.round(position);
      frame.style.pointerEvents=active?'auto':'none';
      frame.querySelector('a').tabIndex=active?0:-1;
      frame.setAttribute('aria-hidden',String(!active));
      steps[i].classList.toggle('is-active',active);
    });
  }
  function schedule() { if (!queued) { queued=true;requestAnimationFrame(update); } }
  addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule);
  reduced.addEventListener('change', () => {
    if (reduced.matches) frames.forEach(frame=>{frame.removeAttribute('style');frame.removeAttribute('aria-hidden');frame.querySelector('a').tabIndex=0;});
    update();
  });update();
})();
