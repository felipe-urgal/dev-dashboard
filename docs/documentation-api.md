# API da documentação

A central de documentação é um serviço HTTP local, somente leitura, iniciado por `scripts/docs-server.mjs`.

## Objetivos

- tornar a documentação navegável sem serviço externo;
- indexar automaticamente Markdown versionado;
- oferecer busca local;
- permitir integrações simples por JSON;
- subir e encerrar junto do ambiente de desenvolvimento;
- não adicionar dependências de runtime ao monorepo.

## Inicialização

```bash
npm run docs:dev
```

Padrão:

```text
http://127.0.0.1:4545
```

Porta alternativa:

```bash
DEV_DASHBOARD_DOCS_PORT=4546 npm run docs:dev
```

O host é fixo em `127.0.0.1`.

## Fontes catalogadas

O servidor inclui:

- `README.md`;
- `CONTRIBUTING.md`, quando existente;
- todos os arquivos `docs/**/*.md`;
- documentos de arquitetura;
- referência gerada da API.

O planejamento e o histórico de tasks vivem em `tasks/` (`PENDENCIAS.md`,
`NEXT.md`, os documentos numerados `tasks/NNN-*.md`), fora de `docs/` e
portanto fora deste catálogo — a central de documentação é só documentação
de produto/arquitetura.

São ignorados:

- diretórios ocultos;
- `node_modules`;
- `docs/site`, que contém a interface;
- arquivos que não terminam em `.md`.

## Segurança

O serviço:

- escuta somente no loopback;
- aceita apenas `GET` e `HEAD`;
- não executa comandos;
- não grava arquivos;
- recusa caminhos absolutos e traversal;
- resolve o caminho real antes da leitura;
- entrega somente documentos presentes no catálogo;
- aplica headers de segurança e `no-store`;
- não expõe arquivos de configuração, estado ou código-fonte arbitrário.

A documentação pode conter informações internas do projeto. O serviço não deve ser publicado na rede.

## `GET /api/health`

Retorna o estado básico.

### Resposta

```json
{
  "status": "ok",
  "service": "dev-dashboard-docs",
  "host": "127.0.0.1",
  "port": 4545
}
```

## `GET /api/docs`

Gera o catálogo atual.

### Campos principais

| Campo | Descrição |
|---|---|
| `name` | Nome da central. |
| `description` | Descrição do conteúdo. |
| `generatedAt` | Horário em que o catálogo foi montado. |
| `defaultDocument` | Página aberta por padrão. |
| `groups` | Navegação agrupada. |
| `pages` | Lista plana de documentos. |

### Página

```json
{
  "path": "docs/architecture/overview.md",
  "title": "Visão geral da arquitetura",
  "description": "...",
  "group": "Arquitetura",
  "priority": 30,
  "bytes": 12345,
  "headings": [
    { "level": 1, "title": "Visão geral da arquitetura" }
  ]
}
```

O catálogo é recalculado em cada request para refletir arquivos adicionados, removidos ou renomeados durante o desenvolvimento.

## `GET /api/docs/content?path=...`

Retorna um documento catalogado.

### Exemplo

```text
GET /api/docs/content?path=docs%2Findex.md
```

### Resposta

```json
{
  "path": "docs/index.md",
  "title": "Dev Dashboard — documentação do projeto",
  "markdown": "# Dev Dashboard..."
}
```

### Erros

| Status | Código | Situação |
|---:|---|---|
| 400 | `INVALID_DOCUMENT_PATH` | Caminho vazio ou inválido. |
| 400 | `DOCUMENT_OUTSIDE_SCOPE` | Caminho absoluto, traversal ou fora do repositório. |
| 404 | `DOCUMENT_NOT_FOUND` | Arquivo ausente ou não catalogado. |

## `GET /api/search?q=...`

Busca por título, headings e conteúdo.

### Regras

- consulta mínima de dois caracteres;
- normalização de acentos e caixa;
- todos os termos precisam aparecer em título, headings ou corpo;
- título recebe maior peso;
- máximo de trinta resultados;
- documentos muito grandes podem ser ignorados na busca, mas continuam navegáveis.

### Resposta

```json
{
  "query": "process manager",
  "results": [
    {
      "path": "docs/architecture/repository-structure.md",
      "title": "Estrutura do repositório e responsabilidades",
      "group": "Arquitetura",
      "snippet": "..."
    }
  ]
}
```

## Interface web

`docs/site/index.html` contém a aplicação estática da central.

Recursos:

- navegação agrupada;
- busca com atalho `/`;
- renderização de headings, listas, tabelas, citações e blocos de código;
- sumário da página;
- links entre documentos;
- deep link por query string;
- cópia de código;
- tema claro/escuro;
- layout responsivo;
- suporte a movimento reduzido.

## Deep links

Uma página pode ser aberta diretamente:

```text
http://127.0.0.1:4545/?doc=docs%2Farchitecture%2Fsecurity.md
```

Headings usam fragmento normal:

```text
http://127.0.0.1:4545/?doc=docs%2Farchitecture%2Fsecurity.md#autenticacao-local
```

## Atualização de conteúdo

Edite qualquer arquivo Markdown e recarregue a página. Não existe build da documentação.

Ao criar uma página importante, adicione-a à prioridade principal em `scripts/docs-server.mjs` para posicioná-la corretamente. Páginas não configuradas continuam aparecendo no grupo inferido.

## Testes

```bash
node --test scripts/docs-server.test.mjs
```

A cobertura valida:

- catálogo e ordem;
- grupos;
- proteção contra traversal;
- recusa de documento não catalogado;
- busca;
- health;
- catálogo HTTP;
- leitura de conteúdo.

## Limites atuais

- o renderer implementa o subconjunto Markdown necessário ao repositório;
- não executa Mermaid ou plugins;
- não fornece edição pelo navegador;
- não possui autenticação própria porque é somente leitura e loopback;
- busca é em memória e adequada ao volume atual;
- a referência HTTP muito grande pode ficar fora da busca integral.

Mudanças que ampliem o escopo de arquivos, adicionem escrita ou permitam acesso remoto exigem nova revisão de segurança.
