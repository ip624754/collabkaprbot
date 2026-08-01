import { ACTION_REGISTRY } from '../actionRegistry.js';
import { ADMIN_AUTH_CALLBACK_ROUTE_DEFINITIONS } from '../domains/adminAuth/route.js';
import { PAYMENT_CALLBACK_ROUTE_DEFINITIONS } from '../domains/payments/route.js';
import { GIVEAWAY_CALLBACK_ROUTE_DEFINITIONS } from '../domains/giveaways/route.js';
import { BROADCAST_CALLBACK_ROUTE_DEFINITIONS } from '../domains/broadcasts/route.js';
import { NAVIGATION_CALLBACK_ROUTE_DEFINITIONS } from '../shared/navigation/route.js';
import { TELEGRAM_UX_CALLBACK_ROUTE_DEFINITIONS } from '../shared/telegramUx/route.js';
import { APPLICATION_CALLBACK_ROUTE_DEFINITIONS } from '../domains/applications/route.js';
import { LEAD_CALLBACK_ROUTE_DEFINITIONS } from '../domains/leads/route.js';
import { BARTER_CALLBACK_ROUTE_DEFINITIONS } from '../domains/barter/route.js';
import { WORKSPACE_CALLBACK_ROUTE_DEFINITIONS } from '../domains/workspaces/route.js';
import { DIRECTORY_CALLBACK_ROUTE_DEFINITIONS } from '../domains/directory/route.js';
import { CALLBACK_PHASE, CALLBACK_ROUTE } from './callbackContracts.js';

export { CALLBACK_PHASE, CALLBACK_ROUTE } from './callbackContracts.js';

export const CALLBACK_ROUTE_DEFINITIONS = Object.freeze([
  ...ADMIN_AUTH_CALLBACK_ROUTE_DEFINITIONS,
  ...PAYMENT_CALLBACK_ROUTE_DEFINITIONS,
  ...GIVEAWAY_CALLBACK_ROUTE_DEFINITIONS,
  ...BROADCAST_CALLBACK_ROUTE_DEFINITIONS,
  ...NAVIGATION_CALLBACK_ROUTE_DEFINITIONS,
  ...TELEGRAM_UX_CALLBACK_ROUTE_DEFINITIONS,
  ...APPLICATION_CALLBACK_ROUTE_DEFINITIONS,
  ...LEAD_CALLBACK_ROUTE_DEFINITIONS,
  ...BARTER_CALLBACK_ROUTE_DEFINITIONS,
  ...WORKSPACE_CALLBACK_ROUTE_DEFINITIONS,
  ...DIRECTORY_CALLBACK_ROUTE_DEFINITIONS,
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
