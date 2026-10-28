import '@xterm/xterm/css/xterm.css';

import { FitAddon } from '@xterm/addon-fit';
import {
  SearchAddon,
  type ISearchDecorationOptions,
} from '@xterm/addon-search';
import { Terminal } from '@xterm/xterm';
import { onBeforeUnmount, ref, watch, type Ref } from 'vue';

import {
  copyTextToClipboard,
  isTerminalCopyShortcut,
} from '../utils/terminal-clipboard';
import { MAX_TERMINAL_SCROLLBACK_LINES } from '../utils/terminal-limits';
import {
  clampTerminalFontSize,
  readTerminalFontSize,
  storeTerminalFontSize,
} from '../utils/terminal-preferences';
import { terminalThemes } from '../utils/terminal-theme';
import { currentTheme } from '../utils/visual-preferences';

const SEARCH_DECORATIONS: Record<'dark' | 'light', ISearchDecorationOptions> = {
  dark: {
    matchBackground: '#3a4a6b',
    matchOverviewRuler: '#3a4a6b',
    activeMatchBackground: '#9e6a03',
    activeMatchColorOverviewRuler: '#9e6a03',
  },
  light: {
    matchBackground: '#fff1a8',
    matchOverviewRuler: '#fff1a8',
    activeMatchBackground: '#ffc83d',
    activeMatchColorOverviewRuler: '#ffc83d',
  },
};

export interface XtermSize {
  cols: number;
  rows: number;
}

/**
 * Ciclo de vida do xterm.js compartilhado pelos painéis que exibem um PTY:
 * montagem, ajuste ao container, tema, fonte persistida e cópia da seleção.
 * Cada painel cuida só do transporte (WebSocket) e do estado da sessão.
 */
export function useXtermSession(options: {
  container: Ref<HTMLElement | null>;
  /** `false` (padrão) ignora o teclado: terminal somente leitura. */
  interactive?: boolean;
  lineHeight?: number;
  onInput?: (data: string) => void;
  onResize?: (size: XtermSize) => void;
  /** Ctrl/⌘+F dentro do terminal (abre a busca do painel). */
  onFind?: () => void;
}) {
  const fontSize = ref(readTerminalFontSize());

  let terminal: Terminal | undefined;
  let fitAddon: FitAddon | undefined;
  let searchAddon: SearchAddon | undefined;
  const searchResults = ref({ index: -1, count: 0 });
  let resizeObserver: ResizeObserver | undefined;

  const macOS =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  const copyShortcutLabel = macOS ? '⌘C' : 'Ctrl+C';

  function size(): XtermSize | null {
    return terminal ? { cols: terminal.cols, rows: terminal.rows } : null;
  }

  function refit(): void {
    fitAddon?.fit();
    const current = size();
    if (current) options.onResize?.(current);
  }

  function hasSelection(): boolean {
    return terminal?.hasSelection() ?? false;
  }

  async function copySelection(): Promise<boolean> {
    const selection = terminal?.getSelection() ?? '';
    if (!selection) return false;

    const copied = await copyTextToClipboard(selection);
    if (copied) terminal?.focus();
    return copied;
  }

  /** Monta o terminal no container; chamadas repetidas reaproveitam o atual. */
  function mount(): boolean {
    if (terminal) return true;
    const container = options.container.value;
    if (!container) return false;

    const interactive = options.interactive ?? false;
    terminal = new Terminal({
      convertEol: true,
      // O destaque dos resultados da busca usa decorações (API proposta).
      allowProposedApi: true,
      disableStdin: !interactive,
      scrollback: MAX_TERMINAL_SCROLLBACK_LINES,
      fontSize: fontSize.value,
      fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
      ...(options.lineHeight ? { lineHeight: options.lineHeight } : {}),
      theme: terminalThemes[currentTheme.value],
    });
    fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    searchAddon = new SearchAddon();
    terminal.loadAddon(searchAddon);
    searchAddon.onDidChangeResults(({ resultIndex, resultCount }) => {
      searchResults.value = { index: resultIndex, count: resultCount };
    });
    terminal.open(container);
    fitAddon.fit();
    if (interactive) terminal.focus();

    terminal.attachCustomKeyEventHandler((event) => {
      if (
        event.type === 'keydown' &&
        options.onFind &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'f' &&
        (macOS ? event.metaKey : event.ctrlKey)
      ) {
        options.onFind();
        return false;
      }

      if (
        event.type !== 'keydown' ||
        !terminal ||
        !isTerminalCopyShortcut(event, terminal.hasSelection(), macOS)
      ) {
        return true;
      }

      void copySelection();
      return false;
    });

    if (options.onInput) {
      terminal.onData((data) => {
        terminal?.scrollToBottom();
        options.onInput?.(data);
      });
    }

    const initial = size();
    if (initial) options.onResize?.(initial);
    // No primeiro paint o container às vezes ainda não assumiu a largura
    // final (troca de aba, layout assentando): reajusta no próximo frame.
    requestAnimationFrame(refit);
    resizeObserver = new ResizeObserver(refit);
    resizeObserver.observe(container);
    return true;
  }

  function write(data: string): void {
    if (!terminal) return;

    const followOutput =
      terminal.buffer.active.viewportY === terminal.buffer.active.baseY;
    terminal.write(data, () => {
      if (followOutput) terminal?.scrollToBottom();
    });
  }

  /** Busca no histórico; `incremental` mantém o resultado ao digitar. */
  function find(
    term: string,
    direction: 'next' | 'previous' = 'next',
    incremental = false,
  ): void {
    if (!searchAddon) return;
    if (!term) {
      clearSearch();
      return;
    }

    const searchOptions = {
      incremental,
      decorations: SEARCH_DECORATIONS[currentTheme.value],
    };
    if (direction === 'next') searchAddon.findNext(term, searchOptions);
    else searchAddon.findPrevious(term, searchOptions);
  }

  function clearSearch(): void {
    searchAddon?.clearDecorations();
    terminal?.clearSelection();
    searchResults.value = { index: -1, count: 0 };
  }

  function clear(): void {
    terminal?.clear();
  }

  /** Apaga tela e histórico, para começar uma nova sessão do zero. */
  function reset(): void {
    clearSearch();
    terminal?.reset();
  }

  function focus(): void {
    terminal?.focus();
  }

  function setFontSize(next: number): void {
    fontSize.value = clampTerminalFontSize(next);
    storeTerminalFontSize(fontSize.value);
    if (!terminal) return;
    terminal.options.fontSize = fontSize.value;
    requestAnimationFrame(refit);
  }

  function dispose(): void {
    resizeObserver?.disconnect();
    resizeObserver = undefined;
    terminal?.dispose();
    terminal = undefined;
    fitAddon = undefined;
    searchAddon = undefined;
  }

  watch(currentTheme, (theme) => {
    if (terminal) terminal.options.theme = terminalThemes[theme];
  });

  onBeforeUnmount(dispose);

  return {
    fontSize,
    copyShortcutLabel,
    mount,
    dispose,
    write,
    clear,
    reset,
    focus,
    refit,
    size,
    hasSelection,
    copySelection,
    setFontSize,
    find,
    clearSearch,
    searchResults,
  };
}
