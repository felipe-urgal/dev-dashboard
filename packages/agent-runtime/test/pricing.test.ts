import assert from 'node:assert/strict';
import test from 'node:test';

import {
  estimateAgentUsageCost,
  withEstimatedAgentUsageCost,
  type AgentPricingCatalog,
} from '../src/index.js';

test('estimates Codex cost from exact model and versioned pricing', () => {
  const estimate = estimateAgentUsageCost({
    providerId: 'codex',
    source: 'provider',
    model: 'gpt-5.3-codex',
    inputTokens: 10_000,
    cachedInputTokens: 2_000,
    outputTokens: 1_000,
  });

  assert.deepEqual(estimate, {
    amount: 0.02835,
    currency: 'USD',
    pricingVersion: '2026-09-23',
  });
});

test('does not estimate when model or cache-write pricing is unknown', () => {
  assert.equal(
    estimateAgentUsageCost({
      providerId: 'codex',
      source: 'provider',
      model: 'unknown-model',
      inputTokens: 100,
      outputTokens: 50,
    }),
    undefined,
  );

  assert.equal(
    estimateAgentUsageCost({
      providerId: 'claude-code',
      source: 'provider',
      model: 'claude-sonnet-5',
      inputTokens: 100,
      cacheWriteInputTokens: 10,
      outputTokens: 50,
    }),
    undefined,
  );
});

test('reported cost wins over estimation', () => {
  const usage = {
    providerId: 'claude-code' as const,
    source: 'provider' as const,
    model: 'claude-sonnet-5',
    inputTokens: 1_000,
    outputTokens: 500,
    reportedCost: { amount: 0.02, currency: 'USD' as const },
  };

  assert.deepEqual(withEstimatedAgentUsageCost(usage), usage);
});

test('pricing table version changes are explicit and deterministic', () => {
  const usage = {
    providerId: 'codex' as const,
    source: 'provider' as const,
    model: 'gpt-test',
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
  };
  const v1: AgentPricingCatalog = {
    version: 'v1',
    effectiveAt: '2026-01-01T00:00:00.000Z',
    rates: [
      {
        providerId: 'codex',
        model: 'gpt-test',
        inputUsdPerMillion: 1,
        outputUsdPerMillion: 2,
        inputIncludesCached: true,
      },
    ],
  };
  const v2: AgentPricingCatalog = {
    ...v1,
    version: 'v2',
    rates: [
      {
        ...v1.rates[0]!,
        outputUsdPerMillion: 3,
      },
    ],
  };

  assert.deepEqual(estimateAgentUsageCost(usage, v1), {
    amount: 3,
    currency: 'USD',
    pricingVersion: 'v1',
  });
  assert.deepEqual(estimateAgentUsageCost(usage, v2), {
    amount: 4,
    currency: 'USD',
    pricingVersion: 'v2',
  });
});
