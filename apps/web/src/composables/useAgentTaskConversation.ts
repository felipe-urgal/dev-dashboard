import { ref } from 'vue';

import {
  executeAgentConversationTurn,
  type AgentConversationExecutionResult,
  type AgentConversationTurn,
  type AgentProviderId,
} from '../api/agent-runtime';

interface ConversationTarget {
  projectId: string;
  taskId: string;
}

interface ConversationInput {
  providerId: AgentProviderId;
  attachmentIds: string[];
  profileId?: string;
}

interface ConversationClient {
  execute: typeof executeAgentConversationTurn;
  createId: () => string;
}

/**
 * Owns conversation text, canonical turns, and a single in-flight submission.
 * A project/task switch invalidates async completions, even when the same task
 * is selected again (A → B → A). The backend remains the source of truth.
 */
export function useAgentTaskConversation(
  currentTarget: () => ConversationTarget | null,
  canSubmit: () => boolean,
  onExecution: (
    result: AgentConversationExecutionResult,
    target: ConversationTarget,
  ) => void,
  reloadTask: (target: ConversationTarget) => Promise<void>,
  reportError: (message: string) => void,
  clearError: () => void,
  client: ConversationClient = {
    execute: executeAgentConversationTurn,
    createId: () => globalThis.crypto.randomUUID(),
  },
) {
  const conversationInstruction = ref('');
  const conversationTurns = ref<AgentConversationTurn[]>([]);
  const conversationSending = ref(false);
  let generation = 0;
  let revision = 0;

  const conversationRevision = (): number => revision;

  function resetConversation(): void {
    generation += 1;
    revision += 1;
    conversationInstruction.value = '';
    conversationTurns.value = [];
    conversationSending.value = false;
  }

  function applyLoadedConversation(
    turns: AgentConversationTurn[],
    target: ConversationTarget,
    expectedRevision: number,
  ): void {
    const current = currentTarget();
    if (
      revision !== expectedRevision ||
      current?.projectId !== target.projectId ||
      current.taskId !== target.taskId
    )
      return;
    conversationTurns.value = turns;
  }

  async function continueCurrentConversation(
    input: ConversationInput,
  ): Promise<void> {
    const target = currentTarget();
    const content = conversationInstruction.value.trim();
    if (!target || !content || conversationSending.value || !canSubmit())
      return;

    const requestGeneration = ++generation;
    // Snapshots started before this submission cannot overwrite its turns.
    revision += 1;
    const currentRequest = () => {
      const current = currentTarget();
      return (
        requestGeneration === generation &&
        current?.projectId === target.projectId &&
        current.taskId === target.taskId
      );
    };
    conversationSending.value = true;
    clearError();

    // One ID per submission. No automatic replay when the response is ambiguous:
    // the runtime rejects duplicate IDs after a persisted user turn.
    const id = client.createId();
    try {
      const result = await client.execute(target.projectId, target.taskId, {
        id,
        content,
        providerId: input.providerId,
        ...(input.attachmentIds.length
          ? { attachmentIds: [...input.attachmentIds] }
          : {}),
        ...(input.profileId ? { profileId: input.profileId } : {}),
      });
      if (!currentRequest()) return;

      conversationInstruction.value = '';
      const existing = new Set(conversationTurns.value.map((turn) => turn.id));
      conversationTurns.value = [
        ...conversationTurns.value,
        ...[result.userTurn, result.agentTurn].filter((turn) => {
          if (existing.has(turn.id)) return false;
          existing.add(turn.id);
          return true;
        }),
      ];
      revision += 1;
      onExecution(result, target);
      if (currentRequest()) await reloadTask(target);
    } catch (error) {
      if (!currentRequest()) return;
      reportError(
        error instanceof Error
          ? error.message
          : 'Não foi possível continuar a conversa da task.',
      );
      await reloadTask(target);
      // An ambiguous API failure may have persisted the user turn.
      // Clear its draft rather than encouraging an accidental resubmission.
      if (
        currentRequest() &&
        conversationTurns.value.some((turn) => turn.id === id)
      ) {
        conversationInstruction.value = '';
      }
    } finally {
      if (currentRequest()) conversationSending.value = false;
    }
  }

  return {
    conversationInstruction,
    conversationTurns,
    conversationSending,
    conversationRevision,
    resetConversation,
    applyLoadedConversation,
    continueCurrentConversation,
  };
}
