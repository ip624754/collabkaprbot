import {
  BRAND_CALLBACK_ACTIONS,
  BRAND_DIRECTORY_ACTIONS,
  BRAND_PROFILE_ACTIONS,
} from './actions.js';

const DIRECTORY_SET = new Set(BRAND_DIRECTORY_ACTIONS);
const PROFILE_SET = new Set(BRAND_PROFILE_ACTIONS);
const ALL_SET = new Set(BRAND_CALLBACK_ACTIONS);
const normalize = (action) => String(action || '').trim();

export const isBrandDirectoryAction = (action) => DIRECTORY_SET.has(normalize(action));
export const isBrandProfileAction = (action) => PROFILE_SET.has(normalize(action));
export const isBrandCallbackAction = (action) => ALL_SET.has(normalize(action));
