import {
  CALLBACK_PHASE,
  CALLBACK_ROUTE,
  getCallbackOwnership,
} from './callbackOwnership.js';

export const CALLBACK_DISPATCH_STATUS = Object.freeze({
  HANDLED: 'handled',
  DEFERRED: 'deferred',
  UNKNOWN: 'unknown',
  ERROR: 'error',
});

function getHandler(ownership, { handlers, legacy }) {
  if (ownership.routeId === CALLBACK_ROUTE.LEGACY) return legacy;
  return handlers?.[ownership.routeId];
}

async function callHandler(handler, ctx, p, u) {
  if (typeof handler !== 'function') return undefined;
  return handler(ctx, p, u);
}

/**
 * Pure executable callback dispatcher.
 *
 * It does not render Telegram UX and does not import Grammy. The transport
 * facade decides how UNKNOWN / ERROR should be presented. This keeps ownership
 * and reachability directly testable without source-string assertions.
 */
export async function dispatchOwnedCallback({
  phase,
  ctx,
  p,
  u = null,
  handlers = {},
  legacy = null,
  final = false,
} = {}) {
  if (phase !== CALLBACK_PHASE.PRE_USER && phase !== CALLBACK_PHASE.POST_USER) {
    return {
      status: CALLBACK_DISPATCH_STATUS.ERROR,
      error: new Error(`callback_dispatch.invalid_phase:${String(phase || 'missing')}`),
    };
  }

  const action = String(p?.a || '').trim();
  const ownership = getCallbackOwnership(action);

  if (!ownership) {
    return {
      status: final ? CALLBACK_DISPATCH_STATUS.UNKNOWN : CALLBACK_DISPATCH_STATUS.DEFERRED,
      action,
      ownership: null,
    };
  }

  if (ownership.phase !== phase) {
    if (final) {
      return {
        status: CALLBACK_DISPATCH_STATUS.ERROR,
        action,
        ownership,
        error: new Error(
          `callback_dispatch.phase_not_reached:${action}:${ownership.phase}:${phase}`
        ),
      };
    }
    return {
      status: CALLBACK_DISPATCH_STATUS.DEFERRED,
      action,
      ownership,
    };
  }

  const handler = getHandler(ownership, { handlers, legacy });
  if (typeof handler !== 'function') {
    return {
      status: CALLBACK_DISPATCH_STATUS.ERROR,
      action,
      ownership,
      error: new Error(`callback_dispatch.missing_handler:${ownership.routeId}:${action}`),
    };
  }

  try {
    const value = await callHandler(handler, ctx, p, u);

    if (ownership.routeId === CALLBACK_ROUTE.LEGACY) {
      if (value === false) {
        return {
          status: CALLBACK_DISPATCH_STATUS.UNKNOWN,
          action,
          ownership,
        };
      }
      return {
        status: CALLBACK_DISPATCH_STATUS.HANDLED,
        action,
        ownership,
        value,
      };
    }

    if (value !== true) {
      return {
        status: CALLBACK_DISPATCH_STATUS.ERROR,
        action,
        ownership,
        error: new Error(
          `callback_dispatch.extracted_handler_contract:${ownership.routeId}:${action}:${String(value)}`
        ),
      };
    }

    return {
      status: CALLBACK_DISPATCH_STATUS.HANDLED,
      action,
      ownership,
      value,
    };
  } catch (error) {
    return {
      status: CALLBACK_DISPATCH_STATUS.ERROR,
      action,
      ownership,
      error,
    };
  }
}
