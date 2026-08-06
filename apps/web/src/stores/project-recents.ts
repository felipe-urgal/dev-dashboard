import type { Project } from '@dev-dashboard/contracts';

import { recordProjectAccess } from '../api';
import { dashboardStore } from './dashboard';

let lastRecordedProjectId = '';

function replaceProject(updatedProject: Project): void {
  dashboardStore.projects.value = dashboardStore.projects.value.map(
    (project) => (project.id === updatedProject.id ? updatedProject : project),
  );

  dashboardStore.projectsByWorkspace.value = Object.fromEntries(
    Object.entries(dashboardStore.projectsByWorkspace.value).map(
      ([workspaceId, projects]) => [
        workspaceId,
        projects.map((project) =>
          project.id === updatedProject.id ? updatedProject : project,
        ),
      ],
    ),
  );
}

export async function recordProjectVisit(projectId: string): Promise<void> {
  if (!projectId || projectId === lastRecordedProjectId) return;
  lastRecordedProjectId = projectId;

  try {
    replaceProject(await recordProjectAccess(projectId));
  } catch {
    // O registro é complementar e nunca deve bloquear a navegação.
    if (lastRecordedProjectId === projectId) lastRecordedProjectId = '';
  }
}

export function resetProjectVisitDeduplication(): void {
  lastRecordedProjectId = '';
}
