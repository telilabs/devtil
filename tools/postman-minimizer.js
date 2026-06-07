registerTool({
  id:    'postman-minimizer',
  title: 'Postman Minimizer',
  route: '/postman-minimizer',

  render(container) {
    container.innerHTML = `
      <div class="tool">
        <div class="tool-topbar">
          <h1 class="tool-title">Postman Collection Minimizer</h1>
          <div class="toolbar">
            <button class="btn btn--primary" id="pm-load">Load collection</button>
            <button class="btn" id="pm-minimize" disabled>Minimize</button>
            <span class="toolbar-sep"></span>
            <label class="btn btn--sm">
              Upload <input type="file" id="pm-file" accept=".json" hidden>
            </label>
            <button class="btn" id="pm-select-all">All</button>
            <button class="btn" id="pm-select-none">None</button>
            <span class="toolbar-sep"></span>
            <button class="btn" id="pm-download" disabled>Download</button>
          </div>
          <div class="notif-area" id="pm-notif"></div>
        </div>
        <div class="panels">
          <div class="panel">
            <div class="panel-label">Collection JSON (v2.1)</div>
            <textarea class="code-editor" id="pm-input"
              placeholder="Paste a Postman v2.1 collection JSON here, or click Upload…"
              spellcheck="false" autocomplete="off"></textarea>
          </div>
          <div class="panel pm-right-panel">
            <div class="panel-label" id="pm-tree-label">Requests (load a collection first)</div>
            <div class="pm-tree" id="pm-tree" style="flex:1;overflow-y:auto;padding:8px 12px;"></div>
          </div>
        </div>
      </div>`;

    App.addStyle('postman-minimizer-styles', `
      .pm-right-panel { display: flex; flex-direction: column; }
      .pm-folder { margin-bottom: 2px; }
      .pm-folder-header {
        display: flex; align-items: center; gap: 7px;
        padding: 5px 6px; border-radius: 4px; cursor: pointer; user-select: none;
        font-size: 13px; font-weight: 500; color: var(--c-text-bright);
      }
      .pm-folder-header:hover { background: var(--c-surface-2); }
      .pm-folder-header input { accent-color: var(--c-accent); flex-shrink:0; }
      .pm-folder-icon { font-size: 12px; color: var(--c-text-dim); flex-shrink:0; }
      .pm-folder-children { padding-left: 20px; }
      .pm-request {
        display: flex; align-items: center; gap: 7px;
        padding: 4px 6px; border-radius: 4px; cursor: pointer; user-select: none;
        font-size: 12px;
      }
      .pm-request:hover { background: var(--c-surface-2); }
      .pm-request input { accent-color: var(--c-accent); flex-shrink:0; }
      .pm-req-method {
        font-family: var(--font-code); font-size: 10px; font-weight: 700;
        padding: 1px 4px; border-radius: 3px; flex-shrink: 0; min-width: 44px; text-align: center;
      }
      .pm-req-get    { background:#0d3b1e; color:#4cd96b; }
      .pm-req-post   { background:#1a2e4a; color:#4c8eff; }
      .pm-req-put    { background:#2e2200; color:#ffc94d; }
      .pm-req-patch  { background:#291e00; color:#ffa94d; }
      .pm-req-delete { background:#2b0d14; color:#ff5c72; }
      .pm-req-other  { background:#1a1d27; color:#c8cde8; }
      .pm-req-name { color: var(--c-text); }
    `);

    const inputEl    = container.querySelector('#pm-input');
    const treeEl     = container.querySelector('#pm-tree');
    const notifArea  = container.querySelector('#pm-notif');
    const minimizeBtn= container.querySelector('#pm-minimize');
    const dlBtn      = container.querySelector('#pm-download');
    const treeLabelEl= container.querySelector('#pm-tree-label');

    let parsedCollection = null;
    let lastOutput = '';

    function notify(msg, type) { App.notify(notifArea, msg, type); }

    // ── Helpers ───────────────────────────────────────────────────────────

    // Returns request method string from a Postman item.
    function requestMethod(item) {
      return (item.request?.method || 'GET').toUpperCase();
    }

    // True if an item is a folder (has item array = folder/collection group).
    function isFolder(item) {
      return Array.isArray(item.item);
    }

    // Count total requests recursively.
    function countRequests(items) {
      let n = 0;
      for (const item of items) {
        if (isFolder(item)) n += countRequests(item.item);
        else n++;
      }
      return n;
    }

    // ── Render tree ───────────────────────────────────────────────────────

    function renderTree(items, parentEl, depth = 0) {
      for (const item of items) {
        if (isFolder(item)) {
          const folder = document.createElement('div');
          folder.className = 'pm-folder';

          const hdr = document.createElement('label');
          hdr.className = 'pm-folder-header';

          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = true;
          cb.dataset.folder = item.name;

          const icon = document.createElement('span');
          icon.className = 'pm-folder-icon';
          icon.textContent = '▸ ';

          const nameSpan = document.createElement('span');
          nameSpan.textContent = item.name || 'Folder';

          hdr.appendChild(cb);
          hdr.appendChild(icon);
          hdr.appendChild(nameSpan);
          folder.appendChild(hdr);

          const children = document.createElement('div');
          children.className = 'pm-folder-children';
          renderTree(item.item, children, depth + 1);
          folder.appendChild(children);

          // Group checkbox
          cb.addEventListener('change', () => {
            children.querySelectorAll('input[type=checkbox]').forEach(c => {
              c.checked = cb.checked; c.indeterminate = false;
            });
          });

          // Bubble state up
          children.querySelectorAll('input[type=checkbox]').forEach(c => {
            c.addEventListener('change', () => updateFolderState(cb, children));
          });

          parentEl.appendChild(folder);

        } else {
          const row = document.createElement('label');
          row.className = 'pm-request';

          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = true;
          cb.dataset.reqName = item.name;

          const method = requestMethod(item);
          const badge = document.createElement('span');
          const cls = ['GET','POST','PUT','PATCH','DELETE'].includes(method)
            ? method.toLowerCase() : 'other';
          badge.className = `pm-req-method pm-req-${cls}`;
          badge.textContent = method;

          const nameSpan = document.createElement('span');
          nameSpan.className = 'pm-req-name';
          nameSpan.textContent = item.name || '(untitled)';

          row.appendChild(cb);
          row.appendChild(badge);
          row.appendChild(nameSpan);

          // Attach item reference for minimizer to use
          row._pmItem = item;
          cb._pmItem = item;

          parentEl.appendChild(row);
        }
      }
    }

    function updateFolderState(folderCb, childrenEl) {
      const kids = [...childrenEl.querySelectorAll(':scope > label > input, :scope > div > label > input')];
      if (!kids.length) return;
      const checked = kids.filter(c => c.checked).length;
      folderCb.checked = checked === kids.length;
      folderCb.indeterminate = checked > 0 && checked < kids.length;
    }

    // ── Minimize ──────────────────────────────────────────────────────────

    // Walk the rendered tree DOM to find which items are selected, then rebuild
    // the collection item array preserving folder structure.
    function filterItems(originalItems, domEl) {
      const result = [];
      const domChildren = [...domEl.children];

      let origFolderIdx = 0;

      for (const child of domChildren) {
        if (child.classList.contains('pm-folder')) {
          while (origFolderIdx < originalItems.length && !isFolder(originalItems[origFolderIdx])) origFolderIdx++;
          const orig = originalItems[origFolderIdx++];
          if (!orig) continue;

          const childrenEl = child.querySelector('.pm-folder-children');
          const kept = filterItems(orig.item, childrenEl);

          if (kept.length) {
            // Clone folder, replace item array
            const clone = Object.assign({}, orig, { item: kept });
            result.push(clone);
          }

        } else if (child.classList.contains('pm-request')) {
          const cb = child.querySelector('input[type=checkbox]');
          if (cb && cb.checked && cb._pmItem) {
            result.push(cb._pmItem);
          }
        }
      }

      return result;
    }

    function doMinimize() {
      if (!parsedCollection) { notify('Load a collection first', 'info'); return; }

      const collection = JSON.parse(JSON.stringify(parsedCollection));
      const kept = filterItems(parsedCollection.item || [], treeEl);

      if (!kept.length) { notify('Select at least one request', 'info'); return; }

      collection.item = kept;

      // Count
      const total = countRequests(kept);
      const text = JSON.stringify(collection, null, 2);

      // Show output
      let outEl = container.querySelector('#pm-output');
      if (!outEl) {
        outEl = document.createElement('pre');
        outEl.id = 'pm-output';
        outEl.className = 'code-output';
        outEl.style.display = 'none';
        container.querySelector('.pm-right-panel').appendChild(outEl);
      }
      outEl.textContent = text;
      outEl.style.display = '';
      treeEl.style.display = 'none';
      treeLabelEl.textContent = 'Output';

      lastOutput = text;
      dlBtn.disabled = false;
      notify(`Minimized ✓ — ${total} request(s) kept`, 'success');
    }

    // ── Wire-up ───────────────────────────────────────────────────────────

    container.querySelector('#pm-load').addEventListener('click', () => {
      const text = inputEl.value.trim();
      if (!text) { notify('Input is empty', 'info'); return; }

      try {
        parsedCollection = JSON.parse(text);
      } catch (e) {
        notify('Invalid JSON: ' + e.message, 'error');
        return;
      }

      if (!parsedCollection || typeof parsedCollection !== 'object' || !Array.isArray(parsedCollection.item)) {
        notify('Not a valid Postman v2.1 collection (missing "item" array)', 'error');
        parsedCollection = null;
        return;
      }

      // Reset output view
      treeEl.style.display = '';
      const outEl = container.querySelector('#pm-output');
      if (outEl) outEl.style.display = 'none';
      treeLabelEl.textContent = 'Requests';

      treeEl.innerHTML = '';
      renderTree(parsedCollection.item, treeEl);

      const total = countRequests(parsedCollection.item);
      treeLabelEl.textContent = `Requests (${total} total)`;
      minimizeBtn.disabled = false;
      dlBtn.disabled = true;
      lastOutput = '';

      const name = parsedCollection.info?.name || 'collection';
      notify(`Loaded "${name}" with ${total} request(s) ✓`, 'success');
    });

    container.querySelector('#pm-minimize').addEventListener('click', doMinimize);

    dlBtn.addEventListener('click', () => {
      const name = (parsedCollection?.info?.name || 'collection')
        .replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
      App.download(`${name}-minimized.json`, lastOutput, 'application/json');
    });

    container.querySelector('#pm-file').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      e.target.value = '';
      try {
        inputEl.value = await App.readFile(file);
        notify(`Loaded "${file.name}" — click Load collection`, 'info');
      } catch (err) {
        notify(err.message, 'error');
      }
    });

    container.querySelector('#pm-select-all').addEventListener('click', () => {
      treeEl.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.checked = true; cb.indeterminate = false;
      });
    });

    container.querySelector('#pm-select-none').addEventListener('click', () => {
      treeEl.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.checked = false; cb.indeterminate = false;
      });
    });
  },
});
