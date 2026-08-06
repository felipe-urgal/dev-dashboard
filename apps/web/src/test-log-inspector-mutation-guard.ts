const INSPECTOR_OWNED_SELECTOR =
  '.test-log-explorer-toolbar, .test-log-inspector';

function mutationTargetElement(target: Node): Element | null {
  if (target.nodeType === 1) return target as Element;
  return target.parentElement;
}

export function isTestLogInspectorOwnedMutation(
  record: Pick<MutationRecord, 'target'>,
): boolean {
  return Boolean(
    mutationTargetElement(record.target)?.closest(INSPECTOR_OWNED_SELECTOR),
  );
}

/**
 * Instala temporariamente um construtor de MutationObserver que ignora
 * mutações produzidas pelo próprio inspetor.
 *
 * O inspetor observa todo o documento para acompanhar o streaming dos logs.
 * Sem este filtro, atualizar o contador e reconstruir o diagnóstico agenda
 * outra passagem do observador, criando um ciclo de microtasks que bloqueia
 * a interface assim que o shell de logs é montado.
 *
 * O construtor global é restaurado logo depois que o observador do inspetor
 * é criado; os demais observers da aplicação continuam usando o nativo.
 */
export function installTestLogInspectorMutationGuard(): () => void {
  if (typeof MutationObserver === 'undefined') return () => undefined;

  const NativeMutationObserver = MutationObserver;

  class TestLogInspectorMutationObserver implements MutationObserver {
    private readonly delegate: MutationObserver;

    constructor(callback: MutationCallback) {
      this.delegate = new NativeMutationObserver((records, observer) => {
        const relevantRecords = records.filter(
          (record) => !isTestLogInspectorOwnedMutation(record),
        );

        if (relevantRecords.length > 0) callback(relevantRecords, observer);
      });
    }

    observe(target: Node, options?: MutationObserverInit): void {
      this.delegate.observe(target, options);
    }

    disconnect(): void {
      this.delegate.disconnect();
    }

    takeRecords(): MutationRecord[] {
      return this.delegate
        .takeRecords()
        .filter((record) => !isTestLogInspectorOwnedMutation(record));
    }
  }

  globalThis.MutationObserver =
    TestLogInspectorMutationObserver as typeof MutationObserver;

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;

    if (globalThis.MutationObserver === TestLogInspectorMutationObserver) {
      globalThis.MutationObserver = NativeMutationObserver;
    }
  };
}
