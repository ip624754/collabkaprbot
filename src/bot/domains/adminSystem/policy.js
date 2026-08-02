import {
  ADMIN_AUDIT_METRIC_ACTIONS,
  ADMIN_DELIVERY_HARD_SKIP_ACTIONS,
  ADMIN_FOUNDER_CONTROL_ACTIONS,
  ADMIN_QSTASH_ACTIONS,
  ADMIN_SYSTEM_CALLBACK_ACTIONS,
  ADMIN_SYSTEM_NAVIGATION_ACTIONS,
  ADMIN_SYSTEM_OPERATION_ACTIONS,
} from './actions.js';

const setOf = (actions) => new Set(actions);
const ALL = setOf(ADMIN_SYSTEM_CALLBACK_ACTIONS);
const NAVIGATION = setOf(ADMIN_SYSTEM_NAVIGATION_ACTIONS);
const OPERATIONS = setOf(ADMIN_SYSTEM_OPERATION_ACTIONS);
const HARD_SKIP = setOf(ADMIN_DELIVERY_HARD_SKIP_ACTIONS);
const AUDIT = setOf(ADMIN_AUDIT_METRIC_ACTIONS);
const QSTASH = setOf(ADMIN_QSTASH_ACTIONS);
const FOUNDER = setOf(ADMIN_FOUNDER_CONTROL_ACTIONS);

export const isAdminSystemCallbackAction = (action) => ALL.has(String(action || ''));
export const isAdminSystemNavigationAction = (action) => NAVIGATION.has(String(action || ''));
export const isAdminSystemOperationAction = (action) => OPERATIONS.has(String(action || ''));
export const isAdminDeliveryHardSkipAction = (action) => HARD_SKIP.has(String(action || ''));
export const isAdminAuditMetricAction = (action) => AUDIT.has(String(action || ''));
export const isAdminQStashAction = (action) => QSTASH.has(String(action || ''));
export const isAdminFounderControlAction = (action) => FOUNDER.has(String(action || ''));
