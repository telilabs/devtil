registerTool({
  id:    'openapi-cleaner',
  title: 'OpenAPI Cleaner',
  route: '/openapi-cleaner',

  render(container) {
    container.innerHTML = `
      <div class="tool">
        <div class="tool-topbar">
          <h1 class="tool-title">OpenAPI Cleaner</h1>
          <div class="toolbar">
            <button class="btn btn--primary" id="oc-parse">Load spec</button>
            <button class="btn" id="oc-clean" disabled>Clean</button>
            <span class="toolbar-sep"></span>
            <label class="label-inline" for="oc-fmt">Output</label>
            <select class="select" id="oc-fmt">
              <option value="json">JSON</option>
              <option value="yaml">YAML</option>
            </select>
            <span class="toolbar-sep"></span>
            <label class="btn btn--sm">
              Upload <input type="file" id="oc-file" accept=".json,.yaml,.yml" hidden>
            </label>
            <button class="btn" id="oc-select-all">All</button>
            <button class="btn" id="oc-select-none">None</button>
            <span class="toolbar-sep"></span>
            <button class="btn" id="oc-download" disabled>Download</button>
          </div>
          <div class="notif-area" id="oc-notif"></div>
        </div>
        <div class="panels">
          <div class="panel" id="oc-left">
            <div class="panel-label">
              Input spec (JSON or YAML)
            </div>
            <textarea class="code-editor" id="oc-input"
              placeholder="Paste an OpenAPI 3.x JSON or YAML spec here, or click Upload…"
              spellcheck="false" autocomplete="off"></textarea>
          </div>
          <div class="panel oc-right-panel">
            <div class="panel-label" id="oc-route-label">Routes (load a spec first)</div>
            <div class="oc-route-list" id="oc-routes" style="flex:1;overflow-y:auto;padding:8px 12px;"></div>
          </div>
        </div>
      </div>`;

    App.addStyle('openapi-cleaner-styles', `
      .oc-right-panel { display: flex; flex-direction: column; }
      .oc-group { margin-bottom: 10px; }
      .oc-group-header {
        display: flex; align-items: center; gap: 8px;
        font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
        color: var(--c-text-dim); margin-bottom: 4px; cursor: pointer; user-select: none;
      }
      .oc-group-header input { accent-color: var(--c-accent); }
      .oc-row {
        display: flex; align-items: center; gap: 8px;
        padding: 4px 8px; border-radius: 4px; cursor: pointer; user-select: none;
      }
      .oc-row:hover { background: var(--c-surface-2); }
      .oc-row input { accent-color: var(--c-accent); flex-shrink: 0; }
      .oc-method {
        font-family: var(--font-code); font-size: 11px; font-weight: 700;
        padding: 1px 5px; border-radius: 3px; flex-shrink: 0; min-width: 48px; text-align: center;
      }
      .oc-method-get    { background:#0d3b1e; color:#4cd96b; }
      .oc-method-post   { background:#1a2e4a; color:#4c8eff; }
      .oc-method-put    { background:#2e2200; color:#ffc94d; }
      .oc-method-patch  { background:#291e00; color:#ffa94d; }
      .oc-method-delete { background:#2b0d14; color:#ff5c72; }
      .oc-method-other  { background:#1a1d27; color:#c8cde8; }
      .oc-path { font-family: var(--font-code); font-size: 12px; color: var(--c-text-bright); }
      .oc-summary { font-size: 11px; color: var(--c-text-dim); margin-left: 4px; }
    `);

    const inputEl   = container.querySelector('#oc-input');
    const routesEl  = container.querySelector('#oc-routes');
    const notifArea = container.querySelector('#oc-notif');
    const cleanBtn  = container.querySelector('#oc-clean');
    const dlBtn     = container.querySelector('#oc-download');
    const fmtEl     = container.querySelector('#oc-fmt');
    const labelEl   = container.querySelector('#oc-route-label');

    let parsedSpec = null;
    let lastOutput = '';

    function notify(msg, type) { App.notify(notifArea, msg, type); }

    // ── Parse input ───────────────────────────────────────────────────────

    function parseSpec(text) {
      text = text.trim();
      if (!text) throw new Error('Input is empty');
      if (text.startsWith('{') || text.startsWith('[')) {
        return JSON.parse(text);
      }
      return jsyaml.load(text);
    }

    // ── Render route list ─────────────────────────────────────────────────

    const HTTP_METHODS = ['get','post','put','patch','delete','head','options','trace'];

    function renderRoutes(spec) {
      const paths = spec.paths || {};
      // Group by tag; untagged goes to "default"
      const groups = {}; // tag -> [ {method, path, operation} ]

      for (const [path, pathItem] of Object.entries(paths)) {
        for (const method of HTTP_METHODS) {
          const op = pathItem[method];
          if (!op) continue;
          const tags = op.tags && op.tags.length ? op.tags : ['(untagged)'];
          for (const tag of tags) {
            if (!groups[tag]) groups[tag] = [];
            groups[tag].push({ method, path, operation: op, id: `${method}:${path}` });
          }
        }
      }

      if (!Object.keys(groups).length) {
        routesEl.innerHTML = '<div style="color:var(--c-text-dim);padding:8px">No operations found</div>';
        return;
      }

      routesEl.innerHTML = '';

      for (const [tag, ops] of Object.entries(groups)) {
        const group = document.createElement('div');
        group.className = 'oc-group';

        const hdr = document.createElement('label');
        hdr.className = 'oc-group-header';
        const groupCb = document.createElement('input');
        groupCb.type = 'checkbox';
        groupCb.checked = true;
        groupCb.dataset.group = tag;
        hdr.appendChild(groupCb);
        hdr.appendChild(document.createTextNode(tag));
        group.appendChild(hdr);

        for (const op of ops) {
          const row = document.createElement('label');
          row.className = 'oc-row';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = true;
          cb.dataset.opId = op.id;
          cb.dataset.group = tag;

          const badge = document.createElement('span');
          badge.className = `oc-method oc-method-${['get','post','put','patch','delete'].includes(op.method) ? op.method : 'other'}`;
          badge.textContent = op.method.toUpperCase();

          const pathSpan = document.createElement('span');
          pathSpan.className = 'oc-path';
          pathSpan.textContent = op.path;

          const sum = document.createElement('span');
          sum.className = 'oc-summary';
          sum.textContent = op.operation.summary || op.operation.operationId || '';

          row.appendChild(cb);
          row.appendChild(badge);
          row.appendChild(pathSpan);
          if (sum.textContent) row.appendChild(sum);
          group.appendChild(row);
        }

        // Group checkbox toggles all children
        groupCb.addEventListener('change', () => {
          group.querySelectorAll(`input[data-op-id]`).forEach(cb => {
            cb.checked = groupCb.checked;
          });
        });

        // Child change updates group indeterminate state
        group.querySelectorAll('input[data-op-id]').forEach(cb => {
          cb.addEventListener('change', () => updateGroupState(groupCb, group));
        });

        routesEl.appendChild(group);
      }

      labelEl.textContent = `Routes (${Object.values(groups).flat().length} operations)`;
    }

    function updateGroupState(groupCb, group) {
      const kids = [...group.querySelectorAll('input[data-op-id]')];
      const checked = kids.filter(c => c.checked).length;
      groupCb.checked = checked === kids.length;
      groupCb.indeterminate = checked > 0 && checked < kids.length;
    }

    // ── $ref walker ───────────────────────────────────────────────────────

    function collectRefs(obj, found = new Set()) {
      if (!obj || typeof obj !== 'object') return found;
      if (Array.isArray(obj)) { obj.forEach(v => collectRefs(v, found)); return found; }
      for (const [k, v] of Object.entries(obj)) {
        if (k === '$ref' && typeof v === 'string') found.add(v);
        else collectRefs(v, found);
      }
      return found;
    }

    function resolveLocalRef(ref) {
      // "#/components/schemas/Foo" -> ["components","schemas","Foo"]
      if (!ref.startsWith('#/')) return null;
      return ref.slice(2).split('/');
    }

    // ── Clean ─────────────────────────────────────────────────────────────

    function doClean() {
      if (!parsedSpec) { notify('Load a spec first', 'info'); return; }

      // Collect selected operation ids
      const selectedIds = new Set(
        [...routesEl.querySelectorAll('input[data-op-id]:checked')]
          .map(cb => cb.dataset.opId)
      );

      if (!selectedIds.size) { notify('Select at least one operation', 'info'); return; }

      // Deep-clone spec
      const spec = JSON.parse(JSON.stringify(parsedSpec));

      // 1. Prune paths / operations
      const usedTags = new Set();
      for (const [path, pathItem] of Object.entries(spec.paths || {})) {
        for (const method of HTTP_METHODS) {
          if (!pathItem[method]) continue;
          const id = `${method}:${path}`;
          if (selectedIds.has(id)) {
            (pathItem[method].tags || []).forEach(t => usedTags.add(t));
          } else {
            delete pathItem[method];
          }
        }
        // Remove path entry if no operations remain
        const hasOps = HTTP_METHODS.some(m => pathItem[m]);
        if (!hasOps) delete spec.paths[path];
      }

      // 2. Drop unused tags
      if (spec.tags) spec.tags = spec.tags.filter(t => usedTags.has(t.name));

      // 3. Prune unused components by walking $refs transitively
      if (spec.components) {
        const reachable = new Set();
        const queue = [spec.paths, spec.info];

        const visit = (ref) => {
          const parts = resolveLocalRef(ref);
          if (!parts) return;
          const key = parts.join('/');
          if (reachable.has(key)) return;
          reachable.add(key);
          // Walk the resolved node for further $refs
          let node = spec;
          for (const p of parts) node = node?.[p];
          if (node) collectRefs(node).forEach(visit);
        };

        collectRefs(spec.paths).forEach(visit);

        // Prune each component section
        for (const [section, items] of Object.entries(spec.components)) {
          if (typeof items !== 'object') continue;
          for (const name of Object.keys(items)) {
            const key = `components/${section}/${name}`;
            if (!reachable.has(key)) delete spec.components[section][name];
          }
          if (!Object.keys(spec.components[section]).length)
            delete spec.components[section];
        }
        if (!Object.keys(spec.components).length) delete spec.components;
      }

      // 4. Serialize
      const fmt = fmtEl.value;
      let text;
      try {
        text = fmt === 'yaml'
          ? jsyaml.dump(spec, { lineWidth: -1, noRefs: true })
          : JSON.stringify(spec, null, 2);
      } catch (e) {
        notify('Serialization error: ' + e.message, 'error');
        return;
      }

      // Show in right panel — swap route list for output pre temporarily
      // by stashing in a sibling element we manage
      let outEl = container.querySelector('#oc-output');
      if (!outEl) {
        outEl = document.createElement('pre');
        outEl.id = 'oc-output';
        outEl.className = 'code-output';
        outEl.style.display = 'none';
        container.querySelector('.oc-right-panel').appendChild(outEl);
      }
      outEl.textContent = text;
      outEl.style.display = '';
      routesEl.style.display = 'none';
      labelEl.textContent = 'Output';

      lastOutput = text;
      dlBtn.disabled = false;
      notify(`Cleaned ✓ — ${selectedIds.size} operation(s) kept`, 'success');
    }

    // ── Wire-up ───────────────────────────────────────────────────────────

    container.querySelector('#oc-parse').addEventListener('click', () => {
      let spec;
      try {
        spec = parseSpec(inputEl.value);
      } catch (e) {
        notify(e.message, 'error');
        return;
      }
      if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
        notify('Invalid spec — expected a JSON/YAML object', 'error');
        return;
      }
      parsedSpec = spec;

      // Reset output view
      routesEl.style.display = '';
      const outEl = container.querySelector('#oc-output');
      if (outEl) outEl.style.display = 'none';
      labelEl.textContent = 'Routes';

      renderRoutes(parsedSpec);
      cleanBtn.disabled = false;
      dlBtn.disabled = true;
      lastOutput = '';
      notify('Spec loaded ✓', 'success');
    });

    container.querySelector('#oc-clean').addEventListener('click', doClean);

    dlBtn.addEventListener('click', () => {
      const fmt = fmtEl.value;
      App.download(`openapi-cleaned.${fmt}`, lastOutput,
        fmt === 'yaml' ? 'application/yaml' : 'application/json');
    });

    container.querySelector('#oc-file').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      e.target.value = '';
      try {
        inputEl.value = await App.readFile(file);
        notify(`Loaded "${file.name}" — click Load spec`, 'info');
      } catch (err) {
        notify(err.message, 'error');
      }
    });

    container.querySelector('#oc-select-all').addEventListener('click', () => {
      routesEl.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.checked = true; cb.indeterminate = false;
      });
    });

    container.querySelector('#oc-select-none').addEventListener('click', () => {
      routesEl.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.checked = false; cb.indeterminate = false;
      });
    });
  },
});
