import { readFileSync, writeFileSync } from 'node:fs';

const docsPath = 'docs/architecture/database-explorer.md';
let docs = readFileSync(docsPath, 'utf8');

function replace(search, replacement, label) {
  const next = docs.replace(search, replacement);
  if (next === docs) throw new Error(`database-explorer.md drift: ${label}`);
  docs = next;
}

replace(
  '`apps/web/src/composables/useDatabaseTableListView.ts` concentra a busca e paginação da lista de tabelas do sidebar, mantendo o page size atual de 40 itens e reiniciando a página ao alterar a busca.\n',
  '`apps/web/src/composables/useDatabaseTableListView.ts` concentra a busca e paginação da lista de tabelas do sidebar, mantendo o page size atual de 40 itens e reiniciando a página ao alterar a busca.\n\n`apps/web/src/composables/useMachineDatabaseServices.ts` concentra o estado e a orquestração dos serviços da máquina:\n\n- carrega lista e detalhes por meio da camada `api/`;\n- mantém loading, erro, sucesso, expansão, detalhes e ação pendente;\n- preserva as confirmações explícitas de start/stop/restart/install/uninstall sensíveis;\n- usa `generation/latest-wins` para impedir que refreshes ou detalhes obsoletos sobrescrevam estado mais novo;\n- recebe dependências substituíveis para testes de comportamento sem acoplar a view ao transporte.\n\n`apps/web/src/composables/useDatabaseQueryExecution.ts` concentra seleção de banco/tabela, preview e query livre da sessão ativa:\n\n- recebe refs e operações de apresentação já pertencentes aos composables de sessão, lista e resultado;\n- usa somente o `sessionId` efêmero nas chamadas da camada `api/`;\n- aplica resultado, duração e histórico apenas quando a geração e a sessão capturadas ainda são atuais;\n- invalida operações em andamento quando o contexto do Explorer é limpo ou substituído;\n- recebe dependências HTTP substituíveis para testes determinísticos.\n',
  'orchestration composables',
);

replace(
  'A view continua responsável apenas por adaptar essas unidades ao contexto visual e às operações assíncronas: preencher o draft ao escolher uma conexão, restaurar query/tabela/banco quando possível, decidir quando uma execução bem-sucedida entra no histórico e entregar ao result view os dados retornados. A leitura do `localStorage` continua no `onMounted`, preservando o lifecycle anterior.',
  'A view atua majoritariamente como composição da feature: conecta os componentes visuais aos composables, mantém o draft/modal de conexão, adapta conexões salvas e restauração do histórico e coordena o lifecycle da sessão. Requests de serviços, listagem de tabelas, preview e execução de queries não ficam mais implementados diretamente na `DatabaseView`. A leitura do `localStorage` continua no `onMounted`, preservando o lifecycle anterior.',
  'view responsibility',
);

replace(
  'Essa separação também facilita testes isolados: o serviço pode ser exercitado com uma implementação controlada da dependência read-only, cada adapter pode ser testado com uma factory de client nativo injetada, o store pode ter TTL e cleanup testados sem banco real, as rotas de sessão podem substituir diretamente `DatabaseExplorerService`, e os composables web podem validar sessão, histórico, conexões salvas, result view e paginação de tabelas sem montar a view inteira.',
  'Essa separação também facilita testes isolados: o serviço pode ser exercitado com uma implementação controlada da dependência read-only, cada adapter pode ser testado com uma factory de client nativo injetada, o store pode ter TTL e cleanup testados sem banco real, as rotas de sessão podem substituir diretamente `DatabaseExplorerService`, e os composables web validam sessão, histórico, conexões salvas, serviços da máquina, execução de queries, result view e paginação de tabelas sem montar a view inteira.',
  'isolated tests',
);

replace(
  'A decomposição visual principal agora inclui `DatabaseServicesPanel` e `DatabaseConnectionDialog` sem mover requests para os filhos. O próximo recorte de frontend deve retirar da `DatabaseView` a orquestração remanescente de serviços e execução para composables próprios (`useMachineDatabaseServices` e `useDatabaseQueryExecution`); o primitive de storage versionado permanece em recorte posterior.',
  'A decomposição da `DatabaseView` agora inclui componentes visuais menores e composables próprios para sessão, conexões salvas, histórico, visualização de resultado, paginação de tabelas, serviços da máquina e execução de queries. Os componentes filhos continuam emitindo intenções de UI; requests e regras assíncronas ficam nos composables e na camada `api/`, sem state manager global para estado local da feature.',
  'implemented composition',
);

writeFileSync(docsPath, docs);
