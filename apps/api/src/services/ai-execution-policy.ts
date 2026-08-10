import type { AiExecutionMode } from '@dev-dashboard/contracts';

export interface AiExecutionPolicy {
  readonly maxToolRounds: number;
  readonly maxToolResultChars: number;
  readonly maxAccumulatedToolResultChars: number;
  readonly maxIdenticalToolCalls: number;
  readonly maxDiffChars: number;
  readonly maxContextFiles: number;
  readonly maxGlobalSynthesisChars: number;
  readonly runGlobalSynthesis: boolean;
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
    maxGlobalSynthesisChars: 0,
    runGlobalSynthesis: false,
  },
  complete: {
    maxToolRounds: 10,
    maxToolResultChars: 12_000,
    maxAccumulatedToolResultChars: 96_000,
    maxIdenticalToolCalls: 2,
    maxDiffChars: 12_000,
    maxContextFiles: 12,
    maxGlobalSynthesisChars: 48_000,
    runGlobalSynthesis: true,
  },
} as const satisfies Record<AiExecutionMode, AiExecutionPolicy>;

export function aiExecutionPolicy(
  mode: AiExecutionMode = DEFAULT_AI_EXECUTION_MODE,
): AiExecutionPolicy {
  return AI_EXECUTION_POLICIES[mode];
}
