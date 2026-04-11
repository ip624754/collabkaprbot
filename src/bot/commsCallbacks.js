const BROADCAST_AUDIENCE_CODES = {
  a: 'all',
  c: 'creators',
  b: 'brands',
  u: 'curators',
  m: 'managers',
};
const BROADCAST_AUDIENCE_BY_KEY = Object.fromEntries(Object.entries(BROADCAST_AUDIENCE_CODES).map(([code, key]) => [key, code]));

const BUTTON_PRESET_CODES = {
  b: 'bot',
  a: 'app',
  l: 'landing',
  o: 'offers',
  c: 'catalog',
  f: 'feed',
};
const BUTTON_PRESET_BY_KEY = Object.fromEntries(Object.entries(BUTTON_PRESET_CODES).map(([code, key]) => [key, code]));

const BROADCAST_BLOCKED_KIND_CODES = {
  h: 'hard',
  a: 'all',
};
const BROADCAST_BLOCKED_KIND_BY_KEY = Object.fromEntries(Object.entries(BROADCAST_BLOCKED_KIND_CODES).map(([code, key]) => [key, code]));

function n(v, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? Math.max(0, Math.trunc(x)) : fallback;
}

function q(action, fields = {}) {
  const parts = [String(action || '')];
  for (const [k, v] of Object.entries(fields || {})) {
    if (v === undefined || v === null || String(v) === '') continue;
    parts.push(`${k}:${String(v)}`);
  }
  return parts.join('|');
}

export function encodeBroadcastAudience(key) {
  return BROADCAST_AUDIENCE_BY_KEY[String(key || '').trim()] || String(key || 'a').trim() || 'a';
}

export function decodeBroadcastAudience(code) {
  return BROADCAST_AUDIENCE_CODES[String(code || '').trim()] || String(code || 'all').trim() || 'all';
}

export function encodeButtonPresetKey(key) {
  return BUTTON_PRESET_BY_KEY[String(key || '').trim()] || String(key || '').trim();
}

export function decodeButtonPresetKey(code) {
  return BUTTON_PRESET_CODES[String(code || '').trim()] || String(code || '').trim();
}

export function encodeBroadcastBlockedKind(kind) {
  return BROADCAST_BLOCKED_KIND_BY_KEY[String(kind || '').trim()] || String(kind || 'h').trim() || 'h';
}

export function decodeBroadcastBlockedKind(code) {
  return BROADCAST_BLOCKED_KIND_CODES[String(code || '').trim()] || String(code || 'hard').trim() || 'hard';
}

export const commsCb = {
  bcStart: () => 'a:bc_start',
  bcStartAdv: () => 'a:bc_start_adv',
  bcSimpleText: () => 'a:bc_simple_text',
  bcSimpleMedia: () => 'a:bc_simple_media',
  bcSimpleMediaClear: () => 'a:bc_simple_media_clear',
  bcSimpleButton: () => 'a:bc_simple_button',
  bcSimpleBtnCustom: () => 'a:bc_simple_btn_custom',
  bcSimpleBtnClear: () => 'a:bc_simple_btn_clear',
  bcSimpleBtnPreset: (key) => q('a:bc_simple_btn_preset', { k: encodeButtonPresetKey(key) }),
  bcSimpleAudience: () => 'a:bc_simple_audience',
  bcSimpleClear: () => 'a:bc_simple_clear',
  bcPreview: () => 'a:bc_preview',
  bcSendQ: () => 'a:bc_send_q',
  bcConfirm: () => 'a:bc_confirm',
  bcCancel: () => 'a:bc_cancel',
  bcButtons: () => 'a:bc_buttons',
  bcBtnDone: () => 'a:bc_btn_done',
  bcTplGw: () => 'a:bc_tpl_gw',
  bcTplBp: () => 'a:bc_tpl_bp',
  bcTplOffer: () => 'a:bc_tpl_offer',
  bcAudienceSet: (audienceKey) => q('a:bc_audience', { aud: encodeBroadcastAudience(audienceKey) }),
  bcList: (page = 0) => q('a:bc_list', { p: n(page, 0) }),
  bcView: (id) => q('a:bc_view', { id: n(id, 0) }),
  bcPause: (id) => q('a:bc_pause', { id: n(id, 0) }),
  bcResume: (id) => q('a:bc_resume', { id: n(id, 0) }),
  bcStop: (id) => q('a:bc_stop', { id: n(id, 0) }),
  bcBlocked: (id, kind = 'hard', page = 0) => q('a:bc_blocked', { id: n(id, 0), t: encodeBroadcastBlockedKind(kind), p: n(page, 0) }),

  adminNotice: () => 'a:admin_notice',
  adminNoticeToggle: () => 'a:admin_notice_toggle',
  adminNoticeSeverity: () => 'a:admin_notice_sev',
  adminNoticeTarget: () => 'a:admin_notice_target',
  adminNoticeCta: () => 'a:admin_notice_cta',
  adminNoticeExpire: () => 'a:admin_notice_expire',
  adminNoticeClear: () => 'a:admin_notice_clear',
  adminNoticePublish: () => 'a:admin_notice_publish',

  adminOutbox: (page = 0) => q('a:admin_outbox', { p: n(page, 0) }),
  adminOutboxView: (index, page = 0) => q('a:admin_outbox_v', { i: n(index, 0), p: n(page, 0) }),
  adminOutboxNote: (index, page = 0) => q('a:admin_outbox_note', { i: n(index, 0), p: n(page, 0) }),
  adminOutboxRepeat: (index, page = 0) => q('a:admin_outbox_repeat', { i: n(index, 0), p: n(page, 0) }),
  adminOutboxToTpl: (index, page = 0) => q('a:admin_outbox_to_tpl', { i: n(index, 0), p: n(page, 0) }),
  adminOutboxClearQ: (page = 0) => q('a:admin_outbox_clear_q', { p: n(page, 0) }),
  adminOutboxClear: (page = 0) => q('a:admin_outbox_clear', { p: n(page, 0) }),
};
