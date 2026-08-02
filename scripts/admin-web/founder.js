export function createFounderModule(ctx) {
  const {
    escapeHtml,
    formatDate,
    runtimeStateLabel,
    founderTextLabel,
    warningTone,
    founderSensitivityMeta,
    founderControlCards,
    sectionShell
  } = ctx;

  // BEGIN STEP590H MOVED SOURCE: founder
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

  // END STEP590H MOVED SOURCE: founder

  return {
    founderView
  };
}
