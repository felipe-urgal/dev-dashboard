import type {
  DeclaredProjectPort,
  ObservedPort,
  PortAllocationRequest,
  PortAllocationResult,
  PortReconciliation,
  PortReconciliationEntry,
  PortReconciliationState,
  ReservedPort,
} from '@dev-dashboard/contracts';

const MIN_ALLOCATABLE_PORT = 1_024;
const MAX_PORT = 65_535;
const DEFAULT_ALLOCATION_WINDOW = 100;

export interface ReconcilePortsInput {
  reserved?: readonly ReservedPort[];
  declared?: readonly DeclaredProjectPort[];
  observed?: readonly ObservedPort[];
}

function validPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= MAX_PORT;
}

function groupByPort<T extends { port: number }>(items: readonly T[]): Map<number, T[]> {
  const grouped = new Map<number, T[]>();
  for (const item of items) {
    if (!validPort(item.port)) continue;
    const current = grouped.get(item.port) ?? [];
    current.push(item);
    grouped.set(item.port, current);
  }
  return grouped;
}

function declarationIdentity(declaration: DeclaredProjectPort): string {
  return `${declaration.projectId}:${declaration.role}`;
}

function chooseState(
  reserved: readonly ReservedPort[],
  declared: readonly DeclaredProjectPort[],
  observed: readonly ObservedPort[],
): { state: PortReconciliationState; explanation: string } {
  const activeDeclarations = declared.filter((item) => item.active !== false);
  const distinctDeclarations = new Set(activeDeclarations.map(declarationIdentity));

  if (distinctDeclarations.size > 1) {
    return {
      state: 'duplicate-declaration',
      explanation: 'Mais de um projeto/role declara a mesma porta no host local.',
    };
  }

  if (activeDeclarations.length > 0) {
    const declaredOwners = new Set(activeDeclarations.map((item) => item.projectId));
    const reservedByOther = reserved.some(
      (reservation) => !reservation.owner || !declaredOwners.has(reservation.owner),
    );
    if (reservedByOther) {
      return {
        state: 'reserved-by-other',
        explanation: 'A porta está reservada para outro owner ou para infraestrutura.',
      };
    }
  }

  if (declared.length > 0 && activeDeclarations.length === 0) {
    return {
      state: 'stale-declaration',
      explanation: 'A declaração perdeu a capability/configuração que a sustentava.',
    };
  }

  if (observed.length === 0) {
    return {
      state: 'available',
      explanation:
        activeDeclarations.length > 0
          ? 'A porta está declarada e livre.'
          : 'A porta reservada está livre.',
    };
  }

  if (activeDeclarations.length > 0) {
    const declaredOwners = new Set(activeDeclarations.map((item) => item.projectId));
    const allExpected = observed.every(
      (item) => item.owner.kind === 'project' && declaredOwners.has(item.owner.projectId),
    );
    if (allExpected) {
      return {
        state: 'expected',
        explanation: 'A porta está ocupada pelo projeto que a declarou.',
      };
    }
    return {
      state: 'conflict',
      explanation: 'A porta declarada está ocupada por outro owner.',
    };
  }

  if (observed.some((item) => item.owner.kind === 'project')) {
    return {
      state: 'unexpected',
      explanation: 'Um projeto usa a porta sem declaração correspondente.',
    };
  }

  return {
    state: 'unknown-owner',
    explanation: 'A porta está ocupada sem associação segura a um projeto.',
  };
}

export function reconcilePorts(input: ReconcilePortsInput = {}): PortReconciliation {
  const reservedByPort = groupByPort(input.reserved ?? []);
  const declaredByPort = groupByPort(input.declared ?? []);
  const observedByPort = groupByPort(input.observed ?? []);
  const ports = new Set<number>([
    ...reservedByPort.keys(),
    ...declaredByPort.keys(),
    ...observedByPort.keys(),
  ]);

  const entries: PortReconciliationEntry[] = [...ports]
    .sort((left, right) => left - right)
    .map((port) => {
      const reserved = reservedByPort.get(port) ?? [];
      const declared = declaredByPort.get(port) ?? [];
      const observed = observedByPort.get(port) ?? [];
      const result = chooseState(reserved, declared, observed);
      return {
        port,
        state: result.state,
        reserved: [...reserved],
        declared: [...declared],
        observed: [...observed],
        explanation: result.explanation,
      };
    });

  return { entries };
}

export function allocatePort(
  input: ReconcilePortsInput,
  request: PortAllocationRequest,
): PortAllocationResult | null {
  const preferredPort = Math.max(
    MIN_ALLOCATABLE_PORT,
    Math.trunc(request.preferredPort),
  );
  if (!validPort(preferredPort)) return null;

  const requestedMax = request.maxPort ?? preferredPort + DEFAULT_ALLOCATION_WINDOW;
  const maxPort = Math.min(
    MAX_PORT,
    Math.max(preferredPort, Math.trunc(requestedMax)),
  );
  const observedPorts = new Set(
    (input.observed ?? [])
      .filter((item) => validPort(item.port))
      .map((item) => item.port),
  );

  for (let port = preferredPort; port <= maxPort; port += 1) {
    if (observedPorts.has(port)) continue;

    const reservedByOther = (input.reserved ?? []).some((item) => {
      if (item.port !== port) return false;
      if (!request.projectId || !item.owner || item.owner !== request.projectId) {
        return true;
      }
      return item.role !== undefined && item.role !== request.role;
    });
    if (reservedByOther) continue;

    const declaredByOther = (input.declared ?? []).some((item) => {
      if (item.port !== port || item.active === false) return false;
      return !(
        request.projectId !== undefined &&
        request.role !== undefined &&
        item.projectId === request.projectId &&
        item.role === request.role
      );
    });
    if (declaredByOther) continue;

    return {
      port,
      explanation:
        port === preferredPort
          ? `A porta preferida ${port} está disponível para alocação.`
          : `A porta ${port} foi escolhida por ser a primeira livre após ${preferredPort}, sem colidir com reserved/declared/observed.`,
    };
  }

  return null;
}
