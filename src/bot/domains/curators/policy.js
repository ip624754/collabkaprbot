import {
  CURATOR_CALLBACK_ACTIONS,
  CURATOR_MANAGEMENT_ACTIONS,
  CURATOR_OPERATION_ACTIONS,
} from './actions.js';

const OPERATION_SET = new Set(CURATOR_OPERATION_ACTIONS);
const MANAGEMENT_SET = new Set(CURATOR_MANAGEMENT_ACTIONS);
const ALL_SET = new Set(CURATOR_CALLBACK_ACTIONS);
const normalize = (action) => String(action || '').trim();

export const isCuratorOperationAction = (action) => OPERATION_SET.has(normalize(action));
export const isCuratorManagementAction = (action) => MANAGEMENT_SET.has(normalize(action));
export const isCuratorCallbackAction = (action) => ALL_SET.has(normalize(action));
