const app = document.getElementById('app');

const BRAND_LOGO = '/assets/brand/collabka-mark-blue.png';
const ADMIN_OPERATOR_REFRESH_MODE = 'manual refresh only';

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

function parseFilenameFromDisposition(value) {
  const header = String(value || '');
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) {
    try { return decodeURIComponent(utf8[1]); } catch {}
  }
  const plain = header.match(/filename="?([^";]+)"?/i);
  return plain?.[1] ? plain[1] : '';
}

async function downloadCsv(url, fallbackName = 'export.csv') {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || 'download_failed');
  }
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = parseFilenameFromDisposition(res.headers.get('content-disposition')) || fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1500);
}

async function copyTextToClipboard(text) {
  const value = String(text || '');
  if (!value) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {}
  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', 'readonly');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  area.style.pointerEvents = 'none';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch {}
  area.remove();
  return ok;
}

function getUsersBasketMap() {
  if (!(window.__usersBasket instanceof Map)) window.__usersBasket = new Map();
  return window.__usersBasket;
}

function basketCount() {
  return getUsersBasketMap().size;
}

function isUserInBasket(userId) {
  return getUsersBasketMap().has(Number(userId || 0) || 0);
}

function setUsersBasketItem(item, checked) {
  const basket = getUsersBasketMap();
  const userId = Number(item?.userId || 0) || 0;
  if (!userId) return;
  if (checked) basket.set(userId, {
    userId,
    tgId: Number(item?.tgId || 0) || 0,
    username: String(item?.username || '').trim(),
    segment: String(item?.segment || '').trim(),
  });
  else basket.delete(userId);
}

function getUsersBasketIds() {
  return Array.from(getUsersBasketMap().keys()).sort((a, b) => a - b);
}

function clearUsersBasket() {
  getUsersBasketMap().clear();
}

function normalizeUsersPinIds(raw = []) {
  const values = Array.isArray(raw) ? raw : String(raw || '').split(',');
  const out = [];
  for (const value of values) {
    const num = Number(value || 0) || 0;
    if (!num || out.includes(num)) continue;
    out.push(num);
    if (out.length >= 5) break;
  }
  return out;
}

function getUsersPinIds() {
  return normalizeUsersPinIds(getUsersState().pinIds || []);
}

function isUserPinned(userId) {
  return getUsersPinIds().includes(Number(userId || 0) || 0);
}

function setUsersPinIds(pinIds = []) {
  window.__usersState = normalizeUsersState({ ...getUsersState(), pinIds: normalizeUsersPinIds(pinIds), page: 0 });
}

function toggleUsersPin(item = {}) {
  const userId = Number(item?.userId || 0) || 0;
  if (!userId) return { ok: false, reason: 'user_id_required' };
  const current = getUsersPinIds();
  if (current.includes(userId)) {
    setUsersPinIds(current.filter((value) => value !== userId));
    return { ok: true, pinned: false };
  }
  if (current.length >= 5) return { ok: false, reason: 'pin_limit' };
  setUsersPinIds([...current, userId]);
  return { ok: true, pinned: true };
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU');
}

function formatDatePart(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU');
}

function formatTimePart(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function segmentLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return ({ brand: 'бренд', creator: 'креатор', curator: 'куратор', manager: 'менеджер', user: 'пользователь' })[key] || (key || 'пользователь');
}

function signalLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return ({
    creator: 'creator',
    brand: 'brand',
    curator: 'curator',
    manager: 'manager',
    moderator: 'moderator',
    workspace_connected: 'workspace connected',
    channel_connected: 'channel connected',
  })[key] || key || '—';
}

function runtimeStateClass(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'ok' || key === 'configured') return 'good';
  if (key === 'degraded' || key === 'warning') return 'warn';
  if (key === 'missing' || key === 'error') return 'bad';
  return '';
}

function runtimeStateLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return ({ ok: 'ОК', degraded: 'Нужна проверка', missing: 'Не настроено', unknown: 'Статус неизвестен' })[key] || (key || '—');
}

function configPresenceLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return ({ configured: 'configured', missing: 'missing', optional: 'optional', not_enabled: 'not enabled' })[key] || (key || '—');
}

function controlToneClass(item = {}) {
  const tone = String(item?.tone || item?.state || '').trim().toLowerCase();
  if (tone === 'good' || tone === 'on') return 'is-good';
  if (tone === 'warn' || tone === 'incident') return 'is-warn';
  if (tone === 'bad' || tone === 'off') return 'is-off';
  return '';
}

function controlAuditActorLabel(item = {}) {
  const username = String(item?.actorUsername || '').trim();
  if (username) return `@${username.replace(/^@/, '')}`;
  const tgId = Number(item?.actorTgId || 0) || 0;
  if (tgId > 0) return `tg:${tgId}`;
  return '—';
}

function controlAuditValueLabel(value) {
  if (value === true) return 'ON';
  if (value === false) return 'OFF';
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function controlAuditSummary(item = {}) {
  const label = String(item?.label || item?.controlId || 'Control');
  return `${label}: ${controlAuditValueLabel(item?.previousValue)} → ${controlAuditValueLabel(item?.nextValue)}`;
}

function renderControlStatusBar() {
  const controlSurface = window.__controlSurface || {};
  const items = Array.isArray(controlSurface.items) ? controlSurface.items : [];
  const audit = Array.isArray(controlSurface.audit) ? controlSurface.audit : [];
  if (!items.length) return '';
  const last = audit[0] || null;
  return `
    <section class="aw-statusbar">
      <div class="aw-statusbar-head">
        <strong>Control plane</strong>
        <span>ручное обновление · единый runtime source</span>
      </div>
      <div class="aw-statusbar-chips">
        ${items.map((item) => `
          <div class="aw-control-chip ${controlToneClass(item)}">
            <span>${escapeHtml(item.shortLabel || item.label || 'Control')}</span>
            <strong>${escapeHtml(item.stateLabel || (item.value ? 'ON' : 'OFF'))}</strong>
          </div>
        `).join('')}
      </div>
      ${last ? `<div class="aw-statusbar-foot">Последнее изменение: <strong>${escapeHtml(controlAuditSummary(last))}</strong> · ${escapeHtml(controlAuditActorLabel(last))} · ${escapeHtml(formatDate(last.ts))}</div>` : ''}
    </section>
  `;
}

function renderControlSurfaceSection() {
  const controlSurface = window.__controlSurface || {};
  const items = Array.isArray(controlSurface.items) ? controlSurface.items : [];
  const audit = Array.isArray(controlSurface.audit) ? controlSurface.audit : [];
  if (!items.length) return '';
  return `
    <div class="aw-split aw-section aw-control-layout">
      <section class="aw-surface aw-stack">
        <h2>Operator control surface</h2>
        <div class="aw-list">
          ${items.map((item) => `
            <div class="aw-list-item aw-control-list-item">
              <div class="aw-control-list-head">
                <strong>${escapeHtml(item.label || item.shortLabel || 'Control')}</strong>
                <span class="aw-status ${String(item.tone || '').trim().toLowerCase()}">${escapeHtml(item.stateLabel || (item.value ? 'ON' : 'OFF'))}</span>
              </div>
              <small>Scope: ${escapeHtml(item.scope || 'system')} · changed by ${escapeHtml(item.changedBy || '—')} · ${escapeHtml(formatDate(item.changedAt))}</small>
              ${item.id === 'payments_fallback' ? `<small>env ${item.envEnabled ? 'ON' : 'OFF'} · runtime ${escapeHtml(item.runtimeLabel || 'OFF')}</small>` : ''}
            </div>
          `).join('')}
        </div>
      </section>
      <section class="aw-surface aw-stack">
        <h2>Последние переключения</h2>
        <div class="aw-list">
          ${audit.length ? audit.map((item) => `
            <div class="aw-list-item">
              <strong>${escapeHtml(controlAuditSummary(item))}</strong>
              <small>${escapeHtml(controlAuditActorLabel(item))} · ${escapeHtml(formatDate(item.ts))}${item.note ? ` · ${escapeHtml(item.note)}` : ''}</small>
            </div>
          `).join('') : '<div class="aw-empty">Пока пусто.</div>'}
        </div>
      </section>
    </div>
  `;
}

function paymentStatusClass(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'success') return 'good';
  if (key === 'pending') return 'warn';
  if (key === 'failed' || key === 'fallback') return 'bad';
  return '';
}

function paymentStatusLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return ({ success: 'success', pending: 'pending', failed: 'failed', fallback: 'fallback', unknown: 'unknown' })[key] || (key || 'unknown');
}

function paymentFollowUpClass(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'ok') return 'good';
  if (key === 'watch' || key === 'review') return 'warn';
  if (key === 'urgent') return 'bad';
  return '';
}

function paymentFollowUpLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return ({ ok: 'без действий', watch: 'наблюдать', review: 'проверить', urgent: 'срочно' })[key] || (key || '—');
}


function paymentDetailBackHref() {
  try {
    const params = new URLSearchParams(location.search);
    const back = params.get('back');
    if (back && String(back).startsWith('/admin/payments')) return back;
  } catch {}
  return '/admin/payments';
}

function userDetailBackHref() {
  try {
    const params = new URLSearchParams(location.search);
    const back = params.get('back');
    if (back && String(back).startsWith('/admin/users')) return back;
  } catch {}
  return buildUsersListHref(getUsersState());
}

function warningTone(level) {
  const key = String(level || '').trim().toLowerCase();
  if (key === 'error') return 'aw-status bad';
  if (key === 'warning' || key === 'warn') return 'aw-status warn';
  if (key === 'info') return 'aw-status good';
  return 'aw-status';
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
  if (parts[1] === 'payments' && parts[2]) return { page: 'paymentDetail', paymentId: parts[2] };
  if (parts[1] === 'payments') return { page: 'payments' };
  if (parts[1] === 'comms') return { page: 'comms' };
  if (parts[1] === 'founder') return { page: 'founder' };
  return { page: 'overview' };
}

const LOGIN_STATE_KEY = 'collabka_admin_login_state_v1';
let loginStatusTimer = null;

function authErrorLabel(code) {
  const key = String(code || '').trim().toLowerCase();
  return ({
    invalid_secret: 'Неверный admin secret.',
    admin_web_disabled: 'Web-админка сейчас отключена.',
    admin_web_not_configured: 'Web-админка настроена не полностью.',
    admin_web_secret_missing: 'ADMIN_WEB_SECRET не задан.',
    approvers_not_configured: 'Не настроены approver TG ids.',
    telegram_notify_failed: 'Не удалось отправить запрос подтверждения в Telegram.',
    challenge_and_code_required: 'Нужны challenge и одноразовый код.',
    invalid_code: 'Неверный одноразовый код.',
    challenge_not_found: 'Challenge не найден. Запроси новый вход.',
    challenge_expired: 'Challenge истёк. Запроси новый вход.',
    challenge_not_pending: 'Этот challenge уже обработан. Проверь approve или запроси новый вход.',
    challenge_id_required: 'Не найден challenge для проверки.',
    denied: 'Вход отклонён в Telegram.',
    status_failed: 'Не удалось проверить статус approve.',
    admin_web_login_paused: 'Новые web-login запросы временно остановлены оператором.',
    login_failed: 'Не удалось запросить вход.',
  })[key] || (key ? `Ошибка: ${key}` : 'Произошла ошибка входа.');
}

function getLoginState() {
  return window.__loginState || {};
}

function readPersistedLoginState() {
  let stored = {};
  try {
    stored = JSON.parse(sessionStorage.getItem(LOGIN_STATE_KEY) || '{}') || {};
  } catch {
    stored = {};
  }
  const params = new URLSearchParams(location.search);
  const challengeId = String(params.get('challenge') || stored.challengeId || '').trim();
  const merged = { ...stored, challengeId };
  if (challengeId) window.__loginState = merged;
  else if (!window.__loginState) window.__loginState = {};
  return getLoginState();
}

function writeLoginState(state = {}) {
  const next = { ...(state || {}) };
  if (!next.challengeId) delete next.challengeId;
  if (!next.error) delete next.error;
  window.__loginState = next;
  try {
    if (Object.keys(next).length) sessionStorage.setItem(LOGIN_STATE_KEY, JSON.stringify(next));
    else sessionStorage.removeItem(LOGIN_STATE_KEY);
  } catch {}
  const params = new URLSearchParams(location.search);
  if (next.challengeId) params.set('challenge', next.challengeId);
  else params.delete('challenge');
  const q = params.toString();
  const target = `/admin/login${q ? `?${q}` : ''}`;
  if (`${location.pathname}${location.search}` !== target) history.replaceState({}, '', target);
}

function clearLoginState() {
  writeLoginState({});
}

function stopLoginStatusPolling() {
  if (loginStatusTimer) {
    window.clearInterval(loginStatusTimer);
    loginStatusTimer = null;
  }
}

async function checkLoginChallengeStatus({ silent = false } = {}) {
  const challengeId = String(getLoginState()?.challengeId || '').trim();
  if (!challengeId) return { ok: false, error: 'challenge_id_required' };
  const res = await api(`/api/admin-web-auth?action=status&challengeId=${encodeURIComponent(challengeId)}`);
  if (!res.ok) {
    const error = authErrorLabel(res.data?.error || 'status_failed');
    if (!silent) {
      writeLoginState({ challengeId, error });
      render();
    }
    return { ok: false, error };
  }
  const status = String(res.data?.status || 'pending');
  if (status === 'approved') {
    stopLoginStatusPolling();
    clearLoginState();
    history.replaceState({}, '', '/admin');
    await render();
    return { ok: true, status };
  }
  if (status === 'denied') {
    stopLoginStatusPolling();
    writeLoginState({ challengeId, error: authErrorLabel('denied') });
    if (!silent) render();
    return { ok: false, status };
  }
  if (status === 'expired') {
    stopLoginStatusPolling();
    writeLoginState({ challengeId, error: authErrorLabel('challenge_expired') });
    if (!silent) render();
    return { ok: false, status };
  }
  if (!silent) {
    writeLoginState({ challengeId, error: 'Approve ещё не подтверждён. Окно само проверяет статус каждые несколько секунд.' });
    render();
  }
  return { ok: true, status };
}

function startLoginStatusPolling({ immediate = false } = {}) {
  stopLoginStatusPolling();
  const challengeId = String(getLoginState()?.challengeId || '').trim();
  if (!challengeId) return;
  if (immediate) {
    Promise.resolve().then(() => checkLoginChallengeStatus({ silent: true })).catch(() => {});
  }
  loginStatusTimer = window.setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    checkLoginChallengeStatus({ silent: true });
  }, 2500);
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
          <div class="aw-nav-group-label">Оператор</div>
          ${navLink('/admin', 'Overview', route.page === 'overview')}
          ${navLink(route.page === 'userDetail' ? userDetailBackHref() : buildUsersListHref(getUsersState()), 'Users', route.page === 'users' || route.page === 'userDetail')}
          ${navLink('/admin/runtime', 'Runtime', route.page === 'runtime')}
          ${navLink('/admin/payments', 'Payments', route.page === 'payments' || route.page === 'paymentDetail')}
          ${navLink('/admin/comms', 'Comms', route.page === 'comms')}
          ${session?.isFounder ? `<div class="aw-nav-group-label">Founder</div>${navLink('/admin/founder', 'Founder', route.page === 'founder')}` : ''}
        </nav>
      </aside>
      <main class="aw-main">
        <div class="aw-topbar">
          <div class="aw-topbar-left">
            <span class="aw-chip">${escapeHtml(title)}</span>
            <span class="aw-chip">mode · ${session?.isFounder ? 'founder' : 'operator'}</span>
          </div>
          <div class="aw-topbar-right">
            <span class="aw-chip">TG ${Number(session?.actorTgId || 0) || 'fallback'}</span>
            <button class="aw-button secondary" id="refreshBtn">Обновить</button>
            <button class="aw-button ghost" id="logoutBtn">Выйти</button>
          </div>
        </div>
        ${renderControlStatusBar()}
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
  const hasChallenge = !!state.challengeId;
  const stepTitle = hasChallenge ? 'Шаг 2 — Telegram approve / code' : 'Шаг 1 — admin secret';
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
          <div class="aw-step-chip">${escapeHtml(stepTitle)}</div>
          ${state.error ? `<div class="aw-error">${escapeHtml(state.error)}</div>` : ''}
          ${hasChallenge ? `
            <div class="aw-info">Secret уже принят. Снова вводить его не нужно: подтверди вход в Telegram или вставь одноразовый код.</div>
            <div class="aw-login-phase aw-login-phase-verify">
              <div class="aw-login-meta">
                <span class="aw-login-meta-label">Challenge</span>
                <code id="challengeCodeBox">${escapeHtml(state.challengeId || '')}</code>
              </div>
              <p class="aw-login-help">Оставь это окно открытым. После approve сессия подтянется автоматически. Если переходишь из Telegram, вход должен закрыться без повторного ввода secret.</p>
              <input id="otpInput" class="aw-input" placeholder="Telegram code" autocomplete="one-time-code" />
              <div class="aw-actions">
                <button class="aw-button secondary" id="verifyCodeBtn">Ввести код</button>
                <button class="aw-button ghost" id="checkStatusBtn">Проверить approve</button>
              </div>
              <div class="aw-actions aw-actions-topline">
                <button class="aw-button ghost" id="newChallengeBtn">Запросить новый вход</button>
                <button class="aw-button ghost" id="resetChallengeBtn">Сбросить challenge</button>
              </div>
            </div>
          ` : `
            <div class="aw-login-phase aw-login-phase-request">
              <input id="secretInput" class="aw-input" placeholder="Admin secret" autocomplete="off" />
              <div class="aw-actions">
                <button class="aw-button" id="startLoginBtn">Запросить вход</button>
              </div>
            </div>
          `}
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
      <a href="/admin/payments" data-link class="aw-card aw-card-link"><span>Payment alerts</span><strong>${cards.paymentAlerts || 0}</strong><small>Открыть payment surface</small></a>
      <div class="aw-card"><span>Runtime warnings</span><strong>${cards.runtimeWarnings || 0}</strong></div>
    </div>
    <div class="aw-actions aw-overview-links">
      <a href="/admin/payments" data-link class="aw-button ghost">Payments surface</a>
      <a href="/admin/comms" data-link class="aw-button ghost">Comms workspace</a>
    </div>
    ${renderControlSurfaceSection()}
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

function usersBulkModeLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return ({ tg_ids: 'tg_id', usernames: 'usernames', user_ids: 'user_id' })[key] || (key || 'данные');
}

function basketSourceLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return key === 'basket' ? 'корзина' : key === 'pins' ? 'pinned set' : 'текущий фильтр';
}

const USERS_STATE_DEFAULTS = {
  q: '',
  segment: 'all',
  planState: 'all',
  creditsState: 'all',
  channelState: 'all',
  activityWindow: 'all',
  paymentsState: 'all',
  sortBy: 'created_desc',
  cohortView: 'all',
  page: 0,
  pageSize: 20,
  pinIds: [],
};

function normalizeUsersState(raw = {}) {
  const state = raw || {};
  const page = Math.max(0, Number(state.page) || 0);
  const pageSize = Math.max(10, Math.min(50, Number(state.pageSize || state.limit) || 20));
  return {
    q: String(state.q || '').trim(),
    segment: String(state.segment || USERS_STATE_DEFAULTS.segment).trim() || USERS_STATE_DEFAULTS.segment,
    planState: String(state.planState || state.plan_state || USERS_STATE_DEFAULTS.planState).trim() || USERS_STATE_DEFAULTS.planState,
    creditsState: String(state.creditsState || state.credits_state || USERS_STATE_DEFAULTS.creditsState).trim() || USERS_STATE_DEFAULTS.creditsState,
    channelState: String(state.channelState || state.channel_state || USERS_STATE_DEFAULTS.channelState).trim() || USERS_STATE_DEFAULTS.channelState,
    activityWindow: String(state.activityWindow || state.activity_window || USERS_STATE_DEFAULTS.activityWindow).trim() || USERS_STATE_DEFAULTS.activityWindow,
    paymentsState: String(state.paymentsState || state.payments_state || USERS_STATE_DEFAULTS.paymentsState).trim() || USERS_STATE_DEFAULTS.paymentsState,
    sortBy: String(state.sortBy || state.sort_by || USERS_STATE_DEFAULTS.sortBy).trim() || USERS_STATE_DEFAULTS.sortBy,
    cohortView: String(state.cohortView || state.cohort_view || USERS_STATE_DEFAULTS.cohortView).trim() || USERS_STATE_DEFAULTS.cohortView,
    page,
    pageSize,
    pinIds: normalizeUsersPinIds(state.pinIds || state.pin_ids || state.pins || USERS_STATE_DEFAULTS.pinIds),
  };
}

function getUsersState() {
  return normalizeUsersState(window.__usersState || {});
}

function readUsersStateFromUrl(search = location.search) {
  try {
    const params = new URLSearchParams(search || '');
    const next = {};
    if (params.has('q')) next.q = params.get('q') || '';
    if (params.has('segment')) next.segment = params.get('segment') || 'all';
    if (params.has('plan_state')) next.planState = params.get('plan_state') || 'all';
    if (params.has('credits_state')) next.creditsState = params.get('credits_state') || 'all';
    if (params.has('channel_state')) next.channelState = params.get('channel_state') || 'all';
    if (params.has('activity_window')) next.activityWindow = params.get('activity_window') || 'all';
    if (params.has('payments_state')) next.paymentsState = params.get('payments_state') || 'all';
    if (params.has('sort_by')) next.sortBy = params.get('sort_by') || 'created_desc';
    if (params.has('cohort_view')) next.cohortView = params.get('cohort_view') || 'all';
    if (params.has('page')) next.page = params.get('page') || '0';
    if (params.has('limit')) next.pageSize = params.get('limit') || '20';
    if (params.has('pins')) next.pinIds = params.get('pins') || '';
    return normalizeUsersState(next);
  } catch {
    return normalizeUsersState({});
  }
}

function buildUsersListHref(state = getUsersState(), { absolute = false } = {}) {
  const normalized = normalizeUsersState(state);
  const params = new URLSearchParams();
  if (normalized.q) params.set('q', normalized.q);
  if (normalized.segment !== USERS_STATE_DEFAULTS.segment) params.set('segment', normalized.segment);
  if (normalized.planState !== USERS_STATE_DEFAULTS.planState) params.set('plan_state', normalized.planState);
  if (normalized.creditsState !== USERS_STATE_DEFAULTS.creditsState) params.set('credits_state', normalized.creditsState);
  if (normalized.channelState !== USERS_STATE_DEFAULTS.channelState) params.set('channel_state', normalized.channelState);
  if (normalized.activityWindow !== USERS_STATE_DEFAULTS.activityWindow) params.set('activity_window', normalized.activityWindow);
  if (normalized.paymentsState !== USERS_STATE_DEFAULTS.paymentsState) params.set('payments_state', normalized.paymentsState);
  if (normalized.sortBy !== USERS_STATE_DEFAULTS.sortBy) params.set('sort_by', normalized.sortBy);
  if (normalized.cohortView !== USERS_STATE_DEFAULTS.cohortView) params.set('cohort_view', normalized.cohortView);
  if (normalized.page > 0) params.set('page', String(normalized.page));
  if (normalized.pageSize !== USERS_STATE_DEFAULTS.pageSize) params.set('limit', String(normalized.pageSize));
  if (normalized.pinIds.length) params.set('pins', normalized.pinIds.join(','));
  const relative = `/admin/users${params.toString() ? `?${params.toString()}` : ''}`;
  if (!absolute) return relative;
  try {
    return new URL(relative, location.origin).toString();
  } catch {
    return `${location.origin}${relative}`;
  }
}

function syncUsersUrlState(state = getUsersState(), { replace = true } = {}) {
  const target = buildUsersListHref(state);
  const current = `${location.pathname}${location.search}`;
  if (current === target) return target;
  const method = replace ? 'replaceState' : 'pushState';
  history[method]({}, '', target);
  return target;
}

function hydrateUsersStateFromLocation() {
  const base = getUsersState();
  const urlState = readUsersStateFromUrl(location.search);
  window.__usersState = normalizeUsersState({ ...base, ...urlState });
  return getUsersState();
}

async function copyUsersWorkingViewUrl() {
  const href = buildUsersListHref(readUsersControlsState(), { absolute: true });
  const copied = await copyTextToClipboard(href);
  if (!copied) {
    alert('Не удалось скопировать ссылку на текущий users slice.');
    return;
  }
  alert('Ссылка на текущий users slice скопирована.');
}

function activeWindowLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === '7d') return 'active 7d';
  if (key === '30d') return 'active 30d';
  if (key === '90d') return 'active 90d';
  return 'no recent signal';
}

function usersSortMeta(value = 'created_desc') {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'activity_desc') return { label: 'Свежие сверху', detail: 'Сортировка по последней активности ↓' };
  if (key === 'activity_asc') return { label: 'Тихие сверху', detail: 'Сначала пользователи без свежих сигналов' };
  if (key === 'payments_desc') return { label: 'Платящие сверху', detail: 'Сортировка по числу платежей ↓' };
  if (key === 'problem_desc') return { label: 'Проблемные сверху', detail: 'Banned / paid-no-channel / plan-no-channel / stale credits' };
  return { label: 'Новые сверху', detail: 'Сортировка по created_at ↓' };
}

function usersPriorityPresets() {
  return [
    { id: 'created_desc', label: 'Новые' },
    { id: 'activity_desc', label: 'Свежие' },
    { id: 'payments_desc', label: 'Платящие' },
    { id: 'activity_asc', label: 'Тихие' },
    { id: 'problem_desc', label: 'Проблемные' },
  ];
}

function usersCohortMeta(value = 'all') {
  const key = String(value || 'all').trim().toLowerCase();
  if (key === 'dormant_payers') return { label: 'Dormant payers', detail: 'Есть платежи, но нет свежего сигнала 30+ дней' };
  if (key === 'paid_no_channel') return { label: 'Paid no channel', detail: 'Платили, но канал так и не подключён' };
  if (key === 'plan_no_channel') return { label: 'Plan no channel', detail: 'Есть план, но канал не подключён' };
  if (key === 'fresh_brands') return { label: 'Fresh brands', detail: 'Бренды с живым сигналом за последние 30 дней' };
  if (key === 'quiet_creators') return { label: 'Quiet creators', detail: 'Креаторы без свежего сигнала 30+ дней' };
  return { label: 'Все пользователи', detail: 'Без предустановленного cohort view' };
}

function usersCohortPresets() {
  return [
    { id: 'all', label: 'Все' },
    { id: 'dormant_payers', label: 'Dormant payers' },
    { id: 'paid_no_channel', label: 'Paid no channel' },
    { id: 'plan_no_channel', label: 'Plan no channel' },
    { id: 'fresh_brands', label: 'Fresh brands' },
    { id: 'quiet_creators', label: 'Quiet creators' },
  ];
}

function usersCohortCounterCards(counters = {}, currentCohortView = 'all') {
  const presets = usersCohortPresets();
  return presets.map((item) => {
    const value = Math.max(0, Number(counters?.[item.id] || 0));
    const meta = usersCohortMeta(item.id);
    return `
      <button class="aw-cohort-counter-card ${currentCohortView === item.id ? 'is-active' : ''}" data-users-cohort="${escapeHtml(item.id)}">
        <span>${escapeHtml(meta.label)}</span>
        <strong>${value}</strong>
        <small>${escapeHtml(meta.detail)}</small>
      </button>
    `;
  }).join('');
}

function usersOperatorPresets() {
  return [
    {
      id: 'all_new',
      label: 'Все · новые',
      detail: 'Чистый базовый срез без cohort/filter хвостов, чтобы быстро вернуться к общей картине.',
      state: {
        q: '',
        segment: 'all',
        planState: 'all',
        creditsState: 'all',
        channelState: 'all',
        activityWindow: 'all',
        paymentsState: 'all',
        sortBy: 'created_desc',
        cohortView: 'all',
      },
    },
    {
      id: 'dormant_payers_followup',
      label: 'Dormant payers',
      detail: 'Платили, но давно не было сигнала. Удобно для ручного follow-up и возврата.',
      state: {
        q: '',
        segment: 'all',
        planState: 'all',
        creditsState: 'all',
        channelState: 'all',
        activityWindow: 'all',
        paymentsState: 'with_payments',
        sortBy: 'payments_desc',
        cohortView: 'dormant_payers',
      },
    },
    {
      id: 'paid_no_channel_followup',
      label: 'Paid no channel',
      detail: 'Есть платежи, но канал не подключён. Быстрый ops-срез для activation gap.',
      state: {
        q: '',
        segment: 'all',
        planState: 'all',
        creditsState: 'all',
        channelState: 'no_channel',
        activityWindow: 'all',
        paymentsState: 'with_payments',
        sortBy: 'problem_desc',
        cohortView: 'paid_no_channel',
      },
    },
    {
      id: 'plan_no_channel_followup',
      label: 'Plan no channel',
      detail: 'Есть план, но канал не подключён. Чистый рабочий срез для brand activation.',
      state: {
        q: '',
        segment: 'brands',
        planState: 'with_plan',
        creditsState: 'all',
        channelState: 'no_channel',
        activityWindow: 'all',
        paymentsState: 'all',
        sortBy: 'problem_desc',
        cohortView: 'plan_no_channel',
      },
    },
    {
      id: 'fresh_brands_watch',
      label: 'Fresh brands',
      detail: 'Живые бренды за 30 дней. Хорошо для проверки входящего потока и handoff-ready сегмента.',
      state: {
        q: '',
        segment: 'brands',
        planState: 'all',
        creditsState: 'all',
        channelState: 'all',
        activityWindow: '30d',
        paymentsState: 'all',
        sortBy: 'activity_desc',
        cohortView: 'fresh_brands',
      },
    },
    {
      id: 'quiet_creators_watch',
      label: 'Quiet creators',
      detail: 'Креаторы без свежих сигналов. Удобно для reactivation и ручного отбора.',
      state: {
        q: '',
        segment: 'creators',
        planState: 'all',
        creditsState: 'all',
        channelState: 'all',
        activityWindow: 'all',
        paymentsState: 'all',
        sortBy: 'activity_asc',
        cohortView: 'quiet_creators',
      },
    },
  ];
}

function usersOperatorPresetMeta(presetId = 'all_new') {
  const key = String(presetId || 'all_new').trim().toLowerCase();
  return usersOperatorPresets().find((item) => item.id === key) || usersOperatorPresets()[0];
}

function detectUsersOperatorPreset(state = {}) {
  const current = {
    q: String(state.q || '').trim(),
    segment: String(state.segment || 'all').trim().toLowerCase(),
    planState: String(state.planState || 'all').trim().toLowerCase(),
    creditsState: String(state.creditsState || 'all').trim().toLowerCase(),
    channelState: String(state.channelState || 'all').trim().toLowerCase(),
    activityWindow: String(state.activityWindow || 'all').trim().toLowerCase(),
    paymentsState: String(state.paymentsState || 'all').trim().toLowerCase(),
    sortBy: String(state.sortBy || 'created_desc').trim().toLowerCase(),
    cohortView: String(state.cohortView || 'all').trim().toLowerCase(),
  };
  const found = usersOperatorPresets().find((preset) => {
    const target = preset.state || {};
    return current.q === String(target.q || '').trim()
      && current.segment === String(target.segment || 'all').trim().toLowerCase()
      && current.planState === String(target.planState || 'all').trim().toLowerCase()
      && current.creditsState === String(target.creditsState || 'all').trim().toLowerCase()
      && current.channelState === String(target.channelState || 'all').trim().toLowerCase()
      && current.activityWindow === String(target.activityWindow || 'all').trim().toLowerCase()
      && current.paymentsState === String(target.paymentsState || 'all').trim().toLowerCase()
      && current.sortBy === String(target.sortBy || 'created_desc').trim().toLowerCase()
      && current.cohortView === String(target.cohortView || 'all').trim().toLowerCase();
  });
  return found?.id || 'custom';
}

function renderUsersOperatorPresetCards(currentPresetId = 'custom') {
  return usersOperatorPresets().map((preset) => `
    <button class="aw-preset-card ${currentPresetId === preset.id ? 'is-active' : ''}" data-users-preset="${escapeHtml(preset.id)}">
      <span class="aw-preset-kicker">Preset</span>
      <strong>${escapeHtml(preset.label)}</strong>
      <small>${escapeHtml(preset.detail)}</small>
    </button>
  `).join('');
}


function usersActionSliceLabel(state = {}) {
  const bits = [];
  const segment = String(state.segment || 'all').trim().toLowerCase();
  if (segment !== 'all') bits.push(segmentLabel(segment));
  if (String(state.cohortView || 'all').trim().toLowerCase() !== 'all') bits.push(usersCohortMeta(state.cohortView).label);
  bits.push(usersSortMeta(state.sortBy || 'created_desc').label);
  if (String(state.planState || 'all') !== 'all') bits.push(String(state.planState || '').replace(/^with_/, '').replace(/^no_/, 'без '));
  if (String(state.creditsState || 'all') !== 'all') bits.push(String(state.creditsState || '').replace(/^with_/, '').replace(/^no_/, 'без '));
  if (String(state.channelState || 'all') !== 'all') bits.push(String(state.channelState || '').replace(/^with_/, '').replace(/^no_/, 'без '));
  if (String(state.paymentsState || 'all') !== 'all') bits.push(String(state.paymentsState || '').replace(/^with_/, '').replace(/^no_/, 'без '));
  if (String(state.activityWindow || 'all') !== 'all') bits.push(activeWindowLabel(state.activityWindow));
  if (String(state.q || '').trim()) bits.push(`поиск: ${String(state.q).trim()}`);
  return bits.join(' · ') || 'Все пользователи';
}

function buildUsersPaginationMeta(model = {}) {
  const raw = model.pagination || {};
  const pageSize = Math.max(10, Math.min(50, Number(raw.pageSize || model.limit || 20) || 20));
  const total = Math.max(0, Number(raw.total || 0) || 0);
  const totalPages = Math.max(1, Number(raw.totalPages || Math.ceil((total || 0) / pageSize) || 1) || 1);
  const page = Math.max(0, Math.min(totalPages - 1, Number(raw.page || model.page || 0) || 0));
  const visibleCount = Math.max(0, Number(raw.visibleCount || (Array.isArray(model.items) ? model.items.length : 0)) || 0);
  const fromRow = total > 0 ? Math.max(1, Number(raw.fromRow || (page * pageSize) + 1) || 1) : 0;
  const toRow = total > 0 ? Math.max(fromRow, Number(raw.toRow || Math.min(total, (page * pageSize) + visibleCount)) || fromRow) : 0;
  return {
    page,
    pageSize,
    total,
    totalPages,
    visibleCount,
    fromRow,
    toRow,
    hasPrev: page > 0,
    hasNext: page + 1 < totalPages,
    pageLabel: `${page + 1} / ${totalPages}`,
  };
}

