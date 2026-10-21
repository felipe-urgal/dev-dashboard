import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
} from 'node:fs';

import type {
  ProjectServiceBinding,
  ServiceLifecyclePlan,
} from '@dev-dashboard/contracts';

import type {
  SystemdUserLifecycleAction,
  SystemdUserLifecycleRequest,
} from './systemd-user-lifecycle-service.js';

const MAX_POLICY_BYTES = 64 * 1024;
const MAX_GRANTS = 100;
const HASH = /^[a-f0-9]{64}$/;
const UNIT_REF = /^systemd:user:[A-Za-z0-9][A-Za-z0-9_.@:-]{0,190}\.service$/;
const ACTIONS: readonly SystemdUserLifecycleAction[] = [
  'start',
  'stop',
  'restart',
];

interface UserUnitGrant {
  projectId: string;
  environmentInstanceId: string;
  bindingId: string;
  serviceRef: string;
  bindingRevision: string;
  actions: SystemdUserLifecycleAction[];
  expiresAt: string;
}

function validGrant(value: unknown): value is UserUnitGrant {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const grant = value as Partial<UserUnitGrant>;
  return (
    Object.keys(grant).length === 7 &&
    typeof grant.projectId === 'string' &&
    grant.projectId.length > 0 &&
    grant.projectId.length <= 160 &&
    typeof grant.environmentInstanceId === 'string' &&
    grant.environmentInstanceId.length > 0 &&
    grant.environmentInstanceId.length <= 512 &&
    typeof grant.bindingId === 'string' &&
    /^[a-f0-9-]{36}$/.test(grant.bindingId) &&
    typeof grant.serviceRef === 'string' &&
    UNIT_REF.test(grant.serviceRef) &&
    !grant.serviceRef.includes('..') &&
    !grant.serviceRef.includes('@.service') &&
    !/^systemd:user:dev-dashboard(?:[.@-]|\.service)/i.test(grant.serviceRef) &&
    typeof grant.bindingRevision === 'string' &&
    HASH.test(grant.bindingRevision) &&
    Array.isArray(grant.actions) &&
    grant.actions.length > 0 &&
    grant.actions.length <= ACTIONS.length &&
    grant.actions.every((action) => ACTIONS.includes(action)) &&
    new Set(grant.actions).size === grant.actions.length &&
    typeof grant.expiresAt === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(grant.expiresAt) &&
    !Number.isNaN(Date.parse(grant.expiresAt))
  );
}

/**
 * Operator-owned, read-through local grant policy.
 * Absent, unreadable, symlinked, incorrectly owned or malformed files deny.
 * No HTTP write API: bindings and discovery must never create permissions.
 */
export class SystemdUserLifecycleGrantPolicy {
  private readonly now: () => Date;

