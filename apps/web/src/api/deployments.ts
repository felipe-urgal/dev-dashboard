import type {
  Deployment,
  DeploymentConfirmation,
  DeploymentHistory,
  DeploymentLog,
  DeploymentPlan,
  ProductionDeploymentStatus,
} from '@dev-dashboard/contracts';

import { requestJson } from './core';

export interface DeploymentSudoStatus {
  available: boolean;
  authorized: boolean;
}

function projectDeploymentsUrl(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/deployments`;
}

function requestInit(
  method: 'GET' | 'POST',
  signal?: AbortSignal,
  body?: unknown,
): RequestInit {
  return {
    method,
    ...(signal ? { signal } : {}),
    ...(body === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  };
}

export async function fetchProductionDeploymentStatus(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProductionDeploymentStatus> {
  const response = await requestJson<{ status: ProductionDeploymentStatus }>(
    `${projectDeploymentsUrl(projectId)}/status`,
    requestInit('GET', signal),
  );
  return response.status;
}

export async function fetchDeploymentSudoStatus(
  projectId: string,
  signal?: AbortSignal,
): Promise<DeploymentSudoStatus> {
  const response = await requestJson<{ sudo: DeploymentSudoStatus }>(
    `${projectDeploymentsUrl(projectId)}/sudo`,
    requestInit('GET', signal),
  );
  return response.sudo;
}

export async function authorizeDeploymentSudo(
  projectId: string,
  password: string,
  signal?: AbortSignal,
): Promise<DeploymentSudoStatus> {
  const response = await requestJson<{ sudo: DeploymentSudoStatus }>(
    `${projectDeploymentsUrl(projectId)}/sudo`,
    requestInit('POST', signal, { password }),
  );
  return response.sudo;
}

export async function fetchDeploymentPlan(
  projectId: string,
  signal?: AbortSignal,
): Promise<DeploymentPlan> {
  const response = await requestJson<{ plan: DeploymentPlan }>(
    `${projectDeploymentsUrl(projectId)}/plan`,
    requestInit('POST', signal),
  );
  return response.plan;
}

export async function createDeploymentConfirmation(
  projectId: string,
  planHash: string,
  signal?: AbortSignal,
): Promise<DeploymentConfirmation> {
  const response = await requestJson<{ confirmation: DeploymentConfirmation }>(
    `${projectDeploymentsUrl(projectId)}/confirmations`,
    requestInit('POST', signal, { planHash }),
  );
  return response.confirmation;
}

export async function startDeployment(
  projectId: string,
  planHash: string,
  confirmationToken: string,
  signal?: AbortSignal,
): Promise<Deployment> {
  const response = await requestJson<{ deployment: Deployment }>(
    projectDeploymentsUrl(projectId),
    requestInit('POST', signal, { planHash, confirmationToken }),
  );
  return response.deployment;
}

export async function fetchDeploymentHistory(
  projectId: string,
  options: {
    page?: number;
    pageSize?: number;
    signal?: AbortSignal | undefined;
  } = {},
): Promise<DeploymentHistory> {
  const query = new URLSearchParams();
  if (options.page) query.set('page', String(options.page));
  if (options.pageSize) query.set('pageSize', String(options.pageSize));
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  const response = await requestJson<{ history: DeploymentHistory }>(
    `${projectDeploymentsUrl(projectId)}${suffix}`,
    requestInit('GET', options.signal),
  );
  return response.history;
}

export async function fetchDeployment(
  projectId: string,
  deploymentId: string,
  signal?: AbortSignal,
): Promise<Deployment> {
  const response = await requestJson<{ deployment: Deployment }>(
    `${projectDeploymentsUrl(projectId)}/${encodeURIComponent(deploymentId)}`,
    requestInit('GET', signal),
  );
  return response.deployment;
}

export async function fetchDeploymentLog(
  projectId: string,
  deploymentId: string,
  signal?: AbortSignal,
): Promise<DeploymentLog> {
  const response = await requestJson<{ log: DeploymentLog }>(
    `${projectDeploymentsUrl(projectId)}/${encodeURIComponent(deploymentId)}/log`,
    requestInit('GET', signal),
  );
  return response.log;
}

export async function cancelDeployment(
  projectId: string,
  deploymentId: string,
  signal?: AbortSignal,
): Promise<Deployment> {
  const response = await requestJson<{ deployment: Deployment }>(
    `${projectDeploymentsUrl(projectId)}/${encodeURIComponent(deploymentId)}/cancel`,
    requestInit('POST', signal),
  );
  return response.deployment;
}
