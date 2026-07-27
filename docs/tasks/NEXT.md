# Próxima atividade — 034: Command palette (ações autorizadas)

## Contexto

A task 033 estabeleceu a paleta global para navegação, incluindo busca,
teclado, foco e roteamento. A segunda fatia deve cumprir a parte restante do
item do Horizonte 2: localizar ações já autorizadas nas telas, sem transformar
a paleta em uma entrada para shell arbitrário ou enfraquecer confirmações.

## Objetivo

Exibir, quando um projeto estiver aberto, ações que já existem e são
permitidas naquele contexto (por exemplo iniciar/parar servidor e abrir uma
área que contém testes ou scripts), mantendo exatamente as mesmas regras de
capacidade, risco, confirmação e execução da tela de origem.

## Plano detalhado

1. Inventariar ações existentes por tela e classificá-las como navegação,
   leitura, mutação reversível ou mutação sensível; documentar quais entram
   nesta primeira fatia executável.
2. Extrair descritores tipados de ação para que tela e paleta compartilhem
   rótulo, disponibilidade e risco sem duplicar regras de capacidade.
3. Começar pelo menor conjunto seguro: ações de processo já fechadas pelo
   backend e atalhos que apenas abrem a área correta. Não aceitar comando,
   argumento, caminho ou `cwd` digitado na paleta.
4. Para qualquer mutação, reutilizar o fluxo de confirmação da tela de
   origem. A paleta deve mostrar visualmente o nível de risco e nunca executar
   uma ação sensível só com um `Enter` acidental.
5. Manter estados de carregamento, sucesso e erro compreensíveis; fechar a
   paleta somente quando isso não esconder o resultado necessário.
6. Cobrir disponibilidade por capacidade, bloqueio de ações indisponíveis,
   confirmação, execução e erro com testes montados; acrescentar um smoke E2E
   de uma ação segura.

## Segurança

- Ler `docs/architecture/security.md` antes de alterar qualquer rota.
- Preferir as rotas existentes. Se uma rota nova for inevitável, declarar
  schemas completos, exigir token e resolver projeto/caminho exclusivamente
  pelo `ProjectStore`.
- A paleta envia apenas identificadores pertencentes a catálogos fechados;
  nunca strings de shell, argumentos livres ou caminhos absolutos.
- Confirmações atuais continuam obrigatórias e com o mesmo escopo/TTL.

## Fora do escopo

- Shell/terminal embutido ou comandos personalizados.
- Ações administrativas de workspace.
- Recentes, favoritos ou busca fuzzy.
- Relaxar confirmações para tornar a interação mais rápida.

## Critérios de aceite

- somente ações válidas para o projeto/contexto aparecem;
- ações mutáveis preservam a confirmação e deixam o risco explícito;
- nenhuma entrada livre alcança processo, filesystem ou shell;
- teclado e leitores de tela distinguem destinos de navegação e ações;
- `npm run typecheck`, `npm run build`, `npm test` e o smoke E2E passam.
