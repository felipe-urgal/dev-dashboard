# Dev Dashboard

Dashboard local para gerenciar projetos de desenvolvimento pelo terminal e pelo navegador.

O Dev Dashboard detecta aplicações Rails e Node em pastas locais, organiza múltiplos workspaces e oferece uma interface central para acompanhar projetos, processos e logs.

> O projeto está em evolução. O CLI original continua disponível enquanto a nova interface web é desenvolvida.

## Recursos disponíveis

- Descoberta automática de projetos Rails e Node
- Cadastro persistente de múltiplos workspaces
- Identificação das capacidades de cada projeto
- Inicialização e encerramento de servidores locais
- Detecção automática de portas disponíveis
- Persistência segura de PIDs e metadados dos processos
- Visualização de logs no navegador
- Git com leitura completa (status, diff, branches, commits) e mutações com confirmação (CRUD de branches locais, pull, push, commit e stash)
- Execução de testes, incluindo arquivo específico, com histórico persistente e eventos em tempo real
- Catálogo seguro de scripts com histórico persistente e acompanhamento em tempo real
- Migrations, routes e geradores (model/migration) do Rails, com operações mutáveis sob confirmação, e diagnóstico Bundler somente leitura
- Sidekiq e webpack-dev-server como processos de fundo geridos (start/stop/restart/logs), com status somente leitura das credentials do Rails
- Serviços do Docker Compose como processos de fundo geridos (start/stop/restart/logs/build)
- Inspeção de configurações e disponibilidade de bancos locais, com snapshot e restore com confirmação
- Perfis de ambiente reutilizáveis e leitura de variáveis por projeto, sem persistir valor de variáveis com nome de segredo
- IDE embutida (Monaco), com LSP JavaScript/TypeScript e Ruby/Rails, e assistente de IA local via Ollama (opcional, isolado em painel próprio)
- Project Doctor: diagnóstico somente leitura de estrutura, runtimes, dependências e configuração por projeto
- Navegador estruturado de falhas de teste e assessor de impacto de mudanças após troca de branch/pull/sincronização
- Inspetor somente leitura de portas TCP locais e abertura do editor local conhecido
- Painel global de atividade com resumo, busca e histórico; página global de processos com limpeza segura de finalizados
- Command palette (`Cmd/Ctrl+K`) para busca e navegação
- Notificações nativas opcionais e exportação segura de logs pelo navegador
- Preferências de tema, densidade e retenção configuráveis pela interface
- Interface de terminal existente
- API local em Fastify
- Dashboard web em Vue 3
- Contratos TypeScript compartilhados
- Testes automatizados (unitários, componentes Vue e smoke E2E)

## Arquitetura

O projeto possui duas interfaces:

```text
Terminal
├── dev-tools
└── scripts Bash existentes

Navegador
├── Vue 3
├── Vite
└── API Fastify local
```

As duas interfaces evoluirão para utilizar o mesmo núcleo de regras e operações.

```text
┌──────────────────┐
│ Dashboard Vue    │
└────────┬─────────┘
         │ HTTP
         ▼
┌──────────────────┐
│ API Fastify      │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────┐
│ Core e pacotes compartilhados│
├──────────────────────────────┤
│ Project Discovery            │
│ Process Manager              │
│ Contracts                    │
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ Git, Rails, Node e sistema   │
└──────────────────────────────┘
```

Mais detalhes estão em [`docs/architecture/overview.md`](docs/architecture/overview.md).

## Requisitos

- Linux
- Bash 4 ou superior
- Node.js 20.19+ ou 22.12+
- npm
- Git

Os projetos gerenciados também precisam possuir seus próprios runtimes e dependências, como Ruby, Bundler, Rails, Node, npm, Yarn ou pnpm.

O desenvolvimento atual é validado com Node.js 24.

## Instalação

Clone o repositório:

```bash
git clone git@github.com:felipe-urgal/dev-dashboard.git ~/.dev-dashboard
cd ~/.dev-dashboard
```

Instale as dependências:

```bash
npm install
```

## Desenvolvimento

Inicie API e frontend com um único comando:

```bash
npm run dev
```

Serviços iniciados:

```text
API: http://127.0.0.1:4343
Web: http://127.0.0.1:5173
```

Para executar separadamente:

```bash
npm run dev:api
npm run dev:web
```

Use `Ctrl+C` para encerrar os processos de desenvolvimento.

## Distribuição local

Para diagnosticar, compilar e iniciar somente a API com o frontend estático:

```bash
npm run dev-web
```

