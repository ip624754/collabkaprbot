import {
  ADMIN_COMMUNICATION_CALLBACK_ACTIONS,
  ADMIN_COMMUNICATION_HOME_ACTIONS,
  ADMIN_MESSAGE_TEMPLATE_ACTIONS,
  ADMIN_NOTICE_ACTIONS,
  ADMIN_OUTBOX_ACTIONS,
} from './actions.js';

const setOf = (actions) => new Set(actions);
const ALL = setOf(ADMIN_COMMUNICATION_CALLBACK_ACTIONS);
const HOME = setOf(ADMIN_COMMUNICATION_HOME_ACTIONS);
const NOTICE = setOf(ADMIN_NOTICE_ACTIONS);
const OUTBOX = setOf(ADMIN_OUTBOX_ACTIONS);
const TEMPLATES = setOf(ADMIN_MESSAGE_TEMPLATE_ACTIONS);

export const isAdminCommunicationCallbackAction = (action) => ALL.has(String(action || ''));
export const isAdminCommunicationHomeAction = (action) => HOME.has(String(action || ''));
export const isAdminNoticeAction = (action) => NOTICE.has(String(action || ''));
export const isAdminOutboxAction = (action) => OUTBOX.has(String(action || ''));
export const isAdminMessageTemplateAction = (action) => TEMPLATES.has(String(action || ''));
