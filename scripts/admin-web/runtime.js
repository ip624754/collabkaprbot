export function createRuntimeModule(ctx) {
  const {
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
  } = ctx;

  // BEGIN STEP590H MOVED SOURCE: runtime
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


  // END STEP590H MOVED SOURCE: runtime

  return {
    runtimeView
  };
}
