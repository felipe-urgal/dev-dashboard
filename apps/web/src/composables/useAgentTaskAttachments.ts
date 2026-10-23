import { ref } from 'vue';

import {
  createAgentAttachment,
  type AgentAttachment,
} from '../api/agent-runtime';

interface AttachmentTarget {
  projectId: string;
  taskId: string;
}

interface AttachmentClient {
  create: typeof createAgentAttachment;
  readBase64: (file: File) => Promise<string>;
}

function attachmentMediaType(file: File): AgentAttachment['mediaType'] | null {
  const type = file.type || (file.name.endsWith('.md') ? 'text/markdown' : '');
  if (
    type === 'text/plain' ||
    type === 'text/markdown' ||
    type === 'application/json' ||
    type === 'image/png' ||
    type === 'image/jpeg' ||
    type === 'image/webp'
  ) {
    return type;
  }
  return null;
}

async function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o anexo.'));
    reader.onload = () => {
      const value = String(reader.result ?? '');
      const separator = value.indexOf(',');
      if (separator < 0) {
        reject(new Error('Conteúdo do anexo inválido.'));
        return;
      }
      resolve(value.slice(separator + 1));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Owns the selected task's bounded attachments. Changing the project/task
 * invalidates local results, errors and remaining files in an in-flight batch.
 * An already submitted upload cannot be undone; it remains scoped to the
 * originally captured project/task, never the subsequently selected one.
 */
export function useAgentTaskAttachments(
  currentTarget: () => AttachmentTarget | null,
  reportError: (message: string) => void,
  clearError: () => void,
  client: AttachmentClient = {
    create: createAgentAttachment,
    readBase64: fileBase64,
  },
) {
  const attachments = ref<AgentAttachment[]>([]);
  const selectedAttachmentIds = ref<string[]>([]);
  const uploadingAttachment = ref(false);
  let generation = 0;
  // Invalidates GET snapshots started before an upload or a task switch.
  const attachmentsRevision = (): number => generation;

  function resetAttachments(): void {
    generation += 1;
    attachments.value = [];
    selectedAttachmentIds.value = [];
    uploadingAttachment.value = false;
  }

  function applyLoadedAttachments(
    loaded: AgentAttachment[],
    projectId: string,
    taskId: string,
  ): void {
    const current = currentTarget();
    if (current?.projectId !== projectId || current.taskId !== taskId) return;
    attachments.value = loaded;
    selectedAttachmentIds.value = selectedAttachmentIds.value.filter((id) =>
      loaded.some((attachment) => attachment.id === id),
    );
  }

  function attachmentFor(id: string): AgentAttachment | undefined {
    return attachments.value.find((attachment) => attachment.id === id);
  }

  async function addAttachments(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    const target = currentTarget();
    if (!target || files.length === 0 || uploadingAttachment.value) return;

    const requestGeneration = ++generation;
    const isCurrent = () => {
      const current = currentTarget();
      return (
        requestGeneration === generation &&
        current?.projectId === target.projectId &&
        current.taskId === target.taskId
      );
    };
    uploadingAttachment.value = true;
    clearError();
    try {
      for (const file of files) {
        if (!isCurrent()) return;
        if (attachments.value.length >= 8) {
          throw new Error('A task aceita no máximo 8 anexos.');
        }
        if (file.size > 1024 * 1024) {
          throw new Error('Cada anexo pode ter no máximo 1 MB.');
        }
        const mediaType = attachmentMediaType(file);
        if (!mediaType) {
          throw new Error('Tipo de anexo não suportado.');
        }
        const contentBase64 = await client.readBase64(file);
        if (!isCurrent()) return;
        const attachment = await client.create(
          target.projectId,
          target.taskId,
          { filename: file.name, mediaType, contentBase64 },
        );
        if (!isCurrent()) return;
        if (!attachments.value.some((item) => item.id === attachment.id)) {
          attachments.value = [...attachments.value, attachment];
        }
        if (!selectedAttachmentIds.value.includes(attachment.id)) {
          selectedAttachmentIds.value = [
            ...selectedAttachmentIds.value,
            attachment.id,
          ];
        }
      }
    } catch (error) {
      if (isCurrent()) {
        reportError(
          error instanceof Error
            ? error.message
            : 'Não foi possível anexar o arquivo.',
        );
      }
    } finally {
      if (isCurrent()) uploadingAttachment.value = false;
    }
  }

  return {
    attachments,
    selectedAttachmentIds,
    uploadingAttachment,
    resetAttachments,
    attachmentsRevision,
    applyLoadedAttachments,
    attachmentFor,
    addAttachments,
  };
}
