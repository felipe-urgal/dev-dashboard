# Próxima atividade — 022: Tema e densidade na navegação global

## Contexto

Tokens e componentes compartilhados já cobrem cards, badges, painéis de projeto e o dashboard principal. O passo 6 do roteiro em `docs/design/redesign-2026.md` prevê tornar tema e densidade preferências reais e iniciar sua aplicação pelo shell global, hoje ainda preso aos valores escuros e espaçamentos legados.

## Objetivo

Introduzir controles persistentes de tema e densidade na sidebar, aplicando `data-theme` e `data-density` ao elemento raiz sem alterar a arquitetura de navegação ou os fluxos das views.

## Plano detalhado

1. Criar um módulo pequeno e testável de preferências visuais, com valores fechados (`dark|light` e `comfortable|compact`), defaults seguros e leitura tolerante a valores inválidos do `localStorage`.
2. Aplicar as preferências no `<html>` antes ou durante a montagem da aplicação, evitando flash inconsistente sempre que o bootstrap permitir.
3. Adicionar controles acessíveis na sidebar, com rótulos em português, estado selecionado explícito e operação por teclado.
4. Migrar cores, superfícies, contornos e tipografia da sidebar para tokens, mantendo suas regras estruturais e breakpoints atuais.
5. Definir os ajustes de espaçamento de `data-density='compact'` somente para o shell e padrões compartilhados que suportem a redução sem quebrar conteúdo.
6. Adicionar testes unitários da persistência/normalização e testes montados dos controles, incluindo restauração após nova montagem.
7. Validar visualmente os dois temas e as duas densidades em desktop e largura estreita; documentar diferenças e limitações reais.

## Fora do escopo

- Redesenho da arquitetura de informação ou dos ícones da navegação.
- Drawer móvel completo.
- Preferência sincronizada pela API.
- Remoção final de todo o CSS legado.

## Critérios de aceite

- tema e densidade persistem entre sessões e sempre resultam em atributos válidos no `<html>`;
- sidebar não contém novas cores ou superfícies ad hoc;
- controles possuem rótulo, foco e estado selecionado perceptíveis sem depender apenas de cor;
- tema claro e modo compacto não quebram as rotas principais;
- `npm run typecheck`, `npm run build` e `npm test` passam.
