export const ADMIN_AUTH_ACTION = Object.freeze({
  DECIDE: 'a:aw_auth_dec',
  TOGGLE_LOGIN: 'a:admin_web_login_toggle',
});

export const ADMIN_AUTH_CHALLENGE_ACTIONS = Object.freeze([
  ADMIN_AUTH_ACTION.DECIDE,
]);

export const ADMIN_AUTH_CONTROL_ACTIONS = Object.freeze([
  ADMIN_AUTH_ACTION.TOGGLE_LOGIN,
]);

export const ADMIN_AUTH_CALLBACK_ACTIONS = Object.freeze([
  ...ADMIN_AUTH_CHALLENGE_ACTIONS,
  ...ADMIN_AUTH_CONTROL_ACTIONS,
]);
