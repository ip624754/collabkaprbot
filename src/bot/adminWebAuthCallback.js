import { approveChallengeFromTelegram } from '../lib/adminWeb/auth.js';

const CHALLENGE_ID_RE = /^[a-f0-9]{24}$/i;

const ERROR_LABELS = Object.freeze({
  approver_not_allowed: 'Эта кнопка доступна только назначенному approver.',
  challenge_not_found: 'Запрос входа уже истёк.',
  challenge_not_pending: 'Запрос уже обработан.',
  challenge_expired: 'Запрос входа истёк.',
  auth_store_unavailable: 'Хранилище авторизации временно недоступно.',
});

function normalizeDecision(raw) {
  const value = String(raw || '').trim();
  if (value === 'a') return 'approve';
  if (value === 'd') return 'deny';
  return '';
}

async function answer(ctx, text) {
  try {
    await ctx.answerCallbackQuery({ text });
  } catch {}
}

/**
 * Handles the STEP588X4 admin-web Telegram approval callback.
 *
 * Returns true only when this callback belongs to the admin auth flow. The
 * callback must be routed before user/workspace hydration because the real
 * approver identity is ctx.from.id and the flow is owned by the Redis auth
 * state machine, not by an application user row.
 */
export async function handleAdminWebAuthDecisionCallback(
  ctx,
  p,
  { approve = approveChallengeFromTelegram } = {}
) {
  if (String(p?.a || '') === 'a:aw_auth_dec') {
    const challengeId = String(p?.c || '').trim();
    const decision = normalizeDecision(p?.d);
    if (!CHALLENGE_ID_RE.test(challengeId) || !decision) {
      await answer(ctx, 'Некорректный запрос входа.');
      return true;
    }

    const actorTgId = Number(ctx?.from?.id || 0) || 0;
    const result = await approve({ challengeId, decision, actorTgId });

    if (!result?.ok) {
      await answer(
        ctx,
        ERROR_LABELS[String(result?.error || '')] || 'Не удалось обработать запрос.'
      );
      return true;
    }

    try {
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    } catch {}

    await answer(
      ctx,
      decision === 'approve'
        ? 'Вход одобрен для исходного браузера.'
        : 'Вход отклонён.'
    );
    return true;
  }

  return false;
}
