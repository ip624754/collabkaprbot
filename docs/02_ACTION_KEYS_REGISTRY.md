# Action Keys Registry — Collabka PR (@collabkaprbot)

> AUTO-GENERATED. Do not edit by hand.
>
> Regenerate: `npm run actions:md`

Generated at: `2026-02-28T14:45:55.196Z`

- Actions in code: **496**
- Actions in registry: **474**

## ❌ Missing in registry (present in code)

- `a:adm_ph`
- `a:admin_notice`
- `a:admin_notice_clear`
- `a:admin_notice_cta`
- `a:admin_notice_expire`
- `a:admin_notice_publish`
- `a:admin_notice_sev`
- `a:admin_notice_target`
- `a:admin_notice_text`
- `a:admin_notice_toggle`
- `a:admin_outbox`
- `a:admin_outbox_clear`
- `a:admin_outbox_clear_q`
- `a:admin_outbox_v`
- `a:admin_umsg_tpl_add`
- `a:admin_umsg_tpl_del`
- `a:admin_umsg_tpl_del_q`
- `a:admin_umsg_tpl_edit`
- `a:admin_umsg_tpl_reset`
- `a:admin_umsg_tpl_reset_q`
- `a:admin_umsg_tpl_view`
- `a:admin_umsg_tpls`

## Summary by type

| Type | Count |
|---|---:|
| admin | 54 |
| edit | 335 |
| ops | 74 |
| pay | 11 |

## Summary by guard

| Guard | Count |
|---|---:|
| none | 127 |
| require_redis | 347 |

## Actions table

