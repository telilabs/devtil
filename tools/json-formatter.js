/* ═══════════════════════════════════════════════════════════════════════════
 * NEW TOOL TEMPLATE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. Copy this file to tools/my-tool.js
 * 2. Fill in id, title, route, and render below.
 * 3. Add to index.html AFTER app.js:
 *      <script src="tools/my-tool.js"></script>
 *
 * registerTool({
 *   id:    'my-tool',          // unique kebab-case identifier
 *   title: 'My Tool',         // shown in sidebar and home cards
 *   route: '/my-tool',        // hash route — must start with /
 *
 *   render(container) {
 *     // Build all UI into `container` (the <main> element).
 *     // Use App.notify(el, msg, type) for status messages.
 *     // Use App.download(name, content, mime) to trigger a file save.
 *     // Use App.readFile(file) → Promise<string> for file uploads.
 *     container.innerHTML = `<div class="tool">...</div>`;
 *
 *     // Wire up events after setting innerHTML
 *   },
 * });
 *
 * Shared helpers on App:
 *   App.notify(container, msg, type)          type: info|success|error|warning
 *   App.download(filename, content, mime)
 *   App.readFile(file) → Promise<string>
 * ═══════════════════════════════════════════════════════════════════════════ */

registerTool({
  id:    'json-formatter',
  title: 'JSON Formatter',
  route: '/json-formatter',

  render(container) {
    container.innerHTML = `
      <div class="tool">
        <div class="tool-topbar">
          <h1 class="tool-title">JSON Formatter</h1>
          <div class="toolbar">
            <button class="btn btn--primary" id="jf-pretty">Pretty-print</button>
            <button class="btn" id="jf-minify">Minify</button>
            <button class="btn" id="jf-validate">Validate</button>
            <span class="toolbar-sep"></span>
            <label class="label-inline" for="jf-indent">Indent</label>
            <select class="select" id="jf-indent" title="Indentation">
              <option value="2">2 spaces</option>
              <option value="4">4 spaces</option>
              <option value="tab">Tab</option>
            </select>
            <label class="checkbox-wrap" title="Recursively sort all object keys">
              <input type="checkbox" id="jf-sort"> Sort keys
            </label>
            <span class="toolbar-sep"></span>
            <button class="btn" id="jf-copy" title="Copy output to clipboard">Copy</button>
            <button class="btn" id="jf-download" disabled title="Download output as .json">Download</button>
          </div>
          <div class="notif-area" id="jf-notif-area"></div>
        </div>

        <div class="panels">
          <!-- Input panel -->
          <div class="panel" id="jf-drop">
            <div class="panel-label">
              Input
              <label class="btn btn--sm" title="Open a JSON file">
                Open file
                <input type="file" id="jf-file" accept=".json,application/json,text/plain" hidden>
              </label>
            </div>
            <textarea
              class="code-editor"
              id="jf-input"
              placeholder="Paste JSON here, or drag &amp; drop a file onto this panel…"
              spellcheck="false"
              autocomplete="off"
              autocorrect="off"
            ></textarea>
          </div>

          <!-- Output panel -->
          <div class="panel">
            <div class="panel-label">Output</div>
            <pre class="code-output" id="jf-output" tabindex="0" aria-label="Formatted output"></pre>
          </div>
        </div>
      </div>`;

    // ── Element refs ──────────────────────────────────────────────────────
    const inputEl    = container.querySelector('#jf-input');
    const outputEl   = container.querySelector('#jf-output');
    const notifArea  = container.querySelector('#jf-notif-area');
    const indentEl   = container.querySelector('#jf-indent');
    const sortEl     = container.querySelector('#jf-sort');
    const downloadBtn= container.querySelector('#jf-download');
    const copyBtn    = container.querySelector('#jf-copy');
    const dropZone   = container.querySelector('#jf-drop');

    let lastOutput = '';

    // ── Helpers ───────────────────────────────────────────────────────────

    function notify(msg, type) {
      App.notify(notifArea, msg, type);
    }

    function getIndent() {
      const v = indentEl.value;
      return v === 'tab' ? '\t' : Number(v);
    }

    function sortKeys(value) {
      if (Array.isArray(value)) return value.map(sortKeys);
      if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
          Object.keys(value).sort().map(k => [k, sortKeys(value[k])])
        );
      }
      return value;
    }

    // Extract line + column from a JSON.parse SyntaxError across browsers.
    function errorLocation(text, err) {
      // Firefox: "at line N column M of the JSON data"
      let m = err.message.match(/line (\d+) column (\d+)/i);
      if (m) return `Line ${m[1]}, Column ${m[2]}`;

      // V8 (Chrome/Node ≥18): "at position N"
      m = err.message.match(/at position (\d+)/i);
      if (m) {
        const pos = Number(m[1]);
        const before = text.slice(0, pos);
        const lines = before.split('\n');
        return `Line ${lines.length}, Column ${lines[lines.length - 1].length + 1}`;
      }

      // Safari / older V8: no position — report nothing extra
      return null;
    }

    function formatError(text, err) {
      const loc = errorLocation(text, err);
      return loc ? `${loc} — ${err.message}` : err.message;
    }

    function setOutput(text) {
      outputEl.textContent = text;
      lastOutput = text;
      downloadBtn.disabled = !text;
    }

    function clearOutput() {
      outputEl.textContent = '';
      lastOutput = '';
      downloadBtn.disabled = true;
    }

    function parse(text) {
      if (!text.trim()) { notify('Input is empty', 'info'); return null; }
      try {
        return JSON.parse(text);
      } catch (e) {
        notify(formatError(text, e), 'error');
        clearOutput();
        return null;
      }
    }

    // ── Actions ───────────────────────────────────────────────────────────

    container.querySelector('#jf-validate').addEventListener('click', () => {
      const text = inputEl.value;
      if (!text.trim()) { notify('Input is empty', 'info'); return; }
      try {
        JSON.parse(text);
        notify('Valid JSON ✓', 'success');
      } catch (e) {
        notify(formatError(text, e), 'error');
      }
    });

    container.querySelector('#jf-pretty').addEventListener('click', () => {
      let parsed = parse(inputEl.value);
      if (parsed === null) return;
      if (sortEl.checked) parsed = sortKeys(parsed);
      setOutput(JSON.stringify(parsed, null, getIndent()));
      notify('Pretty-printed ✓', 'success');
    });

    container.querySelector('#jf-minify').addEventListener('click', () => {
      let parsed = parse(inputEl.value);
      if (parsed === null) return;
      if (sortEl.checked) parsed = sortKeys(parsed);
      setOutput(JSON.stringify(parsed));
      notify('Minified ✓', 'success');
    });

    downloadBtn.addEventListener('click', () => {
      if (lastOutput) App.download('output.json', lastOutput, 'application/json');
    });

    copyBtn.addEventListener('click', async () => {
      const text = outputEl.textContent;
      if (!text) { notify('Nothing to copy', 'info'); return; }
      try {
        await navigator.clipboard.writeText(text);
        notify('Copied to clipboard ✓', 'success');
      } catch {
        notify('Copy failed — select text and copy manually', 'error');
      }
    });

    // ── File input ────────────────────────────────────────────────────────

    container.querySelector('#jf-file').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      e.target.value = ''; // reset so the same file can be re-opened
      try {
        inputEl.value = await App.readFile(file);
        notify(`Loaded "${file.name}"`, 'info');
      } catch (err) {
        notify(err.message, 'error');
      }
    });

    // ── Drag and drop ─────────────────────────────────────────────────────

    dropZone.addEventListener('dragover', e => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', e => {
      if (!dropZone.contains(e.relatedTarget)) {
        dropZone.classList.remove('drag-over');
      }
    });

    dropZone.addEventListener('drop', async e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (!file) return;
      try {
        inputEl.value = await App.readFile(file);
        notify(`Loaded "${file.name}"`, 'info');
      } catch (err) {
        notify(err.message, 'error');
      }
    });
  },
});
