/* Yahoo! Shopping affiliate IDs supplied by the site owner. */
window.priceFinderAffiliateUrl = function (value) {
  try {
    const destination = new URL(value, 'https://2n2gzrsfdt-ai.github.io/price-finder/');
    if (destination.protocol !== 'https:' || !['shopping.yahoo.co.jp', 'store.shopping.yahoo.co.jp'].includes(destination.hostname)) return value;
    const referral = new URL('https://ck.jp.ap.valuecommerce.com/servlet/referral');
    referral.searchParams.set('sid', '3783818');
    referral.searchParams.set('pid', '892722877');
    referral.searchParams.set('vc_url', destination.href);
    return referral.href;
  } catch { return value; }
};
(() => {
  'use strict';
  const section = document.getElementById('comparison');
  if (!section) return;
  const status = document.getElementById('price-status');
  const offers = document.getElementById('price-offers');
  const retry = document.getElementById('retry-prices');
  const { query, model, capacity } = section.dataset;
  const endpoints = [
    ['楽天市場', (window.PRICE_FINDER_RAKUTEN_API_BASE || 'https://price-finder-production-ed37.up.railway.app') + '/api/rakuten'],
    ['Yahoo!ショッピング', (window.PRICE_FINDER_API_BASE || 'https://price-finder-api.2n2gzrsfdt.workers.dev') + '/api/search']
  ];
  const analyticsBase = (window.PRICE_FINDER_RAKUTEN_API_BASE || 'https://price-finder-production-ed37.up.railway.app').replace(/\/$/, '');
  function track(type, shop = '') {
    try {
      fetch(analyticsBase + '/api/analytics/event', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'omit', keepalive: true,
        body: JSON.stringify({ type, query, shop })
      }).catch(() => {});
    } catch { /* Tracking must never block a comparison or purchase. */ }
  }
  track('product_page_view');
  for (const link of document.querySelectorAll('a[href^="./?q="]')) {
    link.addEventListener('click', () => track('product_compare_click'));
  }
  let generation = 0;
  function normalized(value) { return String(value || '').normalize('NFKC').toLowerCase().replace(/[\s・_-]/g, ''); }
  function matches(name) {
    const n = normalized(name);
    if (/ケース|カバー|フィルム|ガラス|保護|ジャンク|部品|空箱|月額|分割|レンタル|case|cover|film|protector/.test(n)) return false;
    const c = capacity.toLowerCase();
    if (!new RegExp('(^|[^0-9])' + c + '(?![a-z0-9])').test(n)) return false;
    if (model.startsWith('iPhone')) {
      const m = normalized(model);
      if (!n.includes(m)) return false;
      if (!m.includes('promax') && n.includes('promax')) return false;
      if (!m.includes('pro') && /iphone(?:16|17)(?:pro|plus|e|air)/.test(n)) return false;
    } else {
      if (!n.includes('ipadair') || !n.includes('m4')) return false;
      const size = model.includes('11インチ') ? '11' : '13';
      if (!new RegExp(size + '(?:インチ|inch|型|″|”|in)').test(n)) return false;
    }
    return true;
  }
  function safeUrl(value) {
    try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : null; } catch { return null; }
  }
  function normalize(item, fallback) {
    if (!matches(item.name)) return null;
    const price = Number(item.price);
    const url = safeUrl(item.affiliateUrl || item.affiliate_url || item.url);
    if (!Number.isFinite(price) || price <= 0 || !url) return null;
    // Missing shipping is never interpreted as free shipping.
    const known = item.shippingKnown === true && Number.isFinite(Number(item.shipping)) && Number(item.shipping) >= 0;
    return { name: item.name, shop: item.shop || fallback, price, known,
      shipping: known ? Number(item.shipping) : null,
      total: known ? price + Number(item.shipping) : null, url };
  }
  async function fetchSource(endpoint) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(endpoint + '?q=' + encodeURIComponent(query), { signal: controller.signal, credentials: 'omit' });
      if (!response.ok) throw new Error('source unavailable');
      const data = await response.json();
      if (!data.ok || !Array.isArray(data.items)) throw new Error('invalid source');
      return data.items;
    } finally { clearTimeout(timeout); }
  }
  function text(tag, value, cls) {
    const node = document.createElement(tag); node.textContent = value; if (cls) node.className = cls; return node;
  }
  const yen = value => '¥' + value.toLocaleString('ja-JP');
  async function load() {
    const run = ++generation;
    retry.disabled = true;
    offers.replaceChildren();
    status.textContent = '価格情報を確認しています…';
    const results = await Promise.allSettled(endpoints.map(([, endpoint]) => fetchSource(endpoint)));
    if (run !== generation) return;
    const rows = []; const seen = new Set(); const unavailable = [];
    results.forEach((r, i) => {
      if (r.status !== 'fulfilled') { unavailable.push(endpoints[i][0]); return; }
      r.value.forEach(item => {
        const row = normalize(item, endpoints[i][0]);
        if (row && !seen.has(row.url)) { seen.add(row.url); rows.push(row); }
      });
    });
    rows.sort((a, b) => (a.known === b.known ? (a.total ?? a.price) - (b.total ?? b.price) : a.known ? -1 : 1));
    const checkedAt = new Date().toLocaleString('ja-JP');
    status.textContent = rows.length ? rows.length + '件の購入候補・' + checkedAt + '取得。送料確認済みの商品を総額順で先に表示します。' : '条件に合う本体価格を取得できませんでした。検索画面で表記や条件を変えて確認してください。';
    if (unavailable.length) status.textContent += ' 取得できないショップ：' + unavailable.join('・') + '。';
    for (const row of rows.slice(0, 12)) {
      const article = text('article', '', 'offer');
      const details = document.createElement('div');
      details.append(text('b', row.name), text('small', row.shop), text('div', yen(row.total ?? row.price), 'amount'), text('small', row.known ? '商品 ' + yen(row.price) + '＋送料 ' + yen(row.shipping) : '商品価格のみ・送料未確認'));
      const link = text('a', '購入先で条件を確認', 'btn'); link.href = window.priceFinderAffiliateUrl(row.url); link.rel = 'sponsored noopener';
      link.addEventListener('click', () => track('product_shop_click', row.shop));
      article.append(details, link); offers.append(article);
    }
    retry.disabled = false;
  }
  retry.addEventListener('click', load);
  load();
})();
