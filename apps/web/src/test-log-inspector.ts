import { enhanceTestLogInspector } from './test-log-inspector/enhance';

export { parseTestLog } from './test-log-inspector/log-parsing';
export type { ParsedTestFailure, ParsedTestReport } from './test-log-inspector/types';
export { enhanceTestLogInspector } from './test-log-inspector/enhance';

export function installTestLogInspector(): void {
  if (typeof document === 'undefined') return;
  if (document.documentElement.dataset.testLogInspector === 'true') return;
  document.documentElement.dataset.testLogInspector = 'true';
  enhanceTestLogInspector();
  let scheduled = false;
  const schedule = (): void => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      enhanceTestLogInspector();
    });
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
    characterData: true,
    childList: true,
    subtree: true,
  });
}
