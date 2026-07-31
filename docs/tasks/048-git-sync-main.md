# Task 048 — Sincronização simples da main

## Status

Concluída.

## Objetivo

Transformar Sincronização na primeira ferramenta do painel Git e reduzir a
tela a uma única ação cotidiana: atualizar a branch local `main` a partir do
repositório principal e publicá-la em `origin/main`.

## Escopo entregue

- Sincronização passa a ser a primeira aba e a entrada padrão do painel Git;
- Branches passa a ocupar a segunda posição;
- remoção do título, descrição, seletores, pipeline, contadores, ações rápidas
  e referências visíveis a `upstream`;
- painel único com a relação `main → origin/main`, estado atual, texto curto e
  botão "Sincronizar";
- operação única e confirmada que:
  1. valida repositório, árvore de trabalho limpa, branch `main` e remotes;
  2. executa `git fetch --prune upstream`;
  3. executa `git checkout main`;
  4. integra `upstream/main` com `git merge --no-edit upstream/main`;
  5. publica com `git push origin main:main`;
- aborto automático do merge em caso de conflito;
- recarga do overview e do workspace após a sincronização.

## Decisões

- `upstream` continua sendo a fonte técnica da atualização, mas não faz parte
  do modelo mental apresentado na tela.
- A integração usa `upstream/main`. Executar `git merge main` após trocar para
  a própria `main` não produziria alteração.
- A sincronização sempre termina na branch `main`, como definido pelo fluxo.
- A ação fica indisponível quando há alterações locais pendentes, quando a
  branch `main` não existe ou quando os remotes obrigatórios não estão
  configurados.
- O estado "Tudo sincronizado" exige que as referências conhecidas de `main`,
  `origin/main` e `upstream/main` apontem para o mesmo commit. Nesse estado, o
  aviso de working tree sujo da branch aberta não substitui a informação e a
  ação permanece desabilitada por não haver trabalho a executar.

## Segurança

- o navegador não envia nomes de branch, remote, referência ou argumentos Git;
- todos os comandos e argumentos são definidos pelo catálogo fechado da API;
- a mutação exige token aleatório de confirmação, vinculado ao projeto, com
  validade curta e consumo único;
- os comandos usam `execFile` sem `shell: true`;
- a árvore de trabalho é validada antes do fetch, checkout, merge e push.

## Verificação

```bash
npm run typecheck
npm run build
npm test
```

`typecheck` e `build` passaram. A API passou com 254 testes e o frontend com
179 testes. A suíte raiz alcançou os pacotes alterados, mas não concluiu verde
porque 12 testes preexistentes do `process-manager` dependem de interfaces de
rede e falham neste container com `uv_interface_addresses`; o pacote não foi
alterado nesta task.

Os testes do serviço cobrem o fluxo completo com repositórios `upstream` e
`origin` reais em diretórios temporários. Os testes de componente cobrem a aba
padrão, a ordem do menu, o layout sem detalhes de `upstream` e a mutação única
confirmada.

## Arquivos principais

- `apps/web/src/components/ProjectGitPanel.vue`
- `apps/web/src/components/ProjectGitSyncPage.vue`
- `apps/web/src/api/git-workspace.ts`
- `apps/api/src/routes/git-sync.ts`
- `apps/api/src/services/git-sync-service.ts`
- `apps/api/test/git-sync-service.test.ts`
- `apps/web/test/project-git-panel.test.ts`

## Fora do escopo

- escolher outra branch, referência remota ou estratégia;
- exibir os comandos Git no frontend;
- resolver conflitos automaticamente;
- sincronizar branches diferentes de `main`.
