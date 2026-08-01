import {
  WORKSPACE_CALLBACK_ACTIONS,
  WORKSPACE_CONTROL_ACTIONS,
  WORKSPACE_FOLDER_ACTIONS,
  WORKSPACE_PROFILE_ACTIONS,
  WORKSPACE_SOCIAL_ACTIONS,
} from './actions.js';

const CONTROL_SET = new Set(WORKSPACE_CONTROL_ACTIONS);
const FOLDER_SET = new Set(WORKSPACE_FOLDER_ACTIONS);
const PROFILE_SET = new Set(WORKSPACE_PROFILE_ACTIONS);
const SOCIAL_SET = new Set(WORKSPACE_SOCIAL_ACTIONS);
const ALL_SET = new Set(WORKSPACE_CALLBACK_ACTIONS);
const normalize = (action) => String(action || '').trim();

export const isWorkspaceControlAction = (action) => CONTROL_SET.has(normalize(action));
export const isWorkspaceFolderAction = (action) => FOLDER_SET.has(normalize(action));
export const isWorkspaceProfileAction = (action) => PROFILE_SET.has(normalize(action));
export const isWorkspaceSocialAction = (action) => SOCIAL_SET.has(normalize(action));
export const isWorkspaceCallbackAction = (action) => ALL_SET.has(normalize(action));
