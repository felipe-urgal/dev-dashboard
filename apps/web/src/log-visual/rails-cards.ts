import { rememberOriginalText, text } from './dom-helpers';
import { appendHighlightedText, getActiveSearchQuery } from './search';

function highlightPlainElement(element: HTMLElement): void {
  const value = rememberOriginalText(element);
  element.replaceChildren();
  appendHighlightedText(element, value);
  element.classList.toggle(
    'enhanced-search-match',
    Boolean(getActiveSearchQuery()) &&
      value
        .toLocaleLowerCase()
        .includes(getActiveSearchQuery().toLocaleLowerCase()),
  );
}

export function decorateRailsCards(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('.rails-request-card').forEach((card) => {
    const failed =
      card.classList.contains('rails-request-failed') ||
      card.querySelector('.rails-error-lines') !== null ||
      /\b(?:ERRO\s+)?[45]\d{2}\b/.test(
        text(card.querySelector('.rails-status') ?? card),
      );

    card.classList.toggle('enhanced-request-error-card', failed);
    card.classList.toggle(
      'enhanced-search-result-card',
      Boolean(getActiveSearchQuery()) &&
        text(card)
          .toLocaleLowerCase()
          .includes(getActiveSearchQuery().toLocaleLowerCase()),
    );
  });

  root
    .querySelectorAll<HTMLElement>(
      [
        '.rails-request-heading strong',
        '.rails-request-context > span',
        '.rails-parameters code',
        '.rails-error-lines span',
        '.rails-system-group code',
        '.rails-detail-source',
      ].join(','),
    )
    .forEach(highlightPlainElement);
}
