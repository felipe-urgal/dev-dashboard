export {
  classifyTestLogLine,
  classifyTestLogSemanticTone,
  isTestLogErrorLine,
  isTestLogSuccessLine,
  isTestLogWarningLine,
} from './test-log-tone/classify';
export type {
  TestLogSemanticTone,
  TestLogVisualTone,
} from './test-log-tone/types';

import { enhanceShell } from './test-log-tone/shell';

export function enhanceTestLogTones(root: ParentNode = document): void {
  if (root instanceof HTMLElement && root.matches('.tests-log-shell'))
    enhanceShell(root);
  root.querySelectorAll<HTMLElement>('.tests-log-shell').forEach(enhanceShell);
}

export function installTestLogToneEnhancer(): void {
  if (typeof document === 'undefined') return;
  enhanceTestLogTones();

  let scheduled = false;
  const scheduleScan = (): void => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      enhanceTestLogTones();
    });
  };

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'hidden'],
  });
}
