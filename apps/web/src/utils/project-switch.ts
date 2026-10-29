import type { Project } from '@dev-dashboard/contracts';

import {
  PROJECT_TOOLS,
  buildProjectToolRoute,
  isProjectGitTabId,
  type ProjectToolRoute,
} from '../project-tools';

/**
 * Para onde ir ao trocar de projeto: a mesma ferramenta, quando o novo projeto
 * a oferece (mantendo a aba do Git); senão Servidor, Git ou Terminal. O ambiente
 * (environmentInstanceId) e a tarefa do agente pertencem ao projeto anterior e
 * nunca são levados junto.
 */
export function resolveProjectSwitchTarget(
  current: { routeName: string; query: Record<string, unknown> },
  target: Project,
): ProjectToolRoute | { name: 'dashboard' } {
  const sameTool = PROJECT_TOOLS.find(
    (tool) =>
      (tool.routeName === current.routeName ||
        tool.activeRouteNames?.includes(current.routeName)) &&
      // Sidekiq e Webpack dependem de detecção por projeto.
      !tool.requiresDetection &&
      tool.isAvailable(target),
  );

  const fallback = ['server', 'git', 'terminal']
    .map((id) => PROJECT_TOOLS.find((tool) => tool.id === id))
    .find((tool) => tool?.isAvailable(target));

  const tool = sameTool ?? fallback;
  if (!tool) return { name: 'dashboard' };

  const tab = Array.isArray(current.query.tab)
    ? current.query.tab[0]
    : current.query.tab;
  const keepsTab = sameTool?.id === 'git' && isProjectGitTabId(tab);

  return buildProjectToolRoute(
    tool,
    target.id,
    undefined,
    keepsTab ? { tab } : undefined,
  );
}
