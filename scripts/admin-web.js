const app = document.getElementById('app');

const BRAND_LOGO = '/assets/brand/collabka-mark-blue.png';

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function api(url, opts = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data?.ok !== false, status: res.status, data };
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU');
}

function pathParts() {
  return location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
}

function routeInfo() {
  const parts = pathParts();
  if (parts[0] !== 'admin') return { page: 'login' };
  if (parts[1] === 'login') return { page: 'login' };
  if (parts[1] === 'users' && parts[2]) return { page: 'userDetail', userId: parts[2] };
  if (parts[1] === 'users') return { page: 'users' };
  if (parts[1] === 'runtime') return { page: 'runtime' };
  return { page: 'overview' };
}

function navLink(href, label, active) {
  return `<a href="${href}" data-link class="${active ? 'is-active' : ''}">${label}</a>`;
}

function shell(title, subtitle, body, session) {
  const route = routeInfo();
  return `
    <div class="aw-shell">
      <aside class="aw-sidebar">
        <div class="aw-brand">
          <img src="${BRAND_LOGO}" alt="Collabka" />
          <div class="aw-brand-copy">
            <strong>Collabka PR</strong>
            <span>Web Admin v1</span>
          </div>
        </div>
        <nav class="aw-nav">
          ${navLink('/admin', 'Overview', route.page === 'overview')}
          ${navLink('/admin/users', 'Users', route.page === 'users' || route.page === 'userDetail')}
          ${navLink('/admin/runtime', 'Runtime', route.page === 'runtime')}
        </nav>
      </aside>
      <main class="aw-main">
        <div class="aw-topbar">
          <div class="aw-topbar-left">
            <span class="aw-chip">${escapeHtml(title)}</span>
            <span class="aw-chip">env · operator</span>
          </div>
          <div class="aw-topbar-right">
            <span class="aw-chip">TG ${Number(session?.actorTgId || 0) || 'fallback'}</span>
            <button class="aw-button secondary" id="refreshBtn">Обновить</button>
            <button class="aw-button ghost" id="logoutBtn">Выйти</button>
          </div>
        </div>
        <div class="aw-page-head">
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(subtitle)}</p>
        </div>
        ${body}
      </main>
    </div>
  `;
}

function loginView(state = {}) {
  return `
    <div class="aw-login">
      <div class="aw-login-card">
        <div class="aw-brand">
          <img src="${BRAND_LOGO}" alt="Collabka" />
          <div class="aw-brand-copy">
            <strong>Collabka PR</strong>
            <span>Web Admin v1</span>
          </div>
        </div>
        <h1>Вход в web-админку</h1>
        <p>Hobby-safe operator console: secret → Telegram approve / code → session.</p>
        <div class="aw-login-grid">
          ${state.error ? `<div class="aw-error">${escapeHtml(state.error)}</div>` : ''}
          <input id="secretInput" class="aw-input" placeholder="Admin secret" autocomplete="off" />
          <div class="aw-actions">
            <button class="aw-button" id="startLoginBtn">Запросить вход</button>
          </div>
          <div id="challengeBox" style="display:${state.challengeId ? 'block' : 'none'}">
            <p class="aw-login-help">Challenge: <code id="challengeCodeBox">${escapeHtml(state.challengeId || '')}</code></p>
            <p class="aw-login-help">Проверь Telegram approve или введи одноразовый код ниже.</p>
            <div class="aw-login-grid">
              <input id="otpInput" class="aw-input" placeholder="Telegram code" autocomplete="one-time-code" />
              <div class="aw-actions">
                <button class="aw-button secondary" id="verifyCodeBtn">Ввести код</button>
                <button class="aw-button ghost" id="checkStatusBtn">Проверить approve</button>
              </div>
            </div>
          </div>
          <p class="aw-login-help">Без approve/code доступ к admin pages не открывается.</p>
        </div>
      </div>
    </div>
  `;
}

