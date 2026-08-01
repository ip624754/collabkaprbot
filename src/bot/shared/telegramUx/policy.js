import { CALLBACK_ACTION_ALIASES, TELEGRAM_UX_CALLBACK_ACTIONS } from './actions.js';

const TELEGRAM_UX_ACTION_SET = new Set(TELEGRAM_UX_CALLBACK_ACTIONS);

export function isTelegramUxCallbackAction(action) {
  return TELEGRAM_UX_ACTION_SET.has(String(action || '').trim());
}

export function resolveCallbackActionAlias(action) {
  const key = String(action || '').trim();
  return CALLBACK_ACTION_ALIASES[key] || key;
}
