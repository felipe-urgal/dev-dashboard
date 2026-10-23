import { computed, ref } from 'vue';

import {
  fetchAgentAttachments,
  fetchAgentConversation,
  type AgentAttachment,
  type AgentConversationTurn,
} from '../api/agent-runtime';

interface TaskTarget {
  projectId: string;
  taskId: string;
}

type DetailSource = 'conversation' | 'attachments';

interface DetailClients {
  conversation: typeof fetchAgentConversation;
  attachments: typeof fetchAgentAttachments;
}

/**
 * Conversation and attachments are independent reads, not prerequisites for
 * canonical task status or its realtime socket. Each result is guarded against
 * navigation (including A → B → A) and concurrent local mutations.
 */
export function useAgentTaskDetailReads(
  currentTarget: () => TaskTarget | null,
  conversationRevision: () => number,
  attachmentsRevision: () => number,
  applyConversation: (
    turns: AgentConversationTurn[],
    target: TaskTarget,
    revision: number,
  ) => void,
  applyAttachments: (
    attachments: AgentAttachment[],
    target: TaskTarget,
    revision: number,
  ) => void,
  clients: DetailClients = {
    conversation: fetchAgentConversation,
    attachments: fetchAgentAttachments,
  },
) {
  const failedDetailSources = ref<DetailSource[]>([]);
  const detailWarning = computed(() => {
    if (failedDetailSources.value.length === 2) {
      return 'Conversa e anexos indisponíveis. O estado da task está acessível.';
    }
    if (failedDetailSources.value.includes('conversation')) {
      return 'Não foi possível carregar a conversa persistida da task.';
    }
    if (failedDetailSources.value.includes('attachments')) {
      return 'Não foi possível carregar os anexos da task.';
    }
    return '';
  });
  let version = 0;

  function resetTaskDetails(): void {
    version += 1;
    failedDetailSources.value = [];
  }

  function loadTaskDetails(): void {
    resetTaskDetails();
    const target = currentTarget();
    if (!target?.projectId || !target.taskId) return;

    const requestVersion = version;
    const expectedConversationRevision = conversationRevision();
    const expectedAttachmentsRevision = attachmentsRevision();
    const isCurrent = () => {
      const selected = currentTarget();
      return (
        version === requestVersion &&
        selected?.projectId === target.projectId &&
        selected.taskId === target.taskId
      );
    };
    const markFailure = (source: DetailSource) => {
      if (isCurrent() && !failedDetailSources.value.includes(source)) {
        failedDetailSources.value = [...failedDetailSources.value, source];
      }
    };

    void Promise.resolve()
      .then(() => clients.conversation(target.projectId, target.taskId))
      .then((turns) => {
        if (!isCurrent()) return;
        if (
          !Array.isArray(turns) ||
          !turns.every((turn) => turn?.taskId === target.taskId)
        ) {
          markFailure('conversation');
          return;
        }
        if (conversationRevision() === expectedConversationRevision) {
          applyConversation(turns, target, expectedConversationRevision);
        }
      })
      .catch(() => markFailure('conversation'));

    void Promise.resolve()
      .then(() => clients.attachments(target.projectId, target.taskId))
      .then((attachments) => {
        if (!isCurrent()) return;
        if (
          !Array.isArray(attachments) ||
          !attachments.every((item) => item?.taskId === target.taskId)
        ) {
          markFailure('attachments');
          return;
        }
        if (attachmentsRevision() === expectedAttachmentsRevision) {
          applyAttachments(attachments, target, expectedAttachmentsRevision);
        }
      })
      .catch(() => markFailure('attachments'));
  }

  return {
    failedDetailSources,
    detailWarning,
    resetTaskDetails,
    loadTaskDetails,
  };
}
