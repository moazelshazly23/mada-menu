(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const UI = {
    en: { explore: 'Explore Menu', search: 'Search the menu…', none: 'No items match your search.', other: 'العربية', err: 'The menu could not be loaded. Please refresh the page.', menu: 'Menu', call: 'Call', wa: 'WhatsApp', fb: 'Facebook', ig: 'Instagram' },
    ar: { explore: 'استكشف المنيو', search: 'ابحث في المنيو…', none: 'لا توجد أصناف مطابقة لبحثك.', other: 'English', err: 'تعذّر تحميل المنيو. حاول تحديث الصفحة.', menu: 'المنيو', call: 'اتصال', wa: 'واتساب', fb: 'فيسبوك', ig: 'إنستغرام' }
  };
  const PREVIEW = /[?&]preview=1/.test(location.search);
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

  function applyTheme() {
    const c = (D.settings && D.settings.colors) || {};
    Object.keys(c).forEach(k => { if (/^#[0-9a-f]{3,8}$/i.test(c[k])) document.documentElement.style.setProperty('--' + k, c[k]); });
  }

  function priceHtml(p, cur) {
    return `<span class="pr">${esc(p.value)}<small>${esc(cur)}</small></span>`;
  }

  function itemHtml(it, cur) {
    const prices = (it.prices || []).filter(p => p && p.value != null && p.value !== '' && Number(p.value) > 0);
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
    return `<li class="item">${img}<div class="info">${top}${desc ? `<p class="ds">${esc(desc)}</p>` : ''}</div></li>`;
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
    $('#menu').innerHTML = sections.length ? sections.map(({ cat, list }) => {
      const d = tr(cat.desc);
      return `<section class="cat" data-id="${esc(cat.id)}"><h2>${esc(tr(cat.name))}</h2>` +
        (cat.image ? `<img class="cat-img" loading="lazy" decoding="async" alt="" src="${esc(cat.image)}">` : '') +
        (d ? `<p class="cat-desc">${esc(d)}</p>` : '') +
        `<ul class="items">${list.map(i => itemHtml(i, cur)).join('')}</ul></section>`;
    }).join('') : `<p class="empty">${esc(t('none'))}</p>`;
    observe();
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
    $('#app').innerHTML = `
      <header class="hero" id="top">
        <div class="hero-bg"></div>
        <button class="lang-btn" type="button" data-lang>${t('other')}</button>
        <div class="hero-inner">
          <div class="logo-card"><img src="${esc(s.logo || 'assets/logo.png')}" alt="${esc(tr(s.name))}" width="450" height="292"></div>
          <h1>${esc(tr(s.name))}</h1>
          ${tr(s.tagline) ? `<p class="tag">${esc(tr(s.tagline))}</p>` : ''}
          ${tr(s.description) ? `<p class="about">${esc(tr(s.description))}</p>` : ''}
          <a class="btn" href="#menu-start" data-go>${t('explore')}</a>
        </div>
      </header>
      <div class="bar" id="menu-start">
        <div class="search"><input id="q" type="search" placeholder="${esc(t('search'))}" aria-label="${esc(t('search'))}" autocomplete="off"><button class="lang-mini" type="button" data-lang>${t('other')}</button></div>
        <nav class="chips" id="chips" aria-label="Categories"></nav>
      </div>
      <main id="menu"></main>
      ${footerHtml(s)}`;
    if (s.cover) $('.hero-bg').style.backgroundImage = 'url("' + String(s.cover).replace(/"/g, '%22') + '")';
    q = '';
    renderMenu();
  }

  document.addEventListener('click', e => {
    if (!D) return;
    if (e.target.closest('[data-lang]')) {
      lang = lang === 'ar' ? 'en' : 'ar';
      try { localStorage.setItem('mada_lang', lang); } catch (_) {}
      return render();
    }
    const go = e.target.closest('[data-go]');
    if (go) { e.preventDefault(); $('#menu-start').scrollIntoView({ behavior: 'smooth' }); return; }
    const ch = e.target.closest('.chip');
    if (ch) {
      const sec = $$('.cat').find(c => c.dataset.id === ch.dataset.cat);
      if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'q') { q = e.target.value.trim().toLowerCase(); renderMenu(); }
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
    fetch('data/menu.json', { cache: 'no-cache' })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(start)
      .catch(() => { $('#app').innerHTML = `<p class="err">${UI.en.err}<br>${UI.ar.err}</p>`; });
  }
})();
