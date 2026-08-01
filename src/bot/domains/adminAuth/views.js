const ERROR_LABELS = Object.freeze({
  approver_not_allowed: 'Эта кнопка доступна только назначенному approver.',
  challenge_not_found: 'Запрос входа уже истёк.',
  challenge_not_pending: 'Запрос уже обработан.',
  challenge_expired: 'Запрос входа истёк.',
  auth_store_unavailable: 'Хранилище авторизации временно недоступно.',
});

export function getAdminAuthErrorLabel(error) {
  return ERROR_LABELS[String(error || '')] || 'Не удалось обработать запрос.';
}

export function getAdminAuthDecisionLabel(decision) {
  return decision === 'approve'
    ? 'Вход одобрен для исходного браузера.'
    : 'Вход отклонён.';
}


export async function ackAdminAuthCallback(ctx) {
  try {
    await ctx.answerCallbackQuery();
  } catch {}
}

export async function answerAdminAuthCallback(ctx, text) {
  try {
    await ctx.answerCallbackQuery({ text });
  } catch {}
}

export async function clearAdminAuthDecisionKeyboard(ctx) {
  try {
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  } catch {}
}
