import {
  BROADCAST_AUDIENCE_ACTIONS,
  BROADCAST_COMPOSER_ACTIONS,
  BROADCAST_CRITICAL_CALLBACK_ACTIONS,
  BROADCAST_DISPATCH_ACTIONS,
  BROADCAST_OPERATIONS_ACTIONS,
} from './actions.js';

const COMPOSER_SET = new Set(BROADCAST_COMPOSER_ACTIONS);
const AUDIENCE_SET = new Set(BROADCAST_AUDIENCE_ACTIONS);
const DISPATCH_SET = new Set(BROADCAST_DISPATCH_ACTIONS);
const OPERATIONS_SET = new Set(BROADCAST_OPERATIONS_ACTIONS);
const CRITICAL_SET = new Set(BROADCAST_CRITICAL_CALLBACK_ACTIONS);

function normalizeAction(action) {
  return String(action || '').trim();
}

export function isBroadcastComposerAction(action) {
  return COMPOSER_SET.has(normalizeAction(action));
}

export function isBroadcastAudienceAction(action) {
  return AUDIENCE_SET.has(normalizeAction(action));
}

export function isBroadcastDispatchAction(action) {
  return DISPATCH_SET.has(normalizeAction(action));
}

export function isBroadcastOperationsAction(action) {
  return OPERATIONS_SET.has(normalizeAction(action));
}

export function isBroadcastCriticalCallbackAction(action) {
  return CRITICAL_SET.has(normalizeAction(action));
}
