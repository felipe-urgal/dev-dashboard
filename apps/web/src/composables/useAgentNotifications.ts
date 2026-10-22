import { ref } from 'vue';

import type { AgentRealtimeSnapshot } from '../api/agent-runtime';
import {
  agentNotificationCandidates,
  hasSeenAgentNotification,
  markAgentNotificationSeen,
  readAgentNotificationPreferences,
  writeAgentNotificationPreferences,
  type AgentNotificationKind,
} from '../stores/agent-notifications';
import { noticeCenterStore } from '../stores/notice-center';

/**
 * Notification state remains local to the cockpit. The current project is
 * read when publishing so delayed snapshots cannot cross project boundaries.
 */
export function useAgentNotifications(
  project: () => { id: string; name: string },
) {
  const agentNotificationPreferences = ref(readAgentNotificationPreferences());

  function publishAgentNotifications(snapshot: AgentRealtimeSnapshot): void {
    const currentProject = project();
    if (snapshot.status.task.task.projectId !== currentProject.id) return;

    for (const candidate of agentNotificationCandidates(snapshot)) {
      if (
        !agentNotificationPreferences.value[candidate.kind] ||
        hasSeenAgentNotification(candidate.key)
      ) {
        continue;
      }

      noticeCenterStore.publishTerminalNotice({
        dedupeKey: candidate.key,
        origin: 'agent',
        outcome: candidate.outcome,
        projectId: currentProject.id,
        projectName: currentProject.name,
        label: candidate.label,
        routeTo: {
          name: 'project-agent',
          params: { projectId: currentProject.id },
          query: { taskId: snapshot.status.task.task.id },
        },
      });
      markAgentNotificationSeen(candidate.key);
    }
  }

  function toggleAgentNotificationGroup(
    kinds: AgentNotificationKind[],
    event: Event,
  ): void {
    const checked = (event.target as HTMLInputElement).checked;
    agentNotificationPreferences.value = {
      ...agentNotificationPreferences.value,
      ...Object.fromEntries(kinds.map((kind) => [kind, checked])),
    };
    writeAgentNotificationPreferences(agentNotificationPreferences.value);
  }

  return {
    agentNotificationPreferences,
    publishAgentNotifications,
    toggleAgentNotificationGroup,
  };
}
