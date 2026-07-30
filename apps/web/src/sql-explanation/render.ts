import { EXPLANATION_CLASS } from './constants';
import { explainSql } from './describe';
import { unique } from './text-helpers';

export function explanationKey(statement: string): string {
  let hash = 0;
  for (let index = 0; index < statement.length; index += 1) {
    hash = ((hash << 5) - hash + statement.charCodeAt(index)) | 0;
  }
  return String(Math.abs(hash));
}

export function buildExplanation(statement: string): HTMLDetailsElement {
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
