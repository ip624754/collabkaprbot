import {
  MODERATION_CALLBACK_ACTIONS,
  MODERATION_REPORT_ACTIONS,
  MODERATION_VERIFICATION_ACTIONS,
} from './actions.js';

const REPORT_SET = new Set(MODERATION_REPORT_ACTIONS);
const VERIFICATION_SET = new Set(MODERATION_VERIFICATION_ACTIONS);
const CALLBACK_SET = new Set(MODERATION_CALLBACK_ACTIONS);

export const isModerationReportAction = (action) => REPORT_SET.has(String(action || ''));
export const isModerationVerificationAction = (action) => VERIFICATION_SET.has(String(action || ''));
export const isModerationCallbackAction = (action) => CALLBACK_SET.has(String(action || ''));
