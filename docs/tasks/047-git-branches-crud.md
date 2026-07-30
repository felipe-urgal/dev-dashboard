# Task 047 — CRUD simples de branches

## Status

Concluída.

## Objetivo

Transformar a primeira tela do painel Git em uma ferramenta focada apenas no
controle cotidiano de branches locais e na leitura passiva do remote
`origin`. A entrada do painel agora abre diretamente em Branches, sem o resumo
intermediário e sem duplicar comandos que pertencem à aba Sincronização.

## Escopo entregue

- remoção da aba "Resumo"; Branches passa a ser a entrada padrão do painel
  Git;
- lista única que agrupa branches locais e referências de `origin` pelo nome,
  com filtros "Todas", "Locais" e "Remotas", estado atual e presença em cada
  lado;
- remoção de busca, título, descrição e comandos de fetch, pull, push,
  publicação ou tracking da tela de Branches;
- modal centralizado para criar uma branch a partir da atual, com os prefixos
  `feature/`, `bugfix/`, `hotfix/`, `docs/`, `refactor/` e `test/`, prévia do
  nome completo e ação "Criar e trocar";
- troca de branch local diretamente pela lista;
- renomeação de branch local com confirmação em duas etapas e proteção
  explícita de `main`/`master`;
- remoção forçada de branch local, inclusive sem merge, com digitação do nome
  e confirmação em duas etapas; branch atual e `main`/`master` continuam
  protegidas;
- remoção do antigo enhancer DOM e dos ajustes de tema que ficaram obsoletos
  após a tela passar a ter um componente Vue único.

## Decisões e limitações

- `origin` é informação passiva nesta tela. Sincronizar referências, publicar,
  baixar ou configurar tracking continua sendo responsabilidade da aba
  Sincronização.
- A remoção entregue atua somente na branch local. Excluir uma referência
  remota e fechar automaticamente um pull request exigem integração autorizada
  com o provedor; isso não foi acoplado ao CRUD local nem inferido a partir de
  credenciais do ambiente.
- Referências de outros remotes, como `upstream`, não aparecem nesta tela.
- Branch remota sem correspondente local é somente leitura.

## Segurança

- nomes de branch são validados no servidor e enviados ao Git como argumentos,
  sem `shell: true`;
- renomeação e remoção exigem tokens de confirmação curtos, vinculados ao
  projeto e aos nomes envolvidos;
- `main`, `master` e a branch atualmente selecionada não podem ser removidas;
- a API não aceita nome de remote ou ação de provedor vinda deste fluxo.

## Verificação

```bash
npm run typecheck
npm run build
npm test
```

Também foram cobertos por testes de componente: entrada direta em Branches,
leitura passiva de `origin`, criação com prefixo, renomeação e remoção com nome
digitado. Os serviços de API cobrem renomeação, proteção, confirmação e remoção
forçada de branch não integrada.

## Arquivos principais

- `apps/web/src/components/ProjectGitPanel.vue`
- `apps/web/src/components/ProjectGitBranchesPage.vue`
- `apps/web/src/components/ProjectGitBranchesPage.css`
- `apps/web/src/api/git.ts`
- `apps/api/src/routes/git-branch-rename.ts`
- `apps/api/src/services/git-branch-rename-service.ts`
- `apps/api/src/services/git-branch-delete-service.ts`

## Fora do escopo

- fetch, pull, push, publicação e tracking;
- excluir branch de `origin`;
- consultar ou fechar pull requests via API do GitHub/GitLab;
- administrar remotes diferentes de `origin`.