function overviewView(model) {
  const cards = model.cards || {};
  const audit = Array.isArray(model.recentAudit) ? model.recentAudit : [];
  const runtimeNotes = Array.isArray(model.runtime?.notes) ? model.runtime.notes : [];
  return shell('Overview', 'Read-first owner cockpit без polling и cron-зависимости.', `
    <div class="aw-grid-cards">
      <div class="aw-card"><span>Users</span><strong>${cards.usersTotal || 0}</strong></div>
      <div class="aw-card"><span>Workspaces</span><strong>${cards.workspacesTotal || 0}</strong></div>
      <div class="aw-card"><span>Offers active</span><strong>${cards.offersActive || 0}</strong></div>
      <div class="aw-card"><span>Giveaways active</span><strong>${cards.giveawaysActive || 0}</strong></div>
      <div class="aw-card"><span>Payment alerts</span><strong>${cards.paymentAlerts || 0}</strong></div>
      <div class="aw-card"><span>Runtime warnings</span><strong>${cards.runtimeWarnings || 0}</strong></div>
    </div>
    <div class="aw-split aw-section">
      <section class="aw-surface aw-stack">
        <h2>Runtime snapshot</h2>
        <dl class="aw-kv">
          <dt>DB</dt><dd class="aw-status ${model.runtime?.db?.ok ? 'good' : 'bad'}">${model.runtime?.db?.ok ? 'OK' : 'FAIL'}</dd>
          <dt>Redis</dt><dd class="aw-status ${model.runtime?.redis?.ok ? 'good' : 'bad'}">${model.runtime?.redis?.configured ? (model.runtime?.redis?.ok ? 'OK' : 'FAIL') : 'NOT CONFIGURED'}</dd>
          <dt>Admin web</dt><dd>${model.runtime?.adminWebConfigured ? 'configured' : 'missing env'}</dd>
          <dt>PUBLIC_BASE_URL</dt><dd>${model.runtime?.publicBaseUrl ? 'configured' : 'missing'}</dd>
        </dl>
        <div class="aw-list">
          ${(runtimeNotes.length ? runtimeNotes : ['Нет явных предупреждений']).map((item) => `<div class="aw-list-item">${escapeHtml(item)}</div>`).join('')}
        </div>
      </section>
      <section class="aw-surface aw-stack">
        <h2>Recent admin-web audit</h2>
        <div class="aw-list">
          ${audit.length ? audit.map((item) => `
            <div class="aw-list-item">
              <strong>${escapeHtml(item.action || 'unknown')}</strong>
              <small>${escapeHtml(item.section || '')} · actor ${Number(item.actorTgId || 0) || 'fallback'} · ${formatDate(item.ts)}</small>
            </div>
          `).join('') : `<div class="aw-empty">Пока пусто.</div>`}
        </div>
      </section>
    </div>
  `, window.__adminSession || {});
}

