/**
 * Markdown mínimo e seguro para as respostas do Claude: escapa todo HTML antes
 * e só emite as tags conhecidas abaixo (nada de HTML cru vindo do modelo).
 */
const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char]!);
}

function inline(text: string): string {
  return text
    .split(/(`[^`\n]+`)/)
    .map((part) => {
      if (/^`[^`\n]+`$/.test(part)) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }
      return escapeHtml(part)
        .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
        .replace(
          /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
          '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
        );
    })
    .join('');
}

const LIST_ITEM = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const html: string[] = [];
  let paragraph: string[] = [];
  let code: string[] | null = null;
  let list: 'ul' | 'ol' | null = null;

  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      html.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
      paragraph = [];
    }
  };
  const closeList = (): void => {
    if (list) {
      html.push(`</${list}>`);
      list = null;
    }
  };

  for (const line of lines) {
    if (code !== null) {
      if (/^```/.test(line.trim())) {
        html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
        code = null;
      } else {
        code.push(line);
      }
      continue;
    }
    if (/^```/.test(line.trim())) {
      flushParagraph();
      closeList();
      code = [];
      continue;
    }

    const item = LIST_ITEM.exec(line);
    if (item) {
      flushParagraph();
      const kind = /\d/.test(item[2]!) ? 'ol' : 'ul';
      if (list !== kind) {
        closeList();
        html.push(`<${kind}>`);
        list = kind;
      }
      const depth = Math.min(Math.floor(item[1]!.length / 2), 3);
      html.push(
        `<li${depth > 0 ? ` style="margin-left:${depth * 16}px"` : ''}>${inline(item[3]!)}</li>`,
      );
      continue;
    }

    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      closeList();
      html.push(`<p><strong>${inline(heading[1]!)}</strong></p>`);
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      closeList();
      continue;
    }
    closeList();
    paragraph.push(line);
  }

  if (code !== null) {
    html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
  }
  flushParagraph();
  closeList();
  return html.join('');
}
