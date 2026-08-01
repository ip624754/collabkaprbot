export const LEAD_ACTION = Object.freeze({
  SEND_REQUEST_TO_CREATOR: 'a:send_request_to_creator',
  WSP_LEAD_NEW: 'a:wsp_lead_new',
  BLEAD_VIEW: 'a:blead_view',
  BLEAD_REPLY: 'a:blead_reply',
  BLEAD_CANCEL: 'a:blead_cancel',
  LEAD_ASSIGN: 'a:lead_assign',
  LEAD_DEL_DO: 'a:lead_del_do',
  LEAD_DEL_Q: 'a:lead_del_q',
  LEAD_NOTE: 'a:lead_note',
  LEAD_NOTE_CANCEL: 'a:lead_note_cancel',
  LEAD_NOTE_TEXT: 'a:lead_note_text',
  LEAD_NOTE_TPL: 'a:lead_note_tpl',
  LEAD_NOTES: 'a:lead_notes',
  LEAD_REPLY: 'a:lead_reply',
  LEAD_SET: 'a:lead_set',
  LEAD_TPL: 'a:lead_tpl',
  LEAD_TPL_SEND: 'a:lead_tpl_send',
  LEAD_TPLS: 'a:lead_tpls',
  LEAD_VIEW: 'a:lead_view',
  CA: 'a:ca',
});

export const LEAD_ACQUISITION_ACTIONS = Object.freeze([
  LEAD_ACTION.SEND_REQUEST_TO_CREATOR,
  LEAD_ACTION.WSP_LEAD_NEW,
  LEAD_ACTION.BLEAD_VIEW,
  LEAD_ACTION.BLEAD_REPLY,
  LEAD_ACTION.BLEAD_CANCEL,
]);

export const LEAD_WORKFLOW_ACTIONS = Object.freeze([
  LEAD_ACTION.LEAD_ASSIGN,
  LEAD_ACTION.LEAD_DEL_DO,
  LEAD_ACTION.LEAD_DEL_Q,
  LEAD_ACTION.LEAD_NOTE,
  LEAD_ACTION.LEAD_NOTE_CANCEL,
  LEAD_ACTION.LEAD_NOTE_TEXT,
  LEAD_ACTION.LEAD_NOTE_TPL,
  LEAD_ACTION.LEAD_NOTES,
  LEAD_ACTION.LEAD_REPLY,
  LEAD_ACTION.LEAD_SET,
  LEAD_ACTION.LEAD_TPL,
  LEAD_ACTION.LEAD_TPL_SEND,
  LEAD_ACTION.LEAD_TPLS,
  LEAD_ACTION.LEAD_VIEW,
]);

export const LEAD_AUDIT_ACTIONS = Object.freeze([
  LEAD_ACTION.CA,
]);

export const LEAD_CALLBACK_ACTIONS = Object.freeze([
  ...LEAD_ACQUISITION_ACTIONS,
  ...LEAD_WORKFLOW_ACTIONS,
  ...LEAD_AUDIT_ACTIONS,
]);
