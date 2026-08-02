import {
  USER_ACCOUNT_ACTIONS,
  USER_SERVICE_CALLBACK_ACTIONS,
  USER_SHARING_ACTIONS,
  USER_SUPPORT_ACTIONS,
  USER_VERIFICATION_ACTIONS,
} from './actions.js';

const SUPPORT_ACTIONS = new Set(USER_SUPPORT_ACTIONS);
const VERIFICATION_ACTIONS = new Set(USER_VERIFICATION_ACTIONS);
const SHARING_ACTIONS = new Set(USER_SHARING_ACTIONS);
const ACCOUNT_ACTIONS = new Set(USER_ACCOUNT_ACTIONS);
const ALL_ACTIONS = new Set(USER_SERVICE_CALLBACK_ACTIONS);

export const isUserSupportAction = (action) => SUPPORT_ACTIONS.has(String(action || ''));
export const isUserVerificationAction = (action) => VERIFICATION_ACTIONS.has(String(action || ''));
export const isUserSharingAction = (action) => SHARING_ACTIONS.has(String(action || ''));
export const isUserAccountAction = (action) => ACCOUNT_ACTIONS.has(String(action || ''));
export const isUserServiceCallbackAction = (action) => ALL_ACTIONS.has(String(action || ''));
