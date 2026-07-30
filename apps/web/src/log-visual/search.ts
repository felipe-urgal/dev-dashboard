let activeSearchQuery = '';

export function getActiveSearchQuery(): string {
  return activeSearchQuery;
}

export function setActiveSearchQuery(value: string): void {
  activeSearchQuery = value;
}

export function appendHighlightedText(
  parent: HTMLElement,
  value: string,
  className?: string,
): HTMLElement {
  const target = className ? document.createElement('span') : parent;
  if (className) target.className = className;

  const query = activeSearchQuery.trim();
  if (!query) {
    target.append(document.createTextNode(value));
    if (target !== parent) parent.append(target);
    return target;
  }

  const lowerValue = value.toLocaleLowerCase();
  const lowerQuery = query.toLocaleLowerCase();
  let cursor = 0;
  let matchIndex = lowerValue.indexOf(lowerQuery);

  while (matchIndex >= 0) {
    if (matchIndex > cursor) {
      target.append(document.createTextNode(value.slice(cursor, matchIndex)));
    }

    const mark = document.createElement('mark');
    mark.className = 'log-search-highlight';
    mark.textContent = value.slice(matchIndex, matchIndex + query.length);
    target.append(mark);

    cursor = matchIndex + query.length;
    matchIndex = lowerValue.indexOf(lowerQuery, cursor);
  }

  if (cursor < value.length) {
    target.append(document.createTextNode(value.slice(cursor)));
  }

  if (target !== parent) parent.append(target);
  return target;
}
