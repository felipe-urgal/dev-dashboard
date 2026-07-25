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
- Visão Git somente leitura, execução de testes e catálogo seguro de scripts
- Inspeção de configurações e disponibilidade de bancos locais
- Interface de terminal existente
- API local em Fastify
- Dashboard web em Vue 3
- Contratos TypeScript compartilhados
- Testes automatizados da fundação

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

A URL final é `http://127.0.0.1:4343`. Diferentemente de `npm run dev`, não há processo Vite nem segunda porta. O comando funciona fora da raiz, encaminha `SIGINT`/`SIGTERM` e força o encerramento somente após três segundos.

Variáveis aceitas pela API:

- `DEV_DASHBOARD_API_PORT` — porta inteira, padrão `4343`;
- `DEV_DASHBOARD_LOCAL_DISTRIBUTION=1` — ativa explicitamente o frontend estático;
- `DEV_DASHBOARD_WEB_DIST` — diretório do build, resolvido de forma canônica.

O host não é configurável e permanece `127.0.0.1`. No navegador, a API emite uma sessão curta em cookie `HttpOnly` e `SameSite=Strict`; o token persistente não entra no HTML ou bundle. Clientes locais não navegador continuam usando `X-Dev-Dashboard-Token`.

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

```text
GET    /api/health

GET    /api/workspaces
POST   /api/workspaces
POST   /api/workspaces/:workspaceId/scan
DELETE /api/workspaces/:workspaceId

GET    /api/projects

GET    /api/projects/:projectId/process
POST   /api/projects/:projectId/process/start
POST   /api/projects/:projectId/process/stop
GET    /api/projects/:projectId/process/logs
```

## Estado atual

A fundação web já permite:

1. cadastrar workspaces;
2. persistir configurações;
3. detectar projetos Rails e Node;
4. visualizar projetos no navegador;
5. iniciar e parar servidores;
6. consultar porta e PID;
7. abrir a aplicação;
8. acompanhar logs;
9. continuar utilizando o CLI existente.

## Próximos passos

- servir o frontend compilado pela API e disponibilizar o comando `dev-web`;
- executar com segurança o catálogo de scripts e tarefas;
- completar as operações Git mutáveis com confirmação e auditoria;
- adicionar histórico persistente de jobs e eventos em tempo real;
- consolidar páginas globais, configurações e command palette;
- ampliar testes de componentes e testes ponta a ponta.

Consulte [`docs/roadmap.md`](docs/roadmap.md) para acompanhar as fases planejadas.

## Licença

Ainda não definida.
