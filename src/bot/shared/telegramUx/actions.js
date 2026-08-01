export const TELEGRAM_UX_ACTION = Object.freeze({
  USER_ACK: 'a:usr_ack',
});

export const TELEGRAM_UX_CALLBACK_ACTIONS = Object.freeze(Object.values(TELEGRAM_UX_ACTION));

export const CALLBACK_ACTION_ALIASES = Object.freeze({
  'a:brand_managers': 'a:brand_team',
  'a:brand_team_home': 'a:brand_team',
  'a:team': 'a:brand_team',
  'a:curators': 'a:cur_home',
  'a:curators_home': 'a:cur_home',
  'a:curator_home': 'a:cur_home',
  'a:home_hub': 'a:home',
});
