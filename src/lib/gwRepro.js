// Giveaway winners reproducibility metadata (audit payload helpers).
// NOTE: keep this file dependency-free (no crypto) so both bot + db layers can import safely.

// Seed / algo versioning
export const GW_DRAW_SEED_VERSION_SQL = 'gid:endsAtIso_v1';
export const GW_DRAW_SEED_VERSION_JS = 'giveawayId|endsAtIso|eligibleHash_v1';

export const GW_DRAW_ALGO_VERSION_SQL = 'pg_hash_order_v1';
export const GW_DRAW_ALGO_VERSION_JS = 'xorshift32_v1';

// Hash method labels (auditing only)
export const GW_POOL_HASH_METHOD_SQL = 'md5(md5_agg_userid_ordered_v1)';
export const GW_WINNERS_HASH_METHOD_SQL = 'md5(place_userid_agg_v1)';
export const GW_POOL_HASH_METHOD_JS = 'sha256(sorted_ids_csv_v1)';
export const GW_WINNERS_HASH_METHOD_JS = 'sha256(place_userid_csv_v1)';
