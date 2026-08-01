import {
  BRAND_CALLBACK_ACTIONS,
  BRAND_DIRECTORY_ACTIONS,
  BRAND_PROFILE_ACTIONS,
  BRAND_MANAGER_MODE_ACTIONS,
  BRAND_TEAM_MEMBERSHIP_ACTIONS,
} from './actions.js';

const DIRECTORY_SET = new Set(BRAND_DIRECTORY_ACTIONS);
const PROFILE_SET = new Set(BRAND_PROFILE_ACTIONS);
const MANAGER_MODE_SET = new Set(BRAND_MANAGER_MODE_ACTIONS);
const TEAM_MEMBERSHIP_SET = new Set(BRAND_TEAM_MEMBERSHIP_ACTIONS);
const ALL_SET = new Set(BRAND_CALLBACK_ACTIONS);
const normalize = (action) => String(action || '').trim();

export const isBrandDirectoryAction = (action) => DIRECTORY_SET.has(normalize(action));
export const isBrandProfileAction = (action) => PROFILE_SET.has(normalize(action));
export const isBrandManagerModeAction = (action) => MANAGER_MODE_SET.has(normalize(action));
export const isBrandTeamMembershipAction = (action) => TEAM_MEMBERSHIP_SET.has(normalize(action));
export const isBrandCallbackAction = (action) => ALL_SET.has(normalize(action));