function renderUsersPaginationControls(meta = {}, position = 'top') {
  const pageSize = Math.max(10, Math.min(50, Number(meta.pageSize || 20) || 20));
  const page = Math.max(0, Number(meta.page || 0) || 0);
  const pageLabel = String(meta.pageLabel || `${page + 1} / ${Math.max(1, Number(meta.totalPages || 1) || 1)}`);
  const total = Math.max(0, Number(meta.total || 0) || 0);
  const fromRow = Math.max(0, Number(meta.fromRow || 0) || 0);
  const toRow = Math.max(0, Number(meta.toRow || 0) || 0);
  const visibleCount = Math.max(0, Number(meta.visibleCount || 0) || 0);
  return `
    <section class="aw-users-pagination aw-users-pagination-${escapeHtml(position)}" data-total-pages="${Math.max(1, Number(meta.totalPages || 1) || 1)}">
      <div class="aw-users-pagination-meta">
        <strong>Страница ${escapeHtml(pageLabel)}</strong>
        <span>${total > 0 ? `Показаны ${fromRow}–${toRow} из ${total}` : 'Результатов нет'} · на экране ${visibleCount}</span>
      </div>
      <div class="aw-users-pagination-controls">
        <label class="aw-pagination-size">
          <span>На странице</span>
          <select class="aw-select inline aw-pagination-select" data-users-page-size>
            ${[20, 35, 50].map((value) => `<option value="${value}" ${pageSize === value ? 'selected' : ''}>${value}</option>`).join('')}
          </select>
        </label>
        <div class="aw-pagination-actions">
          <button class="aw-button ghost" data-users-page-action="first" ${meta.hasPrev ? '' : 'disabled'}>« Первая</button>
          <button class="aw-button ghost" data-users-page-action="prev" ${meta.hasPrev ? '' : 'disabled'}>← Назад</button>
          <button class="aw-button ghost" data-users-page-action="next" ${meta.hasNext ? '' : 'disabled'}>Вперёд →</button>
          <button class="aw-button ghost" data-users-page-action="last" ${meta.hasNext ? '' : 'disabled'}>Последняя »</button>
        </div>
      </div>
    </section>
  `;
}

function usersPlanMeta(item = {}) {
  const plan = String(item?.brandPlan || '').trim();
  if (!plan) return { label: 'без плана', tone: 'is-muted', detail: 'План не активирован' };
  const until = item?.brandPlanUntil ? `до ${formatDate(item.brandPlanUntil)}` : 'Активный план';
  return { label: plan, tone: 'is-accent', detail: until };
}

function usersCreditsMeta(item = {}) {
  const credits = Number(item?.brandCredits || 0);
  if (credits > 0) return { label: `${credits} credits`, tone: 'is-good', detail: 'Есть баланс' };
  return { label: '0 credits', tone: 'is-muted', detail: 'Баланс пуст' };
}

function usersSignalChips(item = {}) {
  const chips = [];
  if (item.flags?.isBanned) chips.push({ label: 'banned', tone: 'is-warn' });
  if (item.flags?.isCreator) chips.push({ label: 'creator', tone: 'is-accent' });
  if (item.flags?.hasBrandProfile) chips.push({ label: 'brand', tone: 'is-soft' });
  if (item.flags?.isModerator) chips.push({ label: 'moderator', tone: 'is-warn' });
  if (item.flags?.isManager) chips.push({ label: 'manager', tone: 'is-soft' });
  if (item.flags?.hasChannel) chips.push({ label: 'channel', tone: 'is-good' });
  if (Number(item?.paymentsCount || 0) > 0) chips.push({ label: `pay x${Math.min(99, Number(item.paymentsCount || 0))}`, tone: 'is-good' });
  if (Number(item?.problemScore || 0) >= 60) chips.push({ label: 'risk', tone: 'is-warn' });
  else if (Number(item?.problemScore || 0) > 0) chips.push({ label: 'attention', tone: 'is-soft' });
  return chips;
}

function usersSignalsDetail(item = {}) {
  const parts = [];
  parts.push(item.flags?.hasChannel ? 'Канал подключён' : 'Канал не подключён');
  parts.push(Number(item?.paymentsCount || 0) > 0 ? `Платежей ${Number(item.paymentsCount || 0)}` : 'Платежей нет');
  if (Number(item?.problemScore || 0) > 0) parts.push(`ops-risk ${Number(item.problemScore || 0)}`);
  if (item.flags?.isBanned) parts.push('Статус: banned');
  return parts.join(' · ');
}

function usersActivityMeta(item = {}) {
  if (!item?.lastKnownActivityAt) {
    return {
      label: 'нет сигнала',
      tone: 'is-muted',
      detail: 'Недавняя активность не найдена',
    };
  }
  const then = new Date(item.lastKnownActivityAt);
  const thenTs = then.getTime();
  if (!Number.isFinite(thenTs)) {
    return {
      label: 'нет сигнала',
      tone: 'is-muted',
      detail: 'Дата активности повреждена',
    };
  }
  const ageMs = Math.max(0, Date.now() - thenTs);
  const ageHours = ageMs / 3600000;
  const ageDays = ageMs / 86400000;
  let label = 'сегодня';
  let tone = 'is-good';
  if (ageHours < 24) {
    label = 'сегодня';
    tone = 'is-good';
  } else if (ageDays <= 7) {
    label = `${Math.max(1, Math.floor(ageDays))}д назад`;
    tone = 'is-good';
  } else if (ageDays <= 30) {
    label = `${Math.floor(ageDays)}д назад`;
    tone = 'is-warn';
  } else if (ageDays <= 90) {
    label = `${Math.floor(ageDays)}д назад`;
    tone = 'is-soft';
  } else {
    label = '90д+';
    tone = 'is-muted';
  }
  return {
    label,
    tone,
    detail: formatDate(item.lastKnownActivityAt),
  };
}

function renderUsersInlineChips(chips = []) {
  const safe = Array.isArray(chips) ? chips.filter(Boolean) : [];
  if (!safe.length) return '<span class="aw-stat-chip is-muted">—</span>';
  return safe.map((chip) => `
    <span class="aw-stat-chip ${escapeHtml(chip.tone || '')}">${escapeHtml(chip.label || '—')}</span>
  `).join('');
}

function compareCardLabel(item = {}) {
  return String(item.displayName || `user #${Number(item.userId || 0) || '—'}`).trim();
}

function compareDrillTarget(compareRail = {}, kind = 'top_problem') {
  const cards = Array.isArray(compareRail.cards) ? compareRail.cards.slice() : [];
  if (!cards.length) return null;
  if (kind === 'dormant_payer') {
    return cards
      .filter((item) => !!item.isDormantPayer)
      .sort((a, b) => (Number(b.paymentsCount || 0) - Number(a.paymentsCount || 0))
        || (new Date(a.lastKnownActivityAt || 0).getTime() - new Date(b.lastKnownActivityAt || 0).getTime())
        || (Number(a.userId || 0) - Number(b.userId || 0)))[0] || null;
  }
  return cards
    .filter((item) => Number(item.problemScore || 0) > 0 || String(item.problemDesc || '').trim())
    .sort((a, b) => (Number(b.problemScore || 0) - Number(a.problemScore || 0))
      || (Number(b.paymentsCount || 0) - Number(a.paymentsCount || 0))
      || (new Date(a.lastKnownActivityAt || 0).getTime() - new Date(b.lastKnownActivityAt || 0).getTime())
      || (Number(a.userId || 0) - Number(b.userId || 0)))[0] || null;
}

function renderUsersCompareDrillActions(compareRail = {}) {
  const cards = Array.isArray(compareRail.cards) ? compareRail.cards : [];
  if (!cards.length) return '';
  const topProblem = compareDrillTarget(compareRail, 'top_problem');
  const dormantPayer = compareDrillTarget(compareRail, 'dormant_payer');
  return `
    <div class="aw-action-grid aw-compare-drill-grid">
      <button class="aw-action-card aw-action-card-compact" data-users-compare-action="export_pins">
        <span>Экспорт</span>
        <strong>CSV pinned snapshot</strong>
        <small>Закреплённый набор без потери текущего working slice.</small>
      </button>
      <button class="aw-action-card aw-action-card-compact" data-users-compare-action="copy_pins_tg_ids">
        <span>Copy</span>
        <strong>Pinned tg_id</strong>
        <small>Скопировать tg_id по pinned set через тот же audited bulk contract.</small>
      </button>
      <button class="aw-action-card aw-action-card-compact" data-users-compare-action="copy_pins_usernames">
        <span>Copy</span>
        <strong>Pinned usernames</strong>
        <small>Скопировать usernames по закреплённым user cards без ручной сборки корзины.</small>
      </button>
      <button class="aw-action-card aw-action-card-compact" data-users-compare-action="copy_pins_user_ids">
        <span>Copy</span>
        <strong>Pinned user_id</strong>
        <small>Собрать internal user_id по тому же pinned set для ручных ops follow-up шагов.</small>
      </button>
      <button class="aw-action-card aw-action-card-compact" data-users-compare-action="open_top_problem" ${topProblem ? '' : 'disabled'}>
        <span>Open</span>
        <strong>${escapeHtml(topProblem ? `Top problem · ${compareCardLabel(topProblem)}` : 'Top problem · none')}</strong>
        <small>${escapeHtml(topProblem ? `Открыть закреплённую карточку с максимальным attention/problem score (${topProblem.problemDesc || 'attention'}).` : 'Сейчас среди pins нет явного problem target.')}</small>
      </button>
      <button class="aw-action-card aw-action-card-compact" data-users-compare-action="open_dormant_payer" ${dormantPayer ? '' : 'disabled'}>
        <span>Open</span>
        <strong>${escapeHtml(dormantPayer ? `Dormant payer · ${compareCardLabel(dormantPayer)}` : 'Dormant payer · none')}</strong>
        <small>${escapeHtml(dormantPayer ? `Открыть закреплённого dormant payer без ручного поиска по compare rail.` : 'Сейчас среди pins нет dormant payer по contract 30d.')}</small>
      </button>
    </div>
  `;
}

function renderUsersCompareCards(compareRail = {}) {
  const cards = Array.isArray(compareRail.cards) ? compareRail.cards : [];
  if (!cards.length) {
    return `<div class="aw-empty aw-compare-empty">Закрепи 2–5 user cards, чтобы рядом сравнивать сегмент, план, signals, payments и operator note без тяжёлого перехода между карточками.</div>`;
  }
  return cards.map((item) => {
    const pinPayload = escapeHtml(JSON.stringify({
      userId: Number(item.userId || 0) || 0,
      tgId: Number(item.tgId || 0) || 0,
      username: String(item.username || '').trim(),
      segment: String(item.segment || '').trim(),
    }));
    const signalChips = Array.isArray(item.signalChips) ? item.signalChips : [];
    return `
      <article class="aw-compare-card">
        <div class="aw-compare-card-head">
          <div class="aw-stack aw-gap-xs">
            <strong class="aw-cell-title">${escapeHtml(item.displayName || ('user #' + (item.userId || '—')))}</strong>
            <small>user_id ${Number(item.userId || 0) || '—'} · tg_id ${Number(item.tgId || 0) || '—'}${item.username ? ` · @${escapeHtml(item.username)}` : ''}</small>
          </div>
          <div class="aw-inline-chips aw-inline-chips-tight">
            <span class="aw-stat-chip is-soft">${escapeHtml(item.segmentLabel || 'пользователь')}</span>
            <span class="aw-stat-chip ${item.status === 'banned' ? 'is-warn' : 'is-good'}">${item.status === 'banned' ? 'banned' : 'active'}</span>
          </div>
        </div>
        <div class="aw-inline-chips aw-inline-chips-tight">
          <span class="aw-stat-chip ${item.plan ? 'is-accent' : 'is-muted'}">${escapeHtml(item.plan ? `plan · ${item.plan}` : 'plan · none')}</span>
          <span class="aw-stat-chip ${Number(item.credits || 0) > 0 ? 'is-good' : 'is-muted'}">${escapeHtml(`credits · ${Number(item.credits || 0)}`)}</span>
          <span class="aw-stat-chip ${item.hasChannel ? 'is-good' : 'is-warn'}">${item.hasChannel ? 'channel · yes' : 'channel · no'}</span>
          <span class="aw-stat-chip ${Number(item.paymentsCount || 0) > 0 ? 'is-good' : 'is-muted'}">${escapeHtml(`pay x${Number(item.paymentsCount || 0)}`)}</span>
        </div>
        <div class="aw-inline-chips aw-inline-chips-tight">
          ${renderUsersInlineChips(signalChips)}
        </div>
        <div class="aw-list aw-compare-card-meta">
          <div class="aw-list-item"><strong>Последняя активность</strong><small>${escapeHtml(formatDate(item.lastKnownActivityAt))}</small></div>
          <div class="aw-list-item"><strong>Последний платёж</strong><small>${escapeHtml(formatDate(item.lastPaymentAt))}</small></div>
          <div class="aw-list-item"><strong>Attention</strong><small>${escapeHtml(item.problemDesc ? `${item.problemDesc} · score ${Number(item.problemScore || 0)}` : item.isDormantPayer ? 'dormant payer' : 'major flags not detected')}</small></div>
          <div class="aw-list-item"><strong>Workspace / curator</strong><small>${escapeHtml(`owned ${Number(item.workspaceCount || 0)} · curator ${Number(item.curatorCount || 0)}`)}</small></div>
          <div class="aw-list-item"><strong>Note</strong><small>${escapeHtml(item.notePreview || 'Пока без operator note.')}</small></div>
        </div>
        <div class="aw-actions aw-actions-tight">
          <button class="aw-button ghost" data-user-quick="open_card" data-user-quick-payload='${pinPayload}'>Открыть</button>
          <button class="aw-button ghost" data-user-quick="toggle_pin" data-user-quick-payload='${pinPayload}'>Убрать</button>
        </div>
      </article>
    `;
  }).join('');
}

function userRowPayload(item = {}) {
  return escapeHtml(JSON.stringify({
    userId: Number(item.userId || 0) || 0,
    tgId: Number(item.tgId || 0) || 0,
    username: String(item.username || '').trim(),
    segment: String(item.segment || '').trim(),
  }));
}

function renderUserRowQuickActions(item = {}) {
  const payload = userRowPayload(item);
  const inBasket = isUserInBasket(item.userId);
  const isPinned = isUserPinned(item.userId);
  const username = String(item.username || '').trim();
  return `
    <div class="aw-row-actions">
      <button class="aw-row-action" data-user-quick="open_card" data-user-quick-payload='${payload}'>Карточка</button>
      <button class="aw-row-action ${isPinned ? 'is-active' : ''}" data-user-quick="toggle_pin" data-user-quick-payload='${payload}'>${isPinned ? 'Pinned' : 'Pin'}</button>
      <button class="aw-row-action" data-user-quick="copy_tg_id" data-user-quick-payload='${payload}'>tg_id</button>
      <button class="aw-row-action" data-user-quick="copy_username" data-user-quick-payload='${payload}' ${username ? '' : 'disabled'}>${username ? 'username' : 'username —'}</button>
      <button class="aw-row-action ${inBasket ? 'is-active' : ''}" data-user-quick="toggle_basket" data-user-quick-payload='${payload}'>${inBasket ? 'В корзине' : 'В корзину'}</button>
    </div>
  `;
}

