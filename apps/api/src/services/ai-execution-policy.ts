import type { AiExecutionMode } from '@dev-dashboard/contracts';

export interface AiExecutionPolicy {
  maxToolRounds: number;
  maxToolResultChars: number;
  maxAccumulatedToolResultChars: number;
  maxIdenticalToolCalls: number;
  maxDiffChars: number;
  maxContextFiles: number;
  runGlobalSynthesis: boolean;
}

export const DEFAULT_AI_EXECUTION_MODE: AiExecutionMode = 'fast';

export const AI_EXECUTION_POLICIES = {
  fast: {
    maxToolRounds: 4,
    maxToolResultChars: 8_000,
    maxAccumulatedToolResultChars: 32_000,
    maxIdenticalToolCalls: 2,
    maxDiffChars: 4_000,
    maxContextFiles: 4,
    runGlobalSynthesis: false,
  },
  complete: {
    maxToolRounds: 10,
    maxToolResultChars: 12_000,
    maxAccumulatedToolResultChars: 96_000,
    maxIdenticalToolCalls: 2,
    maxDiffChars: 12_000,
    maxContextFiles: 12,
    runGlobalSynthesis: true,
  },
} as const satisfies Record<AiExecutionMode, AiExecutionPolicy>;

export function aiExecutionPolicy(
  mode: AiExecutionMode = DEFAULT_AI_EXECUTION_MODE,
): AiExecutionPolicy {
  return AI_EXECUTION_POLICIES[mode];
}
