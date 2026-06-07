registerTool({
  id:    'generators',
  title: 'Generators',
  route: '/generators',

  render(container) {
    App.addStyle('generators-styles', `
      .gen-body { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:20px; }
      .gen-section { background:var(--c-surface); border:1px solid var(--c-border); border-radius:var(--radius-lg); overflow:hidden; }
      .gen-section-header {
        padding:10px 16px; background:var(--c-surface-2); border-bottom:1px solid var(--c-border);
        font-size:13px; font-weight:600; color:var(--c-text-bright);
        display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;
      }
      .gen-section-controls { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
      .gen-section-body { padding:12px 16px; }
      .uuid-list { display:flex; flex-direction:column; gap:4px; max-height:320px; overflow-y:auto; }
      .uuid-item { display:flex; align-items:center; gap:8px; padding:4px 0; }
      .uuid-val { font-family:var(--font-code); font-size:13px; color:var(--c-text-bright); flex:1; word-break:break-all; }
      .hash-results { display:flex; flex-direction:column; gap:0; }
      .hash-row {
        display:flex; align-items:center; gap:10px; padding:9px 0;
        border-bottom:1px solid var(--c-border);
      }
      .hash-row:last-child { border-bottom:none; }
      .hash-algo {
        font-family:var(--font-code); font-size:11px; font-weight:700;
        color:var(--c-accent); width:68px; flex-shrink:0;
      }
      .hash-val { font-family:var(--font-code); font-size:12px; color:var(--c-text-bright); flex:1; word-break:break-all; }
      .hash-val.pending { color:var(--c-text-dim); font-style:italic; }
      .gen-count { width:64px; padding:4px 8px; background:var(--c-surface-3); border:1px solid var(--c-border-2); border-radius:var(--radius); color:var(--c-text); font-size:13px; text-align:center; }
      .gen-count:focus { outline:2px solid var(--c-accent); outline-offset:1px; }
    `);

    container.innerHTML = `
      <div class="tool">
        <div class="tool-topbar">
          <h1 class="tool-title">Generators</h1>
          <div class="notif-area" id="gen-notif"></div>
        </div>
        <div class="gen-body">

          <!-- UUID section -->
          <div class="gen-section">
            <div class="gen-section-header">
              UUID v4
              <div class="gen-section-controls">
                <label class="label-inline" for="uuid-count">Count</label>
                <input class="gen-count" type="number" id="uuid-count" value="5" min="1" max="100">
                <button class="btn btn--primary" id="uuid-gen">Generate</button>
                <button class="btn" id="uuid-copy-all" disabled>Copy all</button>
                <button class="btn btn--sm" id="uuid-clear">Clear</button>
              </div>
            </div>
            <div class="gen-section-body">
              <div class="uuid-list" id="uuid-list">
                <span style="color:var(--c-text-dim);font-size:13px;font-style:italic;">
                  Click Generate to create UUIDs.
                </span>
              </div>
            </div>
          </div>

          <!-- Hash section -->
          <div class="gen-section">
            <div class="gen-section-header">
              Hash
              <div class="gen-section-controls">
                <button class="btn btn--primary" id="hash-compute">Compute</button>
              </div>
            </div>
            <div class="gen-section-body" style="display:flex;flex-direction:column;gap:12px;">
              <textarea class="code-editor" id="hash-input" rows="4" style="flex:none;resize:vertical;min-height:72px;"
                placeholder="Paste text to hash…"
                spellcheck="false" autocomplete="off"></textarea>
              <div class="hash-results" id="hash-results">
                <div class="hash-row"><span class="hash-algo">MD5</span>    <span class="hash-val pending" id="h-md5">—</span>    <button class="btn btn--sm" data-hash="h-md5">Copy</button></div>
                <div class="hash-row"><span class="hash-algo">SHA-1</span>  <span class="hash-val pending" id="h-sha1">—</span>   <button class="btn btn--sm" data-hash="h-sha1">Copy</button></div>
                <div class="hash-row"><span class="hash-algo">SHA-256</span><span class="hash-val pending" id="h-sha256">—</span> <button class="btn btn--sm" data-hash="h-sha256">Copy</button></div>
                <div class="hash-row"><span class="hash-algo">SHA-512</span><span class="hash-val pending" id="h-sha512">—</span> <button class="btn btn--sm" data-hash="h-sha512">Copy</button></div>
              </div>
            </div>
          </div>

        </div>
      </div>`;

    const notifArea  = container.querySelector('#gen-notif');
    const uuidList   = container.querySelector('#uuid-list');
    const uuidCountEl= container.querySelector('#uuid-count');
    const copyAllBtn = container.querySelector('#uuid-copy-all');
    const hashInput  = container.querySelector('#hash-input');

    function notify(msg, type) { App.notify(notifArea, msg, type); }

    // ── UUID v4 ───────────────────────────────────────────────────────────

    function uuidv4() {
      if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
      bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant bits
      const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    }

    async function copyText(text, btn) {
      try {
        await navigator.clipboard.writeText(text);
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      } catch { /* silent */ }
    }

    function generateUUIDs() {
      const count = Math.max(1, Math.min(100, Number(uuidCountEl.value) || 5));
      const uuids = Array.from({length: count}, uuidv4);

      uuidList.innerHTML = '';
      for (const id of uuids) {
        const row = document.createElement('div');
        row.className = 'uuid-item';

        const val = document.createElement('span');
        val.className = 'uuid-val';
        val.textContent = id;

        const btn = document.createElement('button');
        btn.className = 'btn btn--sm';
        btn.textContent = 'Copy';
        btn.addEventListener('click', () => copyText(id, btn));

        row.appendChild(val);
        row.appendChild(btn);
        uuidList.appendChild(row);
      }

      copyAllBtn.disabled = false;
      copyAllBtn._uuids = uuids;
      notify(`${count} UUID${count > 1 ? 's' : ''} generated ✓`, 'success');
    }

    container.querySelector('#uuid-gen').addEventListener('click', generateUUIDs);

    copyAllBtn.addEventListener('click', () => {
      if (!copyAllBtn._uuids) return;
      copyText(copyAllBtn._uuids.join('\n'), copyAllBtn);
    });

    container.querySelector('#uuid-clear').addEventListener('click', () => {
      uuidList.innerHTML = '<span style="color:var(--c-text-dim);font-size:13px;font-style:italic;">Click Generate to create UUIDs.</span>';
      copyAllBtn.disabled = true;
      copyAllBtn._uuids = null;
    });

    // ── MD5 ───────────────────────────────────────────────────────────────
    // Pure-JS implementation; no external dependency.

    function computeMD5(input) {
      const bytes = new TextEncoder().encode(input);
      const N     = bytes.length;
      const padLen = ((N % 64) < 56 ? 56 : 120) - (N % 64);
      const buf   = new Uint8Array(N + padLen + 8);
      buf.set(bytes);
      buf[N] = 0x80;
      const view  = new DataView(buf.buffer);
      view.setUint32(N + padLen,     (N * 8) >>> 0, true);
      view.setUint32(N + padLen + 4, Math.floor(N / 0x20000000), true);

      const K = Array.from({length:64}, (_, i) => (Math.abs(Math.sin(i+1)) * 2**32) >>> 0);
      const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
                 5, 9,14,20,5, 9,14,20,5, 9,14,20,5, 9,14,20,
                 4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
                 6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];

      let a0=0x67452301, b0=0xefcdab89, c0=0x98badcfe, d0=0x10325476;

      for (let i = 0; i < buf.length; i += 64) {
        const M = Array.from({length:16}, (_, j) => view.getUint32(i + j*4, true));
        let [a, b, c, d] = [a0, b0, c0, d0];

        for (let j = 0; j < 64; j++) {
          let F, g;
          if      (j < 16) { F = (b & c) | (~b & d);  g = j; }
          else if (j < 32) { F = (d & b) | (~d & c);  g = (5*j + 1) % 16; }
          else if (j < 48) { F = b ^ c ^ d;            g = (3*j + 5) % 16; }
          else             { F = c ^ (b | ~d);          g = (7*j) % 16; }

          F = (F + a + K[j] + M[g]) >>> 0;
          a = d; d = c; c = b;
          b = (b + ((F << S[j]) | (F >>> (32 - S[j])))) >>> 0;
        }
        a0=(a0+a)>>>0; b0=(b0+b)>>>0; c0=(c0+c)>>>0; d0=(d0+d)>>>0;
      }

      const out = new Uint8Array(16);
      const ov  = new DataView(out.buffer);
      [a0,b0,c0,d0].forEach((v, i) => ov.setUint32(i*4, v, true));
      return Array.from(out, b => b.toString(16).padStart(2,'0')).join('');
    }

    // ── SHA via crypto.subtle ─────────────────────────────────────────────

    async function sha(algorithm, text) {
      const data   = new TextEncoder().encode(text);
      const buffer = await crypto.subtle.digest(algorithm, data);
      return Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2,'0')).join('');
    }

    // ── Hash compute ──────────────────────────────────────────────────────

    async function doHash() {
      const text = hashInput.value;

      // Reset to pending
      ['h-md5','h-sha1','h-sha256','h-sha512'].forEach(id => {
        const el = container.querySelector('#' + id);
        el.textContent = 'computing…';
        el.className = 'hash-val pending';
      });

      const set = (id, val) => {
        const el = container.querySelector('#' + id);
        el.textContent = val;
        el.className = 'hash-val';
      };

      // MD5 is synchronous
      try { set('h-md5', computeMD5(text)); }
      catch { set('h-md5', 'error'); }

      // SHA via crypto.subtle (async)
      const jobs = [
        sha('SHA-1',   text).then(v => set('h-sha1',   v)),
        sha('SHA-256', text).then(v => set('h-sha256', v)),
        sha('SHA-512', text).then(v => set('h-sha512', v)),
      ];

      try {
        await Promise.all(jobs);
        notify('Hashes computed ✓', 'success');
      } catch (e) {
        notify('Hash error: ' + e.message, 'error');
      }
    }

    container.querySelector('#hash-compute').addEventListener('click', doHash);

    hashInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doHash();
    });

    // Wire copy buttons for hash rows
    container.querySelector('#hash-results').addEventListener('click', e => {
      const btn = e.target.closest('[data-hash]');
      if (!btn) return;
      const val = container.querySelector('#' + btn.dataset.hash)?.textContent;
      if (val && val !== '—' && val !== 'computing…') copyText(val, btn);
    });
  },
});
