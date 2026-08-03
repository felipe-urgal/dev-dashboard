# Task 076 — Fundação da IDE embutida

## Status

Planejada. A implementação começa somente depois da task 075 e deve seguir o
desenho em `docs/architecture/embedded-ide-ai-design.md`.

Este registro foi criado em uma entrega exclusivamente documental. Nenhum
endpoint, dependência ou comportamento do produto foi alterado.

## Objetivo

Entregar a primeira fatia segura da IDE dentro do Dev Dashboard, usando Monaco
desde o início e preparando os contratos necessários para escrita, LSP e IA
local nas tasks seguintes.

## Escopo proposto

- adicionar uma nova aba **Editor** aos detalhes do projeto;
- integrar Monaco Editor e seus workers ao Vite;
- criar explorer, abas e modelos por URI lógica do projeto;
- listar diretórios e ler arquivos textuais por caminhos relativos validados;
- oferecer busca textual limitada;
- preservar a ação **Abrir no editor local** dentro da IDE;
- manter a primeira versão somente leitura;
- definir contratos compartilhados de arquivo, versão e erros públicos;
- adicionar testes de path traversal, symlink, binário, limite de tamanho,
  paginação e troca de projeto;
- documentar as versões fixadas de Monaco e `monaco-languageclient` antes do
  primeiro código LSP.

## Decisões

- Monaco entra na primeira implementação; não será criado um editor temporário
  com outra biblioteca.
- A primeira fatia é somente leitura para validar confinamento, performance e
  experiência antes de permitir gravação.
- Caminhos absolutos nunca chegam ao navegador.
- A API recupera a raiz canônica do projeto pelo `ProjectStore`.
- Arquivos sensíveis, binários e diretórios pesados ficam fora da árvore
  padrão.
- A IDE é desktop-first; telas pequenas podem oferecer leitura simplificada e
  abertura no editor local.
- LSP e IA não fazem parte desta task, mas os contratos e URIs não podem impedir
  as tasks 078–081.

## Sequência aprovada

- **076:** Monaco, explorer e leitura segura;
- **077:** escrita atômica, conflitos e operações de arquivo;
- **078:** LSP JavaScript/TypeScript;
- **079:** Ruby/Rails LSP;
- **080:** IA local gratuita com Ollama;
- **081:** completion inline, FIM e contexto semântico opt-in.

## Critérios de aceite

- nenhum caminho fora da raiz do projeto pode ser lido;
- symlinks que escapem da raiz são recusados;
- arquivos binários e acima do limite retornam erro público específico;
- a árvore não bloqueia a interface em projetos grandes;
- troca de projeto cancela requests e descarta modelos anteriores;
- tema, densidade, teclado e foco seguem os padrões do dashboard;
- build, typecheck, testes montados e testes de API passam;
- a UI continua funcional quando Monaco falha ao carregar;
- nenhum código de escrita, LSP ou IA é habilitado nesta fatia.

## Fora desta task

- salvar, criar, renomear ou excluir arquivos;
- terminal embutido;
- TypeScript Language Server ou Ruby LSP;
- chat, completion ou alteração por IA;
- embeddings e índice semântico;
- extensões do VS Code;
- suporte mobile completo.

## Próximos documentos

- arquitetura: `docs/architecture/embedded-ide-ai-design.md`;
- editor externo existente: `docs/architecture/local-editor-design.md`;
- segurança geral: `docs/architecture/security.md`;
- fila executável atual: `docs/tasks/NEXT.md`.
