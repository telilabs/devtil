registerTool({
  id:    'jwt-decoder',
  title: 'JWT Decoder',
  route: '/jwt-decoder',

  render(container) {
    App.addStyle('jwt-decoder-styles', `
      .jwt-body { flex:1; overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:12px; }
      .jwt-token-area { display:flex; flex-direction:column; gap:8px; }
      .jwt-raw {
        font-family:var(--font-code); font-size:12px; line-height:1.6;
        padding:10px 12px; background:var(--c-surface); border:1px solid var(--c-border);
        border-radius:var(--radius-lg); word-break:break-all; min-height:56px;
      }
      .jwt-parts-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
      @media(max-width:768px){ .jwt-parts-row { grid-template-columns:1fr; } }
      .jwt-part { background:var(--c-surface); border:1px solid var(--c-border); border-radius:var(--radius-lg); overflow:hidden; }
      .jwt-part-label {
        padding:7px 12px; font-size:11px; font-weight:600; letter-spacing:0.06em;
        text-transform:uppercase; border-bottom:1px solid var(--c-border);
        background:var(--c-surface-2); display:flex; align-items:center; gap:8px;
      }
      .jwt-part pre { padding:12px; font-family:var(--font-code); font-size:12px; line-height:1.65; color:var(--c-text-bright); overflow:auto; max-height:260px; }
      .jwt-dot { color:var(--c-text-dim); font-weight:700; }
      .jwt-seg-header  { color:#ff8a80; }
      .jwt-seg-payload { color:#b39ddb; }
      .jwt-seg-sig     { color:#80d8ff; }
      .jwt-claims-table { width:100%; border-collapse:collapse; font-size:13px; }
      .jwt-claims-table th {
        text-align:left; padding:6px 10px; font-size:10px; font-weight:600;
        letter-spacing:0.08em; text-transform:uppercase; color:var(--c-text-dim);
        border-bottom:1px solid var(--c-border);
      }
      .jwt-claims-table td { padding:7px 10px; border-bottom:1px solid var(--c-border); vertical-align:top; }
      .jwt-claims-table tr:last-child td { border-bottom:none; }
      .jwt-claims-table .key { font-family:var(--font-code); color:var(--c-accent); white-space:nowrap; }
      .jwt-claims-table .val { font-family:var(--font-code); font-size:12px; color:var(--c-text-bright); word-break:break-all; }
      .jwt-claims-table .hint { font-size:11px; color:var(--c-text-dim); }
      .jwt-badge { padding:2px 7px; border-radius:99px; font-size:10px; font-weight:700; }
      .jwt-badge-expired { background:var(--c-error-bg); color:var(--c-error); border:1px solid color-mix(in srgb,var(--c-error) 30%,transparent); }
      .jwt-badge-valid   { background:var(--c-success-bg); color:var(--c-success); border:1px solid color-mix(in srgb,var(--c-success) 30%,transparent); }
      .jwt-disclaimer {
        font-size:11px; color:var(--c-warning); background:var(--c-warning-bg);
        border:1px solid color-mix(in srgb,var(--c-warning) 20%,transparent);
        border-radius:var(--radius); padding:5px 10px; margin-top:6px;
      }
      .jwt-section-title { font-size:11px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:var(--c-text-dim); }
    `);

    container.innerHTML = `
      <div class="tool">
        <div class="tool-topbar">
          <h1 class="tool-title">JWT Decoder</h1>
          <div class="toolbar">
            <button class="btn btn--primary" id="jwt-decode">Decode</button>
            <button class="btn" id="jwt-clear">Clear</button>
          </div>
          <div class="jwt-disclaimer">⚠ Signature is NOT verified — for inspection only. Never trust unverified tokens.</div>
          <div class="notif-area" id="jwt-notif"></div>
        </div>
        <div class="jwt-body">
          <!-- Input -->
          <div class="jwt-token-area">
            <div class="jwt-section-title">JWT Token</div>
            <textarea class="code-editor" id="jwt-input" rows="4" style="resize:vertical;flex:none;min-height:80px;"
              placeholder="Paste a JWT here (eyJ…)"
              spellcheck="false" autocomplete="off" autocorrect="off"></textarea>
          </div>

          <!-- Colored segments -->
          <div id="jwt-segments" hidden>
            <div class="jwt-section-title" style="margin-bottom:6px;">Segments</div>
            <div class="jwt-raw" id="jwt-colored"></div>
          </div>

          <!-- Header + Payload -->
          <div class="jwt-parts-row" id="jwt-parts" hidden>
            <div class="jwt-part">
              <div class="jwt-part-label" style="border-left:3px solid #ff8a80;">Header</div>
              <pre id="jwt-header-out"></pre>
            </div>
            <div class="jwt-part">
              <div class="jwt-part-label" style="border-left:3px solid #b39ddb;">Payload</div>
              <pre id="jwt-payload-out"></pre>
            </div>
          </div>

          <!-- Claims table -->
          <div id="jwt-claims-wrap" hidden>
            <div class="jwt-section-title" style="margin-bottom:6px;">Claims</div>
            <div style="background:var(--c-surface);border:1px solid var(--c-border);border-radius:var(--radius-lg);overflow:hidden;">
              <table class="jwt-claims-table">
                <thead><tr><th>Claim</th><th>Value</th><th>Note</th></tr></thead>
                <tbody id="jwt-claims-body"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>`;

    const inputEl      = container.querySelector('#jwt-input');
    const notifArea    = container.querySelector('#jwt-notif');
    const segmentsEl   = container.querySelector('#jwt-segments');
    const coloredEl    = container.querySelector('#jwt-colored');
    const partsEl      = container.querySelector('#jwt-parts');
    const headerOut    = container.querySelector('#jwt-header-out');
    const payloadOut   = container.querySelector('#jwt-payload-out');
    const claimsWrap   = container.querySelector('#jwt-claims-wrap');
    const claimsBody   = container.querySelector('#jwt-claims-body');

    function notify(msg, type) { App.notify(notifArea, msg, type); }

    // ── Claims rendering ──────────────────────────────────────────────────

    const TIME_CLAIMS = new Set(['exp', 'iat', 'nbf']);

    function fmtUnixDate(unix) {
      const d = new Date(unix * 1000);
      return d.toISOString() + '\n' + d.toLocaleString();
    }

    function claimNote(key, value) {
      if (!TIME_CLAIMS.has(key)) return '';
      const d = new Date(value * 1000);
      const iso = d.toISOString();
      const local = d.toLocaleString();
      if (key === 'exp') {
        const now = Date.now();
        const expired = d.getTime() < now;
        const badge = expired
          ? '<span class="jwt-badge jwt-badge-expired">EXPIRED</span>'
          : '<span class="jwt-badge jwt-badge-valid">VALID</span>';
        return `${badge} ${iso}<br><span style="color:var(--c-text-dim)">${local}</span>`;
      }
      return `${iso}<br><span style="color:var(--c-text-dim)">${local}</span>`;
    }

    function renderClaims(payload) {
      // Show all claims; highlight well-known ones
      const WELL_KNOWN = {
        iss: 'Issuer',  sub: 'Subject',     aud: 'Audience',
        exp: 'Expires', nbf: 'Not before',  iat: 'Issued at', jti: 'JWT ID',
      };
      claimsBody.innerHTML = '';

      for (const [key, value] of Object.entries(payload)) {
        const tr = document.createElement('tr');
        const displayVal = typeof value === 'object'
          ? JSON.stringify(value)
          : String(value);
        const note = claimNote(key, value);
        // key and displayVal come from untrusted JWT data — escape before innerHTML
        const description = WELL_KNOWN[key] ? `<span class="hint">${WELL_KNOWN[key]}</span>` : '';
        tr.innerHTML = `
          <td class="key">${App.esc(key)}${description ? '<br>' + description : ''}</td>
          <td class="val">${App.esc(displayVal)}</td>
          <td class="hint">${note}</td>`;
        claimsBody.appendChild(tr);
      }
    }

    // ── Decode ────────────────────────────────────────────────────────────

    function doDecode() {
      const raw = inputEl.value.trim();
      if (!raw) { notify('Paste a JWT first', 'info'); return; }

      const parts = raw.split('.');
      if (parts.length < 3) {
        notify(`Expected 3 dot-separated segments, found ${parts.length}`, 'error');
        return;
      }

      let header, payload;
      try {
        header  = window.jwtDecode(raw, { header: true });
        payload = window.jwtDecode(raw);
      } catch (e) {
        notify(e.message, 'error');
        return;
      }

      // Colored token display
      coloredEl.innerHTML =
        `<span class="jwt-seg-header">${_esc(parts[0])}</span>` +
        `<span class="jwt-dot">.</span>` +
        `<span class="jwt-seg-payload">${_esc(parts[1])}</span>` +
        `<span class="jwt-dot">.</span>` +
        `<span class="jwt-seg-sig">${_esc(parts[2])}</span>`;
      segmentsEl.hidden = false;

      headerOut.textContent  = JSON.stringify(header,  null, 2);
      payloadOut.textContent = JSON.stringify(payload, null, 2);
      partsEl.hidden = false;

      if (typeof payload === 'object' && payload !== null) {
        renderClaims(payload);
        claimsWrap.hidden = false;
      } else {
        claimsWrap.hidden = true;
      }

      // Check expiry and surface it prominently
      const exp = payload.exp;
      if (typeof exp === 'number') {
        const msLeft = exp * 1000 - Date.now();
        if (msLeft < 0) {
          const ago = Math.round(-msLeft / 1000);
          notify(`Token expired ${formatDuration(ago)} ago`, 'error');
        } else {
          const left = Math.round(msLeft / 1000);
          notify(`Token valid — expires in ${formatDuration(left)} ✓`, 'success');
        }
      } else {
        notify('Decoded ✓ (no exp claim)', 'success');
      }
    }

    function formatDuration(seconds) {
      if (seconds < 60)   return `${seconds}s`;
      if (seconds < 3600) return `${Math.floor(seconds/60)}m`;
      if (seconds < 86400)return `${Math.floor(seconds/3600)}h ${Math.floor((seconds%3600)/60)}m`;
      return `${Math.floor(seconds/86400)}d ${Math.floor((seconds%86400)/3600)}h`;
    }

    container.querySelector('#jwt-decode').addEventListener('click', doDecode);

    container.querySelector('#jwt-clear').addEventListener('click', () => {
      inputEl.value = '';
      [segmentsEl, partsEl, claimsWrap].forEach(el => { el.hidden = true; });
      claimsBody.innerHTML = '';
    });

    // Decode on Ctrl+Enter
    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doDecode();
    });
  },
});
