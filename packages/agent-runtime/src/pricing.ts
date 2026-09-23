import type { AgentConcreteProviderId, AgentUsage } from './contracts.js';

export interface AgentPricingRate {
  providerId: AgentConcreteProviderId;
  model: string;
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion?: number;
  outputUsdPerMillion: number;
  inputIncludesCached: boolean;
}

export interface AgentPricingCatalog {
  version: string;
  effectiveAt: string;
  rates: readonly AgentPricingRate[];
}

export const DEFAULT_AGENT_PRICING_CATALOG: AgentPricingCatalog = {
  version: '2026-09-23',
  effectiveAt: '2026-09-23T00:00:00.000Z',
  rates: [
    {
      providerId: 'codex',
      model: 'gpt-5.6-sol',
      inputUsdPerMillion: 4,
      cachedInputUsdPerMillion: 0.4,
      outputUsdPerMillion: 20,
      inputIncludesCached: true,
    },
    {
      providerId: 'codex',
      model: 'gpt-5.3-codex',
      inputUsdPerMillion: 1.75,
      cachedInputUsdPerMillion: 0.175,
      outputUsdPerMillion: 14,
      inputIncludesCached: true,
    },
    {
      providerId: 'claude-code',
      model: 'claude-sonnet-5',
      inputUsdPerMillion: 2,
      cachedInputUsdPerMillion: 0.2,
      outputUsdPerMillion: 10,
      inputIncludesCached: false,
    },
  ],
};

function safeTokenCount(value: number | undefined): number {
  return value ?? 0;
}

function dollars(tokens: number, ratePerMillion: number): number {
  return (tokens * ratePerMillion) / 1_000_000;
}

function normalizedAmount(value: number): number {
  return Number(value.toFixed(12));
}

export function estimateAgentUsageCost(
  usage: AgentUsage,
  catalog: AgentPricingCatalog = DEFAULT_AGENT_PRICING_CATALOG,
): AgentUsage['estimatedCost'] | undefined {
  if (!usage.model) return undefined;

  const rate = catalog.rates.find(
    (candidate) =>
      candidate.providerId === usage.providerId &&
      candidate.model === usage.model,
  );
  if (!rate) return undefined;

  if (usage.cacheWriteInputTokens !== undefined) {
    return undefined;
  }

  const inputTokens = safeTokenCount(usage.inputTokens);
  const cachedInputTokens = safeTokenCount(usage.cachedInputTokens);
  const outputTokens = safeTokenCount(usage.outputTokens);

  if (
    usage.inputTokens === undefined &&
    usage.cachedInputTokens === undefined &&
    usage.outputTokens === undefined
  ) {
    return undefined;
  }

  if (cachedInputTokens > 0 && rate.cachedInputUsdPerMillion === undefined) {
    return undefined;
  }

  const billableInputTokens = rate.inputIncludesCached
    ? Math.max(0, inputTokens - cachedInputTokens)
    : inputTokens;

  const amount =
    dollars(billableInputTokens, rate.inputUsdPerMillion) +
    dollars(cachedInputTokens, rate.cachedInputUsdPerMillion ?? 0) +
    dollars(outputTokens, rate.outputUsdPerMillion);

  return {
    amount: normalizedAmount(amount),
    currency: 'USD',
    pricingVersion: catalog.version,
  };
}

export function withEstimatedAgentUsageCost(
  usage: AgentUsage,
  catalog: AgentPricingCatalog = DEFAULT_AGENT_PRICING_CATALOG,
): AgentUsage {
  if (usage.reportedCost) return usage;

  const estimatedCost = estimateAgentUsageCost(usage, catalog);
  if (!estimatedCost) return usage;

  return {
    ...usage,
    source: usage.source === 'estimated' ? 'estimated' : 'mixed',
    estimatedCost,
  };
}
