import {
  extractJoinedTables,
  extractLimit,
  extractMainTable,
  extractOrder,
  hasSoftDeleteFilter,
  hasWhere,
  selectProjection,
} from './extract';
import { code } from './text-helpers';
import type { SqlExplanation } from './types';

export function describeSelect(statement: string): SqlExplanation {
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

export function explainSql(statement: string): SqlExplanation {
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
