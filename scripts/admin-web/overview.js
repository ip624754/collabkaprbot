export function createOverviewModule(ctx) {
  const {
    escapeHtml,
    formatDate,
    runtimeStateClass,
    runtimeStateLabel,
    founderTextLabel,
    renderControlSurfaceSection,
    sectionShell
  } = ctx;

  // BEGIN STEP590H MOVED SOURCE: overview
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

  // END STEP590H MOVED SOURCE: overview

  return {
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
  };
}
