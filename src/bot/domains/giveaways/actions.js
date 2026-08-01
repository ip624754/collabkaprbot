export const GIVEAWAY_ACTION = Object.freeze({
  ACCESS: 'a:gw_access',
  ACCESS_RECHECK: 'a:gw_access_recheck',
  ACCESS_CHECK_ME: 'a:gw_access_checkme',
  ACCESS_USER_PROMPT: 'a:gw_access_user_prompt',

  JOIN: 'a:gw_join',
  CHECK: 'a:gw_check',

  END_NOW: 'a:gw_end_now',
  END_DO: 'a:gw_end_do',
  WINNERS_VIEW: 'a:gw_wv',
  DRAW_NOW: 'a:gw_draw_now',
  DRAW_DO: 'a:gw_draw_do',
});

export const GIVEAWAY_ACCESS_ACTIONS = Object.freeze([
  GIVEAWAY_ACTION.ACCESS,
  GIVEAWAY_ACTION.ACCESS_RECHECK,
  GIVEAWAY_ACTION.ACCESS_CHECK_ME,
  GIVEAWAY_ACTION.ACCESS_USER_PROMPT,
]);

export const GIVEAWAY_PARTICIPANT_ACTIONS = Object.freeze([
  GIVEAWAY_ACTION.JOIN,
  GIVEAWAY_ACTION.CHECK,
]);

export const GIVEAWAY_LIFECYCLE_ACTIONS = Object.freeze([
  GIVEAWAY_ACTION.END_NOW,
  GIVEAWAY_ACTION.END_DO,
  GIVEAWAY_ACTION.WINNERS_VIEW,
  GIVEAWAY_ACTION.DRAW_NOW,
  GIVEAWAY_ACTION.DRAW_DO,
]);

export const GIVEAWAY_CRITICAL_CALLBACK_ACTIONS = Object.freeze([
  ...GIVEAWAY_ACCESS_ACTIONS,
  ...GIVEAWAY_PARTICIPANT_ACTIONS,
  ...GIVEAWAY_LIFECYCLE_ACTIONS,
]);
