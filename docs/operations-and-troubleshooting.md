# Operação e troubleshooting

Este guia reúne portas, variáveis, persistência, observabilidade e procedimentos para diagnosticar falhas no ambiente local.

## Sistemas e runtimes suportados

Esta matriz descreve o que é validado hoje (CI, código com tratamento
explícito por SO) — não é uma promessa de suporte, e evolui junto com o
código. Validar e ampliar essa cobertura (macOS, Windows) é trabalho em
aberto, listado em `tasks/PENDENCIAS.md`.

| Sistema operacional | Dashboard web (`apps/`, `packages/`) | CLI bash (`lib/`) |
|---|---|---|
| Linux | Suportado e testado em CI (`ubuntu-latest`, Node 24). Identidade de processo validada via `/proc/<pid>/cwd` (ver `docs/architecture/security.md`). | Suportado; caminho principal de desenvolvimento. |
| macOS | Não validado em CI; nenhuma verificação de identidade de processo equivalente ao `/proc/<pid>/cwd` foi implementada. | Parcialmente tratado (`_dev_os` em `lib/core/checks.sh` distingue `mac`/`linux` para abrir navegador e iniciar/parar banco local), mas sem cobertura de teste dedicada. |
| Windows (nativo, fora de WSL) | Não suportado. | Não suportado — o CLI depende de Bash; WSL não é testado nem documentado oficialmente. |

Requisitos de runtime:

