import { createOverviewModule } from './admin-web/overview.js';
import { createUsersModule } from './admin-web/users.js';
import { createPaymentsModule } from './admin-web/payments.js';
import { createCommsModule } from './admin-web/comms.js';
import { createFounderModule } from './admin-web/founder.js';
import { createRuntimeModule } from './admin-web/runtime.js';

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


const overviewModule = createOverviewModule({
  escapeHtml,
  formatDate,
  runtimeStateClass,
  runtimeStateLabel,
  founderTextLabel,
  renderControlSurfaceSection,
  sectionShell
});
const {
  OVERVIEW_WORKSPACES,
  normalizeOverviewWorkspace,
  getOverviewWorkspace,
  syncOverviewWorkspace,
  overviewRuntimeWarnings,
  overviewStatusSummary,
  overviewNextStep,
  overviewPaymentStats,
  renderOverviewWorkspaceTabs,
  overviewCommandWorkspace,
  overviewPaymentsWorkspace,
  overviewActivityWorkspace,
  overviewWorkspaceView,
  overviewView
} = overviewModule;

const usersModule = createUsersModule({
  escapeHtml,
  copyTextToClipboard,
  showToast,
  basketCount,
  isUserInBasket,
  getUsersBasketIds,
  normalizeUsersPinIds,
  getUsersPinIds,
  isUserPinned,
  formatDate,
  formatDatePart,
  formatTimePart,
  segmentLabel,
  signalLabel,
  founderTextLabel,
  userDetailBackHref,
  shell,
  sectionShell
});
const {
  usersBulkModeLabel,
  basketSourceLabel,
  USERS_STATE_DEFAULTS,
  normalizeUsersState,
  getUsersState,
  USERS_FILTER_DRAFT_KEYS,
  pickUsersFilterState,
  usersFilterDraftSignature,
  getUsersFilterDraft,
  setUsersFilterDraft,
  syncUsersFilterDraftFromState,
  usersHasPendingFilterDraft,
  readUsersFilterDraftFromDom,
  readUsersStateFromUrl,
  buildUsersListHref,
  syncUsersUrlState,
  hydrateUsersStateFromLocation,
  copyUsersWorkingViewUrl,
  activeWindowLabel,
  usersSortMeta,
  usersPriorityPresets,
  usersCohortMeta,
  usersCohortPresets,
  usersCohortCounterCards,
  usersOperatorPresets,
  usersOperatorPresetMeta,
  detectUsersOperatorPreset,
  USERS_PRESET_COPY_BACKCOMPAT_TOKENS,
  renderUsersOperatorPresetCards,
  USERS_COPY_UNIFICATION_BACKCOMPAT_TOKENS,
  usersActionSliceLabel,
  usersIsSliceActionActive,
  renderUsersSliceActionCards,
  buildUsersPaginationMeta,
  renderUsersPaginationControls,
  renderUsersTableHead,
  renderUsersTableMetaStrip,
  usersPlanMeta,
  usersCreditsMeta,
  usersSignalChips,
  usersSignalsDetail,
  usersSignalsCompactDetail,
  usersSignalsPriorityChips,
  usersSegmentBadges,
  usersPlanMicroMeta,
  usersActivityInlineLabel,
  usersActivityMeta,
  renderUsersInlineChips,
  compareCardLabel,
  compareDrillTarget,
  renderUsersCompareDrillActions,
  renderUsersCompareCards,
  userRowPayload,
  renderUserRowQuickActions,
  usersView,
  userDetailView
} = usersModule;

const paymentsModule = createPaymentsModule({
  escapeHtml,
  formatDate,
  runtimeStateClass,
  runtimeStateLabel,
  founderTextLabel,
  runtimeTextLabel,
  paymentStatusClass,
  paymentStatusLabel,
  paymentFollowUpClass,
  paymentFollowUpLabel,
  paymentDetailBackHref,
  warningTone,
  sectionShell
});
const {
  paymentsView,
  paymentDetailView
} = paymentsModule;

const commsModule = createCommsModule({
  escapeHtml,
  formatDate,
  runtimeStateClass,
  runtimeStateLabel,
  founderTextLabel,
  runtimeTextLabel,
  warningTone,
  sectionShell
});
const {
  commsAudienceLabel,
  commsStatusClass,
  commsStatusLabel,
  normalizeCommsEditorState,
  seedCommsEditorFromDraft,
  resetCommsEditor,
  syncCommsPreview,
  commsView
} = commsModule;

const founderModule = createFounderModule({
  escapeHtml,
  formatDate,
  runtimeStateLabel,
  founderTextLabel,
  warningTone,
  founderSensitivityMeta,
  founderControlCards,
  sectionShell
});
const {
  founderView
} = founderModule;

const runtimeModule = createRuntimeModule({
  escapeHtml,
  formatDate,
  runtimeStateClass,
  runtimeStateLabel,
  runtimeActionabilityClass,
  runtimeActionabilityLabel,
  configPresenceLabel,
  sourceLabel,
  controlSurfaceLabel,
  founderTextLabel,
  runtimeCardLabel,
  runtimeTextLabel,
  runtimeItemHasProfileContactDrift,
  runtimeItemMeaning,
  runtimeItemNextStep,
  runtimeItemSummary,
  runtimeItemDetail,
  runtimeConfigBadgeLabel,
  runtimeConfigSemanticLabel,
  controlAuditActorLabel,
  controlAuditSummary,
  warningTone,
  sectionShell
});
const {
  runtimeView
} = runtimeModule;

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
