interface SqlExplanation {
  description: string;
  expectedReturn: string;
  mainTable?: string;
  relatedTables: string[];
}

const SQL_LINE_SELECTOR = '.rails-sql-lines code.rails-detail-sql';
const EXPLANATION_CLASS = 'enhanced-sql-explanation';

function cleanIdentifier(value: string | undefined): string | undefined {
  if (!value) return undefined;

  return value
    .trim()
    .replace(/^[`"']+|[`"']+$/g, '')
    .split('.')
    .map((part) => part.replace(/^[`"']+|[`"']+$/g, ''))
    .join('.');
}

function code(value: string): string {
  return `\`${value}\``;
}

function unique(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function extractStatement(line: HTMLElement): string {
  const renderedStatement = line.querySelector<HTMLElement>('.enhanced-sql-statement');
  if (renderedStatement?.textContent?.trim()) {
    return renderedStatement.textContent.trim();
  }

  const original = line.dataset.logOriginalText ?? line.textContent ?? '';
  const match = original.match(
    /^.+?\s+\([\d.]+ms\)\s+((?:SELECT|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK)\b.*)$/i,
  );

  return match?.[1]?.trim() ?? original.trim();
}

function extractMainTable(statement: string): string | undefined {
  const patterns = [
    /\bFROM\s+((?:`[^`]+`|[A-Za-z_][\w$]*)(?:\.(?:`[^`]+`|[A-Za-z_][\w$]*))?)/i,
    /\bUPDATE\s+((?:`[^`]+`|[A-Za-z_][\w$]*)(?:\.(?:`[^`]+`|[A-Za-z_][\w$]*))?)/i,
    /\bINSERT\s+INTO\s+((?:`[^`]+`|[A-Za-z_][\w$]*)(?:\.(?:`[^`]+`|[A-Za-z_][\w$]*))?)/i,
    /\bDELETE\s+FROM\s+((?:`[^`]+`|[A-Za-z_][\w$]*)(?:\.(?:`[^`]+`|[A-Za-z_][\w$]*))?)/i,
  ];

  for (const pattern of patterns) {
    const table = cleanIdentifier(statement.match(pattern)?.[1]);
    if (table) return table;
  }

  return undefined;
}

function extractJoinedTables(statement: string): string[] {
  const tables: string[] = [];
  const pattern = /\b(?:INNER|LEFT|RIGHT|FULL|CROSS)?\s*JOIN\s+((?:`[^`]+`|[A-Za-z_][\w$]*)(?:\.(?:`[^`]+`|[A-Za-z_][\w$]*))?)/gi;

  for (const match of statement.matchAll(pattern)) {
    const table = cleanIdentifier(match[1]);
    if (table) tables.push(table);
  }

  return unique(tables);
}

function extractLimit(statement: string): number | undefined {
  const value = statement.match(/\bLIMIT\s+(\d+)/i)?.[1];
  return value ? Number(value) : undefined;
}

function extractOrder(statement: string): string | undefined {
  const match = statement.match(
    /\bORDER\s+BY\s+(.+?)(?=\s+LIMIT\b|\s+OFFSET\b|$)/i,
  );
  if (!match?.[1]) return undefined;

  return match[1]
    .replace(/`/g, '')
    .replace(/\s+ASC\b/gi, ' em ordem crescente')
    .replace(/\s+DESC\b/gi, ' em ordem decrescente')
    .trim();
}

function selectProjection(statement: string): string {
  return statement.match(/^SELECT\s+(.+?)\s+FROM\b/is)?.[1]?.trim() ?? '*';
}

function hasSoftDeleteFilter(statement: string): boolean {
  return /\bdeleted_at\b\s+IS\s+NULL/i.test(statement);
}

function hasWhere(statement: string): boolean {
  return /\bWHERE\b/i.test(statement);
}

function describeSelect(statement: string): SqlExplanation {
  const mainTable = extractMainTable(statement);
  const relatedTables = extractJoinedTables(statement);
  const projection = selectProjection(statement);
  const limit = extractLimit(statement);
  const order = extractOrder(statement);
  const isCount = /\bCOUNT\s*\(/i.test(projection);
  const isExists = /\bEXISTS\s*\(/i.test(projection);
  const returnsFullRecords = /^(?:DISTINCT\s+)?(?:\*|(?:`?\w+`?\.)?\*)$/i.test(projection);

  let subject: string;
  let expectedReturn: string;

  if (isCount) {
    subject = `Conta quantos registros${mainTable ? ` existem em ${code(mainTable)}` : ''}`;
    expectedReturn = 'Um número com a quantidade de registros encontrados.';
  } else if (isExists) {
    subject = `Verifica se existe algum registro${mainTable ? ` em ${code(mainTable)}` : ''}`;
    expectedReturn = 'Um valor verdadeiro ou falso indicando se encontrou algum registro.';
  } else if (returnsFullRecords) {
    subject = `Busca registros completos${mainTable ? ` da tabela ${code(mainTable)}` : ''}`;
    expectedReturn = limit === 1
      ? 'No máximo um registro completo.'
      : limit
        ? `No máximo ${limit} registros completos.`
        : 'Uma lista de registros completos.';
  } else {
    const fields = projection
      .split(',')
      .map((field) => field.trim().replace(/`/g, ''))
      .filter(Boolean)
      .slice(0, 4);
    const suffix = projection.split(',').length > fields.length ? ' e outros campos' : '';
    subject = `Busca ${fields.map(code).join(', ')}${suffix}${mainTable ? ` em ${code(mainTable)}` : ''}`;
    expectedReturn = limit === 1
      ? 'No máximo uma linha com os campos selecionados.'
      : limit
        ? `No máximo ${limit} linhas com os campos selecionados.`
        : 'Uma lista de linhas com os campos selecionados.';
  }

  const details: string[] = [];
  if (relatedTables.length) {
    details.push(`cruzando dados relacionados de ${relatedTables.map(code).join(', ')}`);
  }
  if (hasSoftDeleteFilter(statement)) {
    details.push('considerando apenas registros que não foram excluídos logicamente');
  } else if (hasWhere(statement)) {
    details.push('aplicando os filtros definidos na cláusula WHERE');
  }
  if (order) {
    details.push(`ordenando o resultado por ${code(order)}`);
  }
  if (limit && limit !== 1) {
    details.push(`limitando o resultado a ${limit} linhas`);
  }

  return {
    description: `${subject}${details.length ? `, ${details.join(', ')}` : ''}.`,
    expectedReturn,
    mainTable,
    relatedTables,
  };
}

