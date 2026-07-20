const app = document.getElementById('app');

const BRAND_LOGO = '/assets/brand/collabka-mark-blue.png';
const ADMIN_OPERATOR_REFRESH_MODE = 'только ручное обновление';
const ADMIN_MOBILE_NAV_MEDIA = '(max-width: 720px)';

function getAdminUiState() {
  if (!window.__adminUi || typeof window.__adminUi !== 'object') window.__adminUi = { mobileNavOpen: false };
  if (typeof window.__adminUi.mobileNavOpen !== 'boolean') window.__adminUi.mobileNavOpen = false;
  return window.__adminUi;
}

function isAdminMobileViewport() {
  return !!window.matchMedia?.(ADMIN_MOBILE_NAV_MEDIA).matches;
}

function syncAdminMobileNavDom() {
  const state = getAdminUiState();
  const shellNode = document.querySelector('.aw-shell');
  const open = !!state.mobileNavOpen && isAdminMobileViewport();
  if (shellNode) shellNode.classList.toggle('is-nav-open', open);
  document.body.classList.toggle('is-admin-nav-open', open);
  const toggle = document.querySelector('[data-mobile-nav-toggle]');
  if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  const backdrop = document.querySelector('.aw-sidebar-backdrop');
  if (backdrop) backdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
}

function setAdminMobileNavOpen(next) {
  const state = getAdminUiState();
  state.mobileNavOpen = !!next;
  syncAdminMobileNavDom();
}

function closeAdminMobileNav() {
  setAdminMobileNavOpen(false);
}

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

function downloadTextFile(content, filename = 'users-list.txt') {
  const blob = new Blob([String(content || '')], { type: 'text/plain;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1500);
}

function ensureCopySheetHost() {
  let host = document.getElementById('awCopySheetHost');
  if (host) return host;
  host = document.createElement('div');
  host.id = 'awCopySheetHost';
  host.className = 'aw-copy-sheet-host';
  host.innerHTML = `
    <div class="aw-copy-sheet-backdrop" data-copy-sheet-close></div>
    <div class="aw-copy-sheet" role="dialog" aria-modal="true" aria-label="Ручное копирование">
      <div class="aw-copy-sheet-head">
        <div>
          <strong id="awCopySheetTitle">Ручное копирование</strong>
          <span id="awCopySheetHint">Браузер не дал скопировать автоматически. Текст уже подготовлен для ручного копирования.</span>
        </div>
        <button type="button" class="aw-button ghost" data-copy-sheet-close>Закрыть</button>
      </div>
      <textarea id="awCopySheetTextarea" class="aw-textarea aw-copy-sheet-textarea" spellcheck="false"></textarea>
      <div class="aw-copy-sheet-actions">
        <button type="button" class="aw-button secondary" id="awCopySheetSelectBtn">Выделить всё</button>
        <button type="button" class="aw-button ghost" id="awCopySheetDownloadBtn">Скачать .txt</button>
      </div>
    </div>
  `;
  document.body.appendChild(host);
  const close = () => host.classList.remove('is-open');
  host.querySelectorAll('[data-copy-sheet-close]').forEach((node) => node.addEventListener('click', close));
  host.querySelector('#awCopySheetSelectBtn')?.addEventListener('click', () => {
    const area = host.querySelector('#awCopySheetTextarea');
    area?.focus();
    area?.select();
  });
  host.querySelector('#awCopySheetDownloadBtn')?.addEventListener('click', () => {
    const area = host.querySelector('#awCopySheetTextarea');
    downloadTextFile(area?.value || '', host.dataset.filename || 'users-list.txt');
  });
  host.addEventListener('click', (event) => {
    if (event.target === host) close();
  });
  return host;
}

function openCopySheet({ title = 'Ручное копирование', hint = '', text = '', filename = 'users-list.txt' } = {}) {
  const host = ensureCopySheetHost();
  host.dataset.filename = filename;
  const titleNode = host.querySelector('#awCopySheetTitle');
  const hintNode = host.querySelector('#awCopySheetHint');
  const area = host.querySelector('#awCopySheetTextarea');
  if (titleNode) titleNode.textContent = title;
  if (hintNode) hintNode.textContent = hint || 'Браузер не дал скопировать автоматически. Текст уже подготовлен для ручного копирования.';
  if (area) {
    area.value = String(text || '');
    requestAnimationFrame(() => {
      area.focus();
      area.select();
    });
  }
  host.classList.add('is-open');
}

async function copyTextToClipboard(text, opts = {}) {
  const value = String(text || '');
  if (!value) return { ok: false, fallbackOpened: false };
  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', 'readonly');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  area.style.pointerEvents = 'none';
  area.style.left = '-9999px';
  document.body.appendChild(area);
  area.focus();
  area.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch {}
  area.remove();
  if (ok) return { ok: true, fallbackOpened: false };
  if (opts.openFallback !== false) {
    openCopySheet({
      title: opts.title || 'Ручное копирование',
      hint: opts.hint || 'Автокопирование не сработало. Текст уже выделен: нажми Ctrl+C или скачай .txt.',
      text: value,
      filename: opts.filename || 'users-list.txt',
    });
    return { ok: false, fallbackOpened: true };
  }
  return { ok: false, fallbackOpened: false };
}

function focusUsersWorkingSlice(reason = '') {
  const target = document.querySelector('.aw-users-sticky-shell') || document.querySelector('.aw-users-table-meta-strip');
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (!target) return;
  target.classList.remove('is-just-focused');
  requestAnimationFrame(() => {
    target.classList.add('is-just-focused');
    setTimeout(() => target.classList.remove('is-just-focused'), reason === 'preset' ? 1600 : 1200);
  });
}

function ensureToastHost() {
  let host = document.getElementById('awToastHost');
  if (host) return host;
  host = document.createElement('div');
  host.id = 'awToastHost';
  host.className = 'aw-toast-host';
  document.body.appendChild(host);
  return host;
}

function showToast(message, variant = 'info', opts = {}) {
  const host = ensureToastHost();
  const toast = document.createElement('div');
  toast.className = `aw-toast is-${variant}`;
  toast.innerHTML = `<strong>${variant === 'error' ? 'Ошибка' : variant === 'success' ? 'Готово' : 'Статус'}</strong><span>${escapeHtml(String(message || '').trim())}</span>`;
  host.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  const ttl = Math.max(1800, Number(opts.ttl || 2600) || 2600);
  const remove = () => {
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 180);
  };
  toast.addEventListener('click', remove);
  setTimeout(remove, ttl);
}


const INTERACTIVE_FEEDBACK_SELECTOR = [
  '.aw-button',
  '.aw-priority-pill',
  '.aw-cohort-counter-card',
  '.aw-preset-card',
  '.aw-action-card',
  '.aw-workspace-tab',
  '.aw-row-action',
  '.aw-nav a',
].join(', ');

function pulseInteractiveFeedback(node, mode = 'pressed') {
  const target = node?.closest?.(INTERACTIVE_FEEDBACK_SELECTOR);
  if (!target) return;
  const className = mode === 'confirmed' ? 'is-confirmed' : 'is-pressed';
  target.classList.remove(className);
  requestAnimationFrame(() => target.classList.add(className));
  setTimeout(() => target.classList.remove(className), mode === 'confirmed' ? 1700 : 180);
}

function attachInteractiveFeedback(root = document) {
  if (!root || root.__awInteractiveFeedbackBound) return;
  root.__awInteractiveFeedbackBound = true;
  root.addEventListener('pointerdown', (event) => {
    const target = event.target?.closest?.(INTERACTIVE_FEEDBACK_SELECTOR);
    if (!target) return;
    pulseInteractiveFeedback(target, 'pressed');
  });
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
  syncUsersUrlState(window.__usersState, { replace: true });
  return getUsersState();
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
  if (key === 'unknown' || key === 'optional' || key === 'info' || key === 'not_enabled') return 'info';
  return '';
}

function runtimeStateLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return ({ ok: 'OK', degraded: 'Нужна проверка', missing: 'Не настроено', unknown: 'Справочно', warning: 'Нужна проверка', error: 'Не настроено', info: 'Справочно', optional: 'Опционально', not_enabled: 'Не включено' })[key] || (key || '—');
}

function runtimeActionabilityClass(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'none') return 'good';
  if (key === 'check') return 'warn';
  if (key === 'setup') return 'bad';
  return 'info';
}

function runtimeActionabilityLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return ({ none: 'Действие не нужно', check: 'Нужно проверить', setup: 'Нужна настройка', info: 'Справочно' })[key] || 'Справочно';
}

function configPresenceLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return ({ configured: 'настроено', missing: 'отсутствует', optional: 'опционально', not_enabled: 'не включено' })[key] || (key || '—');
}

function sourceLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return ({
    db: 'DB',
    redis: 'Redis',
    qstash: 'QStash',
    payments: 'Платежи',
    admin_web: 'Web-admin',
    config: 'Конфигурация',
    runtime: 'Система',
    controls: 'Управление',
  })[key] || (value || 'Система');
}

function controlSurfaceLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return ({
    'web login': 'Web-вход',
    'pay accept': 'Приём платежей',
    'auto apply': 'Автовыдача',
    'match/feat': 'Матчинг / фичеринг',
    'fan-out': 'Рассылка fan-out',
    'fallback': 'Fallback-режим',
    'web-admin login': 'Web-вход',
    'qstash fan-out': 'QStash fan-out',
    'payments fallback': 'Fallback платежей',
    'match/feat auto-apply': 'Автоприменение матчинга / фичеринга',
    'founder sale': 'Founder Sale',
  })[key] || String(value || 'Контур');
}

function controlSurfaceStateLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return ({ on: 'ВКЛ', off: 'ВЫКЛ', ok: 'OK', enabled: 'ВКЛ', disabled: 'ВЫКЛ' })[key] || String(value || '—');
}

function founderTextLabel(value) {
  return String(value || '')
    .replace(/read-first/gi, 'только чтение')
    .replace(/owner-only/gi, 'только для фаундера')
    .replace(/operator UI/gi, 'операторского интерфейса')
    .replace(/operator UX/gi, 'операторского интерфейса')
    .replace(/web-admin/gi, 'web-админки')
    .replace(/web-control/gi, 'web-контроль')
    .replace(/web-write/gi, 'web-write')
    .replace(/write-path/gi, 'write-path')
    .replace(/bot-only/gi, 'только в Telegram')
    .replace(/publish path/gi, 'publish-path')
    .replace(/owner-policy/gi, 'фаундерскую политику')
    .replace(/founder-layer/gi, 'фаундерский слой')
    .replace(/owner-grade/gi, 'фаундерский')
    .replace(/web-action/gi, 'web-действие')
    .replace(/web-sessions/gi, 'web-сессии');
}

function runtimeCardLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return ({
    db: 'База данных',
    redis: 'Redis',
    delivery: 'Доставка / QStash',
    payments: 'Платежи',
    'web-admin': 'Web-админка',
    config: 'Конфигурация',
    runtime: 'Система',
    controls: 'Контуры управления',
    'active backlog': 'Активная очередь',
    'retry problems': 'Проблемы retry',
    'cooling windows': 'Окна охлаждения',
    'ops digest': 'Сводка ops',
    'audit buffer': 'Буфер аудита',
    'broadcast / delivery': 'Рассылка / доставка',
    'retry monitor': 'Монитор retry',
    'last retry': 'Последний retry',
    'official publish stuck': 'Застревание publish',
    'qstash reschedule_failed': 'QStash reschedule_failed',
    qstash: 'QStash',
    'retry signal': 'Сигнал retry',
    'paused controls': 'Паузы контуров',
    'incident modes': 'Инцидентные режимы',
  })[key] || runtimeTextLabel(value || 'Контур');
}

function runtimeTextLabel(value) {
  return founderTextLabel(value)
    .replace(/Last updated:/gi, 'Обновлено:')
    .replace(/operator toggles OFF/gi, 'оператор не ставил контур на паузу')
    .replace(/runtime overrides/gi, 'runtime override-режимы')
    .replace(/pending \+ inflight \+ stuck counts/gi, 'pending + inflight + stuck')
    .replace(/lanes без обязательного сигнала/gi, 'контуры без обязательного сигнала')
    .replace(/lanes without mandatory signal/gi, 'контуры без обязательного сигнала')
    .replace(/DB configured/gi, 'База настроена')
    .replace(/Redis configured/gi, 'Redis настроен')
    .replace(/QStash auth incomplete/gi, 'QStash auth настроен не полностью')
    .replace(/QStash publish и verify настроены/gi, 'QStash publish и verify настроены')
    .replace(/QStash настроен не полностью/gi, 'QStash настроен не полностью')
    .replace(/QStash not configured/gi, 'QStash не настроен')
    .replace(/stale retry/gi, 'старый retry-сигнал')
    .replace(/stale signal/gi, 'старый сигнал')
    .replace(/Core config present/gi, 'Базовый конфиг найден')
    .replace(/Payments fallback disabled/gi, 'Fallback платежей выключен')
    .replace(/Admin web auth configured/gi, 'Web-авторизация настроена')
    .replace(/last retry error/gi, 'последняя ошибка retry')
    .replace(/last retry returned error/gi, 'последний retry вернул ошибку')
    .replace(/Retry signal/gi, 'Сигнал retry')
    .replace(/Retry status/gi, 'статус retry')
    .replace(/Backlog, retry cooldown and stuck-signals without write-path actions\./gi, 'Backlog, retry cooldown и stuck-сигналы без write-path действий.')
    .replace(/retry cooldown/gi, 'retry cooldown')
    .replace(/requeue cooldown/gi, 'requeue cooldown')
    .replace(/read-admin/gi, 'read-admin')
    .replace(/setup gaps \/ missing env/gi, 'setup-gap / missing env')
    .replace(/unknown \/ optional \/ no signal/gi, 'unknown / optional / no signal')
    .replace(/no signal/gi, 'без сигнала')
    .replace(/last sent not recorded/gi, 'последняя отправка не зафиксирована')
    .replace(/queue 0 · inflight 0/gi, 'очередь 0 · inflight 0')
    .replace(/official publish stuck/gi, 'official publish stuck');
}

function runtimeItemHasProfileContactDrift(item = {}) {
  const hay = [item.label, item.title, item.summary, item.message, item.detail, item.note, item.meaning, item.nextStep, item.action].join(' ').toLowerCase();
  return hay.includes('column_profile_contact_does_not_exist') || hay.includes('profile_contact');
}

function runtimeItemIsQstashOptional(item = {}) {
  const hay = [item.key, item.label, item.title, item.summary, item.message, item.detail, item.note, item.meaning].join(' ').toLowerCase();
  return hay.includes('qstash_url')
    || hay.includes('qstash_token')
    || hay.includes('qstash_current_signing_key')
    || hay.includes('qstash_next_signing_key')
    || hay.includes('qstash настроен не полностью')
    || (hay.includes('qstash') && (hay.includes('not configured') || hay.includes('auth incomplete')));
}

function runtimeItemMeaning(item = {}) {
  if (runtimeItemHasProfileContactDrift(item)) {
    return 'Похоже на schema/query drift: retry-контур обращается к legacy-полю profile_contact и уже спорит с текущей схемой.';
  }
  if (runtimeItemIsQstashOptional(item)) {
    return 'Для базового admin v1 это не блокер, но QStash publish/verify contour должен быть собран полностью, если нужен delivery/retry.';
  }
  return runtimeTextLabel(item.meaning || item.message || item.detail || item.hint || '');
}

function runtimeItemNextStep(item = {}, fallback = '') {
  if (runtimeItemHasProfileContactDrift(item)) {
    return 'Проверь source-level retry handler / SQL / воркер, где ещё используется profile_contact, и выровняй код со схемой БД.';
  }
  if (runtimeItemIsQstashOptional(item)) {
    return 'Если delivery/retry реально нужен, держи в env и publish token, и current signing key. Partial config не считается production-ready QStash контуром.';
  }
  return runtimeTextLabel(item.nextStep || item.action || fallback || 'Обнови Runtime вручную и сверяй соседние сигналы.');
}

function runtimeItemSummary(item = {}, fallback = '') {
  return runtimeTextLabel(item.summary || item.title || fallback || '—');
}

function runtimeItemDetail(item = {}, fallback = '') {
  if (runtimeItemHasProfileContactDrift(item)) {
    return 'Сигнал не про QStash env сам по себе: ошибка выглядит как реальный source/schema drift в retry-контуре.';
  }
  return runtimeTextLabel(item.detail || item.message || fallback || '');
}

function runtimeConfigBadgeLabel(item = {}) {
  if (runtimeItemIsQstashOptional(item)) return 'Опционально для delivery';
  return '';
}