function usersView(model) {
  const items = Array.isArray(model.items) ? model.items : [];
  const exportOptions = Array.isArray(model.exportOptions) ? model.exportOptions : [];
  const bulkOptions = Array.isArray(model.bulkOptions) ? model.bulkOptions : [];
  const exportMeta = model.exportMeta || {};
  const bulkMeta = model.bulkMeta || {};
  const recentExport = exportMeta.recentExport || null;
  const recentCopy = bulkMeta.recentCopy || null;
  const usersState = getUsersState();
  const filterMeta = model.filterRail?.currentFilters || exportMeta.currentFilters || {};
  const cohortTopline = model.cohortTopline || model.filterRail?.cohortCounters || {};
  const pagination = buildUsersPaginationMeta(model);
  const currentSegment = usersState.segment || exportMeta.currentSegment || 'all';
  const currentSearch = usersState.q || exportMeta.currentSearch || '';
  const currentPlanState = usersState.planState || filterMeta.planState || 'all';
  const currentCreditsState = usersState.creditsState || filterMeta.creditsState || 'all';
  const currentChannelState = usersState.channelState || filterMeta.channelState || 'all';
  const currentActivityWindow = usersState.activityWindow || filterMeta.activityWindow || 'all';
  const currentPaymentsState = usersState.paymentsState || filterMeta.paymentsState || 'all';
  const currentSortBy = usersState.sortBy || filterMeta.sortBy || 'created_desc';
  const currentCohortView = usersState.cohortView || filterMeta.cohortView || 'all';
  const currentSliceLabel = usersActionSliceLabel({
    q: currentSearch,
    segment: currentSegment,
    planState: currentPlanState,
    creditsState: currentCreditsState,
    channelState: currentChannelState,
    activityWindow: currentActivityWindow,
    paymentsState: currentPaymentsState,
    sortBy: currentSortBy,
    cohortView: currentCohortView,
  });
  const bulkSource = window.__usersBulkState?.source || 'current';
  const sortMeta = usersSortMeta(currentSortBy);
  const cohortMeta = usersCohortMeta(currentCohortView);
  const priorityPresets = usersPriorityPresets();
  const cohortPresets = usersCohortPresets();
  const activePresetId = detectUsersOperatorPreset({
    q: currentSearch,
    segment: currentSegment,
    planState: currentPlanState,
    creditsState: currentCreditsState,
    channelState: currentChannelState,
    activityWindow: currentActivityWindow,
    paymentsState: currentPaymentsState,
    sortBy: currentSortBy,
    cohortView: currentCohortView,
  });
  const activePresetMeta = activePresetId === 'custom'
    ? { label: 'Custom slice', detail: 'Текущий state отличается от встроенных presets.' }
    : usersOperatorPresetMeta(activePresetId);
  const bulkMode = window.__usersBulkState?.mode || 'tg_ids';
  const compareRail = model.compareRail || { maxPins: 5, pinIds: getUsersPinIds(), cards: [] };
  const pinIds = Array.isArray(compareRail.pinIds) ? compareRail.pinIds : getUsersPinIds();
  const basketIds = getUsersBasketIds();
  const allVisibleSelected = !!items.length && items.every((item) => isUserInBasket(item.userId));
  const topPagination = renderUsersPaginationControls(pagination, 'top');
  const bottomPagination = renderUsersPaginationControls(pagination, 'bottom');
  return shell('Пользователи', 'Плотный ops/audit список: фильтры, экспорт, safe bulk utilities и быстрый drilldown в карточку.', `
    <section class="aw-surface aw-stack">
      <div class="aw-users-sticky-controls">
        <div class="aw-users-sticky-shell">
          <div class="aw-toolbar aw-toolbar-users aw-toolbar-users-sticky">
          <div class="aw-toolbar-main">
            <input id="usersSearch" class="aw-input inline" placeholder="Поиск: username / tg_id / user id" value="${escapeHtml(currentSearch)}" />
            <select id="usersSegment" class="aw-select inline">
              ${[['all','Все'],['brands','Бренды'],['creators','Креаторы'],['curators','Кураторы'],['managers','Менеджеры']].map(([v,l]) => `<option value="${v}" ${currentSegment === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
            <button class="aw-button secondary" id="applyUsersFilters">Применить</button>
          </div>
          <div class="aw-toolbar-export">
            <select id="usersExportScope" class="aw-select inline">
              ${exportOptions.map((item) => `<option value="${escapeHtml(item.id || '')}">${escapeHtml(item.label || item.id || '')}</option>`).join('')}
            </select>
            <button class="aw-button" id="exportUsersBtn">Экспорт</button>
          </div>
          </div>
          <div class="aw-users-sticky-state">
            <div class="aw-basket-pill">Slice: <strong>${escapeHtml(currentSliceLabel)}</strong></div>
            <div class="aw-basket-pill">Sort: <strong>${escapeHtml(sortMeta.label)}</strong></div>
            <div class="aw-basket-pill">Cohort: <strong>${escapeHtml(cohortMeta.label)}</strong></div>
            <div class="aw-basket-pill">Preset: <strong>${escapeHtml(activePresetMeta.label)}</strong></div>
            <div class="aw-basket-pill">Корзина: <strong>${basketIds.length}</strong> / ${Number(bulkMeta.basketMaxRows || 500)}</div>
            <div class="aw-basket-pill">Pins: <strong>${pinIds.length}</strong> / ${Number(compareRail.maxPins || 5)}</div>
            <div class="aw-basket-pill">Страница: <strong>${escapeHtml(pagination.pageLabel)}</strong></div>
          </div>
        </div>
      </div>

      <div class="aw-users-rails-stack">
        <section class="aw-priority-rail">
          <div class="aw-utility-head">
            <div>
              <strong>Users sort / priority rail</strong>
              <span>Быстро поднимает наверх самые свежие, самые платящие, самые тихие и самые проблемные сегменты без новых мутаций.</span>
            </div>
            <div class="aw-basket-pill">Порядок: <strong>${escapeHtml(sortMeta.label)}</strong></div>
          </div>
          <div class="aw-priority-row">
            <div class="aw-priority-pills">
              ${priorityPresets.map((item) => `<button class="aw-priority-pill ${currentSortBy === item.id ? 'is-active' : ''}" data-users-priority="${escapeHtml(item.id)}">${escapeHtml(item.label)}</button>`).join('')}
            </div>
            <select id="usersSortBy" class="aw-select inline">
              ${[['created_desc','Сортировка: новые сверху'],['activity_desc','Сортировка: свежие сверху'],['payments_desc','Сортировка: платящие сверху'],['activity_asc','Сортировка: тихие сверху'],['problem_desc','Сортировка: проблемные сверху']].map(([v,l]) => `<option value="${v}" ${currentSortBy === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          <div class="aw-toolbar-note">
            <span class="aw-muted">${escapeHtml(sortMeta.detail)}</span>
            <span class="aw-muted">problem = banned / paid-no-channel / plan-no-channel / stale credits</span>
          </div>
        </section>

        <section class="aw-cohort-rail">
          <!-- usersCohortView · Cohort view идёт через тот же server contract -->
          <div class="aw-utility-head">
            <div>
              <strong>Users operator cohort chips / saved views</strong>
              <span>Users cohort counters / mini topline: теперь с маленькими счётчиками над chips, чтобы панель быстрее читалась как control plane.</span>
            </div>
            <div class="aw-basket-pill">Cohort: <strong>${escapeHtml(cohortMeta.label)}</strong></div>
          </div>
          <div class="aw-cohort-topline">
            ${usersCohortCounterCards(cohortTopline, currentCohortView)}
          </div>
          <div class="aw-toolbar-note">
            <span class="aw-muted">Mini topline считает cohort-срезы на сервере по тому же users-contract, но без активного cohort filter.</span>
            <span class="aw-muted">Это сохраняет chips полезными: даже при активном cohort ты видишь полный рабочий расклад по текущему search / segment / filter rail.</span>
          </div>
          <div class="aw-priority-pills">
            ${cohortPresets.map((item) => `<button class="aw-priority-pill ${currentCohortView === item.id ? 'is-active' : ''}" data-users-cohort="${escapeHtml(item.id)}">${escapeHtml(item.label)}</button>`).join('')}
          </div>
        </section>

        <section class="aw-preset-rail">
          <div class="aw-utility-head">
            <div>
              <strong>Users saved operator presets</strong>
              <span>Быстрые рабочие presets поверх текущего state-contract: один клик возвращает к реально нужным ops-срезам без ручной сборки контролов.</span>
            </div>
            <div class="aw-basket-pill">Preset: <strong>${escapeHtml(activePresetMeta.label)}</strong></div>
          </div>
          <div class="aw-toolbar-note">
            <span class="aw-muted">Встроенные presets намеренно read-only: они просто выставляют уже существующие search / segment / filter / sort / cohort контролы.</span>
            <span class="aw-muted">Любой ручной сдвиг после этого переводит экран в custom slice, но к preset можно вернуться одним кликом.</span>
          </div>
          <div class="aw-preset-grid">
            ${renderUsersOperatorPresetCards(activePresetId)}
          </div>
          <div class="aw-toolbar-note">
            <span class="aw-muted">Активный preset: ${escapeHtml(activePresetMeta.label)}</span>
            <span class="aw-muted">${escapeHtml(activePresetMeta.detail)}</span>
          </div>
        </section>

        <section class="aw-filter-rail">
          <div class="aw-utility-head">
            <div>
              <strong>Filter rail v2</strong>
              <span>Read-only фильтры для анализа: план / credits / канал / активность / payments.</span>
            </div>
            <div class="aw-basket-pill">Slice: <strong>${escapeHtml(currentSliceLabel)}</strong></div>
          </div>
          <div class="aw-filter-grid">
            <select id="usersPlanState" class="aw-select inline">
              ${[['all','План: все'],['with_plan','План: есть'],['no_plan','План: нет']].map(([v,l]) => `<option value="${v}" ${currentPlanState === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
            <select id="usersCreditsState" class="aw-select inline">
              ${[['all','Credits: все'],['with_credits','Credits: есть'],['no_credits','Credits: нет']].map(([v,l]) => `<option value="${v}" ${currentCreditsState === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
            <select id="usersChannelState" class="aw-select inline">
              ${[['all','Канал: все'],['with_channel','Канал: есть'],['no_channel','Канал: нет']].map(([v,l]) => `<option value="${v}" ${currentChannelState === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
            <select id="usersActivityWindow" class="aw-select inline">
              ${[['all','Активность: любая'],['7d','Активность: 7 дней'],['30d','Активность: 30 дней'],['90d','Активность: 90 дней']].map(([v,l]) => `<option value="${v}" ${currentActivityWindow === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
            <select id="usersPaymentsState" class="aw-select inline">
              ${[['all','Payments: все'],['with_payments','Payments: yes'],['no_payments','Payments: no']].map(([v,l]) => `<option value="${v}" ${currentPaymentsState === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          <div class="aw-toolbar-note">
            <span class="aw-muted">Фильтры работают и для списка, и для CSV / bulk copy. Activity = latest known signal в user/account/payments/workspace surfaces.</span>
          </div>
        </section>

        <div class="aw-users-sticky-meta">
          <div class="aw-basket-pill">Строки: <strong>${pagination.total > 0 ? `${pagination.fromRow}–${pagination.toRow}` : '0'}</strong> / ${pagination.total}</div>
          <div class="aw-basket-pill">На странице: <strong>${pagination.pageSize}</strong></div>
          <div class="aw-users-url-meta">
            <div class="aw-basket-pill">Users URL-persisted working views: <strong>ON</strong></div>
            <button class="aw-button ghost" data-users-copy-view-url>Скопировать ссылку на срез</button>
          </div>
        </div>

        ${topPagination}

      <section class="aw-compare-rail aw-compare-rail-density">
        <div class="aw-utility-head">
          <div>
            <strong>Users compare / pin rail</strong>
            <span>Временно закрепляет 2–5 user cards для side-by-side ops review без тяжёлого redesign и без новых write-path.</span>
          </div>
          <div class="aw-users-compare-actions">
            <div class="aw-basket-pill">Pinned: <strong>${pinIds.length}</strong> / ${Number(compareRail.maxPins || 5)}</div>
            <button class="aw-button ghost" id="clearUsersPinsBtn" ${pinIds.length ? '' : 'disabled'}>Очистить pins</button>
          </div>
        </div>
        <div class="aw-toolbar-note aw-toolbar-note-compact">
          <span class="aw-muted">Pins живут в users URL state и переживают refresh / reopen вместе с текущим working slice.</span>
          <span class="aw-muted">STEP526: compare drill actions polish — pinned set по-прежнему умеет export/copy/open через уже существующие safe contracts.</span>
          <span class="aw-muted">STEP527: compare density polish — rail стал компактнее и больше не лезет поверх соседних секций при scroll.</span>
        </div>
        ${renderUsersCompareDrillActions(compareRail)}
        <div class="aw-toolbar-note">
          <span class="aw-muted">Compare drill actions не вводят destructive bulk: export и copy идут через уже существующие audited users_export / users_bulk paths.</span>
          <span class="aw-muted">Open actions только открывают одну закреплённую карточку по pinned set heuristic — top problem или dormant payer.</span>
        </div>
        <div class="aw-compare-grid">
          ${renderUsersCompareCards(compareRail)}
        </div>
      </section>

      <section class="aw-action-ready-rail">
        <div class="aw-utility-head">
          <div>
            <strong>Users action-ready follow-up rail</strong>
            <span>Готовые follow-up действия по текущему cohort/filter slice: export, copy tg_id, copy usernames и быстрые рабочие переходы без ручной перенастройки контролов.</span>
          </div>
          <div class="aw-basket-pill">Slice: <strong>${escapeHtml(currentSliceLabel)}</strong></div>
        </div>
        <div class="aw-action-grid">
          <button class="aw-action-card" data-users-followup="export_current">
            <span>Экспорт</span>
            <strong>CSV current slice</strong>
            <small>Скачать текущий search / segment / filter / cohort с уже активной сортировкой.</small>
          </button>
          <button class="aw-action-card" data-users-followup="copy_tg_ids">
            <span>Copy</span>
            <strong>tg_id</strong>
            <small>Быстро собрать tg_id по текущему срезу и сразу положить в буфер обмена.</small>
          </button>
          <button class="aw-action-card" data-users-followup="copy_usernames">
            <span>Copy</span>
            <strong>usernames</strong>
            <small>Скопировать usernames по тому же working slice без переключения bulk rail вручную.</small>
          </button>
          <button class="aw-action-card" data-users-followup="open_top_problem_users">
            <span>Open</span>
            <strong>Top problem users</strong>
            <small>Переключить приоритет на problem_desc и открыть самых проблемных без сброса остальных фильтров.</small>
          </button>
          <button class="aw-action-card" data-users-followup="open_dormant_payers">
            <span>Open</span>
            <strong>Dormant payers · ${Math.max(0, Number(cohortTopline?.dormant_payers || 0))}</strong>
            <small>Включить cohort Dormant payers и поднять наверх тех, кого логично разбирать в follow-up.</small>
          </button>
        </div>
        <div class="aw-toolbar-note">
          <span class="aw-muted">Action-ready rail не вводит новых мутаций: он переиспользует уже существующие export / bulk / priority / cohort contracts.</span>
          <span class="aw-muted">Copy действия идут через тот же admin-web audit trail, что и основной Bulk utility rail.</span>
        </div>
      </section>

      <div class="aw-toolbar-note">
        <span class="aw-muted">CSV · до ${Number(exportMeta.maxRows || 10000)} строк · audit trail включён</span>
        ${recentExport ? `<span class="aw-muted">Последняя выгрузка: ${escapeHtml(formatDate(recentExport.ts))} · TG ${Number(recentExport.actorTgId || 0) || '—'}</span>` : '<span class="aw-muted">Выгрузок из web-admin пока не было.</span>'}
      </div>

      <section class="aw-utility-rail">
        <div class="aw-utility-head">
          <div>
            <strong>Bulk utility rail</strong>
            <span>Без мутаций: быстрые списки для ручной ops-работы и аудита.</span>
          </div>
          <div class="aw-basket-pill">Корзина: <strong>${basketIds.length}</strong> / ${Number(bulkMeta.basketMaxRows || 500)}</div>
        </div>
        <div class="aw-toolbar aw-toolbar-utility">
          <select id="usersBulkSource" class="aw-select inline">
            <option value="current" ${bulkSource === 'current' ? 'selected' : ''}>Источник: текущий фильтр</option>
            <option value="basket" ${bulkSource === 'basket' ? 'selected' : ''}>Источник: корзина</option>
          </select>
          <select id="usersBulkMode" class="aw-select inline">
            ${bulkOptions.map((item) => `<option value="${escapeHtml(item.id || '')}" ${bulkMode === item.id ? 'selected' : ''}>${escapeHtml(item.label || item.id || '')}</option>`).join('')}
          </select>
          <button class="aw-button secondary" id="copyUsersBulkBtn">Копировать</button>
          <button class="aw-button ghost" id="selectVisibleUsersBtn">${allVisibleSelected ? 'Снять текущую страницу' : 'Выбрать текущую страницу'}</button>
          <button class="aw-button ghost" id="clearUsersBasketBtn">Очистить корзину</button>
        </div>
        <div class="aw-toolbar-note">
          <span class="aw-muted">Текущий фильтр копирует весь срез до 10 000 строк. Корзина — вручную отобранные пользователи на web-страницах.</span>
          ${recentCopy ? `<span class="aw-muted">Последнее копирование: ${escapeHtml(formatDate(recentCopy.ts))} · TG ${Number(recentCopy.actorTgId || 0) || '—'}</span>` : '<span class="aw-muted">Копирований bulk utility пока не было.</span>'}
        </div>
      </section>

      </div>

      <div class="aw-table-wrap aw-users-table-wrap">
        <table class="aw-table aw-users-table">
          <thead>
            <tr>
              <th class="aw-table-check"><input type="checkbox" id="toggleVisibleUsers" ${allVisibleSelected ? 'checked' : ''} ${items.length ? '' : 'disabled'} /></th>
              <th>Пользователь</th>
              <th>Сегмент</th>
              <th>План / credits</th>
              <th>Сигналы</th>
              <th>Last activity</th>
              <th>Создан</th>
            </tr>
          </thead>
          <tbody>
            ${items.length ? items.map((item) => {
              const planMeta = usersPlanMeta(item);
              const creditsMeta = usersCreditsMeta(item);
              const activityMeta = usersActivityMeta(item);
              const signalChips = usersSignalChips(item);
              return `
              <tr data-user-row="${item.userId}">
                <td class="aw-table-check">
                  <input type="checkbox" class="aw-row-check" data-user-check='${userRowPayload(item)}' ${isUserInBasket(item.userId) ? 'checked' : ''} />
                </td>
                <td>
                  <div class="aw-user-cell">
                    <div class="aw-user-primary">
                      <strong>${escapeHtml(item.username ? '@' + item.username : 'user #' + item.userId)}</strong>
                      ${item.hasNote ? '<span class="aw-stat-chip is-soft"><span class="aw-note-dot"></span> note</span>' : ''}
                    </div>
                    <small>user_id ${item.userId} · tg_id ${item.tgId || '—'}</small>
                    <div class="aw-inline-chips aw-inline-chips-tight">
                      <span class="aw-stat-chip ${escapeHtml(planMeta.tone)}">${escapeHtml(planMeta.label)}</span>
                      <span class="aw-stat-chip ${escapeHtml(creditsMeta.tone)}">${escapeHtml(creditsMeta.label)}</span>
                    </div>
                    ${renderUserRowQuickActions(item)}
                  </div>
                </td>
                <td>
                  <div class="aw-cell-stack aw-cell-stack-tight">
                    <strong class="aw-cell-title">${escapeHtml(segmentLabel(item.segment || 'user'))}</strong>
                    <small>${item.flags?.hasBrandProfile ? 'Есть brand profile' : 'Без brand profile'}</small>
                  </div>
                </td>
                <td>
                  <div class="aw-cell-stack aw-cell-stack-tight">
                    <div class="aw-inline-chips aw-inline-chips-tight">
                      <span class="aw-stat-chip ${escapeHtml(planMeta.tone)}">${escapeHtml(planMeta.label)}</span>
                      <span class="aw-stat-chip ${escapeHtml(creditsMeta.tone)}">${escapeHtml(creditsMeta.label)}</span>
                    </div>
                    <small>${escapeHtml(planMeta.detail)} · ${escapeHtml(creditsMeta.detail)}</small>
                  </div>
                </td>
                <td>
                  <div class="aw-cell-stack aw-cell-stack-tight">
                    <div class="aw-inline-chips">${renderUsersInlineChips(signalChips)}</div>
                    <small>${escapeHtml(usersSignalsDetail(item))}</small>
                  </div>
                </td>
                <td>
                  <div class="aw-cell-stack aw-cell-stack-tight">
                    <div class="aw-inline-chips aw-inline-chips-tight">
                      <span class="aw-stat-chip ${escapeHtml(activityMeta.tone)}">${escapeHtml(activityMeta.label)}</span>
                    </div>
                    <small>${escapeHtml(activityMeta.detail)}</small>
                  </div>
                </td>
                <td>
                  <div class="aw-cell-stack aw-cell-stack-tight">
                    <strong class="aw-cell-title">${escapeHtml(formatDatePart(item.createdAt))}</strong>
                    <small>${escapeHtml(formatTimePart(item.createdAt))}</small>
                  </div>
                </td>
              </tr>
            `}).join('') : '<tr><td colspan="7" class="aw-empty">Ничего не найдено.</td></tr>'}
          </tbody>
        </table>
      </div>

      ${bottomPagination}
    </section>
  `, window.__adminSession || {});
}

function userDetailView(model) {
  const user = model.user || {};
  const account = model.account || {};
  const access = model.access || {};
  const activity = model.activity || {};
  const note = model.note || {};
  const recentAudit = Array.isArray(model.recentAdminAudit) ? model.recentAdminAudit : [];
  const displayName = user.displayName || (user.username ? '@' + user.username : 'user #' + (user.id || '—'));
  const workspaceLabel = Array.isArray(access.workspaces) && access.workspaces.length
    ? access.workspaces.map((w) => `${w.title || 'workspace'}${w.channel_username ? ` · @${String(w.channel_username).replace(/^@/, '')}` : ''}`).join(' · ')
    : 'Нет привязанных workspace.';
  const curatorLabel = Array.isArray(access.curatorIn) && access.curatorIn.length
    ? access.curatorIn.map((w) => w.title || 'workspace').join(' · ')
    : 'Нет curator membership.';
  const noteMeta = [];
  if (note.updatedAt) noteMeta.push(`Обновлено: ${formatDate(note.updatedAt)}`);
  if (note.byAdminTgId) noteMeta.push(`TG ${note.byAdminTgId}`);

  return shell('Пользователь', 'User card usable v1: summary → access → activity → operator note.', `
    <section class="aw-surface aw-user-hero aw-stack">
      <a href="${escapeHtml(userDetailBackHref())}" data-link class="aw-inline-back">← К списку пользователей</a>
      <div class="aw-user-head">
        <div class="aw-stack aw-gap-xs">
          <h2 class="aw-user-title">${escapeHtml(displayName)}</h2>
          <div class="aw-user-subline">tg_id ${user.tgId || '—'} · user_id ${user.id || '—'} · ${escapeHtml(segmentLabel(user.segment))} · создан ${formatDate(user.createdAt)}</div>
        </div>
        <div class="aw-badges">
          <span class="aw-badge">${escapeHtml(segmentLabel(user.segment))}</span>
          <span class="aw-badge ${user.status === 'banned' ? 'is-bad' : 'is-good'}">${user.status === 'banned' ? 'banned' : 'active'}</span>
          ${user.username ? `<span class="aw-badge">@${escapeHtml(user.username)}</span>` : ''}
        </div>
      </div>
      <div class="aw-mini-grid">
        <div class="aw-mini-card"><span>План</span><strong>${escapeHtml(account.plan || '—')}</strong></div>
        <div class="aw-mini-card"><span>Credits</span><strong>${Number(account.credits || 0)}</strong></div>
        <div class="aw-mini-card"><span>Workspace</span><strong>${access.hasWorkspace ? 'есть' : 'нет'}</strong></div>
        <div class="aw-mini-card"><span>Канал</span><strong>${access.hasChannel ? 'подключён' : 'нет'}</strong></div>
      </div>
    </section>

    <div class="aw-split aw-user-layout">
      <section class="aw-stack">
        <section class="aw-surface aw-stack">
          <h2>Профиль</h2>
          <dl class="aw-kv aw-kv-compact">
            <dt>Display</dt><dd>${escapeHtml(displayName)}</dd>
            <dt>Username</dt><dd>${user.username ? '@' + escapeHtml(user.username) : '—'}</dd>
            <dt>TG ID</dt><dd>${user.tgId || '—'}</dd>
            <dt>User ID</dt><dd>${user.id || '—'}</dd>
            <dt>Segment</dt><dd>${escapeHtml(segmentLabel(user.segment))}</dd>
            <dt>Статус</dt><dd>${user.status === 'banned' ? `banned · ${formatDate(user.bannedAt)}` : 'active'}</dd>
            <dt>План</dt><dd>${escapeHtml(account.plan || '—')} ${account.planUntil ? `· до ${formatDate(account.planUntil)}` : ''}</dd>
            <dt>Credits</dt><dd>${escapeHtml(account.creditsLabel || 'no credits')}</dd>
          </dl>
        </section>

        <section class="aw-surface aw-stack">
          <h2>Доступ и сигналы</h2>
          <div class="aw-list">
            <div class="aw-list-item"><strong>Signals</strong><small>${Array.isArray(access.signals) && access.signals.length ? access.signals.map(signalLabel).join(' · ') : 'Нет выраженных signals.'}</small></div>
            <div class="aw-list-item"><strong>Workspaces</strong><small>${escapeHtml(workspaceLabel)}</small></div>
            <div class="aw-list-item"><strong>Curator in</strong><small>${escapeHtml(curatorLabel)}</small></div>
            <div class="aw-list-item"><strong>Brand profile</strong><small>${access.brandProfile?.brand_name ? escapeHtml(access.brandProfile.brand_name) : '—'}</small></div>
            <div class="aw-list-item"><strong>Channel signal</strong><small>${access.hasChannel ? escapeHtml(access.channelLabel || 'Есть канал') : 'Нет канала'}</small></div>
          </div>
        </section>

        <section class="aw-surface aw-stack">
          <h2>Активность</h2>
          <div class="aw-mini-grid aw-mini-grid-3">
            <div class="aw-mini-card"><span>Owned workspaces</span><strong>${Number(activity.lightCounters?.workspacesOwned || 0)}</strong></div>
            <div class="aw-mini-card"><span>Curator in</span><strong>${Number(activity.lightCounters?.curatorIn || 0)}</strong></div>
            <div class="aw-mini-card"><span>Payments</span><strong>${Number(activity.lightCounters?.payments || 0)}</strong></div>
          </div>
          <div class="aw-list">
            <div class="aw-list-item"><strong>Recent summary</strong><small>${escapeHtml(activity.recentSummary || 'Нет выраженных сигналов активности.')}</small></div>
            <div class="aw-list-item"><strong>Последнее изменение</strong><small>${formatDate(activity.lastSeenAt)}</small></div>
            <div class="aw-list-item"><strong>Последний важный сигнал</strong><small>${formatDate(activity.lastImportantAction)}</small></div>
          </div>
        </section>
      </section>

      <aside class="aw-stack">
        <section class="aw-surface aw-stack">
          <h2>Заметка оператора</h2>
          <textarea id="noteText" class="aw-textarea" maxlength="1000" placeholder="Внутренняя заметка для owner/admin">${escapeHtml(note.text || '')}</textarea>
          <div class="aw-muted">${noteMeta.length ? escapeHtml(noteMeta.join(' · ')) : 'Заметка пока не добавлена.'}</div>
          <div class="aw-actions">
            <button class="aw-button" id="saveNoteBtn" data-user-id="${user.id}">Сохранить</button>
            <button class="aw-button secondary" id="clearNoteBtn" data-user-id="${user.id}">Очистить</button>
          </div>
        </section>

        <section class="aw-surface aw-stack">
          <h2>Последние admin-действия</h2>
          <div class="aw-list">
            ${recentAudit.length ? recentAudit.map((item) => `
              <div class="aw-list-item">
                <strong>${escapeHtml(item.action || 'unknown')}</strong>
                <small>${formatDate(item.ts)} · actor TG ${Number(item.actorTgId || 0) || 'fallback'}${item.reason ? ` · ${escapeHtml(item.reason)}` : ''}</small>
              </div>
            `).join('') : '<div class="aw-empty">Пока пусто.</div>'}
          </div>
        </section>
      </aside>
    </div>
  `, window.__adminSession || {});
}




function paymentsView(model) {
  const summary = model.summary || {};
  const warnings = Array.isArray(model.warnings) ? model.warnings : [];
  const recentPayments = Array.isArray(model.recentPayments) ? model.recentPayments : [];
  const groups = model.groups || {};
  const followUpGroups = model.followUpGroups || {};
  const followUpQueue = Array.isArray(model.followUpQueue) ? model.followUpQueue : [];
  const hints = Array.isArray(model.hints) ? model.hints : [];
  const overall = model.overall || { state: 'unknown', label: 'Данные пока недоступны' };
  return shell('Payments', 'Read-only срез платежной активности, fallback-сигналов и проблемных кейсов.', `
    <section class="aw-surface aw-section aw-stack">
      <div class="aw-runtime-head">
        <div>
          <h2>Платёжный статус</h2>
          <p class="aw-muted">Last updated: ${formatDate(model.updatedAt)}</p>
        </div>
        <div class="aw-runtime-overall ${runtimeStateClass(overall.state)}">${escapeHtml(runtimeStateLabel(overall.state))} · ${escapeHtml(overall.label || '')}</div>
      </div>
      <div class="aw-grid-cards aw-runtime-cards">
        <div class="aw-card aw-runtime-card"><span>Total payments</span><strong>${Number(summary.total || 0)}</strong><small>Все события</small></div>
        <div class="aw-card aw-runtime-card"><span>Recent payments</span><strong>${Number(summary.recent || 0)}</strong><small>Последние 7 дней</small></div>
        <div class="aw-card aw-runtime-card"><span>Successful</span><strong class="aw-status good">${Number(summary.successful || 0)}</strong><small>Применены</small></div>
        <div class="aw-card aw-runtime-card"><span>Pending</span><strong class="aw-status warn">${Number(summary.pending || 0)}</strong><small>Требуют внимания</small></div>
        <div class="aw-card aw-runtime-card"><span>Warnings</span><strong class="aw-status ${Number(summary.warnings || 0) > 0 ? 'bad' : 'good'}">${Number(summary.warnings || 0)}</strong><small>Fallback / failed / stale</small></div>
        <div class="aw-card aw-runtime-card"><span>Needs review</span><strong class="aw-status ${Number(summary.needsReview || 0) > 0 ? 'bad' : 'good'}">${Number(summary.needsReview || 0)}</strong><small>Founder/operator review</small></div>
      </div>
    </section>

    <section class="aw-surface aw-section aw-stack">
      <h2>Предупреждения</h2>
      <div class="aw-list">
        ${(warnings.length ? warnings : [{ level: 'info', message: 'Явных payment-предупреждений нет.', source: 'payments' }]).map((item) => `
          <div class="aw-list-item aw-warning-item">
            <strong class="${warningTone(item.level)}">${escapeHtml(item.message || '—')}</strong>
            <small>${escapeHtml(item.source || 'payments')}</small>
          </div>
        `).join('')}
      </div>
    </section>

    <div class="aw-split aw-section aw-runtime-layout">
      <section class="aw-surface aw-stack">
        <h2>Последние платежи</h2>
        <div class="aw-table-wrap">
          <table class="aw-table">
            <thead>
              <tr>
                <th>Payment</th>
                <th>User</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Follow-up</th>
                <th>Created</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              ${recentPayments.length ? recentPayments.map((item) => `
                <tr data-payment-row="${Number(item.id || 0)}">
                  <td><strong>#${Number(item.id || 0)}</strong><small>user_id ${Number(item.userId || 0) || '—'} · tg_id ${Number(item.tgId || 0) || '—'}</small></td>
                  <td>${escapeHtml(item.displayName || '—')}</td>
                  <td>${escapeHtml(item.kind || 'payment')}</td>
                  <td>${escapeHtml(item.amountLabel || '—')}</td>
                  <td><span class="aw-status ${paymentStatusClass(item.status)}">${escapeHtml(paymentStatusLabel(item.status))}</span></td>
                  <td><span class="aw-status ${paymentFollowUpClass(item.followUp?.level)}">${escapeHtml(item.followUp?.label || paymentFollowUpLabel(item.followUp?.level))}</span><small>${escapeHtml(item.followUp?.reason || '')}</small></td>
                  <td>${formatDate(item.createdAt)}</td>
                  <td>${formatDate(item.updatedAt)}</td>
                </tr>
              `).join('') : '<tr><td colspan="8" class="aw-empty">Платёжных событий пока нет.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>

      <aside class="aw-stack">
        <section class="aw-surface aw-stack">
          <h2>Operator follow-up</h2>
          <div class="aw-list">
            <div class="aw-list-item"><strong>без действий</strong><small>${Number(followUpGroups.noAction || 0)}</small></div>
            <div class="aw-list-item"><strong>наблюдать</strong><small>${Number(followUpGroups.watch || 0)}</small></div>
            <div class="aw-list-item"><strong>проверить</strong><small>${Number(followUpGroups.review || 0)}</small></div>
            <div class="aw-list-item"><strong>срочно</strong><small>${Number(followUpGroups.urgent || 0)}</small></div>
          </div>
        </section>

        <section class="aw-surface aw-stack">
          <h2>Кейсы для follow-up</h2>
          <div class="aw-list">
            ${followUpQueue.length ? followUpQueue.map((item) => `
              <div class="aw-list-item">
                <strong>${escapeHtml(item.displayName || `payment #${Number(item.id || 0)}`)}</strong>
                <small>#${Number(item.id || 0)} · ${escapeHtml(item.amountLabel || '—')} · ${escapeHtml(item.followUp?.reason || '')}</small>
                <div class="aw-actions"><a href="/admin/payments/${Number(item.id || 0)}?back=${encodeURIComponent('/admin/payments')}" data-link class="aw-button ghost">Открыть</a></div>
              </div>
            `).join('') : '<div class="aw-empty">Сейчас нет кейсов для follow-up.</div>'}
          </div>
        </section>

        <section class="aw-surface aw-stack">
          <h2>Status groups</h2>
          <div class="aw-list">
            <div class="aw-list-item"><strong>success</strong><small>${Number(groups.success || 0)}</small></div>
            <div class="aw-list-item"><strong>pending</strong><small>${Number(groups.pending || 0)}</small></div>
            <div class="aw-list-item"><strong>failed</strong><small>${Number(groups.failed || 0)}</small></div>
            <div class="aw-list-item"><strong>fallback</strong><small>${Number(groups.fallback || 0)}</small></div>
          </div>
        </section>

        <section class="aw-surface aw-stack">
          <h2>Подсказки</h2>
          <div class="aw-list">
            ${hints.length ? hints.map((item) => `
              <div class="aw-list-item">
                <strong class="${warningTone(item.kind === 'warning' ? 'warning' : 'info')}">${escapeHtml(item.kind === 'warning' ? 'Нужна проверка' : 'Подсказка')}</strong>
                <small>${escapeHtml(item.message || '')}</small>
              </div>
            `).join('') : '<div class="aw-empty">Пока пусто.</div>'}
          </div>
        </section>
      </aside>
    </div>
  `, window.__adminSession || {});
}


function paymentDetailView(model) {
  const payment = model.payment || {};
  const user = model.user || {};
  const diagnostics = model.diagnostics || { state: 'unknown', label: 'Данные пока недоступны', hint: 'Проверь payment/runtime surfaces.' };
  const followUp = model.followUp || { level: 'review', label: 'Проверить', reason: 'Нет follow-up summary.', nextStep: 'Проверь payment signals и user card.' };
  const events = Array.isArray(model.events) ? model.events : [];
  const hints = Array.isArray(model.hints) ? model.hints : [];
  const recentAdminAudit = Array.isArray(model.recentAdminAudit) ? model.recentAdminAudit : [];
  const backHref = paymentDetailBackHref();
  return shell('Payment detail', 'Read-only payment drilldown для founder/operator проверки.', `
    <section class="aw-surface aw-user-hero aw-stack">
      <a href="${escapeHtml(backHref)}" data-link class="aw-inline-back">← К списку платежей</a>
      <div class="aw-user-head">
        <div class="aw-stack aw-gap-xs">
          <h2 class="aw-user-title">#${Number(payment.id || 0) || '—'}</h2>
          <div class="aw-user-subline">${escapeHtml(payment.kind || 'payment')} · ${escapeHtml(payment.source || 'payments')} · создан ${formatDate(payment.createdAt)} · обновлён ${formatDate(payment.updatedAt)}</div>
        </div>
        <div class="aw-badges">
          <span class="aw-badge ${paymentStatusClass(payment.status)}">${escapeHtml(paymentStatusLabel(payment.status))}</span>
          <span class="aw-badge ${paymentFollowUpClass(followUp.level)}">${escapeHtml(followUp.label || paymentFollowUpLabel(followUp.level))}</span>
          <span class="aw-badge">${escapeHtml(payment.amountLabel || '—')}</span>
        </div>
      </div>
      <div class="aw-mini-grid aw-mini-grid-3">
        <div class="aw-mini-card"><span>Статус</span><strong class="aw-status ${paymentStatusClass(payment.status)}">${escapeHtml(paymentStatusLabel(payment.status))}</strong></div>
        <div class="aw-mini-card"><span>Follow-up</span><strong class="aw-status ${paymentFollowUpClass(followUp.level)}">${escapeHtml(followUp.label || '—')}</strong></div>
        <div class="aw-mini-card"><span>Amount</span><strong>${escapeHtml(payment.amountLabel || '—')}</strong></div>
      </div>
    </section>

    <div class="aw-split aw-user-layout">
      <section class="aw-stack">
        <section class="aw-surface aw-stack">
          <h2>Связанный пользователь</h2>
          <div class="aw-list">
            <div class="aw-list-item"><strong>${escapeHtml(user.displayName || '—')}</strong><small>${user.username ? '@' + escapeHtml(user.username) + ' · ' : ''}tg_id ${Number(user.tgId || 0) || '—'} · user_id ${Number(user.id || 0) || '—'}</small></div>
            <div class="aw-actions">${user.link ? `<a href="${escapeHtml(user.link)}" data-link class="aw-button ghost">Открыть user card</a>` : ''}</div>
          </div>
        </section>

        <section class="aw-surface aw-stack">
          <h2>Сводка платежа</h2>
          <dl class="aw-kv aw-kv-compact">
            <dt>Payment ID</dt><dd>${Number(payment.id || 0) || '—'}</dd>
            <dt>Type</dt><dd>${escapeHtml(payment.kind || 'payment')}</dd>
            <dt>Source</dt><dd>${escapeHtml(payment.source || 'payments')}</dd>
            <dt>Amount</dt><dd>${escapeHtml(payment.amountLabel || '—')}</dd>
            <dt>Status</dt><dd><span class="aw-status ${paymentStatusClass(payment.status)}">${escapeHtml(paymentStatusLabel(payment.status))}</span></dd>
            <dt>Created</dt><dd>${formatDate(payment.createdAt)}</dd>
            <dt>Updated</dt><dd>${formatDate(payment.updatedAt)}</dd>
          </dl>
        </section>

        <section class="aw-surface aw-stack">
          <h2>Operator follow-up</h2>
          <div class="aw-list">
            <div class="aw-list-item"><strong class="aw-status ${paymentFollowUpClass(followUp.level)}">${escapeHtml(followUp.label || '—')}</strong><small>${escapeHtml(followUp.reason || 'Проверь payment signals.')}</small></div>
            <div class="aw-list-item"><strong>Следующий шаг</strong><small>${escapeHtml(followUp.nextStep || 'Проверь user card и runtime surfaces.')}</small></div>
          </div>
        </section>

        <section class="aw-surface aw-stack">
          <h2>Диагностика</h2>
          <div class="aw-list">
            <div class="aw-list-item"><strong class="${warningTone(diagnostics.state === 'ok' ? 'info' : 'warning')}">${escapeHtml(diagnostics.label || '—')}</strong><small>${escapeHtml(diagnostics.hint || 'Проверь payment/runtime/user surfaces.')}</small></div>
            ${payment.note ? `<div class="aw-list-item"><strong>Служебная note</strong><small>${escapeHtml(payment.note)}</small></div>` : ''}
          </div>
        </section>
      </section>

      <aside class="aw-stack">
        <section class="aw-surface aw-stack">
          <h2>Последние payment-сигналы</h2>
          <div class="aw-list">
            ${events.length ? events.map((item) => `
              <div class="aw-list-item">
                <strong>${escapeHtml(item.label || item.kind || 'event')}</strong>
                <small>${escapeHtml(item.kind || 'payment_event')} · ${formatDate(item.at)}</small>
              </div>
            `).join('') : '<div class="aw-empty">Пока пусто.</div>'}
          </div>
        </section>

        <section class="aw-surface aw-stack">
          <h2>Подсказки</h2>
          <div class="aw-list">
            ${hints.length ? hints.map((item) => `
              <div class="aw-list-item">
                <strong class="${warningTone(item.kind === 'warning' ? 'warning' : 'info')}">${escapeHtml(item.kind === 'warning' ? 'Нужна проверка' : 'Подсказка')}</strong>
                <small>${escapeHtml(item.message || '')}</small>
              </div>
            `).join('') : '<div class="aw-empty">Пока пусто.</div>'}
          </div>
        </section>

        <section class="aw-surface aw-stack">
          <h2>Последние admin-действия</h2>
          <div class="aw-list">
            ${recentAdminAudit.length ? recentAdminAudit.map((item) => `
              <div class="aw-list-item">
                <strong>${escapeHtml(item.action || 'unknown')}</strong>
                <small>${formatDate(item.ts)} · actor TG ${Number(item.actorTgId || 0) || 'fallback'}${item.reason ? ` · ${escapeHtml(item.reason)}` : ''}</small>
              </div>
            `).join('') : '<div class="aw-empty">Пока пусто.</div>'}
          </div>
        </section>
      </aside>
    </div>
  `, window.__adminSession || {});
}

function commsAudienceLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return ({ all: 'all', brands: 'brands', creators: 'creators', curators: 'curators', managers: 'managers' })[key] || (key || 'all');
}

function commsStatusClass(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'done' || key === 'sent') return 'good';
  if (key === 'running' || key === 'paused' || key === 'pending' || key === 'queued') return 'warn';
  if (key === 'error' || key === 'stopped' || key === 'blocked' || key === 'failed') return 'bad';
  return '';
}

function commsStatusLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return ({ pending: 'draft', running: 'running', paused: 'paused', done: 'done', error: 'error', stopped: 'stopped', blocked: 'blocked', sent: 'sent', failed: 'failed', queued: 'queued', unknown: 'unknown' })[key] || (key || 'unknown');
}

function normalizeCommsEditorState(model) {
  const drafts = Array.isArray(model?.drafts) ? model.drafts : [];
  const cur = window.__commsState || {};
  const hasDraft = cur.draftId && drafts.some((item) => String(item.id) === String(cur.draftId));
  if (cur.initialized && (hasDraft || !cur.draftId)) {
    return {
      initialized: true,
      draftId: cur.draftId || '',
      title: cur.title || '',
      audience: cur.audience || 'all',
      bodyText: cur.bodyText || '',
    };
  }
  if (drafts.length) {
    const first = drafts[0];
    return {
      initialized: true,
      draftId: String(first.id || ''),
      title: first.title || '',
      audience: first.audience || 'all',
      bodyText: first.bodyText || '',
    };
  }
  return { initialized: true, draftId: '', title: '', audience: 'all', bodyText: '' };
}

function seedCommsEditorFromDraft(draft) {
  window.__commsState = {
    initialized: true,
    draftId: String(draft?.id || ''),
    title: draft?.title || '',
    audience: draft?.audience || 'all',
    bodyText: draft?.bodyText || '',
  };
}

function resetCommsEditor() {
  window.__commsState = { initialized: true, draftId: '', title: '', audience: 'all', bodyText: '' };
}

function syncCommsPreview() {
  const title = document.getElementById('draftTitleInput')?.value?.trim() || 'Новый draft';
  const audience = document.getElementById('draftAudienceInput')?.value || 'all';
  const bodyText = document.getElementById('draftBodyInput')?.value?.trim() || 'Текст notice пока пустой.';
  const titleNode = document.getElementById('draftPreviewTitle');
  const metaNode = document.getElementById('draftPreviewMeta');
  const bodyNode = document.getElementById('draftPreviewBody');
  if (titleNode) titleNode.textContent = title;
  if (metaNode) metaNode.textContent = `Audience · ${commsAudienceLabel(audience)}`;
  if (bodyNode) bodyNode.textContent = bodyText;
}

function commsView(model) {
  const summary = model.summary || {};
  const warnings = Array.isArray(model.warnings) ? model.warnings : [];
  const drafts = Array.isArray(model.drafts) ? model.drafts : [];
  const recentNotices = Array.isArray(model.recentNotices) ? model.recentNotices : [];
  const outbox = model.outbox || {};
  const hints = Array.isArray(model.hints) ? model.hints : [];
  const overall = model.overall || { state: 'unknown', label: 'Данные пока недоступны' };
  const recentAdminAudit = Array.isArray(model.recentAdminAudit) ? model.recentAdminAudit : [];
  const editor = normalizeCommsEditorState(model);
  window.__commsPageData = model;
  window.__commsState = editor;
  const isFounder = !!window.__adminSession?.isFounder;
  return shell('Comms', 'Workspace для draft notices, preview и founder test-send без live mass send.', `
    <section class="aw-surface aw-section aw-stack">
      <div class="aw-runtime-head">
        <div>
          <h2>Comms workspace</h2>
          <p class="aw-muted">Last updated: ${formatDate(model.updatedAt)}</p>
        </div>
        <div class="aw-runtime-overall ${runtimeStateClass(overall.state)}">${escapeHtml(runtimeStateLabel(overall.state))} · ${escapeHtml(overall.label || '')}</div>
      </div>
      <div class="aw-grid-cards aw-runtime-cards">
        <div class="aw-card aw-runtime-card"><span>Drafts</span><strong>${Number(summary.drafts || 0)}</strong><small>Можно редактировать и preview</small></div>
        <div class="aw-card aw-runtime-card"><span>Recent notices</span><strong>${Number(summary.recentNotices || 0)}</strong><small>Недавние notices</small></div>
        <div class="aw-card aw-runtime-card"><span>Outbox pending</span><strong class="aw-status ${Number(summary.outboxPending || 0) > 0 ? 'warn' : 'good'}">${Number(summary.outboxPending || 0)}</strong><small>queued / processing</small></div>
        <div class="aw-card aw-runtime-card"><span>Outbox warnings</span><strong class="aw-status ${Number(summary.outboxWarnings || 0) > 0 ? 'bad' : 'good'}">${Number(summary.outboxWarnings || 0)}</strong><small>warning / failed</small></div>
        <div class="aw-card aw-runtime-card"><span>Founder test sends</span><strong>${Number(summary.recentTestSends || 0)}</strong><small>Последние audit-сигналы</small></div>
        <div class="aw-card aw-runtime-card"><span>Comms warnings</span><strong class="aw-status ${Number(summary.warnings || 0) > 0 ? 'bad' : 'good'}">${Number(summary.warnings || 0)}</strong><small>Read-first snapshot</small></div>
      </div>
    </section>

    <section class="aw-surface aw-section aw-stack">
      <h2>Предупреждения</h2>
      <div class="aw-list">
        ${(warnings.length ? warnings : [{ level: 'info', message: 'Явных comms-предупреждений нет.', source: 'comms' }]).map((item) => `
          <div class="aw-list-item aw-warning-item">
            <strong class="${warningTone(item.level)}">${escapeHtml(item.message || '—')}</strong>
            <small>${escapeHtml(item.source || 'comms')}</small>
          </div>
        `).join('')}
      </div>
    </section>

    <div class="aw-split aw-section aw-runtime-layout">
      <section class="aw-stack">
        <section class="aw-surface aw-stack">
          <div class="aw-runtime-head">
            <div>
              <h2>Drafts</h2>
              <p class="aw-muted">Safe draft workspace: create / update / preview. Live send из web выключен.</p>
            </div>
            <div class="aw-actions">
              <button class="aw-button ghost" id="newDraftBtn">Новый draft</button>
            </div>
          </div>
          <div class="aw-list">
            ${drafts.length ? drafts.map((item) => `
              <div class="aw-list-item">
                <div class="aw-row-between">
                  <div>
                    <strong>${escapeHtml(item.title || 'Untitled draft')}</strong>
                    <small>${escapeHtml(commsAudienceLabel(item.audience))} · ${formatDate(item.updatedAt)} · ${escapeHtml(item.createdByLabel || 'operator')}</small>
                  </div>
                  <div class="aw-actions">
                    <span class="aw-status ${commsStatusClass(item.status)}">${escapeHtml(commsStatusLabel(item.status))}</span>
                    <button class="aw-button secondary" data-edit-draft="${Number(item.id || 0)}" data-draft-title="${encodeURIComponent(item.title || '')}" data-draft-audience="${encodeURIComponent(item.audience || 'all')}" data-draft-body="${encodeURIComponent(item.bodyText || '')}">Открыть</button>
                  </div>
                </div>
                <small>${escapeHtml(item.preview || 'Черновик без текста')}</small>
              </div>
            `).join('') : '<div class="aw-empty">Drafts пока отсутствуют.</div>'}
          </div>
        </section>

        <section class="aw-surface aw-stack">
          <div class="aw-runtime-head">
            <div>
              <h2>${editor.draftId ? 'Редактирование draft' : 'Новый draft'}</h2>
              <p class="aw-muted">Сохраняется только по явному действию. Blank body не допускается.</p>
            </div>
            ${editor.draftId ? `<span class="aw-chip">draft #${escapeHtml(editor.draftId)}</span>` : '<span class="aw-chip">new</span>'}
          </div>
          <input id="draftIdInput" type="hidden" value="${escapeHtml(editor.draftId || '')}" />
          <div class="aw-stack aw-gap-xs">
            <label class="aw-muted" for="draftTitleInput">Внутренний label</label>
            <input id="draftTitleInput" class="aw-input" maxlength="120" placeholder="Например: April creator notice" value="${escapeHtml(editor.title || '')}" />
          </div>
          <div class="aw-stack aw-gap-xs">
            <label class="aw-muted" for="draftAudienceInput">Audience</label>
            <select id="draftAudienceInput" class="aw-select">
              ${['all','brands','creators','curators','managers'].map((item) => `<option value="${item}" ${editor.audience === item ? 'selected' : ''}>${item}</option>`).join('')}
            </select>
          </div>
          <div class="aw-stack aw-gap-xs">
            <label class="aw-muted" for="draftBodyInput">Body</label>
            <textarea id="draftBodyInput" class="aw-textarea" maxlength="4000" placeholder="Текст notice для preview и founder test-send">${escapeHtml(editor.bodyText || '')}</textarea>
          </div>
          <div class="aw-actions">
            <button class="aw-button" id="saveDraftBtn">${editor.draftId ? 'Сохранить draft' : 'Создать draft'}</button>
            ${isFounder ? `<button class="aw-button secondary" id="testSendDraftBtn" ${editor.draftId ? '' : 'disabled'}>Founder test send</button>` : ''}
          </div>
          <div class="aw-card aw-preview-card">
            <span>Preview</span>
            <strong id="draftPreviewTitle">${escapeHtml(editor.title || 'Новый draft')}</strong>
            <small id="draftPreviewMeta">Audience · ${escapeHtml(commsAudienceLabel(editor.audience || 'all'))}</small>
            <div class="aw-preview-body" id="draftPreviewBody">${escapeHtml(editor.bodyText || 'Текст notice пока пустой.')}</div>
          </div>
        </section>

        <section class="aw-surface aw-stack">
          <h2>Recent notices</h2>
          <div class="aw-table-wrap">
            <table class="aw-table">
              <thead>
                <tr>
                  <th>Notice</th>
                  <th>Audience</th>
                  <th>Status</th>
                  <th>Outbox</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                ${recentNotices.length ? recentNotices.map((item) => `
                  <tr>
                    <td><strong>${escapeHtml(item.title || `#${Number(item.id || 0)}`)}</strong><small>${escapeHtml(item.preview || 'Без текста')} · ${escapeHtml(item.createdByLabel || 'operator')}</small></td>
                    <td>${escapeHtml(commsAudienceLabel(item.audience))}</td>
                    <td><span class="aw-status ${commsStatusClass(item.status)}">${escapeHtml(commsStatusLabel(item.status))}</span></td>
                    <td><small>sent ${Number(item.outbox?.sent || 0)} · queued ${Number(item.outbox?.queued || 0)} · failed ${Number(item.outbox?.failed || 0)}</small></td>
                    <td>${formatDate(item.updatedAt)}</td>
                  </tr>
                `).join('') : '<tr><td colspan="5" class="aw-empty">Recent notices пока отсутствуют.</td></tr>'}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <aside class="aw-stack">
        <section class="aw-surface aw-stack">
          <h2>Outbox snapshot</h2>
          <div class="aw-list">
            <div class="aw-list-item"><strong>queued</strong><small>${Number(outbox.queued || 0)}</small></div>
            <div class="aw-list-item"><strong>processing</strong><small>${Number(outbox.processing || 0)}</small></div>
            <div class="aw-list-item"><strong>warning</strong><small>${Number(outbox.warning || 0)}</small></div>
            <div class="aw-list-item"><strong>failed</strong><small>${Number(outbox.failed || 0)}</small></div>
            <div class="aw-list-item"><strong>sent</strong><small>${Number(outbox.sent || 0)}</small></div>
          </div>
        </section>

        <section class="aw-surface aw-stack">
          <h2>Подсказки</h2>
          <div class="aw-list">
            ${hints.length ? hints.map((item) => `
              <div class="aw-list-item">
                <strong class="${warningTone(item.kind === 'warning' ? 'warning' : 'info')}">${escapeHtml(item.kind === 'warning' ? 'Нужна проверка' : 'Подсказка')}</strong>
                <small>${escapeHtml(item.message || '')}</small>
              </div>
            `).join('') : '<div class="aw-empty">Пока пусто.</div>'}
          </div>
        </section>

        <section class="aw-surface aw-stack">
          <h2>Последние comms-действия</h2>
          <div class="aw-list">
            ${recentAdminAudit.length ? recentAdminAudit.map((item) => `
              <div class="aw-list-item">
                <strong>${escapeHtml(item.action || 'unknown')}</strong>
                <small>${formatDate(item.ts)} · actor TG ${Number(item.actorTgId || 0) || 'fallback'}${item.targetId ? ` · notice ${escapeHtml(item.targetId)}` : ''}</small>
              </div>
            `).join('') : '<div class="aw-empty">Пока нет действий.</div>'}
          </div>
        </section>
      </aside>
    </div>
  `, window.__adminSession || {});
}


function founderView(model) {
  const founder = model.founder || {};
  const sessionPolicy = model.sessionPolicy || {};
  const founderSale = model.founderSale || {};
  const controls = model.controls || {};
  const snapshots = model.snapshots || {};
  const warnings = Array.isArray(model.warnings) ? model.warnings : [];
  const hints = Array.isArray(model.hints) ? model.hints : [];
  const recentAudit = Array.isArray(model.recentFounderAudit) ? model.recentFounderAudit : [];
  return shell('Founder', 'Founder-only control surface: split from operator UI, read-first and hobby-safe.', `
    <section class="aw-surface aw-section aw-stack">
      <div class="aw-runtime-head">
        <div>
          <h2>Founder access</h2>
          <p class="aw-muted">Last updated: ${formatDate(model.updatedAt)}</p>
        </div>
        <div class="aw-runtime-overall ${founder.allowed ? 'good' : 'warn'}">${founder.allowed ? 'FOUNDER READY' : 'OPERATOR SESSION'} · TG ${Number(founder.actorTgId || 0) || 'fallback'}</div>
      </div>
      <div class="aw-grid-cards aw-runtime-cards">
        <div class="aw-card aw-runtime-card"><span>Auth/session</span><strong class="aw-status good">OK</strong><small>login ${Number(sessionPolicy.loginTtlSec || 0)}s · session ${Number(sessionPolicy.sessionTtlSec || 0)}s</small></div>
        <div class="aw-card aw-runtime-card"><span>Idle timeout</span><strong>${Math.round(Number(sessionPolicy.idleTimeoutSec || 0) / 60) || 0}m</strong><small>manual refresh only</small></div>
        <div class="aw-card aw-runtime-card"><span>Approvers</span><strong>${Number(sessionPolicy.approversCount || 0)}</strong><small>Telegram approvers configured</small></div>
        <div class="aw-card aw-runtime-card"><span>Founder Sale</span><strong class="aw-status ${founderSale.enabled ? 'good' : 'warn'}">${founderSale.enabled ? 'ON' : 'OFF'}</strong><small>${escapeHtml(founderSale.deadline || 'Без дедлайна')}</small></div>
      </div>
    </section>

    <div class="aw-split aw-section aw-runtime-layout">
      <section class="aw-stack">
        <section class="aw-surface aw-stack">
          <h2>Founder controls split</h2>
          <div class="aw-list">
            <div class="aw-list-item"><strong>Web founder action</strong><small>${controls.canRevokeAllSessions ? 'Разрешён только revoke all sessions.' : 'Founder action недоступен в этой сессии.'}</small></div>
            <div class="aw-list-item"><strong>Bot-only danger zone</strong><small>${Array.isArray(controls.botOnlyControls) ? controls.botOnlyControls.join(' · ') : '—'}</small></div>
          </div>
          <div class="aw-actions">
            <button class="aw-button danger" id="revokeAllBtn" ${controls.canRevokeAllSessions ? '' : 'disabled'}>Revoke all web sessions</button>
          </div>
        </section>

        <section class="aw-surface aw-stack">
          <h2>Founder sale</h2>
          <div class="aw-mini-grid aw-mini-grid-3">
            <div class="aw-mini-card"><span>Brand 3m</span><strong>${Number(founderSale.brand3mPrice || 0)}</strong><small>${Number(founderSale.brand3mCredits || 0)} credits</small></div>
            <div class="aw-mini-card"><span>Brand 12m</span><strong>${Number(founderSale.brand12mPrice || 0)}</strong><small>${Number(founderSale.brand12mCredits || 0)} credits</small></div>
            <div class="aw-mini-card"><span>Creator 12m</span><strong>${Number(founderSale.creator12mPrice || 0)}</strong><small>founder price</small></div>
          </div>
        </section>

        <section class="aw-surface aw-stack">
          <h2>Founder warnings</h2>
          <div class="aw-list">
            ${(warnings.length ? warnings : [{ level: 'info', message: 'Явных founder-предупреждений нет.', source: 'founder' }]).map((item) => `
              <div class="aw-list-item aw-warning-item">
                <strong class="${warningTone(item.level)}">${escapeHtml(item.message || '—')}</strong>
                <small>${escapeHtml(item.source || 'founder')}</small>
              </div>
            `).join('')}
          </div>
        </section>
      </section>

      <aside class="aw-stack">
        <section class="aw-surface aw-stack">
          <h2>Founder hints</h2>
          <div class="aw-list">
            ${hints.length ? hints.map((item) => `
              <div class="aw-list-item">
                <strong class="${warningTone(item.kind === 'warning' ? 'warning' : 'info')}">${escapeHtml(item.kind === 'warning' ? 'Нужна проверка' : 'Подсказка')}</strong>
                <small>${escapeHtml(item.message || '')}</small>
              </div>
            `).join('') : '<div class="aw-empty">Пока пусто.</div>'}
          </div>
        </section>

        <section class="aw-surface aw-stack">
          <h2>Founder snapshot</h2>
          <div class="aw-mini-grid aw-mini-grid-2">
            <div class="aw-mini-card"><span>Users</span><strong>${Number(snapshots.usersTotal || 0)}</strong></div>
            <div class="aw-mini-card"><span>Runtime</span><strong>${escapeHtml(runtimeStateLabel(snapshots.runtimeState || 'unknown'))}</strong></div>
            <div class="aw-mini-card"><span>Payment warnings</span><strong>${Number(snapshots.paymentWarnings || 0)}</strong></div>
            <div class="aw-mini-card"><span>Comms warnings</span><strong>${Number(snapshots.commsWarnings || 0)}</strong></div>
          </div>
        </section>

        <section class="aw-surface aw-stack">
          <h2>Последние founder-действия</h2>
          <div class="aw-list">
            ${recentAudit.length ? recentAudit.map((item) => `
              <div class="aw-list-item">
                <strong>${escapeHtml(item.action || 'unknown')}</strong>
                <small>${formatDate(item.ts)} · actor TG ${Number(item.actorTgId || 0) || 'fallback'}${item.targetId ? ` · ${escapeHtml(item.targetId)}` : ''}</small>
              </div>
            `).join('') : '<div class="aw-empty">Пока пусто.</div>'}
          </div>
        </section>
      </aside>
    </div>
  `, window.__adminSession || {});
}

function runtimeView(model) {
  const services = model.services || {};
  const warnings = Array.isArray(model.warnings) ? model.warnings : [];
  const configPresence = Array.isArray(model.configPresence) ? model.configPresence : [];
  const hints = Array.isArray(model.hints) ? model.hints : [];
  const recentEvents = Array.isArray(model.recentRuntimeEvents) ? model.recentRuntimeEvents : [];
  const overall = model.overall || { state: 'unknown', label: 'Статус неизвестен' };
  return shell('Runtime', 'Короткий диагностический срез инфраструктуры, конфигурации и сервисных зависимостей.', `
    <section class="aw-surface aw-section aw-stack">
      <div class="aw-runtime-head">
        <div>
          <h2>Общий статус</h2>
          <p class="aw-muted">Last updated: ${formatDate(model.updatedAt)}</p>
        </div>
        <div class="aw-runtime-overall ${runtimeStateClass(overall.state)}">${escapeHtml(runtimeStateLabel(overall.state))} · ${escapeHtml(overall.label || '')}</div>
      </div>
      <div class="aw-grid-cards aw-runtime-cards">
        ${[
          ['DB', services.db],
          ['Redis', services.redis],
          ['QStash', services.qstash],
          ['Payments', services.payments],
          ['Config', services.config],
          ['Admin Web', services.adminWeb],
        ].map(([label, item]) => `
          <div class="aw-card aw-runtime-card">
            <span>${escapeHtml(label)}</span>
            <strong class="aw-status ${runtimeStateClass(item?.state)}">${escapeHtml(runtimeStateLabel(item?.state))}</strong>
            <small>${escapeHtml(item?.label || 'Данные пока недоступны.')}</small>
            <div class="aw-card-subtle">${escapeHtml(item?.hint || '')}</div>
          </div>
        `).join('')}
      </div>
    </section>

    <section class="aw-surface aw-section aw-stack">
      <h2>Предупреждения</h2>
      <div class="aw-list">
        ${(warnings.length ? warnings : [{ level: 'info', message: 'Явных предупреждений нет', source: 'runtime' }]).map((item) => `
          <div class="aw-list-item aw-warning-item">
            <strong class="${warningTone(item.level)}">${escapeHtml(item.message || '—')}</strong>
            <small>${escapeHtml(item.source || 'runtime')}</small>
          </div>
        `).join('')}
      </div>
    </section>

    <div class="aw-split aw-section aw-runtime-layout">
      <section class="aw-surface aw-stack">
        <h2>Конфигурация</h2>
        <div class="aw-config-grid">
          ${configPresence.map((item) => `
            <div class="aw-config-row">
              <div class="aw-config-key">${escapeHtml(item.key || '—')}</div>
              <div class="aw-config-state aw-status ${runtimeStateClass(item.state === 'configured' ? 'ok' : (item.state === 'missing' ? 'missing' : (item.state === 'optional' ? 'unknown' : 'unknown')))}">${escapeHtml(configPresenceLabel(item.state))}</div>
            </div>
          `).join('') || '<div class="aw-empty">Данные пока недоступны.</div>'}
        </div>
      </section>

      <aside class="aw-stack">
        <section class="aw-surface aw-stack">
          <h2>Подсказки</h2>
          <div class="aw-list">
            ${hints.length ? hints.map((item) => `
              <div class="aw-list-item">
                <strong class="${warningTone(item.kind === 'warning' ? 'warning' : 'info')}">${escapeHtml(item.kind === 'warning' ? 'Нужна проверка' : 'Подсказка')}</strong>
                <small>${escapeHtml(item.message || '')}</small>
              </div>
            `).join('') : '<div class="aw-empty">Пока пусто.</div>'}
          </div>
        </section>

        <section class="aw-surface aw-stack">
          <h2>Последние runtime-сигналы</h2>
          <div class="aw-list">
            ${recentEvents.length ? recentEvents.map((item) => `
              <div class="aw-list-item">
                <strong class="${warningTone(item.kind)}">${escapeHtml(item.message || '—')}</strong>
                <small>${escapeHtml(item.source || 'runtime')} · ${formatDate(item.at)}</small>
              </div>
            `).join('') : '<div class="aw-empty">Пока пусто.</div>'}
          </div>
        </section>
      </aside>
    </div>
  `, window.__adminSession || {});
}

async function ensureSession() {
  const res = await api('/api/admin-web-auth?action=me');
  if (!res.ok) {
    window.__adminSession = null;
    return null;
  }
  window.__adminSession = res.data.session || null;
  return window.__adminSession;
}

async function ensureControlSurface() {
  const res = await api('/api/admin-web-read?section=control_surface');
  window.__controlSurface = res.ok ? (res.data.data || {}) : null;
  return window.__controlSurface;
}

async function render() {
  const route = routeInfo();
  if (route.page === 'login') {
    readPersistedLoginState();
    const session = await ensureSession();
    if (session) {
      clearLoginState();
      history.replaceState({}, '', '/admin');
      return render();
    }
    app.innerHTML = loginView(getLoginState());
    bindLogin();
    if (getLoginState()?.challengeId) startLoginStatusPolling({ immediate: true });
    else stopLoginStatusPolling();
    return;
  }
  stopLoginStatusPolling();
  const session = await ensureSession();
  if (!session) {
    history.replaceState({}, '', '/admin/login');
    return render();
  }
  await ensureControlSurface();
  if (route.page === 'overview') {
    const res = await api('/api/admin-web-read?section=overview');
    if (res.data?.data?.runtime?.controlSurface) window.__controlSurface = res.data.data.runtime.controlSurface;
    app.innerHTML = overviewView(res.data.data || {});
  } else if (route.page === 'users') {
    const state = hydrateUsersStateFromLocation();
    syncUsersUrlState(state, { replace: true });
    const params = new URLSearchParams({ q: state.q || '', segment: state.segment || 'all', plan_state: state.planState || 'all', credits_state: state.creditsState || 'all', channel_state: state.channelState || 'all', activity_window: state.activityWindow || 'all', payments_state: state.paymentsState || 'all', sort_by: state.sortBy || 'created_desc', cohort_view: state.cohortView || 'all', limit: String(state.pageSize || 20), page: String(state.page || 0), pins: normalizeUsersPinIds(state.pinIds || []).join(',') });
    const res = await api(`/api/admin-web-read?section=users&${params}`);
    const model = res.data.data || { items: [] };
    const paginationPage = Number(model?.pagination?.page ?? state.page ?? 0) || 0;
    const paginationSize = Number(model?.pagination?.pageSize ?? state.pageSize ?? 20) || 20;
    const comparePinIds = normalizeUsersPinIds(model?.compareRail?.pinIds || state.pinIds || []);
    window.__usersState = normalizeUsersState({ ...state, page: paginationPage, pageSize: paginationSize, pinIds: comparePinIds });
    window.__usersCompareRail = model?.compareRail || { maxPins: 5, pinIds: comparePinIds, cards: [] };
    syncUsersUrlState(window.__usersState, { replace: true });
    app.innerHTML = usersView(model);
  } else if (route.page === 'userDetail') {
    const res = await api(`/api/admin-web-read?section=user&id=${encodeURIComponent(route.userId)}`);
    if (!res.ok) {
      app.innerHTML = shell('Пользователь не найден', 'Проверь user_id и попробуй снова.', `<div class="aw-surface aw-empty"><a href="${escapeHtml(userDetailBackHref())}" data-link class="aw-inline-back">← К списку пользователей</a><div class="aw-empty">Карточка пользователя не найдена.</div></div>`, session);
    } else {
      app.innerHTML = userDetailView(res.data.data || {});
    }
  } else if (route.page === 'runtime') {
    const res = await api('/api/admin-web-read?section=runtime');
    if (res.data?.data?.controlSurface) window.__controlSurface = res.data.data.controlSurface;
    app.innerHTML = runtimeView(res.data.data || {});
  } else if (route.page === 'payments') {
    const res = await api('/api/admin-web-read?section=payments');
    app.innerHTML = paymentsView(res.data.data || {});
  } else if (route.page === 'paymentDetail') {
    const res = await api(`/api/admin-web-read?section=payment&id=${encodeURIComponent(route.paymentId)}`);
    if (!res.ok) {
      app.innerHTML = shell('Платёж не найден', 'Проверь payment id и попробуй снова.', `<div class="aw-surface aw-empty"><a href="/admin/payments" data-link class="aw-inline-back">← К списку платежей</a><div class="aw-empty">Карточка платежа не найдена.</div></div>`, session);
    } else {
      app.innerHTML = paymentDetailView(res.data.data || {});
    }
  } else if (route.page === 'comms') {
    const res = await api('/api/admin-web-read?section=comms');
    app.innerHTML = commsView(res.data.data || {});
  } else if (route.page === 'founder') {
    const res = await api('/api/admin-web-read?section=founder');
    if (!res.ok) {
      app.innerHTML = shell('Founder', 'Founder-only control surface.', `<div class="aw-surface aw-empty">Founder surface недоступен для текущей сессии.</div>`, session);
    } else {
      app.innerHTML = founderView(res.data.data || {});
    }
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

function readUsersControlsState() {
  const state = getUsersState();
  return {
    q: document.getElementById('usersSearch')?.value || state.q || '',
    segment: document.getElementById('usersSegment')?.value || state.segment || 'all',
    planState: document.getElementById('usersPlanState')?.value || state.planState || 'all',
    creditsState: document.getElementById('usersCreditsState')?.value || state.creditsState || 'all',
    channelState: document.getElementById('usersChannelState')?.value || state.channelState || 'all',
    activityWindow: document.getElementById('usersActivityWindow')?.value || state.activityWindow || 'all',
    paymentsState: document.getElementById('usersPaymentsState')?.value || state.paymentsState || 'all',
    sortBy: document.getElementById('usersSortBy')?.value || state.sortBy || 'created_desc',
    cohortView: state.cohortView || 'all',
    page: state.page || 0,
    pageSize: Number(document.querySelector('[data-users-page-size]')?.value || state.pageSize || 20) || 20,
    pinIds: normalizeUsersPinIds(state.pinIds || []),
  };
}

function setUsersStateFromControls(overrides = {}) {
  window.__usersState = { ...readUsersControlsState(), ...(overrides || {}) };
}

function setUsersStateExact(overrides = {}) {
  window.__usersState = { ...getUsersState(), ...(overrides || {}) };
}

async function runUsersExportAction(scope = 'current', opts = {}) {
  const state = readUsersControlsState();
  const ids = normalizeUsersPinIds(opts?.ids || []);
  const params = new URLSearchParams({ section: 'users_export', scope, segment: state.segment, q: state.q, plan_state: state.planState, credits_state: state.creditsState, channel_state: state.channelState, activity_window: state.activityWindow, payments_state: state.paymentsState, sort_by: state.sortBy, cohort_view: state.cohortView });
  if (ids.length) params.set('ids', ids.join(','));
  await downloadCsv(`/api/admin-web-read?${params.toString()}`, `users_${ids.length ? 'pins' : scope}.csv`);
  render();
}

async function runUsersPinnedExportAction() {
  const ids = getUsersPinIds();
  if (!ids.length) {
    alert('Пока нет pinned users. Сначала закрепи 2–5 user cards.');
    return;
  }
  await runUsersExportAction('current', { ids });
}

async function runUsersBulkCopyAction(mode = 'tg_ids', source = 'current', opts = {}) {
  const state = readUsersControlsState();
  const idsOverride = normalizeUsersPinIds(opts?.ids || []);
  window.__usersBulkState = { mode, source };
  const params = new URLSearchParams({ section: 'users_bulk', mode, segment: state.segment, q: state.q, plan_state: state.planState, credits_state: state.creditsState, channel_state: state.channelState, activity_window: state.activityWindow, payments_state: state.paymentsState, sort_by: state.sortBy, cohort_view: state.cohortView });
  if (source === 'basket' || idsOverride.length) {
    const ids = idsOverride.length ? idsOverride : getUsersBasketIds();
    if (!ids.length) {
      alert(idsOverride.length ? 'Pinned set пуст. Сначала закрепи user cards.' : 'Корзина пуста. Сначала отметь пользователей в таблице.');
      return;
    }
    params.set('ids', ids.join(','));
  }
  const res = await api(`/api/admin-web-read?${params.toString()}`);
  if (!res.ok) {
    alert(`Не удалось собрать список: ${res.data?.error || 'unknown'}`);
    return;
  }
  const payload = res.data?.data || {};
  if (!String(payload.text || '').trim()) {
    alert('Пустой результат: для выбранного режима нет данных.');
    return;
  }
  const copied = await copyTextToClipboard(payload.text || '');
  if (!copied) {
    alert('Не удалось скопировать в буфер обмена.');
    return;
  }
  alert(`Скопировано: ${payload.rowsCount || 0} строк (${usersBulkModeLabel(payload.mode)} · ${basketSourceLabel(source)}).`);
  render();
}

async function runUsersPinnedBulkCopyAction(mode = 'tg_ids') {
  const ids = getUsersPinIds();
  if (!ids.length) {
    alert('Пока нет pinned users. Сначала закрепи 2–5 user cards.');
    return;
  }
  await runUsersBulkCopyAction(mode, 'pins', { ids });
}

function getUsersCompareRailModel() {
  const rail = window.__usersCompareRail || {};
  return {
    maxPins: Number(rail.maxPins || 5) || 5,
    pinIds: normalizeUsersPinIds(rail.pinIds || []),
    cards: Array.isArray(rail.cards) ? rail.cards : [],
  };
}

function openUsersCompareDrillTarget(kind = 'top_problem') {
  const compareRail = getUsersCompareRailModel();
  const target = compareDrillTarget(compareRail, kind);
  if (!target?.userId) {
    alert(kind === 'dormant_payer' ? 'Сейчас среди pins нет dormant payer по contract 30d.' : 'Сейчас среди pins нет problem target.');
    return;
  }
  const back = encodeURIComponent(buildUsersListHref(getUsersState()));
  history.pushState({}, '', `/admin/users/${Number(target.userId || 0)}?back=${back}`);
  render();
}

async function runUserRowCopyAction(item = {}, mode = 'tg_ids') {
  const state = readUsersControlsState();
  const userId = Number(item?.userId || 0) || 0;
  if (!userId) {
    alert('Не удалось определить user_id для row action.');
    return;
  }
  const params = new URLSearchParams({ section: 'users_bulk', mode, ids: String(userId), segment: state.segment, q: state.q, plan_state: state.planState, credits_state: state.creditsState, channel_state: state.channelState, activity_window: state.activityWindow, payments_state: state.paymentsState, sort_by: state.sortBy, cohort_view: state.cohortView });
  const res = await api(`/api/admin-web-read?${params.toString()}`);
  if (!res.ok) {
    alert(`Не удалось собрать row quick action: ${res.data?.error || 'unknown'}`);
    return;
  }
  const payload = res.data?.data || {};
  if (!String(payload.text || '').trim()) {
    alert('Пустой результат: в этой строке нет данных для копирования.');
    return;
  }
  const copied = await copyTextToClipboard(payload.text || '');
  if (!copied) {
    alert('Не удалось скопировать в буфер обмена.');
    return;
  }
  alert(`Скопировано из строки: ${usersBulkModeLabel(payload.mode)}.`);
  render();
}

function bindShell() {
  bindLinks();
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await api('/api/admin-web-auth?action=logout', { method: 'POST' });
    history.replaceState({}, '', '/admin/login');
    window.__loginState = {};
    render();
  });
  document.getElementById('refreshBtn')?.addEventListener('click', () => render());
  const applyUsersFilters = () => {
    setUsersStateFromControls({ page: 0 });
    render();
  };
  document.getElementById('applyUsersFilters')?.addEventListener('click', applyUsersFilters);
  document.getElementById('usersSearch')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') applyUsersFilters();
  });
  app.querySelectorAll('[data-users-priority]').forEach((button) => {
    button.addEventListener('click', () => {
      setUsersStateFromControls({ sortBy: button.getAttribute('data-users-priority') || 'created_desc', page: 0 });
      render();
    });
  });
  app.querySelectorAll('[data-users-cohort]').forEach((button) => {
    button.addEventListener('click', () => {
      setUsersStateFromControls({ cohortView: button.getAttribute('data-users-cohort') || 'all', page: 0 });
      render();
    });
  });
  app.querySelectorAll('[data-users-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      const presetId = button.getAttribute('data-users-preset') || 'all_new';
      const preset = usersOperatorPresetMeta(presetId);
      const pageSize = getUsersState().pageSize || 20;
      window.__usersState = {
        ...preset.state,
        page: 0,
        pageSize,
        pinIds: getUsersPinIds(),
      };
      render();
    });
  });
  document.getElementById('exportUsersBtn')?.addEventListener('click', async () => {
    const scope = document.getElementById('usersExportScope')?.value || 'current';
    try {
      await runUsersExportAction(scope);
    } catch (err) {
      alert(`Не удалось выгрузить CSV: ${err?.message || 'unknown'}`);
    }
  });
  document.getElementById('copyUsersBulkBtn')?.addEventListener('click', async () => {
    const mode = document.getElementById('usersBulkMode')?.value || 'tg_ids';
    const source = document.getElementById('usersBulkSource')?.value || 'current';
    await runUsersBulkCopyAction(mode, source);
  });
  app.querySelectorAll('[data-users-copy-view-url]').forEach((button) => {
    button.addEventListener('click', async () => {
      await copyUsersWorkingViewUrl();
    });
  });
  document.getElementById('clearUsersPinsBtn')?.addEventListener('click', () => {
    setUsersPinIds([]);
    render();
  });

  app.querySelectorAll('[data-users-page-size]').forEach((select) => {
    select.addEventListener('change', () => {
      const nextPageSize = Math.max(10, Math.min(50, Number(select.value) || 20));
      setUsersStateFromControls({ page: 0, pageSize: nextPageSize });
      render();
    });
  });
  app.querySelectorAll('[data-users-page-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.getAttribute('data-users-page-action') || '';
      const state = getUsersState();
      const currentPage = Math.max(0, Number(state.page || 0) || 0);
      const totalPages = Math.max(1, Number(button.closest('.aw-users-pagination')?.getAttribute('data-total-pages') || 1) || 1);
      let nextPage = currentPage;
      if (action === 'first') nextPage = 0;
      else if (action === 'prev') nextPage = Math.max(0, currentPage - 1);
      else if (action === 'next') nextPage = Math.min(totalPages - 1, currentPage + 1);
      else if (action === 'last') nextPage = Math.max(0, totalPages - 1);
      if (nextPage === currentPage && action !== 'first' && action !== 'last') return;
      setUsersStateExact({ page: nextPage });
      render();
    });
  });

  app.querySelectorAll('[data-users-followup]').forEach((button) => {
    button.addEventListener('click', async () => {
      const action = button.getAttribute('data-users-followup') || '';
      try {
        if (action === 'export_current') {
          await runUsersExportAction('current');
          return;
        }
        if (action === 'copy_tg_ids') {
          await runUsersBulkCopyAction('tg_ids', 'current');
          return;
        }
        if (action === 'copy_usernames') {
          await runUsersBulkCopyAction('usernames', 'current');
          return;
        }
        if (action === 'open_top_problem_users') {
          setUsersStateFromControls({ sortBy: 'problem_desc', cohortView: 'all', page: 0 });
          render();
          return;
        }
        if (action === 'open_dormant_payers') {
          setUsersStateFromControls({ sortBy: 'payments_desc', cohortView: 'dormant_payers', page: 0 });
          render();
        }
      } catch (err) {
        alert(`Не удалось выполнить follow-up action: ${err?.message || 'unknown'}`);
      }
    });
  });
  app.querySelectorAll('[data-users-compare-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const action = button.getAttribute('data-users-compare-action') || '';
      try {
        if (action === 'export_pins') {
          await runUsersPinnedExportAction();
          return;
        }
        if (action === 'copy_pins_tg_ids') {
          await runUsersPinnedBulkCopyAction('tg_ids');
          return;
        }
        if (action === 'copy_pins_usernames') {
          await runUsersPinnedBulkCopyAction('usernames');
          return;
        }
        if (action === 'copy_pins_user_ids') {
          await runUsersPinnedBulkCopyAction('user_ids');
          return;
        }
        if (action === 'open_top_problem') {
          openUsersCompareDrillTarget('top_problem');
          return;
        }
        if (action === 'open_dormant_payer') {
          openUsersCompareDrillTarget('dormant_payer');
        }
      } catch (err) {
        alert(`Не удалось выполнить compare drill action: ${err?.message || 'unknown'}`);
      }
    });
  });
  document.getElementById('selectVisibleUsersBtn')?.addEventListener('click', () => {
    const rows = app.querySelectorAll('[data-user-check]');
    const shouldSelect = !Array.from(rows).every((input) => input.checked);
    rows.forEach((input) => {
      input.checked = shouldSelect;
      try {
        const item = JSON.parse(input.getAttribute('data-user-check') || '{}');
        setUsersBasketItem(item, shouldSelect);
      } catch {}
    });
    render();
  });
  document.getElementById('toggleVisibleUsers')?.addEventListener('change', (e) => {
    const checked = !!e.target?.checked;
    app.querySelectorAll('[data-user-check]').forEach((input) => {
      input.checked = checked;
      try {
        const item = JSON.parse(input.getAttribute('data-user-check') || '{}');
        setUsersBasketItem(item, checked);
      } catch {}
    });
    render();
  });
  document.getElementById('clearUsersBasketBtn')?.addEventListener('click', () => {
    clearUsersBasket();
    render();
  });
  app.querySelectorAll('[data-user-check]').forEach((input) => {
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('change', () => {
      try {
        const item = JSON.parse(input.getAttribute('data-user-check') || '{}');
        setUsersBasketItem(item, !!input.checked);
      } catch {}
      render();
    });
  });
  app.querySelectorAll('[data-user-quick]').forEach((button) => {
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const item = JSON.parse(button.getAttribute('data-user-quick-payload') || '{}');
        const action = button.getAttribute('data-user-quick') || '';
        if (action === 'open_card') {
          const back = encodeURIComponent(buildUsersListHref(getUsersState()));
          history.pushState({}, '', `/admin/users/${Number(item.userId || 0) || 0}?back=${back}`);
          render();
          return;
        }
        if (action === 'copy_tg_id') {
          await runUserRowCopyAction(item, 'tg_ids');
          return;
        }
        if (action === 'copy_username') {
          await runUserRowCopyAction(item, 'usernames');
          return;
        }
        if (action === 'toggle_pin') {
          const result = toggleUsersPin(item);
          if (!result.ok && result.reason === 'pin_limit') {
            alert('В compare rail можно закрепить до 5 user cards.');
            return;
          }
          render();
          return;
        }
        if (action === 'toggle_basket') {
          setUsersBasketItem(item, !isUserInBasket(item.userId));
          render();
        }
      } catch (err) {
        alert(`Не удалось выполнить row action: ${err?.message || 'unknown'}`);
      }
    });
  });
  app.querySelectorAll('[data-user-row]').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target?.closest('input,button,a,label,select,textarea')) return;
      const id = row.getAttribute('data-user-row');
      const back = encodeURIComponent(buildUsersListHref(getUsersState()));
      history.pushState({}, '', `/admin/users/${id}?back=${back}`);
      render();
    });
  });
  app.querySelectorAll('[data-payment-row]').forEach((row) => {
    row.addEventListener('click', () => {
      const id = row.getAttribute('data-payment-row');
      const back = encodeURIComponent(`${location.pathname}${location.search}`);
      history.pushState({}, '', `/admin/payments/${id}?back=${back}`);
      render();
    });
  });
  document.getElementById('saveNoteBtn')?.addEventListener('click', async () => {
    const userId = document.getElementById('saveNoteBtn').getAttribute('data-user-id');
    const text = document.getElementById('noteText')?.value || '';
    const res = await api('/api/admin-web-write?action=set_note', { method: 'POST', body: JSON.stringify({ userId, text }) });
    if (!res.ok) alert(`Не удалось сохранить note: ${res.data?.error || 'unknown'}`);
    else render();
  });
  document.getElementById('clearNoteBtn')?.addEventListener('click', async () => {
    const userId = document.getElementById('clearNoteBtn').getAttribute('data-user-id');
    const res = await api('/api/admin-web-write?action=clear_note', { method: 'POST', body: JSON.stringify({ userId }) });
    if (!res.ok) alert(`Не удалось очистить note: ${res.data?.error || 'unknown'}`);
    else render();
  });
  document.getElementById('revokeAllBtn')?.addEventListener('click', async () => {
    if (!confirm('Revoke all web sessions? Текущая founder-сессия тоже будет закрыта.')) return;
    const res = await api('/api/admin-web-auth?action=revoke_all', { method: 'POST' });
    if (!res.ok) {
      alert(`Не удалось выполнить revoke: ${res.data?.error || 'unknown'}`);
      return render();
    }
    history.replaceState({}, '', '/admin/login');
    window.__loginState = { error: 'Все web-сессии отозваны. Войди заново.' };
    render();
  });

  app.querySelectorAll('[data-edit-draft]').forEach((btn) => {
    btn.addEventListener('click', () => {
      seedCommsEditorFromDraft({
        id: btn.getAttribute('data-edit-draft') || '',
        title: decodeURIComponent(btn.getAttribute('data-draft-title') || ''),
        audience: decodeURIComponent(btn.getAttribute('data-draft-audience') || 'all'),
        bodyText: decodeURIComponent(btn.getAttribute('data-draft-body') || ''),
      });
      app.innerHTML = commsView(window.__commsPageData || {});
      bindShell();
    });
  });

  document.getElementById('newDraftBtn')?.addEventListener('click', () => {
    resetCommsEditor();
    app.innerHTML = commsView(window.__commsPageData || {});
    bindShell();
  });

  const updateCommsEditorState = () => {
    window.__commsState = {
      initialized: true,
      draftId: document.getElementById('draftIdInput')?.value || '',
      title: document.getElementById('draftTitleInput')?.value || '',
      audience: document.getElementById('draftAudienceInput')?.value || 'all',
      bodyText: document.getElementById('draftBodyInput')?.value || '',
    };
    syncCommsPreview();
  };
  document.getElementById('draftTitleInput')?.addEventListener('input', updateCommsEditorState);
  document.getElementById('draftAudienceInput')?.addEventListener('change', updateCommsEditorState);
  document.getElementById('draftBodyInput')?.addEventListener('input', updateCommsEditorState);

  document.getElementById('saveDraftBtn')?.addEventListener('click', async () => {
    updateCommsEditorState();
    const payload = {
      draftId: window.__commsState?.draftId || '',
      title: window.__commsState?.title || '',
      audience: window.__commsState?.audience || 'all',
      bodyText: window.__commsState?.bodyText || '',
    };
    const action = payload.draftId ? 'update_notice_draft' : 'create_notice_draft';
    const res = await api(`/api/admin-web-write?action=${action}`, { method: 'POST', body: JSON.stringify(payload) });
    if (!res.ok) {
      alert(`Не удалось сохранить draft: ${res.data?.error || 'unknown'}`);
      return;
    }
    if (res.data?.draft) seedCommsEditorFromDraft(res.data.draft);
    await render();
  });

  document.getElementById('testSendDraftBtn')?.addEventListener('click', async () => {
    const draftId = document.getElementById('draftIdInput')?.value || '';
    if (!draftId) return;
    if (!confirm('Founder test send отправит preview notice в твой Telegram. Продолжить?')) return;
    const res = await api('/api/admin-web-write?action=test_send_notice', { method: 'POST', body: JSON.stringify({ draftId }) });
    if (!res.ok) {
      alert(`Не удалось выполнить test send: ${res.data?.error || 'unknown'}`);
      return;
    }
    alert('Founder test send отправлен в Telegram.');
    await render();
  });
}


