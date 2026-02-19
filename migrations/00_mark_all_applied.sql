-- Collabka migration pack: mark all current migrations as applied
-- Use ONLY if your DB schema is already up-to-date (e.g. you ran migrations manually before).
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS schema_migrations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations(name, checksum) VALUES ('001_init.sql', '2e0913e8ddaf69983643d5c5a0c6c9984f37d0bdac2d407d21a5524051a971a0') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('002_barters.sql', 'ce99f9e5e593d9852e1db2bb22a5951816f1da51aebab6a27411f75cdb603c02') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('003_barters_ideal.sql', '26b3316b8fa78c109249d3d38a23d7888137d1e92d72c9009f8ff00d8efd5875') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('004_final_pack.sql', '7e214d45460706a1a66e0977e1c6f113e45223f83b135cb971b5301906b795e4') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('005_brand_pass.sql', '59e13a4c7d21f0edd031574c93945810ca88af610624a8fd671d159dd729cf07') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('006_brand_plan.sql', '857d2c224c9c5e332d0f9ff7dcc80e2c98f60dedbd3ad836a50cf02dd47e0171') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('007_matching.sql', '0034226974621aa85207b5ce0160b143acc82e69ccc8855de645313342b002f7') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('008_featured.sql', 'efd11e88811b11aff18e9aa47bac3d4715205e3c3c613c98ae1d97a3f06669b5') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('009_crm_stage.sql', '8446a1357e56ef3e24dcd968d471af99c7a70ed3f5911c98c29e21faf7452acc') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('010_user_verifications.sql', '5a8d2236639c76d79a7498c5ac6bc4aaa91be84e0d553cdfd084debb50cd9ff9') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('011_stars_payments.sql', 'acfa7ccbdfcb6fd7f85da445534edcc8933ba449ee5535436916354b6a207223') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('012_payments_ledger.sql', 'c749d0d047377d05ef23d4eb23c69084c8fff72fdcc902fc396ed294b65722bc') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('013_payments_extras.sql', '6405254225375609d23a7e69b8cf9535a1626d6b555bbe6f19201b08db504a0b') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('014_intro_trial_daily_limits.sql', 'd2701864ea15bc5ea3b543d0600390773553fcf805638d784260d22a873611bf') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('015_barter_thread_proofs.sql', '97ab38d51350c6348660d5fcc63aae631a6eb3a05472334b8127d1bf239e7e6b') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('016_channel_folders_and_editors.sql', '8895619b272938e3fdfbd806785fb16578ed2cdf2dba23662f72572536b90b98') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('017_analytics_events.sql', 'cd193899d2508dac200fb0e188bba3303220b49dace8bb7c489b53273559613d') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('018_official_channel_posts.sql', '560d50a66313ec122a95b554fc7247ace68658c84fe901c7fb74ba53149995a4') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('019_intro_retry_credits.sql', 'e3a17d890ffb2f82770878f8ca35ec1f4f8eaf3fa3dd07650454ac68b6125ddf') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('020_profile_matrix_ig_tg_deals.sql', '89b49e8dedf438c7c11dd1e99a49f4114c6742cb68d428ad793f18acf9ec0a5d') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('021_brand_leads.sql', '083d997375e209b79cd6108b6eee1392b519387fbe5b20b0544691d61b5bbe9d') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('022_profile_matrix_match_indexes.sql', '7e4b2edb600b25af869b58f419d8981fa23af6fcaca994ae47d6638090a9dde4') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('023_barter_offer_media.sql', '7460110405aac5cb91a4438953adb993bbd5cc33ac1b0e33358d5a07869d5427') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('024_brand_profiles.sql', 'fea11a1d066c6893317ace74f7b70252b53fce8cf73a1e6c7a7c5d9234a889a9') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('025_giveaways_media.sql', '413ec2b9af6d12eecdabfa1a1ca4685dbba406d9fe358c2b8938a78041b58245') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('026_brand_managers.sql', '61ecbdb6848206737b1d7935ba5cf95dac2d7d6c87cb117084a01118da877e6d') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('027_brand_applications.sql', '1046ef08d7925a8bae2fd21b90bf6534e02027613055a0cb39a7c1309274d0db') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('028_barter_offers_meta.sql', 'a1f81c3fdeb885693fe47e1b47abafb37050341550dafda1f2c5c3b27fd8564e') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('029_barter_threads_triage_status.sql', 'cff3f1199d89bbf8779232cad7cb6975660e0cf8290adc3ae7ccfa70289ac41b') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('030_broadcasts.sql', '5daffd79a078bce86c20238dd0aa579ca8bdef0ed6c736a21a558857fd6975ce') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('031_brand_leads_assignment.sql', '439b378d246d70f11799aaa350e747bcc774946e80c1dd71f5617149faba6fdf') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('032_soft_delete.sql', 'c105cad1b808962caf3af89058076c6b4f27ff87a571e64382472f83bb531736') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('033_user_ban.sql', '0ad442783d8da3d2b80e18459bc2f6ad718f0507b6668260591e1a4b319d44d5') ON CONFLICT (name) DO NOTHING;
INSERT INTO schema_migrations(name, checksum) VALUES ('034_SQL Migration Neon Postgres.sql', 'c2eb9d2d1fe5cdcc658a45fbd38d72a7ee0cb0644fe79f06d18d34ce3b1de892') ON CONFLICT (name) DO NOTHING;
