import { rememberOriginalText } from './dom-helpers';
import { appendHighlightedText, getActiveSearchQuery } from './search';

export function decorateRenderLine(line: HTMLElement): void {
  const value = rememberOriginalText(line);
  const match = value.match(/^(Rendering|Rendered)\s+(.+?)(?:\s+\(Duration:\s*([\d.]+)ms\s*\|\s*GC:\s*([\d.]+)ms\))?$/i);
  if (!match) return;

  line.dataset.logEnhanced = 'true';
  const [, phase = '', template = '', duration, gc] = match;
  line.classList.toggle(
    'enhanced-search-match',
    Boolean(getActiveSearchQuery()) && value.toLocaleLowerCase().includes(getActiveSearchQuery().toLocaleLowerCase()),
  );
  line.replaceChildren();

  const phaseNode = document.createElement('span');
  phaseNode.className = phase.toLowerCase() === 'rendered'
    ? 'enhanced-render-phase done'
    : 'enhanced-render-phase';
  phaseNode.textContent = phase;

  const templateNode = document.createElement('span');
  templateNode.className = 'enhanced-render-template';
  appendHighlightedText(templateNode, template);

  line.append(phaseNode, templateNode);

  if (duration) {
    const timing = document.createElement('span');
    timing.className = Number(duration) >= 20
      ? 'enhanced-render-duration enhanced-log-slow'
      : 'enhanced-render-duration';
    timing.textContent = `${duration}ms${gc ? ` · GC ${gc}ms` : ''}`;
    line.append(timing);
  }
}