  public constructor(
    private readonly options: { policyPath?: string; now?: () => Date } = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  public find(
    request: Readonly<SystemdUserLifecycleRequest>,
  ): Readonly<UserUnitGrant> | null {
    if (!this.options.policyPath) return null;
    let fd: number | undefined;
    try {
      // Refuse symlinks on Linux. The path is supplied by trusted server config.
      fd = openSync(
        this.options.policyPath,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      const stat = fstatSync(fd);
      if (
        !stat.isFile() ||
        stat.nlink !== 1 ||
        stat.size > MAX_POLICY_BYTES ||
        stat.size === 0 ||
        (stat.mode & 0o077) !== 0 ||
        typeof process.getuid !== 'function' ||
        stat.uid !== process.getuid()
      )
        return null;
      const value: unknown = JSON.parse(readFileSync(fd, 'utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
      const parsed = value as { version?: unknown; grants?: unknown };
      if (
        Object.keys(value).length !== 2 ||
        parsed.version !== 1 ||
        !Array.isArray(parsed.grants) ||
        parsed.grants.length > MAX_GRANTS ||
        !parsed.grants.every(validGrant)
      )
        return null;
      const identities = parsed.grants.map(
        (grant: UserUnitGrant) =>
          grant.projectId +
          '\0' +
          grant.environmentInstanceId +
          '\0' +
          grant.serviceRef,
      );
      if (new Set(identities).size !== identities.length) return null;
      const grant = parsed.grants.find(
        (item: UserUnitGrant) =>
          item.projectId === request.projectId &&
          item.environmentInstanceId === request.environmentInstanceId &&
          item.serviceRef === request.serviceRef &&
          item.actions.includes(request.action),
      ) as UserUnitGrant | undefined;
      if (!grant || Date.parse(grant.expiresAt) <= this.now().getTime())
        return null;
      return structuredClone(grant);
    } catch {
      return null;
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }
}

type BindingSnapshot = Pick<
  ProjectServiceBinding,
  | 'id'
  | 'projectId'
  | 'environmentInstanceId'
  | 'serviceRef'
  | 'relation'
  | 'requiredForStart'
  | 'enabled'
>;

type ConfirmablePlan = Omit<ServiceLifecyclePlan, 'executable'> & {
  executable: boolean;
};

interface Dependencies {
  policy: Pick<SystemdUserLifecycleGrantPolicy, 'find'>;
  projects: { findProject(id: string): { id: string } | null | undefined };
  environments: {
    findById(
      id: string,
    ): { projectId: string; runtime: { kind: string } } | null | undefined;
  };
  bindings: {
    revision(projectId: string): string;
    byProject(projectId: string): BindingSnapshot[];
    byResource(serviceRef: string): BindingSnapshot[];
  };
  planner: {
    preview(
      projectId: string,
      action: 'start' | 'stop',
      environmentInstanceId?: string,
      expectedPlanHash?: string,
    ): Promise<ConfirmablePlan>;
  };
}

/**
 * Safe adapter authorization boundary, not wired into the application.
 * The current planner deliberately returns executable=false, so these
 * grants alone can never activate a systemd mutation.
 */
export class SystemdUserLifecycleAuthorizer {
  public constructor(private readonly d: Dependencies) {}

  public async authorize(
    request: Readonly<SystemdUserLifecycleRequest>,
  ): Promise<boolean> {
    try {
      // Restart needs a dedicated restart plan; a Start plan is not authority.
      if (request.action === 'restart') return false;
      if (!HASH.test(request.expectedRevision) || !HASH.test(request.planHash))
        return false;
      const grant = this.d.policy.find(request);
      if (!grant || grant.bindingRevision !== request.expectedRevision)
        return false;
      if (!this.d.projects.findProject(request.projectId)) return false;
      const environment = this.d.environments.findById(
        request.environmentInstanceId,
      );
      if (
        environment?.projectId !== request.projectId ||
        environment.runtime.kind !== 'host'
      )
        return false;
      if (
        this.d.bindings.revision(request.projectId) !== request.expectedRevision
      )
        return false;
      const matches = this.d.bindings
        .byProject(request.projectId)
        .filter(
          (binding) =>
            binding.id === grant.bindingId &&
            binding.serviceRef === request.serviceRef &&
            binding.environmentInstanceId === request.environmentInstanceId &&
            binding.enabled &&
            binding.relation === 'required' &&
            binding.requiredForStart,
        );
      if (matches.length !== 1) return false;
      // Shared or stale consumers are unsafe even when their bindings are disabled.
      const consumers = this.d.bindings.byResource(request.serviceRef);
      if (consumers.length !== 1 || consumers[0]?.id !== grant.bindingId)
        return false;
      const plan = await this.d.planner.preview(
        request.projectId,
        request.action,
        request.environmentInstanceId,
        request.planHash,
      );
      if (
        plan.target.kind !== 'project-environment' ||
        plan.target.projectId !== request.projectId ||
        plan.target.environmentInstanceId !== request.environmentInstanceId ||
        plan.action !== request.action ||
        plan.planHash !== request.planHash ||
        plan.expectedRevision !== request.expectedRevision ||
        plan.status !== 'ready' ||
        plan.executable !== true
      )
        return false;
      const nodes = plan.nodes.filter(
        (node) => node.serviceRef === request.serviceRef,
      );
      return (
        nodes.length === 1 &&
        nodes[0]?.provider === 'systemd' &&
        nodes[0].relation === 'required' &&
        nodes[0].consumerCount === 1 &&
        nodes[0].disposition ===
          (request.action === 'start' ? 'willStart' : 'willStop')
      );
    } catch {
      // Changed plan, partial observations or failed storage => no mutation.
      return false;
    }
  }
}
