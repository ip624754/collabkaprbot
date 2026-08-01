import { ADMIN_AUTH_ACTION } from './actions.js';
import { approveAdminAuthChallenge } from './service.js';
import { parseAdminAuthDecisionPayload } from './policy.js';
import {
  ackAdminAuthCallback,
  answerAdminAuthCallback,
  clearAdminAuthDecisionKeyboard,
  getAdminAuthDecisionLabel,
  getAdminAuthErrorLabel,
} from './views.js';

/**
 * Telegram transport adapter for the browser-bound admin-web challenge.
 *
 * This route intentionally runs before application-user hydration. The actual
 * approver is always ctx.from.id; challenge state and one-time consumption stay
 * inside the canonical Redis auth service in src/lib/adminWeb/auth.js.
 */
export async function handleAdminAuthChallengeCallback(
  ctx,
  payload,
  { approve = approveAdminAuthChallenge } = {}
) {
  const parsed = parseAdminAuthDecisionPayload(payload);
  if (!parsed.ok) {
    if (parsed.error === 'action_not_owned') return false;
    await answerAdminAuthCallback(ctx, 'Некорректный запрос входа.');
    return true;
  }

  const actorTgId = Number(ctx?.from?.id || 0) || 0;
  const result = await approve({
    challengeId: parsed.challengeId,
    decision: parsed.decision,
    actorTgId,
  });

  if (!result?.ok) {
    await answerAdminAuthCallback(ctx, getAdminAuthErrorLabel(result?.error));
    return true;
  }

  await clearAdminAuthDecisionKeyboard(ctx);
  await answerAdminAuthCallback(ctx, getAdminAuthDecisionLabel(parsed.decision));
  return true;
}

/**
 * Post-user operator control for enabling/disabling new admin-web logins.
 *
 * Business storage and the system view remain canonical dependencies injected
 * by the composition root. This bounded handler owns only transport policy and
 * the operator-control transition; it does not duplicate the auth state machine.
 */
export async function handleAdminAuthControlCallback(
  ctx,
  payload,
  _user,
  {
    isAdmin,
    getControlSnapshot,
    setControlToggle,
    renderSystem,
  } = {}
) {
  if (String(payload?.a || '').trim() !== ADMIN_AUTH_ACTION.TOGGLE_LOGIN) return false;

  const allowed = typeof isAdmin === 'function' ? !!isAdmin(ctx) : !!isAdmin;
  if (!allowed) {
    await answerAdminAuthCallback(ctx, 'Нет доступа.');
    return true;
  }

  await ackAdminAuthCallback(ctx);

  if (
    typeof getControlSnapshot !== 'function' ||
    typeof setControlToggle !== 'function' ||
    typeof renderSystem !== 'function'
  ) {
    throw new Error('admin_auth_control.missing_dependency');
  }

  const control = await getControlSnapshot({ limit: 1 });
  const current = !!control?.byId?.admin_web_login?.value;
  await setControlToggle('admin_web_login', !current, {
    actorTgId: Number(ctx?.from?.id || 0) || 0,
    actorUsername: ctx?.from?.username || '',
    note: 'telegram_admin',
  });
  await renderSystem(ctx);
  return true;
}
