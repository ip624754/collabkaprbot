/**
 * Thin domain adapter over the canonical admin-web Redis auth state machine.
 *
 * The import is intentionally lazy so the bounded transport/policy tests stay
 * executable without loading the full production config/dependency graph. The
 * actual approval transition remains implemented only in
 * src/lib/adminWeb/auth.js.
 */
export async function approveAdminAuthChallenge(input) {
  const { approveChallengeFromTelegram } = await import('../../../lib/adminWeb/auth.js');
  return approveChallengeFromTelegram(input);
}
