type TerminalCopyKeyEvent = Pick<
  KeyboardEvent,
  'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'
>;

export function isTerminalCopyShortcut(
  event: TerminalCopyKeyEvent,
  hasSelection: boolean,
  macOS: boolean,
): boolean {
  if (!hasSelection || event.altKey || event.key.toLowerCase() !== 'c') {
    return false;
  }

  return macOS ? event.metaKey : event.ctrlKey;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Alguns navegadores bloqueiam a Clipboard API fora de contexto seguro.
      // Nesse caso, tentamos o fallback síncrono abaixo.
    }
  }

  if (typeof document === 'undefined') return false;

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';

  document.body.appendChild(textarea);
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    textarea.remove();
  }

  return copied;
}
