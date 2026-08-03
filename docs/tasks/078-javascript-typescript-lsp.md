# Task 078 — LSP JavaScript/TypeScript

## Status

Planejada. Esta atividade começa após a integração da task 077.

## Objetivo

Adicionar recursos semânticos de linguagem ao editor Monaco para JavaScript e
TypeScript por meio de um servidor LSP local, gerenciado pela API e incapaz de
executar comandos escolhidos pelo navegador.

## Resultado esperado

- diagnósticos em tempo real;
- hover com informações de tipo;
- ir para definição;
- localizar referências;
- símbolos do documento e do workspace;
- autocomplete semântico;
- propostas de alteração revisadas pelo `WorkspaceEdit` seguro.

## Arquitetura proposta

### Frontend

- `monaco-languageclient` conecta os modelos Monaco ao gateway local;
- uma conexão é criada somente quando o projeto possui arquivo JS/TS aberto;
- URIs permanecem canônicas e vinculadas ao projeto;
- diagnósticos alimentam markers do Monaco e uma região acessível;
- falha ou indisponibilidade do LSP mantém o editor funcional com os recursos
  locais do Monaco.

### API e transporte

- gateway WebSocket autenticado pela sessão local existente;
- JSON-RPC encaminhado sem permitir mensagens para outros projetos;
- limite de tamanho, frequência e quantidade de conexões;
- encerramento limpo ao fechar o projeto ou após inatividade.

### Processo do servidor

- executável e argumentos definidos por catálogo fechado da API;
- raiz de trabalho obtida do projeto autorizado;
- um processo compartilhado por projeto, iniciado sob demanda;
- nenhuma instalação ou download automático;
- limites de reinício, memória observável e tempo ocioso;
- logs internos limitados e mascarados, sem expor prompt ou shell.

### WorkspaceEdit

- somente mudanças textuais em arquivos existentes entram na primeira versão;
- todas as URIs e versões são validadas novamente pela API;
- preview consolidado obrigatório;
- aplicação somente após confirmação explícita;
- `workspace/executeCommand` e operações estruturais são recusados por padrão.

## Critérios de aceite

- abrir um arquivo JS/TS inicia a sessão sob demanda;
- alterações no Monaco são sincronizadas sem escrever no disco automaticamente;
- diagnósticos são removidos ou atualizados quando o documento muda;
- definição e referências não escapam da raiz do projeto;
- completion funciona sem bloquear digitação ou scroll;
- fechar a última conexão e atingir o timeout encerra o processo;
- servidor ausente produz orientação clara, sem instalação automática;
- `WorkspaceEdit` inválido ou estrutural é recusado;
- typecheck, build, testes automatizados e smoke E2E passam.

## Testes previstos

- autenticação e isolamento do WebSocket;
- catálogo fechado do processo;
- lifecycle start/reuse/idle-stop/restart-limit;
- tradução de URI entre Monaco, LSP e filesystem;
- sincronização `didOpen`, `didChange`, `didSave` e `didClose`;
- markers de diagnóstico e limpeza de estado;
- definição, referências, hover e completion;
- validação e preview de `WorkspaceEdit`;
- degradação quando o servidor não está instalado ou falha.

## Fora do escopo

- Ruby/Rails LSP;
- instalação automática de ferramentas;
- extensões arbitrárias;
- terminal livre;
- IA e completion inline/FIM;
- comandos enviados pelo servidor de linguagem.
