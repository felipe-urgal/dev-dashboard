import type {
  AgentAuthorization,
  AgentAuthorizationScope,
  AgentCapability,
} from './contracts.js';

export class AgentAuthorizationError extends Error {
  constructor(readonly capability: AgentCapability) {
    super(`Agent capability is not authorized: ${capability}`);
    this.name = 'AgentAuthorizationError';
  }
}

export class AgentAuthorizationScopeError extends Error {
  constructor(readonly capability: AgentCapability) {
    super(
      `Agent capability scope does not match requested resource: ${capability}`,
    );
    this.name = 'AgentAuthorizationScopeError';
  }
}

export function grantedAgentCapabilities(
  authorizations: readonly AgentAuthorization[],
): AgentCapability[] {
  const granted = new Set<AgentCapability>();

  for (const authorization of authorizations) {
    if (authorization.granted) {
      granted.add(authorization.capability);
    } else {
      granted.delete(authorization.capability);
    }
  }

  return [...granted];
}

export function grantedAgentAuthorizations(
  authorizations: readonly AgentAuthorization[],
): AgentAuthorization[] {
  const byCapability = new Map<AgentCapability, AgentAuthorization>();
  for (const authorization of authorizations) {
    if (authorization.granted) {
      byCapability.set(authorization.capability, authorization);
    } else {
      byCapability.delete(authorization.capability);
    }
  }
  return [...byCapability.values()];
}

export function sameAgentAuthorizationScope(
  left: AgentAuthorizationScope | undefined,
  right: AgentAuthorizationScope | undefined,
): boolean {
  if (!left || !right) return left === right;
  return JSON.stringify(left) === JSON.stringify(right);
}

export function assertAgentAuthorizationScope(
  authorization: AgentAuthorization,
  requiredScope: AgentAuthorizationScope,
): void {
  if (!authorization.granted) {
    throw new AgentAuthorizationError(authorization.capability);
  }
  if (
    !authorization.scope ||
    !sameAgentAuthorizationScope(authorization.scope, requiredScope)
  ) {
    throw new AgentAuthorizationScopeError(authorization.capability);
  }
}

export function assertAgentCapabilitiesAuthorized(
  required: readonly AgentCapability[],
  granted: readonly AgentCapability[],
): void {
  const allowed = new Set(granted);

  for (const capability of required) {
    if (!allowed.has(capability)) {
      throw new AgentAuthorizationError(capability);
    }
  }
}
