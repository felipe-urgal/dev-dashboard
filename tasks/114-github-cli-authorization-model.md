# Task 114 — Define o modelo de autorização para o GitHub CLI (`gh`)

## Contexto

Item pendente em `tasks/PENDENCIAS.md`: "Avaliar GitHub CLI somente depois
de definir seu modelo de autorização". A pesquisa para esta task encontrou
algo relevante: o `gh` **já é usado hoje** em `apps/api`, não só no CLI
bash — como fallback silencioso e somente leitura em
`GitPullRequestService.findOpenPullRequest()` e
`GitPullRequestStatusService.enrich()`, quando a API pública do GitHub sem
autenticação falha ou não cobre o dado (conversas não resolvidas exigem
GraphQL, sem equivalente na REST pública). Isso nunca tinha sido formalizado
como decisão de segurança — só existia como detalhe de implementação.

## Decisão

Documentado em `docs/architecture/security.md`, nova subseção "Integração
com o GitHub CLI (`gh`)" dentro de "Riscos conhecidos":

- **Modelo de autorização**: o dashboard não gerencia nenhuma credencial do
  GitHub. `gh` herda a sessão local já autenticada do usuário (`gh auth
  login`, fora do dashboard) via ambiente do processo filho — consistente
  com o modelo de ameaça atual (um único usuário local confiável). O
  dashboard só pode fazer com `gh` o que o próprio usuário já pode fazer no
  terminal dele.
- **O que já está autorizado hoje** (e em produção): leitura (`gh api` GET
  e GraphQL somente leitura) para enriquecer dados já públicos de PR/CI.
  Todas as invocações já seguem o padrão exigido para subprocessos
  (`execFile`, `shell: false`, args fixos, falha silenciosa) e só expõem
  campos estruturados extraídos do payload, nunca o stdout bruto.
- **O que não está autorizado**: nenhuma ação mutável do `gh` (`pr create`,
  `merge`, `close`, `edit`). Formalizado como bloqueado até uma entrega
  própria implementar catálogo fechado de subcomandos + token de
  confirmação de ação mutável (mesmo padrão já usado no catálogo de
  scripts e nas mutações Git) + ações destrutivas bloqueadas por padrão.

## Por que não implementar as ações mutáveis nesta entrega

O item pedia avaliar/definir o modelo antes de expandir — não pedia a
expansão em si, e não há um pedido concreto de produto para `gh pr
create`/`merge` no dashboard web hoje (o CLI bash já cobre isso via
`git-pr`). Formalizar a fronteira agora evita que uma futura extensão do
fallback read-only vire, sem decisão explícita, uma ação mutável sem o
padrão de confirmação em duas etapas do resto do produto.

## Arquivos

- `docs/architecture/security.md`

## Verificação

Documentação pura, sem mudança de comportamento — não há código para
testar. Rodei a suíte mesmo assim para garantir que nada mais no branch
estava quebrado:

```bash
npm run typecheck
npm run build
npm test
```
