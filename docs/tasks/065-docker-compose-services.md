# Task 065 — Docker Compose por serviços declarados

## Status

Concluída.

## Objetivo

Permitir que o dashboard detecte e opere serviços já declarados no arquivo
Docker Compose de um projeto, sem aceitar comandos, caminhos ou serviços livres
do navegador e sem criar ou buildar imagens.

## Escopo entregue

- capability `docker` detectada pela presença de um dos quatro nomes de arquivo
  Compose reconhecidos na raiz do projeto;
- parsing estático de serviços, imagens, portas e dependências com `yaml`;
- serviços que dependem exclusivamente de `build:` aparecem como informativos e
  não podem ser iniciados pelo dashboard;
- status sob demanda com `docker compose ps --status running --services`;
- catálogo fechado de `start`, `stop` e `restart` por serviço;
- confirmação de uso único, vinculada a projeto, serviço e ação, para `stop` e
  `restart`;
- logs pontuais com `--tail=200`, limite de 262 KiB e mascaramento central de
  credenciais;
- aba Docker no detalhe do projeto e atalho correspondente na central de
  comandos;
- diagnóstico opcional de `docker compose version` no `npm run doctor`;
- schemas explícitos de entrada e saída e erros públicos específicos.

## Decisão sobre logs

A primeira versão usa leitura pontual em vez de `logs -f`. O `ProcessManager`
atual identifica uma única instância por `projectId + kind`; acompanhar vários
serviços simultaneamente exigiria uma nova identidade por serviço, migração de
persistência, locks, limpeza e representação na página global de processos.
Esse trabalho fica separado para não misturar gestão de containers com a
entrega segura do catálogo Compose.

## Critérios de aceite

- o arquivo Compose é escolhido somente pela allowlist de nomes na raiz do
  projeto;
- a lista exibida vem do parse estático, sem executar Docker;
- o navegador envia apenas `projectId`, nome de serviço já declarado e ação do
  catálogo;
- todos os comandos usam argumentos em array, `cwd` canônico e sem shell;
- `stop` e `restart` não executam sem confirmação válida;
- `build`, `exec`, edição de arquivos, volumes e imagens ficam fora do escopo;
- logs nunca excedem o limite público e têm segredos mascarados.

## Validação

- testes focados da entrega: 5 do serviço e rotas Compose, 3 do painel
  Vue, 3 do diagnóstico e 1 da descoberta da capability;
- `npm run typecheck` passou;
- `npm run build` passou;
- `npm test` passou nos scripts (6), API (332), web (255), core (8) e
  project-discovery (1). O pacote process-manager manteve 31 testes passando e
  as mesmas 12 falhas conhecidas deste ambiente isolado, relacionadas a
  `os.networkInterfaces()`, processos detached e temporização de locks; nenhuma
  delas percorre o código Docker Compose.

## Limitações

- não combina arquivos de override nem múltiplos `-f`;
- não resolve interpolação de `.env` para exibição;
- serviços somente com `build:` precisam ser buildados manualmente;
- logs são uma fotografia dos 200 registros mais recentes, sem streaming;
- não gerencia imagens, volumes, redes, Swarm ou Kubernetes.

## PR

A preencher após a abertura do PR.
