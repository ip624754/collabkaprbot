export const CURATOR_ACTION = Object.freeze({
  CUR_MODE_SET: 'a:cur_mode_set',
  CUR_HOME: 'a:cur_home',
  CUR_INBOX: 'a:cur_inbox',
  CUR_LEAVE_Q: 'a:cur_leave_q',
  CUR_LEAVE_DO: 'a:cur_leave_do',
  CUR_GW_OPEN: 'a:cur_gw_open',
  CUR_GW_STATS: 'a:cur_gw_stats',
  CUR_GW_LOG: 'a:cur_gw_log',
  CUR_GW_REMIND_Q: 'a:cur_gw_remind_q',
  CUR_GW_REMIND_SEND: 'a:cur_gw_remind_send',
  CUR_GW_OWNER_Q: 'a:cur_gw_owner_q',
  CUR_GW_OWNER_SEND: 'a:cur_gw_owner_send',
  CUR_GW_CHECK_Q: 'a:cur_gw_check_q',
  CUR_GW_CHECK_DO: 'a:cur_gw_check_do',
  CUR_GW_NOTE_Q: 'a:cur_gw_note_q',
  CUR_NOTE_CANCEL: 'a:cur_note_cancel',
  CUR_MANAGE: 'a:cur_manage',
  CUR_INVITE: 'a:cur_invite',
  CUR_ADD_USERNAME: 'a:cur_add_username',
  CUR_LIST: 'a:cur_list',
  CUR_AUDIT: 'a:cur_audit',
  CUR_RM_Q: 'a:cur_rm_q',
  CUR_RM_DO: 'a:cur_rm_do',
});

export const CURATOR_OPERATION_ACTIONS = Object.freeze([
  CURATOR_ACTION.CUR_MODE_SET,
  CURATOR_ACTION.CUR_HOME,
  CURATOR_ACTION.CUR_INBOX,
  CURATOR_ACTION.CUR_LEAVE_Q,
  CURATOR_ACTION.CUR_LEAVE_DO,
  CURATOR_ACTION.CUR_GW_OPEN,
  CURATOR_ACTION.CUR_GW_STATS,
  CURATOR_ACTION.CUR_GW_LOG,
  CURATOR_ACTION.CUR_GW_REMIND_Q,
  CURATOR_ACTION.CUR_GW_REMIND_SEND,
  CURATOR_ACTION.CUR_GW_OWNER_Q,
  CURATOR_ACTION.CUR_GW_OWNER_SEND,
  CURATOR_ACTION.CUR_GW_CHECK_Q,
  CURATOR_ACTION.CUR_GW_CHECK_DO,
  CURATOR_ACTION.CUR_GW_NOTE_Q,
  CURATOR_ACTION.CUR_NOTE_CANCEL,
]);

export const CURATOR_MANAGEMENT_ACTIONS = Object.freeze([
  CURATOR_ACTION.CUR_MANAGE,
  CURATOR_ACTION.CUR_INVITE,
  CURATOR_ACTION.CUR_ADD_USERNAME,
  CURATOR_ACTION.CUR_LIST,
  CURATOR_ACTION.CUR_AUDIT,
  CURATOR_ACTION.CUR_RM_Q,
  CURATOR_ACTION.CUR_RM_DO,
]);

export const CURATOR_CALLBACK_ACTIONS = Object.freeze([
  ...CURATOR_OPERATION_ACTIONS,
  ...CURATOR_MANAGEMENT_ACTIONS,
]);
