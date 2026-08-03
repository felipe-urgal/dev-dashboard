import {
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Ref,
} from 'vue';

import type { ProjectFileContent } from '@dev-dashboard/contracts';

import { watchProjectFiles } from '../api';

export interface ProjectExternalFileConflict {
  path: string;
  baseContent: string;
  localContent: string;
  diskFile: ProjectFileContent;
}

interface ProjectOpenFileWatcherOptions {
  projectId: () => string;
  openFiles: Ref<ProjectFileContent[]>;
  dirtyPaths: Ref<Set<string>>;
  getLocalContent: (path: string) => string;
  replaceOpenFile: (file: ProjectFileContent) => void;
  replaceModelContent: (file: ProjectFileContent) => void;
  setDirty: (path: string, dirty: boolean) => void;
  onStatus: (message: string) => void;
  onError: (message: string) => void;
}

const WATCH_INTERVAL_MS = 2_500;

export function useProjectOpenFileWatcher(
  options: ProjectOpenFileWatcherOptions,
) {
  const conflicts = ref(new Map<string, ProjectExternalFileConflict>());
  const checking = ref(false);
  let timer: number | undefined;
  let generation = 0;

  function replaceConflicts(
    update: (next: Map<string, ProjectExternalFileConflict>) => void,
  ): void {
    const next = new Map(conflicts.value);
    update(next);
    conflicts.value = next;
  }

  function removeConflict(path: string): void {
    replaceConflicts((next) => next.delete(path));
  }

  function registerConflict(
    opened: ProjectFileContent,
    diskFile: ProjectFileContent,
  ): void {
    const localContent = options.getLocalContent(opened.path);
    replaceConflicts((next) => {
      next.set(opened.path, {
        path: opened.path,
        baseContent: opened.content,
        localContent,
        diskFile,
      });
    });
  }

  async function checkNow(): Promise<void> {
    if (
      checking.value
      || typeof document === 'undefined'
      || document.hidden
      || options.openFiles.value.length === 0
    ) return;

    checking.value = true;
    const requestGeneration = ++generation;
    const projectId = options.projectId();
    const snapshot = options.openFiles.value.map((file) => ({
      path: file.path,
      version: file.version,
    }));

    try {
      const result = await watchProjectFiles(projectId, { files: snapshot });
      if (
        requestGeneration !== generation
        || projectId !== options.projectId()
      ) return;

      for (const item of result.items) {
        const opened = options.openFiles.value.find(
          (file) => file.path === item.path,
        );
        if (!opened) continue;

        if (item.state === 'changed' && item.file) {
          if (options.dirtyPaths.value.has(item.path)) {
            const currentConflict = conflicts.value.get(item.path);
            if (currentConflict?.diskFile.version !== item.file.version) {
              registerConflict(opened, item.file);
              options.onStatus(
                `${opened.name} mudou no disco. Compare as versões antes de salvar.`,
              );
            }
          } else {
            options.replaceOpenFile(item.file);
            options.replaceModelContent(item.file);
            options.setDirty(item.path, false);
            removeConflict(item.path);
            options.onStatus(`${opened.name} atualizado a partir do disco.`);
          }
        } else if (item.state === 'deleted') {
          options.onError(
            `${opened.name} foi removido fora do dashboard. A aba foi preservada.`,
          );
        } else if (item.state === 'unavailable') {
          options.onError(
            `${opened.name} não está mais disponível para o editor embutido.`,
          );
        }
      }
    } catch (error) {
      options.onError(
        error instanceof Error
          ? error.message
          : 'Não foi possível verificar mudanças externas nos arquivos abertos.',
      );
    } finally {
      if (requestGeneration === generation) checking.value = false;
    }
  }

  function useDisk(path: string): void {
    const conflict = conflicts.value.get(path);
    if (!conflict) return;
    options.replaceOpenFile(conflict.diskFile);
    options.replaceModelContent(conflict.diskFile);
    options.setDirty(path, false);
    removeConflict(path);
    options.onStatus(`${conflict.diskFile.name} recarregado do disco.`);
  }

  function keepLocal(path: string): void {
    const conflict = conflicts.value.get(path);
    if (!conflict) return;

    // Atualiza somente a versão esperada. O modelo local permanece intacto e
    // o próximo salvamento passa a ser uma substituição explicitamente aceita.
    options.replaceOpenFile({
      ...conflict.diskFile,
      content: conflict.diskFile.content,
    });
    options.setDirty(path, true);
    removeConflict(path);
    options.onStatus(
      `${conflict.diskFile.name}: sua edição foi mantida. Salve para substituir o disco.`,
    );
  }

  function registerSaveConflict(
    opened: ProjectFileContent,
    diskFile: ProjectFileContent,
  ): void {
    registerConflict(opened, diskFile);
  }

  watch(
    () => options.openFiles.value.map((file) => file.path),
    (paths) => {
      const opened = new Set(paths);
      replaceConflicts((next) => {
        for (const path of next.keys()) {
          if (!opened.has(path)) next.delete(path);
        }
      });
    },
  );

  onMounted(() => {
    timer = window.setInterval(() => void checkNow(), WATCH_INTERVAL_MS);
  });

  onBeforeUnmount(() => {
    generation += 1;
    if (timer !== undefined) window.clearInterval(timer);
  });

  return {
    conflicts,
    checking,
    checkNow,
    keepLocal,
    registerSaveConflict,
    removeConflict,
    useDisk,
  };
}
