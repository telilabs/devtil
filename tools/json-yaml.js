registerTool({
  id:    'json-yaml',
  title: 'JSON ↔ YAML',
  route: '/json-yaml',

  render(container) {
    container.innerHTML = `
      <div class="tool">
        <div class="tool-topbar">
          <h1 class="tool-title">JSON ↔ YAML</h1>
          <div class="toolbar">
            <button class="btn btn--primary" id="jy-to-yaml">JSON → YAML</button>
            <button class="btn btn--primary" id="jy-to-json">YAML → JSON</button>
            <button class="btn" id="jy-auto">Auto-detect</button>
            <span class="toolbar-sep"></span>
            <label class="label-inline" for="jy-indent">Indent</label>
            <select class="select" id="jy-indent">
              <option value="2">2 spaces</option>
              <option value="4">4 spaces</option>
            </select>
            <span class="toolbar-sep"></span>
            <label class="btn btn--sm">
              Upload <input type="file" id="jy-file" accept=".json,.yaml,.yml,text/plain" hidden>
            </label>
            <button class="btn" id="jy-copy">Copy</button>
            <button class="btn" id="jy-download" disabled>Download</button>
          </div>
          <div class="notif-area" id="jy-notif"></div>
        </div>
        <div class="panels">
          <div class="panel" id="jy-drop">
            <div class="panel-label" id="jy-in-label">Input</div>
            <textarea class="code-editor" id="jy-input"
              placeholder="Paste JSON or YAML here, or drag &amp; drop a file…"
              spellcheck="false" autocomplete="off" autocorrect="off"></textarea>
          </div>
          <div class="panel">
            <div class="panel-label" id="jy-out-label">Output</div>
            <pre class="code-output" id="jy-output" tabindex="0"></pre>
          </div>
        </div>
      </div>`;

    const inputEl   = container.querySelector('#jy-input');
    const outputEl  = container.querySelector('#jy-output');
    const notifArea = container.querySelector('#jy-notif');
    const inLabel   = container.querySelector('#jy-in-label');
    const outLabel  = container.querySelector('#jy-out-label');
    const indentEl  = container.querySelector('#jy-indent');
    const dlBtn     = container.querySelector('#jy-download');
    const dropZone  = container.querySelector('#jy-drop');

    let lastOutput = '';
    let lastExt = 'txt';

    function notify(msg, type) { App.notify(notifArea, msg, type); }

    function setOutput(text, fmt) {
      outputEl.textContent = text;
      lastOutput = text;
      lastExt = fmt;
      dlBtn.disabled = !text;
      outLabel.textContent = `Output (${fmt.toUpperCase()})`;
    }

    function clearOutput() {
      outputEl.textContent = '';
      lastOutput = '';
      dlBtn.disabled = true;
      outLabel.textContent = 'Output';
    }

    // Auto-detect: JSON starts with { or [ (after whitespace), otherwise YAML
    function detectFormat(text) {
      const t = text.trim();
      if (!t) return null;
      if (t[0] === '{' || t[0] === '[') return 'json';
      try { JSON.parse(t); return 'json'; } catch {}
      return 'yaml';
    }

    function convert(dir) { // 'to-yaml' | 'to-json'
      const text = inputEl.value.trim();
      if (!text) { notify('Input is empty', 'info'); return; }
      const indent = Number(indentEl.value);

      try {
        if (dir === 'to-yaml') {
          inLabel.textContent = 'Input (JSON)';
          const parsed = JSON.parse(text);
          const out = jsyaml.dump(parsed, { indent, lineWidth: -1, noRefs: true });
          setOutput(out, 'yaml');
          notify('Converted to YAML ✓', 'success');
        } else {
          inLabel.textContent = 'Input (YAML)';
          const parsed = jsyaml.load(text);
          if (parsed === undefined) throw new Error('Empty or null YAML document');
          const out = JSON.stringify(parsed, null, indent);
          setOutput(out, 'json');
          notify('Converted to JSON ✓', 'success');
        }
      } catch (e) {
        notify(e.message, 'error');
        clearOutput();
      }
    }

    container.querySelector('#jy-to-yaml').addEventListener('click', () => convert('to-yaml'));
    container.querySelector('#jy-to-json').addEventListener('click', () => convert('to-json'));

    container.querySelector('#jy-auto').addEventListener('click', () => {
      const fmt = detectFormat(inputEl.value);
      if (!fmt) { notify('Input is empty', 'info'); return; }
      inLabel.textContent = `Input (detected: ${fmt.toUpperCase()})`;
      convert(fmt === 'json' ? 'to-yaml' : 'to-json');
    });

    container.querySelector('#jy-copy').addEventListener('click', async () => {
      if (!outputEl.textContent) { notify('Nothing to copy', 'info'); return; }
      try {
        await navigator.clipboard.writeText(outputEl.textContent);
        notify('Copied ✓', 'success');
      } catch { notify('Copy failed', 'error'); }
    });

    dlBtn.addEventListener('click', () => {
      App.download(`output.${lastExt}`, lastOutput,
        lastExt === 'yaml' ? 'application/yaml' : 'application/json');
    });

    container.querySelector('#jy-file').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      e.target.value = '';
      try {
        inputEl.value = await App.readFile(file);
        inLabel.textContent = 'Input';
        clearOutput();
        notify(`Loaded "${file.name}"`, 'info');
      } catch (err) { notify(err.message, 'error'); }
    });

    // Drag and drop
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', e => { if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', async e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (!file) return;
      try {
        inputEl.value = await App.readFile(file);
        inLabel.textContent = 'Input';
        clearOutput();
        notify(`Loaded "${file.name}"`, 'info');
      } catch (err) { notify(err.message, 'error'); }
    });
  },
});
