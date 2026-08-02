export function createPaymentsModule(ctx) {
  const {
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
  } = ctx;

  // BEGIN STEP590H MOVED SOURCE: payments
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

  // END STEP590H MOVED SOURCE: payments

  return {
    paymentsView,
    paymentDetailView
  };
}
