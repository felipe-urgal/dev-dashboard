const LOG_BOTTOM_THRESHOLD = 56;

interface TestLogFollowState {
  following: boolean;
  previousLineCount: number;
  scheduled: boolean;
  observer: MutationObserver;
}

const stateByViewport = new WeakMap<HTMLElement, TestLogFollowState>();

export function isTestLogNearEnd(
  viewport: Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'clientHeight'>,
  threshold = LOG_BOTTOM_THRESHOLD,
): boolean {
  return (
    viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <=
    threshold
  );
}

function lineCount(viewport: HTMLElement): number {
  return (
    viewport.querySelector<HTMLOListElement>('.tests-log-lines')
      ?.childElementCount ?? 0
  );
}

function scheduleScrollToEnd(
  viewport: HTMLElement,
  state: TestLogFollowState,
): void {
  if (!state.following || state.scheduled) return;
  state.scheduled = true;

  const run = (): void => {
    state.scheduled = false;
    if (!state.following) return;
    viewport.scrollTop = viewport.scrollHeight;
  };

  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(run);
  } else {
    queueMicrotask(run);
  }
}

function enhanceViewport(viewport: HTMLElement): void {
  if (stateByViewport.has(viewport)) return;

  const state: TestLogFollowState = {
    following: true,
    previousLineCount: lineCount(viewport),
    scheduled: false,
    observer: new MutationObserver(() => undefined),
  };

  const handleScroll = (): void => {
    state.following = isTestLogNearEnd(viewport);
  };

  state.observer = new MutationObserver(() => {
    const currentLineCount = lineCount(viewport);
    if (currentLineCount === 0 || currentLineCount < state.previousLineCount) {
      state.following = true;
    }
    state.previousLineCount = currentLineCount;
    scheduleScrollToEnd(viewport, state);
  });

  stateByViewport.set(viewport, state);
  viewport.dataset.testLogAutoFollow = 'true';
  viewport.addEventListener('scroll', handleScroll, { passive: true });
  state.observer.observe(viewport, {
    characterData: true,
    childList: true,
    subtree: true,
  });
  scheduleScrollToEnd(viewport, state);
}

export function enhanceTestLogAutoFollow(root: ParentNode = document): void {
  if (root instanceof HTMLElement && root.matches('.tests-log-output')) {
    enhanceViewport(root);
  }
  root
    .querySelectorAll<HTMLElement>('.tests-log-output')
    .forEach(enhanceViewport);
}

export function installTestLogAutoFollow(): void {
  if (typeof document === 'undefined') return;
  if (document.documentElement.dataset.testLogAutoFollow === 'true') return;
  document.documentElement.dataset.testLogAutoFollow = 'true';

  enhanceTestLogAutoFollow();
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) enhanceTestLogAutoFollow(node);
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}
