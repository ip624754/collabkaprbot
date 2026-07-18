const RECOVERY_COPY = Object.freeze({
  channel: Object.freeze({
    title: 'Канал недоступен',
    reason: 'Кнопка могла устареть, канал мог быть отключён, а доступ — измениться.',
    action: 'Открой «Мои каналы» и выбери канал заново.',
    toast: 'Канал недоступен. Открой «Мои каналы» и выбери его заново.'
  }),
  application: Object.freeze({
    title: 'Заявка недоступна',
    reason: 'Кнопка могла устареть, а статус или доступ к заявке — измениться.',
    action: 'Вернись к списку заявок и открой актуальную карточку.',
    toast: 'Заявка недоступна. Вернись к списку заявок и открой её заново.'
  }),
  dialog: Object.freeze({
    title: 'Диалог недоступен',
    reason: 'Кнопка могла устареть, а доступ к диалогу — измениться.',
    action: 'Вернись в «Диалоги» и открой актуальную переписку.',
    toast: 'Диалог недоступен. Вернись в «Диалоги» и открой его заново.'
  }),
  offer: Object.freeze({
    title: 'Оффер недоступен',
    reason: 'Кнопка могла устареть, а оффер — измениться или уйти из списка.',
    action: 'Вернись к списку офферов и обнови его.',
    toast: 'Оффер недоступен. Вернись к списку офферов и обнови его.'
  }),
  giveaway: Object.freeze({
    title: 'Розыгрыш недоступен',
    reason: 'Кнопка могла устареть, а статус или доступ к розыгрышу — измениться.',
    action: 'Вернись к списку розыгрышей и открой актуальную карточку.',
    toast: 'Розыгрыш недоступен. Вернись к списку и открой его заново.'
  }),
  folder: Object.freeze({
    title: 'Папка недоступна',
    reason: 'Кнопка могла устареть, папка могла быть удалена, а доступ — измениться.',
    action: 'Вернись к списку папок и обнови его.',
    toast: 'Папка недоступна. Вернись к списку папок и обнови его.'
  }),
  role: Object.freeze({
    title: 'Раздел недоступен',
    reason: 'Для этого действия сейчас нет нужной роли или разрешения.',
    action: 'Открой меню и выбери доступный раздел.',
    toast: 'Раздел недоступен для текущей роли.'
  }),
  generic: Object.freeze({
    title: 'Раздел недоступен',
    reason: 'Кнопка могла устареть, а доступ — измениться.',
    action: 'Открой меню и повтори действие из актуального экрана.',
    toast: 'Раздел недоступен. Открой меню и повтори действие.'
  })
});

export function getRecoveryCopy(kind = 'generic') {
  return RECOVERY_COPY[String(kind || '').trim().toLowerCase()] || RECOVERY_COPY.generic;
}

export function recoveryToast(kind = 'generic') {
  return getRecoveryCopy(kind).toast;
}

export function recoveryPlain(kind = 'generic') {
  const item = getRecoveryCopy(kind);
  return `${item.title}.\n\n${item.reason}\n\n${item.action}`;
}

export function recoveryHtml(kind = 'generic') {
  const item = getRecoveryCopy(kind);
  return `⚠️ <b>${item.title}</b>\n\n${item.reason}\n\n${item.action}`;
}

export function emptyStateText({ title = '', reason = '', action = '' } = {}) {
  return [String(title || '').trim(), String(reason || '').trim(), String(action || '').trim()]
    .filter(Boolean)
    .join('\n\n');
}

export const RECOVERY_KINDS = Object.freeze(Object.keys(RECOVERY_COPY));