| Action | Type | Guard |
|---|---|---|
| `a:adm_gift` | admin | require_redis |
| `a:adm_gift_batch` | admin | require_redis |
| `a:adm_gift_do` | admin | require_redis |
| `a:adm_gift_input` | admin | require_redis |
| `a:adm_gift_revoke` | admin | require_redis |
| `a:adm_gift_revoke_batch` | admin | require_redis |
| `a:adm_gift_revoke_do` | admin | require_redis |
| `a:adm_gift_revoke_input` | admin | require_redis |
| `a:adm_support_qr` | admin | none |
| `a:adm_support_reply` | admin | require_redis |
| `a:adm_uban_do` | admin | require_redis |
| `a:adm_uban_q` | admin | none |
| `a:adm_ucard` | admin | none |
| `a:adm_ucopy` | admin | require_redis |
| `a:adm_ucsv` | admin | require_redis |
| `a:adm_ugift` | admin | require_redis |
| `a:adm_ugift_do` | admin | require_redis |
| `a:adm_umsg` | admin | none |
| `a:adm_umsg_free` | admin | none |
| `a:adm_umsg_send` | admin | none |
| `a:adm_umsg_tpl` | admin | none |
| `a:adm_unote` | admin | require_redis |
| `a:adm_unote_clear` | admin | require_redis |
| `a:adm_unote_clear_q` | admin | require_redis |
| `a:adm_unote_edit` | admin | require_redis |
| `a:adm_urevoke_do` | admin | require_redis |
| `a:adm_urevoke_q` | admin | none |
| `a:admin` | admin | require_redis |
| `a:admin_bc_qstash_toggle` | admin | require_redis |
| `a:admin_founder` | admin | require_redis |
| `a:admin_founder_links` | admin | require_redis |
| `a:admin_founder_reset` | admin | require_redis |
| `a:admin_founder_set_credits` | admin | require_redis |
| `a:admin_founder_set_deadline` | admin | require_redis |
| `a:admin_founder_set_prices` | admin | require_redis |
| `a:admin_founder_texts` | admin | require_redis |
| `a:admin_founder_toggle` | admin | require_redis |
| `a:admin_home` | admin | none |
| `a:admin_matchfeat_auto_toggle` | admin | require_redis |
| `a:admin_metrics` | admin | require_redis |
| `a:admin_mod_add` | admin | require_redis |
| `a:admin_mod_list` | admin | none |
| `a:admin_mod_rm` | admin | require_redis |
| `a:admin_pay_accept_toggle` | admin | require_redis |
| `a:admin_pay_apply` | admin | none |
| `a:admin_pay_auto_toggle` | admin | require_redis |
| `a:admin_pay_autoheal` | admin | none |
| `a:admin_pay_view` | admin | none |
| `a:admin_payments` | admin | require_redis |
| `a:admin_qstash_ping` | admin | require_redis |
| `a:admin_qstash_status` | admin | require_redis |
| `a:admin_users` | admin | require_redis |
| `a:admin_users_reset` | admin | require_redis |
| `a:admin_users_search` | admin | require_redis |
| `a:aud` | edit | require_redis |
| `a:aud_export` | edit | require_redis |
| `a:aud_reset` | edit | require_redis |
| `a:aud_search` | edit | require_redis |
| `a:bc_audience` | ops | require_redis |
| `a:bc_btn_done` | ops | none |
| `a:bc_buttons` | ops | require_redis |
| `a:bc_cancel` | ops | none |
| `a:bc_confirm` | ops | require_redis |
| `a:bc_list` | ops | none |
| `a:bc_pause` | ops | require_redis |
| `a:bc_resume` | ops | require_redis |
| `a:bc_start` | ops | require_redis |
| `a:bc_stop` | ops | require_redis |
| `a:bc_tpl_bp` | ops | require_redis |
| `a:bc_tpl_gw` | ops | require_redis |
| `a:bc_tpl_offer` | ops | require_redis |
| `a:bc_view` | ops | none |
| `a:bd_fpick` | edit | require_redis |
| `a:bd_freset` | edit | require_redis |
| `a:bd_fset` | edit | require_redis |
| `a:bd_mclear` | edit | require_redis |
| `a:bd_mdone` | edit | none |
| `a:bd_mpick` | edit | require_redis |
| `a:bd_mt` | edit | require_redis |
| `a:blead_cancel` | edit | none |
| `a:blead_reply` | edit | require_redis |
| `a:blead_view` | edit | none |
| `a:bm_add_username` | edit | require_redis |
| `a:bm_help` | edit | none |
| `a:bm_home` | edit | none |
| `a:bm_invite` | edit | require_redis |
| `a:bm_list` | edit | none |
| `a:bm_mode_set` | edit | require_redis |
| `a:bm_pick_brand` | edit | require_redis |
| `a:bm_rm_ok` | edit | require_redis |
| `a:bm_rm_q` | edit | none |
| `a:bm_set_brand` | edit | require_redis |
| `a:brand_app_accept` | edit | none |
| `a:brand_app_accepted_done` | edit | none |
| `a:brand_app_card` | edit | none |
| `a:brand_app_chat` | edit | none |
| `a:brand_app_del_do` | edit | require_redis |
| `a:brand_app_del_q` | edit | none |
| `a:brand_app_reply` | edit | require_redis |
| `a:brand_app_set` | edit | require_redis |
| `a:brand_app_tpl` | edit | require_redis |
| `a:brand_app_tpl_send` | edit | require_redis |
| `a:brand_app_tpls` | edit | require_redis |
| `a:brand_app_view` | edit | none |
| `a:brand_apply` | edit | require_redis |
| `a:brand_apply_cancel` | edit | require_redis |
| `a:brand_apply_clear` | edit | require_redis |
| `a:brand_apply_done` | edit | none |
| `a:brand_apply_preview` | edit | require_redis |
| `a:brand_apply_send` | edit | require_redis |
| `a:brand_apply_write` | edit | require_redis |
| `a:brand_apps` | edit | require_redis |
| `a:brand_bb_clear` | edit | require_redis |
| `a:brand_bb_done` | edit | none |
| `a:brand_bb_pick` | edit | require_redis |
| `a:brand_bb_set` | edit | require_redis |
| `a:brand_buy` | pay | require_redis |
| `a:brand_continue` | edit | require_redis |
| `a:brand_deal_reply` | edit | require_redis |
| `a:brand_deal_set` | edit | require_redis |
| `a:brand_deal_tpl` | edit | require_redis |
| `a:brand_deal_tpls` | edit | require_redis |
| `a:brand_deal_view` | edit | none |
| `a:brand_deals` | edit | require_redis |
| `a:brand_deals_filters_clear` | edit | require_redis |
| `a:brand_deals_mine_toggle` | edit | require_redis |
| `a:brand_deals_search` | edit | require_redis |
| `a:brand_deals_search_clear` | edit | require_redis |
| `a:brand_dir_open` | edit | none |
| `a:brand_gt_clear` | edit | require_redis |
| `a:brand_gt_done` | edit | none |
| `a:brand_gt_pick` | edit | require_redis |
| `a:brand_gt_t` | edit | require_redis |
| `a:brand_managers` | edit | require_redis |
| `a:brand_niche_clear` | edit | require_redis |
| `a:brand_niche_pick` | edit | require_redis |
| `a:brand_niche_set` | edit | require_redis |
| `a:brand_pass` | edit | require_redis |
| `a:brand_plan` | pay | require_redis |
| `a:brand_plan_buy` | pay | require_redis |
| `a:brand_prof_more` | edit | none |
| `a:brand_prof_reset` | edit | require_redis |
| `a:brand_prof_reset_ok` | edit | require_redis |
| `a:brand_prof_set` | edit | require_redis |
| `a:brand_profile` | edit | none |
| `a:brand_profile_edit` | edit | require_redis |
| `a:brand_profile_more` | edit | none |
| `a:brand_rt_clear` | edit | require_redis |
| `a:brand_rt_done` | edit | none |
| `a:brand_rt_pick` | edit | require_redis |
| `a:brand_rt_t` | edit | require_redis |
| `a:brand_team` | edit | require_redis |
| `a:brand_team_help` | edit | none |
| `a:brand_team_home` | edit | none |
| `a:brand_ty_clear` | edit | require_redis |
| `a:brand_ty_done` | edit | none |
| `a:brand_ty_t` | edit | require_redis |
| `a:brands_filters` | edit | require_redis |
| `a:brands_home` | edit | none |
| `a:bx_archive` | edit | require_redis |
| `a:bx_bump` | edit | require_redis |
| `a:bx_cat` | edit | require_redis |
| `a:bx_comp` | edit | require_redis |
| `a:bx_comp_pick` | edit | require_redis |
| `a:bx_del_do` | edit | require_redis |
| `a:bx_del_q` | edit | none |
| `a:bx_enable_net` | edit | require_redis |
| `a:bx_fcat` | edit | require_redis |
| `a:bx_fcomp` | edit | require_redis |
| `a:bx_feed` | edit | require_redis |
| `a:bx_filters` | edit | require_redis |
| `a:bx_fpick` | edit | require_redis |
| `a:bx_freset` | edit | require_redis |
| `a:bx_fset` | edit | require_redis |
| `a:bx_ftype` | edit | require_redis |
| `a:bx_home` | edit | none |
| `a:bx_inbox` | edit | require_redis |
| `a:bx_kind` | edit | require_redis |
| `a:bx_mclear` | edit | require_redis |
| `a:bx_mdone` | edit | none |
| `a:bx_media_clear` | edit | require_redis |
| `a:bx_media_gif` | edit | require_redis |
| `a:bx_media_photo` | edit | require_redis |
| `a:bx_media_preview` | edit | none |
| `a:bx_media_step` | edit | require_redis |
| `a:bx_media_video` | edit | require_redis |
| `a:bx_mpick` | edit | require_redis |
| `a:bx_msg` | edit | require_redis |
| `a:bx_mt` | edit | require_redis |
| `a:bx_my` | edit | require_redis |
| `a:bx_my_arch` | edit | require_redis |
| `a:bx_new` | edit | require_redis |
| `a:bx_open` | edit | none |
| `a:bx_otclr` | edit | require_redis |
| `a:bx_otdone` | edit | none |
| `a:bx_otnext` | edit | none |
| `a:bx_otpick` | edit | require_redis |
| `a:bx_otskip` | edit | none |
| `a:bx_ott` | edit | require_redis |
| `a:bx_ottags` | edit | require_redis |
| `a:bx_params` | edit | require_redis |
| `a:bx_partner_folder_clear` | edit | require_redis |
| `a:bx_partner_folder_pick` | edit | require_redis |
| `a:bx_partner_folder_set` | edit | require_redis |
| `a:bx_pause` | edit | require_redis |
| `a:bx_pin_clear` | edit | require_redis |
| `a:bx_pin_set` | edit | require_redis |
| `a:bx_preset_apply` | edit | require_redis |
| `a:bx_preset_home` | edit | none |
| `a:bx_proof_link` | edit | require_redis |
| `a:bx_proof_photo` | edit | require_redis |
| `a:bx_proofs` | edit | require_redis |
| `a:bx_pub` | edit | require_redis |
| `a:bx_pub_done` | edit | none |
| `a:bx_publish` | edit | require_redis |
| `a:bx_publish_hint` | edit | require_redis |
| `a:bx_report_offer` | edit | require_redis |
| `a:bx_report_thread` | edit | require_redis |
| `a:bx_restore` | edit | require_redis |
| `a:bx_resume` | edit | require_redis |
| `a:bx_retry_help` | edit | none |
| `a:bx_smart` | edit | require_redis |
| `a:bx_smart_reset` | edit | require_redis |
| `a:bx_stage` | edit | require_redis |
| `a:bx_thread` | edit | require_redis |
| `a:bx_thread_close_do` | edit | require_redis |
| `a:bx_thread_close_q` | edit | none |
| `a:bx_thread_del_do` | edit | require_redis |
| `a:bx_thread_del_q` | edit | none |
| `a:bx_thread_new` | edit | require_redis |
| `a:bx_thread_reply` | edit | require_redis |
| `a:bx_thread_triage` | edit | require_redis |
| `a:bx_thread_write` | edit | require_redis |
| `a:bx_type` | edit | require_redis |
| `a:bx_view` | edit | none |
| `a:bx_w5` | edit | require_redis |
| `a:bx_w6` | edit | require_redis |
| `a:bx_wtagclr` | edit | require_redis |
| `a:bx_wtagdone` | edit | none |
| `a:bx_wtagpick` | edit | require_redis |
| `a:bx_wtags` | edit | require_redis |
| `a:bx_wtagt` | edit | require_redis |
| `a:bx_wtext` | edit | require_redis |
| `a:cur_add_username` | edit | require_redis |
| `a:cur_audit` | edit | require_redis |
| `a:cur_gw_check_do` | edit | require_redis |
| `a:cur_gw_check_q` | edit | none |
| `a:cur_gw_log` | edit | require_redis |
| `a:cur_gw_note_q` | edit | none |
| `a:cur_gw_open` | edit | none |
| `a:cur_gw_owner_q` | edit | none |
| `a:cur_gw_owner_send` | edit | require_redis |
| `a:cur_gw_remind_q` | edit | none |
| `a:cur_gw_remind_send` | edit | require_redis |
| `a:cur_gw_stats` | edit | require_redis |
| `a:cur_home` | edit | none |
| `a:cur_inbox` | edit | require_redis |
| `a:cur_invite` | edit | require_redis |
| `a:cur_leave_do` | edit | require_redis |
| `a:cur_leave_q` | edit | none |
| `a:cur_list` | edit | none |
| `a:cur_manage` | edit | require_redis |
| `a:cur_mode_set` | edit | require_redis |
| `a:cur_note_cancel` | edit | none |
| `a:cur_rm_do` | edit | require_redis |
| `a:cur_rm_q` | edit | none |
| `a:cur_ws` | edit | require_redis |
| `a:cur_ws_off` | edit | require_redis |
| `a:curator_home` | edit | none |
| `a:curators` | edit | require_redis |
| `a:curators_home` | edit | none |
| `a:feat_buy` | pay | require_redis |
| `a:feat_example` | edit | require_redis |
| `a:feat_home` | edit | none |
| `a:feat_inc` | edit | require_redis |
| `a:feat_stop` | edit | require_redis |
| `a:feat_view` | edit | none |
| `a:folder_add` | edit | require_redis |
| `a:folder_clear_do` | edit | require_redis |
| `a:folder_clear_q` | edit | none |
| `a:folder_delete_do` | edit | require_redis |
| `a:folder_delete_q` | edit | none |
| `a:folder_export` | edit | require_redis |
| `a:folder_new` | edit | require_redis |
| `a:folder_open` | edit | none |
| `a:folder_remove` | edit | require_redis |
| `a:folder_rename` | edit | require_redis |
| `a:folders_home` | edit | none |
| `a:folders_my` | edit | require_redis |
| `a:founder` | pay | require_redis |
| `a:founder_buy` | pay | require_redis |
| `a:go_dialogs` | edit | require_redis |
| `a:go_requests` | edit | none |
| `a:guide` | edit | require_redis |
| `a:gw_access` | ops | require_redis |
| `a:gw_access_checkme` | ops | require_redis |
| `a:gw_access_recheck` | ops | require_redis |
| `a:gw_access_user_prompt` | ops | none |
| `a:gw_check` | ops | require_redis |
| `a:gw_confirm_push` | ops | require_redis |
| `a:gw_deadline` | ops | require_redis |
| `a:gw_deadline_custom` | ops | require_redis |
| `a:gw_del_do` | ops | require_redis |
| `a:gw_del_q` | ops | none |
| `a:gw_draw_do` | ops | require_redis |
| `a:gw_draw_now` | ops | require_redis |
| `a:gw_end_do` | ops | require_redis |
| `a:gw_end_now` | ops | require_redis |
| `a:gw_export` | ops | require_redis |
| `a:gw_join` | ops | require_redis |
| `a:gw_list` | ops | none |
| `a:gw_list_ws` | ops | none |
| `a:gw_log` | ops | require_redis |
| `a:gw_media_clear` | ops | require_redis |
| `a:gw_media_gif` | ops | require_redis |
| `a:gw_media_photo` | ops | require_redis |
| `a:gw_media_skip` | ops | none |
| `a:gw_media_step` | ops | require_redis |
| `a:gw_media_video` | ops | require_redis |
| `a:gw_new` | ops | require_redis |
| `a:gw_new_pick` | ops | require_redis |
| `a:gw_open` | ops | none |
| `a:gw_open_public` | ops | none |
| `a:gw_preflight` | ops | require_redis |
| `a:gw_preset_apply` | ops | require_redis |
| `a:gw_preset_home` | ops | none |
| `a:gw_preview` | ops | none |
| `a:gw_prize` | ops | require_redis |
| `a:gw_publish` | ops | require_redis |
| `a:gw_publish_results` | ops | require_redis |
| `a:gw_remind_q` | ops | none |
| `a:gw_remind_send` | ops | require_redis |
| `a:gw_results_refresh` | ops | require_redis |
| `a:gw_sponsors_clear` | ops | require_redis |
| `a:gw_sponsors_edit` | ops | require_redis |
| `a:gw_sponsors_enter` | ops | require_redis |
| `a:gw_sponsors_from_folder` | ops | require_redis |
| `a:gw_sponsors_help` | ops | none |
| `a:gw_sponsors_next` | ops | none |
| `a:gw_sponsors_skip` | ops | none |
| `a:gw_sponsors_use_folder` | ops | require_redis |
| `a:gw_stats` | ops | require_redis |
| `a:gw_step_deadline` | ops | require_redis |
| `a:gw_step_sponsors` | ops | require_redis |
| `a:gw_why` | ops | require_redis |
| `a:gw_why_enter` | ops | require_redis |
| `a:gw_why_forward` | ops | require_redis |
| `a:gw_why_recheck` | ops | require_redis |
| `a:gw_winners` | ops | require_redis |
| `a:gw_winners_custom` | ops | require_redis |
| `a:gw_wv` | ops | require_redis |
| `a:home` | edit | none |
| `a:home_hint_ack` | edit | none |
| `a:home_hub` | edit | none |
| `a:home_mode` | edit | none |
| `a:lead_assign` | edit | require_redis |
| `a:lead_del_do` | edit | require_redis |
| `a:lead_del_q` | edit | none |
| `a:lead_note` | edit | require_redis |
| `a:lead_note_cancel` | edit | none |
| `a:lead_note_text` | edit | require_redis |
| `a:lead_note_tpl` | edit | require_redis |
| `a:lead_notes` | edit | require_redis |
| `a:lead_reply` | edit | require_redis |
| `a:lead_set` | edit | require_redis |
| `a:lead_tpl` | edit | require_redis |
| `a:lead_tpl_send` | edit | require_redis |
| `a:lead_tpls` | edit | require_redis |
| `a:lead_view` | edit | none |
| `a:main_menu` | edit | none |
| `a:match_buy` | pay | require_redis |
| `a:match_example` | edit | require_redis |
| `a:match_home` | edit | none |
| `a:match_inc` | edit | require_redis |
| `a:menu` | edit | none |
| `a:mod_home` | edit | none |
| `a:mod_r_close` | edit | require_redis |
| `a:mod_r_freeze` | edit | require_redis |
| `a:mod_r_resolve` | edit | require_redis |
| `a:mod_report` | edit | require_redis |
| `a:mod_reports` | edit | require_redis |
| `a:mod_verif_approve` | edit | require_redis |
| `a:mod_verif_reject` | edit | require_redis |
| `a:mod_verif_view` | edit | none |
| `a:mod_verifs` | edit | require_redis |
| `a:more` | edit | none |
| `a:my_apps` | edit | require_redis |
| `a:nd` | ops | none |
| `a:net_q` | edit | none |
| `a:net_set` | edit | require_redis |
| `a:nop` | edit | require_redis |
| `a:off_buy` | pay | require_redis |
| `a:off_buy_home` | pay | none |
| `a:off_manage` | edit | require_redis |
| `a:off_pub` | edit | require_redis |
| `a:off_queue` | edit | none |
| `a:off_req` | edit | none |
| `a:off_req_cancel` | edit | none |
| `a:off_req_home` | edit | none |
| `a:off_rm` | edit | require_redis |
| `a:off_upd` | edit | require_redis |
| `a:offer_open` | edit | none |
| `a:onb_brand` | edit | require_redis |
| `a:onb_creator` | edit | require_redis |
| `a:pm_home` | edit | none |
| `a:pm_pick` | edit | require_redis |
| `a:pm_reset` | edit | require_redis |
| `a:pm_run` | edit | require_redis |
| `a:pm_tog` | edit | require_redis |
| `a:pm_view` | edit | none |
| `a:pro_home` | edit | none |
| `a:role_pick` | edit | require_redis |
| `a:send_request_to_creator` | edit | none |
| `a:setup` | edit | require_redis |
| `a:share` | edit | require_redis |
| `a:support` | ops | require_redis |
| `a:support_write` | ops | require_redis |
| `a:team` | edit | require_redis |
| `a:ui_mode_set` | edit | require_redis |
| `a:verify_home` | edit | none |
| `a:verify_info` | edit | none |
| `a:verify_kind` | edit | require_redis |
| `a:ws_editor_add_username` | edit | require_redis |
| `a:ws_editor_invite` | edit | require_redis |
| `a:ws_editor_rm_do` | edit | require_redis |
| `a:ws_editor_rm_q` | edit | none |
| `a:ws_editors` | edit | require_redis |
| `a:ws_history` | edit | require_redis |
| `a:ws_history_export` | edit | require_redis |
| `a:ws_ig_dm` | edit | require_redis |
| `a:ws_ig_oauth_disconnect` | edit | none |
| `a:ws_ig_templates` | edit | require_redis |
| `a:ws_ig_templates_send` | edit | require_redis |
| `a:ws_ig_verify` | edit | require_redis |
| `a:ws_ig_verify_comment` | edit | require_redis |
| `a:ws_ig_verify_oauth` | edit | require_redis |
| `a:ws_ig_verify_status` | edit | none |
| `a:ws_lead` | edit | require_redis |
| `a:ws_leads` | edit | require_redis |
| `a:ws_list` | edit | none |
| `a:ws_open` | edit | none |
| `a:ws_pro` | edit | require_redis |
| `a:ws_pro_buy` | pay | require_redis |
| `a:ws_pro_pin` | edit | require_redis |
| `a:ws_pro_pin_clear` | edit | require_redis |
| `a:ws_pro_pin_set` | edit | require_redis |
| `a:ws_prof_clear` | edit | require_redis |
| `a:ws_prof_contacts` | edit | require_redis |
| `a:ws_prof_contacts_clear` | edit | require_redis |
| `a:ws_prof_contacts_clear_k` | edit | require_redis |
| `a:ws_prof_contacts_edit` | edit | require_redis |
| `a:ws_prof_contacts_migrate` | edit | require_redis |
| `a:ws_prof_edit` | edit | require_redis |
| `a:ws_prof_fmt_clear` | edit | require_redis |
| `a:ws_prof_fmt_t` | edit | require_redis |
| `a:ws_prof_formats` | edit | require_redis |
| `a:ws_prof_mode` | edit | require_redis |
| `a:ws_prof_mode_set` | edit | require_redis |
| `a:ws_prof_reset` | edit | require_redis |
| `a:ws_prof_reset_ok` | edit | require_redis |
| `a:ws_prof_vert_clear` | edit | require_redis |
| `a:ws_prof_vert_t` | edit | require_redis |
| `a:ws_prof_verticals` | edit | require_redis |
| `a:ws_profile` | edit | none |
| `a:ws_settings` | edit | require_redis |
| `a:ws_share` | edit | require_redis |
| `a:ws_share_send` | edit | require_redis |
| `a:ws_toggle_cur` | edit | require_redis |
| `a:ws_toggle_net` | edit | require_redis |
| `a:wsp_contact_req` | edit | none |
| `a:wsp_contact_unlock` | pay | none |
| `a:wsp_lead_new` | edit | require_redis |
| `a:wsp_open` | edit | none |
| `a:wsp_preview` | edit | none |
