# Task 034 — Command palette com ações autorizadas

## Status

Concluída.

## Objetivo

Ampliar a paleta global para executar o menor conjunto seguro de ações já
permitidas no projeto aberto, sem aceitar comandos, argumentos, caminhos ou
`cwd` livres e sem permitir uma mutação por um único `Enter` acidental.

## Revisão da task 033

A revisão encontrou uma divergência de acessibilidade: o diálogo declarava
`aria-modal="true"`, mas permitia que `Tab` levasse o foco para elementos atrás
do overlay. A paleta agora mantém a navegação por `Tab` dentro dos controles do
diálogo e continua devolvendo o foco ao elemento que a abriu.

A revisão seguinte, na task 035, também impediu ações de servidor enquanto a
consulta de estado ainda está pendente ou falhou. Estado desconhecido não é mais
interpretado como processo parado.

## Inventário e escopo entregue

- **Navegação/leitura:** páginas globais, projetos e áreas do projeto continuam
  sendo destinos identificados visualmente como “Abrir”.
- **Mutação reversível:** iniciar o servidor usa somente o ID do projeto, as
  configurações persistidas já autorizadas e a rota fechada existente.
- **Mutação com atenção:** parar o servidor usa somente o ID do projeto e a rota
  fechada existente.
- **Fora desta fatia:** Git, migrations e scripts executáveis mantêm seus fluxos
  próprios de confirmação/token e não foram duplicados na paleta.

## Escopo entregue

- Descritores tipados de ações de servidor, derivados da capacidade `server` e
  do estado atual do processo.
- Consulta do processo apenas quando a paleta é aberta dentro de um projeto com
  a capacidade correspondente.
- Exibição exclusiva de “Iniciar servidor” ou “Parar servidor” conforme o
  estado; a ação fica ausente durante `stopping`.
- Distinção semântica e visual entre destinos e ações, incluindo o nível de
  risco.
- Confirmação em duas etapas dentro da própria paleta antes de qualquer
  mutação. A paleta permanece aberta para mostrar sucesso ou erro.
- Testes montados de capacidade, disponibilidade, confirmação, execução e
  resultado, além de smoke E2E da ação segura.

## Segurança e decisões

Nenhuma rota foi adicionada. O navegador envia apenas o ID canônico do projeto
e um corpo de porta reconstruído a partir da configuração persistida devolvida
pela API. A busca nunca é usada como comando ou argumento. A paleta não expõe
as mutações sensíveis de Git, banco e catálogo, pois elas dependem de fluxos de
confirmação especializados e tokens de uso único.

## Arquivos principais

- `apps/web/src/components/CommandPalette.vue`
- `apps/web/src/utils/project-command-actions.ts`
- `apps/web/src/styles/components.css`
- `apps/web/test/command-palette.test.ts`
- `apps/web/e2e/tests/navigation.spec.ts`

## Verificação

```bash
npm run typecheck
npm run build
npm test
npm run test:e2e --workspace=@dev-dashboard/web
```

## Limitações

- O estado do painel de servidor montado é atualizado pelo polling normal; não
  foi criado um barramento global apenas para refletir a ação imediatamente.
- Ações administrativas de workspace, comandos personalizados, recentes,
  favoritos e busca fuzzy continuam fora do escopo.
