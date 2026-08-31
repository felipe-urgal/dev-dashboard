import type {
  Deployment,
  DeploymentLog,
  DeploymentPlanStep,
  DeploymentStatus,
  DeploymentStepStatus,
  ProductionCommandId,
  ProductionProvider,
} from '@dev-dashboard/contracts';

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
  return value === undefined || (typeof value === 'number' && Number.isInteger(value));
}

function isTimelineStep(value: unknown): boolean {
  const step = record(value);
  if (!step || typeof step.id !== 'string') return false;
  const expectedScript = COMMAND_SCRIPTS[step.id as ProductionCommandId];
  return (
    expectedScript !== undefined &&
    step.script === expectedScript &&
    typeof step.phase === 'string' &&
    PHASES.has(step.phase as DeploymentPlanStep['phase']) &&
    typeof step.mutating === 'boolean' &&
    typeof step.irreversible === 'boolean' &&
    typeof step.status === 'string' &&
    STEP_STATUSES.has(step.status as DeploymentStepStatus) &&
    optionalString(step.startedAt) &&
    optionalString(step.finishedAt) &&
    optionalInteger(step.exitCode)
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
        deployment.currentStepId in COMMAND_SCRIPTS)) &&
    (deployment.failurePoint === undefined ||
      deployment.failurePoint === 'before-irreversible' ||
      deployment.failurePoint === 'after-irreversible') &&
    optionalString(deployment.errorCode) &&
    optionalString(deployment.errorMessage) &&
    Array.isArray(deployment.timeline) &&
    deployment.timeline.every(isTimelineStep)
  );
}

export function isPersistedDeploymentLog(value: unknown): value is DeploymentLog {
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
