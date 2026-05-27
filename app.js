const App = {
  tools: [],

  registerTool(tool) {
    this.tools.push(tool);
  },

  // ── Helpers ────────────────────────────────────────────────────────────

  // Inject a <style> element once per id; safe to call on every render.
  addStyle(id, css) {
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = css;
    document.head.appendChild(el);
  },

  download(filename, content, mime = 'text/plain') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },

  readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = () => reject(new Error(`Could not read "${file.name}"`));
      reader.readAsText(file, 'utf-8');
    });
  },

  // Creates or updates a .notification element inside container.
  // type: 'info' | 'success' | 'error' | 'warning'
  notify(container, msg, type = 'info') {
    let el = container.querySelector(':scope > .notification');
    if (!el) {
      el = document.createElement('div');
      el.className = 'notification';
      container.setAttribute('aria-live', 'polite');
      container.setAttribute('role', 'status');
      container.prepend(el);
    }
    el.textContent = msg;
    el.dataset.type = type;
    el.hidden = false;
    clearTimeout(el._hideTimer);
    if (type === 'success') {
      el._hideTimer = setTimeout(() => { el.hidden = true; }, 3000);
    }
  },

  // ── Router ─────────────────────────────────────────────────────────────

  _currentRoute() {
    const hash = window.location.hash;
    return hash.startsWith('#') ? hash.slice(1) : '/';
  },

  _route() {
    const route = this._currentRoute() || '/';
    const main = document.getElementById('main');

    // Clear previous tool content
    main.innerHTML = '';

    if (route === '/') {
      this._renderHome(main);
    } else {
      const tool = this.tools.find(t => t.route === route);
      if (tool) {
        tool.render(main);
      } else {
        this._renderHome(main);
      }
    }

    this._updateNav(route);
  },

  // ── Home page ──────────────────────────────────────────────────────────

  _renderHome(main) {
    const cards = this.tools.length
      ? this.tools.map(t => `
          <a href="#${t.route}" class="card">
            <div class="card-title">${_esc(t.title)}</div>
            <div class="card-route">#${_esc(t.route)}</div>
          </a>`).join('')
      : '<p class="home-empty">No tools registered yet.</p>';

    main.innerHTML = `
      <div class="home">
        <h1 class="home-title">Developer Tools</h1>
        <p class="home-subtitle">Pick a tool from the sidebar or click a card below.</p>
        <div class="cards">${cards}</div>
      </div>`;
  },

  // ── Sidebar nav ────────────────────────────────────────────────────────

  _updateNav(route) {
    const nav = document.getElementById('nav');
    const isHome = !route || route === '/';

    const toolLinks = this.tools.map(t => {
      const active = route === t.route ? 'nav-item--active' : '';
      return `<a href="#${t.route}" class="nav-item ${active}">${_esc(t.title)}</a>`;
    }).join('');

    nav.innerHTML = `
      <div class="nav-section">Navigation</div>
      <a href="#/" class="nav-item nav-item--home ${isHome ? 'nav-item--active' : ''}">Home</a>
      ${this.tools.length ? '<div class="nav-section">Tools</div>' : ''}
      ${toolLinks}`;
  },

  // ── Mobile sidebar toggle ──────────────────────────────────────────────

  _initToggle() {
    const btn = document.getElementById('nav-toggle');
    const sidebar = document.getElementById('sidebar');
    const main = document.getElementById('main');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const open = sidebar.classList.toggle('sidebar--open');
      btn.setAttribute('aria-expanded', open);
    });

    // Close on navigation or click outside
    document.addEventListener('click', e => {
      if (!sidebar.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
        sidebar.classList.remove('sidebar--open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });

    main.addEventListener('click', () => {
      sidebar.classList.remove('sidebar--open');
      btn.setAttribute('aria-expanded', 'false');
    });
  },

  // ── Boot ───────────────────────────────────────────────────────────────

  init() {
    this._initToggle();
    this._route();
    window.addEventListener('hashchange', () => this._route());
  },
};

// Escape HTML for safe interpolation into innerHTML / attribute values.
function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Expose on App so tool files can use App.esc() for user-controlled data.
App.esc = _esc;

// Global shorthand used by tool files
function registerTool(tool) {
  App.registerTool(tool);
}

document.addEventListener('DOMContentLoaded', () => App.init());
