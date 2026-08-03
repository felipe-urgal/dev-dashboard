# Task 076 — Fundação da IDE embutida

## Status

Implementada em branch para revisão. A entrega adiciona a primeira versão da
IDE somente leitura, usando Monaco desde o início e sem habilitar escrita, LSP
ou IA.

## Objetivo

Entregar uma área **Editor** dentro do detalhe do projeto, com explorer, abas,
busca textual e leitura segura dos arquivos locais.

## Escopo entregue

- rota `/projects/:projectId/editor` e aba **Editor**;
- Monaco Editor `0.56.0`, carregado sob demanda e configurado com workers do
  Vite para editor, JSON, CSS, HTML e TypeScript;
- explorer lazy, ordenado com diretórios antes de arquivos;
- abas de arquivos abertas e modelos por URI lógica sem expor o caminho
  absoluto;
- busca textual limitada no projeto;
- posicionamento do cursor ao abrir um resultado;
- tema claro/escuro sincronizado com o dashboard;
- fallback textual quando o Monaco não puder inicializar;
- ação existente de abrir no editor local preservada dentro da IDE;
- API e contratos compartilhados para listar, ler e buscar arquivos;
- testes de serviço, rota e componente.

## Segurança

O navegador envia somente `projectId` e caminhos relativos. A API recupera a
raiz pelo `ProjectStore` e aplica:

- `realpath` na raiz e no destino;
- recusa de caminhos absolutos, `..`, segmentos ambíguos, NUL e barras de
  plataforma não autorizadas;
- recusa de symlinks que escapem da raiz;
- exclusão de `.git`, `node_modules`, `vendor/bundle`, `coverage`, `dist`,
  `build` e `tmp/log`;
- exclusão automática de `.env*`, chaves privadas, PEM e `config/master.key`;
- limite de 512 KiB por arquivo;
- detecção de binário por NUL e UTF-8 inválido;
- limite de 500 entradas por diretório, 2.000 arquivos por busca, profundidade
  12 e até 100 resultados;
- nenhuma escrita ou execução de comandos.

## Contratos

Foram adicionados:

- `ProjectFileEntry`;
- `ProjectDirectoryListing`;
- `ProjectFileContent`;
- `ProjectFileSearchMatch`;
- `ProjectFileSearchResult`.

Endpoints:

```http
GET /api/projects/:projectId/files?path=<relativePath>
GET /api/projects/:projectId/files/content?path=<relativePath>
GET /api/projects/:projectId/files/search?query=<term>&limit=<n>
```

## Arquivos principais

- `packages/contracts/src/project-files.ts`;
- `apps/api/src/services/project-file-service.ts`;
- `apps/api/src/routes/project-files.ts`;
- `apps/web/src/components/ProjectEmbeddedEditor.vue`;
- `apps/web/src/monaco-environment.ts`;
- `apps/web/src/api/project-files.ts`;
- `apps/api/test/project-file-service.test.ts`;
- `apps/api/test/project-file-routes.test.ts`;
- `apps/web/test/project-embedded-editor.test.ts`.

## Critérios de aceite

- nenhum caminho fora da raiz do projeto pode ser lido;
- symlinks que escapem da raiz são recusados;
- arquivos sensíveis, binários e acima do limite não são abertos;
- a árvore não carrega recursivamente todo o projeto;
- troca de projeto descarta árvore, abas e modelos anteriores;
- Monaco possui fallback funcional;
- a interface deixa explícito que a versão é somente leitura;
- build, typecheck e testes passam no CI.

## Fora desta task

- salvar, criar, renomear ou excluir arquivos;
- terminal embutido;
- TypeScript Language Server ou Ruby LSP;
- chat, completion ou alteração por IA;
- embeddings e índice semântico;
- extensões do VS Code;
- suporte mobile completo.

## Próxima atividade

Task 077 — escrita atômica, conflitos externos e operações estruturais de
arquivo, sempre com preview proporcional ao risco.
