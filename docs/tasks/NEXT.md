# Próxima atividade — 021: Migrar o dashboard principal para os padrões compartilhados

## Contexto

Tokens, `<Card>`, `<StatusBadge>` e os painéis internos já usam o novo
vocabulário visual. O passo 5 do roteiro em
`docs/design/redesign-2026.md` leva esse padrão à tela inicial, hoje
ainda composta por hero, painel de workspace e lista com regras
legadas próprias.

## Objetivo

Migrar `DashboardView` e seus blocos diretos para tokens e componentes
compartilhados, preservando todos os fluxos de cadastro, seleção,
scan, favorito e remoção de workspace/projeto.

## Plano detalhado

1. Inventariar as classes do hero, formulário/painel de workspace e
   lista de projetos, relacionando cada uma a token ou componente já
   existente.
2. Compor os blocos de conteúdo sobre `<Card>` e usar os slots
   `header`/`actions`, sem alterar contratos do store ou chamadas à API.
3. Substituir cores, espaçamentos, raios e tipografia locais pelos
   tokens da etapa 2; manter no CSS legado somente regras estruturais
   específicas da tela.
4. Preservar responsividade e estados vazio, carregando e erro sem
   antecipar a padronização geral desses estados.
5. Ampliar os testes montados do dashboard para cobrir estrutura em
   `<Card>` e os fluxos interativos existentes.
6. Comparar visualmente antes/depois em ambiente com navegador e
   registrar diferenças esperadas no documento de redesign.

## Fora do escopo

- Toggle de tema ou densidade.
- Reforma da sidebar e da topbar global.
- Padronização completa de formulários e empty states em outras views.
- Remoção integral do CSS legado.

## Critérios de aceite

- hero, workspace e lista do dashboard usam os padrões compartilhados;
- nenhuma cor ou superfície ad hoc nova é introduzida;
- fluxos funcionais do dashboard permanecem cobertos e verdes;
- `npm run typecheck`, `npm run build` e `npm test` passam.
