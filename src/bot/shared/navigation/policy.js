import { NAVIGATION_CALLBACK_ACTIONS } from './actions.js';

const NAVIGATION_ACTION_SET = new Set(NAVIGATION_CALLBACK_ACTIONS);

export function isNavigationCallbackAction(action) {
  return NAVIGATION_ACTION_SET.has(String(action || '').trim());
}
