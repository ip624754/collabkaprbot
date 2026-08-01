import {
  BARTER_CALLBACK_ACTIONS,
  BARTER_CONVERSATION_ACTIONS,
  BARTER_DISCOVERY_ACTIONS,
  BARTER_OFFICIAL_ACTIONS,
  BARTER_OFFER_ACTIONS,
} from './actions.js';

const DISCOVERY_SET = new Set(BARTER_DISCOVERY_ACTIONS);
const OFFICIAL_SET = new Set(BARTER_OFFICIAL_ACTIONS);
const CONVERSATION_SET = new Set(BARTER_CONVERSATION_ACTIONS);
const OFFER_SET = new Set(BARTER_OFFER_ACTIONS);
const ALL_SET = new Set(BARTER_CALLBACK_ACTIONS);
const normalize = (action) => String(action || '').trim();

export const isBarterDiscoveryAction = (action) => DISCOVERY_SET.has(normalize(action));
export const isBarterOfficialAction = (action) => OFFICIAL_SET.has(normalize(action));
export const isBarterConversationAction = (action) => CONVERSATION_SET.has(normalize(action));
export const isBarterOfferAction = (action) => OFFER_SET.has(normalize(action));
export const isBarterCallbackAction = (action) => ALL_SET.has(normalize(action));
