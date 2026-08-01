import {
  LEAD_ACQUISITION_ACTIONS,
  LEAD_WORKFLOW_ACTIONS,
  LEAD_AUDIT_ACTIONS,
  LEAD_CALLBACK_ACTIONS,
} from './actions.js';

const LEAD_ACQUISITION_ACTIONS_SET = new Set(LEAD_ACQUISITION_ACTIONS);
const LEAD_WORKFLOW_ACTIONS_SET = new Set(LEAD_WORKFLOW_ACTIONS);
const LEAD_AUDIT_ACTIONS_SET = new Set(LEAD_AUDIT_ACTIONS);
const ALL_SET = new Set(LEAD_CALLBACK_ACTIONS);

function normalizeAction(action) {
  return String(action || '').trim();
}

export function isLeadAcquisitionAction(action) {
  return LEAD_ACQUISITION_ACTIONS_SET.has(normalizeAction(action));
}

export function isLeadWorkflowAction(action) {
  return LEAD_WORKFLOW_ACTIONS_SET.has(normalizeAction(action));
}

export function isLeadAuditAction(action) {
  return LEAD_AUDIT_ACTIONS_SET.has(normalizeAction(action));
}

export function isLeadCallbackAction(action) {
  return ALL_SET.has(normalizeAction(action));
}
