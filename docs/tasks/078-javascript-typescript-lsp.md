# Task 078 — LSP JavaScript/TypeScript

## Status

Implementada no PR #167 e aguardando revisão.

## Objetivo

Adicionar recursos semânticos de linguagem ao editor Monaco para JavaScript e
TypeScript por meio de um servidor LSP local, gerenciado pela API e incapaz de
executar comandos escolhidos pelo navegador.

## Resultado entregue

- diagnósticos em tempo real nos arquivos abertos;
- hover com documentação e informações de tipo;
- ir para definição;
- localizar referências;
- símbolos do documento e do workspace;
- autocomplete semântico;
- busca de símbolos no campo do explorer usando o prefixo `@`;
- propostas de alteração encaminhadas ao preview e confirmação seguros da task
  077;
- estado discreto do servidor de linguagem no cabeçalho do editor;
- degradação segura para o Monaco local quando a ferramenta não está instalada
  ou falha.

## Decisões de implementação

### Cliente Monaco

Foi adotado um cliente JSON-RPC pequeno e explícito em vez de
`monaco-languageclient`. A integração registra somente os providers necessários
para esta task e mantém sob controle do dashboard quais solicitações e respostas
podem produzir efeitos.

O cliente:

- conecta apenas quando existe um arquivo JavaScript ou TypeScript aberto;
- usa URIs lógicas no formato
  `file:///dev-dashboard/projects/<projectId>/<path>`;
- sincroniza `didOpen`, `didChange`, `didSave` e `didClose`;
- usa sincronização de conteúdo completo nesta primeira versão;
- aplica markers do Monaco e anuncia um resumo acessível dos diagnósticos;
- registra providers de hover, definição, referências, completion e símbolos;
- tenta reconectar no máximo duas vezes e mantém o editor funcional depois da
  falha;
- ignora comandos e edições adicionais anexadas a itens de completion.

### API e transporte

Foram adicionados:

```http
GET /api/projects/:projectId/language-server
GET /api/projects/:projectId/language-server/connect  # WebSocket
```

O WebSocket é registrado antes das rotas e atravessa os mesmos hooks de sessão
e origem da API local. Cada mensagem possui limite de 1 MiB, compressão por
mensagem permanece desabilitada e cada conexão pode encaminhar no máximo 600
mensagens por minuto. Ao exceder a janela, a API encerra a conexão com código
1008 antes de entregar a mensagem ao processo LSP.

A API mantém no máximo uma conexão ativa por projeto e compartilha um processo
por projeto. A sessão é encerrada após 60 segundos sem cliente; o processo
recebe `SIGTERM` e, se necessário, `SIGKILL`. São permitidas no máximo três
inicializações por minuto para o mesmo projeto.

### Processo do servidor

O executável é escolhido por catálogo fechado:

1. `node_modules/.bin/typescript-language-server` do projeto;
2. `typescript-language-server` já disponível no `PATH` da API.

O único argumento é `--stdio`, sem shell, download, instalação ou comando
fornecido pelo navegador. Projetos Node ou com `package.json`, `tsconfig.json`
ou `jsconfig.json` são reconhecidos.

Quando o executável está ausente, o status informa que a instalação deve ser
feita manualmente e nenhuma mutação no ambiente é executada.

### Isolamento de URI

O navegador nunca recebe o caminho absoluto do projeto. O gateway traduz as
URIs lógicas para `file://` reais somente antes de escrever no processo e faz o
caminho inverso antes de devolver respostas.

- URIs do cliente fora do projeto são recusadas;
- localizações retornadas pelo servidor fora da raiz são removidas;
- caminhos com segmentos ambíguos, traversal, barras incorporadas ou NUL são
  recusados;
- a raiz real é obtida com `realpath` a partir do projeto autorizado.

### WorkspaceEdit

`workspace/applyEdit` nunca grava diretamente. O cliente converte apenas
alterações textuais em arquivos existentes para o contrato da task 077 e exige:

- arquivo aberto sem mudanças locais, ou leitura atual da versão pela API;
- validação de caminho, versão e faixa pelo serviço existente;
- preview consolidado lado a lado;
- confirmação explícita e token de uso único;
- aplicação atômica com rollback já implementado pela task 077.

Criação, renomeação, exclusão e `workspace/executeCommand` permanecem
bloqueados. A resposta ao servidor informa que a alteração não foi aplicada
automaticamente e foi encaminhada para revisão.

## Arquivos principais

- `packages/contracts/src/language-server.ts`;
- `apps/api/src/services/project-language-server-service.ts`;
- `apps/api/src/security/rate-limited-websocket.ts`;
- `apps/api/src/routes/project-language-server.ts`;
- `apps/web/src/language-server/project-language-server-client.ts`;
- `apps/web/src/components/ProjectEmbeddedEditor.vue`;
- `apps/web/src/components/ProjectWorkspaceEditReview.vue`;
- `apps/api/test/project-language-server-service.test.ts`;
- `apps/api/test/rate-limited-websocket.test.ts`;
- `apps/web/test/project-language-server-client.test.ts`.

## Testes automatizados

A cobertura adicionada valida:

- framing `Content-Length` fragmentado e múltiplas mensagens;
- tradução e isolamento das URIs;
- remoção de localizações externas;
- início sob demanda e encerramento por inatividade;
- bloqueio de `workspace/executeCommand`;
- limite de frequência e renovação da janela por conexão;
- ausência do executável sem instalação automática;
- inicialização JSON-RPC e sincronização do documento;
- markers e resumo de diagnósticos;
- busca de símbolos;
- encaminhamento de `WorkspaceEdit` para revisão, sem aplicação automática;
- compatibilidade do componente existente com os providers do Monaco.

## Limitações conhecidas

- `typescript-language-server` e TypeScript precisam estar disponíveis no
  projeto ou no ambiente da API;
- existe somente uma conexão de navegador ativa por projeto;
- a sincronização usa conteúdo completo, não patches incrementais;
- diagnósticos são exibidos somente para modelos abertos;
- rename, code actions, semantic tokens, formatting e comandos do servidor não
  fazem parte desta versão;
- alterações estruturais propostas pelo servidor continuam recusadas;
- o aviso existente de chunks grandes do Monaco permanece apenas informativo.

## Critérios de aceite

- abrir um arquivo JS/TS inicia a sessão sob demanda;
- alterações no Monaco são sincronizadas sem escrever no disco automaticamente;
- diagnósticos são removidos ou atualizados quando o documento muda;
- definição e referências não escapam da raiz do projeto;
- completion funciona sem bloquear digitação ou scroll;
- fechar a última conexão e atingir o timeout encerra o processo;
- servidor ausente produz orientação clara, sem instalação automática;
- mensagens acima da janela são bloqueadas antes do processo LSP;
- `WorkspaceEdit` inválido ou estrutural é recusado;
- typecheck, build, testes automatizados e smoke E2E passam.

## Fora do escopo

- Ruby/Rails LSP, planejado para a task 079;
- instalação automática de ferramentas;
- extensões arbitrárias;
- terminal livre;
- IA e completion inline/FIM;
- comandos enviados pelo servidor de linguagem.

## Próxima atividade

Task 079 — integrar Ruby LSP e os recursos Rails compatíveis com a mesma
fronteira de processo, URI e `WorkspaceEdit` seguro.
