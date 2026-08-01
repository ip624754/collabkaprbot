import {
  DIRECTORY_CALLBACK_ACTIONS,
  DIRECTORY_PUBLIC_WORKSPACE_ACTIONS,
  DIRECTORY_SEARCH_ACTIONS,
} from './actions.js';

const SEARCH_SET = new Set(DIRECTORY_SEARCH_ACTIONS);
const PUBLIC_WORKSPACE_SET = new Set(DIRECTORY_PUBLIC_WORKSPACE_ACTIONS);
const ALL_SET = new Set(DIRECTORY_CALLBACK_ACTIONS);
const normalize = (action) => String(action || '').trim();

export const isDirectorySearchAction = (action) => SEARCH_SET.has(normalize(action));
export const isDirectoryPublicWorkspaceAction = (action) => PUBLIC_WORKSPACE_SET.has(normalize(action));
export const isDirectoryCallbackAction = (action) => ALL_SET.has(normalize(action));