| Dependência | Onde é exigida | Obrigatória? |
|---|---|---|
| Node.js `^20.19.0 \|\| >=22.12.0` (`package.json` raiz, `engines`) | Dashboard web | Sim, para `apps/`/`packages/`. |
| Bash >= 4.0 | CLI bash | Sim, para `lib/`/`init.sh`. |
| `git` | Ambos | Sim. |
| `gum` ([charmbracelet/gum](https://github.com/charmbracelet/gum)) | CLI bash | Não — fallback em texto puro quando ausente (ver `dev-doctor`). |
| `lsof` | CLI bash | Sim (liberação de porta em `dev-stop`). |
| `ruby`, `bundle` | CLI bash, projetos Rails | Só para projetos Rails. |
| `mysql` (cliente) | CLI bash, projetos com MySQL | Só se o projeto usar MySQL. |
| `mysqldump`/`pg_dump` | CLI bash, `db:snapshot`/`db:restore` | Só para essas ações. |
| `gh` (GitHub CLI) | CLI bash, `git-pr`/detecção de PR em `git-publish` | Não — aviso em `dev-doctor` se ausente. |

Rode `npm run doctor` (dashboard web) ou `dev-doctor` (CLI bash) para
verificar o ambiente atual contra essa lista.

## Mapa de serviços

| Serviço | Porta padrão | Processo | Escopo |
|---|---:|---|---|
| API | 4343 | `tsx watch src/server.ts` | Produto e integrações locais |
| Web | 5173 | `vite` | Interface de desenvolvimento |
| Preview web | 4173 | `vite preview` | Validação do build web |
| Documentação | 4545 | `node scripts/docs-server.mjs` | Conteúdo e busca local |

Todos os listeners devem permanecer em `127.0.0.1`.

## Variáveis de ambiente

### API e distribuição

| Variável | Finalidade |
|---|---|
| `DEV_DASHBOARD_API_PORT` | Porta da API; padrão `4343`. |
| `DEV_DASHBOARD_LOCAL_DISTRIBUTION=1` | Ativa frontend estático servido pela API. |
| `DEV_DASHBOARD_WEB_DIST` | Diretório canônico do build web. |
| `DEV_DASHBOARD_BROWSER_BOOTSTRAP` | Capacidade efêmera do bootstrap do navegador. |
| `LOG_LEVEL` | Nível do logger Fastify. |

### Documentação

| Variável | Finalidade |
|---|---|
| `DEV_DASHBOARD_DOCS_PORT` | Porta da central; padrão `4545`. |

O host da documentação é fixo em `127.0.0.1`.

### Configuração e estado

| Variável | Finalidade |
|---|---|
| `DEV_DASHBOARD_CONFIG_DIR` | Diretório de configuração da aplicação. |
| `XDG_CONFIG_HOME` | Base XDG alternativa para configuração. |
| `DEV_DASHBOARD_STATE_DIR` | Diretório de processos, logs e históricos. |
| `XDG_STATE_HOME` | Base XDG alternativa para estado. |
| `DEV_DASHBOARD_LOG_RETENTION_DAYS` | Janela padrão de retenção de logs terminais. |

## Arquivos locais

### Configuração

```text
~/.config/dev-dashboard/
├── config.json
├── api-token
├── project-favorites.json
├── retention-settings.json
└── outros arquivos versionados de preferência
```

### Estado

```text
~/.local/state/dev-dashboard/
├── processes/
├── logs/
├── históricos de testes e scripts
├── snapshots de banco
└── estados de operações gerenciadas
```

Diretórios privados devem usar `0700`; arquivos privados, `0600`.

## Diagnóstico inicial

```bash
npm run doctor
```

Depois verifique os serviços individualmente:

```bash
curl http://127.0.0.1:4343/api/health
curl http://127.0.0.1:4545/api/health
```

Para a web, abra `http://127.0.0.1:5173` no navegador.

## `npm run dev` não inicia

### Dependências ausentes

Sintoma:

```text
node_modules não encontrado
módulo não encontrado
workspace não resolvido
```

Correção:

```bash
npm install
npm run doctor
npm run dev
```

### Versão do Node incompatível

Confira:

```bash
node --version
```

Use Node `20.19+`, `22.12+` ou versão mais recente suportada pelo projeto.

### Pacotes compartilhados não compilam

`predev` executa o build de `contracts`, `core`, `project-discovery` e `process-manager`. Rode diretamente para obter erro mais focado:

```bash
npm run build:packages
```

Depois execute typecheck no workspace indicado pelo erro.

## Porta ocupada

Descubra o processo:

```bash
ss -ltnp | grep ':4343\|:5173\|:4545'
```

Não encerre um PID sem saber sua identidade. Pode existir outra instância legítima ou outro serviço local.

### Alterar porta da documentação

```bash
DEV_DASHBOARD_DOCS_PORT=4546 npm run docs:dev
```

Como o orquestrador usa a variável herdada, a mesma configuração funciona com:

```bash
DEV_DASHBOARD_DOCS_PORT=4546 npm run dev
```

### Alterar porta da API

A distribuição local aceita `DEV_DASHBOARD_API_PORT`. No desenvolvimento padrão, a web e as origens permitidas são configuradas para a porta esperada; mudar apenas uma camada pode exigir ajustes coordenados.

## Um processo filho encerra e derruba os demais

Esse é o comportamento esperado do orquestrador. O ambiente não deve continuar parcialmente ativo quando API, web ou documentação falha.

Procure no terminal a primeira mensagem de erro antes do encerramento coordenado. Para isolar:

```bash
npm run dev:api
npm run dev:web
npm run docs:dev
```

## Dashboard abre, mas chamadas da API falham

Verifique:

1. API está ativa em `127.0.0.1:4343`;
2. Vite está ativo em `127.0.0.1:5173`;
3. o token local pode ser lido pelo processo do Vite;
4. não existe proxy, extensão ou configuração alterando a origem;
5. o request passa por `/api` no Vite, em vez de chamar origem externa.

Teste o health check, que é público:

```bash
curl -i http://127.0.0.1:4343/api/health
```

Para uma rota privada via `curl`:

```bash
TOKEN="$(cat ~/.config/dev-dashboard/api-token)"
curl -H "X-Dev-Dashboard-Token: $TOKEN" http://127.0.0.1:4343/api/workspaces
```

Não cole o token em logs, issues ou documentação pública.

## Erro de origem ou CORS

A API aceita uma lista fechada de origens locais. Confirme que o navegador está usando exatamente a URL impressa pelo processo correto.

Não use:

- IP da rede local;
- `0.0.0.0`;
- domínio customizado;
- túnel público;
- iframe em outra origem.

## Workspace não é aceito

Possíveis causas:

- caminho inexistente;
- alvo não é diretório;
- falta de permissão;
- caminho resolve para workspace já cadastrado;
- symlink resolve para destino fora do esperado.

Verifique:

```bash
realpath /caminho/do/workspace
ls -ld /caminho/do/workspace
```

## Projeto não aparece no scan

Confira se ele está diretamente abaixo do workspace e possui:

- `package.json`, para Node; ou
- `Gemfile` com Rails, para Rails.

Diretórios internos, dependências e estruturas não reconhecidas podem ser ignorados. Consulte warnings retornados pelo scan.

## Servidor do projeto não inicia

### Rails

Verifique manualmente no projeto:

```bash
bin/rails server
```

ou:

```bash
bundle exec rails server
```

Problemas comuns: bundle ausente, banco indisponível, credenciais inválidas ou porta usada.

### Node

O dashboard procura scripts na ordem:

```text
dev
start
serve
```

Confira `package.json` e o lockfile. Ambientes selecionados precisam corresponder a arquivos reconhecidos pelo backend.

### Estado preso em `starting`

Possíveis causas:

- processo iniciou, mas não abriu a porta;
- health check configurado não responde;
- processo saiu sem flush completo de log;
- porta efetiva difere da esperada.

Abra o log limitado pelo dashboard e confira o processo no sistema sem sinalizá-lo imediatamente.

## Processo não pode ser encerrado

O Process Manager recusa sinalizar quando a identidade não corresponde ao projeto esperado. Isso protege contra reutilização de PID.

Se o estado ficou órfão após reinício ou crash:

- confirme o processo real com `ps` e `/proc/<pid>/cwd`;
- use a limpeza segura oferecida pelo dashboard para estados finalizados;
- evite apagar arquivos de estado enquanto o processo ainda existe.

## Logs vazios ou truncados

A leitura é deliberadamente limitada. O dashboard retorna o final do arquivo e pode remover a primeira linha parcial.

Também pode haver substituições de segredos. Consulte os metadados de redaction exibidos na interface.

Para investigar localmente, abra o arquivo somente no computador confiável e não publique seu conteúdo sem revisão.

## Git mostra estado inesperado

Execute no projeto:

```bash
git status --short --branch
git remote -v
git branch -vv
```

A interface deve representar o estado atual, sem indicar atualização quando nenhum commit novo existe.

Para mutações:

- confira branch atual;
- confira alterações não commitadas;
- revise remote e upstream;
- valide o resumo da confirmação;
- não reutilize tokens expirados.

## Teste ou script não aparece

O catálogo é detectado a partir dos arquivos atuais. Confira:

- scripts em `package.json`;
- lockfile único e reconhecido;
- tarefas Rails disponíveis;
- executáveis permitidos em `bin/`;
- arquivos de teste dentro do escopo esperado.

A API redetecta o catálogo no momento da execução; uma ação removida entre listagem e clique deve ser recusada.

## SSE desconecta

A desconexão pode ocorrer por:

- conclusão da execução;
- troca de projeto;
- limite de assinantes;
- reinício da API;
- perda temporária da conexão local.

O frontend deve recuperar o snapshot persistido por HTTP antes de reconectar. SSE é atualização, não a única fonte de verdade.

## Snapshot de banco falha

Verifique:

- cliente `mysqldump` ou `pg_dump` instalado;
- host e porta detectados;
- usuário com permissão;
- espaço em disco;
- limite de tamanho e tempo;
- serviço de banco ativo;
- snapshot e environmentId ainda válidos.

A senha não aparece na linha de comando; ela é transmitida ao cliente por variável específica.

## Documentação não abre

Execute isoladamente:

```bash
npm run docs:dev
```

Teste:

```bash
curl http://127.0.0.1:4545/api/health
curl http://127.0.0.1:4545/api/docs
```

Erros comuns:

- porta `4545` ocupada;
- `docs/site/index.html` ausente;
- Markdown com permissões inválidas;
- comando executado fora da raiz por script customizado;
- caminho solicitado não pertence ao catálogo.

## Busca da documentação não encontra arquivo grande

A busca ignora documentos acima do limite de conteúdo configurado para evitar custo excessivo. A referência completa da API pode ser aberta diretamente pela navegação mesmo quando não participa de toda busca textual.

## Build da web falha

```bash
npm run typecheck --workspace=@dev-dashboard/web
npm run build --workspace=@dev-dashboard/web
```

Verifique erros de Vue SFC, tipos de props/emits, imports e mudanças incompatíveis em `contracts`.

## Build da API falha

```bash
npm run typecheck --workspace=@dev-dashboard/api
npm run build --workspace=@dev-dashboard/api
```

Se o erro vier de um pacote compartilhado, compile primeiro:

```bash
npm run build:packages
```

## Referência da API desatualizada

Sintoma:

```text
docs:api:check ... está desatualizado
```

Correção:

```bash
npm run docs:api
npm run docs:api:check
```

Revise e commite `docs/architecture/api-reference.md`.

## Coleta mínima para reportar um problema

Inclua sem segredos:

- sistema operacional;
- `node --version` e `npm --version`;
- comando executado;
- primeira mensagem de erro;
- resultado de `npm run doctor`;
- serviço e porta envolvidos;
- passos para reproduzir;
- comportamento esperado e observado;
- logs já mascarados.

Nunca inclua token local, `.env`, credenciais de banco ou dumps.
