/* GitHub REST (Contents API) client used by the admin panel.
   The token lives only in memory + sessionStorage (set by admin.js). It is never written to any file. */
(function (global) {
  'use strict';

  class GHError extends Error {
    constructor(status, message, raw) { super(message); this.status = status; this.raw = raw || ''; }
  }

  const MESSAGES = {
    401: 'التوكن غير صحيح أو منتهي الصلاحية. أنشئ توكن جديداً وسجّل الدخول مرة أخرى.',
    403: 'لا توجد صلاحية كافية، أو تم تجاوز حدّ الطلبات. تأكد أن التوكن يملك Contents: Read and write لهذا المستودع.',
    404: 'المستودع أو الملف غير موجود، أو أن التوكن لا يملك صلاحية الوصول لهذا المستودع.',
    409: 'تعارض: تم تعديل الملف على GitHub أثناء عملك. أعد المحاولة.',
    422: 'رفض GitHub العملية (غالباً بسبب تعارض في نسخة الملف). أعد المحاولة.'
  };

  const bytesToB64 = bytes => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const textToB64 = text => bytesToB64(new TextEncoder().encode(text));
  const b64ToText = b64 => {
    const bin = atob(b64.replace(/\s/g, ''));
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  };

  const GH = {
    owner: '', repo: '', branch: '', token: '', path: 'data/menu.json',
    GHError, textToB64,
    init(owner, repo, token) { this.owner = owner; this.repo = repo; this.token = token; this.branch = ''; },

    async request(method, endpoint, body) {
      let res;
      try {
        res = await fetch('https://api.github.com' + endpoint, {
          method, cache: 'no-store',
          headers: Object.assign({
            Accept: 'application/vnd.github+json',
            Authorization: 'Bearer ' + this.token,
            'X-GitHub-Api-Version': '2022-11-28'
          }, body ? { 'Content-Type': 'application/json' } : {}),
          body: body ? JSON.stringify(body) : undefined
        });
      } catch (e) {
        throw new GHError(0, 'تعذّر الاتصال بـ GitHub. تحقق من الإنترنت ثم أعد المحاولة. لم يتم فقد أي تعديلات.');
      }
      if (res.ok) return res.status === 204 ? null : res.json();
      let raw = ''; try { raw = (await res.json()).message || ''; } catch (_) {}
      throw new GHError(res.status, (MESSAGES[res.status] || 'خطأ من GitHub (' + res.status + ')') + (raw ? ' — ' + raw : ''), raw);
    },

    repoUrl() { return '/repos/' + encodeURIComponent(this.owner) + '/' + encodeURIComponent(this.repo); },
    filePath(p) { return p.split('/').map(encodeURIComponent).join('/'); },

    async repoInfo() {
      const info = await this.request('GET', this.repoUrl());
      this.branch = info.default_branch;
      return info;
    },

    async getFile(path) {
      const f = await this.request('GET', this.repoUrl() + '/contents/' + this.filePath(path || this.path) + '?ref=' + encodeURIComponent(this.branch));
      if (!f || !f.sha || typeof f.content !== 'string') throw new GHError(500, 'استجابة غير متوقعة من GitHub للملف ' + (path || this.path));
      return { sha: f.sha, text: b64ToText(f.content) };
    },

    // Create or update a file. `sha` is required when updating. Returns GitHub's response (content.sha + commit).
    async putFile(path, base64Content, sha, message) {
      const body = { message, content: base64Content, branch: this.branch };
      if (sha) body.sha = sha;
      return this.request('PUT', this.repoUrl() + '/contents/' + this.filePath(path), body);
    }
  };

  global.GH = GH;
})(window);
