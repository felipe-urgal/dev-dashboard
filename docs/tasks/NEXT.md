# Próxima atividade — 043: git-pr no painel Git

## Contexto

A "paridade CLI→Web seletiva" do Horizonte 2 já trouxe `git-save` (task
041) e a lacuna real de `dev-clean` (task 042, logs órfãos). `dev-kill-port`
foi avaliado e adiado na 042 por conflitar com a validação obrigatória de
identidade de processo (`docs/architecture/security.md`). O próximo item
do mesmo ponto do roadmap ainda pendente é `git-pr`: hoje exclusivo do CLI
bash (`lib/git/`), abre a criação de pull request a partir do branch atual.

## Objetivo

Levar ao painel Git do dashboard web uma ação equivalente a `git-pr`:
publicar o branch atual em `origin` (reaproveitando o push da task 025
quando ainda não publicado) e abrir a URL de criação de PR do provedor
remoto (GitHub/GitLab) com base e branch já preenchidos — sem chamar a API
do provedor nem exigir token de terceiros.

## Plano sugerido

1. Estudar `lib/git/` para `git-pr` (provavelmente compõe a URL a partir do
   remote `origin` e do branch atual) e o suporte a push já existente
   (`GitService`/rotas de `apps/api/src/routes/git*.ts`, task 025) para não
   duplicar a etapa de publicação do branch.
2. Detectar o provedor a partir da URL do remote `origin` (GitHub e GitLab
   pelo menos) e compor a URL de "novo PR/MR" comparando o branch atual
   contra o branch padrão do repositório. Decidir o que fazer quando o
   remote não é reconhecido (provavelmente recusar com erro claro em vez de
   adivinhar um formato genérico).
3. Definir se a API deve apenas retornar a URL composta (o navegador abre
   em nova aba) ou se cabe algum efeito colateral no servidor — dado que
   isso é só leitura/composição de URL, não deveria exigir o mesmo
   token de confirmação de mutação usado por save/commit/push, mas o push
   prévio (quando o branch ainda não foi publicado) continua exigindo.
4. Painel Git: novo botão/seção "Abrir pull request", reaproveitando o
   fluxo de push existente quando necessário antes de abrir a URL.
5. Testes de serviço (composição de URL para GitHub e GitLab, remote não
   reconhecido, branch igual ao padrão), de rota e de componente.

## Segurança

- Nenhuma chamada à API do provedor remoto (GitHub/GitLab) nem token de
  terceiros — apenas composição de URL a partir do remote já configurado
  localmente.
- A publicação do branch (quando necessária) reaproveita a mesma validação
  e confirmação já existentes para push (task 025); nenhuma nova superfície
  de mutação além dessa.
- URL composta não deve vazar credenciais eventualmente embutidas na URL do
  remote (ex. `https://user:token@host/...`).

## Fora do escopo

- Integração com a API do GitHub/GitLab (criar o PR de fato, listar
  revisores, etc.) — abrir a URL de composição no navegador é a fatia
  proposta.
- Snapshot/restore de banco (fatia própria do mesmo item do roadmap).
- `dev-kill-port` (mutação ou diagnóstico) — decisão registrada na task 042.

## Critérios de aceite

- ação disponível no painel Git com feedback claro quando o remote não é
  reconhecido;
- nenhuma credencial de remote exposta na URL composta;
- decisão registrada sobre exigência (ou não) de confirmação em duas
  etapas para a composição da URL, distinta do push que a antecede;
- `npm run typecheck`, `npm run build` e `npm test` passam.
