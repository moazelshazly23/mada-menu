(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const E = o => (o && (o.en || o.ar)) || '';
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const TK = 'mada_gh_token', DRAFT = 'mada_draft';
  const DEFAULT_COLORS = { primary: '#781F38', primaryDark: '#521426', cream: '#E8D9C5', beige: '#CBB79E', coffee: '#604537', dark: '#30231F', bg: '#F8F3EC' };
  const COLOR_LABELS = { primary: 'الأساسي (Burgundy)', primaryDark: 'الأساسي الداكن', cream: 'الكريمي', beige: 'البيج الدافئ', coffee: 'بني القهوة', dark: 'القهوة الداكنة', bg: 'خلفية الموقع' };
  const TABS = [['dashboard', 'الرئيسية'], ['items', 'الأصناف'], ['categories', 'الأقسام'], ['settings', 'الإعدادات'], ['preview', 'معاينة'], ['backup', 'النسخ الاحتياطي']];

  const S = { data: null, baseSha: null, dirty: false, tab: 'dashboard', filter: 'all', q: '', uploaded: new Map(), publishing: false };

  /* ---------- helpers ---------- */
  function toast(msg, kind) {
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), kind === 'err' ? 9000 : 4000);
  }
  const getPath = (path, o = S.data) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function setPath(path, val) {
    const ks = path.split('.'); let o = S.data;
    ks.slice(0, -1).forEach(k => { if (typeof o[k] !== 'object' || o[k] === null) o[k] = {}; o = o[k]; });
    o[ks[ks.length - 1]] = val;
  }
  function normalize(d) {
    d.settings = d.settings || {};
    const s = d.settings;
    ['name', 'tagline', 'description', 'currency'].forEach(k => { s[k] = Object.assign({ en: '', ar: '' }, typeof s[k] === 'string' ? { en: s[k] } : s[k]); });
    s.colors = Object.assign({}, DEFAULT_COLORS, s.colors);
    s.contact = Object.assign({ phone: '', whatsapp: '', facebook: '', instagram: '', address: '' }, s.contact);
    s.defaultLang = s.defaultLang === 'ar' ? 'ar' : 'en';
    s.logo = s.logo || 'assets/logo.png'; s.cover = s.cover || '';
    d.categories = (d.categories || []).map(c => Object.assign({ visible: true, image: '' }, c, { name: Object.assign({ en: '', ar: '' }, c.name), desc: Object.assign({ en: '', ar: '' }, c.desc) }));
    d.items = (d.items || []).map(i => Object.assign({ visible: true, image: '' }, i, { name: Object.assign({ en: '', ar: '' }, i.name), desc: Object.assign({ en: '', ar: '' }, i.desc), prices: (i.prices || []).map(p => ({ label: Object.assign({ en: '', ar: '' }, p.label), value: p.value == null || p.value === '' ? null : Number(p.value) })) }));
    return d;
  }
  function markDirty() {
    S.dirty = true;
    try { sessionStorage.setItem(DRAFT, JSON.stringify({ data: S.data, baseSha: S.baseSha })); } catch (_) { /* draft too large: ignore */ }
    updateHeader();
    if (S.tab === 'dashboard') render();
  }
  function updateHeader() {
    $('#dirtyBadge').hidden = !S.dirty;
    $('#publishBtn').disabled = !S.dirty || S.publishing;
  }
  function clearDraft() { try { sessionStorage.removeItem(DRAFT); } catch (_) {} }

  // Resize + compress an image file in the browser (keeps the repo and the site light).
  function resizeImage(file, max, keepPng) {
    return new Promise((resolve, reject) => {
      if (!/^image\//.test(file.type)) return reject(new Error('الملف المختار ليس صورة'));
      const r = new FileReader();
      r.onerror = () => reject(new Error('تعذّرت قراءة الملف'));
      r.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('تعذّر فتح الصورة'));
        img.onload = () => {
          const k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          const g = c.getContext('2d');
          const png = keepPng && file.type === 'image/png';
          if (!png) { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
          g.drawImage(img, 0, 0, c.width, c.height);
          resolve(png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.82));
        };
        img.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }

  /* ---------- login ---------- */
  function guessRepo() {
    let o = '', r = '';
    try { const saved = JSON.parse(localStorage.getItem('mada_repo') || 'null'); if (saved) { o = saved.owner; r = saved.repo; } } catch (_) {}
    if (location.hostname.endsWith('.github.io')) {
      o = location.hostname.split('.')[0];
      const seg = location.pathname.split('/')[1];
      r = seg && !/\.html?$/.test(seg) ? seg : location.hostname;
    }
    $('#owner').value = o; $('#repo').value = r;
  }
  function loginError(m) { const e = $('#loginErr'); e.textContent = m; e.hidden = !m; }

  async function login(auto) {
    const owner = $('#owner').value.trim(), repo = $('#repo').value.trim();
    const token = auto ? sessionStorage.getItem(TK) : $('#token').value.trim();
    if (!owner || !repo || !token) return;
    loginError(''); $('#loginBtn').disabled = true; $('#loginBtn').textContent = 'جارٍ التحقق…';
    try {
      GH.init(owner, repo, token);
      const info = await GH.repoInfo();
      if (info.permissions && info.permissions.push === false) throw new GH.GHError(403, 'هذا التوكن للقراءة فقط. أنشئ توكن بصلاحية Contents: Read and write.');
      const f = await GH.getFile(GH.path);
      S.data = normalize(JSON.parse(f.text)); S.baseSha = f.sha;
      sessionStorage.setItem(TK, token);
      try { localStorage.setItem('mada_repo', JSON.stringify({ owner, repo })); } catch (_) {}
      $('#token').value = '';
      restoreDraft();
      $('#login').hidden = true; $('#app').hidden = false;
      render();
    } catch (e) {
      sessionStorage.removeItem(TK);
      loginError(e instanceof SyntaxError ? 'ملف data/menu.json غير صالح (JSON تالف).' : e.message);
    } finally { $('#loginBtn').disabled = false; $('#loginBtn').textContent = 'تسجيل الدخول'; }
  }
  function restoreDraft() {
    try {
      const d = JSON.parse(sessionStorage.getItem(DRAFT) || 'null');
      if (d && d.data && d.baseSha === S.baseSha && confirm('وُجدت تعديلات غير منشورة من جلسة سابقة. هل تريد استعادتها؟')) { S.data = normalize(d.data); S.dirty = true; }
      else clearDraft();
    } catch (_) { clearDraft(); }
  }
  function logout() {
    if (S.dirty && !confirm('لديك تعديلات غير منشورة ستضيع. تسجيل الخروج؟')) return;
    S.dirty = false; sessionStorage.removeItem(TK); clearDraft(); location.reload();
  }

  /* ---------- views ---------- */
  function render() {
    $('#tabs').innerHTML = TABS.map(([k, l]) => `<button class="tab ${S.tab === k ? 'on' : ''}" data-act="tab" data-id="${k}">${l}</button>`).join('');
    const v = { dashboard: viewDashboard, items: viewItems, categories: viewCategories, settings: viewSettings, preview: viewPreview, backup: viewBackup }[S.tab];
    $('#view').innerHTML = v();
    updateHeader();
  }

  function viewDashboard() {
    const it = S.data.items, vis = it.filter(i => i.visible !== false).length, u = S.data.settings.updatedAt;
    return `<h2 class="vt">لمحة عامة</h2>
      <div class="cards">
        <div class="stat"><b>${it.length}</b><span>إجمالي الأصناف</span></div>
        <div class="stat"><b>${S.data.categories.length}</b><span>الأقسام</span></div>
        <div class="stat"><b>${vis}</b><span>أصناف ظاهرة</span></div>
        <div class="stat"><b>${it.length - vis}</b><span>أصناف مخفية</span></div>
        <div class="stat"><b style="font-size:1.05rem">${u ? esc(new Date(u).toLocaleString('ar-EG')) : '—'}</b><span>آخر تحديث للمنيو</span></div>
      </div>
      <div class="msg ${S.dirty ? 'info' : 'ok'}">${S.dirty ? 'لديك تعديلات لم تُنشر بعد. راجعها في «معاينة» ثم اضغط «نشر التعديلات».' : 'كل شيء منشور ومتزامن مع GitHub.'}</div>
      <div class="panel" style="margin-top:1rem"><h3>خطوات سريعة</h3>
        <p class="muted">1) عدّل من «الأصناف» أو «الأقسام» أو «الإعدادات». 2) راجع التغيير في «معاينة». 3) اضغط «نشر التعديلات» في الأعلى. يظهر التحديث على الموقع خلال دقيقة إلى دقيقتين.</p></div>`;
  }

  const priceSummary = i => i.prices.filter(p => p.value != null && p.value > 0).map(p => (E(p.label) ? E(p.label) + ': ' : '') + p.value).join(' · ') || 'بدون سعر';
  const catName = id => E((S.data.categories.find(c => c.id === id) || {}).name) || '—';
  const sw = (act, id, on) => `<label class="sw" title="إظهار/إخفاء"><input type="checkbox" data-act="${act}" data-id="${esc(id)}" ${on ? 'checked' : ''}><i></i></label>`;

  function itemListHtml() {
    const q = S.q.toLowerCase();
    let list = S.data.items.filter(i => (S.filter === 'all' || i.category === S.filter) &&
      (!q || (i.name.en + ' ' + i.name.ar + ' ' + i.desc.en + ' ' + i.desc.ar).toLowerCase().includes(q)));
    const order = id => S.data.categories.findIndex(c => c.id === id);
    list = list.map((x, n) => [x, n]).sort((a, b) => order(a[0].category) - order(b[0].category) || a[1] - b[1]).map(x => x[0]);
    if (!list.length) return '<p class="empty">لا توجد أصناف. اضغط «إضافة صنف» للبدء.</p>';
    return `<div class="list">` + list.map(i => `
      <div class="li ${i.visible === false ? 'hid' : ''}" draggable="true" data-drag="item" data-id="${esc(i.id)}">
        <span class="grip" title="اسحب للترتيب">⋮⋮</span>
        ${i.image ? `<img class="thumb" loading="lazy" alt="" src="${esc(i.image)}">` : ''}
        <div class="grow"><b dir="auto">${esc(E(i.name))}</b><small dir="auto">${esc(i.name.ar && i.name.en ? i.name.ar + ' — ' : '')}${esc(catName(i.category))} — ${esc(priceSummary(i))}</small></div>
        ${sw('toggle-item', i.id, i.visible !== false)}
        <div class="acts">
          <button class="btn sm" data-act="up-item" data-id="${esc(i.id)}" title="للأعلى">▲</button>
          <button class="btn sm" data-act="down-item" data-id="${esc(i.id)}" title="للأسفل">▼</button>
          <button class="btn sm" data-act="edit-item" data-id="${esc(i.id)}">تعديل</button>
          <button class="btn sm" data-act="dup-item" data-id="${esc(i.id)}">نسخ</button>
          <button class="btn sm danger" data-act="del-item" data-id="${esc(i.id)}">حذف</button>
        </div>
      </div>`).join('') + `</div>`;
  }
  function viewItems() {
    return `<h2 class="vt">الأصناف</h2>
      <div class="toolbar">
        <select id="itemFilter"><option value="all">كل الأقسام</option>${S.data.categories.map(c => `<option value="${esc(c.id)}" ${S.filter === c.id ? 'selected' : ''}>${esc(E(c.name))}</option>`).join('')}</select>
        <input id="itemQ" type="search" placeholder="بحث بالاسم…" value="${esc(S.q)}">
        <button class="btn primary" data-act="add-item">+ إضافة صنف</button>
      </div><div id="itemList">${itemListHtml()}</div>`;
  }

  function viewCategories() {
    const cnt = id => S.data.items.filter(i => i.category === id).length;
    return `<h2 class="vt">الأقسام</h2>
      <div class="toolbar"><button class="btn primary" data-act="add-cat">+ إضافة قسم</button><span class="muted">اسحب القسم (⋮⋮) أو استخدم الأسهم لتغيير الترتيب.</span></div>
      <div class="list">${S.data.categories.map(c => `
        <div class="li ${c.visible === false ? 'hid' : ''}" draggable="true" data-drag="cat" data-id="${esc(c.id)}">
          <span class="grip">⋮⋮</span>
          ${c.image ? `<img class="thumb" loading="lazy" alt="" src="${esc(c.image)}">` : ''}
          <div class="grow"><b dir="auto">${esc(E(c.name))}</b><small dir="auto">${esc(c.name.ar && c.name.en ? c.name.ar + ' — ' : '')}${cnt(c.id)} صنف</small></div>
          ${sw('toggle-cat', c.id, c.visible !== false)}
          <div class="acts">
            <button class="btn sm" data-act="up-cat" data-id="${esc(c.id)}">▲</button>
            <button class="btn sm" data-act="down-cat" data-id="${esc(c.id)}">▼</button>
            <button class="btn sm" data-act="edit-cat" data-id="${esc(c.id)}">تعديل</button>
            <button class="btn sm danger" data-act="del-cat" data-id="${esc(c.id)}">حذف</button>
          </div>
        </div>`).join('')}</div>`;
  }

  function viewSettings() {
    const f = (label, path, type, ph) => `<label class="fld"><span>${label}</span><input type="${type || 'text'}" data-path="${path}" value="${esc(getPath(path) ?? '')}" placeholder="${esc(ph || '')}" ${/phone|whatsapp|facebook|instagram|currency/.test(path) && !/currency\.ar/.test(path) ? 'dir="ltr"' : ''}></label>`;
    const s = S.data.settings;
    const img = (label, path, logo) => `<div class="fld"><span>${label}</span><div class="imgbox">${getPath(path) ? `<img class="${logo ? 'logo' : ''}" alt="" src="${esc(getPath(path))}">` : '<span class="muted">لا توجد صورة</span>'}
      <input type="file" accept="image/*" data-img="${path}" data-max="${logo ? 700 : 1600}" ${logo ? 'data-png="1"' : ''} style="max-width:260px">
      ${getPath(path) && !(logo && path === 'settings.logo' && false) ? `<button class="btn sm" data-act="clear-img" data-id="${path}">إزالة</button>` : ''}</div></div>`;
    return `<h2 class="vt">إعدادات الكافيه</h2>
      <div class="panel"><h3>الهوية</h3><div class="grid2">
        ${f('اسم الكافيه (English)', 'settings.name.en')}${f('اسم الكافيه (العربية)', 'settings.name.ar')}
        ${f('العبارة الترحيبية (English)', 'settings.tagline.en')}${f('العبارة الترحيبية (العربية)', 'settings.tagline.ar')}
        ${f('وصف الكافيه (English)', 'settings.description.en')}${f('وصف الكافيه (العربية)', 'settings.description.ar')}
      </div>${img('الشعار', 'settings.logo', true)}${img('صورة الغلاف (اختيارية)', 'settings.cover')}</div>
      <div class="panel"><h3>العملة واللغة</h3><div class="grid2">
        ${f('العملة (English)', 'settings.currency.en', 'text', 'EGP')}${f('العملة (العربية)', 'settings.currency.ar', 'text', 'ج.م')}
        <label class="fld"><span>اللغة الافتراضية</span><select data-path="settings.defaultLang"><option value="en" ${s.defaultLang === 'en' ? 'selected' : ''}>English</option><option value="ar" ${s.defaultLang === 'ar' ? 'selected' : ''}>العربية</option></select></label>
        <label class="fld"><span>الأقسام الفارغة</span><label style="display:flex;gap:.5rem;align-items:center"><input type="checkbox" data-path="settings.showEmptyCategories" ${s.showEmptyCategories ? 'checked' : ''}> إظهار الأقسام التي لا تحتوي على أصناف ظاهرة</label></label>
      </div></div>
      <div class="panel"><h3>الألوان</h3><div class="grid3">${Object.keys(DEFAULT_COLORS).map(k => `<label class="fld"><span>${COLOR_LABELS[k]}</span><input type="color" data-path="settings.colors.${k}" value="${esc(s.colors[k])}"></label>`).join('')}</div>
        <button class="btn sm" style="margin-top:.7rem" data-act="reset-colors">استعادة ألوان MADA الأصلية</button></div>
      <div class="panel"><h3>التواصل</h3><div class="grid2">
        ${f('رقم الهاتف', 'settings.contact.phone', 'text', '+20…')}${f('رقم WhatsApp (بصيغة دولية)', 'settings.contact.whatsapp', 'text', '20100…')}
        ${f('رابط Facebook', 'settings.contact.facebook', 'text', 'facebook.com/…')}${f('رابط Instagram', 'settings.contact.instagram', 'text', 'instagram.com/…')}
        ${f('العنوان', 'settings.contact.address')}
      </div></div>
      <p class="muted">التغييرات تُحفظ كمسودة فوراً، ولا تظهر للعملاء إلا بعد «نشر التعديلات».</p>`;
  }

  function viewPreview() {
    return `<h2 class="vt">معاينة قبل النشر</h2><p class="muted" style="margin-bottom:.6rem">هذه هي نسخة المنيو بما فيها تعديلاتك الحالية.</p><iframe id="pv" class="preview-frame" src="index.html?preview=1" title="Preview"></iframe>`;
  }

  function viewBackup() {
    return `<h2 class="vt">النسخ الاحتياطي</h2>
      <div class="panel"><h3>تصدير</h3><p class="muted" style="margin-bottom:.6rem">تنزيل نسخة JSON من بيانات المنيو الحالية (بما فيها المسودة).</p><button class="btn primary" data-act="export">تصدير نسخة احتياطية</button></div>
      <div class="panel"><h3>استيراد</h3><p class="muted" style="margin-bottom:.6rem">استعادة نسخة سابقة. تُحمَّل كمسودة ولا تُنشر إلا بعد الضغط على «نشر التعديلات».</p><input type="file" accept="application/json,.json" id="importFile"></div>
      <div class="panel"><h3>إلغاء المسودة</h3><p class="muted" style="margin-bottom:.6rem">تجاهل كل التعديلات غير المنشورة وإعادة تحميل المنيو المنشور من GitHub.</p><button class="btn danger" data-act="discard">إلغاء التعديلات وإعادة التحميل</button></div>`;
  }

  /* ---------- modal ---------- */
  function openModal(html, onSave) {
    $('#modalRoot').innerHTML = `<div class="overlay" data-act="overlay"><div class="modal" role="dialog" aria-modal="true">${html}<div class="mfoot"><button class="btn" data-act="modal-close">إلغاء</button><button class="btn primary" data-act="modal-save">حفظ</button></div></div></div>`;
    S.onSave = onSave;
    const f = $('#modalRoot input[type=text],#modalRoot input:not([type])'); if (f) f.focus();
  }
  function closeModal() { $('#modalRoot').innerHTML = ''; S.onSave = null; }
  function imgField(current) {
    return `<div class="fld"><span>صورة (اختيارية)</span><div class="imgbox"><img id="mImg" alt="" src="${esc(current || '')}" ${current ? '' : 'hidden'}><input type="file" id="mFile" accept="image/*" style="max-width:240px"><button type="button" class="btn sm" data-act="modal-rmimg">إزالة الصورة</button></div></div>`;
  }
  let mImgVal = '';
  async function bindModalImage(initial, max) {
    mImgVal = initial || '';
    $('#mFile').addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      try { mImgVal = await resizeImage(file, max, false); $('#mImg').src = mImgVal; $('#mImg').hidden = false; } catch (err) { toast(err.message, 'err'); }
    });
  }
  const priceRow = p => `<div class="prow"><input class="pl-en" placeholder="الخيار (English) مثل Single" value="${esc(p.label.en)}" dir="ltr"><input class="pl-ar" placeholder="الخيار (العربية)" value="${esc(p.label.ar)}"><input class="pv" type="number" min="0" step="any" placeholder="السعر" value="${p.value == null ? '' : p.value}" dir="ltr"><button type="button" class="btn sm danger" data-act="rm-price">✕</button></div>`;

  function itemModal(it, isNew, afterId) {
    if (!S.data.categories.length) return toast('أضف قسماً أولاً.', 'err');
    const cats = S.data.categories.map(c => `<option value="${esc(c.id)}" ${c.id === it.category ? 'selected' : ''}>${esc(E(c.name))}</option>`).join('');
    openModal(`<h3>${isNew ? 'إضافة صنف' : 'تعديل صنف'}</h3>
      <div class="grid2"><label class="fld"><span>الاسم (English)</span><input id="mNameEn" value="${esc(it.name.en)}" dir="ltr"></label><label class="fld"><span>الاسم (العربية)</span><input id="mNameAr" value="${esc(it.name.ar)}"></label></div>
      <label class="fld"><span>القسم</span><select id="mCat">${cats}</select></label>
      <div class="grid2"><label class="fld"><span>الوصف (English)</span><textarea id="mDescEn" dir="ltr">${esc(it.desc.en)}</textarea></label><label class="fld"><span>الوصف (العربية)</span><textarea id="mDescAr">${esc(it.desc.ar)}</textarea></label></div>
      <div class="fld"><span>الأسعار (سعر واحد، أو أكثر مع اسم لكل خيار مثل Single / Double). اترك السعر فارغاً إذا كان الخيار غير متاح.</span><div id="mPrices">${(it.prices.length ? it.prices : [{ label: { en: '', ar: '' }, value: null }]).map(priceRow).join('')}</div><button type="button" class="btn sm" data-act="add-price">+ إضافة خيار سعر</button></div>
      ${imgField(it.image)}
      <label style="display:flex;gap:.5rem;align-items:center"><input type="checkbox" id="mVis" ${it.visible !== false ? 'checked' : ''}> ظاهر للعملاء</label>`,
      () => {
        const en = $('#mNameEn').value.trim(), ar = $('#mNameAr').value.trim();
        if (!en && !ar) { toast('اكتب اسم الصنف.', 'err'); return false; }
        const prices = $$('.prow').map(r => {
          const raw = $('.pv', r).value.trim(), n = Number(raw);
          return { label: { en: $('.pl-en', r).value.trim(), ar: $('.pl-ar', r).value.trim() }, value: raw === '' || !isFinite(n) || n <= 0 ? null : n };
        });
        const o = { id: it.id, category: $('#mCat').value, name: { en, ar }, desc: { en: $('#mDescEn').value.trim(), ar: $('#mDescAr').value.trim() }, image: mImgVal, visible: $('#mVis').checked, prices };
        const arr = S.data.items, idx = arr.findIndex(x => x.id === it.id);
        if (idx >= 0) arr[idx] = o;
        else {
          let pos = afterId ? arr.findIndex(x => x.id === afterId) : -1;
          if (pos < 0) { for (let k = arr.length - 1; k >= 0; k--) if (arr[k].category === o.category) { pos = k; break; } }
          arr.splice(pos < 0 ? arr.length : pos + 1, 0, o);
        }
        markDirty(); render(); return true;
      });
    bindModalImage(it.image, 800);
  }

  function catModal(c, isNew) {
    openModal(`<h3>${isNew ? 'إضافة قسم' : 'تعديل قسم'}</h3>
      <div class="grid2"><label class="fld"><span>الاسم (English)</span><input id="mNameEn" value="${esc(c.name.en)}" dir="ltr"></label><label class="fld"><span>الاسم (العربية)</span><input id="mNameAr" value="${esc(c.name.ar)}"></label></div>
      <div class="grid2"><label class="fld"><span>وصف القسم (English)</span><textarea id="mDescEn" dir="ltr">${esc(c.desc.en)}</textarea></label><label class="fld"><span>وصف القسم (العربية)</span><textarea id="mDescAr">${esc(c.desc.ar)}</textarea></label></div>
      ${imgField(c.image)}
      <label style="display:flex;gap:.5rem;align-items:center"><input type="checkbox" id="mVis" ${c.visible !== false ? 'checked' : ''}> ظاهر للعملاء</label>`,
      () => {
        const en = $('#mNameEn').value.trim(), ar = $('#mNameAr').value.trim();
        if (!en && !ar) { toast('اكتب اسم القسم.', 'err'); return false; }
        const o = { id: c.id, name: { en, ar }, desc: { en: $('#mDescEn').value.trim(), ar: $('#mDescAr').value.trim() }, image: mImgVal, visible: $('#mVis').checked };
        const idx = S.data.categories.findIndex(x => x.id === c.id);
        if (idx >= 0) S.data.categories[idx] = o; else S.data.categories.push(o);
        markDirty(); render(); return true;
      });
    bindModalImage(c.image, 800);
  }

  /* ---------- ordering ---------- */
  function moveCat(id, dir) {
    const a = S.data.categories, i = a.findIndex(c => c.id === id), j = i + dir;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]]; markDirty(); render();
  }
  function moveItem(id, dir) {
    const a = S.data.items, i = a.findIndex(x => x.id === id);
    let j = i + dir;
    while (j >= 0 && j < a.length && a[j].category !== a[i].category) j += dir;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]]; markDirty(); render();
  }
  function dropOn(kind, from, to) {
    if (from === to) return;
    const a = kind === 'cat' ? S.data.categories : S.data.items;
    const i = a.findIndex(x => x.id === from), j = a.findIndex(x => x.id === to);
    if (i < 0 || j < 0) return;
    if (kind === 'item' && a[i].category !== a[j].category) return toast('الترتيب بالسحب داخل نفس القسم فقط.', 'err');
    const [x] = a.splice(i, 1); a.splice(j, 0, x); markDirty(); render();
  }

  /* ---------- publish ---------- */
  async function publish() {
    if (S.publishing || !S.dirty) return;
    S.publishing = true; updateHeader();
    const btn = $('#publishBtn'); btn.textContent = 'جارٍ النشر…';
    try {
      const d = JSON.parse(JSON.stringify(S.data));
      // 1) upload new images first (reuses already-uploaded ones if a previous attempt failed halfway)
      const targets = [];
      if (/^data:/.test(d.settings.logo)) targets.push([d.settings, 'logo']);
      if (/^data:/.test(d.settings.cover)) targets.push([d.settings, 'cover']);
      d.categories.forEach(c => { if (/^data:/.test(c.image)) targets.push([c, 'image']); });
      d.items.forEach(i => { if (/^data:/.test(i.image)) targets.push([i, 'image']); });
      for (const [obj, key] of targets) {
        const url = obj[key];
        if (!S.uploaded.has(url)) {
          const ext = /^data:image\/png/.test(url) ? 'png' : 'jpg';
          const path = 'assets/images/' + uid('img-') + '.' + ext;
          const r = await GH.putFile(path, url.split(',')[1], null, 'Add image via admin');
          if (!r || !r.content || !r.content.sha) throw new Error('لم يؤكد GitHub رفع الصورة.');
          S.uploaded.set(url, path);
        }
        obj[key] = S.uploaded.get(url);
      }
      // 2) conflict check against the latest remote version
      d.settings.updatedAt = new Date().toISOString();
      const latest = await GH.getFile(GH.path);
      if (latest.sha !== S.baseSha && !confirm('تم تعديل المنيو على GitHub من مكان آخر بعد تسجيل دخولك.\nهل تريد استبدال تلك النسخة بتعديلاتك الحالية؟')) {
        throw new Error('أُلغي النشر لتجنّب الكتابة فوق تعديلات أخرى. يمكنك تصدير نسخة احتياطية ثم إعادة التحميل من «النسخ الاحتياطي».');
      }
      // 3) write menu.json with the correct SHA
      const res = await GH.putFile(GH.path, GH.textToB64(JSON.stringify(d, null, 2) + '\n'), latest.sha, 'Update menu via admin panel');
      if (!res || !res.content || !res.content.sha || !res.commit) throw new Error('لم يؤكد GitHub حفظ الملف. لم يتم اعتبار النشر ناجحاً.');
      S.data = normalize(d); S.baseSha = res.content.sha; S.dirty = false; S.uploaded.clear(); clearDraft();
      toast('✓ تم الحفظ على GitHub. سيظهر التحديث على الموقع خلال دقيقة إلى دقيقتين.', 'ok');
    } catch (e) {
      toast('تعذّر النشر: ' + e.message + ' — تعديلاتك ما زالت محفوظة هنا، حاول مرة أخرى.', 'err');
    } finally {
      S.publishing = false; btn.textContent = 'نشر التعديلات'; updateHeader(); render();
    }
  }

  /* ---------- events ---------- */
  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const act = el.dataset.act, id = el.dataset.id;
    if (act === 'overlay') { if (e.target === el) closeModal(); return; }
    if (el.tagName === 'INPUT' && el.type === 'checkbox') return; // handled on change
    const blank = () => ({ name: { en: '', ar: '' }, desc: { en: '', ar: '' }, image: '', visible: true });
    switch (act) {
      case 'tab': S.tab = id; render(); break;
      case 'logout': logout(); break;
      case 'publish': publish(); break;
      case 'modal-close': closeModal(); break;
      case 'modal-save': if (S.onSave && S.onSave() !== false) closeModal(); break;
      case 'modal-rmimg': mImgVal = ''; $('#mImg').hidden = true; $('#mFile').value = ''; break;
      case 'add-price': $('#mPrices').insertAdjacentHTML('beforeend', priceRow({ label: { en: '', ar: '' }, value: null })); break;
      case 'rm-price': el.closest('.prow').remove(); break;
      case 'add-item': itemModal(Object.assign(blank(), { id: uid('i-'), category: S.filter !== 'all' ? S.filter : (S.data.categories[0] || {}).id, prices: [] }), true); break;
      case 'edit-item': itemModal(JSON.parse(JSON.stringify(S.data.items.find(x => x.id === id))), false); break;
      case 'dup-item': {
        const c = JSON.parse(JSON.stringify(S.data.items.find(x => x.id === id)));
        c.id = uid('i-'); c.name.en = c.name.en ? c.name.en + ' (Copy)' : ''; c.name.ar = c.name.ar ? c.name.ar + ' (نسخة)' : '';
        itemModal(c, true, id); break;
      }
      case 'del-item': { const it = S.data.items.find(x => x.id === id); if (confirm('حذف «' + E(it.name) + '» نهائياً؟')) { S.data.items = S.data.items.filter(x => x.id !== id); markDirty(); render(); } break; }
      case 'up-item': moveItem(id, -1); break;
      case 'down-item': moveItem(id, 1); break;
      case 'add-cat': catModal(Object.assign(blank(), { id: uid('c-') }), true); break;
      case 'edit-cat': catModal(JSON.parse(JSON.stringify(S.data.categories.find(x => x.id === id))), false); break;
      case 'del-cat': {
        const n = S.data.items.filter(x => x.category === id).length;
        if (n) return alert('لا يمكن حذف قسم يحتوي على ' + n + ' صنف. انقل الأصناف إلى قسم آخر أو احذفها أولاً.');
        if (confirm('حذف هذا القسم؟')) { S.data.categories = S.data.categories.filter(x => x.id !== id); markDirty(); render(); }
        break;
      }
      case 'up-cat': moveCat(id, -1); break;
      case 'down-cat': moveCat(id, 1); break;
      case 'reset-colors': S.data.settings.colors = Object.assign({}, DEFAULT_COLORS); markDirty(); render(); break;
      case 'clear-img': setPath(id, ''); markDirty(); render(); break;
      case 'export': {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(S.data, null, 2)], { type: 'application/json' }));
        a.download = 'mada-menu-backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); URL.revokeObjectURL(a.href); break;
      }
      case 'discard': {
        if (!confirm('سيتم حذف كل التعديلات غير المنشورة. متابعة؟')) break;
        try { const f = await GH.getFile(GH.path); S.data = normalize(JSON.parse(f.text)); S.baseSha = f.sha; S.dirty = false; S.uploaded.clear(); clearDraft(); render(); toast('تمت إعادة التحميل من GitHub.', 'ok'); }
        catch (err) { toast(err.message, 'err'); }
        break;
      }
    }
  });

  document.addEventListener('change', async e => {
    const t = e.target;
    if (t.dataset.act === 'toggle-item') { S.data.items.find(x => x.id === t.dataset.id).visible = t.checked; markDirty(); render(); return; }
    if (t.dataset.act === 'toggle-cat') { S.data.categories.find(x => x.id === t.dataset.id).visible = t.checked; markDirty(); render(); return; }
    if (t.dataset.path) { setPath(t.dataset.path, t.type === 'checkbox' ? t.checked : t.value); markDirty(); return; }
    if (t.dataset.img && t.files[0]) {
      try { setPath(t.dataset.img, await resizeImage(t.files[0], Number(t.dataset.max) || 1200, !!t.dataset.png)); markDirty(); render(); }
      catch (err) { toast(err.message, 'err'); }
      return;
    }
    if (t.id === 'itemFilter') { S.filter = t.value; $('#itemList').innerHTML = itemListHtml(); return; }
    if (t.id === 'importFile' && t.files[0]) {
      try {
        const d = JSON.parse(await t.files[0].text());
        if (!d || !Array.isArray(d.categories) || !Array.isArray(d.items) || typeof d.settings !== 'object') throw new Error('الملف ليس نسخة احتياطية صالحة للمنيو.');
        if (!confirm('سيتم استبدال المسودة الحالية بالنسخة المستوردة (' + d.items.length + ' صنف). متابعة؟')) { t.value = ''; return; }
        S.data = normalize(d); markDirty(); S.tab = 'dashboard'; render(); toast('تم استيراد النسخة كمسودة. راجعها ثم انشرها.', 'ok');
      } catch (err) { toast(err instanceof SyntaxError ? 'ملف JSON غير صالح.' : err.message, 'err'); }
    }
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'itemQ') { S.q = e.target.value.trim(); $('#itemList').innerHTML = itemListHtml(); }
  });

  // drag & drop ordering (desktop); arrow buttons cover touch screens
  let dragId = null;
  document.addEventListener('dragstart', e => { const r = e.target.closest && e.target.closest('[data-drag]'); if (r) { dragId = r.dataset.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); } });
  document.addEventListener('dragover', e => { const r = e.target.closest && e.target.closest('[data-drag]'); if (dragId && r) { e.preventDefault(); r.classList.add('over'); } });
  document.addEventListener('dragleave', e => { const r = e.target.closest && e.target.closest('[data-drag]'); if (r) r.classList.remove('over'); });
  document.addEventListener('drop', e => { const r = e.target.closest && e.target.closest('[data-drag]'); if (dragId && r) { e.preventDefault(); dropOn(r.dataset.drag, dragId, r.dataset.id); } dragId = null; });
  document.addEventListener('dragend', () => { dragId = null; $$('.over').forEach(x => x.classList.remove('over')); });

  window.addEventListener('message', e => {
    if (e.origin === location.origin && e.data && e.data.type === 'mada-preview-ready') {
      const f = $('#pv'); if (f && f.contentWindow) f.contentWindow.postMessage({ type: 'mada-preview', data: S.data }, location.origin);
    }
  });
  window.addEventListener('beforeunload', e => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#modalRoot').firstChild) closeModal(); });

  $('#loginForm').addEventListener('submit', e => { e.preventDefault(); login(false); });
  guessRepo();
  if (sessionStorage.getItem(TK) && $('#owner').value && $('#repo').value) login(true);
})();