function bindLogin() {
  document.getElementById('startLoginBtn')?.addEventListener('click', async () => {
    const secret = document.getElementById('secretInput')?.value || '';
    const res = await api('/api/admin-web-auth?action=start', { method: 'POST', body: JSON.stringify({ secret }) });
    if (!res.ok) {
      writeLoginState({ error: authErrorLabel(res.data?.error || 'login_failed') });
      return render();
    }
    writeLoginState({ challengeId: res.data.challengeId });
    await render();
  });

  document.getElementById('newChallengeBtn')?.addEventListener('click', () => {
    clearLoginState();
    history.replaceState({}, '', '/admin/login');
    render();
  });

  document.getElementById('resetChallengeBtn')?.addEventListener('click', () => {
    clearLoginState();
    history.replaceState({}, '', '/admin/login');
    render();
  });

  document.getElementById('verifyCodeBtn')?.addEventListener('click', async () => {
    const challengeId = String(getLoginState()?.challengeId || '').trim();
    const code = document.getElementById('otpInput')?.value || '';
    const res = await api('/api/admin-web-auth?action=verify_code', { method: 'POST', body: JSON.stringify({ challengeId, code }) });
    if (!res.ok) {
      const statusCheck = await checkLoginChallengeStatus({ silent: true });
      if (statusCheck.ok && statusCheck.status === 'approved') return;
      writeLoginState({ challengeId, error: authErrorLabel(res.data?.error || 'invalid_code') });
      return render();
    }
    clearLoginState();
    history.replaceState({}, '', '/admin');
    render();
  });

  document.getElementById('checkStatusBtn')?.addEventListener('click', async () => {
    await checkLoginChallengeStatus({ silent: false });
  });
}

window.addEventListener('popstate', () => render());
window.addEventListener('beforeunload', () => stopLoginStatusPolling());
render();
