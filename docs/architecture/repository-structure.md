# Estrutura do repositório e responsabilidades

O Dev Dashboard é um monorepo npm que mantém aplicações, bibliotecas, scripts de desenvolvimento, documentação e o CLI Bash legado no mesmo histórico.

## Árvore de alto nível

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
│   ├── architecture/
│   ├── site/
│   └── tasks/
├── config/
├── lib/
├── init.sh
├── package.json
├── package-lock.json
└── tsconfig.base.json
```

## Regras de dependência

A direção desejada é:

```text
apps/web ───────────────┐
                       ├──> packages/contracts
apps/api ───────────────┤
   │                   ├──> packages/core
   │                   ├──> packages/project-discovery
   └───────────────────┴──> packages/process-manager
```

Os pacotes compartilhados não devem depender de Vue ou Fastify. A web não deve acessar filesystem ou iniciar processos. A API coordena infraestrutura local e traduz resultados para contratos HTTP.

## `apps/api`

Aplicação Node.js, TypeScript e Fastify.

### Responsabilidades

- inicializar o servidor local;
- aplicar autenticação, origem e CORS;
- validar requests com JSON Schema;
- registrar rotas por domínio;
- construir serviços e repositórios no `AppContext`;
- traduzir falhas internas em erros HTTP estáveis;
- acompanhar recursos que precisam ser encerrados no shutdown;
- servir o frontend estático no modo de distribuição local.

### Pontos de entrada

| Arquivo | Função |
|---|---|
| `src/server.ts` | Lê configuração, cria a aplicação e inicia o listener. |
| `src/app.ts` | Monta o Fastify, segurança, rotas e frontend estático. |
| `src/app-context.ts` | Constrói repositórios, stores e serviços compartilhados. |
| `src/server-config.ts` | Resolve porta, origem e modo de distribuição. |

### Organização interna

```text
apps/api/src/
├── routes/       # contratos HTTP e adaptação request/response
├── services/     # casos de uso e integrações locais
├── store/        # estado em memória de projetos detectados
├── security/     # autenticação e política local
├── http/         # erros, schemas e frontend estático
├── app-context.ts
├── app.ts
└── server.ts
```

### Rotas

Cada plugin de rota recebe dependências explicitamente. Isso permite:

- testes com implementações isoladas;
- ausência de singletons globais ocultos;
- encerramento consistente de recursos;
- leitura clara das capacidades usadas por cada endpoint.

Os domínios incluem workspaces, projetos, processos, Git, testes, scripts, banco, Rails, ambiente, arquivos, editor, navegador, atividades, configurações e assistente de IA.

### Serviços

O `AppContext` instancia componentes como:

- `WorkspaceRepository`;
- `ProjectStore`;
- `ProcessManager`;
- `DashboardGitService`;
- `GitMutationHistoryService`;
- `TestDetectionService`;
- `TestExecutionHistoryService`;
- `DatabaseDetectionService`;
- `DatabaseSnapshotService`;
- `RailsInspectionService`;
- `RailsRuntimeService`;
- `ScriptDetectionService`;
- `ScriptExecutionService`;
- `ProjectFileService`;
- `ProjectWorkspaceEditService`;
- `ProjectLanguageServerService`;
- `AiAssistantService`.

Uma nova dependência de aplicação deve entrar no contexto quando precisar ser compartilhada, substituída em teste ou encerrada no shutdown.

## `apps/web`

Aplicação Vue 3, TypeScript, Vite e Vue Router.

### Responsabilidades

- apresentar dados estruturados;
- organizar navegação global e por projeto;
- chamar a API por `fetch`;
- acompanhar SSE ou WebSocket quando necessário;
- controlar estados de carregamento, erro e confirmação;
- descartar respostas obsoletas quando o projeto muda;
- manter preferências visuais locais;
- oferecer acessibilidade por teclado e movimento reduzido.

### Entrada e rotas

`src/main.ts` instala preferências e aprimoramentos visuais antes de montar `App.vue`.

O router organiza:

- visão geral;
- atividades;
- processos;
- configurações;
- detalhes do projeto;
- diagnóstico;
- editor;
- servidor e logs;
- Git;
- testes;
- banco de dados;
- dependências;
- scripts;
- runtime Rails;
- variáveis de ambiente.

### Limite da camada

A web não deve:

- ler arquivos do sistema diretamente;
- receber o token persistente no bundle;
- construir comandos de shell;
- escolher caminhos de estado;
- considerar mensagens internas do runtime como contrato público.

## `packages/contracts`

Biblioteca de tipos públicos compartilhados.

### Deve conter

- entidades e DTOs consumidos por mais de uma camada;
- unions de estados públicos;
- formatos de respostas e eventos;
- identificadores e metadados serializáveis.

### Não deve conter

- acesso a filesystem;
- dependência de Fastify ou Vue;
- criação de processos;
- decisões específicas de interface;
- valores secretos.

Mudanças incompatíveis em contratos precisam ser coordenadas entre API, web e testes.

## `packages/core`

Regras centrais e persistência de configuração local.

Responsabilidades típicas:

- workspaces;
- favoritos;
- configurações de retenção;
- perfis de ambiente;
- token local;
- validação e canonicalização de caminhos;
- gravação atômica de arquivos de configuração.

O pacote deve permanecer independente das interfaces.

## `packages/project-discovery`

Responsável por transformar um workspace em uma coleção estruturada de projetos.

Fluxo esperado:

1. receber workspace validado;
2. listar diretórios candidatos;
3. ignorar dependências e diretórios internos;
4. identificar Rails ou Node;
5. detectar capacidades;
6. gerar identificador estável;
7. retornar projetos e warnings.

O scanner não deve abrir prompts ou executar uma interface interativa.

## `packages/process-manager`

Camada de execução e acompanhamento de processos locais.

Responsabilidades:

- selecionar comandos conhecidos;
- preparar ambiente de servidor;
- escolher portas;
- iniciar sem shell arbitrário;
- persistir PID, comando, porta e estado;
- armazenar logs;
- validar identidade antes de sinalizar;
- encerrar gradualmente;
- limpar estado e logs obsoletos;
- aplicar limites e mascaramento nas leituras.

O pacote não deve aceitar uma linha de comando livre enviada pelo navegador.

## `scripts`

Automação de desenvolvimento e manutenção do repositório.

| Script | Responsabilidade |
|---|---|
| `dev.mjs` | Orquestra API, web e documentação. |
| `dev-web.mjs` | Diagnostica, compila e inicia a distribuição local. |
| `doctor.mjs` | Verifica ferramentas, dependências e portas. |
| `docs-server.mjs` | Serve a central e a API de documentação. |
| `generate-api-docs.mjs` | Gera a referência HTTP a partir dos schemas das rotas. |
| `generate-changelog.mjs` | Gera changelog conforme a estratégia do projeto. |
| `*.test.mjs` | Testes unitários da automação raiz. |

Scripts devem funcionar a partir da raiz, evitar shell desnecessário e possuir testes quando contêm regras.

## `docs`

Documentação versionada.

```text
docs/
├── index.md                         # porta de entrada
├── getting-started.md               # instalação e primeiro uso
├── development-guide.md             # processo de desenvolvimento
├── operations-and-troubleshooting.md
├── documentation-api.md
├── architecture/                    # decisões e referências técnicas
├── tasks/                           # histórico e planejamento interno
└── site/index.html                  # interface da central local
```

O servidor lê Markdown em cada request. Alterações aparecem ao recarregar a página sem rebuild.

## `lib`, `config` e `init.sh`

Representam a implementação Bash original e sua configuração. Ela continua suportada durante a migração incremental.

A estratégia é extrair comportamentos reutilizáveis para operações não interativas e pacotes testáveis, sem interromper o CLI antes de existir paridade suficiente.

## Onde colocar código novo

| Necessidade | Local recomendado |
|---|---|
| Novo tipo compartilhado | `packages/contracts` |
| Persistência/configuração genérica | `packages/core` |
| Detecção de projeto/capacidade | `packages/project-discovery` |
| Processo e estado operacional | `packages/process-manager` |
| Caso de uso local específico | `apps/api/src/services` |
| Endpoint HTTP | `apps/api/src/routes` |
| Experiência visual | `apps/web/src` |
| Automação do monorepo | `scripts` |
| Decisão ou guia | `docs` |

## Critérios para um módulo novo

Um módulo novo deve:

- possuir responsabilidade clara;
- aceitar e retornar dados estruturados;
- validar entradas em sua fronteira;
- evitar estado global implícito;
- ser testável isoladamente;
- não executar shell arbitrário;
- não aceitar caminhos fora do escopo autorizado;
- expor erros identificáveis;
- documentar persistência, riscos e contratos públicos.
