import type { AgentAuthorization, AgentCapability } from './contracts.js';

export class AgentAuthorizationError extends Error {
  constructor(readonly capability: AgentCapability) {
    super(`Agent capability is not authorized: ${capability}`);
    this.name = 'AgentAuthorizationError';
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
