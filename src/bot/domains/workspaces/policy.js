import { WORKSPACE_CALLBACK_ACTIONS, WORKSPACE_CONTROL_ACTIONS, WORKSPACE_FOLDER_ACTIONS } from './actions.js';

const CONTROL_SET = new Set(WORKSPACE_CONTROL_ACTIONS);
const FOLDER_SET = new Set(WORKSPACE_FOLDER_ACTIONS);
const ALL_SET = new Set(WORKSPACE_CALLBACK_ACTIONS);
const normalize = (action) => String(action || '').trim();

export const isWorkspaceControlAction = (action) => CONTROL_SET.has(normalize(action));
export const isWorkspaceFolderAction = (action) => FOLDER_SET.has(normalize(action));
export const isWorkspaceCallbackAction = (action) => ALL_SET.has(normalize(action));
