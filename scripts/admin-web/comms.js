export function createCommsModule(ctx) {
  const {
    escapeHtml,
    formatDate,
    runtimeStateClass,
    runtimeStateLabel,
    founderTextLabel,
    runtimeTextLabel,
    warningTone,
    sectionShell
  } = ctx;

  // BEGIN STEP590H MOVED SOURCE: comms
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


  // END STEP590H MOVED SOURCE: comms

  return {
    commsAudienceLabel,
    commsStatusClass,
    commsStatusLabel,
    normalizeCommsEditorState,
    seedCommsEditorFromDraft,
    resetCommsEditor,
    syncCommsPreview,
    commsView
  };
}