function usersView(model) {
  const items = Array.isArray(model.items) ? model.items : [];
  return shell('Users', 'Search + segment filter + user card drilldown.', `
    <section class="aw-surface">
      <div class="aw-toolbar">
        <input id="usersSearch" class="aw-input inline" placeholder="Поиск: username / tg_id / user id" value="${escapeHtml(window.__usersState?.q || '')}" />
        <select id="usersSegment" class="aw-select inline">
          ${[['all','Все'],['brands','Brands'],['creators','Creators'],['curators','Curators'],['managers','Managers']].map(([v,l]) => `<option value="${v}" ${window.__usersState?.segment === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <button class="aw-button secondary" id="applyUsersFilters">Применить</button>
      </div>
      <div class="aw-table-wrap">
        <table class="aw-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Segment</th>
              <th>Plan / credits</th>
              <th>Signals</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            ${items.length ? items.map((item) => `
              <tr data-user-row="${item.userId}">
                <td>
                  <strong>${escapeHtml(item.username ? '@' + item.username : 'user #' + item.userId)}</strong>
                  <small>user_id ${item.userId} · tg_id ${item.tgId || '—'} ${item.hasNote ? '· <span class="aw-note-dot"></span> note' : ''}</small>
                </td>
                <td>${escapeHtml(item.segment || 'user')}</td>
                <td>${escapeHtml(item.brandPlan || '—')}<small>${item.brandCredits ? item.brandCredits + ' credits' : 'no credits'}</small></td>
                <td>${item.flags?.isCreator ? 'creator ' : ''}${item.flags?.hasBrandProfile ? 'brand ' : ''}${item.flags?.isModerator ? 'moderator ' : ''}</td>
                <td>${formatDate(item.createdAt)}</td>
              </tr>
            `).join('') : '<tr><td colspan="5" class="aw-empty">Ничего не найдено.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `, window.__adminSession || {});
}

function userDetailView(model) {
  const user = model.user || {};
  const note = model.note || {};
  return shell('User Card', 'Read-heavy drilldown + safe note write.', `
    <div class="aw-split">
      <section class="aw-surface aw-stack">
        <h2>${escapeHtml(user.username ? '@' + user.username : 'user #' + user.id)}</h2>
        <dl class="aw-kv">
          <dt>User ID</dt><dd>${user.id || '—'}</dd>
          <dt>TG ID</dt><dd>${user.tgId || '—'}</dd>
          <dt>Brand plan</dt><dd>${escapeHtml(user.brandPlan || '—')}</dd>
          <dt>Brand credits</dt><dd>${user.brandCredits || 0}</dd>
          <dt>Banned</dt><dd>${user.bannedAt ? formatDate(user.bannedAt) : 'нет'}</dd>
          <dt>Created</dt><dd>${formatDate(user.createdAt)}</dd>
        </dl>
        <div class="aw-list">
          <div class="aw-list-item"><strong>Flags</strong><small>${user.flags?.isCreator ? 'creator ' : ''}${user.flags?.hasBrandProfile ? 'brand ' : ''}${user.flags?.isCurator ? 'curator ' : ''}${user.flags?.isModerator ? 'moderator ' : ''}${user.flags?.isManager ? 'manager ' : ''}</small></div>
          <div class="aw-list-item"><strong>Workspaces</strong><small>${Array.isArray(user.workspaces) && user.workspaces.length ? user.workspaces.map((w) => `${w.title || 'workspace'} (${w.channel_username || 'no @'})`).join(' · ') : '—'}</small></div>
          <div class="aw-list-item"><strong>Curator in</strong><small>${Array.isArray(user.curatorIn) && user.curatorIn.length ? user.curatorIn.map((w) => w.title || 'workspace').join(' · ') : '—'}</small></div>
          <div class="aw-list-item"><strong>Brand profile</strong><small>${user.brandProfile?.brand_name ? escapeHtml(user.brandProfile.brand_name) : '—'}</small></div>
        </div>
        <div class="aw-list-item">
          <strong>Payment summary light</strong>
          <small>total ${model.paymentLight?.total || 0} · applied ${model.paymentLight?.applied || 0} · pending ${model.paymentLight?.pending || 0} · last ${formatDate(model.paymentLight?.lastPaymentAt)}</small>
        </div>
      </section>
      <aside class="aw-surface aw-stack">
        <h2>Admin Note</h2>
        <textarea id="noteText" class="aw-textarea" placeholder="Внутренняя заметка для owner/admin">${escapeHtml(note.text || '')}</textarea>
        <div class="aw-muted">Stored Redis-only, safe v1 write.</div>
        <div class="aw-actions">
          <button class="aw-button" id="saveNoteBtn" data-user-id="${user.id}">Сохранить</button>
          <button class="aw-button secondary" id="clearNoteBtn" data-user-id="${user.id}">Очистить</button>
          <a href="/admin/users" data-link class="aw-button ghost">Назад к списку</a>
        </div>
        <div class="aw-login-help">Updated: ${formatDate(note.updatedAt)}</div>
      </aside>
    </div>
  `, window.__adminSession || {});
}

function runtimeView(model) {
  return shell('Runtime', 'Single snapshot endpoint. No polling, no cron dependency.', `
    <div class="aw-grid-cards">
      <div class="aw-card"><span>DB</span><strong class="aw-status ${model.db?.ok ? 'good' : 'bad'}">${model.db?.ok ? 'OK' : 'FAIL'}</strong></div>
      <div class="aw-card"><span>Redis</span><strong class="aw-status ${model.redis?.ok ? 'good' : 'bad'}">${model.redis?.configured ? (model.redis?.ok ? 'OK' : 'FAIL') : 'OFF'}</strong></div>
      <div class="aw-card"><span>Admin web</span><strong>${model.adminWebConfigured ? 'READY' : 'MISSING'}</strong></div>
      <div class="aw-card"><span>PUBLIC_BASE_URL</span><strong>${model.publicBaseUrl ? 'SET' : 'MISS'}</strong></div>
    </div>
    <section class="aw-surface aw-section">
      <h2>Notes</h2>
      <div class="aw-list">
        ${(Array.isArray(model.notes) && model.notes.length ? model.notes : ['Нет замечаний.']).map((item) => `<div class="aw-list-item">${escapeHtml(item)}</div>`).join('')}
      </div>
    </section>
  `, window.__adminSession || {});
}

async function ensureSession() {
  const res = await api('/api/admin-web/auth/me');
  if (!res.ok) {
    window.__adminSession = null;
    return null;
  }
  window.__adminSession = res.data.session || null;
  return window.__adminSession;
}

async function render() {
  const route = routeInfo();
  if (route.page === 'login') {
    app.innerHTML = loginView(window.__loginState || {});
    bindLogin();
    return;
  }
  const session = await ensureSession();
  if (!session) {
    history.replaceState({}, '', '/admin/login');
    return render();
  }
  if (route.page === 'overview') {
    const res = await api('/api/admin-web/overview');
    app.innerHTML = overviewView(res.data.data || {});
  } else if (route.page === 'users') {
    const state = window.__usersState || { q: '', segment: 'all' };
    const params = new URLSearchParams({ q: state.q || '', segment: state.segment || 'all', limit: '20', page: '0' });
    const res = await api(`/api/admin-web/users?${params}`);
    app.innerHTML = usersView(res.data.data || { items: [] });
  } else if (route.page === 'userDetail') {
    const res = await api(`/api/admin-web/user?id=${encodeURIComponent(route.userId)}`);
    if (!res.ok) {
      app.innerHTML = shell('User not found', 'Проверь user_id и попробуй снова.', `<div class="aw-surface aw-empty">User card not found.</div>`, session);
    } else {
      app.innerHTML = userDetailView(res.data.data || {});
    }
  } else if (route.page === 'runtime') {
    const res = await api('/api/admin-web/runtime');
    app.innerHTML = runtimeView(res.data.data || {});
  }
  bindShell();
}

function bindLinks() {
  app.querySelectorAll('[data-link]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const href = link.getAttribute('href');
      if (!href) return;
      history.pushState({}, '', href);
      render();
    });
  });
}