function runtimeConfigSemanticLabel(item = {}) {
  if (runtimeItemIsQstashOptional(item)) return 'Опционально';
  return runtimeTextLabel(item.semanticLabel || runtimeStateLabel(item.toneState || item.state));
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
  if (value === true) return 'ВКЛ';
  if (value === false) return 'ВЫКЛ';
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function controlAuditSummary(item = {}) {
  const label = controlSurfaceLabel(item?.label || item?.controlId || 'Контур');
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
        <strong>Контрольная плоскость</strong>
        <span>ручное обновление · единый runtime source</span>
      </div>
      <div class="aw-statusbar-chips">
        ${items.map((item) => `
          <div class="aw-control-chip ${controlToneClass(item)}">
            <span>${escapeHtml(controlSurfaceLabel(item.shortLabel || item.label || 'Контур'))}</span>
            <strong>${escapeHtml(controlSurfaceStateLabel(item.stateLabel || (item.value ? 'ВКЛ' : 'ВЫКЛ')))}</strong>
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
        <h2>Операторские переключатели</h2>
        <div class="aw-list">
          ${items.map((item) => `
            <div class="aw-list-item aw-control-list-item">
              <div class="aw-control-list-head">
                <strong>${escapeHtml(controlSurfaceLabel(item.label || item.shortLabel || 'Контур'))}</strong>
                <span class="aw-status ${String(item.tone || '').trim().toLowerCase()}">${escapeHtml(controlSurfaceStateLabel(item.stateLabel || (item.value ? 'ВКЛ' : 'ВЫКЛ')))}</span>
              </div>
              <small>Контур: ${escapeHtml(item.scope || 'system')} · изменил ${escapeHtml(item.changedBy || '—')} · ${escapeHtml(formatDate(item.changedAt))}</small>
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
  return ({ success: 'успех', pending: 'ожидает', failed: 'ошибка', fallback: 'fallback', unknown: 'неизвестно' })[key] || (key || 'неизвестно');
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

function founderSensitivityMeta(kind = 'routine') {
  const key = String(kind || '').trim().toLowerCase();
  if (key === 'sensitive') {
    return { label: 'Чувствительное изменение', tone: 'is-bad', hint: 'Трогать только когда понимаешь системный эффект и готов закрыть текущую web-сессию.' };
  }
  if (key === 'attention') {
    return { label: 'Нужна проверка', tone: 'is-warn', hint: 'Сначала проверь предупреждения и Runtime, потом уже меняй контур.' };
  }
  return { label: 'Безопасно для рутины', tone: 'is-good', hint: 'Можно использовать как обычный фаундерский обзор без широких побочных эффектов.' };
}

function founderControlCards(model = {}) {
  const founderSale = model.founderSale || {};
  const controls = model.controls || {};
  const warnings = Array.isArray(model.warnings) ? model.warnings : [];
  return [
    {
      title: 'Web-сессии',
      kind: controls.canRevokeAllSessions ? 'sensitive' : 'routine',
      meaning: controls.canRevokeAllSessions
        ? 'Единственный web-контроль для фаундера: завершает все web-сессии, включая текущую.'
        : 'В этой сессии чувствительное фаундерское действие недоступно; экран остаётся только для чтения.',
      when: controls.canRevokeAllSessions
        ? 'Используй только когда нужно жёстко закрыть доступ и начать новую фаундерскую сессию.'
        : 'Оставайся в режиме только для чтения и не лечи доступ через случайные web-действия.',
    },
    {
      title: 'Founder Sale и политика',
      kind: founderSale.enabled ? 'attention' : 'routine',
      meaning: founderSale.enabled
        ? 'Founder Sale сейчас включён: меняется коммерческая подача и рамка некоторых поверхностей.'
        : 'Founder Sale выключен: блок нужен как справочная фаундерская политика, а не как активный режим продаж.',
      when: 'Проверяй перед изменением позиционирования, цен или фаундерских решений по монетизации.',
    },
    {
      title: 'Telegram-only и publish-path',
      kind: 'sensitive',
      meaning: Array.isArray(controls.botOnlyControls) && controls.botOnlyControls.length
        ? `Через web-admin специально недоступны: ${controls.botOnlyControls.join(' · ')}.`
        : 'Чувствительные контроли и publish-path намеренно вынесены из web-админки.',
      when: 'Если нужен чувствительный контроль, publish-path или системная мутация, переходи в Telegram-админку.',
    },
  ];
}

function pathParts() {
  return location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
}

const SECTION_MANIFEST = {
  overview: {
    key: 'overview',
    label: 'Обзор',
    subtitle: 'Командный cockpit: главный статус, следующий owner-шаг и короткие workspace-снимки без live-шума.',
    route: '/admin',
    group: 'Оператор',
    navCaption: 'командный вход',
    visible: () => true,
  },
  users: {
    key: 'users',
    label: 'Пользователи',
    subtitle: 'Плотный ops/audit список: фильтры, экспорт, safe bulk utilities и быстрый drilldown в карточку.',
    route: '/admin/users',
    group: 'Оператор',
    navCaption: 'люди и срезы',
    visible: () => true,
  },
  runtime: {
    key: 'runtime',
    label: 'Система',
    subtitle: 'Общий статус системы, incident strip и опорный runtime-срез без write-path действий.',
    route: '/admin/runtime',
    group: 'Оператор',
    navCaption: 'система и очереди',
    visible: () => true,
  },
  payments: {
    key: 'payments',
    label: 'Платежи',
    subtitle: 'Read-only срез платёжной активности, fallback-сигналов и проблемных кейсов.',
    route: '/admin/payments',
    group: 'Оператор',
    navCaption: 'монетизация и разбор',
    visible: () => true,
  },
  comms: {
    key: 'comms',
    label: 'Коммуникации',
    subtitle: 'Контур драфтов, предпросмотра и фаундерской тест-отправки без live mass send.',
    route: '/admin/comms',
    group: 'Оператор',
    navCaption: 'драфты и предпросмотр',
    visible: () => true,
  },
  help: {
    key: 'help',
    label: 'Помощь',
    subtitle: 'Короткая operator-справка по web-admin без длинной документации и догадок.',
    route: '/admin/help',
    group: 'Оператор',
    navCaption: 'операторский мануал',
    visible: () => true,
  },
  founder: {
    key: 'founder',
    label: 'Фаундер',
    subtitle: 'Фаундерский слой только для чтения: отдельно от операторского интерфейса и без опасных web-write действий.',
    route: '/admin/founder',
    group: 'founder',
    navCaption: 'фаундерские контроли',
    visible: (session = {}) => !!session?.isFounder,
  },
};

const SECTION_GROUP_LABELS = {
  operator: 'Оператор',
  founder: 'Фаундер',
};

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
  if (parts[1] === 'help') return { page: 'help' };
  if (parts[1] === 'founder') return { page: 'founder' };
  return { page: 'overview' };
}

function sectionKeyForRoutePage(page = '') {
  const key = String(page || '').trim();
  if (key === 'userDetail') return 'users';
  if (key === 'paymentDetail') return 'payments';
  return SECTION_MANIFEST[key] ? key : 'overview';
}

function sectionMeta(page = '', session = {}) {
  const key = sectionKeyForRoutePage(page);
  const meta = SECTION_MANIFEST[key] || SECTION_MANIFEST.overview;
  return {
    ...meta,
    key,
    visible: typeof meta.visible === 'function' ? meta.visible(session) : true,
  };
}

function sectionGroups(session = {}) {
  const groups = {};
  for (const meta of Object.values(SECTION_MANIFEST)) {
    if (meta.key !== sectionKeyForRoutePage(meta.key)) continue;
    const visible = typeof meta.visible === 'function' ? meta.visible(session) : true;
    if (!visible) continue;
    const group = String(meta.group || 'Оператор');
    if (!groups[group]) groups[group] = [];
    groups[group].push(meta);
  }
  return groups;
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
    code_locked: 'Резервный код заблокирован после лимита ошибок. Подтверди вход кнопкой в Telegram или запроси новый вход.',
    fallback_code_disabled: 'Резервный код отключён. Используй Telegram-кнопку подтверждения.',
    fallback_actor_not_allowed: 'Резервный код настроен некорректно: actor не входит в approver list.',
    challenge_not_found: 'Challenge не найден. Запроси новый вход.',
    challenge_expired: 'Challenge истёк. Запроси новый вход.',
    challenge_not_pending: 'Этот challenge уже обработан. Проверь подтверждение или запроси новый вход.',
    challenge_not_approved: 'Вход ещё не подтверждён в Telegram.',
    challenge_consumed: 'Этот challenge уже обменян на сессию. Запроси новый вход, если cookie потеряна.',
    browser_verifier_missing: 'Этот браузер не создавал challenge. Запроси новый вход в этом окне.',
    browser_binding_mismatch: 'Challenge привязан к другому браузеру. Пересланная ссылка не даёт доступ.',
    auth_store_unavailable: 'Хранилище авторизации временно недоступно. Вход закрыт fail-closed.',
    rate_limited: 'Слишком много попыток. Подожди и повтори позже.',
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

async function exchangeLoginChallenge(challengeId) {
  const res = await api('/api/admin-web-auth?action=exchange', {
    method: 'POST',
    body: JSON.stringify({ challengeId }),
  });
  if (!res.ok) return { ok: false, error: res.data?.error || 'session_issue_failed' };
  stopLoginStatusPolling();
  clearLoginState();
  history.replaceState({}, '', '/admin');
  await render();
  return { ok: true };
}

async function checkLoginChallengeStatus({ silent = false } = {}) {
  const state = getLoginState() || {};
  const challengeId = String(state.challengeId || '').trim();
  if (!challengeId) return { ok: false, error: 'challenge_id_required' };
  const res = await api(`/api/admin-web-auth?action=status&challengeId=${encodeURIComponent(challengeId)}`);
  if (!res.ok) {
    const errorCode = res.data?.error || 'status_failed';
    const error = authErrorLabel(errorCode);
    if (!silent) {
      writeLoginState({ ...state, challengeId, error });
      render();
    }
    return { ok: false, error, errorCode };
  }
  const status = String(res.data?.status || 'pending');
  const nextState = {
    ...state,
    challengeId,
    fallbackCodeEnabled: res.data?.fallbackCodeEnabled === true,
  };
  if (status === 'approved' || status === 'consumed') {
    const exchanged = await exchangeLoginChallenge(challengeId);
    if (!exchanged.ok) {
      const error = authErrorLabel(exchanged.error || 'session_issue_failed');
      writeLoginState({ ...nextState, error });
      if (!silent) render();
      return { ok: false, status, error };
    }
    return { ok: true, status };
  }
  if (status === 'denied') {
    stopLoginStatusPolling();
    writeLoginState({ ...nextState, error: authErrorLabel('denied') });
    if (!silent) render();
    return { ok: false, status };
  }
  if (status === 'expired') {
    stopLoginStatusPolling();
    writeLoginState({ ...nextState, error: authErrorLabel('challenge_expired') });
    if (!silent) render();
    return { ok: false, status };
  }
  if (!silent) {
    writeLoginState({ ...nextState, error: 'Вход ещё не подтверждён. Окно проверяет статус каждые несколько секунд.' });
    render();
  } else {
    writeLoginState(nextState);
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

function navLink(href, label, active, caption = '') {
  return `<a href="${href}" data-link class="${active ? 'is-active' : ''}"><span class="aw-nav-link-copy"><strong>${escapeHtml(label)}</strong>${caption ? `<span class="aw-nav-caption">${escapeHtml(caption)}</span>` : ''}</span></a>`;
}

function renderSidebarNav(session = {}, route = routeInfo()) {
  const groups = sectionGroups(session);
  const order = ['Оператор', 'founder'];
  return order.map((groupKey) => {
    const items = Array.isArray(groups[groupKey]) ? groups[groupKey] : [];
    if (!items.length) return '';
    return `
      <div class="aw-nav-group">
        <div class="aw-nav-group-label">${escapeHtml(SECTION_GROUP_LABELS[groupKey] || groupKey)}</div>
        ${items.map((meta) => {
          const href = meta.key === 'users'
            ? (route.page === 'userDetail' ? userDetailBackHref() : buildUsersListHref(getUsersState()))
            : meta.route;
          return navLink(href, meta.label, sectionKeyForRoutePage(route.page) === meta.key, meta.navCaption || '');
        }).join('')}
      </div>
    `;
  }).join('');
}

function shell(title, subtitle, body, session, pageKey = '') {
  const route = routeInfo();
  const meta = sectionMeta(pageKey || route.page, session);
  const resolvedTitle = title || meta.label || 'Overview';
  const resolvedSubtitle = subtitle || meta.subtitle || '';
  const mobileNavOpen = !!getAdminUiState().mobileNavOpen;
  return `
    <div class="aw-shell ${mobileNavOpen ? 'is-nav-open' : ''}">
      <button class="aw-sidebar-backdrop" type="button" aria-label="Закрыть навигацию" aria-hidden="${mobileNavOpen ? 'false' : 'true'}" data-mobile-nav-close></button>
      <aside class="aw-sidebar">
        <div class="aw-brand">
          <img src="${BRAND_LOGO}" alt="Collabka" />
          <div class="aw-brand-copy">
            <strong>Collabka PR</strong>
            <span>Web Admin v1</span>
          </div>
        </div>
        <nav class="aw-nav" id="awSidebarNav">
          ${renderSidebarNav(session, route)}
        </nav>
      </aside>
      <main class="aw-main">
        <div class="aw-topbar">
          <div class="aw-topbar-left">
            <button class="aw-button ghost aw-mobile-nav-toggle" type="button" aria-expanded="${mobileNavOpen ? 'true' : 'false'}" aria-controls="awSidebarNav" data-mobile-nav-toggle>☰ Разделы</button>
            <span class="aw-chip">${escapeHtml(resolvedTitle)}</span>
            <span class="aw-chip">режим · ${session?.isFounder ? 'фаундер' : 'оператор'}</span>
          </div>
          <div class="aw-topbar-right">
            <span class="aw-chip">TG ${Number(session?.actorTgId || 0) || '—'}</span>
            <button class="aw-button secondary" id="refreshBtn">Обновить</button>
            <button class="aw-button ghost" id="logoutBtn">Выйти</button>
          </div>
        </div>
        ${renderControlStatusBar()}
        <div class="aw-page-head">
          <h1>${escapeHtml(resolvedTitle)}</h1>
          <p>${escapeHtml(resolvedSubtitle)}</p>
        </div>
        ${body}
      </main>
    </div>
  `;
}

function sectionShell(pageKey, body, session, overrides = {}) {
  const meta = sectionMeta(pageKey, session);
  return shell(overrides.title || meta.label, overrides.subtitle || meta.subtitle, body, session, pageKey);
}

function loginView(state = {}) {
  const hasChallenge = !!state.challengeId;
  const fallbackCodeEnabled = state.fallbackCodeEnabled === true;
  const stepTitle = hasChallenge ? (fallbackCodeEnabled ? 'Шаг 2 — Telegram approve / break-glass code' : 'Шаг 2 — Telegram approve') : 'Шаг 1 — admin secret';
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
        <p>Operator console: secret → browser-bound challenge → Telegram callback → one-time session.</p>
        <div class="aw-login-grid">
          <div class="aw-step-chip">${escapeHtml(stepTitle)}</div>
          ${state.info ? `<div class="aw-info">${escapeHtml(state.info)}</div>` : ''}
          ${state.error ? `<div class="aw-error">${escapeHtml(state.error)}</div>` : ''}
          ${hasChallenge ? `
            <div class="aw-info">Secret уже принят. Подтверди вход callback-кнопкой в Telegram. Challenge работает только в этом браузере.</div>
            <div class="aw-login-phase aw-login-phase-verify">
              <div class="aw-login-meta">
                <span class="aw-login-meta-label">Challenge</span>
                <code id="challengeCodeBox">${escapeHtml(state.challengeId || '')}</code>
              </div>
              <p class="aw-login-help">Оставь это окно открытым. Telegram подтверждает реальный approver account, а сессия выдаётся только этому браузеру.</p>
              ${fallbackCodeEnabled ? `
                <input id="otpInput" class="aw-input" placeholder="Break-glass code" autocomplete="one-time-code" />
                <div class="aw-info">Break-glass code включён оператором, ограничен попытками и привязан к этому браузеру.</div>
              ` : ''}
              <div class="aw-actions">
                ${fallbackCodeEnabled ? '<button class="aw-button secondary" id="verifyCodeBtn">Проверить код</button>' : ''}
                <button class="aw-button ghost" id="checkStatusBtn">Проверить подтверждение</button>
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
          <p class="aw-login-help">Challenge ID или пересланная Telegram-кнопка без cookie исходного браузера не выдают сессию.</p>
        </div>
      </div>
    </div>
  `;
}

function helpView(session) {
  return sectionShell('help', `
    <div class="aw-help-grid aw-section">
      <section class="aw-surface aw-stack aw-help-card">
        <h2>Быстрый старт</h2>
        <div class="aw-help-list">
          <div class="aw-list-item"><strong>1. Вход</strong><small>Введи secret, оставь исходное окно открытым и подтверди challenge callback-кнопкой в Telegram. Break-glass code по умолчанию выключен.</small></div>
          <div class="aw-list-item"><strong>2. Обновление</strong><small>Панель не делает auto-polling. Используй кнопку <b>Обновить</b>, когда хочешь подтянуть свежий snapshot.</small></div>
          <div class="aw-list-item"><strong>3. Рабочий ритм</strong><small>Для разбора людей чаще всего стартуем с <b>Пользователи</b>. Для общей системной картины — <b>Runtime</b>. Для платёжных кейсов — <b>Платежи</b>.</small></div>
        </div>
      </section>

      <section class="aw-surface aw-stack aw-help-card">
        <h2>Как читать Users</h2>
        <div class="aw-help-list">
          <div class="aw-list-item"><strong>Когорта</strong><small>Это быстрый готовый слой отбора: все, спящие плательщики, платили без канала, план без канала, живые бренды, тихие креаторы.</small></div>
          <div class="aw-list-item"><strong>Пресет</strong><small>Это сохранённый рабочий срез, который сразу перестраивает сортировку и фильтры под типовой операторский сценарий.</small></div>
          <div class="aw-list-item"><strong>Рабочий срез</strong><small>Источник истины один: текущие search / segment / filters / sort / cohort в sticky-shell и URL. Активные chips, cards и follow-up должны читать именно его.</small></div>
          <div class="aw-list-item"><strong>Корзина и закрепление</strong><small>Корзина — временный набор для copy/export. Закрепление — до 5 карточек для side-by-side сравнения без потери текущего среза.</small></div>
        </div>
        <div class="aw-actions aw-help-actions">
          <a href="/admin/users" data-link class="aw-button ghost">Открыть пользователей</a>
        </div>
      </section>

      <section class="aw-surface aw-stack aw-help-card">
        <h2>Как читать Runtime</h2>
        <div class="aw-help-list">
          <div class="aw-list-item"><strong>OK</strong><small>Контур выглядит штатно и не просит отдельного ручного вмешательства прямо сейчас.</small></div>
          <div class="aw-list-item"><strong>Нужна проверка / degraded</strong><small>Есть сигнал, который стоит разобрать: очередь, retry, env-gap или зависший lane. Это ещё не всегда авария.</small></div>
          <div class="aw-list-item"><strong>Не настроено / missing</strong><small>Контур не включён или не полностью сконфигурирован. Это повод смотреть env/runbook, а не искать баг в Users.</small></div>
          <div class="aw-list-item"><strong>Справочно / unknown</strong><small>Сигнала или обязательной настройки сейчас просто не хватает. Это не должно выглядеть как авария само по себе.</small></div>
        </div>
        <div class="aw-actions aw-help-actions">
          <a href="/admin/runtime" data-link class="aw-button ghost">Открыть раздел «Система»</a>
        </div>
      </section>

      <section class="aw-surface aw-stack aw-help-card">
        <h2>Безопасные действия</h2>
        <div class="aw-help-list">
          <div class="aw-list-item"><strong>Можно из web-admin</strong><small>Смотреть snapshot, разбирать пользователей, копировать списки, выгружать CSV, открывать карточки, читать runtime и payments.</small></div>
          <div class="aw-list-item"><strong>Чего тут нет специально</strong><small>Нет широких destructive bulk-мутaций, нет скрытых массовых write-path, нет фонового auto-refresh, который бы создавал ложное ощущение live-консоли.</small></div>
          <div class="aw-list-item"><strong>Когда идти в Telegram</strong><small>Когда задача завязана на operator-only bot flows, approve/action callbacks или на сценарии, которых web-admin сейчас честно не покрывает.</small></div>
        </div>
      </section>

      <section class="aw-surface aw-stack aw-help-card aw-help-card-wide">
        <h2>Частые вопросы</h2>
        <div class="aw-help-list">
          <div class="aw-list-item"><strong>Нажал пресет — что должно измениться?</strong><small>Должны сразу перестроиться active card/chip, верхний meta strip, URL и follow-up label текущего среза. Если toast пришёл, а активное состояние не обновилось — это UX-баг синхронизации, а не новая логика.</small></div>
          <div class="aw-list-item"><strong>Почему copy иногда открывает ручной режим?</strong><small>Некоторые браузеры режут автокопирование. Тогда панель честно открывает fallback для ручного copy/download вместо молчаливого провала.</small></div>
          <div class="aw-list-item"><strong>Когда нужен Runtime, а когда раздел пользователей?</strong><small>Пользователи — когда разбираешь людей и рабочие срезы. Runtime — когда нужно понять, что происходит с системой, очередями, retry и конфигурацией.</small></div>
          <div class="aw-list-item"><strong>Что делать, если состояние кажется устаревшим?</strong><small>Нажми <b>Обновить</b>. Панель намеренно read-first и manual-refresh-only, чтобы не выдавать optimistic видимость live-state.</small></div>
        </div>
      </section>
    </div>
  `, session);
}

const OVERVIEW_WORKSPACES = ['command', 'payments', 'activity'];

function normalizeOverviewWorkspace(value) {
  const key = String(value || '').trim().toLowerCase();
  return OVERVIEW_WORKSPACES.includes(key) ? key : 'command';
}

function getOverviewWorkspace() {
  try {
    return normalizeOverviewWorkspace(new URLSearchParams(location.search).get('overview_workspace'));
  } catch {
    return 'command';
  }
}

function syncOverviewWorkspace(workspace = 'command', { replace = true } = {}) {
  const next = normalizeOverviewWorkspace(workspace);
  const url = new URL(location.href);
  if (next === 'command') url.searchParams.delete('overview_workspace');
  else url.searchParams.set('overview_workspace', next);
  const target = `${url.pathname}${url.search}`;
  if (`${location.pathname}${location.search}` === target) return next;
  history[replace ? 'replaceState' : 'pushState']({}, '', target);
  return next;
}

function overviewRuntimeWarnings(model = {}) {
  const runtime = model.runtime || {};
  const overallState = String(runtime?.overall?.state || '').trim().toLowerCase();
  const summaryCheck = Number(runtime?.summaryCards?.check || 0) || 0;
  const cardWarnings = Number(model.cards?.runtimeWarnings || 0) || 0;
  if (summaryCheck > 0) return summaryCheck;
  if (overallState === 'missing' || overallState === 'degraded') return Math.max(1, cardWarnings);
  if (overallState === 'ok') return 0;
  return cardWarnings;
}

function overviewStatusSummary(model = {}) {
  const runtime = model.runtime || {};
  const overall = runtime.overall || {};
  const warnings = overviewRuntimeWarnings(model);
  const paymentAlerts = Number(model.cards?.paymentAlerts || 0) || 0;
  const controlSurface = window.__controlSurface || {};
  const paused = Array.isArray(controlSurface.items)
    ? controlSurface.items.filter((item) => item?.kind === 'toggle' && item?.value === false)
    : [];
  const state = String(overall.state || 'unknown');
  if (state === 'missing') {
    return {
      state,
      label: 'Есть незакрытый setup-gap в system/runtime слое.',
      summary: 'Сначала выровняй missing config/runtime контур. Остальные действия вторичны, пока база не ясна.',
      href: '/admin/runtime',
      cta: 'Открыть Runtime',
    };
  }
  if (state === 'degraded' || warnings > 0 || paused.length) {
    return {
      state: state === 'ok' ? 'degraded' : state,
      label: 'Есть сигналы, которые стоит разобрать перед следующими owner-решениями.',
      summary: paused.length
        ? 'Часть control-plane потока сейчас intentionally paused. Сначала перепроверь Runtime и только потом иди в рабочие ручные разборы.'
        : 'Runtime показывает degraded / warning сигнал. Сначала закрой системную неопределённость, потом переходи к точечным действиям.',
      href: '/admin/runtime',
      cta: 'Перейти в Runtime',
    };
  }
  if (paymentAlerts > 0) {
    return {
      state: 'warning',
      label: 'Система в целом выглядит стабильно, но есть платежные кейсы для ручного review.',
      summary: 'Следующий самый полезный ход — разобрать не-applied / fallback payment сигналы, чтобы monetization truth не расходилась с UI.',
      href: '/admin/payments',
      cta: 'Открыть Payments',
    };
  }
  return {
    state: 'ok',
    label: 'Базовые owner/operator контуры сейчас выглядят собранно.',
    summary: 'Можно идти в Users для ручного разбора людей и срезов либо держать Runtime под обычным наблюдением.',
    href: '/admin/users',
    cta: 'Открыть Users',
  };
}

function overviewNextStep(model = {}) {
  const status = overviewStatusSummary(model);
  const cards = model.cards || {};
  const audit = Array.isArray(model.recentAudit) ? model.recentAudit : [];
  if (status.href === '/admin/runtime') {
    return {
      title: 'Сначала Runtime check',
      body: 'Зафиксируй, нет ли missing/degraded/paused сигнала, который делает остальные owner-решения вторичными.',
      href: '/admin/runtime',
      cta: 'Идти в Runtime',
    };
  }
  if (Number(cards.paymentAlerts || 0) > 0) {
    return {
      title: 'Разобрать payment alerts',
      body: 'Есть платежные статусы вне applied. Сначала приведи monetization snapshot в честное состояние.',
      href: '/admin/payments',
      cta: 'Идти в Payments',
    };
  }
  if (audit.length) {
    return {
      title: 'Проверить последнюю operator-активность',
      body: 'Быстро сверь, какие admin-web действия были последними, и нет ли ручного follow-up после них.',
      href: '/admin/help',
      cta: 'Открыть Помощь/контракт',
    };
  }
  return {
    title: 'Рабочий режим без аварийных хвостов',
    body: 'Используй Overview как командную точку входа, а дальше переходи в Users / Payments / Runtime по конкретной задаче.',
    href: '/admin/users',
    cta: 'Открыть Users',
  };
}

function overviewPaymentStats(rows = []) {
  return (Array.isArray(rows) ? rows : []).reduce((acc, item) => {
    const status = String(item?.status || 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
    const cnt = Number(item?.cnt || 0) || 0;
    acc.total += cnt;
    if (status === 'APPLIED') acc.applied += cnt;
    else acc.review += cnt;
    if (status === 'PENDING') acc.pending += cnt;
    acc.byStatus.push({ status, cnt, currency: String(item?.currency || '').trim().toUpperCase() || '—' });
    return acc;
  }, { total: 0, applied: 0, review: 0, pending: 0, byStatus: [] });
}

function renderOverviewWorkspaceTabs(activeWorkspace = 'command') {
  const active = normalizeOverviewWorkspace(activeWorkspace);
  const items = [
    { key: 'command', label: 'Командный обзор', help: 'здоровье + next step' },
    { key: 'payments', label: 'Payments snapshot', help: 'монетизация и alerts' },
    { key: 'activity', label: 'Последняя активность', help: 'audit + runtime notes' },
  ];
  return `
    <div class="aw-workspace-tabs" role="tablist" aria-label="Overview workspace">
      ${items.map((item) => `
        <button class="aw-workspace-tab ${active === item.key ? 'is-active' : ''}" data-overview-workspace="${item.key}" role="tab" aria-selected="${active === item.key ? 'true' : 'false'}">
          <span class="aw-workspace-tab-label">${escapeHtml(item.label)}</span>
          <span class="aw-workspace-tab-help">${escapeHtml(item.help)}</span>
        </button>
      `).join('')}
    </div>
  `;
}

function overviewCommandWorkspace(model = {}) {
  const cards = model.cards || {};
  const runtime = model.runtime || {};
  const overall = runtime.overall || {};
  const status = overviewStatusSummary(model);
  const next = overviewNextStep(model);
  return `
    <div class="aw-overview-workspace-grid aw-section">
      <section class="aw-surface aw-stack">
        <h2>Командный обзор владельца</h2>
        <div class="aw-row-between">
          <p class="aw-surface-note">Короткий cockpit-слой: сначала здоровье и следующий owner-шаг, потом уже детали по workspace-экранам.</p>
          <strong class="aw-status ${runtimeStateClass(status.state)}">${escapeHtml(runtimeStateLabel(status.state))}</strong>
        </div>
        <div class="aw-overview-mini-grid">
          <div class="aw-mini-card"><span>Пользователи</span><strong>${Number(cards.usersTotal || 0)}</strong></div>
          <div class="aw-mini-card"><span>Рабочие поверхности</span><strong>${Number(cards.workspacesTotal || 0)}</strong></div>
          <div class="aw-mini-card"><span>Активные офферы</span><strong>${Number(cards.offersActive || 0)}</strong></div>
          <div class="aw-mini-card"><span>Активные гивы</span><strong>${Number(cards.giveawaysActive || 0)}</strong></div>
        </div>
        <div class="aw-list">
          <div class="aw-list-item"><strong>Общий runtime-статус</strong><small>${escapeHtml(runtimeStateLabel(overall.state || status.state))} · ${escapeHtml(overall.label || status.label)}</small></div>
          <div class="aw-list-item"><strong>Платёжные сигналы</strong><small>${Number(cards.paymentAlerts || 0)} требуют ручного просмотра.</small></div>
          <div class="aw-list-item"><strong>Только ручное обновление</strong><small>Overview намеренно не делает live-polling и не притворяется realtime-консолью.</small></div>
        </div>
      </section>
      <section class="aw-surface aw-stack">
        <h2>Следующие owner-шаги</h2>
        <div class="aw-list">
          <div class="aw-list-item"><strong>${escapeHtml(next.title)}</strong><small>${escapeHtml(next.body)}</small></div>
          <div class="aw-list-item"><strong>Если Runtime degraded</strong><small>Сначала Runtime, потом overrides / ручные follow-up действия в других секциях.</small></div>
          <div class="aw-list-item"><strong>Если payment alerts растут</strong><small>Иди в Payments и сверяй applied vs non-applied статусы, а не лечи это через Users.</small></div>
          <div class="aw-list-item"><strong>Если всё спокойно</strong><small>Users становится основной рабочей точкой для людей, срезов, экспортов и точечных разборов.</small></div>
        </div>
        <div class="aw-actions aw-overview-actions">
          <a href="${next.href}" data-link class="aw-button">${escapeHtml(next.cta)}</a>
          <a href="/admin/users" data-link class="aw-button ghost">Открыть пользователей</a>
        </div>
      </section>
    </div>
  `;
}

function overviewPaymentsWorkspace(model = {}) {
  const cards = model.cards || {};
  const stats = overviewPaymentStats(model.payments || []);
  const rows = stats.byStatus.length ? stats.byStatus : [{ status: 'NO_DATA', cnt: 0, currency: '—' }];
  const founderAction = window.__adminSession?.isFounder
    ? '${founderAction}'
    : '<a href="/admin/help" data-link class="aw-button ghost">Operator guide</a>';
  return `
    <div class="aw-overview-workspace-grid aw-section">
      <section class="aw-surface aw-stack">
        <h2>Payments / monetization snapshot</h2>
        <p class="aw-surface-note">Короткий owner-снимок monetization truth без проваливания в длинный платежный экран.</p>
        <div class="aw-overview-mini-grid">
          <div class="aw-mini-card"><span>Платёжные сигналы</span><strong>${Number(cards.paymentAlerts || 0)}</strong></div>
          <div class="aw-mini-card"><span>Applied</span><strong>${stats.applied}</strong></div>
          <div class="aw-mini-card"><span>Pending</span><strong>${stats.pending}</strong></div>
          <div class="aw-mini-card"><span>Need review</span><strong>${stats.review}</strong></div>
        </div>
        <div class="aw-list">
          ${rows.map((item) => `<div class="aw-list-item"><strong>${escapeHtml(item.status)}</strong><small>${Number(item.cnt || 0)} · ${escapeHtml(item.currency || '—')}</small></div>`).join('')}
        </div>
      </section>
      <section class="aw-surface aw-stack">
        <h2>Что покрывает этот workspace</h2>
        <div class="aw-list">
          <div class="aw-list-item"><strong>Даёт owner truth</strong><small>Видно, есть ли сигналы вне applied и нужно ли идти в Payments прямо сейчас.</small></div>
          <div class="aw-list-item"><strong>Не подменяет Payments</strong><small>Детальный разбор payment case, fallback reason и drilldown остаётся в отдельной payment surface.</small></div>
          <div class="aw-list-item"><strong>Не лечит system issues</strong><small>Если payment проблема выглядит как infra/runtime, сначала открой Runtime и только потом Payments.</small></div>
        </div>
        <div class="aw-actions aw-overview-actions">
          <a href="/admin/payments" data-link class="aw-button">Открыть Payments</a>
          ${founderAction}
        </div>
      </section>
    </div>
  `;
}

function overviewActivityWorkspace(model = {}) {
  const audit = Array.isArray(model.recentAudit) ? model.recentAudit : [];
  const runtimeNotes = Array.isArray(model.runtime?.notes) ? model.runtime.notes : [];
  return `
    <div class="aw-overview-workspace-grid aw-section">
      <section class="aw-surface aw-stack">
        <h2>Последняя admin-активность</h2>
        <div class="aw-list">
          ${audit.length ? audit.map((item) => `
            <div class="aw-list-item">
              <strong>${escapeHtml(founderTextLabel(item.action || '—'))}</strong>
              <small>${escapeHtml(item.section || '')} · TG ${Number(item.actorTgId || 0) || '—'} · ${formatDate(item.ts)}</small>
            </div>
          `).join('') : '<div class="aw-empty">Пока пусто.</div>'}
        </div>
      </section>
      <section class="aw-surface aw-stack">
        <h2>Runtime notes</h2>
        <div class="aw-list">
          ${(runtimeNotes.length ? runtimeNotes : ['Явных runtime notes нет']).map((item) => `<div class="aw-list-item">${escapeHtml(item)}</div>`).join('')}
        </div>
        <div class="aw-list-item"><strong>Обновлено</strong><small>${formatDate(model.ts || model.updatedAt)}</small></div>
      </section>
    </div>
  `;
}

function overviewWorkspaceView(model = {}, workspace = 'command') {
  const active = normalizeOverviewWorkspace(workspace);
  if (active === 'payments') return overviewPaymentsWorkspace(model);
  if (active === 'activity') return overviewActivityWorkspace(model);
  return overviewCommandWorkspace(model);
}

function overviewView(model) {
  const cards = model.cards || {};
  const workspace = getOverviewWorkspace();
  const status = overviewStatusSummary(model);
  const next = overviewNextStep(model);
  const paymentsHref = '/admin/payments';
  const runtimeHref = '/admin/runtime';
  return sectionShell('overview', `
    <div class="aw-overview-hero aw-section">
      <section class="aw-surface aw-stack aw-overview-hero-card">
        <div class="aw-overview-eyebrow">Главный статус</div>
        <div class="aw-row-between">
          <div>
            <h2>${escapeHtml(status.label)}</h2>
            <p class="aw-surface-note">${escapeHtml(status.summary)}</p>
          </div>
          <span class="aw-status ${runtimeStateClass(status.state)}">${escapeHtml(runtimeStateLabel(status.state))}</span>
        </div>
        <div class="aw-overview-mini-grid">
          <div class="aw-mini-card"><span>Пользователи</span><strong>${Number(cards.usersTotal || 0)}</strong></div>
          <div class="aw-mini-card"><span>Активные офферы</span><strong>${Number(cards.offersActive || 0)}</strong></div>
          <div class="aw-mini-card"><span>Платёжные сигналы</span><strong>${Number(cards.paymentAlerts || 0)}</strong></div>
          <div class="aw-mini-card"><span>Runtime warnings</span><strong>${overviewRuntimeWarnings(model)}</strong></div>
        </div>
      </section>
      <section class="aw-surface aw-stack aw-overview-hero-card">
        <div class="aw-overview-eyebrow">Следующий owner-шаг</div>
        <h2>${escapeHtml(next.title)}</h2>
        <p class="aw-surface-note">${escapeHtml(next.body)}</p>
        <div class="aw-actions aw-overview-actions">
          <a href="${next.href}" data-link class="aw-button">${escapeHtml(next.cta)}</a>
          <a href="${runtimeHref}" data-link class="aw-button ghost">Runtime</a>
          <a href="${paymentsHref}" data-link class="aw-button ghost">Payments</a>
        </div>
      </section>
    </div>

    <section class="aw-surface aw-stack aw-section aw-boundary-card">
      <div class="aw-overview-eyebrow">Границы этой поверхности</div>
      <div class="aw-list">
        <div class="aw-list-item"><strong>Что это делает</strong><small>Даёт честную точку входа: главный статус, следующий ход и три коротких workspace-снимка.</small></div>
        <div class="aw-list-item"><strong>Чего тут нет специально</strong><small>Нет live-polling, нет скрытых write-path, нет длинного runtime/payments drilldown внутри главной.</small></div>
        <div class="aw-list-item"><strong>Куда идти дальше</strong><small>Users — для людей и срезов. Runtime — для system truth. Payments — для monetization review.</small></div>
      </div>
    </section>

    ${renderOverviewWorkspaceTabs(workspace)}
    ${overviewWorkspaceView(model, workspace)}
    ${renderControlSurfaceSection()}
  `, window.__adminSession || {});
}

function usersBulkModeLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return ({ tg_ids: 'tg_id', usernames: 'usernames', user_ids: 'user_id' })[key] || (key || 'данные');
}

function basketSourceLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return key === 'basket' ? 'корзина' : key === 'pins' ? 'закреплённый набор' : 'текущий фильтр';
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

const USERS_FILTER_DRAFT_KEYS = ['planState', 'creditsState', 'channelState', 'activityWindow', 'paymentsState'];

function pickUsersFilterState(raw = {}) {
  const source = raw || {};
  return {
    planState: String(source.planState || source.plan_state || USERS_STATE_DEFAULTS.planState).trim() || USERS_STATE_DEFAULTS.planState,
    creditsState: String(source.creditsState || source.credits_state || USERS_STATE_DEFAULTS.creditsState).trim() || USERS_STATE_DEFAULTS.creditsState,
    channelState: String(source.channelState || source.channel_state || USERS_STATE_DEFAULTS.channelState).trim() || USERS_STATE_DEFAULTS.channelState,
    activityWindow: String(source.activityWindow || source.activity_window || USERS_STATE_DEFAULTS.activityWindow).trim() || USERS_STATE_DEFAULTS.activityWindow,
    paymentsState: String(source.paymentsState || source.payments_state || USERS_STATE_DEFAULTS.paymentsState).trim() || USERS_STATE_DEFAULTS.paymentsState,
  };
}

function usersFilterDraftSignature(raw = {}) {
  const state = pickUsersFilterState(raw);
  return USERS_FILTER_DRAFT_KEYS.map((key) => `${key}:${state[key] || ''}`).join('|');
}

function getUsersFilterDraft() {
  if (!window.__usersFilterDraft) {
    const committed = pickUsersFilterState(getUsersState());
    window.__usersFilterDraft = committed;
    window.__usersFilterDraftBaseKey = usersFilterDraftSignature(committed);
  }
  return pickUsersFilterState(window.__usersFilterDraft || getUsersState());
}

function setUsersFilterDraft(next = {}) {
  const merged = pickUsersFilterState({ ...getUsersFilterDraft(), ...(next || {}) });
  window.__usersFilterDraft = merged;
  return merged;
}

function syncUsersFilterDraftFromState(state = getUsersState()) {
  const committed = pickUsersFilterState(state);
  window.__usersFilterDraft = committed;
  window.__usersFilterDraftBaseKey = usersFilterDraftSignature(committed);
  return committed;
}

function usersHasPendingFilterDraft(committed = getUsersState(), draft = getUsersFilterDraft()) {
  return usersFilterDraftSignature(committed) !== usersFilterDraftSignature(draft);
}

function readUsersFilterDraftFromDom(base = getUsersFilterDraft()) {
  return pickUsersFilterState({
    ...base,
    planState: document.getElementById('usersPlanState')?.value || base.planState || USERS_STATE_DEFAULTS.planState,
    creditsState: document.getElementById('usersCreditsState')?.value || base.creditsState || USERS_STATE_DEFAULTS.creditsState,
    channelState: document.getElementById('usersChannelState')?.value || base.channelState || USERS_STATE_DEFAULTS.channelState,
    activityWindow: document.getElementById('usersActivityWindow')?.value || base.activityWindow || USERS_STATE_DEFAULTS.activityWindow,
    paymentsState: document.getElementById('usersPaymentsState')?.value || base.paymentsState || USERS_STATE_DEFAULTS.paymentsState,
  });
}

// STEP524 — Users URL-persisted working views
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
    return next;
  } catch {
    return {};
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
  const committed = getUsersState();
  if (!window.__usersFilterDraft || String(window.__usersFilterDraftBaseKey || '') !== usersFilterDraftSignature(committed)) {
    syncUsersFilterDraftFromState(committed);
  }
  return committed;
}

async function copyUsersWorkingViewUrl() {
  const href = buildUsersListHref(getUsersState(), { absolute: true });
  const copied = await copyTextToClipboard(href, {
    title: 'Ссылка на текущий срез Users',
    hint: 'Автокопирование ссылки не сработало. Ссылка уже подготовлена: нажми Ctrl+C или скачай .txt.',
    filename: 'users-view-link.txt',
  });
  if (!copied.ok && !copied.fallbackOpened) {
    showToast('Не удалось скопировать ссылку на текущий срез Users.', 'error');
    return;
  }
  showToast(copied.ok ? 'Ссылка на текущий срез Users скопирована.' : 'Открыл ручной режим копирования ссылки.', copied.ok ? 'success' : 'info');
}

function activeWindowLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === '7d') return 'активность 7д';
  if (key === '30d') return 'активность 30д';
  if (key === '90d') return 'активность 90д';
  return 'нет свежего сигнала';
}

function usersSortMeta(value = 'created_desc') {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'activity_desc') return { label: 'Свежие сверху', detail: 'Сортировка по последней активности ↓' };
  if (key === 'activity_asc') return { label: 'Тихие сверху', detail: 'Сначала пользователи без свежих сигналов' };
  if (key === 'payments_desc') return { label: 'Платящие сверху', detail: 'Сортировка по числу платежей ↓' };
  if (key === 'problem_desc') return { label: 'Проблемные сверху', detail: 'Блок / платили без канала / план без канала / залежавшиеся кредиты' };
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
  if (key === 'dormant_payers') return { label: 'Спящие плательщики', detail: 'Есть платежи, но нет свежего сигнала 30+ дней' };
  if (key === 'paid_no_channel') return { label: 'Платили без канала', detail: 'Платили, но канал так и не подключён' };
  if (key === 'plan_no_channel') return { label: 'План без канала', detail: 'Есть план, но канал не подключён' };
  if (key === 'fresh_brands') return { label: 'Живые бренды', detail: 'Бренды с живым сигналом за последние 30 дней' };
  if (key === 'quiet_creators') return { label: 'Тихие креаторы', detail: 'Креаторы без свежего сигнала 30+ дней' };
  return { label: 'Все пользователи', detail: 'Без предустановленного cohort view' };
}

function usersCohortPresets() {
  return [
    { id: 'all', label: 'Все' },
    { id: 'dormant_payers', label: 'Спящие плательщики' },
    { id: 'paid_no_channel', label: 'Платили без канала' },
    { id: 'plan_no_channel', label: 'План без канала' },
    { id: 'fresh_brands', label: 'Живые бренды' },
    { id: 'quiet_creators', label: 'Тихие креаторы' },
  ];
}

function usersCohortCounterCards(counters = {}, currentCohortView = 'all') {
  const presets = usersCohortPresets();
  return presets.map((item) => {
    const value = Math.max(0, Number(counters?.[item.id] || 0));
    const meta = usersCohortMeta(item.id);
    return `
      <button class="aw-cohort-counter-card ${currentCohortView === item.id ? 'is-active' : ''}" data-users-cohort="${escapeHtml(item.id)}" aria-pressed="${currentCohortView === item.id ? 'true' : 'false'}">
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
      detail: 'Чистый базовый срез без хвостов cohort/filter, чтобы быстро вернуться к общей картине.',
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
      label: 'Спящие плательщики',
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
      label: 'Платили без канала',
      detail: 'Есть платежи, но канал не подключён. Быстрый операторский срез для activation gap.',
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
      label: 'План без канала',
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
      label: 'Живые бренды',
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
      label: 'Тихие креаторы',
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

const USERS_PRESET_COPY_BACKCOMPAT_TOKENS = ['Применить срез'];

function renderUsersOperatorPresetCards(currentPresetId = 'custom') {
  const customIsActive = currentPresetId === 'custom';
  const customCard = `
    <div class="aw-preset-card aw-preset-card--custom aw-preset-card--static ${customIsActive ? 'is-active' : ''}" ${customIsActive ? 'aria-current="true"' : ''}>
      <span class="aw-preset-kicker">Срез</span>
      <strong>Свой срез</strong>
      <small>${escapeHtml(customIsActive ? 'Текущий рабочий срез уже отличается от сохранённых пресетов.' : 'Ручные изменения фильтров и сортировки автоматически переводят экран сюда.')}</small>
      <span class="aw-preset-cta">${customIsActive ? 'Сейчас открыт' : 'Авто при ручных изменениях'}</span>
    </div>
  `;
  return customCard + usersOperatorPresets().map((preset) => `
    <button type="button" class="aw-preset-card ${currentPresetId === preset.id ? 'is-active' : ''}" data-users-preset="${escapeHtml(preset.id)}" aria-pressed="${currentPresetId === preset.id ? 'true' : 'false'}" title="${currentPresetId === preset.id ? 'Этот срез уже активен' : `Открыть срез: ${preset.label}`}">
      <span class="aw-preset-kicker">Срез</span>
      <strong>${escapeHtml(preset.label)}</strong>
      <small>${escapeHtml(preset.detail)}</small>
      <span class="aw-preset-cta">${currentPresetId === preset.id ? 'Сейчас открыт' : 'Открыть срез'}</span>
    </button>
  `).join('');
}



const USERS_COPY_UNIFICATION_BACKCOMPAT_TOKENS = [
  'Users saved operator presets',
  'Сравнение и закрепление',
  'Готовые действия по срезу',
  'Dormant payers',
  'Paid no channel',
  'Plan no channel',
  'Fresh brands',
  'Quiet creators',
  'Custom slice',
  'CSV текущего среза',
  'problem = banned / paid-no-channel / plan-no-channel / stale credits',
  'active 7d',
];

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


function usersIsSliceActionActive(action = '', state = {}) {
  const sortBy = String(state.sortBy || 'created_desc').trim().toLowerCase();
  const cohortView = String(state.cohortView || 'all').trim().toLowerCase();
  if (action === 'open_top_problem_users') return sortBy === 'problem_desc' && cohortView === 'all';
  if (action === 'open_dormant_payers') return sortBy === 'payments_desc' && cohortView === 'dormant_payers';
  return false;
}

function renderUsersSliceActionCards(state = {}, cohortTopline = {}) {
  const actionCards = [
    {
      action: 'export_current',
      kicker: 'Экспорт',
      label: 'CSV текущего среза',
      help: 'Скачать текущий search / segment / filter / cohort с уже активной сортировкой.',
      tone: 'utility',
    },
    {
      action: 'copy_tg_ids',
      kicker: 'Копировать',
      label: 'tg_id',
      help: 'Быстро собрать tg_id по текущему срезу. Если браузер не даст автокопирование, откроется ручной режим.',
      tone: 'utility',
    },
    {
      action: 'copy_usernames',
      kicker: 'Копировать',
      label: 'usernames',
      help: 'Собрать usernames по тому же рабочему срезу. Если автокопирование не сработает, откроется ручной режим.',
      tone: 'utility',
    },
    {
      action: 'open_top_problem_users',
      kicker: 'Открыть',
      label: 'Проблемные сверху',
      help: 'Переключить приоритет на problem_desc и открыть самых проблемных без сброса остальных фильтров.',
      tone: 'attention',
    },
    {
      action: 'open_dormant_payers',
      kicker: 'Открыть',
      label: `Спящие плательщики · ${Math.max(0, Number(cohortTopline?.dormant_payers || 0))}`,
      help: 'Включить когорту спящих плательщиков и поднять наверх тех, кого логично разбирать в follow-up.',
      tone: 'cohort',
    },
  ];
  return actionCards.map((item) => {
    const isActive = usersIsSliceActionActive(item.action, state);
    return `
      <button class="aw-action-card aw-action-card--${escapeHtml(item.tone || 'utility')} ${isActive ? 'is-active' : ''}" data-users-followup="${escapeHtml(item.action)}" aria-pressed="${isActive ? 'true' : 'false'}">
        <span>${escapeHtml(item.kicker || 'Действие')}</span>
        <strong>${escapeHtml(item.label || item.action || '—')}</strong>
        <small>${escapeHtml(item.help || '')}</small>
        <em class="aw-action-card-state">${isActive ? 'Уже выбран в рабочем срезе' : 'Применить к текущему срезу'}</em>
      </button>
    `;
  }).join('');
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


function renderUsersTableHead(title, detail = '') {
  return `<div class="aw-users-table-head"><strong>${escapeHtml(title)}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ''}</div>`;
}

function renderUsersTableMetaStrip({ pagination = {}, currentSliceLabel = '', sortMeta = {}, cohortMeta = {}, activePresetMeta = {}, basketCount = 0, pinCount = 0, recentExport = null, recentCopy = null } = {}) {
  const total = Math.max(0, Number(pagination.total || 0) || 0);
  const mainLabel = total > 0
    ? `Показаны ${Math.max(0, Number(pagination.fromRow || 0) || 0)}–${Math.max(0, Number(pagination.toRow || 0) || 0)} из ${total}`
    : 'Результатов нет';
  const sliceBits = [
    String(currentSliceLabel || 'Все пользователи').trim(),
    String(sortMeta?.label || 'Новые сверху').trim(),
    String(cohortMeta?.label || 'Все').trim(),
    String(activePresetMeta?.label || 'Свой срез').trim(),
  ].filter(Boolean);
  return `
    <section class="aw-users-table-meta-strip">
      <div class="aw-users-table-meta-main">
        <span class="aw-users-table-kicker">Раздел Users · STEP529: плотность строк таблицы · STEP530: приоритет колонок</span>
        <strong>${escapeHtml(mainLabel)}</strong>
        <small>${escapeHtml(sliceBits.join(' · '))}</small>
      </div>
      <div class="aw-users-table-meta-chips">
        <span class="aw-basket-pill">Корзина: <strong>${Math.max(0, Number(basketCount || 0) || 0)}</strong></span>
        <span class="aw-basket-pill">Закреплено: <strong>${Math.max(0, Number(pinCount || 0) || 0)}</strong></span>
        <span class="aw-basket-pill">Экспорт: <strong>${escapeHtml(recentExport?.ts ? formatDate(recentExport.ts) : '—')}</strong></span>
        <span class="aw-basket-pill">Копирование: <strong>${escapeHtml(recentCopy?.ts ? formatDate(recentCopy.ts) : '—')}</strong></span>
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
  if (credits > 0) return { label: `${credits} кредитов`, tone: 'is-good', detail: 'Есть баланс' };
  return { label: '0 кредитов', tone: 'is-muted', detail: 'Баланс пуст' };
}

function usersSignalChips(item = {}) {
  const chips = [];
  if (item.flags?.isBanned) chips.push({ label: 'блок', tone: 'is-warn' });
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
  if (Number(item?.problemScore || 0) > 0) parts.push(`ops-риск ${Number(item.problemScore || 0)}`);
  if (item.flags?.isBanned) parts.push('Статус: блок');
  return parts.join(' · ');
}

function usersSignalsCompactDetail(item = {}) {
  const parts = [];
  if (Number(item?.problemScore || 0) > 0) parts.push(`risk ${Number(item.problemScore || 0)}`);
  if (Number(item?.paymentsCount || 0) > 0) parts.push(`${Number(item.paymentsCount || 0)} pay`);
  if (item.flags?.hasChannel) parts.push('channel');
  if (item.flags?.isBanned) parts.push('блок');
  if (!parts.length) return 'без активных signals';
  return parts.join(' · ');
}

function usersSignalsPriorityChips(item = {}) {
  const chips = usersSignalChips(item);
  if (!Array.isArray(chips) || !chips.length) return [];
  const maxVisible = 4;
  if (chips.length <= maxVisible) return chips;
  return [...chips.slice(0, maxVisible - 1), { label: `+${chips.length - (maxVisible - 1)}`, tone: 'is-muted is-overflow' }];
}

function usersSegmentBadges(item = {}) {
  const badges = [
    { label: segmentLabel(item.segment || 'user'), tone: 'is-accent is-segment' },
  ];
  if (item.flags?.hasBrandProfile) badges.push({ label: 'profile', tone: 'is-soft' });
  if (item.flags?.isManager) badges.push({ label: 'manager', tone: 'is-soft' });
  if (item.flags?.isModerator) badges.push({ label: 'mod', tone: 'is-warn' });
  return badges;
}

function usersPlanMicroMeta(item = {}) {
  const plan = usersPlanMeta(item);
  const credits = usersCreditsMeta(item);
  const pieces = [];
  if (item?.brandPlanUntil) pieces.push(`до ${formatDatePart(item.brandPlanUntil)}`);
  if (!Number(item?.brandCredits || 0)) pieces.push('кредиты 0');
  if (!pieces.length) return plan.detail || credits.detail || '—';
  return pieces.join(' · ');
}

function usersActivityInlineLabel(item = {}) {
  if (!item?.lastKnownActivityAt) return '—';
  return `${formatDatePart(item.lastKnownActivityAt)} · ${formatTimePart(item.lastKnownActivityAt)}`;
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
        <strong>CSV закреплённого набора</strong>
        <small>Закреплённый набор без потери текущего рабочего среза.</small>
      </button>
      <button class="aw-action-card aw-action-card-compact" data-users-compare-action="copy_pins_tg_ids">
        <span>Копировать</span>
        <strong>tg_id закреплённых</strong>
        <small>Скопировать tg_id по pinned set через тот же audited bulk contract.</small>
      </button>
      <button class="aw-action-card aw-action-card-compact" data-users-compare-action="copy_pins_usernames">
        <span>Копировать</span>
        <strong>usernames закреплённых</strong>
        <small>Скопировать usernames по закреплённым user cards без ручной сборки корзины.</small>
      </button>
      <button class="aw-action-card aw-action-card-compact" data-users-compare-action="copy_pins_user_ids">
        <span>Копировать</span>
        <strong>user_id закреплённых</strong>
        <small>Собрать internal user_id по тому же pinned set для ручных ops follow-up шагов.</small>
      </button>
      <button class="aw-action-card aw-action-card-compact" data-users-compare-action="open_top_problem" ${topProblem ? '' : 'disabled'}>
        <span>Открыть</span>
        <strong>${escapeHtml(topProblem ? `Top problem · ${compareCardLabel(topProblem)}` : 'Top problem · none')}</strong>
        <small>${escapeHtml(topProblem ? `Открыть закреплённую карточку с максимальным attention/problem score (${topProblem.problemDesc || 'attention'}).` : 'Сейчас среди pins нет явного problem target.')}</small>
      </button>
      <button class="aw-action-card aw-action-card-compact" data-users-compare-action="open_dormant_payer" ${dormantPayer ? '' : 'disabled'}>
        <span>Открыть</span>
        <strong>${escapeHtml(dormantPayer ? `Спящий плательщик · ${compareCardLabel(dormantPayer)}` : 'Спящий плательщик · нет')}</strong>
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
            <span class="aw-stat-chip ${item.status === 'banned' ? 'is-warn' : 'is-good'}">${item.status === 'banned' ? 'блок' : 'активен'}</span>
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
          <div class="aw-list-item"><strong>Внимание</strong><small>${escapeHtml(item.problemDesc ? `${item.problemDesc} · балл ${Number(item.problemScore || 0)}` : item.isDormantPayer ? 'спящий плательщик' : 'крупных флагов не найдено')}</small></div>
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
    <div class="aw-row-actions aw-row-actions-compact">
      <button class="aw-row-action" data-user-quick="open_card" data-user-quick-payload='${payload}'>Карточка</button>
      <button class="aw-row-action ${isPinned ? 'is-active' : ''}" data-user-quick="toggle_pin" data-user-quick-payload='${payload}'>${isPinned ? 'Закреплён' : 'Закрепить'}</button>
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
  const committedFilterState = pickUsersFilterState({
    planState: usersState.planState || filterMeta.planState || 'all',
    creditsState: usersState.creditsState || filterMeta.creditsState || 'all',
    channelState: usersState.channelState || filterMeta.channelState || 'all',
    activityWindow: usersState.activityWindow || filterMeta.activityWindow || 'all',
    paymentsState: usersState.paymentsState || filterMeta.paymentsState || 'all',
  });
  const draftFilterState = getUsersFilterDraft();
  const currentPlanState = committedFilterState.planState;
  const currentCreditsState = committedFilterState.creditsState;
  const currentChannelState = committedFilterState.channelState;
  const currentActivityWindow = committedFilterState.activityWindow;
  const currentPaymentsState = committedFilterState.paymentsState;
  const draftPlanState = draftFilterState.planState;
  const draftCreditsState = draftFilterState.creditsState;
  const draftChannelState = draftFilterState.channelState;
  const draftActivityWindow = draftFilterState.activityWindow;
  const draftPaymentsState = draftFilterState.paymentsState;
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
    ? { label: 'Свой срез', detail: 'Текущий срез отличается от встроенных пресетов.' }
    : usersOperatorPresetMeta(activePresetId);
  const filterDraftDirty = usersHasPendingFilterDraft(committedFilterState, draftFilterState);
  const filterDraftSummary = filterDraftDirty
    ? 'Есть несохранённые изменения. Сначала подтверди их, потом уже смотри обновлённый список.'
    : 'Фильтры синхронизированы с текущим рабочим срезом.';
  const bulkMode = window.__usersBulkState?.mode || 'tg_ids';
  const compareRail = model.compareRail || { maxPins: 5, pinIds: getUsersPinIds(), cards: [] };
  const pinIds = Array.isArray(compareRail.pinIds) ? compareRail.pinIds : getUsersPinIds();
  const basketIds = getUsersBasketIds();
  const hasVisibleRows = items.length > 0;
  const visibleSelectedCount = items.reduce((count, item) => count + (isUserInBasket(item.userId) ? 1 : 0), 0);
  const allVisibleSelected = hasVisibleRows && visibleSelectedCount === items.length;
  const someVisibleSelected = hasVisibleRows && visibleSelectedCount > 0 && !allVisibleSelected;
  const canCopyCurrentSlice = Math.max(0, Number(pagination.total || 0) || 0) > 0;
  const canCopyBasket = basketIds.length > 0;
  const canRunBulkCopy = bulkSource === 'basket' ? canCopyBasket : canCopyCurrentSlice;
  const canSelectVisibleUsers = hasVisibleRows;
  const canClearUsersBasket = basketIds.length > 0;
  const topPagination = renderUsersPaginationControls(pagination, 'top');
  const bottomPagination = renderUsersPaginationControls(pagination, 'bottom');
  const usersTableMetaStrip = renderUsersTableMetaStrip({
    pagination,
    currentSliceLabel,
    sortMeta,
    cohortMeta,
    activePresetMeta,
    basketCount: basketIds.length,
    pinCount: pinIds.length,
    recentExport,
    recentCopy,
  });
  return sectionShell('users', `
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
            <div class="aw-basket-pill">Срез: <strong>${escapeHtml(currentSliceLabel)}</strong></div>
            <div class="aw-basket-pill">Сортировка: <strong>${escapeHtml(sortMeta.label)}</strong></div>
            <div class="aw-basket-pill">Когорта: <strong>${escapeHtml(cohortMeta.label)}</strong></div>
            <div class="aw-basket-pill">Пресет: <strong>${escapeHtml(activePresetMeta.label)}</strong></div>
            <div class="aw-basket-pill">Корзина: <strong>${basketIds.length}</strong> / ${Number(bulkMeta.basketMaxRows || 500)}</div>
            <div class="aw-basket-pill">Закреплено: <strong>${pinIds.length}</strong> / ${Number(compareRail.maxPins || 5)}</div>
            <div class="aw-basket-pill">Страница: <strong>${escapeHtml(pagination.pageLabel)}</strong></div>
          </div>
        </div>
      </div>

      <div class="aw-users-rails-stack">
        <section class="aw-priority-rail">
          <div class="aw-utility-head">
            <div>
              <strong>Сортировка и приоритет</strong>
              <span>Быстро поднимает наверх самые свежие, самые платящие, самые тихие и самые проблемные сегменты без новых мутаций.</span>
            </div>
          </div>
          <div class="aw-priority-row">
            <div class="aw-priority-pills">
              ${priorityPresets.map((item) => `<button class="aw-priority-pill aw-priority-pill--sort ${currentSortBy === item.id ? 'is-active' : ''}" data-users-priority="${escapeHtml(item.id)}" aria-pressed="${currentSortBy === item.id ? 'true' : 'false'}">${escapeHtml(item.label)}</button>`).join('')}
            </div>
          </div>
          <div class="aw-toolbar-note">
            <span class="aw-muted">${escapeHtml(sortMeta.detail)}</span>
            <span class="aw-muted">problem = блок / платили без канала / план без канала / залежавшиеся кредиты</span>
          </div>
        </section>

        <section class="aw-cohort-rail">
          <!-- usersCohortView · Cohort view идёт через тот же server contract -->
          <div class="aw-utility-head">
            <div>
              <strong>Когорты и готовые срезы</strong>
              <span>Маленькие счётчики по когортам над chips, чтобы панель быстрее читалась как контрольная плоскость.</span>
            </div>
            </div>
          <div class="aw-cohort-topline">
            ${usersCohortCounterCards(cohortTopline, currentCohortView)}
          </div>
          <div class="aw-toolbar-note">
            <span class="aw-muted">Счётчики выше только показывают картину, а сами chips ниже сразу переключают рабочую когорту.</span>
          </div>
          <div class="aw-priority-pills">
            ${cohortPresets.map((item) => `<button class="aw-priority-pill aw-priority-pill--cohort ${currentCohortView === item.id ? 'is-active' : ''}" data-users-cohort="${escapeHtml(item.id)}" aria-pressed="${currentCohortView === item.id ? 'true' : 'false'}">${escapeHtml(item.label)}</button>`).join('')}
          </div>
        </section>

        <section class="aw-preset-rail">
          <div class="aw-utility-head">
            <div>
              <strong>Сохранённые операторские пресеты</strong>
              <span>Карточки ниже сразу переключают рабочий срез без ручной сборки контролов.</span>
            </div>
          </div>
          <div class="aw-toolbar-note">
            <span class="aw-muted">Сейчас активен: <strong>${escapeHtml(activePresetMeta.label)}</strong>. Если выберешь другую карточку, экран сразу переключится на новый срез.</span>
          </div>
          <div class="aw-preset-grid">
            ${renderUsersOperatorPresetCards(activePresetId)}
          </div>
        </section>

        <section class="aw-filter-rail ${filterDraftDirty ? 'is-dirty' : 'is-clean'}">
          <div class="aw-utility-head aw-filter-rail-head">
            <div>
              <strong>Фильтры среза</strong>
              <span>Фильтры только для чтения: сначала выбери значения ниже, потом явно подтверди их через кнопку применения.</span>
            </div>
            <div class="aw-filter-rail-actions">
              <span class="aw-basket-pill aw-filter-draft-pill ${filterDraftDirty ? 'is-dirty' : 'is-clean'}" id="usersFilterDraftStatus">${escapeHtml(filterDraftDirty ? 'Есть несохранённые изменения' : 'Фильтры синхронизированы')}</span>
              <button class="aw-button ghost" id="resetUsersFilterDraft" ${filterDraftDirty ? '' : 'disabled'}>Сбросить</button>
              <button class="aw-button secondary" id="applyUsersFilterDraft" ${filterDraftDirty ? '' : 'disabled'}>Применить фильтры</button>
            </div>
          </div>
          <div class="aw-filter-grid" id="usersFilterRail">
            <select id="usersPlanState" class="aw-select inline" data-users-filter-control="planState">
              ${[['all','План: все'],['with_plan','План: есть'],['no_plan','План: нет']].map(([v,l]) => `<option value="${v}" ${draftPlanState === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
            <select id="usersCreditsState" class="aw-select inline" data-users-filter-control="creditsState">
              ${[['all','Кредиты: все'],['with_credits','Кредиты: есть'],['no_credits','Кредиты: нет']].map(([v,l]) => `<option value="${v}" ${draftCreditsState === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
            <select id="usersChannelState" class="aw-select inline" data-users-filter-control="channelState">
              ${[['all','Канал: все'],['with_channel','Канал: есть'],['no_channel','Канал: нет']].map(([v,l]) => `<option value="${v}" ${draftChannelState === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
            <select id="usersActivityWindow" class="aw-select inline" data-users-filter-control="activityWindow">
              ${[['all','Активность: любая'],['7d','Активность: 7 дней'],['30d','Активность: 30 дней'],['90d','Активность: 90 дней']].map(([v,l]) => `<option value="${v}" ${draftActivityWindow === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
            <select id="usersPaymentsState" class="aw-select inline" data-users-filter-control="paymentsState">
              ${[['all','Платежи: все'],['with_payments','Платежи: да'],['no_payments','Платежи: нет']].map(([v,l]) => `<option value="${v}" ${draftPaymentsState === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          <div class="aw-toolbar-note">
            <span class="aw-muted" id="usersFilterDraftHint">${escapeHtml(filterDraftSummary)}</span>
            <span class="aw-muted">Пока изменения не подтверждены, список, CSV и bulk copy остаются на предыдущем рабочем срезе.</span>
          </div>
        </section>

        <div class="aw-users-sticky-meta">
          <div class="aw-basket-pill">Строки: <strong>${pagination.total > 0 ? `${pagination.fromRow}–${pagination.toRow}` : '0'}</strong> / ${pagination.total}</div>
          <div class="aw-basket-pill">На странице: <strong>${pagination.pageSize}</strong></div>
          <div class="aw-users-url-meta">
            <div class="aw-basket-pill">URL-срезы Users: <strong>ON</strong></div>
            <button class="aw-button ghost" data-users-copy-view-url>Скопировать ссылку на срез</button>
          </div>
        </div>

        ${topPagination}

      <section class="aw-compare-rail aw-compare-rail-density">
        <div class="aw-utility-head">
          <div>
            <strong>Сравнение и закрепление</strong>
            <span>Временно закрепляет 2–5 карточек пользователей для side-by-side review без тяжёлого redesign и без новых write-path.</span>
          </div>
          <div class="aw-users-compare-actions">
            <div class="aw-basket-pill">Закреплено: <strong>${pinIds.length}</strong> / ${Number(compareRail.maxPins || 5)}</div>
            <button class="aw-button ghost" id="clearUsersPinsBtn" ${pinIds.length ? '' : 'disabled'}>Очистить закрепление</button>
          </div>
        </div>
        <div class="aw-toolbar-note aw-toolbar-note-compact">
          <span class="aw-muted">Закрепления живут в URL-state users и переживают refresh / reopen вместе с текущим рабочим срезом.</span>
          <span class="aw-muted">Закрепи 2–5 карточек, чтобы рядом сравнивать профиль, сигналы и платежный контекст без постоянных переходов.</span>
        </div>
        ${renderUsersCompareDrillActions(compareRail)}
        <div class="aw-toolbar-note">
          <span class="aw-muted">Действия из сравнения не вводят destructive bulk: export и copy идут через уже существующие audited users_export / users_bulk paths.</span>
          <span class="aw-muted">Кнопки открытия только открывают одну закреплённую карточку по heuristic закреплённого набора — top problem или спящий плательщик.</span>
        </div>
        <div class="aw-compare-grid">
          ${renderUsersCompareCards(compareRail)}
        </div>
      </section>

      <section class="aw-action-ready-rail">
        <div class="aw-utility-head">
          <div>
            <strong>Готовые действия по срезу</strong>
            <span>Готовые действия по текущему срезу: экспорт, tg_id, usernames и быстрые переходы без ручной перенастройки контролов.</span>
          </div>
          </div>
        <div class="aw-toolbar-note aw-toolbar-note-compact">
          <span class="aw-muted">Сейчас этот блок работает по тому же рабочему срезу, который активен в sticky-shell выше.</span>
          <span class="aw-basket-pill">Активный срез: <strong>${escapeHtml(currentSliceLabel)}</strong></span>
        </div>
        <div class="aw-action-grid">
          ${renderUsersSliceActionCards(model.filters || {}, cohortTopline)}
        </div>
        <div class="aw-toolbar-note">
          <span class="aw-muted">Блок готовых действий не вводит новых мутаций: он переиспользует уже существующие export / bulk / priority / cohort-contracts.</span>
          <span class="aw-muted">Copy-действия идут через тот же admin-web audit trail, что и основной блок утилит для списков.</span>
        </div>
      </section>

      <div class="aw-toolbar-note">
        <span class="aw-muted">CSV · до ${Number(exportMeta.maxRows || 10000)} строк · audit trail включён</span>
        ${recentExport ? `<span class="aw-muted">Последняя выгрузка: ${escapeHtml(formatDate(recentExport.ts))} · TG ${Number(recentExport.actorTgId || 0) || '—'}</span>` : '<span class="aw-muted">Выгрузок из web-admin пока не было.</span>'}
      </div>

      <section class="aw-utility-rail">
        <div class="aw-utility-head">
          <div>
            <strong>Утилиты для списков</strong>
            <span>Без мутаций: быстрые списки для ручной операторской работы и аудита.</span>
          </div>
          </div>
        <div class="aw-toolbar aw-toolbar-utility">
          <select id="usersBulkSource" class="aw-select inline">
            <option value="current" ${bulkSource === 'current' ? 'selected' : ''}>Источник: текущий фильтр</option>
            <option value="basket" ${bulkSource === 'basket' ? 'selected' : ''}>Источник: корзина</option>
          </select>
          <select id="usersBulkMode" class="aw-select inline">
            ${bulkOptions.map((item) => `<option value="${escapeHtml(item.id || '')}" ${bulkMode === item.id ? 'selected' : ''}>${escapeHtml(item.label || item.id || '')}</option>`).join('')}
          </select>
          <button class="aw-button secondary" id="copyUsersBulkBtn" ${canRunBulkCopy ? '' : 'disabled'} title="${escapeHtml(canRunBulkCopy ? 'Собрать выбранный список для копирования.' : (bulkSource === 'basket' ? 'Корзина пуста — копировать пока нечего.' : 'Текущий фильтр пуст — копировать пока нечего.'))}">Копировать</button>
          <button class="aw-button ghost" id="selectVisibleUsersBtn" ${canSelectVisibleUsers ? '' : 'disabled'} title="${escapeHtml(canSelectVisibleUsers ? 'Выбрать всех пользователей на текущей странице.' : 'На текущей странице нет строк для выбора.')}">${allVisibleSelected ? 'Снять текущую страницу' : 'Выбрать текущую страницу'}</button>
          <button class="aw-button ghost" id="clearUsersBasketBtn" ${canClearUsersBasket ? '' : 'disabled'} title="${escapeHtml(canClearUsersBasket ? 'Очистить текущую корзину пользователей.' : 'Корзина уже пуста.')}">Очистить корзину</button>
        </div>
        <div class="aw-toolbar-note">
          <span class="aw-muted">Текущий фильтр копирует весь срез до 10 000 строк. Корзина — вручную отобранные пользователи на web-страницах.</span>
          ${recentCopy ? `<span class="aw-muted">Последнее копирование: ${escapeHtml(formatDate(recentCopy.ts))} · TG ${Number(recentCopy.actorTgId || 0) || '—'}</span>` : '<span class="aw-muted">Копирований bulk-утилит пока не было.</span>'}
        </div>
      </section>

      </div>

      ${usersTableMetaStrip}

      <div class="aw-table-wrap aw-users-table-wrap aw-users-table-density aw-users-table-priority">
        <table class="aw-table aw-users-table aw-users-table-density aw-users-table-priority">
          <thead>
            <tr>
              <th class="aw-table-check"><input type="checkbox" id="toggleVisibleUsers" aria-label="Выбрать текущую страницу" ${allVisibleSelected ? 'checked' : ''} data-indeterminate="${someVisibleSelected ? 'true' : 'false'}" ${hasVisibleRows ? '' : 'disabled'} /></th>
              <th>${renderUsersTableHead('Пользователь', 'id · быстрые действия')}</th>
              <th>${renderUsersTableHead('Сегмент', 'роль · профиль')}</th>
              <th>${renderUsersTableHead('План', 'план · кредиты')}</th>
              <th>${renderUsersTableHead('Сигналы', 'приоритетные сигналы')}</th>
              <th>${renderUsersTableHead('Активность', 'свежесть · время')}</th>
              <th>${renderUsersTableHead('Создан', 'дата · время')}</th>
            </tr>
          </thead>
          <tbody>
            ${items.length ? items.map((item) => {
              const planMeta = usersPlanMeta(item);
              const creditsMeta = usersCreditsMeta(item);
              const activityMeta = usersActivityMeta(item);
              const signalChips = usersSignalsPriorityChips(item);
              const segmentBadges = usersSegmentBadges(item);
              return `
              <tr data-user-row="${item.userId}">
                <td class="aw-table-check">
                  <input type="checkbox" class="aw-row-check" data-user-check='${userRowPayload(item)}' ${isUserInBasket(item.userId) ? 'checked' : ''} />
                </td>
                <td>
                  <div class="aw-user-cell aw-user-cell-dense">
                    <div class="aw-user-primary">
                      <strong>${escapeHtml(item.username ? '@' + item.username : 'user #' + item.userId)}</strong>
                      ${item.hasNote ? '<span class="aw-stat-chip is-soft aw-stat-chip-micro"><span class="aw-note-dot"></span> note</span>' : ''}
                    </div>
                    <div class="aw-user-secondary">
                      <small>user_id ${item.userId}</small>
                      <small>tg_id ${item.tgId || '—'}</small>
                    </div>
                    ${renderUserRowQuickActions(item)}
                  </div>
                </td>
                <td>
                  <div class="aw-cell-stack aw-cell-stack-tight aw-cell-stack-dense aw-segment-cell">
                    <div class="aw-inline-chips aw-inline-chips-tight aw-inline-chips-dense">${renderUsersInlineChips(segmentBadges)}</div>
                    <small class="aw-cell-meta-inline">${item.flags?.hasBrandProfile ? 'есть профиль бренда' : 'базовый профиль'}</small>
                  </div>
                </td>
                <td>
                  <div class="aw-cell-stack aw-cell-stack-tight aw-cell-stack-dense aw-plan-cell">
                    <div class="aw-inline-chips aw-inline-chips-tight aw-inline-chips-dense">
                      <span class="aw-stat-chip aw-stat-chip-dense ${escapeHtml(planMeta.tone)}">${escapeHtml(planMeta.label)}</span>
                      <span class="aw-stat-chip aw-stat-chip-dense ${escapeHtml(creditsMeta.tone)}">${escapeHtml(creditsMeta.label)}</span>
                    </div>
                    <small class="aw-cell-meta-inline">${escapeHtml(usersPlanMicroMeta(item))}</small>
                  </div>
                </td>
                <td>
                  <div class="aw-cell-stack aw-cell-stack-tight aw-cell-stack-dense aw-signals-cell">
                    <div class="aw-inline-chips aw-inline-chips-tight aw-inline-chips-dense">${renderUsersInlineChips(signalChips)}</div>
                    <small class="aw-cell-meta-inline">${escapeHtml(usersSignalsCompactDetail(item))}</small>
                  </div>
                </td>
                <td>
                  <div class="aw-cell-stack aw-cell-stack-tight aw-cell-stack-dense aw-activity-cell">
                    <div class="aw-activity-inline">
                      <span class="aw-stat-chip aw-stat-chip-dense ${escapeHtml(activityMeta.tone)}">${escapeHtml(activityMeta.label)}</span>
                      <small class="aw-cell-meta-inline">${escapeHtml(usersActivityInlineLabel(item))}</small>
                    </div>
                  </div>
                </td>
                <td>
                  <div class="aw-cell-stack aw-cell-stack-tight aw-cell-stack-dense aw-cell-stack-compact aw-created-cell">
                    <strong class="aw-cell-title aw-cell-title-dense">${escapeHtml(formatDatePart(item.createdAt))}</strong>
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

  return sectionShell('users', `
    <section class="aw-surface aw-user-hero aw-stack">
      <a href="${escapeHtml(userDetailBackHref())}" data-link class="aw-inline-back">← К списку пользователей</a>
      <div class="aw-user-head">
        <div class="aw-stack aw-gap-xs">
          <h2 class="aw-user-title">${escapeHtml(displayName)}</h2>
          <div class="aw-user-subline">tg_id ${user.tgId || '—'} · user_id ${user.id || '—'} · ${escapeHtml(segmentLabel(user.segment))} · создан ${formatDate(user.createdAt)}</div>
        </div>
        <div class="aw-badges">
          <span class="aw-badge">${escapeHtml(segmentLabel(user.segment))}</span>
          <span class="aw-badge ${user.status === 'banned' ? 'is-bad' : 'is-good'}">${user.status === 'banned' ? 'блок' : 'активен'}</span>
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
            <dt>Статус</dt><dd>${user.status === 'banned' ? `блок · ${formatDate(user.bannedAt)}` : 'активен'}</dd>
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
          <textarea id="noteText" class="aw-textarea" maxlength="1000" placeholder="Внутренняя заметка для фаундера/admin">${escapeHtml(note.text || '')}</textarea>
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
                <strong>${escapeHtml(founderTextLabel(item.action || '—'))}</strong>
                <small>${formatDate(item.ts)} · оператор TG ${Number(item.actorTgId || 0) || '—'}${item.reason ? ` · ${escapeHtml(item.reason)}` : ''}</small>
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
  const reviewBuckets = Array.isArray(model.reviewBuckets) ? model.reviewBuckets : [];
  const actionRail = Array.isArray(model.actionRail) ? model.actionRail : [];
  const followUpQueue = Array.isArray(model.followUpQueue) ? model.followUpQueue : [];
  const compactPaymentsLayout = recentPayments.length === 0 && followUpQueue.length === 0;
  const followUpAllZero = ['noAction', 'watch', 'review', 'urgent'].every((key) => Number(followUpGroups[key] || 0) === 0);
  const statusGroupsAllZero = ['success', 'pending', 'failed', 'fallback'].every((key) => Number(groups[key] || 0) === 0);
  const hints = Array.isArray(model.hints) ? model.hints : [];
  const overall = model.overall || { state: 'unknown', label: 'Данные пока недоступны' };
  return sectionShell('payments', `
    <section class="aw-surface aw-section aw-stack">
      <div class="aw-runtime-head">
        <div>
          <h2>Платёжный обзор</h2>
          <p class="aw-muted">Обновлено: ${formatDate(model.updatedAt)} · read-first разбор платёжной поверхности</p>
        </div>
        <div class="aw-runtime-overall ${runtimeStateClass(overall.state)}">${escapeHtml(runtimeTextLabel(runtimeStateLabel(overall.state)))} · ${escapeHtml(runtimeTextLabel(overall.label || ''))}</div>
      </div>
      <div class="aw-grid-cards aw-runtime-cards">
        <div class="aw-card aw-runtime-card aw-metric-card"><span>Всего платежей</span><strong>${Number(summary.total || 0)}</strong><small>все события</small></div>
        <div class="aw-card aw-runtime-card aw-metric-card"><span>Недавние платежи</span><strong>${Number(summary.recent || 0)}</strong><small>последние 7 дней</small></div>
        <div class="aw-card aw-runtime-card aw-metric-card"><span>Уже применены</span><strong class="aw-status good">${Number(summary.successful || 0)}</strong><small>успешно применены</small></div>
        <div class="aw-card aw-runtime-card aw-metric-card"><span>Ручной разбор</span><strong class="aw-status ${Number(followUpGroups.review || 0) > 0 ? 'warn' : 'good'}">${Number(followUpGroups.review || 0)}</strong><small>fallback / фаундерский разбор</small></div>
        <div class="aw-card aw-runtime-card aw-metric-card"><span>Застряло / проверить</span><strong class="aw-status ${Number(followUpGroups.urgent || 0) > 0 ? 'bad' : 'good'}">${Number(followUpGroups.urgent || 0)}</strong><small>failed + старые pending</small></div>
        <div class="aw-card aw-runtime-card aw-metric-card"><span>Под наблюдением</span><strong class="aw-status ${Number(followUpGroups.watch || 0) > 0 ? 'info' : 'good'}">${Number(followUpGroups.watch || 0)}</strong><small>pending без срочного follow-up</small></div>
      </div>
    </section>

    <div class="aw-overview-workspace-grid aw-section">
      <section class="aw-surface aw-stack">
        <h2>Корзины разбора</h2>
        <p class="aw-surface-note">Сначала ручной разбор, потом stuck / watch, а историю держим ниже как журнал.</p>
        <div class="aw-overview-mini-grid">
          ${reviewBuckets.length ? reviewBuckets.map((item) => `
            <div class="aw-mini-card">
              <span>${escapeHtml(item.label || 'Корзина')}</span>
              <strong class="aw-status ${String(item.tone || 'info')}">${Number(item.count || 0)}</strong>
              <small>${escapeHtml(item.help || '')}</small>
            </div>
          `).join('') : '<div class="aw-empty">Пока пусто.</div>'}
        </div>
      </section>
      <section class="aw-surface aw-stack">
        <h2>Следующий шаг</h2>
        <div class="aw-list">
          ${actionRail.length ? actionRail.map((item) => `
            <div class="aw-list-item">
              <strong class="aw-status ${String(item.tone || 'info')}">${escapeHtml(item.label || 'Следующий шаг')}</strong>
              <small>${escapeHtml(item.body || '')}</small>
            </div>
          `).join('') : '<div class="aw-empty">Блок следующего шага пока пуст.</div>'}
        </div>
        <div class="aw-actions aw-overview-actions">
          ${actionRail.map((item) => `<a href="${escapeHtml(item.href || '/admin/payments')}" data-link class="aw-button ${item.key === 'stay_payments' ? '' : 'ghost'}">${escapeHtml(item.cta || 'Открыть')}</a>`).join('')}
        </div>
      </section>
    </div>

    <section class="aw-surface aw-section aw-stack">
      <h2>Предупреждения</h2>
      <div class="aw-list">
        ${(warnings.length ? warnings : [{ level: 'info', message: 'Явных payment-предупреждений нет.', source: 'payments' }]).map((item) => `
          <div class="aw-list-item aw-warning-item">
            <strong class="${warningTone(item.level)}">${escapeHtml(founderTextLabel(item.message || '—'))}</strong>
            <small>${escapeHtml(item.source || 'payments')}</small>
          </div>
        `).join('')}
      </div>
    </section>

    <div class="aw-split aw-section aw-runtime-layout aw-payments-layout ${compactPaymentsLayout ? 'is-compact' : ''}">
      <section class="aw-stack">
        <section class="aw-surface aw-stack">
          <h2>Кейсы для ручного разбора</h2>
          <div class="aw-list">
            ${followUpQueue.length ? followUpQueue.map((item) => `
              <div class="aw-list-item">
                <div class="aw-row-between">
                  <div>
                    <strong>${escapeHtml(item.displayName || `payment #${Number(item.id || 0)}`)}</strong>
                    <small>#${Number(item.id || 0)} · ${escapeHtml(item.amountLabel || '—')} · ${escapeHtml(item.followUp?.reason || '')}</small>
                  </div>
                  <span class="aw-status ${paymentFollowUpClass(item.followUp?.level)}">${escapeHtml(item.followUp?.label || paymentFollowUpLabel(item.followUp?.level))}</span>
                </div>
                <div class="aw-actions">
                  <a href="/admin/payments/${Number(item.id || 0)}?back=${encodeURIComponent('/admin/payments')}" data-link class="aw-button ghost">Платёжная карточка</a>
                  ${Number(item.userId || 0) > 0 ? `<a href="/admin/users/${Number(item.userId || 0)}?back=${encodeURIComponent('/admin/payments')}" data-link class="aw-button ghost">Карточка пользователя</a>` : ''}
                </div>
              </div>
            `).join('') : '<div class="aw-empty">Сейчас нет кейсов для ручного разбора.</div>'}
          </div>
        </section>

        <section class="aw-surface aw-stack">
          <h2>Последние платежи</h2>
          <p class="aw-muted">Журнал ниже не главный сигнал: сначала корзины разбора и следующий шаг, потом уже история.</p>
          <div class="aw-table-wrap">
            <table class="aw-table">
              <thead>
                <tr>
                  <th>Платёж</th>
                  <th>Пользователь</th>
                  <th>Тип</th>
                  <th>Сумма</th>
                  <th>Статус</th>
                  <th>Следующий шаг</th>
                  <th>Создан</th>
                  <th>Обновлён</th>
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
      </section>

      <aside class="aw-stack">
        <section class="aw-surface aw-stack ${followUpAllZero ? 'is-compact-empty' : ''}">
          <h2>Операторский follow-up</h2>
          <div class="aw-side-stat-grid ${followUpAllZero ? 'is-all-zero' : ''}">
            <div class="aw-side-stat-card"><span>без действий</span><strong>${Number(followUpGroups.noAction || 0)}</strong></div>
            <div class="aw-side-stat-card"><span>наблюдать</span><strong>${Number(followUpGroups.watch || 0)}</strong></div>
            <div class="aw-side-stat-card"><span>проверить</span><strong>${Number(followUpGroups.review || 0)}</strong></div>
            <div class="aw-side-stat-card"><span>срочно</span><strong>${Number(followUpGroups.urgent || 0)}</strong></div>
          </div>
          ${followUpAllZero ? '<div class="aw-empty aw-empty-compact">Платёжный follow-up сейчас выглядит спокойным.</div>' : ''}
        </section>

        <section class="aw-surface aw-stack ${statusGroupsAllZero ? 'is-compact-empty' : ''}">
          <h2>Группы статусов</h2>
          <div class="aw-side-stat-grid ${statusGroupsAllZero ? 'is-all-zero' : ''}">
            <div class="aw-side-stat-card"><span>успех</span><strong>${Number(groups.success || 0)}</strong></div>
            <div class="aw-side-stat-card"><span>ожидает</span><strong>${Number(groups.pending || 0)}</strong></div>
            <div class="aw-side-stat-card"><span>ошибка</span><strong>${Number(groups.failed || 0)}</strong></div>
            <div class="aw-side-stat-card"><span>fallback</span><strong>${Number(groups.fallback || 0)}</strong></div>
          </div>
          ${statusGroupsAllZero ? '<div class="aw-empty aw-empty-compact">Группы статусов пока без напряжения.</div>' : ''}
        </section>

        <section class="aw-surface aw-stack">
          <h2>Подсказки</h2>
          <div class="aw-list">
            ${hints.length ? hints.map((item) => `
              <div class="aw-list-item">
                <strong class="${warningTone(item.kind === 'warning' ? 'warning' : 'info')}">${escapeHtml(item.kind === 'warning' ? 'Нужна проверка' : 'Подсказка')}</strong>
                <small>${escapeHtml(founderTextLabel(item.message || ''))}</small>
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
  return sectionShell('payments', `
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
          <h2>Операторский follow-up</h2>
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
                <small>${escapeHtml(founderTextLabel(item.message || ''))}</small>
              </div>
            `).join('') : '<div class="aw-empty">Пока пусто.</div>'}
          </div>
        </section>

        <section class="aw-surface aw-stack">
          <h2>Последние admin-действия</h2>
          <div class="aw-list">
            ${recentAdminAudit.length ? recentAdminAudit.map((item) => `
              <div class="aw-list-item">
                <strong>${escapeHtml(founderTextLabel(item.action || '—'))}</strong>
                <small>${formatDate(item.ts)} · оператор TG ${Number(item.actorTgId || 0) || '—'}${item.reason ? ` · ${escapeHtml(item.reason)}` : ''}</small>
              </div>
            `).join('') : '<div class="aw-empty">Пока пусто.</div>'}
          </div>
        </section>
      </aside>
    </div>
  `, window.__adminSession || {}, { title: 'Платёжная карточка', subtitle: 'Read-only payment drilldown для founder/operator проверки.' });
}

function commsAudienceLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return ({ all: 'Все', brands: 'Бренды', creators: 'Креаторы', curators: 'Кураторы', managers: 'Менеджеры' })[key] || (key || 'Все');
}

function commsStatusClass(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'done' || key === 'sent') return 'good';
  if (key === 'running' || key === 'paused' || key === 'pending' || key === 'queued') return 'warn';
  if (key === 'error' || key === 'stopped' || key === 'blocked' || key === 'failed' || key === 'delivery_unknown') return 'bad';
  return '';
}

function commsStatusLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return ({ pending: 'Черновик', running: 'Выполняется', paused: 'На паузе', done: 'Завершено', error: 'Ошибка', stopped: 'Остановлено', blocked: 'Заблокировано', sent: 'Отправлено', failed: 'Ошибка', queued: 'В очереди', processing: 'Обрабатывается', warning: 'Нужна проверка', delivery_unknown: 'Исход неизвестен', unknown: 'Неизвестно' })[key] || (key || 'Неизвестно');
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
  const title = document.getElementById('draftTitleInput')?.value?.trim() || 'Новый черновик';
  const audience = document.getElementById('draftAudienceInput')?.value || 'all';
  const bodyText = document.getElementById('draftBodyInput')?.value?.trim() || 'Текст объявления пока пуст.';
  const titleNode = document.getElementById('draftPreviewTitle');
  const metaNode = document.getElementById('draftPreviewMeta');
  const bodyNode = document.getElementById('draftPreviewBody');
  if (titleNode) titleNode.textContent = title;
  if (metaNode) metaNode.textContent = `Аудитория · ${commsAudienceLabel(audience)}`;
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
  const unknownDeliveries = Array.isArray(model.unknownDeliveries) ? model.unknownDeliveries : [];
  const editor = normalizeCommsEditorState(model);
  window.__commsPageData = model;
  window.__commsState = editor;
  const isFounder = !!window.__adminSession?.isFounder;
  return sectionShell('comms', `
    <section class="aw-surface aw-section aw-stack">
      <div class="aw-runtime-head">
        <div>
          <h2>Коммуникации</h2>
          <p class="aw-muted">Обновлено: ${formatDate(model.updatedAt)}</p>
        </div>
        <div class="aw-runtime-overall ${runtimeStateClass(overall.state)}">${escapeHtml(runtimeTextLabel(runtimeStateLabel(overall.state)))} · ${escapeHtml(runtimeTextLabel(overall.label || ''))}</div>
      </div>
      <div class="aw-grid-cards aw-runtime-cards">
        <div class="aw-card aw-runtime-card"><span>Черновики</span><strong>${Number(summary.drafts || 0)}</strong><small>Редактирование и предпросмотр</small></div>
        <div class="aw-card aw-runtime-card"><span>Недавние объявления</span><strong>${Number(summary.recentNotices || 0)}</strong><small>Последние публикации</small></div>
        <div class="aw-card aw-runtime-card"><span>Исходящие: в очереди</span><strong class="aw-status ${Number(summary.outboxPending || 0) > 0 ? 'warn' : 'good'}">${Number(summary.outboxPending || 0)}</strong><small>Ожидают или обрабатываются</small></div>
        <div class="aw-card aw-runtime-card"><span>Исходящие: требуют проверки</span><strong class="aw-status ${Number(summary.outboxWarnings || 0) > 0 ? 'bad' : 'good'}">${Number(summary.outboxWarnings || 0)}</strong><small>Предупреждения и ошибки</small></div>
        <div class="aw-card aw-runtime-card"><span>Исход неизвестен</span><strong class="aw-status ${Number(summary.deliveryUnknown || 0) > 0 ? 'bad' : 'good'}">${Number(summary.deliveryUnknown || 0)}</strong><small>Автоповтор отключён</small></div>
        <div class="aw-card aw-runtime-card"><span>Тестовые отправки</span><strong>${Number(summary.recentTestSends || 0)}</strong><small>Последние события аудита</small></div>
        <div class="aw-card aw-runtime-card"><span>Предупреждения</span><strong class="aw-status ${Number(summary.warnings || 0) > 0 ? 'bad' : 'good'}">${Number(summary.warnings || 0)}</strong><small>Сначала проверь этот блок</small></div>
      </div>
    </section>

    <section class="aw-surface aw-section aw-stack">
      <h2>Предупреждения</h2>
      <div class="aw-list">
        ${(warnings.length ? warnings : [{ level: 'info', message: 'Явных предупреждений по коммуникациям нет.', source: 'communications' }]).map((item) => `
          <div class="aw-list-item aw-warning-item">
            <strong class="${warningTone(item.level)}">${escapeHtml(founderTextLabel(item.message || '—'))}</strong>
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
              <h2>Черновики</h2>
              <p class="aw-muted">Черновики можно создавать, редактировать и проверять. Массовый запуск из веб-админки выключен.</p>
            </div>
            <div class="aw-actions">
              <button class="aw-button ghost" id="newDraftBtn">Новый черновик</button>
            </div>
          </div>
          <div class="aw-list">
            ${drafts.length ? drafts.map((item) => `
              <div class="aw-list-item">
                <div class="aw-row-between">
                  <div>
                    <strong>${escapeHtml(item.title || 'Без названия')}</strong>
                    <small>${escapeHtml(commsAudienceLabel(item.audience))} · ${formatDate(item.updatedAt)} · ${escapeHtml(item.createdByLabel || 'Оператор')}</small>
                  </div>
                  <div class="aw-actions">
                    <span class="aw-status ${commsStatusClass(item.status)}">${escapeHtml(commsStatusLabel(item.status))}</span>
                    <button class="aw-button secondary" data-edit-draft="${Number(item.id || 0)}" data-draft-title="${encodeURIComponent(item.title || '')}" data-draft-audience="${encodeURIComponent(item.audience || 'all')}" data-draft-body="${encodeURIComponent(item.bodyText || '')}">Открыть</button>
                  </div>
                </div>
                <small>${escapeHtml(item.preview || 'Черновик без текста')}</small>
              </div>
            `).join('') : '<div class="aw-empty">Черновиков пока нет.</div>'}
          </div>
        </section>

        <section class="aw-surface aw-stack">
          <div class="aw-runtime-head">
            <div>
              <h2>${editor.draftId ? 'Редактирование черновика' : 'Новый черновик'}</h2>
              <p class="aw-muted">Изменения сохраняются только по кнопке. Пустой текст не допускается.</p>
            </div>
            ${editor.draftId ? `<span class="aw-chip">черновик #${escapeHtml(editor.draftId)}</span>` : '<span class="aw-chip">новый</span>'}
          </div>
          <input id="draftIdInput" type="hidden" value="${escapeHtml(editor.draftId || '')}" />
          <div class="aw-stack aw-gap-xs">
            <label class="aw-muted" for="draftTitleInput">Внутреннее название</label>
            <input id="draftTitleInput" class="aw-input" maxlength="120" placeholder="Например: Апрельское объявление для креаторов" value="${escapeHtml(editor.title || '')}" />
          </div>
          <div class="aw-stack aw-gap-xs">
            <label class="aw-muted" for="draftAudienceInput">Аудитория</label>
            <select id="draftAudienceInput" class="aw-select">
              ${['all','brands','creators','curators','managers'].map((item) => `<option value="${item}" ${editor.audience === item ? 'selected' : ''}>${commsAudienceLabel(item)}</option>`).join('')}
            </select>
          </div>
          <div class="aw-stack aw-gap-xs">
            <label class="aw-muted" for="draftBodyInput">Текст</label>
            <textarea id="draftBodyInput" class="aw-textarea" maxlength="4000" placeholder="Текст объявления для предпросмотра и тестовой отправки">${escapeHtml(editor.bodyText || '')}</textarea>
          </div>
          <div class="aw-actions">
            <button class="aw-button" id="saveDraftBtn">${editor.draftId ? 'Сохранить черновик' : 'Создать черновик'}</button>
            ${isFounder ? `<button class="aw-button secondary" id="testSendDraftBtn" ${editor.draftId ? '' : 'disabled'}>Отправить тест себе</button>` : ''}
          </div>
          <div class="aw-card aw-preview-card">
            <span>Предпросмотр</span>
            <strong id="draftPreviewTitle">${escapeHtml(editor.title || 'Новый черновик')}</strong>
            <small id="draftPreviewMeta">Аудитория · ${escapeHtml(commsAudienceLabel(editor.audience || 'all'))}</small>
            <div class="aw-preview-body" id="draftPreviewBody">${escapeHtml(editor.bodyText || 'Текст объявления пока пуст.')}</div>
          </div>
        </section>

        <section class="aw-surface aw-stack">
          <h2>Недавние объявления</h2>
          <div class="aw-table-wrap">
            <table class="aw-table">
              <thead>
                <tr>
                  <th>Объявление</th>
                  <th>Аудитория</th>
                  <th>Статус</th>
                  <th>Исходящие</th>
                  <th>Обновлён</th>
                </tr>
              </thead>
              <tbody>
                ${recentNotices.length ? recentNotices.map((item) => `
                  <tr>
                    <td><strong>${escapeHtml(item.title || `#${Number(item.id || 0)}`)}</strong><small>${escapeHtml(item.preview || 'Без текста')} · ${escapeHtml(item.createdByLabel || 'Оператор')}</small></td>
                    <td>${escapeHtml(commsAudienceLabel(item.audience))}</td>
                    <td><span class="aw-status ${commsStatusClass(item.status)}">${escapeHtml(commsStatusLabel(item.status))}</span></td>
                    <td><small>отправлено ${Number(item.outbox?.sent || 0)} · в очереди ${Number(item.outbox?.queued || 0)} · ошибки ${Number(item.outbox?.failed || 0)} · сверка ${Number(item.outbox?.deliveryUnknown || 0)}</small></td>
                    <td>${formatDate(item.updatedAt)}</td>
                  </tr>
                `).join('') : '<tr><td colspan="5" class="aw-empty">Недавних объявлений пока нет.</td></tr>'}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <aside class="aw-stack">
        <section class="aw-surface aw-stack">
          <h2>Снимок исходящих</h2>
          <div class="aw-list">
            <div class="aw-list-item"><strong>В очереди</strong><small>${Number(outbox.queued || 0)}</small></div>
            <div class="aw-list-item"><strong>Обрабатывается</strong><small>${Number(outbox.processing || 0)}</small></div>
            <div class="aw-list-item"><strong>Нужна проверка</strong><small>${Number(outbox.warning || 0)}</small></div>
            <div class="aw-list-item"><strong>Ошибки</strong><small>${Number(outbox.failed || 0)}</small></div>
            <div class="aw-list-item"><strong>Исход неизвестен</strong><small>${Number(outbox.deliveryUnknown || 0)} · без автоповтора</small></div>
            <div class="aw-list-item"><strong>Отправлено</strong><small>${Number(outbox.sent || 0)}</small></div>
          </div>
        </section>

        <section class="aw-surface aw-stack">
          <h2>Подсказки</h2>
          <div class="aw-list">
            ${hints.length ? hints.map((item) => `
              <div class="aw-list-item">
                <strong class="${warningTone(item.kind === 'warning' ? 'warning' : 'info')}">${escapeHtml(item.kind === 'warning' ? 'Нужна проверка' : 'Подсказка')}</strong>
                <small>${escapeHtml(founderTextLabel(item.message || ''))}</small>
              </div>
            `).join('') : '<div class="aw-empty">Пока пусто.</div>'}
          </div>
        </section>

        <section class="aw-surface aw-stack">
          <h2>Неопределённые доставки</h2>
          <p class="aw-muted">Telegram мог принять сообщение, но durable receipt не подтверждён. Повторная отправка здесь отсутствует.</p>
          <div class="aw-list">
            ${unknownDeliveries.length ? unknownDeliveries.map((item) => `
              <div class="aw-list-item">
                <div class="aw-row-between">
                  <div>
                    <strong>Рассылка #${Number(item.broadcastId || 0)} · user ${Number(item.userId || 0)}</strong>
                    <small>${item.username ? `@${escapeHtml(item.username)}` : `TG ${Number(item.tgId || 0) || '—'}`} · ${formatDate(item.unknownAt || item.lastAttemptAt)}</small>
                  </div>
                  <span class="aw-status bad">Исход неизвестен</span>
                </div>
                <small>${escapeHtml(item.reason || 'Нет подтверждённого delivery receipt')}</small>
                ${Array.isArray(item.telegramMessageIds) && item.telegramMessageIds.length ? `<small>Telegram message IDs: ${escapeHtml(item.telegramMessageIds.join(', '))}</small>` : ''}
                ${isFounder ? `
                  <div class="aw-actions">
                    <button class="aw-button secondary" data-resolve-unknown="sent" data-broadcast-id="${Number(item.broadcastId || 0)}" data-user-id="${Number(item.userId || 0)}">Подтвердить отправку</button>
                    <button class="aw-button ghost" data-resolve-unknown="failed" data-broadcast-id="${Number(item.broadcastId || 0)}" data-user-id="${Number(item.userId || 0)}">Подтвердить ошибку</button>
                  </div>
                ` : '<small>Ручная сверка доступна только фаундеру.</small>'}
              </div>
            `).join('') : '<div class="aw-empty">Неопределённых доставок нет.</div>'}
          </div>
        </section>

        <section class="aw-surface aw-stack">
          <h2>Последние действия</h2>
          <div class="aw-list">
            ${recentAdminAudit.length ? recentAdminAudit.map((item) => `
              <div class="aw-list-item">
                <strong>${escapeHtml(founderTextLabel(item.action || '—'))}</strong>
                <small>${formatDate(item.ts)} · оператор TG ${Number(item.actorTgId || 0) || '—'}${item.targetId ? ` · объявление ${escapeHtml(item.targetId)}` : ''}</small>
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
  const compactFounderLayout = recentAudit.length === 0;
  const founderHintsCompact = hints.length <= 3;
  const controlCards = founderControlCards(model);
  const founderAllowedMeta = founderSensitivityMeta(founder.allowed ? 'routine' : 'attention');
  const revokeMeta = founderSensitivityMeta(controls.canRevokeAllSessions ? 'sensitive' : 'attention');
  const botOnlyLabel = Array.isArray(controls.botOnlyControls) && controls.botOnlyControls.length
    ? controls.botOnlyControls.map((item) => escapeHtml(item)).join(' · ')
    : '—';
  return sectionShell('founder', `
    <section class="aw-surface aw-section aw-stack">
      <div class="aw-runtime-head">
        <div>
          <h2>Фаундерский доступ</h2>
          <p class="aw-muted">Только для фаундера: обзор только для чтения, границы риска и один чувствительный web-контроль без скрытых write-path.</p>
        </div>
        <div class="aw-runtime-overall ${founder.allowed ? 'good' : 'warn'}">${founder.allowed ? 'ФАУНДЕР-СЕССИЯ' : 'ОПЕРАТОРСКАЯ СЕССИЯ'} · TG ${Number(founder.actorTgId || 0) || '—'}</div>
      </div>
      <div class="aw-badges aw-founder-badges">
        <span class="aw-badge is-good">Только для фаундера</span>
        <span class="aw-badge ${founder.allowed ? 'is-good' : 'is-warn'}">${escapeHtml(founderAllowedMeta.label)}</span>
        <span class="aw-badge ${controls.canRevokeAllSessions ? 'is-bad' : 'is-warn'}">${controls.canRevokeAllSessions ? 'Есть чувствительное web-действие' : 'Только режим чтения в web'}</span>
      </div>
      <div class="aw-grid-cards aw-runtime-cards">
        <div class="aw-card aw-runtime-card"><span>Авторизация и сессия</span><strong class="aw-status good">OK</strong><small>логин ${Number(sessionPolicy.loginTtlSec || 0)}с · сессия ${Number(sessionPolicy.sessionTtlSec || 0)}с</small></div>
        <div class="aw-card aw-runtime-card"><span>Таймаут бездействия</span><strong>${Math.round(Number(sessionPolicy.idleTimeoutSec || 0) / 60) || 0}м</strong><small>применяется при каждой проверке сессии</small></div>
        <div class="aw-card aw-runtime-card"><span>Telegram-аппруверы</span><strong>${Number(sessionPolicy.approversCount || 0)}</strong><small>callback identity boundary</small></div>
        <div class="aw-card aw-runtime-card"><span>Break-glass code</span><strong class="aw-status ${sessionPolicy.fallbackCodeEnabled ? 'warn' : 'good'}">${sessionPolicy.fallbackCodeEnabled ? 'ВКЛ' : 'ВЫКЛ'}</strong><small>${sessionPolicy.fallbackCodeEnabled ? `лимит ${Number(sessionPolicy.codeMaxAttempts || 0)} попыток` : 'production default: off'}</small></div>
        <div class="aw-card aw-runtime-card"><span>Founder Sale</span><strong class="aw-status ${founderSale.enabled ? 'warn' : 'good'}">${founderSale.enabled ? 'ВКЛ' : 'ВЫКЛ'}</strong><small>${escapeHtml(founderSale.deadline || 'Без дедлайна')}</small></div>
      </div>
    </section>

    <div class="aw-overview-workspace-grid aw-section">
      <section class="aw-surface aw-stack">
        <h2>Следующий фаундер-шаг</h2>
        <div class="aw-list">
          <div class="aw-list-item"><strong class="${warningTone(founder.allowed ? 'info' : 'warning')}">${escapeHtml(founderAllowedMeta.label)}</strong><small>${founder.allowed ? 'Сначала читай предупреждения и семантику безопасности. Только потом используй фаундерское web-действие.' : 'В этой сессии фаундерское web-действие недоступно. Экран работает как поверхность только для чтения и только для фаундера.'}</small></div>
          <div class="aw-list-item"><strong>Когда идти в раздел «Система»</strong><small>Если предупреждение связано с QStash, PUBLIC_BASE_URL или системным деградом, сначала открой раздел «Система» и проверь базовый контур.</small></div>
          <div class="aw-list-item"><strong>Когда идти в Telegram</strong><small>Если нужен рискованный контроль, publish-path, платёжная мутация или действие только для Telegram, не лечи это из web-админки — переходи в Telegram-админку.</small></div>
        </div>
        <div class="aw-actions aw-overview-actions">
          <a href="/admin/founder" data-link class="aw-button">Фаундер</a>
          <a href="/admin/runtime" data-link class="aw-button ghost">Открыть раздел «Система»</a>
          <a href="/admin/help" data-link class="aw-button ghost">Открыть помощь</a>
        </div>
      </section>
      <section class="aw-surface aw-stack">
        <h2>Границы этой поверхности</h2>
        <div class="aw-list">
          <div class="aw-list-item"><strong>Что можно делать здесь</strong><small>Смотреть предупреждения, параметры Founder Sale, сессионные лимиты и при необходимости завершать все web-сессии.</small></div>
          <div class="aw-list-item"><strong>Чего тут нет специально</strong><small>Нет runtime/config writes, нет платёжных write-действий, нет publish-path действий и нет широких destructive bulk-мутaций.</small></div>
          <div class="aw-list-item"><strong>Главный принцип</strong><small>Фаундерский слой остаётся отдельным экраном фаундера: опасные действия не маскируются под обычную операторскую рутину.</small></div>
        </div>
      </section>
    </div>

    <section class="aw-surface aw-section aw-stack">
      <div class="aw-runtime-head">
        <div>
          <h2>Семантика безопасности</h2>
          <p class="aw-surface-note">Каждый фаундерский контур ниже помечен по чувствительности, чтобы web-админка не выглядела как обычный экран с тумблерами.</p>
        </div>
        <span class="aw-badge is-warn">Подтверждение обязательно для чувствительных действий</span>
      </div>
      <div class="aw-runtime-summary-grid">
        ${controlCards.map((item) => {
          const meta = founderSensitivityMeta(item.kind);
          return `
            <article class="aw-mini-card aw-founder-safety-card aw-founder-safety-card--${escapeHtml(item.kind)}">
              <div class="aw-founder-safety-head">
                <span>${escapeHtml(item.title)}</span>
                <span class="aw-badge ${escapeHtml(meta.tone)}">${escapeHtml(meta.label)}</span>
              </div>
              <strong>${escapeHtml(item.meaning)}</strong>
              <small>${escapeHtml(item.when)}</small>
            </article>
          `;
        }).join('')}
      </div>
    </section>

    <div class="aw-split aw-section aw-runtime-layout aw-founder-layout ${compactFounderLayout ? 'is-compact' : ''}">
      <section class="aw-stack">
        <section class="aw-surface aw-stack">
          <h2>Фаундерское web-действие</h2>
          <div class="aw-founder-action-rail aw-founder-risk-${controls.canRevokeAllSessions ? 'sensitive' : 'attention'}">
            <div class="aw-founder-action-copy">
              <div class="aw-founder-action-head">
                <strong>Завершить все web-сессии</strong>
                <span class="aw-badge ${escapeHtml(revokeMeta.tone)}">${escapeHtml(revokeMeta.label)}</span>
              </div>
              <p class="aw-surface-note">Закроет все текущие web-сессии, включая эту фаундерскую сессию. После применения экран переведёт на повторный вход.</p>
              <div class="aw-list">
                <div class="aw-list-item"><strong>На что влияет</strong><small>Только слой web-доступа. Не меняет состояние runtime/env/payments.</small></div>
                <div class="aw-list-item"><strong>Когда использовать</strong><small>${controls.canRevokeAllSessions ? 'Когда нужен жёсткий сброс web-доступа для фаундера или надо гарантированно закрыть чужие сессии.' : 'Сейчас фаундерское действие недоступно. Оставайся в режиме только для чтения и смотри предупреждения.'}</small></div>
                <div class="aw-list-item"><strong>Контур только для Telegram</strong><small>${botOnlyLabel}</small></div>
              </div>
            </div>
            <div class="aw-founder-action-cta">
              <button class="aw-button danger" id="revokeAllBtn" ${controls.canRevokeAllSessions ? '' : 'disabled'} data-founder-control="revoke_all">Применить: завершить все web-сессии</button>
              <small class="aw-runtime-footnote">Это действие только для фаундера с системным эффектом на доступ. Подтверждение спрашивается отдельно.</small>
            </div>
          </div>
        </section>

        <section class="aw-surface aw-stack">
          <h2>Параметры Founder Sale</h2>
          <p class="aw-surface-note">Справочный слой фаундерской политики: помогает понять коммерческий режим, но сам по себе не является отдельным write-контролем в web-админке.</p>
          <div class="aw-mini-grid aw-mini-grid-3">
            <div class="aw-mini-card"><span>Бренд · 3 мес</span><strong>${Number(founderSale.brand3mPrice || 0)}</strong><small>${Number(founderSale.brand3mCredits || 0)} кредитов</small></div>
            <div class="aw-mini-card"><span>Бренд · 12 мес</span><strong>${Number(founderSale.brand12mPrice || 0)}</strong><small>${Number(founderSale.brand12mCredits || 0)} кредитов</small></div>
            <div class="aw-mini-card"><span>Креатор · 12 мес</span><strong>${Number(founderSale.creator12mPrice || 0)}</strong><small>фаундерская цена</small></div>
          </div>
        </section>

        <section class="aw-surface aw-stack">
          <h2>Предупреждения фаундера</h2>
          <div class="aw-list">
            ${(warnings.length ? warnings : [{ level: 'info', message: 'Явных фаундерских предупреждений нет.', source: 'founder' }]).map((item) => `
              <div class="aw-list-item aw-warning-item">
                <strong class="${warningTone(item.level)}">${escapeHtml(founderTextLabel(item.message || '—'))}</strong>
                <small>${escapeHtml(founderTextLabel(item.source || 'фаундер'))}</small>
              </div>
            `).join('')}
          </div>
        </section>
      </section>

      <aside class="aw-stack">
        <section class="aw-surface aw-stack ${founderHintsCompact ? 'is-compact-empty' : ''}">
          <h2>Как пользоваться этой поверхностью</h2>
          <div class="aw-list">
            ${hints.length ? hints.map((item) => `
              <div class="aw-list-item">
                <strong class="${warningTone(item.kind === 'warning' ? 'warning' : 'info')}">${escapeHtml(item.kind === 'warning' ? 'Нужна проверка' : 'Подсказка')}</strong>
                <small>${escapeHtml(founderTextLabel(item.message || ''))}</small>
              </div>
            `).join('') : '<div class="aw-empty">Пока пусто.</div>'}
          </div>
        </section>

        <section class="aw-surface aw-stack">
          <h2>Сводка по системе</h2>
          <div class="aw-mini-grid aw-mini-grid-2">
            <div class="aw-mini-card"><span>Пользователи</span><strong>${Number(snapshots.usersTotal || 0)}</strong></div>
            <div class="aw-mini-card"><span>Система</span><strong>${escapeHtml(runtimeStateLabel(snapshots.runtimeState || 'unknown'))}</strong></div>
            <div class="aw-mini-card"><span>Платёжные сигналы</span><strong>${Number(snapshots.paymentWarnings || 0)}</strong></div>
            <div class="aw-mini-card"><span>Сигналы коммуникаций</span><strong>${Number(snapshots.commsWarnings || 0)}</strong></div>
          </div>
        </section>

        <section class="aw-surface aw-stack ${recentAudit.length === 0 ? 'is-compact-empty' : ''}">
          <h2>Последние действия фаундера</h2>
          <div class="aw-list">
            ${recentAudit.length ? recentAudit.map((item) => `
              <div class="aw-list-item">
                <strong>${escapeHtml(founderTextLabel(item.action || '—'))}</strong>
                <small>${formatDate(item.ts)} · TG ${Number(item.actorTgId || 0) || '—'}${item.targetId ? ` · ${escapeHtml(item.targetId)}` : ''}</small>
              </div>
            `).join('') : '<div class="aw-empty">Пока пусто.</div>'}
          </div>
        </section>
      </aside>
    </div>
  `, window.__adminSession || {});
}

function runtimeView(model) {
  const statusHierarchy = Array.isArray(model.statusHierarchy) ? model.statusHierarchy : [];
  const incident = model.incidentStrip || { state: 'info', title: 'Данные пока недоступны', message: 'Обнови страницу вручную.', sourceLabel: 'Runtime', action: 'Проверь соседние runtime сигналы.', actionLabel: 'Справочно' };
  const incidentFeed = Array.isArray(incident.feed) ? incident.feed : [];
  const controls = Array.isArray(model.controlSnapshot?.items) ? model.controlSnapshot.items : [];
  const configPresence = Array.isArray(model.configPresence) ? model.configPresence : [];
  const hints = Array.isArray(model.hints) ? model.hints : [];
  const recentEvents = Array.isArray(model.recentRuntimeEvents) ? model.recentRuntimeEvents : [];
  const overall = model.overall || { state: 'unknown', label: 'Статус неизвестен' };
  const summaryCards = model.summaryCards || {};
  const configSummary = model.configSummary || {};
  const lastAudit = model.controlSnapshot?.lastAudit || null;
  const queueClarity = model.queueClarity || {};
  const queueOverall = queueClarity.overall || { state: 'unknown', label: 'Справочно' };
  const queueSummary = queueClarity.summaryCards || {};
  const queueLanes = Array.isArray(queueClarity.lanes) ? queueClarity.lanes : [];
  const retrySignals = Array.isArray(queueClarity.retrySignals) ? queueClarity.retrySignals : [];
  return sectionShell('runtime', `
    <section class="aw-surface aw-section aw-stack">
      <div class="aw-runtime-head">
        <div>
          <h2>Общий статус</h2>
          <p class="aw-muted">Обновлено: ${formatDate(model.updatedAt)} · ручной read-first снимок</p>
        </div>
        <div class="aw-runtime-overall ${runtimeStateClass(overall.state)}">${escapeHtml(runtimeTextLabel(runtimeStateLabel(overall.state)))} · ${escapeHtml(runtimeTextLabel(overall.label || ''))}</div>
      </div>
      <div class="aw-runtime-summary-grid">
        <div class="aw-mini-card"><span>OK</span><strong class="aw-status good">${Number(summaryCards.ok || 0)}</strong><small>контуры без явного действия</small></div>
        <div class="aw-mini-card"><span>Нужна проверка</span><strong class="aw-status ${Number(summaryCards.check || 0) > 0 ? 'warn' : 'good'}">${Number(summaryCards.check || 0)}</strong><small>degraded / paused / incident</small></div>
        <div class="aw-mini-card"><span>Не настроено</span><strong class="aw-status ${Number(summaryCards.setup || 0) > 0 ? 'bad' : 'good'}">${Number(summaryCards.setup || 0)}</strong><small>setup gaps / missing env</small></div>
        <div class="aw-mini-card"><span>Справочно</span><strong class="aw-status ${Number(summaryCards.info || 0) > 0 ? 'info' : 'good'}">${Number(summaryCards.info || 0)}</strong><small>unknown / optional / no signal</small></div>
        <div class="aw-mini-card"><span>Паузы контуров</span><strong class="aw-status ${Number(summaryCards.pausedControls || 0) > 0 ? 'warn' : 'good'}">${Number(summaryCards.pausedControls || 0)}</strong><small>оператор не выключал критичные тумблеры</small></div>
        <div class="aw-mini-card"><span>Инцидентные режимы</span><strong class="aw-status ${Number(summaryCards.incidentModes || 0) > 0 ? 'warn' : 'good'}">${Number(summaryCards.incidentModes || 0)}</strong><small>runtime override-режимы</small></div>
      </div>
      <div class="aw-runtime-topline-grid">
        ${statusHierarchy.length ? statusHierarchy.map((item) => `
          <div class="aw-card aw-runtime-topline-card">
            <div class="aw-runtime-topline-label">${escapeHtml(runtimeCardLabel(item.label || 'Контур'))}</div>
            <div class="aw-runtime-card-head">
              <strong class="aw-status ${runtimeStateClass(item.state)}">${escapeHtml(runtimeTextLabel(item.semanticLabel || runtimeStateLabel(item.state)))}</strong>
              <span class="aw-runtime-action aw-status ${runtimeActionabilityClass(item.actionability)}">${escapeHtml(runtimeTextLabel(item.actionLabel || runtimeActionabilityLabel(item.actionability)))}</span>
            </div>
            <small>${escapeHtml(runtimeItemSummary(item, 'Данные пока недоступны.'))}</small>
            <div class="aw-card-subtle">${escapeHtml(runtimeItemMeaning(item))}</div>
            <div class="aw-card-subtle"><strong>Следующий шаг:</strong> ${escapeHtml(runtimeItemNextStep(item, 'Обнови Runtime вручную и сверяй соседние сигналы.'))}</div>
          </div>
        `).join('') : '<div class="aw-empty">Статусные контуры пока не собраны.</div>'}
      </div>
    </section>

    <section class="aw-surface aw-section aw-stack">
      <div class="aw-runtime-incident ${warningTone(incident.tone || incident.state)}">
        <div class="aw-runtime-incident-main">
          <span class="aw-runtime-incident-kicker">Главный runtime-сигнал</span>
          <h2>${escapeHtml(runtimeTextLabel(incident.title || 'Нужна проверка'))}</h2>
          <p>${escapeHtml(runtimeItemHasProfileContactDrift(incident) ? 'Это уже не просто config-gap: последний retry спорит с текущей схемой и требует source-level разбора.' : runtimeTextLabel(incident.message || '—'))}</p>
        </div>
        <div class="aw-runtime-incident-meta">
          <div class="aw-runtime-incident-item">
            <span>Семантика</span>
            <strong class="aw-status ${runtimeStateClass(incident.state)}">${escapeHtml(incident.semanticLabel || runtimeStateLabel(incident.state))}</strong>
            <small>${escapeHtml(runtimeCardLabel(incident.sourceLabel || 'Runtime'))} · ${formatDate(incident.updatedAt || model.updatedAt)}</small>
          </div>
          <div class="aw-runtime-incident-item">
            <span>Нужно ли действие</span>
            <strong class="aw-status ${runtimeActionabilityClass(incident.actionability)}">${escapeHtml(incident.actionLabel || runtimeActionabilityLabel(incident.actionability))}</strong>
          </div>
          <div class="aw-runtime-incident-item">
            <span>Следующий шаг</span>
            <strong>${escapeHtml(runtimeItemNextStep(incident, 'Обнови страницу вручную.'))}</strong>
          </div>
        </div>
      </div>
      <div class="aw-runtime-incident-feed">
        ${(incidentFeed.length ? incidentFeed : [{ state: 'ok', semanticLabel: 'OK', actionLabel: 'Действие не нужно', title: 'Явных инцидентов нет', sourceLabel: 'Runtime', meaning: 'Контрольная полоса и соседние сигналы выглядят стабильно.', nextStep: 'Достаточно ручного refresh.' }]).map((item) => `
          <div class="aw-card aw-runtime-feed-card">
            <span>${escapeHtml(runtimeCardLabel(item.sourceLabel || item.source || 'Runtime'))}</span>
            <div class="aw-runtime-card-head">
              <strong class="aw-status ${runtimeStateClass(item.state)}">${escapeHtml(runtimeTextLabel(item.semanticLabel || runtimeStateLabel(item.state)))}</strong>
              <span class="aw-runtime-action aw-status ${runtimeActionabilityClass(item.actionability)}">${escapeHtml(runtimeTextLabel(item.actionLabel || runtimeActionabilityLabel(item.actionability)))}</span>
            </div>
            <small>${escapeHtml(runtimeItemSummary(item, '—'))}</small>
            <div class="aw-card-subtle">${escapeHtml(runtimeItemMeaning(item))}</div>
            <div class="aw-card-subtle"><strong>Следующий шаг:</strong> ${escapeHtml(runtimeItemNextStep(item, 'Сверь соседние сигналы вручную.'))}</div>
          </div>
        `).join('')}
      </div>
    </section>

    <section class="aw-surface aw-section aw-stack">
      <div class="aw-runtime-head">
        <div>
          <h2>Очереди и retry</h2>
          <p class="aw-muted">Backlog, retry cooldown и stuck-сигналы без write-path действий.</p>
        </div>
        <div class="aw-runtime-overall ${runtimeStateClass(queueOverall.state)}">${escapeHtml(runtimeTextLabel(runtimeStateLabel(queueOverall.state)))} · ${escapeHtml(runtimeTextLabel(queueOverall.label || ''))}</div>
      </div>
      <div class="aw-runtime-summary-grid">
        <div class="aw-mini-card"><span>Активная очередь</span><strong class="aw-status ${Number(queueSummary.activeBacklog || 0) > 0 ? 'warn' : 'good'}">${Number(queueSummary.activeBacklog || 0)}</strong><small>pending + inflight + stuck</small></div>
        <div class="aw-mini-card"><span>Проблемы retry</span><strong class="aw-status ${Number(queueSummary.retryProblems || 0) > 0 ? 'bad' : 'good'}">${Number(queueSummary.retryProblems || 0)}</strong><small>последний retry / QStash stuck</small></div>
        <div class="aw-mini-card"><span>Окна охлаждения</span><strong class="aw-status ${Number(queueSummary.coolingWindows || 0) > 0 ? 'warn' : 'good'}">${Number(queueSummary.coolingWindows || 0)}</strong><small>retry cooldown / requeue cooldown</small></div>
        <div class="aw-mini-card"><span>Справочно</span><strong class="aw-status ${Number(queueSummary.infoOnly || 0) > 0 ? 'info' : 'good'}">${Number(queueSummary.infoOnly || 0)}</strong><small>контуры без обязательного сигнала</small></div>
      </div>
      <div class="aw-runtime-queues-grid">
        ${queueLanes.length ? queueLanes.map((item) => `
          <div class="aw-card aw-runtime-queue-card">
            <span>${escapeHtml(runtimeCardLabel(item.label || 'Lane'))}</span>
            <div class="aw-runtime-card-head">
              <strong class="aw-status ${runtimeStateClass(item.state)}">${escapeHtml(runtimeTextLabel(item.semanticLabel || runtimeStateLabel(item.state)))}</strong>
              <span class="aw-runtime-action aw-status ${runtimeActionabilityClass(item.actionability)}">${escapeHtml(runtimeTextLabel(item.actionLabel || runtimeActionabilityLabel(item.actionability)))}</span>
            </div>
            <small>${escapeHtml(runtimeItemSummary(item, '—'))}</small>
            <div class="aw-card-subtle">${escapeHtml(runtimeItemDetail(item))}</div>
            <div class="aw-card-subtle">${escapeHtml(runtimeItemMeaning(item))}</div>
            <div class="aw-card-subtle"><strong>Следующий шаг:</strong> ${escapeHtml(runtimeItemNextStep(item, 'Сверь backlog и соседние retry сигналы.'))}</div>
          </div>
        `).join('') : '<div class="aw-empty">Очереди пока недоступны.</div>'}
      </div>
      <div class="aw-runtime-retry-feed">
        ${retrySignals.length ? retrySignals.map((item) => `
          <div class="aw-card aw-runtime-feed-card">
            <span>${escapeHtml(runtimeCardLabel(item.label || 'Retry signal'))}</span>
            <div class="aw-runtime-card-head">
              <strong class="aw-status ${runtimeStateClass(item.state)}">${escapeHtml(runtimeTextLabel(item.semanticLabel || runtimeStateLabel(item.state)))}</strong>
              <span class="aw-runtime-action aw-status ${runtimeActionabilityClass(item.actionability)}">${escapeHtml(runtimeTextLabel(item.actionLabel || runtimeActionabilityLabel(item.actionability)))}</span>
            </div>
            <small>${escapeHtml(runtimeItemSummary(item, '—'))}</small>
            <div class="aw-card-subtle">${escapeHtml(runtimeItemDetail(item))}</div>
            <div class="aw-card-subtle">${escapeHtml(runtimeItemMeaning(item))}</div>
            ${item.note ? `<div class="aw-card-subtle">${escapeHtml(runtimeTextLabel(item.note))}</div>` : ''}
            <div class="aw-card-subtle"><strong>Следующий шаг:</strong> ${escapeHtml(runtimeItemNextStep(item, 'Сверь retry status вручную.'))}</div>
          </div>
        `).join('') : '<div class="aw-empty">Retry signals пока пусты.</div>'}
      </div>
      <div class="aw-runtime-footnote">Очереди не мутируются из Runtime: это только read-first слой для backlog / retry / cooldown разборов.</div>
    </section>

    <section class="aw-surface aw-section aw-stack">
      <div class="aw-runtime-head">
        <div>
          <h2>Снимок управления</h2>
          <p class="aw-muted">Без write-path действий: только текущее runtime-состояние безопасных тумблеров.</p>
        </div>
        <div class="aw-runtime-overall ${Number(model.controlSnapshot?.pausedCount || 0) > 0 || Number(model.controlSnapshot?.incidentModes || 0) > 0 ? 'warn' : 'good'}">паузы ${Number(model.controlSnapshot?.pausedCount || 0)} · инциденты ${Number(model.controlSnapshot?.incidentModes || 0)}</div>
      </div>
      <div class="aw-runtime-controls-grid">
        ${controls.length ? controls.map((item) => `
          <div class="aw-card aw-runtime-control-card">
            <span>${escapeHtml(runtimeCardLabel(controlSurfaceLabel(item.label || 'Control')))}</span>
            <div class="aw-runtime-card-head">
              <strong class="aw-status ${runtimeStateClass(item.state)}">${escapeHtml(runtimeTextLabel(item.semanticLabel || runtimeStateLabel(item.state)))}</strong>
              <span class="aw-runtime-action aw-status ${runtimeActionabilityClass(item.actionability)}">${escapeHtml(runtimeTextLabel(item.actionLabel || runtimeActionabilityLabel(item.actionability)))}</span>
            </div>
            <small>Текущее состояние: ${escapeHtml(item.stateLabel || '—')}</small>
            <div class="aw-card-subtle">${escapeHtml(runtimeItemMeaning(item))}</div>
            <div class="aw-card-subtle"><strong>Следующий шаг:</strong> ${escapeHtml(runtimeItemNextStep(item, 'Сверь смысл этого toggle в control surface.'))}</div>
            <div class="aw-card-subtle">${item.changedAt ? `обновлено ${escapeHtml(formatDate(item.changedAt))}` : 'без явного runtime override'}</div>
          </div>
        `).join('') : '<div class="aw-empty">Control surface пока недоступен.</div>'}
      </div>
      <div class="aw-runtime-footnote">${lastAudit ? `Последнее изменение: ${escapeHtml(controlAuditSummary(lastAudit))} · ${escapeHtml(controlAuditActorLabel(lastAudit))} · ${escapeHtml(formatDate(lastAudit.ts))}` : 'Переключений пока не было.'}</div>
    </section>

    <div class="aw-runtime-sidebar-grid aw-section">
      <section class="aw-surface aw-stack">
        <div class="aw-runtime-head">
          <div>
            <h2>Конфигурация</h2>
            <p class="aw-muted">Матрица присутствия env без утечки значений секретов.</p>
          </div>
          <div class="aw-runtime-overall ${Number(configSummary.missing || 0) > 0 ? 'warn' : 'good'}">не настроено ${Number(configSummary.missing || 0)} · справочно ${Number(configSummary.infoOnly || 0)}</div>
        </div>
        <div class="aw-config-grid">
          ${configPresence.map((item) => `
            <div class="aw-config-row">
              <div class="aw-config-main">
                <div class="aw-config-key">${escapeHtml(item.key || '—')}</div>
                ${runtimeConfigBadgeLabel(item) ? `<div class="aw-badges"><span class="aw-badge is-info">${escapeHtml(runtimeConfigBadgeLabel(item))}</span></div>` : ''}
                <div class="aw-config-meta">${escapeHtml(runtimeItemMeaning(item))}</div>
                <div class="aw-config-meta"><strong>Следующий шаг:</strong> ${escapeHtml(runtimeItemNextStep(item, 'Обнови Runtime после изменения env.'))}</div>
              </div>
              <div class="aw-config-state-wrap">
                <div class="aw-config-state aw-status ${runtimeStateClass(item.toneState || item.state)}">${escapeHtml(configPresenceLabel(item.state))}</div>
                <small>${escapeHtml(runtimeConfigSemanticLabel(item))}</small>
              </div>
            </div>
          `).join('') || '<div class="aw-empty">Данные пока недоступны.</div>'}
        </div>
      </section>

      <section class="aw-surface aw-stack ${hints.length <= 1 ? 'is-compact-empty' : ''}">
        <h2>Как читать этот экран</h2>
        <div class="aw-list">
          <div class="aw-list-item"><strong>Пауза ≠ поломка</strong><small>Если контур paused оператором, это control-plane режим. Сначала пойми, зачем он был включён, и только потом ищи поломку.</small></div>
          <div class="aw-list-item"><strong>setup-gap ≠ runtime error</strong><small>Missing env — это setup/runbook задача. Ошибка retry вроде profile_contact — уже source/schema drift и требует отдельного разбора.</small></div>
          <div class="aw-list-item"><strong>Users vs Runtime</strong><small>Пользователи нужны для разбора людей и срезов. Runtime — для понимания состояния контуров, очередей, retry и конфигурации.</small></div>
          <div class="aw-list-item"><strong>QStash для admin v1</strong><small>QSTASH_TOKEN и QSTASH_CURRENT_SIGNING_KEY сейчас опциональны для read-admin режима, но нужны для полноценных delivery / publish / retry контуров.</small></div>
          ${hints.length ? hints.map((item) => `
            <div class="aw-list-item">
              <strong class="${warningTone(item.kind === 'warning' ? 'warning' : 'info')}">${escapeHtml(item.kind === 'warning' ? 'Нужна проверка' : 'Подсказка')}</strong>
              <small>${escapeHtml(founderTextLabel(item.message || ''))}</small>
            </div>
          `).join('') : ''}
        </div>
        <div class="aw-actions aw-help-actions">
          <a href="/admin/help" data-link class="aw-button ghost">Открыть Помощь</a>
        </div>
      </section>
    </div>

    <section class="aw-surface aw-section aw-stack">
      <h2>Последние runtime-сигналы</h2>
      <div class="aw-list">
        ${recentEvents.length ? recentEvents.map((item) => `
          <div class="aw-list-item">
            <strong class="${warningTone(item.kind)}">${escapeHtml(runtimeItemHasProfileContactDrift(item) ? 'Последний retry спорит со схемой profile_contact' : runtimeTextLabel(item.message || '—'))}</strong>
            <small>${escapeHtml(runtimeCardLabel(sourceLabel(item.source || 'runtime')))} · ${formatDate(item.at)}</small>
          </div>
        `).join('') : '<div class="aw-empty">Пока пусто.</div>'}
      </div>
    </section>
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
  if (!isAdminMobileViewport()) closeAdminMobileNav();
  if (route.page === 'login') {
    closeAdminMobileNav();
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
  } else if (route.page === 'help') {
    app.innerHTML = helpView(session);
  } else if (route.page === 'founder') {
    const res = await api('/api/admin-web-read?section=founder');
    if (!res.ok) {
      app.innerHTML = sectionShell('founder', `<div class="aw-surface aw-empty">Founder surface недоступен для текущей сессии.</div>`, session);
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
      closeAdminMobileNav();
      history.pushState({}, '', href);
      render();
    });
  });
}

function readUsersControlsState() {
  const state = getUsersState();
  const draft = readUsersFilterDraftFromDom(pickUsersFilterState(state));
  return {
    q: document.getElementById('usersSearch')?.value || state.q || '',
    segment: document.getElementById('usersSegment')?.value || state.segment || 'all',
    planState: draft.planState,
    creditsState: draft.creditsState,
    channelState: draft.channelState,
    activityWindow: draft.activityWindow,
    paymentsState: draft.paymentsState,
    sortBy: document.getElementById('usersSortBy')?.value || state.sortBy || 'created_desc',
    cohortView: state.cohortView || 'all',
    page: state.page || 0,
    pageSize: Number(document.querySelector('[data-users-page-size]')?.value || state.pageSize || 20) || 20,
    pinIds: normalizeUsersPinIds(state.pinIds || []),
  };
}

function setUsersStateFromControls(overrides = {}) {
  window.__usersState = normalizeUsersState({ ...readUsersControlsState(), ...(overrides || {}) });
  syncUsersFilterDraftFromState(window.__usersState);
  syncUsersUrlState(window.__usersState, { replace: true });
  return getUsersState();
}

function setUsersStateExact(overrides = {}) {
  window.__usersState = normalizeUsersState({ ...getUsersState(), ...(overrides || {}) });
  syncUsersFilterDraftFromState(window.__usersState);
  syncUsersUrlState(window.__usersState, { replace: true });
  return getUsersState();
}

async function runUsersExportAction(scope = 'current', opts = {}) {
  const state = getUsersState();
  const ids = normalizeUsersPinIds(opts?.ids || []);
  const params = new URLSearchParams({ section: 'users_export', scope, segment: state.segment, q: state.q, plan_state: state.planState, credits_state: state.creditsState, channel_state: state.channelState, activity_window: state.activityWindow, payments_state: state.paymentsState, sort_by: state.sortBy, cohort_view: state.cohortView });
  if (ids.length) params.set('ids', ids.join(','));
  await downloadCsv(`/api/admin-web-read?${params.toString()}`, `users_${ids.length ? 'pins' : scope}.csv`);
  showToast(ids.length ? 'CSV по закреплённому набору подготовлен.' : 'CSV по текущему срезу подготовлен.', 'success');
  render();
}

async function runUsersPinnedExportAction() {
  const ids = getUsersPinIds();
  if (!ids.length) {
    showToast('Пока нет закреплённых карточек. Сначала закрепи 2–5 пользователей.', 'info');
    return;
  }
  await runUsersExportAction('current', { ids });
}

async function runUsersBulkCopyAction(mode = 'tg_ids', source = 'current', opts = {}) {
  const state = getUsersState();
  const idsOverride = normalizeUsersPinIds(opts?.ids || []);
  window.__usersBulkState = { mode, source };
  const params = new URLSearchParams({ section: 'users_bulk', mode, segment: state.segment, q: state.q, plan_state: state.planState, credits_state: state.creditsState, channel_state: state.channelState, activity_window: state.activityWindow, payments_state: state.paymentsState, sort_by: state.sortBy, cohort_view: state.cohortView });
  if (source === 'basket' || idsOverride.length) {
    const ids = idsOverride.length ? idsOverride : getUsersBasketIds();
    if (!ids.length) {
      showToast(idsOverride.length ? 'Закреплённый набор пуст. Сначала закрепи карточки пользователей.' : 'Корзина пуста. Сначала отметь пользователей в таблице.', 'info');
      return;
    }
    params.set('ids', ids.join(','));
  }
  const res = await api(`/api/admin-web-read?${params.toString()}`);
  if (!res.ok) {
    showToast(`Не удалось собрать список: ${res.data?.error || 'unknown'}`, 'error');
    return;
  }
  const payload = res.data?.data || {};
  if (!String(payload.text || '').trim()) {
    showToast('Пустой результат: для выбранного режима нет данных.', 'info');
    return;
  }
  const copied = await copyTextToClipboard(payload.text || '', {
    title: 'Ручное копирование списка',
    hint: 'Автокопирование списка не сработало. Текст уже подготовлен: нажми Ctrl+C или скачай .txt.',
    filename: `users-${payload.mode || 'list'}-${source || 'current'}.txt`,
  });
  if (!copied.ok && !copied.fallbackOpened) {
    showToast('Не удалось скопировать в буфер обмена.', 'error');
    return;
  }
  showToast(copied.ok ? `Скопировано: ${payload.rowsCount || 0} строк (${usersBulkModeLabel(payload.mode)} · ${basketSourceLabel(source)}).` : `Открыл ручной режим копирования: ${payload.rowsCount || 0} строк (${usersBulkModeLabel(payload.mode)} · ${basketSourceLabel(source)}).`, copied.ok ? 'success' : 'info');
  render();
}

async function runUsersPinnedBulkCopyAction(mode = 'tg_ids') {
  const ids = getUsersPinIds();
  if (!ids.length) {
    showToast('Пока нет закреплённых карточек. Сначала закрепи 2–5 пользователей.', 'info');
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
    showToast(kind === 'dormant_payer' ? 'Сейчас среди закреплённых нет спящего плательщика.' : 'Сейчас среди закреплённых нет проблемного пользователя.', 'info');
    return;
  }
  const back = encodeURIComponent(buildUsersListHref(getUsersState()));
  history.pushState({}, '', `/admin/users/${Number(target.userId || 0)}?back=${back}`);
  render();
}

async function runUserRowCopyAction(item = {}, mode = 'tg_ids') {
  const state = getUsersState();
  const userId = Number(item?.userId || 0) || 0;
  if (!userId) {
    showToast('Не удалось определить пользователя для действия по строке.', 'error');
    return;
  }
  const params = new URLSearchParams({ section: 'users_bulk', mode, ids: String(userId), segment: state.segment, q: state.q, plan_state: state.planState, credits_state: state.creditsState, channel_state: state.channelState, activity_window: state.activityWindow, payments_state: state.paymentsState, sort_by: state.sortBy, cohort_view: state.cohortView });
  const res = await api(`/api/admin-web-read?${params.toString()}`);
  if (!res.ok) {
    showToast(`Не удалось собрать действие по строке: ${res.data?.error || 'unknown'}`, 'error');
    return;
  }
  const payload = res.data?.data || {};
  if (!String(payload.text || '').trim()) {
    showToast('В этой строке нет данных для копирования.', 'info');
    return;
  }
  const copied = await copyTextToClipboard(payload.text || '', {
    title: 'Ручное копирование из строки',
    hint: 'Автокопирование по строке не сработало. Значение уже подготовлено: нажми Ctrl+C или скачай .txt.',
    filename: `user-row-${payload.mode || 'value'}.txt`,
  });
  if (!copied.ok && !copied.fallbackOpened) {
    showToast('Не удалось скопировать в буфер обмена.', 'error');
    return;
  }
  showToast(copied.ok ? `Скопировано из строки: ${usersBulkModeLabel(payload.mode)}.` : `Открыл ручной режим копирования из строки: ${usersBulkModeLabel(payload.mode)}.`, copied.ok ? 'success' : 'info');
  render();
}

function bindShell() {
  bindLinks();
  syncAdminMobileNavDom();
  document.querySelector('[data-mobile-nav-toggle]')?.addEventListener('click', () => {
    setAdminMobileNavOpen(!getAdminUiState().mobileNavOpen);
  });
  app.querySelectorAll('[data-mobile-nav-close]').forEach((node) => {
    node.addEventListener('click', () => closeAdminMobileNav());
  });
  if (!window.__adminMobileNavListenersBound) {
    window.__adminMobileNavListenersBound = true;
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeAdminMobileNav();
    });
    window.addEventListener('resize', () => {
      if (!isAdminMobileViewport()) closeAdminMobileNav();
      else syncAdminMobileNavDom();
    });
  }
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await api('/api/admin-web-auth?action=logout', { method: 'POST' });
    history.replaceState({}, '', '/admin/login');
    window.__loginState = {};
    render();
  });
  document.getElementById('refreshBtn')?.addEventListener('click', () => render());
  app.querySelectorAll('[data-overview-workspace]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextWorkspace = button.getAttribute('data-overview-workspace') || 'command';
      syncOverviewWorkspace(nextWorkspace, { replace: true });
      render();
    });
  });
  const applyUsersFilters = () => {
    setUsersStateFromControls({ page: 0 });
    render();
  };
  document.getElementById('applyUsersFilters')?.addEventListener('click', applyUsersFilters);

  const syncUsersFilterDraftUi = () => {
    const committed = pickUsersFilterState(getUsersState());
    const draft = readUsersFilterDraftFromDom(getUsersFilterDraft());
    setUsersFilterDraft(draft);
    const dirty = usersHasPendingFilterDraft(committed, draft);
    const status = document.getElementById('usersFilterDraftStatus');
    const hint = document.getElementById('usersFilterDraftHint');
    const rail = document.querySelector('.aw-filter-rail');
    const applyBtn = document.getElementById('applyUsersFilterDraft');
    const resetBtn = document.getElementById('resetUsersFilterDraft');
    if (status) {
      status.textContent = dirty ? 'Есть несохранённые изменения' : 'Фильтры синхронизированы';
      status.classList.toggle('is-dirty', dirty);
      status.classList.toggle('is-clean', !dirty);
    }
    if (hint) {
      hint.textContent = dirty
        ? 'Есть несохранённые изменения. Сначала подтверди их, потом уже смотри обновлённый список.'
        : 'Фильтры синхронизированы с текущим рабочим срезом.';
    }
    if (rail) {
      rail.classList.toggle('is-dirty', dirty);
      rail.classList.toggle('is-clean', !dirty);
    }
    if (applyBtn) applyBtn.disabled = !dirty;
    if (resetBtn) resetBtn.disabled = !dirty;
  };

  app.querySelectorAll('[data-users-filter-control]').forEach((select) => {
    select.addEventListener('change', () => {
      syncUsersFilterDraftUi();
    });
  });

  document.getElementById('resetUsersFilterDraft')?.addEventListener('click', () => {
    const committed = syncUsersFilterDraftFromState(getUsersState());
    const plan = document.getElementById('usersPlanState');
    const credits = document.getElementById('usersCreditsState');
    const channel = document.getElementById('usersChannelState');
    const activity = document.getElementById('usersActivityWindow');
    const payments = document.getElementById('usersPaymentsState');
    if (plan) plan.value = committed.planState;
    if (credits) credits.value = committed.creditsState;
    if (channel) channel.value = committed.channelState;
    if (activity) activity.value = committed.activityWindow;
    if (payments) payments.value = committed.paymentsState;
    syncUsersFilterDraftUi();
    showToast('Фильтры среза возвращены к текущему рабочему состоянию.', 'info', { ttl: 1800 });
  });

  document.getElementById('applyUsersFilterDraft')?.addEventListener('click', () => {
    const button = document.getElementById('applyUsersFilterDraft');
    if (button?.disabled) return;
    const draft = readUsersFilterDraftFromDom(getUsersFilterDraft());
    setUsersStateExact({ ...draft, page: 0 });
    render();
    focusUsersWorkingSlice('filters');
    showToast('Фильтры среза применены.', 'success', { ttl: 1800 });
  });

  syncUsersFilterDraftUi();

  document.getElementById('usersBulkSource')?.addEventListener('change', () => {
    const source = document.getElementById('usersBulkSource')?.value || 'current';
    const mode = document.getElementById('usersBulkMode')?.value || (window.__usersBulkState?.mode || 'tg_ids');
    window.__usersBulkState = { source, mode };
    render();
  });
  document.getElementById('usersBulkMode')?.addEventListener('change', () => {
    const source = document.getElementById('usersBulkSource')?.value || (window.__usersBulkState?.source || 'current');
    const mode = document.getElementById('usersBulkMode')?.value || 'tg_ids';
    window.__usersBulkState = { source, mode };
  });
  document.getElementById('usersSearch')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') applyUsersFilters();
  });
  app.querySelectorAll('[data-users-priority]').forEach((button) => {
    button.addEventListener('click', () => {
      const sortBy = button.getAttribute('data-users-priority') || 'created_desc';
      setUsersStateExact({ sortBy, page: 0 });
      pulseInteractiveFeedback(button, 'confirmed');
      render();
      showToast(`Сортировка: ${usersSortMeta(sortBy).label}.`, 'success', { ttl: 1800 });
    });
  });
  app.querySelectorAll('[data-users-cohort]').forEach((button) => {
    button.addEventListener('click', () => {
      const cohortView = button.getAttribute('data-users-cohort') || 'all';
      setUsersStateExact({ cohortView, page: 0 });
      pulseInteractiveFeedback(button, 'confirmed');
      render();
      showToast(`Когорта: ${usersCohortMeta(cohortView).label}.`, 'success', { ttl: 1800 });
    });
  });
  app.querySelectorAll('[data-users-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      const presetId = button.getAttribute('data-users-preset') || 'all_new';
      const preset = usersOperatorPresetMeta(presetId);
      const pageSize = getUsersState().pageSize || 20;
      setUsersStateExact({
        ...preset.state,
        page: 0,
        pageSize,
        pinIds: getUsersPinIds(),
      });
      pulseInteractiveFeedback(button, 'confirmed');
      render();
      focusUsersWorkingSlice('preset');
      showToast(`Применён пресет: ${preset.label}.`, 'success', { ttl: 1800 });
    });
  });
  document.getElementById('exportUsersBtn')?.addEventListener('click', async () => {
    const scope = document.getElementById('usersExportScope')?.value || 'current';
    try {
      await runUsersExportAction(scope);
    } catch (err) {
      showToast(`Не удалось выгрузить CSV: ${err?.message || 'unknown'}`, 'error');
    }
  });
  document.getElementById('copyUsersBulkBtn')?.addEventListener('click', async () => {
    const button = document.getElementById('copyUsersBulkBtn');
    if (button?.disabled) return;
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
      setUsersStateExact({ page: 0, pageSize: nextPageSize });
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
          setUsersStateExact({ sortBy: 'problem_desc', cohortView: 'all', page: 0 });
          pulseInteractiveFeedback(button, 'confirmed');
          render();
          return;
        }
        if (action === 'open_dormant_payers') {
          setUsersStateExact({ sortBy: 'payments_desc', cohortView: 'dormant_payers', page: 0 });
          pulseInteractiveFeedback(button, 'confirmed');
          render();
        }
      } catch (err) {
        showToast(`Не удалось выполнить действие по срезу: ${err?.message || 'unknown'}`, 'error');
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
        showToast(`Не удалось выполнить действие из сравнения: ${err?.message || 'unknown'}`, 'error');
      }
    });
  });
  document.getElementById('selectVisibleUsersBtn')?.addEventListener('click', () => {
    const trigger = document.getElementById('selectVisibleUsersBtn');
    if (trigger?.disabled) return;
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
  const toggleVisibleUsers = document.getElementById('toggleVisibleUsers');
  if (toggleVisibleUsers) {
    toggleVisibleUsers.indeterminate = toggleVisibleUsers.getAttribute('data-indeterminate') === 'true';
    toggleVisibleUsers.addEventListener('change', (e) => {
      if (toggleVisibleUsers.disabled) return;
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
  }
  document.getElementById('clearUsersBasketBtn')?.addEventListener('click', () => {
    const button = document.getElementById('clearUsersBasketBtn');
    if (button?.disabled) return;
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
            showToast('В сравнении можно держать до 5 закреплённых карточек.', 'info');
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
        showToast(`Не удалось выполнить действие по строке: ${err?.message || 'unknown'}`, 'error');
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
  document.getElementById('revokeAllBtn')?.addEventListener('click', async (event) => {
    const btn = event.currentTarget;
    if (!(btn instanceof HTMLButtonElement) || btn.disabled) return;
    const confirmed = confirm([
      'Завершить все web-сессии сейчас?',
      '• текущая фаундерская сессия тоже закроется',
      '• это действие только для фаундера и только для слоя web-доступа',
      '• после применения откроется экран входа'
    ].join('\n'));
    if (!confirmed) {
      showToast('Фаундерское действие отменено. Ничего не менялось.', 'info', { ttl: 1800 });
      return;
    }
    const originalLabel = btn.textContent || 'Применить: завершить все web-сессии';
    btn.disabled = true;
    btn.textContent = 'Завершаем все web-сессии…';
    btn.classList.add('is-pressed');
    const res = await api('/api/admin-web-auth?action=revoke_all', { method: 'POST' });
    if (!res.ok) {
      btn.disabled = false;
      btn.textContent = originalLabel;
      btn.classList.remove('is-pressed');
      showToast(`Не удалось завершить web-сессии: ${res.data?.error || 'unknown'}`, 'error');
      return render();
    }
    history.replaceState({}, '', '/admin/login');
    window.__loginState = {
      info: 'Фаундерское действие применено: все web-сессии закрыты, включая текущую сессию.',
      error: 'Войди заново, чтобы открыть новую фаундерскую сессию.'
    };
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
    if (!confirm('Тест-отправка фаундера пришлёт preview notice в твой Telegram. Продолжить?')) return;
    const res = await api('/api/admin-web-write?action=test_send_notice', { method: 'POST', body: JSON.stringify({ draftId }) });
    if (!res.ok) {
      alert(`Не удалось выполнить test send: ${res.data?.error || 'unknown'}`);
      return;
    }
    alert('Тест-отправка фаундера отправлена в Telegram.');
    await render();
  });

  app.querySelectorAll('[data-resolve-unknown]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const resolution = btn.getAttribute('data-resolve-unknown') || '';
      const broadcastId = Number(btn.getAttribute('data-broadcast-id') || 0);
      const userId = Number(btn.getAttribute('data-user-id') || 0);
      const label = resolution === 'sent' ? 'сообщение подтверждено как отправленное' : 'доставка подтверждена как ошибка';
      if (!confirm(`Ручная сверка: ${label}. Повторной отправки не будет. Продолжить?`)) return;
      const note = prompt('Короткое основание сверки (обязательно):', '') || '';
      if (!note.trim()) {
        alert('Для ручной сверки нужно указать основание.');
        return;
      }
      const res = await api('/api/admin-web-write?action=resolve_broadcast_delivery_unknown', {
        method: 'POST',
        body: JSON.stringify({ broadcastId, userId, resolution, note }),
      });
      if (!res.ok) {
        alert(`Не удалось сохранить сверку: ${res.data?.error || 'unknown'}`);
        return;
      }
      await render();
    });
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
    writeLoginState({ challengeId: res.data.challengeId, fallbackCodeEnabled: res.data.fallbackCodeEnabled === true });
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
    const state = getLoginState() || {};
    const challengeId = String(state.challengeId || '').trim();
    const code = document.getElementById('otpInput')?.value || '';
    const res = await api('/api/admin-web-auth?action=verify_code', { method: 'POST', body: JSON.stringify({ challengeId, code }) });
    if (!res.ok) {
      writeLoginState({ ...state, challengeId, error: authErrorLabel(res.data?.error || 'invalid_code') });
      return render();
    }
    stopLoginStatusPolling();
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
