export const NAVIGATION_ACTION = Object.freeze({
  UI_MODE_SET: 'a:ui_mode_set',
  GUIDE: 'a:guide',
  MENU_PUSH: 'a:menu_push',
  MENU: 'a:menu',
  ROLE_PICK: 'a:role_pick',
  HOME: 'a:home',
  HOME_HINT_ACK: 'a:home_hint_ack',
  HOME_MODE: 'a:home_mode',
  MAIN_MENU: 'a:main_menu',
});

export const NAVIGATION_CALLBACK_ACTIONS = Object.freeze(Object.values(NAVIGATION_ACTION));
