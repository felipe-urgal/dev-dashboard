import { watch } from 'vue';

/**
 * React to taskId route changes without remounting the project cockpit.
 * Initial selection remains owned by the project's first-page load.
 * Clearing the query does not discard a manually selected task.
 */
export function useAgentTaskDeepLink(
  routeTaskId: () => string | undefined,
  selectedTaskId: () => string,
  selectTask: (taskId: string) => Promise<void>,
): void {
  watch(routeTaskId, (next) => {
    if (!next || next === selectedTaskId()) return;
    void selectTask(next);
  });
}