O comando imprime uma URL temporária com uma capacidade de bootstrap no fragmento. Abra essa URL, em vez de digitar somente a origem, para iniciar ou renovar a sessão do navegador. O fragmento não é enviado ao servidor ao carregar a página: o frontend o move para `sessionStorage`, remove-o da barra de endereço e o apresenta apenas ao endpoint de sessão. Diferentemente de `npm run dev`, não há processo Vite nem segunda porta. O comando funciona fora da raiz, encaminha `SIGINT`/`SIGTERM` e força o encerramento somente após três segundos.

Variáveis aceitas pela API:

- `DEV_DASHBOARD_API_PORT` — porta inteira, padrão `4343`;
- `DEV_DASHBOARD_LOCAL_DISTRIBUTION=1` — ativa explicitamente o frontend estático;
- `DEV_DASHBOARD_WEB_DIST` — diretório do build, resolvido de forma canônica.
- `DEV_DASHBOARD_BROWSER_BOOTSTRAP` — capacidade efêmera de 32 bytes, gerada automaticamente pelo `dev-web` e obrigatória no modo distribuído.

O host não é configurável e permanece `127.0.0.1`. No navegador, a API só emite uma sessão curta em cookie `HttpOnly` e `SameSite=Strict` após validar a capacidade efêmera ou o token local; origem e JSON continuam sendo defesas adicionais. O token persistente não entra no HTML ou bundle. Clientes locais não navegador continuam usando `X-Dev-Dashboard-Token`.

Se a inicialização falhar, libere a porta configurada, execute `npm install` e confira se o build contém `index.html` e todos os assets referenciados. O próprio `dev-web` reconstrói esses artefatos e recusa builds inválidos ou que contenham credenciais.

Para verificar os requisitos sem iniciar serviços nem alterar o ambiente:

```bash
npm run doctor
```

O diagnóstico valida Node.js, npm, Git, dependências e disponibilidade das
portas locais. Uma porta ocupada é apenas um aviso, pois pode indicar outra
instância legítima do dashboard.

## Validação

Execute toda a validação local:

```bash
npm run typecheck
npm run build
npm test
```

Os comandos percorrem os workspaces npm que possuem os scripts correspondentes.

## Workspaces locais

Um workspace representa uma pasta que contém projetos de desenvolvimento.

Exemplo:

```text
/home/usuario/Projetos
```

Os workspaces cadastrados são persistidos em:

```text
~/.config/dev-dashboard/config.json
```

Também são respeitadas as variáveis:

```text
DEV_DASHBOARD_CONFIG_DIR
XDG_CONFIG_HOME
```

A interface permite:

- cadastrar workspaces;
- selecionar o workspace ativo;
- escanear novamente uma pasta;
- remover um workspace do dashboard.

Remover um workspace não apaga seus arquivos locais.

## Descoberta de projetos

O scanner analisa os diretórios diretamente abaixo de cada workspace.

Um projeto é identificado como Rails quando possui um `Gemfile` com a gem `rails`.

Um projeto é identificado como Node quando possui um `package.json`.

Entre as capacidades detectadas estão:

```text
server
git
tests
database
scripts
webpack
sidekiq
rake
bundler
```

Projetos sem Rails ou `package.json` são ignorados por padrão.

## Gerenciamento de processos

O dashboard pode iniciar servidores Rails e Node.

Para Rails, utiliza preferencialmente:

```bash
bin/rails server
```

Com fallback para:

```bash
bundle exec rails server
```

Para Node, procura os scripts na seguinte ordem:

```text
dev
start
serve
```

O gerenciador:

- executa comandos sem `shell: true`;
- usa o diretório do projeto como `cwd`;
- seleciona uma porta disponível;
- persiste PID, porta, comando e caminho;
- verifica a identidade do processo antes de encerrá-lo;
- tenta `SIGTERM` antes de `SIGKILL`;
- mantém logs em arquivos locais.

Os estados dos processos ficam em:

```text
~/.local/state/dev-dashboard/processes
```

Os logs ficam em:

```text
~/.local/state/dev-dashboard/logs
```

Também são respeitadas as variáveis:

```text
DEV_DASHBOARD_STATE_DIR
XDG_STATE_HOME
```

## Segurança

A API escuta somente em:

```text
127.0.0.1
```

Ela não deve ser exposta diretamente à internet ou à rede local.

No primeiro uso, a aplicação gera um token local em:

```text
~/.config/dev-dashboard/api-token
```

O arquivo é restrito ao usuário com permissão `0600`.

Rotas privadas exigem o header:

```text
X-Dev-Dashboard-Token
```

Durante o desenvolvimento, o proxy do Vite lê o token local e adiciona esse
header às chamadas para `/api`. O token não é incluído no bundle JavaScript do
frontend.

