registerTool({
  id:    'timestamp',
  title: 'Timestamp',
  route: '/timestamp',

  render(container) {
    App.addStyle('timestamp-styles', `
      .ts-body { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:16px; }
      .ts-input-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
      .ts-input {
        flex:1; min-width:200px; padding:7px 11px;
        background:var(--c-surface); border:1px solid var(--c-border-2);
        border-radius:var(--radius); color:var(--c-text-bright);
        font-family:var(--font-code); font-size:14px;
      }
      .ts-input:focus { outline:2px solid var(--c-accent); outline-offset:1px; border-color:var(--c-accent); }
      .ts-table-wrap { background:var(--c-surface); border:1px solid var(--c-border); border-radius:var(--radius-lg); overflow:hidden; }
      .ts-table { width:100%; border-collapse:collapse; }
      .ts-table th { padding:7px 14px; font-size:10px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:var(--c-text-dim); border-bottom:1px solid var(--c-border); text-align:left; }
      .ts-table tr:not(:last-child) td { border-bottom:1px solid var(--c-border); }
      .ts-table td { padding:9px 14px; vertical-align:middle; }
      .ts-fmt  { font-size:12px; color:var(--c-text-dim); white-space:nowrap; padding-right:4px; }
      .ts-val  { font-family:var(--font-code); font-size:13px; color:var(--c-text-bright); word-break:break-all; }
      .ts-copy { white-space:nowrap; }
      .ts-empty { color:var(--c-text-dim); font-size:13px; font-style:italic; }
      .ts-rel  { color:var(--c-accent); }
    `);

    container.innerHTML = `
      <div class="tool">
        <div class="tool-topbar">
          <h1 class="tool-title">Timestamp Converter</h1>
          <div class="notif-area" id="ts-notif"></div>
        </div>
        <div class="ts-body">
          <div class="ts-input-row">
            <input class="ts-input" id="ts-input"
              placeholder="Unix seconds, ms, ISO 8601, or any date string…"
              spellcheck="false" autocomplete="off">
            <select class="select" id="ts-unit" title="Input unit for raw numbers">
              <option value="auto">Auto-detect</option>
              <option value="s">Force seconds</option>
              <option value="ms">Force ms</option>
            </select>
            <button class="btn" id="ts-now">Now</button>
            <button class="btn btn--primary" id="ts-convert">Convert</button>
          </div>

          <div class="ts-table-wrap">
            <table class="ts-table">
              <thead><tr><th>Format</th><th>Value</th><th></th></tr></thead>
              <tbody id="ts-tbody">
                <tr><td colspan="3" class="ts-empty" style="padding:16px;">
                  Enter a timestamp above and click Convert.
                </td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>`;

    const inputEl   = container.querySelector('#ts-input');
    const unitEl    = container.querySelector('#ts-unit');
    const notifArea = container.querySelector('#ts-notif');
    const tbody     = container.querySelector('#ts-tbody');

    function notify(msg, type) { App.notify(notifArea, msg, type); }

    // ── Parse ──────────────────────────────────────────────────────────────

    function parseToMs(text, unit) {
      const t = text.trim();
      if (!t) throw new Error('Input is empty');

      // Pure number (integer or decimal)
      if (/^-?\d+(\.\d+)?$/.test(t)) {
        const n = parseFloat(t);
        if (unit === 's')  return n * 1000;
        if (unit === 'ms') return n;
        // Auto: > 1e12 means ms, otherwise seconds
        return Math.abs(n) > 1e12 ? n : n * 1000;
      }

      // Try native Date parsing (handles ISO 8601 and many other formats)
      const d = new Date(t);
      if (!isNaN(d.getTime())) return d.getTime();

      throw new Error(`Cannot parse "${t}" — try a Unix timestamp, ISO 8601, or a date string`);
    }

    // ── Format ────────────────────────────────────────────────────────────

    function relativeTime(ms) {
      const diff = Date.now() - ms;
      const abs  = Math.abs(diff);
      const future = diff < 0;
      const units = [
        [365.25*24*3600*1000, 'year'],
        [30.44*24*3600*1000,  'month'],
        [7*24*3600*1000,      'week'],
        [24*3600*1000,        'day'],
        [3600*1000,           'hour'],
        [60*1000,             'minute'],
        [1000,                'second'],
      ];
      for (const [unit, name] of units) {
        const n = Math.floor(abs / unit);
        if (n >= 1) {
          const label = `${n} ${name}${n > 1 ? 's' : ''}`;
          return future ? `in ${label}` : `${label} ago`;
        }
      }
      return 'just now';
    }

    // ISO 8601 week number (UTC-based, weeks start Monday, week 1 contains Jan 4)
    function isoWeek(ms) {
      const d = new Date(ms);
      // Shift to nearest Thursday to determine the ISO year
      const thu = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      thu.setUTCDate(thu.getUTCDate() + 4 - (thu.getUTCDay() || 7));
      const yearStart = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
      const week = Math.ceil(((thu - yearStart) / 86400000 + 1) / 7);
      return `Week ${week} of ${thu.getUTCFullYear()} (ISO 8601, UTC)`;
    }

    function buildRows(ms) {
      const d = new Date(ms);
      const s = Math.floor(ms / 1000);

      return [
        { label: 'Unix (seconds)',  value: String(s) },
        { label: 'Unix (ms)',       value: String(ms) },
        { label: 'ISO 8601 (UTC)',  value: d.toISOString() },
        { label: 'RFC 2822',        value: d.toUTCString() },
        { label: 'UTC',             value: d.toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'full', timeStyle: 'long' }) },
        { label: 'Local',           value: d.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' }) },
        { label: 'Relative',        value: relativeTime(ms), cls: 'ts-rel' },
        { label: 'Day of week (UTC)', value: d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long' }) },
        { label: 'Week number',     value: isoWeek(ms) },
      ];
    }

    async function copyValue(text, btn) {
      try {
        await navigator.clipboard.writeText(text);
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      } catch { /* silent */ }
    }

    function render(ms) {
      const rows = buildRows(ms);
      tbody.innerHTML = '';
      for (const row of rows) {
        const tr = document.createElement('tr');
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn btn--sm ts-copy';
        copyBtn.textContent = 'Copy';
        copyBtn.addEventListener('click', () => copyValue(row.value, copyBtn));

        tr.innerHTML = `<td class="ts-fmt">${row.label}</td><td class="ts-val ${row.cls || ''}">${row.value}</td>`;
        const td = document.createElement('td');
        td.appendChild(copyBtn);
        tr.appendChild(td);
        tbody.appendChild(tr);
      }
    }

    function doConvert() {
      try {
        const ms = parseToMs(inputEl.value, unitEl.value);
        render(ms);
        notify('Converted ✓', 'success');
      } catch (e) {
        notify(e.message, 'error');
      }
    }

    container.querySelector('#ts-convert').addEventListener('click', doConvert);

    container.querySelector('#ts-now').addEventListener('click', () => {
      const nowS = Math.floor(Date.now() / 1000);
      inputEl.value = String(nowS);
      unitEl.value = 's';
      doConvert();
    });

    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') doConvert();
    });

    // Auto-convert on paste
    inputEl.addEventListener('paste', () => {
      setTimeout(doConvert, 0);
    });
  },
});
