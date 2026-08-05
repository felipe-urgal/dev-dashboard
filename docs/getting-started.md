# Primeiros passos

Este guia leva de um clone limpo até a primeira execução completa do Dev Dashboard e explica o que cada serviço faz.

## Requisitos

### Sistema e ferramentas

- Linux;
- Bash 4 ou superior;
- Node.js `20.19+` ou `22.12+`;
- npm;
- Git.

O desenvolvimento do projeto é validado principalmente com Node.js 24.

### Runtimes dos projetos gerenciados

O Dev Dashboard não instala as dependências dos projetos encontrados. Cada projeto precisa possuir seu próprio ambiente, por exemplo:

- Ruby, Bundler e Rails;
- Node.js e o gerenciador correspondente ao lockfile;
- MySQL, PostgreSQL ou Docker, quando usados pelo projeto;
- executáveis auxiliares exigidos pelos scripts locais.

## Instalação

```bash
git clone git@github.com:felipe-urgal/dev-dashboard.git ~/.dev-dashboard
cd ~/.dev-dashboard
npm install
```

A raiz é um monorepo npm. Um único `npm install` prepara aplicações e pacotes internos.

## Verificação do ambiente

Antes de iniciar os serviços:

```bash
npm run doctor
```

O diagnóstico verifica:

- versão do Node.js;
- disponibilidade de npm e Git;
- existência de `node_modules`;
- acesso ao repositório;
- disponibilidade das portas da API, web e documentação.

Porta ocupada é exibida como aviso, pois pode representar outra instância legítima.

## Desenvolvimento completo

```bash
npm run dev
```

O script raiz executa três processos filhos:

```text
api  → npm run dev --workspace=@dev-dashboard/api
web  → npm run dev --workspace=@dev-dashboard/web
docs → node scripts/docs-server.mjs
```

Antes disso, `predev` compila os pacotes compartilhados para que as aplicações consumam artefatos atualizados.

### URLs locais

```text
API:           http://127.0.0.1:4343
Dashboard web: http://127.0.0.1:5173
Documentação:  http://127.0.0.1:4545
```

O processo raiz encaminha o encerramento para todo o grupo. Use `Ctrl+C` uma vez para finalizar o ambiente.

## Execução separada

```bash
npm run dev:api
npm run dev:web
npm run docs:dev
```

Isso é útil para investigar um serviço isoladamente. A web depende da API para os recursos do produto; a documentação é independente e somente leitura.

## Primeiro uso do dashboard

1. Abra `http://127.0.0.1:5173`.
2. Cadastre um workspace, como `/home/usuario/Projetos`.
3. Solicite um scan.
4. Selecione um projeto detectado.
5. Abra a área desejada: servidor, Git, testes, banco, scripts, dependências ou ambiente.

Um workspace representa a pasta que contém projetos. O scanner analisa os diretórios imediatamente abaixo dela.

## Como projetos são reconhecidos

### Rails

Um diretório é reconhecido como Rails quando possui um `Gemfile` que declara a gem `rails`.

### Node

Um diretório é reconhecido como Node quando possui `package.json`.

### Capacidades

Depois de reconhecer o tipo, o scanner identifica recursos disponíveis, como:

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

A interface deve mostrar somente operações compatíveis com as capacidades detectadas.

## Autenticação no desenvolvimento

A API gera um token local em:

```text
~/.config/dev-dashboard/api-token
```

O proxy do Vite lê esse token no processo Node e adiciona `X-Dev-Dashboard-Token` às chamadas para `/api`. O token não é incluído no bundle do navegador.

Clientes de linha de comando precisam fornecer o header manualmente nas rotas privadas. O health check permanece público.

## Diretórios locais

### Configuração

```text
~/.config/dev-dashboard
```

Pode ser alterado por:

```text
DEV_DASHBOARD_CONFIG_DIR
XDG_CONFIG_HOME
```

### Estado e logs

```text
~/.local/state/dev-dashboard
```

Pode ser alterado por:

```text
DEV_DASHBOARD_STATE_DIR
XDG_STATE_HOME
```

Arquivos privados devem usar permissões restritas ao usuário.

## Distribuição local compilada

Para compilar e executar a API servindo o frontend estático:

```bash
npm run dev-web
```

Esse modo:

- executa diagnóstico e build;
- valida os artefatos do frontend;
- inicia somente a API compilada;
- gera uma capacidade efêmera de bootstrap;
- imprime uma URL que deve ser aberta integralmente;
- não inicia Vite nem a central de documentação.

A central de documentação é uma ferramenta do ambiente de desenvolvimento. Para executá-la separadamente, use `npm run docs:dev`.

## Validação do projeto

```bash
npm run docs:api
npm run typecheck
npm run build
npm test
```

### O que cada comando garante

| Comando | Garantia principal |
|---|---|
| `npm run docs:api` | Regenera os contratos HTTP a partir das rotas reais. |
| `npm run docs:api:check` | Falha se a referência gerada estiver desatualizada. |
| `npm run typecheck` | Valida tipos em workspaces que oferecem esse script. |
| `npm run build` | Compila pacotes, API e web. |
| `npm test` | Executa testes dos scripts e de todos os workspaces. |
| `npm run test:e2e` | Compila e executa o fluxo E2E da web. |

## Próximas leituras

- [Estrutura do repositório](architecture/repository-structure.md)
- [Fluxos de execução](architecture/runtime-flows.md)
- [Guia de desenvolvimento](development-guide.md)
- [Operação e troubleshooting](operations-and-troubleshooting.md)
