(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const UI = {
    en: { explore: 'Explore Menu', search: 'Search the menu…', none: 'No items match your search.', other: 'العربية', err: 'The menu could not be loaded. Please refresh the page.', menu: 'Menu', call: 'Call', wa: 'WhatsApp', fb: 'Facebook', ig: 'Instagram',
      add: 'Add', viewCart: 'View order', yourOrder: 'Your Order', total: 'Total', send: 'Send order on WhatsApp', emptyCart: 'Your order is empty.', choose: 'Choose an option', clear: 'Clear', noNumber: 'Ordering is not set up yet. Please ask the staff.', orderType: 'Order type', dineIn: 'Dine-in', takeaway: 'Takeaway', tableNo: 'Table number', tablePh: 'Enter your table number, e.g. 5', needTable: 'Please enter your table number.', orderHead: 'Hello MADA! I would like to order:' },
    ar: { explore: 'استكشف المنيو', search: 'ابحث في المنيو…', none: 'لا توجد أصناف مطابقة لبحثك.', other: 'English', err: 'تعذّر تحميل المنيو. حاول تحديث الصفحة.', menu: 'المنيو', call: 'اتصال', wa: 'واتساب', fb: 'فيسبوك', ig: 'إنستغرام',
      add: 'أضف', viewCart: 'عرض الطلب', yourOrder: 'طلبك', total: 'الإجمالي', send: 'ابعت الطلب على واتساب', emptyCart: 'طلبك فاضي لسه.', choose: 'اختار النوع', clear: 'مسح', noNumber: 'الطلب أونلاين لسه مش متظبط. اسأل الكاشير.', orderType: 'نوع الطلب', dineIn: 'في الكافيه', takeaway: 'تيك أواي', tableNo: 'رقم الترابيزة', tablePh: 'اكتب رقم الترابيزة، مثال 5', needTable: 'لو سمحت اكتب رقم الترابيزة.', orderHead: 'أهلاً MADA! عايز أطلب:' }
  };

  /* ===== ORDER CONFIG =====
   * SHOP_WHATSAPP: the WhatsApp number that receives orders, international
   * format, digits only (e.g. '2010XXXXXXXX' for Egypt).
   * TODO(owner): set the shop's real number here, or fill
   * settings.contact.whatsapp in data/menu.json (used as fallback). */
  const SHOP_WHATSAPP = '201507750540'; // MADA shop WhatsApp (from Moaz, Nov 23 2026)
  const PREVIEW = /[?&]preview=1/.test(location.search);
  const ROOT = window.__MADA_ROOT__ || '#app';
  let D = null, lang = 'en', q = '', io = null, activeId = null;

  // Name in current language; falls back to the other saved language, never machine-translates.
  const tr = o => {
    if (!o) return '';
    if (typeof o === 'string') return o;
    const pick = k => String(o[k] || '').trim();
    return pick(lang) || pick('en') || pick('ar');
  };
  const url = u => { u = String(u || '').trim(); if (!u) return ''; return /^https?:\/\//i.test(u) ? u : 'https://' + u.replace(/^\/+/, ''); };
  const t = k => UI[lang][k];

  /* ---------- cart ---------- */
  const CART_KEY = 'mada_cart_v1';
  let cart = {};
  try { cart = JSON.parse(localStorage.getItem(CART_KEY) || '{}') || {}; } catch (_) { cart = {}; }
  const saveCart = () => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (_) {} };
  const META_KEY = 'mada_ordermeta_v1';
  let orderType = 'takeaway', tableNo = '';
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) || '{}') || {};
    if (m.orderType === 'dineIn' || m.orderType === 'takeaway') orderType = m.orderType;
    tableNo = String(m.tableNo || '').replace(/[^\d]/g, '').slice(0, 3);
  } catch (_) {}
  const saveMeta = () => { try { localStorage.setItem(META_KEY, JSON.stringify({ orderType, tableNo })); } catch (_) {} };
  const validPrices = it => (it.prices || []).filter(p => p && p.value != null && p.value !== '' && Number(p.value) > 0);
  const findItem = id => D.items.find(i => i.id === id);
  const cartCount = () => Object.values(cart).reduce((a, b) => a + b, 0);
  function cartEntries() {
    const out = [];
    Object.keys(cart).forEach(k => {
      const q2 = cart[k]; if (!q2) return;
      const [id, vi] = k.split('::');
      const it = findItem(id); if (!it) return;
      const p = validPrices(it)[Number(vi) || 0]; if (!p) return;
      out.push({ key: k, it, price: Number(p.value), label: tr(p.label), name: tr(it.name), qty: q2 });
    });
    return out;
  }
  const cartTotal = () => cartEntries().reduce((a, e) => a + e.price * e.qty, 0);
  function addToCart(id, vi) {
    const k = id + '::' + (vi || 0);
    cart[k] = (cart[k] || 0) + 1;
    saveCart(); updateCartUI();
  }
  function changeQty(k, d) {
    cart[k] = (cart[k] || 0) + d;
    if (cart[k] <= 0) delete cart[k];
    saveCart(); updateCartUI(); renderCartSheet();
  }
  function shopNumber() {
    const fromData = (((D.settings || {}).contact || {}).whatsapp || '');
    return String(SHOP_WHATSAPP || fromData).replace(/\D/g, '');
  }
  function orderText() {
    const cur = tr(D.settings.currency) || 'EGP';
    const lines = cartEntries().map(e => `• ${e.qty}x ${e.name}${e.label ? ' (' + e.label + ')' : ''} - ${e.price * e.qty} ${cur}`);
    const head = t('orderHead') + (orderType === 'dineIn' && tableNo ? `\n${t('dineIn')} - ${t('tableNo')}: ${tableNo}` : '');
    return `${head}\n${lines.join('\n')}\n——————\n${t('total')}: ${cartTotal()} ${cur}`;
  }
  function checkout() {
    const num = shopNumber();
    if (!num || !cartCount()) { toast(t('noNumber')); return; }
    if (orderType === 'dineIn' && !tableNo) { toast(t('needTable')); const inp = $('#tno'); if (inp) inp.focus(); return; }
    const a = document.createElement('a');
    a.href = 'https://wa.me/' + num + '?text=' + encodeURIComponent(orderText());
    a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  }
  let toastTimer = 0;
  function toast(msg) {
    const el = $('#toast'); if (!el) return;
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  function openSheet(id) { const s = $(id); if (!s) return; const sc = $('#scrim'); sc.hidden = false; s.hidden = false; void s.offsetWidth; sc.classList.add('on'); s.classList.add('open'); }
  function closeSheets() { const sc = $('#scrim'); if (sc) { sc.classList.remove('on'); setTimeout(() => { if (!sc.classList.contains('on')) sc.hidden = true; }, 250); } $$('.sheet').forEach(s => { s.classList.remove('open'); setTimeout(() => { if (!s.classList.contains('open')) s.hidden = true; }, 300); }); }
  function renderVariantSheet(it) {
    const cur = tr(D.settings.currency) || 'EGP';
    const ps = validPrices(it);
    $('#vsheet').innerHTML = `<div class="sh-head"><h3>${esc(tr(it.name))}</h3><button class="x" type="button" data-close aria-label="×">×</button></div>` +
      `<p class="sh-sub">${esc(t('choose'))}</p>` +
      ps.map((p, i) => `<button class="vrow" type="button" data-pick="${esc(it.id)}::${i}"><span>${esc(tr(p.label)) || esc(tr(it.name))}</span><span class="pr">${esc(p.value)}<small>${esc(cur)}</small></span><span class="vadd">${esc(t('add'))} +</span></button>`).join('');
    openSheet('#vsheet');
  }
  function renderCartSheet() {
    const el = $('#csheet'); if (!el) return;
    const cur = tr(D.settings.currency) || 'EGP';
    const es = cartEntries();
    el.innerHTML = `<div class="sh-head"><h3>${esc(t('yourOrder'))}</h3><button class="x" type="button" data-close aria-label="×">×</button></div>` +
      (es.length ? es.map(e => `<div class="crow"><div class="cinfo"><span class="cnm">${esc(e.name)}</span>${e.label ? `<span class="clb">${esc(e.label)}</span>` : ''}<span class="cpr">${e.price * e.qty} ${esc(cur)}</span></div><div class="step"><button type="button" data-dec="${esc(e.key)}" aria-label="−">−</button><b>${e.qty}</b><button type="button" data-inc="${esc(e.key)}" aria-label="+">+</button></div></div>`).join('') +
        `<div class="otype" role="group" aria-label="${esc(t('orderType'))}">` +
        `<button class="obtn${orderType === 'takeaway' ? ' on' : ''}" type="button" data-otype="takeaway">${esc(t('takeaway'))}</button>` +
        `<button class="obtn${orderType === 'dineIn' ? ' on' : ''}" type="button" data-otype="dineIn">${esc(t('dineIn'))}</button></div>` +
        (orderType === 'dineIn' ? `<label class="table-label" for="tno">${esc(t('tableNo'))}</label><input class="tno" id="tno" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" placeholder="${esc(t('tablePh'))}" value="${esc(tableNo)}" aria-label="${esc(t('tableNo'))}">` : '') +
        `<div class="ctotal"><span>${esc(t('total'))}</span><span class="pr">${cartTotal()}<small>${esc(cur)}</small></span></div>` +
        `<button class="send" type="button" data-checkout>${esc(t('send'))}</button>` +
        `<button class="clr" type="button" data-clear>${esc(t('clear'))}</button>`
      : `<p class="cempty">${esc(t('emptyCart'))}</p>`);
  }
  function updateCartUI() {
    const n = cartCount(), tot = cartTotal();
    const cur = D ? (tr(D.settings.currency) || 'EGP') : 'EGP';
    const bar = $('#cartbar');
    if (bar) {
      bar.hidden = !n;
      document.body.classList.toggle('has-cart', !!n);
      bar.innerHTML = n ? `<button class="cbtn" type="button" data-opencart><span class="cbag">🛍<i>${n}</i></span><span class="clabel">${esc(t('viewCart'))}</span><span class="ctot">${tot} ${esc(cur)}</span></button>` : '';
    }
    $$('.add-btn').forEach(b => {
      const id = b.dataset.add;
      const cnt = Object.keys(cart).filter(k => k.split('::')[0] === id).reduce((a, k) => a + cart[k], 0);
      b.classList.toggle('in', cnt > 0);
      const badge = b.querySelector('.cnt');
      if (badge) { badge.textContent = cnt; badge.hidden = !cnt; }
    });
  }

  function applyTheme() {
    const c = (D.settings && D.settings.colors) || {};
    Object.keys(c).forEach(k => { if (/^#[0-9a-f]{3,8}$/i.test(c[k])) document.documentElement.style.setProperty('--' + k, c[k]); });
  }

  function priceHtml(p, cur) {
    return `<span class="pr">${esc(p.value)}<small>${esc(cur)}</small></span>`;
  }

  function itemHtml(it, cur) {
    const prices = validPrices(it);
    const labeled = prices.some(p => tr(p.label));
    const desc = tr(it.desc);
    let top;
    if (prices.length && !labeled) {
      top = `<div class="row"><span class="nm">${esc(tr(it.name))}</span><span class="lead"></span>${priceHtml(prices[0], cur)}</div>`;
    } else {
      top = `<div class="row"><span class="nm">${esc(tr(it.name))}</span></div>` +
        prices.map(p => `<div class="opt"><span class="lb">${esc(tr(p.label))}</span><span class="lead"></span>${priceHtml(p, cur)}</div>`).join('');
    }
    const img = it.image ? `<img class="thumb" loading="lazy" decoding="async" alt="" src="${esc(it.image)}">` : '';
    const add = prices.length ? `<button class="add-btn" type="button" data-add="${esc(it.id)}"><span class="cnt" hidden>0</span>${esc(t('add'))}<b>+</b></button>` : '';
    return `<li class="item">${img}<div class="info">${top}${desc ? `<p class="ds">${esc(desc)}</p>` : ''}</div>${add}</li>`;
  }

  function matches(it, cat) {
    if (!q) return true;
    const hay = [it.name && it.name.en, it.name && it.name.ar, it.desc && it.desc.en, it.desc && it.desc.ar, cat.name && cat.name.en, cat.name && cat.name.ar].join(' ').toLowerCase();
    return hay.includes(q);
  }

  function renderMenu() {
    const s = D.settings, cur = tr(s.currency) || 'EGP';
    const sections = [];
    D.categories.forEach(cat => {
      if (cat.visible === false) return;
      const all = D.items.filter(i => i.category === cat.id && i.visible !== false);
      const list = all.filter(i => matches(i, cat));
      if (q ? !list.length : (!all.length && !s.showEmptyCategories)) return;
      sections.push({ cat, list });
    });
    $('#chips').innerHTML = sections.map(x => `<button class="chip" type="button" data-cat="${esc(x.cat.id)}">${esc(tr(x.cat.name))}</button>`).join('');
    $('#menu').innerHTML = sections.length ? sections.map(({ cat, list }, n) => {
      const d = tr(cat.desc);
      return `<section class="cat" data-id="${esc(cat.id)}"><div class="cat-head"><span class="cat-no">${String(n + 1).padStart(2, '0')}</span><h2>${esc(tr(cat.name))}</h2><span class="cat-n">${list.length}</span></div>` +
        (cat.image ? `<img class="cat-img" loading="lazy" decoding="async" alt="" src="${esc(cat.image)}">` : '') +
        (d ? `<p class="cat-desc">${esc(d)}</p>` : '') +
        `<ul class="items">${list.map(i => itemHtml(i, cur)).join('')}</ul></section>`;
    }).join('') : `<p class="empty">${esc(t('none'))}</p>`;
    reveal();
    observe();
    updateCartUI();
  }

  /* ---------- motion & 3D ---------- */
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const st = { mx: 0, my: 0, sy: 0 };
  let raf = 0, rio = null, motionOn = false;

  function beansHtml() {
    let h = '';
    for (let i = 0; i < 14; i++) {
      const z = 0.3 + Math.random() * 1.3, s = Math.round(14 + z * 20);
      h += `<span class="bw" style="left:${(Math.random() * 94).toFixed(1)}%;top:${(Math.random() * 88).toFixed(1)}%;--z:${z.toFixed(2)}"><i class="bean" style="--s:${s}px;--dur:${(5 + Math.random() * 6).toFixed(1)}s;--dl:-${(Math.random() * 8).toFixed(1)}s;--r:${Math.round(Math.random() * 360)}deg;opacity:${(0.35 + z * 0.35).toFixed(2)}${z < 0.7 ? ';filter:blur(1.5px)' : ''}"></i></span>`;
    }
    return `<div class="beans" aria-hidden="true">${h}</div>`;
  }
  function marqueeHtml() {
    const names = D.categories.filter(c => c.visible !== false).map(c => tr(c.name)).filter(Boolean);
    const one = names.map(n => `<span>${esc(n)}</span><b>✦</b>`).join('');
    return one + one;
  }
  function applyMotion() {
    raf = 0;
    const h = $('.hero'); if (!h) return;
    h.style.setProperty('--mx', st.mx.toFixed(3));
    h.style.setProperty('--my', st.my.toFixed(3));
    h.style.setProperty('--sy', st.sy.toFixed(0));
    const pg = $('.progress'), tt = $('.to-top');
    const max = document.documentElement.scrollHeight - innerHeight;
    if (pg) pg.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, scrollY / max) : 0).toFixed(4) + ')';
    if (tt) tt.classList.toggle('show', scrollY > innerHeight * 0.8);
  }
  function sched() { if (!raf) raf = requestAnimationFrame(applyMotion); }
  function initMotion() {
    if (motionOn) return;
    motionOn = true;
    addEventListener('scroll', sched, { passive: true });
    if (RM) return;
    const clamp = v => Math.max(-1, Math.min(1, v));
    addEventListener('pointermove', e => { st.mx = e.clientX / innerWidth * 2 - 1; st.my = e.clientY / innerHeight * 2 - 1; sched(); }, { passive: true });
    addEventListener('scroll', () => { st.sy = Math.min(scrollY, innerHeight * 1.2); sched(); }, { passive: true });
    addEventListener('deviceorientation', e => { if (e.gamma == null) return; st.mx = clamp(e.gamma / 25); st.my = clamp((e.beta - 50) / 25); sched(); });
  }
  function reveal() {
    if (rio) rio.disconnect();
    const els = $$('.cat,.item');
    if (RM || q || !('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
    rio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); rio.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px', threshold: 0.05 });
    els.forEach((e, i) => { if (e.classList.contains('item')) e.style.setProperty('--d', (i % 6) * 60 + 'ms'); rio.observe(e); });
  }

  function observe() {
    if (io) io.disconnect();
    activeId = null;
    if (!('IntersectionObserver' in window)) return;
    io = new IntersectionObserver(es => {
      es.forEach(e => { if (e.isIntersecting) setActive(e.target.dataset.id); });
    }, { rootMargin: '-30% 0px -65% 0px' });
    $$('.cat').forEach(c => io.observe(c));
  }

  function setActive(id) {
    if (id === activeId) return;
    activeId = id;
    $$('.chip').forEach(c => {
      const on = c.dataset.cat === id;
      c.classList.toggle('on', on);
      if (on) c.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    });
  }

  function footerHtml(s) {
    const c = s.contact || {}, links = [];
    if (c.phone) links.push(`<a href="tel:${esc(String(c.phone).replace(/[^\d+]/g, ''))}">${t('call')}: ${esc(c.phone)}</a>`);
    if (c.whatsapp) links.push(`<a href="https://wa.me/${esc(String(c.whatsapp).replace(/\D/g, ''))}" target="_blank" rel="noopener">${t('wa')}</a>`);
    if (c.facebook) links.push(`<a href="${esc(url(c.facebook))}" target="_blank" rel="noopener">${t('fb')}</a>`);
    if (c.instagram) links.push(`<a href="${esc(url(c.instagram))}" target="_blank" rel="noopener">${t('ig')}</a>`);
    return `<footer><div class="ft-name">${esc(tr(s.name))}</div>` +
      (links.length ? `<div class="links">${links.join('')}</div>` : '') +
      (c.address ? `<p class="addr">${esc(c.address)}</p>` : '') + `</footer>`;
  }

  function render() {
    const s = D.settings;
    applyTheme();
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = tr(s.name) + ' | ' + t('menu');
    const md = $('meta[name=description]');
    const about = tr(s.description) || tr(s.tagline);
    if (md && about) md.content = about;
    const ogt = $('meta[property="og:title"]'); if (ogt) ogt.content = tr(s.name);
    $(ROOT).innerHTML = `
      <header class="hero" id="top">
        <div class="hero-bg"></div>
        ${beansHtml()}
        <button class="lang-btn" type="button" data-lang>${t('other')}</button>
        <div class="hero-inner">
          <div class="logo-wrap"><div class="steam" aria-hidden="true"><span></span><span></span><span></span></div><div class="logo-card"><img src="${esc(s.logo || 'assets/logo.png')}" alt="${esc(tr(s.name))}" width="450" height="292"></div></div>
          <h1>${esc(tr(s.name))}</h1>
          ${tr(s.tagline) ? `<p class="tag">${esc(tr(s.tagline))}</p>` : ''}
          ${tr(s.description) ? `<p class="about">${esc(tr(s.description))}</p>` : ''}
          <a class="btn" href="#menu-start" data-go>${t('explore')}</a>
        </div>
      </header>
      <div class="marquee" aria-hidden="true"><div class="mq">${marqueeHtml()}</div></div>
      <div class="bar" id="menu-start">
        <div class="search"><input id="q" type="search" placeholder="${esc(t('search'))}" aria-label="${esc(t('search'))}" autocomplete="off"><button class="lang-mini" type="button" data-lang>${t('other')}</button></div>
        <nav class="chips" id="chips" aria-label="Categories"></nav>
      </div>
      <main id="menu"></main>
      ${footerHtml(s)}
      <div class="progress" aria-hidden="true"></div>
      <button class="to-top" type="button" aria-label="Top" data-top>↑</button>
      <div class="cartbar" id="cartbar" hidden></div>
      <div class="scrim" id="scrim" hidden data-close></div>
      <div class="sheet" id="vsheet" hidden role="dialog" aria-modal="true"></div>
      <div class="sheet" id="csheet" hidden role="dialog" aria-modal="true"></div>
      <div class="toast" id="toast" role="status"></div>`;
    if (s.cover) $('.hero-bg').style.backgroundImage = 'url("' + String(s.cover).replace(/"/g, '%22') + '")';
    q = '';
    renderMenu();
    initMotion(); sched();
  }

  document.addEventListener('click', e => {
    if (!D) return;
    if (e.target.closest('[data-lang]')) {
      lang = lang === 'ar' ? 'en' : 'ar';
      try { localStorage.setItem('mada_lang', lang); } catch (_) {}
      return render();
    }
    if (e.target.closest('[data-top]')) return scrollTo({ top: 0, behavior: 'smooth' });
    const go = e.target.closest('[data-go]');
    if (go) { e.preventDefault(); $('#menu-start').scrollIntoView({ behavior: 'smooth' }); return; }
    const ch = e.target.closest('.chip');
    if (ch) {
      const sec = $$('.cat').find(c => c.dataset.id === ch.dataset.cat);
      if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    /* cart */
    const addB = e.target.closest('[data-add]');
    if (addB) {
      const it = findItem(addB.dataset.add); if (!it) return;
      const ps = validPrices(it);
      if (ps.length > 1) renderVariantSheet(it); else if (ps.length === 1) { addToCart(it.id, 0); toast(tr(it.name) + ' ✓'); }
      return;
    }
    const pick = e.target.closest('[data-pick]');
    if (pick) { const [id, vi] = pick.dataset.pick.split('::'); addToCart(id, Number(vi)); closeSheets(); return; }
    if (e.target.closest('[data-opencart]')) { renderCartSheet(); openSheet('#csheet'); return; }
    if (e.target.closest('[data-close]')) { closeSheets(); return; }
    const inc = e.target.closest('[data-inc]');
    if (inc) { changeQty(inc.dataset.inc, 1); return; }
    const dec = e.target.closest('[data-dec]');
    if (dec) { changeQty(dec.dataset.dec, -1); return; }
    const ot = e.target.closest('[data-otype]');
    if (ot) { orderType = ot.dataset.otype; saveMeta(); renderCartSheet(); return; }
    if (e.target.closest('[data-clear]')) { cart = {}; saveCart(); updateCartUI(); renderCartSheet(); return; }
    if (e.target.closest('[data-checkout]')) { checkout(); return; }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheets(); });
  document.addEventListener('input', e => {
    if (e.target.id === 'q') { q = e.target.value.trim().toLowerCase(); renderMenu(); }
    if (e.target.id === 'tno') { const v = e.target.value.replace(/[^\d]/g, '').slice(0, 3); if (e.target.value !== v) e.target.value = v; tableNo = v; saveMeta(); }
  });

  function start(data) {
    D = data;
    D.categories = D.categories || [];
    D.items = D.items || [];
    D.settings = D.settings || {};
    let saved = null;
    try { saved = localStorage.getItem('mada_lang'); } catch (_) {}
    if (!D._langSet) { lang = saved === 'ar' || saved === 'en' ? saved : (D.settings.defaultLang === 'ar' ? 'ar' : 'en'); D._langSet = true; }
    render();
  }

  if (PREVIEW) {
    // Admin preview: data arrives from the parent admin page (same origin only).
    window.addEventListener('message', e => {
      if (e.origin === location.origin && e.data && e.data.type === 'mada-preview') {
        const keep = D ? lang : null;
        D = null; start(e.data.data); if (keep) { lang = keep; render(); }
      }
    });
    if (window.parent !== window) window.parent.postMessage({ type: 'mada-preview-ready' }, location.origin);
  } else {
    if (window.__MADA_DATA__) {
      start(window.__MADA_DATA__);
    } else {
      fetch('data/menu.json', { cache: 'no-cache' })
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(start)
        .catch(() => { $(ROOT).innerHTML = `<p class="err">${UI.en.err}<br>${UI.ar.err}</p>`; });
    }
  }
})();
