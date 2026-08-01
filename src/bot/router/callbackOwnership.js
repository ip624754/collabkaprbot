import { ACTION_REGISTRY } from '../actionRegistry.js';

export const CALLBACK_PHASE = Object.freeze({
  PRE_USER: 'pre_user',
  POST_USER: 'post_user',
});

export const CALLBACK_ROUTE = Object.freeze({
  ADMIN_WEB_AUTH: 'admin_web_auth',
  GIVEAWAY_ACCESS: 'giveaway_access',
  LEGACY: 'legacy',
});

export const CALLBACK_ROUTE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: CALLBACK_ROUTE.ADMIN_WEB_AUTH,
    phase: CALLBACK_PHASE.PRE_USER,
    actions: Object.freeze(['a:aw_auth_dec']),
  }),
  Object.freeze({
    id: CALLBACK_ROUTE.GIVEAWAY_ACCESS,
    phase: CALLBACK_PHASE.POST_USER,
    actions: Object.freeze([
      'a:gw_access',
      'a:gw_access_recheck',
      'a:gw_access_checkme',
      'a:gw_access_user_prompt',
    ]),
  }),
]);

function assertRouteDefinition(definition) {
  const id = String(definition?.id || '').trim();
  const phase = String(definition?.phase || '').trim();
  const actions = Array.isArray(definition?.actions) ? definition.actions : [];

  if (!id || id === CALLBACK_ROUTE.LEGACY) {
    throw new Error(`callback_route.invalid_id:${id || 'missing'}`);
  }
  if (phase !== CALLBACK_PHASE.PRE_USER && phase !== CALLBACK_PHASE.POST_USER) {
    throw new Error(`callback_route.invalid_phase:${id}:${phase || 'missing'}`);
  }
  if (actions.length === 0) {
    throw new Error(`callback_route.empty_actions:${id}`);
  }
}

/**
 * Builds an exact action ownership table.
 *
 * Every action in ACTION_REGISTRY receives one owner. Actions not extracted yet
 * remain explicitly owned by the legacy post-user dispatcher. Duplicate or
 * unknown extracted actions are hard failures at module initialization / QA.
 */
export function buildCallbackOwnership({
  actionRegistry = ACTION_REGISTRY,
  routeDefinitions = CALLBACK_ROUTE_DEFINITIONS,
} = {}) {
  const registryKeys = Object.keys(actionRegistry || {}).sort();
  const ownership = new Map(
    registryKeys.map((action) => [
      action,
      Object.freeze({
        action,
        routeId: CALLBACK_ROUTE.LEGACY,
        phase: CALLBACK_PHASE.POST_USER,
        extracted: false,
      }),
    ])
  );

  const routeIds = new Set();
  const extractedActions = new Set();

  for (const definition of routeDefinitions || []) {
    assertRouteDefinition(definition);
    const routeId = String(definition.id);
    if (routeIds.has(routeId)) {
      throw new Error(`callback_route.duplicate_route_id:${routeId}`);
    }
    routeIds.add(routeId);

    for (const rawAction of definition.actions) {
      const action = String(rawAction || '').trim();
      if (!Object.prototype.hasOwnProperty.call(actionRegistry || {}, action)) {
        throw new Error(`callback_route.unknown_action:${routeId}:${action || 'missing'}`);
      }
      if (extractedActions.has(action)) {
        throw new Error(`callback_route.duplicate_action_owner:${action}`);
      }
      extractedActions.add(action);
      ownership.set(
        action,
        Object.freeze({
          action,
          routeId,
          phase: definition.phase,
          extracted: true,
        })
      );
    }
  }

  if (ownership.size !== registryKeys.length) {
    throw new Error(
      `callback_route.ownership_size_mismatch:${ownership.size}:${registryKeys.length}`
    );
  }

  return Object.freeze(Object.fromEntries(ownership));
}

export const CALLBACK_OWNERSHIP = buildCallbackOwnership();

export function getCallbackOwnership(action) {
  const key = String(action || '').trim();
  return CALLBACK_OWNERSHIP[key] || null;
}

export function summarizeCallbackOwnership() {
  const values = Object.values(CALLBACK_OWNERSHIP);
  const extracted = values.filter((entry) => entry.extracted);
  const byRoute = {};
  for (const entry of values) {
    byRoute[entry.routeId] = Number(byRoute[entry.routeId] || 0) + 1;
  }
  return Object.freeze({
    total: values.length,
    extracted: extracted.length,
    legacy: values.length - extracted.length,
    byRoute: Object.freeze({ ...byRoute }),
  });
}