A API também:

- aceita somente as origens locais configuradas;
- usa uma política CORS explícita;
- mantém o health check público;
- padroniza erros de validação, autorização e falhas internas;
- não retorna stack traces ou mensagens internas sensíveis;
- aceita apenas operações previamente definidas.

Caminhos, portas e entradas são validados antes da execução.

Leia [`docs/architecture/security.md`](docs/architecture/security.md) antes de adicionar novos comandos ou integrações.

## Estrutura do repositório

```text
dev-dashboard/
├── apps/
│   ├── api/
│   └── web/
├── packages/
│   ├── contracts/
│   ├── core/
│   ├── process-manager/
│   └── project-discovery/
├── scripts/
├── docs/
├── config/
├── lib/
├── init.sh
├── package.json
└── tsconfig.base.json
```

### `apps/api`

API Fastify responsável por workspaces, projetos, processos e logs.

### `apps/web`

Aplicação Vue 3 responsável pela interface no navegador.

### `packages/contracts`

Contratos TypeScript compartilhados entre frontend, API e pacotes internos.

### `packages/core`

Regras centrais e persistência das configurações locais.

### `packages/project-discovery`

Descoberta de projetos e identificação de capacidades.

### `packages/process-manager`

Inicialização, acompanhamento e encerramento seguro de processos locais.

### `lib` e `init.sh`

Implementação Bash original do dashboard de terminal.

## Scripts principais

```bash
npm run dev
npm run dev:api
npm run dev:web
npm run doctor
npm run typecheck
npm run build
npm test
```

## API atual

Todas as rotas, exceto o health check e o bootstrap de sessão, são privadas.
O navegador usa a sessão local; clientes não navegador usam o header de
token.

A referência completa (157 rotas) é gerada a partir dos schemas Fastify
reais e verificada no CI — não é mantida manualmente aqui para não divergir
do código. Veja [`docs/architecture/api-reference.md`](docs/architecture/api-reference.md)
ou rode `npm run docs:api` para regenerá-la.

## Estado atual

A interface web já permite:

1. cadastrar workspaces;
2. persistir configurações;
3. detectar projetos Rails e Node;
4. visualizar projetos no navegador;
5. iniciar, configurar e parar servidores;
6. abrir URLs e acompanhar logs protegidos;
7. consultar Git (status, diff, branches, commits), administrar branches
   locais (criar, trocar, renomear e remover) e executar mutações com
   confirmação (pull, push, commit e stash);
8. detectar e executar testes reconhecidos, incluindo um arquivo específico;
9. inspecionar bancos locais, distinguir runtime local de Docker, coordenar
   start/stop de serviços reconhecidos e criar/restaurar snapshots de banco
   com confirmação explícita;
10. consultar e executar com segurança scripts e tarefas catalogados;
11. cancelar execuções e consultar seu histórico persistente (scripts e testes);
12. acompanhar execuções do catálogo e de testes em tempo real por SSE;
13. consultar migrations e routes do Rails, executar migrate/rollback/seed/prepare
    com confirmação e diagnosticar Bundler somente leitura;
14. acompanhar um painel global de atividade e uma página global de processos;
15. navegar por uma command palette (`Cmd/Ctrl+K`);
16. ajustar preferências de tema, densidade e retenção;
17. marcar projetos favoritos persistentes, mantidos no topo da visão geral;
18. exibir carregamentos globais com skeletons acessíveis e movimento reduzido;
19. editar código na IDE embutida (Monaco) com LSP JavaScript/TypeScript e
    Ruby/Rails, e usar o assistente de IA local (Ollama), opcional e isolado
    em painel próprio;
20. diagnosticar um projeto com o Project Doctor, navegar falhas de teste por
    runner e revisar o impacto de uma troca de branch/pull/sincronização;
21. inspecionar portas TCP locais, abrir o editor local conhecido e gerir
    serviços do Docker Compose;
22. exportar logs protegidos pelo navegador e receber notificações nativas
    opcionais de conclusões longas;
23. continuar utilizando o CLI existente de forma independente.

A cobertura automatizada inclui testes unitários, testes de componentes Vue e um
smoke E2E de workspace → projeto → execução → log.

## Próximos passos

Consulte [`tasks/NEXT.md`](tasks/NEXT.md) para a próxima entrega,
[`tasks/PENDENCIAS.md`](tasks/PENDENCIAS.md) para o inventário do que falta
implementar e [`tasks/roadmap.md`](tasks/roadmap.md) para os horizontes
futuros. O histórico de entregas já registradas vive nos arquivos
`tasks/NNN-*.md`.

## Licença

MIT — ver [`LICENSE`](LICENSE).
