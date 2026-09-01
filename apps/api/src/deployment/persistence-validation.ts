import type {
  Deployment,
  DeploymentLog,
  DeploymentPlanStep,
  DeploymentProviderPlanStep,
  DeploymentStatus,
  DeploymentStepStatus,
  ProductionCommandId,
  ProductionProvider,
} from '@dev-dashboard/contracts';

type DeploymentProviderTarget = DeploymentProviderPlanStep['target'];

const COMMAND_SCRIPTS = {
  status: 'prod:status',
  check: 'prod:check',
  backup: 'prod:backup',
  migrate: 'prod:migrate',
  deploy: 'prod:deploy',
  verify: 'prod:verify',
  restoreCheck: 'prod:restore-check',
  rollback: 'prod:rollback',
  logs: 'prod:logs',
} as const satisfies Record<ProductionCommandId, string>;

const PHASES = new Set<DeploymentPlanStep['phase']>([
  'preparing',
  'backing_up',
  'migrating',
  'deploying',
  'verifying',
]);
const STATUSES = new Set<DeploymentStatus>([
  'planned',
  'preparing',
  'backing_up',
  'migrating',
  'deploying',
  'verifying',
  'succeeded',
  'failed',
  'recovery_required',
  'cancelled',
]);
const STEP_STATUSES = new Set<DeploymentStepStatus>([
  'pending',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);
const PROVIDERS = new Set<ProductionProvider>([
  'systemd',
  'docker-compose',
  'vercel',
  'none',
]);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function optionalInteger(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === 'number' && Number.isInteger(value))
  );
}

function isProviderTarget(value: unknown): value is DeploymentProviderTarget {
  const target = record(value);
  return Boolean(
    target &&
    typeof target.externalProject === 'string' &&
    target.externalProject.trim().length > 0 &&
    typeof target.branch === 'string' &&
    target.branch.trim().length > 0 &&
    typeof target.revision === 'string' &&
    /^[0-9a-f]{40}$/i.test(target.revision),
  );
}

function isTimelineStep(value: unknown): boolean {
  const step = record(value);
  if (!step || typeof step.id !== 'string') return false;

  const commonValid =
    typeof step.phase === 'string' &&
    PHASES.has(step.phase as DeploymentPlanStep['phase']) &&
    typeof step.mutating === 'boolean' &&
    typeof step.irreversible === 'boolean' &&
    typeof step.status === 'string' &&
    STEP_STATUSES.has(step.status as DeploymentStepStatus) &&
    optionalString(step.startedAt) &&
    optionalString(step.finishedAt) &&
    optionalInteger(step.exitCode);
  if (!commonValid) return false;

  if (step.id === 'provider-deploy') {
    return (
      step.phase === 'deploying' &&
      step.mutating === true &&
      step.irreversible === true &&
      step.script === undefined &&
      isProviderTarget(step.target)
    );
  }

  const expectedScript = COMMAND_SCRIPTS[step.id as ProductionCommandId];
  if (expectedScript === undefined || step.script !== expectedScript)
    return false;
  return (
    step.target === undefined &&
    (step.providerPreflight === undefined ||
      isProviderTarget(step.providerPreflight))
  );
}

export function isPersistedDeployment(value: unknown): value is Deployment {
  const deployment = record(value);
  if (!deployment) return false;
  return (
    typeof deployment.id === 'string' &&
    deployment.id.length > 0 &&
    typeof deployment.projectId === 'string' &&
    deployment.projectId.length > 0 &&
    typeof deployment.projectName === 'string' &&
    typeof deployment.provider === 'string' &&
    PROVIDERS.has(deployment.provider as ProductionProvider) &&
    typeof deployment.branch === 'string' &&
    /^[0-9a-f]{40}$/i.test(String(deployment.revision ?? '')) &&
    /^[0-9a-f]{64}$/.test(String(deployment.planHash ?? '')) &&
    typeof deployment.status === 'string' &&
    STATUSES.has(deployment.status as DeploymentStatus) &&
    typeof deployment.createdAt === 'string' &&
    optionalString(deployment.startedAt) &&
    optionalString(deployment.finishedAt) &&
    (deployment.currentStepId === undefined ||
      (typeof deployment.currentStepId === 'string' &&
        (deployment.currentStepId === 'provider-deploy' ||
          deployment.currentStepId in COMMAND_SCRIPTS))) &&
    (deployment.failurePoint === undefined ||
      deployment.failurePoint === 'before-irreversible' ||
      deployment.failurePoint === 'after-irreversible') &&
    optionalString(deployment.errorCode) &&
    optionalString(deployment.errorMessage) &&
    Array.isArray(deployment.timeline) &&
    deployment.timeline.every(isTimelineStep)
  );
}

export function isPersistedDeploymentLog(
  value: unknown,
): value is DeploymentLog {
  const log = record(value);
  return Boolean(
    log &&
    typeof log.deploymentId === 'string' &&
    log.deploymentId.length > 0 &&
    typeof log.content === 'string' &&
    typeof log.truncated === 'boolean' &&
    typeof log.masked === 'boolean' &&
    typeof log.redactionCount === 'number' &&
    Number.isSafeInteger(log.redactionCount) &&
    log.redactionCount >= 0,
  );
}