function bindShell() {
  bindLinks();
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await api('/api/admin-web/auth/logout', { method: 'POST' });
    history.replaceState({}, '', '/admin/login');
    window.__loginState = {};
    render();
  });
  document.getElementById('refreshBtn')?.addEventListener('click', () => render());
  document.getElementById('applyUsersFilters')?.addEventListener('click', () => {
    window.__usersState = {
      q: document.getElementById('usersSearch')?.value || '',
      segment: document.getElementById('usersSegment')?.value || 'all',
    };
    render();
  });
  app.querySelectorAll('[data-user-row]').forEach((row) => {
    row.addEventListener('click', () => {
      const id = row.getAttribute('data-user-row');
      history.pushState({}, '', `/admin/users/${id}`);
      render();
    });
  });
  document.getElementById('saveNoteBtn')?.addEventListener('click', async () => {
    const userId = document.getElementById('saveNoteBtn').getAttribute('data-user-id');
    const text = document.getElementById('noteText')?.value || '';
    const res = await api('/api/admin-web/user-note', { method: 'POST', body: JSON.stringify({ userId, action: 'set', text }) });
    if (!res.ok) alert(`Не удалось сохранить note: ${res.data?.error || 'unknown'}`);
    else render();
  });
  document.getElementById('clearNoteBtn')?.addEventListener('click', async () => {
    const userId = document.getElementById('clearNoteBtn').getAttribute('data-user-id');
    const res = await api('/api/admin-web/user-note', { method: 'POST', body: JSON.stringify({ userId, action: 'clear' }) });
    if (!res.ok) alert(`Не удалось очистить note: ${res.data?.error || 'unknown'}`);
    else render();
  });
}

function bindLogin() {
  document.getElementById('startLoginBtn')?.addEventListener('click', async () => {
    const secret = document.getElementById('secretInput')?.value || '';
    const res = await api('/api/admin-web/auth/start', { method: 'POST', body: JSON.stringify({ secret }) });
    if (!res.ok) {
      window.__loginState = { error: res.data?.error || 'login_failed' };
      return render();
    }
    window.__loginState = { challengeId: res.data.challengeId };
    render();
  });
  document.getElementById('verifyCodeBtn')?.addEventListener('click', async () => {
    const challengeId = window.__loginState?.challengeId || '';
    const code = document.getElementById('otpInput')?.value || '';
    const res = await api('/api/admin-web/auth/verify-code', { method: 'POST', body: JSON.stringify({ challengeId, code }) });
    if (!res.ok) {
      window.__loginState = { challengeId, error: res.data?.error || 'invalid_code' };
      return render();
    }
    history.replaceState({}, '', '/admin');
    window.__loginState = {};
    render();
  });
  document.getElementById('checkStatusBtn')?.addEventListener('click', async () => {
    const challengeId = window.__loginState?.challengeId || '';
    if (!challengeId) return;
    const res = await api(`/api/admin-web/auth/status?challengeId=${encodeURIComponent(challengeId)}`);
    if (!res.ok) {
      window.__loginState = { challengeId, error: res.data?.error || 'status_failed' };
      return render();
    }
    if (res.data?.status === 'approved') {
      history.replaceState({}, '', '/admin');
      window.__loginState = {};
      return render();
    }
    if (res.data?.status === 'denied') {
      window.__loginState = { error: 'Вход отклонён в Telegram.' };
      return render();
    }
    window.__loginState = { challengeId, error: 'Approve ещё не подтверждён. Попробуй снова.' };
    render();
  });
}

window.addEventListener('popstate', () => render());
render();
