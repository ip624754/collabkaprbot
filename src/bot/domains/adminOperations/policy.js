import {
  ADMIN_OPERATION_CALLBACK_ACTIONS,
  ADMIN_USER_ACTIONS,
  ADMIN_GIFT_ACTIONS,
  ADMIN_SUPPORT_ACTIONS,
  ADMIN_MODERATOR_GOVERNANCE_ACTIONS,
} from './actions.js';

const USER_SET = new Set(ADMIN_USER_ACTIONS);
const GIFT_SET = new Set(ADMIN_GIFT_ACTIONS);
const SUPPORT_SET = new Set(ADMIN_SUPPORT_ACTIONS);
const MODERATOR_SET = new Set(ADMIN_MODERATOR_GOVERNANCE_ACTIONS);
const CALLBACK_SET = new Set(ADMIN_OPERATION_CALLBACK_ACTIONS);

export const isAdminUserAction = (action) => USER_SET.has(String(action || ''));
export const isAdminGiftAction = (action) => GIFT_SET.has(String(action || ''));
export const isAdminSupportAction = (action) => SUPPORT_SET.has(String(action || ''));
export const isAdminModeratorGovernanceAction = (action) => MODERATOR_SET.has(String(action || ''));
export const isAdminOperationCallbackAction = (action) => CALLBACK_SET.has(String(action || ''));