function explainSql(statement: string): SqlExplanation {
  const normalized = statement.trim();
  const operation = normalized.match(/^(SELECT|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK)\b/i)?.[1]?.toUpperCase();
  const mainTable = extractMainTable(normalized);
  const relatedTables = extractJoinedTables(normalized);
  const filtered = hasWhere(normalized) ? ' que atendem aos filtros da consulta' : '';

  switch (operation) {
    case 'SELECT':
      return describeSelect(normalized);
    case 'INSERT':
      return {
        description: `Cria um novo registro${mainTable ? ` na tabela ${code(mainTable)}` : ''}.`,
        expectedReturn: 'Normalmente retorna a confirmação da inserção e, dependendo do banco, o identificador criado.',
        mainTable,
        relatedTables,
      };
    case 'UPDATE':
      return {
        description: `Atualiza registros${mainTable ? ` da tabela ${code(mainTable)}` : ''}${filtered}.`,
        expectedReturn: 'Normalmente retorna a quantidade de registros alterados, não os registros completos.',
        mainTable,
        relatedTables,
      };
    case 'DELETE':
      return {
        description: `Remove registros${mainTable ? ` da tabela ${code(mainTable)}` : ''}${filtered}.`,
        expectedReturn: 'Normalmente retorna a quantidade de registros removidos.',
        mainTable,
        relatedTables,
      };
    case 'BEGIN':
      return {
        description: 'Inicia uma transação no banco de dados.',
        expectedReturn: 'Não retorna registros; apenas abre o bloco transacional.',
        relatedTables,
      };
    case 'COMMIT':
      return {
        description: 'Confirma todas as alterações feitas na transação atual.',
        expectedReturn: 'Não retorna registros; confirma que as mudanças foram persistidas.',
        relatedTables,
      };
    case 'ROLLBACK':
      return {
        description: 'Desfaz as alterações feitas na transação atual.',
        expectedReturn: 'Não retorna registros; informa que as mudanças foram revertidas.',
        relatedTables,
      };
    default:
      return {
        description: 'Executa uma operação no banco de dados.',
        expectedReturn: 'O retorno depende do tipo e da estrutura da consulta.',
        mainTable,
        relatedTables,
      };
  }
}

function explanationKey(statement: string): string {
  let hash = 0;
  for (let index = 0; index < statement.length; index += 1) {
    hash = ((hash << 5) - hash + statement.charCodeAt(index)) | 0;
  }
  return String(Math.abs(hash));
}

function buildExplanation(statement: string): HTMLDetailsElement {
  const explanation = explainSql(statement);
  const details = document.createElement('details');
  details.className = EXPLANATION_CLASS;
  details.dataset.sqlExplanationKey = explanationKey(statement);

  const summary = document.createElement('summary');
  const title = document.createElement('span');
  title.textContent = 'Entender esta consulta';
  const hint = document.createElement('span');
  hint.className = 'enhanced-sql-explanation-hint';
  hint.textContent = 'explicação em português';
  summary.append(title, hint);

  const body = document.createElement('div');
  body.className = 'enhanced-sql-explanation-body';

  const description = document.createElement('p');
  description.textContent = explanation.description;

  const expected = document.createElement('div');
  expected.className = 'enhanced-sql-expected-return';
  const expectedLabel = document.createElement('strong');
  expectedLabel.textContent = 'Retorno esperado';
  const expectedText = document.createElement('span');
  expectedText.textContent = explanation.expectedReturn;
  expected.append(expectedLabel, expectedText);

  body.append(description, expected);

  const tables = unique([explanation.mainTable, ...explanation.relatedTables]);
  if (tables.length) {
    const tableList = document.createElement('div');
    tableList.className = 'enhanced-sql-explanation-tables';
    const tableLabel = document.createElement('span');
    tableLabel.textContent = tables.length > 1 ? 'Tabelas envolvidas' : 'Tabela envolvida';
    tableList.append(tableLabel);

    for (const table of tables) {
      const badge = document.createElement('code');
      badge.textContent = table;
      tableList.append(badge);
    }

    body.append(tableList);
  }

  const caveat = document.createElement('small');
  caveat.textContent = 'Leitura gerada pela estrutura do SQL; consultas muito complexas podem exigir análise do contexto da aplicação.';
  body.append(caveat);

  details.append(summary, body);
  return details;
}

function enhanceSqlLine(line: HTMLElement): void {
  const statement = extractStatement(line);
  if (!statement) return;

  const key = explanationKey(statement);
  const parent = line.parentElement;
  if (!parent) return;

  const existing = parent.querySelector<HTMLElement>(
    `.${EXPLANATION_CLASS}[data-sql-explanation-key="${key}"]`,
  );
  if (existing) return;

  let anchor: Element = line;
  if (line.nextElementSibling?.classList.contains('rails-detail-source')) {
    anchor = line.nextElementSibling;
  }

  anchor.insertAdjacentElement('afterend', buildExplanation(statement));
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
