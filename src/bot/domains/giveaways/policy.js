import {
  GIVEAWAY_ACCESS_ACTIONS,
  GIVEAWAY_CRITICAL_CALLBACK_ACTIONS,
  GIVEAWAY_LIFECYCLE_ACTIONS,
  GIVEAWAY_PARTICIPANT_ACTIONS,
} from './actions.js';

const ACCESS_SET = new Set(GIVEAWAY_ACCESS_ACTIONS);
const PARTICIPANT_SET = new Set(GIVEAWAY_PARTICIPANT_ACTIONS);
const LIFECYCLE_SET = new Set(GIVEAWAY_LIFECYCLE_ACTIONS);
const CRITICAL_SET = new Set(GIVEAWAY_CRITICAL_CALLBACK_ACTIONS);

function normalizeAction(action) {
  return String(action || '').trim();
}

export function isGiveawayAccessAction(action) {
  return ACCESS_SET.has(normalizeAction(action));
}

export function isGiveawayParticipantAction(action) {
  return PARTICIPANT_SET.has(normalizeAction(action));
}

export function isGiveawayLifecycleAction(action) {
  return LIFECYCLE_SET.has(normalizeAction(action));
}

export function isGiveawayCriticalCallbackAction(action) {
  return CRITICAL_SET.has(normalizeAction(action));
}
