# Próxima atividade — 023: Consolidação do CSS legado

## Contexto

Os passos 1 a 6 da reforma de design já introduziram tokens, componentes compartilhados, cards de projeto e dashboard, status, tema e densidade. O `styles.css` ainda reúne regras antigas desabilitadas ou duplicadas e cores literais para áreas que já possuem substitutos, impedindo o critério de saída da etapa 2.

## Objetivo

Executar o passo 7 do roteiro em `docs/design/redesign-2026.md`: remover CSS legado sem uso, consolidar as regras restantes nas camadas planejadas e reduzir exceções locais sem provocar regressão funcional ou visual.

## Plano detalhado

1. Inventariar seletores de `apps/web/src/styles.css` contra templates Vue e separar regras ativas, duplicadas e comprovadamente órfãs.
2. Remover primeiro seletores órfãos e duplicações já substituídas por `<Card>`, `<StatusBadge>` e tokens, em lotes verificáveis.
3. Popular as camadas base, layout, components e utilities sob `apps/web/src/styles/`, preservando a ordem de cascata explicitamente.
4. Migrar cores e medidas ativas restantes para tokens existentes; criar token novo somente quando houver uso compartilhado demonstrado.
5. Manter no `styles.css` apenas imports e exceções documentadas, respeitando o limite definido no critério de saída do redesign.
6. Adicionar verificações automatizadas para seletores estruturais críticos e para impedir a reintrodução das famílias legadas removidas.
7. Validar todas as rotas em temas claro e escuro, densidades cômoda e compacta, desktop e largura estreita; registrar diferenças reais.

## Fora do escopo

- Novos componentes ou fluxos de produto.
- Rebranding ou alteração da arquitetura da navegação.
- Drawer móvel completo.
- Biblioteca externa de estilos.

## Critérios de aceite

- nenhum seletor removido permanece referenciado por templates ou testes;
- `styles.css` contém somente imports e no máximo 100 linhas de exceções justificadas;
- componentes ativos não dependem de famílias visuais legadas já substituídas;
- temas, densidades e breakpoints preservam as rotas principais;
- `npm run typecheck`, `npm run build` e `npm test` passam.
