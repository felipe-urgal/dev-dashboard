import type {
  ProductionContractDraft,
  ProductionContractPreview,
  ProductionContractSetupInfo,
} from '@dev-dashboard/contracts';

import { requestJson } from './core';

function contractUrl(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/production/contract`;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function fetchProductionContractSetup(
  projectId: string,
): Promise<ProductionContractSetupInfo> {
  const response = await requestJson<{ setup: ProductionContractSetupInfo }>(
    `${contractUrl(projectId)}/setup`,
  );
  return response.setup;
}

export async function previewProductionContract(
  projectId: string,
  draft: ProductionContractDraft,
  signal?: AbortSignal,
): Promise<ProductionContractPreview> {
  const response = await requestJson<{ preview: ProductionContractPreview }>(
    `${contractUrl(projectId)}/preview`,
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(draft),
      ...(signal ? { signal } : {}),
    },
  );
  return response.preview;
}

/** Grava `.dev-dashboard/production.json`; sem `overwrite`, recusa se já existir. */
export async function saveProductionContract(
  projectId: string,
  draft: ProductionContractDraft,
  overwrite = false,
): Promise<ProductionContractPreview> {
  const response = await requestJson<{ preview: ProductionContractPreview }>(
    contractUrl(projectId),
    {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ draft, overwrite }),
    },
  );
  return response.preview;
}
