# Task 049 — Commit simples com criação e amend

## Status

Implementação concluída. Testes automatizados aprovados; QA visual no cloud
browser bloqueado pela indisponibilidade do serviço local de preview.

## Objetivo

Reduzir a aba **Commit** às duas operações cotidianas definidas para a
ferramenta:

- criar um commit com todas as alterações rastreadas, equivalente a
  `git commit -a -m "mensagem"`;
- corrigir o último commit com `git commit --amend`.

Seleção de arquivos, staging, filtros, busca, diff e descarte de alterações não
fazem parte desta tela.

## Resultado

- a tela passou a usar uma única superfície com seletor entre **Novo commit**
  e **Alterar último commit**;
- o modo de criação mostra branch, quantidade de alterações rastreadas,
  mensagem e uma única ação principal;
- o frontend sempre solicita `includeAllChanges: true` no novo commit;
- o modo amend carrega a mensagem do commit mais recente e permite
  substituí-la mesmo com working tree limpo;
- a nova operação `amend` usa confirmação temporária vinculada ao projeto,
  branch e operação;
- a API executa Git com argumentos fechados e sem shell;
- o enhancer antigo de commit e sua interface de arquivos foram removidos.
- o formulário ocupa toda a largura útil do painel Git, alinhado à listagem de
  branches, com espaçamento vertical mais compacto.
- a aba Branches passou a usar o ícone de ramificação da biblioteca visual do
  projeto no lugar do símbolo de código.

## Arquivos principais

- `apps/web/src/components/ProjectGitCommitPage.vue`
- `apps/web/src/components/ProjectGitPanel.vue`
- `apps/web/src/api/git.ts`
- `apps/api/src/routes/git-mutations.ts`
- `apps/api/src/services/git-service.ts`
- `packages/contracts/src/git.ts`
- `apps/web/test/project-git-panel.test.ts`
- `apps/api/test/git-mutation-routes.test.ts`
- `apps/api/test/git-service-mutations.test.ts`

## Segurança

- a UI envia somente a operação conhecida, a mensagem e o token de
  confirmação;
- o projeto e o diretório de execução continuam derivados do `ProjectStore`;
- a mensagem é validada e limitada a 500 caracteres;
- `git commit` e `git commit --amend` são executados via `execFile`, sem
  interpolação em shell;
- o token de confirmação continua válido por uso único e tempo limitado.

## Cobertura automatizada

- renderização sem busca, filtros, staging ou lista de arquivos;
- criação de commit enviando `includeAllChanges: true`;
- carregamento da mensagem atual e envio do amend;
- amend do serviço com working tree limpo;
- recusa de amend sem confirmação;
- rota autenticada de amend.

## Validação

- `npm run typecheck`: aprovado;
- `npm run build`: aprovado;
- API: 257 testes aprovados;
- frontend: 176 testes aprovados;
- `npm test`: os workspaces relacionados passaram, mas a suíte raiz terminou
  com 12 falhas preexistentes em `packages/process-manager`, causadas por
  `uv_interface_addresses` e duas asserções dependentes de processos do
  container. Esse pacote não foi alterado nesta entrega.

## QA visual

O protótipo selecionado está em:

`/workspace/scratch/560252e246ed/generated_images/call_x2xGltXdy9VXgqawlbtGStCs.png`

O servidor local foi iniciado, mas o daemon `sites-preview` não estava
disponível e o cloud browser não conseguiu acessar `terminal.local:4173`.
O bloqueio e a evidência estão registrados em `design-qa.md`.

## Limitações

- `git commit -a` não inclui arquivos ainda não rastreados, seguindo o
  comportamento nativo do Git;
- amend altera a mensagem e incorpora apenas o que já estiver staged pelo
  usuário fora desta ferramenta;
- a inspeção de diff e o controle de staging permanecem fora da aba Commit.
