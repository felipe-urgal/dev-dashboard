# 004 — Scripts e tarefas do projeto

## Status

Implementada e validada por testes automatizados.

## Objetivo

Disponibilizar a aba `/projects/:projectId/scripts` com um catálogo seguro e
somente leitura de scripts Node, tarefas Rails públicas e executáveis conhecidos.

## Escopo entregue

- contratos de item, origem, risco e paginação;
- leitura estática de `scripts` do `package.json`, sem executar seu conteúdo;
- coleta limitada de `bin/rails -T` e catálogo fechado de executáveis em `bin/`;
- classificação inicial entre somente leitura, mutável e destrutivo;
- ações destrutivas marcadas como desabilitadas;
- endpoint paginado com busca e filtros por origem e risco;
- aba responsiva com carregamento, erro, vazio e invalidação ao trocar de projeto.

## Decisões de segurança

1. A rota recebe somente o identificador e filtros limitados; o caminho vem do `ProjectStore`.
2. Scripts Node são analisados como JSON e nunca executados durante a detecção.
3. A consulta Rails usa argumentos fixos, `shell: false`, `cwd` do projeto, limite de saída e timeout.
4. Executáveis de `bin/` pertencem a uma lista fechada; nomes arbitrários são ignorados.
5. Detalhes internos de resolução não existem no contrato público e o schema enumera todos os campos.
6. Esta entrega não oferece endpoint de execução e mantém todos os botões desabilitados.

## Testes automatizados

- scripts Node são catalogados sem executar o conteúdo;
- classificação destrutiva desabilita o item;
- filtros, paginação e ordenação são reproduzíveis;
- executáveis não reconhecidos de `bin/` ficam fora do catálogo.

## Limitações conhecidas

- `bin/rails -T` carrega o ambiente do projeto e pode executar inicializadores; por isso possui timeout, mas projetos locais continuam potencialmente não confiáveis;
- a classificação de risco é conservadora e baseada no nome da ação;
- o preview Node usa `npm run`; seleção do gerenciador será necessária antes de executar;
- execução, argumentos, histórico e logs permanecem fora desta entrega.

## Próxima atividade

Descrita em `docs/tasks/NEXT.md`.
