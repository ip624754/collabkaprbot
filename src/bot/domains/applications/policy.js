import {
  APPLICATION_CREATOR_ACTIONS,
  APPLICATION_BRAND_ACTIONS,
  APPLICATION_DEALS_ACTIONS,
  APPLICATION_CALLBACK_ACTIONS,
} from './actions.js';

const APPLICATION_CREATOR_ACTIONS_SET = new Set(APPLICATION_CREATOR_ACTIONS);
const APPLICATION_BRAND_ACTIONS_SET = new Set(APPLICATION_BRAND_ACTIONS);
const APPLICATION_DEALS_ACTIONS_SET = new Set(APPLICATION_DEALS_ACTIONS);
const ALL_SET = new Set(APPLICATION_CALLBACK_ACTIONS);

function normalizeAction(action) {
  return String(action || '').trim();
}

export function isApplicationCreatorAction(action) {
  return APPLICATION_CREATOR_ACTIONS_SET.has(normalizeAction(action));
}

export function isApplicationBrandAction(action) {
  return APPLICATION_BRAND_ACTIONS_SET.has(normalizeAction(action));
}

export function isApplicationDealsAction(action) {
  return APPLICATION_DEALS_ACTIONS_SET.has(normalizeAction(action));
}

export function isApplicationCallbackAction(action) {
  return ALL_SET.has(normalizeAction(action));
}
