import { EXPLANATION_CLASS, SQL_LINE_SELECTOR } from './sql-explanation/constants';
import { extractStatement } from './sql-explanation/extract';
import { buildExplanation, explanationKey } from './sql-explanation/render';

function enhanceSqlLine(line: HTMLElement): void {
  const statement = extractStatement(line);
  if (!statement) return;

  const key = explanationKey(statement);
  const adjacent = line.nextElementSibling;
  if (
    adjacent?.classList.contains(EXPLANATION_CLASS) &&
    (adjacent as HTMLElement).dataset.sqlExplanationKey === key
  ) {
    return;
  }

  line.insertAdjacentElement('afterend', buildExplanation(statement));
}

function enhance(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>(SQL_LINE_SELECTOR).forEach(enhanceSqlLine);
}

export function installSqlExplanationEnhancer(): void {
  if (typeof document === 'undefined') return;

  enhance(document);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) {
          if (node.matches(SQL_LINE_SELECTOR)) enhanceSqlLine(node);
          enhance(node);
        }
      }
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
}
