export function createUsersModule(ctx) {
  const {
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
  } = ctx;

  // BEGIN STEP590H MOVED SOURCE: users
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

  function foundingCohortStatusMeta(value = 'candidate') {
    const key = String(value || 'candidate').trim().toLowerCase();
    if (key === 'reviewing') return { label: 'На проверке', tone: 'is-warn' };
    if (key === 'launch_ready') return { label: 'Launch-ready', tone: 'is-good' };
    if (key === 'onboarded') return { label: 'Canary пройден', tone: 'is-good' };
    if (key === 'blocked') return { label: 'Блокер', tone: 'is-bad' };
    return { label: 'Кандидат', tone: 'is-soft' };
  }

  function foundingCohortCanaryMeta(value = 'not_run') {
    const key = String(value || 'not_run').trim().toLowerCase();
    if (key === 'pass') return { label: 'PASS', tone: 'is-good' };
    if (key === 'blocked') return { label: 'BLOCKED', tone: 'is-bad' };
    return { label: 'Не запускался', tone: 'is-soft' };
  }

  function foundingCohortMemberByUserId(cohort = {}, userId = 0) {
    const uid = Number(userId || 0) || 0;
    return (Array.isArray(cohort.members) ? cohort.members : []).find((item) => Number(item.userId || 0) === uid) || null;
  }

  function renderFoundingCohortProgress(cohort = {}) {
    const progress = cohort.progress || {};
    const targets = cohort.targets || {};
    const cards = [
      ['Launch-ready creators', Number(progress.launchReadyCreators || 0), Number(targets.launchReadyCreators || 10), Number(progress.launchReadyCreators || 0) >= Number(targets.launchReadyCreators || 10)],
      ['Active offers', progress.activeOffersEvidenceAvailable === false ? '—' : Number(progress.activeOffers || 0), Number(targets.activeOffers || 5), progress.activeOffersEvidenceAvailable !== false && Number(progress.activeOffers || 0) >= Number(targets.activeOffers || 5)],
      ['Blocker defects', Number(progress.blockerDefects || 0), Number(targets.blockerDefects || 0), Number(progress.blockerDefects || 0) === 0],
      ['Onboarding canary', progress.onboardingCanaryPass ? 1 : 0, 1, progress.onboardingCanaryPass === true],
      ['Owner', progress.ownerConfigured ? 1 : 0, 1, progress.ownerConfigured === true],
      ['Cadence', progress.cadenceConfigured ? 1 : 0, 1, progress.cadenceConfigured === true],
    ];
    return cards.map(([label, value, target, ok]) => `
      <div class="aw-mini-card aw-cohort-progress-card">
        <span>${escapeHtml(label)}</span>
        <strong class="${ok ? 'aw-status good' : 'aw-status warn'}">${value} / ${target}</strong>
      </div>
    `).join('');
  }

  function renderFoundingCohortMemberCard(member = {}, canEdit = false) {
    const statusMeta = foundingCohortStatusMeta(member.status);
    const canaryMeta = foundingCohortCanaryMeta(member.onboardingCanary);
    const readiness = member.readiness || {};
    return `
      <article class="aw-cohort-member-card" data-cohort-member="${Number(member.userId || 0)}">
        <div class="aw-cohort-member-head">
          <div>
            <strong>${escapeHtml(member.displayName || `user #${Number(member.userId || 0) || '—'}`)}</strong>
            <small>user_id ${Number(member.userId || 0) || '—'} · ${member.hasChannel ? 'канал подключён' : 'канала нет'} · active offers ${Number(member.activeOffers || 0)}</small>
          </div>
          <div class="aw-badges">
            <span class="aw-badge ${escapeHtml(statusMeta.tone)}">${escapeHtml(statusMeta.label)}</span>
            <span class="aw-badge ${escapeHtml(canaryMeta.tone)}">canary ${escapeHtml(canaryMeta.label)}${member.onboardingCanaryAt ? ` · ${formatDate(member.onboardingCanaryAt)}` : ''}</span>
            <span class="aw-badge ${readiness.launchReady ? 'is-good' : 'is-warn'}">${readiness.launchReady ? 'готов' : 'не готов'}</span>
          </div>
        </div>
        <div class="aw-cohort-member-grid">
          <label class="aw-field"><span>Статус</span><select class="aw-select" data-cohort-field="status" ${canEdit ? '' : 'disabled'}>
            ${[['candidate','Кандидат'],['reviewing','На проверке'],['launch_ready','Launch-ready'],['onboarded','Canary пройден'],['blocked','Блокер']].map(([value,label]) => `<option value="${value}" ${member.status === value ? 'selected' : ''}>${label}</option>`).join('')}
          </select></label>
          <label class="aw-field"><span>Onboarding canary</span><select class="aw-select" data-cohort-field="onboardingCanary" ${canEdit ? '' : 'disabled'}>
            ${[['not_run','Не запускался'],['pass','PASS'],['blocked','BLOCKED']].map(([value,label]) => `<option value="${value}" ${member.onboardingCanary === value ? 'selected' : ''}>${label}</option>`).join('')}
          </select></label>
          <label class="aw-check"><input type="checkbox" data-cohort-field="profileReviewed" ${member.profileReviewed ? 'checked' : ''} ${canEdit ? '' : 'disabled'} /> Профиль проверен</label>
          <label class="aw-check"><input type="checkbox" data-cohort-field="contactReviewed" ${member.contactReviewed ? 'checked' : ''} ${canEdit ? '' : 'disabled'} /> Контакт проверен</label>
          <label class="aw-check"><input type="checkbox" data-cohort-field="termsReviewed" ${member.termsReviewed ? 'checked' : ''} ${canEdit ? '' : 'disabled'} /> Условия проверены</label>
        </div>
        <div class="aw-cohort-member-notes">
          <label class="aw-field"><span>Blocker</span><input class="aw-input" data-cohort-field="blocker" maxlength="500" value="${escapeHtml(member.blocker || '')}" placeholder="Пусто = blocker отсутствует" ${canEdit ? '' : 'disabled'} /></label>
          <label class="aw-field"><span>Follow-up note</span><input class="aw-input" data-cohort-field="note" maxlength="500" value="${escapeHtml(member.note || '')}" placeholder="Следующий конкретный шаг" ${canEdit ? '' : 'disabled'} /></label>
        </div>
        ${canEdit ? `<div class="aw-actions"><button class="aw-button" data-cohort-save="${Number(member.userId || 0)}">Сохранить</button><button class="aw-button ghost" data-cohort-remove="${Number(member.userId || 0)}">Убрать из когорты</button></div>` : ''}
      </article>
    `;
  }

  function renderFoundingCohortWorkspace(cohort = {}) {
    const config = cohort.config || {};
    const progress = cohort.progress || {};
    const members = Array.isArray(cohort.members) ? cohort.members : [];
    const candidates = Array.isArray(cohort.candidates) ? cohort.candidates : [];
    const canEdit = window.__adminSession?.isFounder === true;
    return `
      <section class="aw-surface aw-stack aw-founding-cohort" id="foundingCohortWorkspace">
        <div class="aw-section-head">
          <div>
            <h2>Founding cohort · marketplace liquidity</h2>
            <p>Bounded launch workspace: 10 launch-ready creators, 5 active offers, zero blockers и один onboarding canary PASS не старше 14 дней.</p>
          </div>
          <span class="aw-badge ${progress.exitReady ? 'is-good' : 'is-warn'}">${progress.exitReady ? 'EXIT READY' : 'IN PROGRESS'}</span>
        </div>
        <div class="aw-mini-grid aw-mini-grid-3">${renderFoundingCohortProgress(cohort)}</div>
        ${progress.cohortPersistenceAvailable === false ? '<div class="aw-alert bad">Cohort storage недоступен. Данные показаны как недостоверный empty fallback; founder writes должны завершаться ошибкой без перезаписи.</div>' : ''}
        ${progress.activeOffersEvidenceAvailable === false ? '<div class="aw-alert warn">Active-offer aggregate недоступен. Exit readiness принудительно остаётся false; нулевое значение не считается подтверждённым.</div>' : ''}
        <div class="aw-cohort-config-grid">
          <label class="aw-field"><span>Launch wedge</span><input id="cohortLaunchWedge" class="aw-input" maxlength="160" value="${escapeHtml(config.launchWedge || '')}" ${canEdit ? '' : 'disabled'} /></label>
          <label class="aw-field"><span>Owner label</span><input id="cohortOwnerLabel" class="aw-input" maxlength="120" value="${escapeHtml(config.ownerLabel || '')}" placeholder="Например: Rustam / Зарина" ${canEdit ? '' : 'disabled'} /></label>
          <label class="aw-field"><span>Owner TG ID</span><input id="cohortOwnerTgId" class="aw-input" inputmode="numeric" value="${Number(config.ownerTgId || 0) || ''}" ${canEdit ? '' : 'disabled'} /></label>
          <label class="aw-field"><span>Cadence, дней</span><input id="cohortCadenceDays" class="aw-input" type="number" min="1" max="30" value="${Number(config.followUpCadenceDays || 7)}" ${canEdit ? '' : 'disabled'} /></label>
          <label class="aw-field"><span>Следующий review</span><input id="cohortNextReviewAt" class="aw-input" type="datetime-local" value="${config.nextReviewAt ? escapeHtml(String(config.nextReviewAt).slice(0,16)) : ''}" ${canEdit ? '' : 'disabled'} /></label>
        </div>
        ${canEdit ? '<div class="aw-actions"><button class="aw-button" id="saveFoundingCohortConfigBtn">Сохранить owner/cadence</button></div>' : '<div class="aw-muted">Изменение founding cohort доступно только founder-сессии.</div>'}
        <div class="aw-split aw-cohort-workspace-split">
          <section class="aw-stack">
            <div class="aw-section-head"><h3>Участники когорты</h3><span class="aw-chip">${members.length} / ${Number(cohort.limits?.maxMembers || 50)}</span></div>
            ${members.length ? members.map((member) => renderFoundingCohortMemberCard(member, canEdit)).join('') : '<div class="aw-empty">Когорта пока пуста. Добавь creator из списка кандидатов.</div>'}
          </section>
          <aside class="aw-stack">
            <h3>Кандидаты с подключённым каналом</h3>
            <div class="aw-list">
              ${candidates.length ? candidates.map((candidate) => `
                <div class="aw-list-item">
                  <strong>${escapeHtml(candidate.displayName || `user #${Number(candidate.userId || 0)}`)}</strong>
                  <small>user_id ${Number(candidate.userId || 0)} · ${candidate.hasChannel ? 'канал есть' : 'канала нет'} · активность ${formatDate(candidate.lastKnownActivityAt)}</small>
                  ${canEdit ? `<div class="aw-actions"><button class="aw-button ghost" data-cohort-add="${Number(candidate.userId || 0)}">Добавить кандидата</button><a class="aw-button ghost" data-link href="/admin/users/${Number(candidate.userId || 0)}">Открыть карточку</a></div>` : ''}
                </div>
              `).join('') : '<div class="aw-empty">Новых подходящих candidates не найдено.</div>'}
            </div>
          </aside>
        </div>
        <div class="aw-muted">Truth Boundary: launch-ready считается только при creator role, подключённом канале, трёх review-флагах, отсутствии blocker и ручном статусе launch-ready/onboarded. Active offers берутся только из status=ACTIVE; canary PASS учитывается 14 дней; next review должен быть в будущем.</div>
      </section>
    `;
  }

  function renderFoundingCohortUserCard(cohort = {}, userId = 0) {
    const member = foundingCohortMemberByUserId(cohort, userId);
    const canEdit = window.__adminSession?.isFounder === true;
    if (member) return renderFoundingCohortMemberCard(member, canEdit);
    if (!canEdit) return '<section class="aw-surface aw-stack"><h2>Founding cohort</h2><div class="aw-empty">Пользователь не входит в founding cohort.</div></section>';
    return `
      <section class="aw-surface aw-stack">
        <h2>Founding cohort</h2>
        <p>Добавить этого creator как bounded launch candidate. Это не отправляет сообщения и не публикует offer.</p>
        <button class="aw-button" data-cohort-add="${Number(userId || 0)}">Добавить кандидата</button>
      </section>
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
      ${renderFoundingCohortWorkspace(model.foundingCohort || {})}
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
    const foundingCohort = model.foundingCohort || {};
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
          ${renderFoundingCohortUserCard(foundingCohort, user.id)}
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




  // END STEP590H MOVED SOURCE: users

  return {
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
    foundingCohortStatusMeta,
    foundingCohortCanaryMeta,
    foundingCohortMemberByUserId,
    renderFoundingCohortProgress,
    renderFoundingCohortMemberCard,
    renderFoundingCohortWorkspace,
    renderFoundingCohortUserCard,
    usersView,
    userDetailView
  };
}
