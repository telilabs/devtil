registerTool({
  id:    'base64',
  title: 'Base64',
  route: '/base64',

  render(container) {
    container.innerHTML = `
      <div class="tool">
        <div class="tool-topbar">
          <h1 class="tool-title">Base64 Encoder / Decoder</h1>
          <div class="toolbar">
            <button class="btn btn--primary" id="b64-enc-text">Encode text</button>
            <button class="btn btn--primary" id="b64-dec-text">Decode text</button>
            <span class="toolbar-sep"></span>
            <label class="btn btn--sm" title="Encode binary file to Base64">
              Encode file <input type="file" id="b64-enc-file" hidden>
            </label>
            <button class="btn btn--sm" id="b64-dec-file" title="Decode Base64 in input panel and download as binary">Decode → file</button>
            <span class="toolbar-sep"></span>
            <label class="checkbox-wrap" title="Use URL-safe alphabet (- and _ instead of + and /, no padding)">
              <input type="checkbox" id="b64-urlsafe"> URL-safe
            </label>
            <span class="toolbar-sep"></span>
            <button class="btn" id="b64-copy">Copy output</button>
            <button class="btn" id="b64-download" disabled>Download</button>
          </div>
          <div class="notif-area" id="b64-notif"></div>
        </div>
        <div class="panels">
          <div class="panel" id="b64-drop">
            <div class="panel-label">
              Input
              <span id="b64-in-hint" style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--c-text-dim);font-size:11px;"></span>
            </div>
            <textarea class="code-editor" id="b64-input"
              placeholder="Paste text or Base64 here, or drag &amp; drop a text file…"
              spellcheck="false" autocomplete="off" autocorrect="off"></textarea>
          </div>
          <div class="panel">
            <div class="panel-label">Output</div>
            <pre class="code-output" id="b64-output" tabindex="0"></pre>
          </div>
        </div>
      </div>`;

    const inputEl   = container.querySelector('#b64-input');
    const outputEl  = container.querySelector('#b64-output');
    const notifArea = container.querySelector('#b64-notif');
    const urlSafeEl = container.querySelector('#b64-urlsafe');
    const dlBtn     = container.querySelector('#b64-download');
    const dropZone  = container.querySelector('#b64-drop');
    const inHint    = container.querySelector('#b64-in-hint');

    let lastOutput = '';
    let lastOutputBytes = null; // Uint8Array for binary downloads

    function notify(msg, type) { App.notify(notifArea, msg, type); }

    // ── Encode helpers ────────────────────────────────────────────────────

    // Convert Uint8Array to Base64 safely (chunked to avoid stack overflow)
    function bytesToBase64(bytes, urlSafe) {
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      let b64 = btoa(binary);
      if (urlSafe) b64 = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      return b64;
    }

    // Normalize any Base64 variant (standard or URL-safe, with or without padding)
    function normalizeBase64(b64) {
      const stripped = b64.replace(/\s/g, '');
      const standard = stripped.replace(/-/g, '+').replace(/_/g, '/');
      const pad = (4 - standard.length % 4) % 4;
      return standard + '='.repeat(pad);
    }

    function encodeText() {
      const text = inputEl.value;
      if (!text) { notify('Input is empty', 'info'); return; }
      const bytes = new TextEncoder().encode(text);
      const out = bytesToBase64(bytes, urlSafeEl.checked);
      outputEl.textContent = out;
      lastOutput = out;
      lastOutputBytes = null;
      dlBtn.disabled = false;
      notify('Encoded ✓', 'success');
    }

    function decodeText() {
      const raw = inputEl.value.replace(/\s/g, '');
      if (!raw) { notify('Input is empty', 'info'); return; }
      try {
        const normalized = normalizeBase64(raw);
        const binary = atob(normalized);
        const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
        const out = new TextDecoder().decode(bytes);
        outputEl.textContent = out;
        lastOutput = out;
        lastOutputBytes = null;
        dlBtn.disabled = false;
        notify('Decoded ✓', 'success');
      } catch (e) {
        notify('Invalid Base64: ' + e.message, 'error');
      }
    }

    function encodeFile(file) {
      const reader = new FileReader();
      reader.onload = ev => {
        const bytes = new Uint8Array(ev.target.result);
        const out = bytesToBase64(bytes, urlSafeEl.checked);
        outputEl.textContent = out;
        lastOutput = out;
        lastOutputBytes = null;
        dlBtn.disabled = false;
        inHint.textContent = `← from "${file.name}" (${bytes.length.toLocaleString()} bytes)`;
        notify(`Encoded "${file.name}" ✓`, 'success');
      };
      reader.onerror = () => notify('Could not read file', 'error');
      reader.readAsArrayBuffer(file);
    }

    function decodeToFile() {
      const raw = inputEl.value.replace(/\s/g, '');
      if (!raw) { notify('Input is empty', 'info'); return; }
      try {
        const normalized = normalizeBase64(raw);
        const binary = atob(normalized);
        const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
        const blob = new Blob([bytes]);
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), {
          href: url, download: 'decoded.bin'
        });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        notify(`Downloading ${bytes.length.toLocaleString()} bytes as decoded.bin ✓`, 'success');
      } catch (e) {
        notify('Invalid Base64: ' + e.message, 'error');
      }
    }

    // ── Wire-up ───────────────────────────────────────────────────────────

    container.querySelector('#b64-enc-text').addEventListener('click', encodeText);
    container.querySelector('#b64-dec-text').addEventListener('click', decodeText);
    container.querySelector('#b64-dec-file').addEventListener('click', decodeToFile);

    container.querySelector('#b64-enc-file').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      e.target.value = '';
      encodeFile(file);
    });

    container.querySelector('#b64-copy').addEventListener('click', async () => {
      if (!outputEl.textContent) { notify('Nothing to copy', 'info'); return; }
      try {
        await navigator.clipboard.writeText(outputEl.textContent);
        notify('Copied ✓', 'success');
      } catch { notify('Copy failed', 'error'); }
    });

    dlBtn.addEventListener('click', () => {
      App.download('output.txt', lastOutput, 'text/plain');
    });

    // Drag and drop (text files only)
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', e => { if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', async e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (!file) return;
      // Binary file → encode directly; text file → put content in input
      if (file.type && !file.type.startsWith('text/') && file.type !== 'application/json') {
        encodeFile(file);
      } else {
        try {
          inputEl.value = await App.readFile(file);
          inHint.textContent = `← "${file.name}"`;
          notify(`Loaded "${file.name}"`, 'info');
        } catch (err) { notify(err.message, 'error'); }
      }
    });
  },
});
