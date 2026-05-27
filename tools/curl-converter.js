registerTool({
  id:    'curl-converter',
  title: 'cURL → OpenAPI',
  route: '/curl-converter',

  render(container) {
    container.innerHTML = `
      <div class="tool">
        <div class="tool-topbar">
          <h1 class="tool-title">cURL → OpenAPI 3.0.3</h1>
          <div class="toolbar">
            <button class="btn btn--primary" id="cc-convert">Convert</button>
            <span class="toolbar-sep"></span>
            <label class="label-inline" for="cc-fmt">Output</label>
            <select class="select" id="cc-fmt">
              <option value="json">JSON</option>
              <option value="yaml">YAML</option>
            </select>
            <span class="toolbar-sep"></span>
            <button class="btn" id="cc-download" disabled>Download</button>
          </div>
          <div class="notif-area" id="cc-notif"></div>
        </div>
        <div class="panels">
          <div class="panel">
            <div class="panel-label">cURL Commands (one or more)</div>
            <textarea class="code-editor" id="cc-input"
              placeholder="curl -X POST https://api.example.com/users \\&#10;  -H 'Content-Type: application/json' \\&#10;  -d '{&quot;name&quot;:&quot;Alice&quot;,&quot;age&quot;:30}'"
              spellcheck="false" autocomplete="off"></textarea>
          </div>
          <div class="panel">
            <div class="panel-label">OpenAPI 3.0.3</div>
            <pre class="code-output" id="cc-output" tabindex="0"></pre>
          </div>
        </div>
      </div>`;

    const inputEl   = container.querySelector('#cc-input');
    const outputEl  = container.querySelector('#cc-output');
    const notifArea = container.querySelector('#cc-notif');
    const fmtEl     = container.querySelector('#cc-fmt');
    const dlBtn     = container.querySelector('#cc-download');

    let lastOutput = '';

    function notify(msg, type) { App.notify(notifArea, msg, type); }

    // ── Parser ────────────────────────────────────────────────────────────

    // Split raw text into individual curl command strings (handles backslash continuations).
    function splitCurls(raw) {
      const cmds = [];
      // Join continuation lines then split on standalone "curl"
      const joined = raw.replace(/\\\s*\n/g, ' ');
      // Split on newlines, then look for curl starts
      const lines = joined.split('\n').map(l => l.trim()).filter(Boolean);
      let current = null;
      for (const line of lines) {
        if (/^curl\b/i.test(line)) {
          if (current) cmds.push(current);
          current = line;
        } else if (current) {
          current += ' ' + line;
        }
      }
      if (current) cmds.push(current);
      return cmds;
    }

    // Tokenize a shell-like command string respecting single/double quotes.
    function tokenize(cmd) {
      const tokens = [];
      let i = 0;
      while (i < cmd.length) {
        while (i < cmd.length && /\s/.test(cmd[i])) i++;
        if (i >= cmd.length) break;
        let tok = '';
        if (cmd[i] === "'") {
          i++;
          while (i < cmd.length && cmd[i] !== "'") tok += cmd[i++];
          i++; // closing quote
        } else if (cmd[i] === '"') {
          i++;
          while (i < cmd.length && cmd[i] !== '"') {
            if (cmd[i] === '\\' && i + 1 < cmd.length) { i++; tok += cmd[i++]; }
            else tok += cmd[i++];
          }
          i++;
        } else {
          while (i < cmd.length && !/\s/.test(cmd[i])) tok += cmd[i++];
        }
        tokens.push(tok);
      }
      return tokens;
    }

    function parseCurl(cmd) {
      const tokens = tokenize(cmd);
      const result = { method: 'GET', url: '', headers: {}, body: null, queryParams: {} };
      let i = 0;

      // Advance past "curl"
      if (tokens[i] && /^curl$/i.test(tokens[i])) i++;

      // Flags that consume the next token as value
      const needsArg = new Set(['-X','--request','-H','--header','-d','--data',
        '--data-raw','--data-binary','--data-ascii','--data-urlencode',
        '-u','--user','--url','-o','--output','--max-time','-m',
        '--connect-timeout','--cert','--key','--cacert','-A','--user-agent',
        '--referer','-e','--proxy','-x','--interface']);

      while (i < tokens.length) {
        const tok = tokens[i];

        if (tok === '-X' || tok === '--request') {
          result.method = (tokens[++i] || 'GET').toUpperCase(); i++;
        } else if (tok === '-H' || tok === '--header') {
          const hdr = tokens[++i] || ''; i++;
          const colon = hdr.indexOf(':');
          if (colon !== -1) {
            const name = hdr.slice(0, colon).trim().toLowerCase();
            const val  = hdr.slice(colon + 1).trim();
            result.headers[name] = val;
          }
        } else if (['-d','--data','--data-raw','--data-binary',
                    '--data-ascii','--data-urlencode'].includes(tok)) {
          result.body = tokens[++i] || ''; i++;
          if (!result.method || result.method === 'GET') result.method = 'POST';
        } else if (tok === '--url') {
          result.url = tokens[++i] || ''; i++;
        } else if (tok === '-G' || tok === '--get') {
          result.method = 'GET'; i++;
        } else if (tok === '-I' || tok === '--head') {
          result.method = 'HEAD'; i++;
        } else if (needsArg.has(tok)) {
          i += 2; // consume flag + value we don't care about
        } else if (/^-/.test(tok)) {
          // unknown flag
          i++;
        } else if (!result.url) {
          result.url = tok; i++;
        } else {
          i++;
        }
      }

      // Parse URL into base + path + query
      try {
        const u = new URL(result.url);
        u.searchParams.forEach((v, k) => { result.queryParams[k] = v; });
        result.parsedUrl = u;
      } catch {
        result.parsedUrl = null;
      }

      return result;
    }

    // ── JSON Schema inference ─────────────────────────────────────────────

    function inferSchema(value) {
      if (value === null) return { type: 'object', nullable: true };
      if (Array.isArray(value)) {
        const items = value.length ? inferSchema(value[0]) : {};
        return { type: 'array', items };
      }
      if (typeof value === 'object') {
        const properties = {};
        const required = [];
        for (const [k, v] of Object.entries(value)) {
          properties[k] = inferSchema(v);
          required.push(k);
        }
        return { type: 'object', properties, required };
      }
      if (typeof value === 'boolean') return { type: 'boolean' };
      if (typeof value === 'number') {
        return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' };
      }
      return { type: 'string' };
    }

    // ── OpenAPI builder ───────────────────────────────────────────────────

    function buildOpenAPI(cmds) {
      // Collect unique servers from URLs
      const serverSet = new Set();
      const paths = {};

      for (const cmd of cmds) {
        const r = parseCurl(cmd);
        if (!r.url) continue;

        let pathStr = r.url;
        let server  = '';

        if (r.parsedUrl) {
          server  = r.parsedUrl.origin;
          pathStr = r.parsedUrl.pathname || '/';
        }

        if (server) serverSet.add(server);

        const method = r.method.toLowerCase();
        if (!paths[pathStr]) paths[pathStr] = {};

        const parameters = [];

        // Query params
        for (const [name, value] of Object.entries(r.queryParams)) {
          parameters.push({
            name, in: 'query', required: false,
            schema: { type: 'string', example: value },
          });
        }

        // Headers (exclude standard ones)
        const skipHeaders = new Set(['content-type','accept','authorization',
          'content-length','host','user-agent']);
        for (const [name, value] of Object.entries(r.headers)) {
          if (!skipHeaders.has(name)) {
            parameters.push({
              name, in: 'header', required: false,
              schema: { type: 'string', example: value },
            });
          }
        }

        // Request body
        let requestBody;
        if (r.body) {
          const ct = r.headers['content-type'] || 'application/json';
          const mediaType = ct.split(';')[0].trim();
          let bodySchema = { type: 'string' };
          if (mediaType === 'application/json') {
            try {
              const parsed = JSON.parse(r.body);
              bodySchema = inferSchema(parsed);
            } catch { /* leave as string */ }
          }
          requestBody = {
            required: true,
            content: { [mediaType]: { schema: bodySchema } },
          };
        }

        // Auth
        const security = [];
        if (r.headers['authorization']) {
          const auth = r.headers['authorization'];
          if (/^bearer /i.test(auth))       security.push({ BearerAuth: [] });
          else if (/^basic /i.test(auth))   security.push({ BasicAuth: [] });
          else                              security.push({ ApiKeyAuth: [] });
        }

        const operation = {
          summary: `${r.method} ${pathStr}`,
          operationId: `${method}${pathStr.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g,'_').replace(/^_|_$/g,'')}`,
          parameters: parameters.length ? parameters : undefined,
          requestBody: requestBody || undefined,
          security: security.length ? security : undefined,
          responses: {
            '200': { description: 'Successful response' },
          },
        };

        // Remove undefined keys
        for (const k of Object.keys(operation)) {
          if (operation[k] === undefined) delete operation[k];
        }

        paths[pathStr][method] = operation;
      }

      // Security schemes
      const securitySchemes = {};
      const allOps = Object.values(paths).flatMap(p => Object.values(p));
      const usedSchemes = new Set(allOps.flatMap(op => (op.security || []).flatMap(Object.keys)));
      if (usedSchemes.has('BearerAuth'))
        securitySchemes.BearerAuth = { type: 'http', scheme: 'bearer' };
      if (usedSchemes.has('BasicAuth'))
        securitySchemes.BasicAuth  = { type: 'http', scheme: 'basic' };
      if (usedSchemes.has('ApiKeyAuth'))
        securitySchemes.ApiKeyAuth = { type: 'apiKey', in: 'header', name: 'X-API-Key' };

      const servers = [...serverSet].map(url => ({ url }));

      const doc = {
        openapi: '3.0.3',
        info: { title: 'Generated API', version: '1.0.0' },
        servers: servers.length ? servers : [{ url: 'https://api.example.com' }],
        paths,
      };

      if (Object.keys(securitySchemes).length) {
        doc.components = { securitySchemes };
      }

      return doc;
    }

    // ── Wire-up ───────────────────────────────────────────────────────────

    function doConvert() {
      const raw = inputEl.value.trim();
      if (!raw) { notify('Paste one or more curl commands first', 'info'); return; }

      const cmds = splitCurls(raw);
      if (!cmds.length) { notify('No curl commands found', 'error'); return; }

      let doc;
      try {
        doc = buildOpenAPI(cmds);
      } catch (e) {
        notify(e.message, 'error');
        return;
      }

      const fmt = fmtEl.value;
      let text;
      try {
        text = fmt === 'yaml'
          ? jsyaml.dump(doc, { lineWidth: -1, noRefs: true })
          : JSON.stringify(doc, null, 2);
      } catch (e) {
        notify('Serialization error: ' + e.message, 'error');
        return;
      }

      outputEl.textContent = text;
      lastOutput = text;
      dlBtn.disabled = false;
      notify(`Converted ${cmds.length} command(s) ✓`, 'success');
    }

    container.querySelector('#cc-convert').addEventListener('click', doConvert);

    dlBtn.addEventListener('click', () => {
      const fmt = fmtEl.value;
      App.download(`openapi.${fmt}`, lastOutput,
        fmt === 'yaml' ? 'application/yaml' : 'application/json');
    });
  },
});
