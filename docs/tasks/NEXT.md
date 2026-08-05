# Próxima atividade

## Task 105 — Revisão dirigida do `npm audit`

### Objetivo

`docs/PENDENCIAS.md` ("Qualidade e manutenção") registra como pendência
fazer uma revisão dirigida do `npm audit`, sem `npm audit fix --force` às
cegas. Hoje (`npm audit`, raiz do monorepo) o relatório mostra:

```
dompurify  <=3.4.11
Severity: moderate
- DOMPurify: CUSTOM_ELEMENT_HANDLING bypassa afterSanitizeElements para
  custom elements permitidos
- DOMPurify: poluição permanente de ALLOWED_ATTR via setConfig() (correção
  incompleta do patch de 3.4.7)
- DOMPurify: política Trusted Types sobrevive a clearConfig() e pode
  envenenar saída RETURN_TRUSTED_TYPE
fix available via `npm audit fix --force`
Will install monaco-editor@0.53.0, which is a breaking change
  monaco-editor  >=0.54.0-dev-20250909
  Depends on vulnerable versions of dompurify
```

`dompurify` é uma dependência transitiva de `monaco-editor` (editor
embutido, `apps/web`). O projeto também sanitiza HTML manualmente em pelo
menos um ponto (`apps/web/src/utils/sql-highlight.ts` faz escape próprio,
não usa `dompurify`) — checar se há uso direto de `dompurify` fora do editor
antes de avaliar o risco real.

### Escopo proposto

- Confirmar com `npm ls dompurify` e `npm ls monaco-editor` que a única
  rota de exposição é o editor embutido, e se o uso do Monaco no projeto
  passa conteúdo não confiável para as APIs que dependem de `dompurify`
  (ex. hover/preview markdown) ou só edita arquivos do próprio workspace do
  usuário — isso muda a severidade prática do achado.
- Avaliar se atualizar `monaco-editor` para a versão que resolve o
  `dompurify` vulnerável (`npm audit fix --force` aponta `0.53.0`, marcado
  como breaking change) é viável sem regressão: atualizar a versão em
  `apps/web/package.json` manualmente (não usar `--force` direto), revisar
  o changelog do Monaco entre a versão atual e a alvo, e então rodar
  `npm run typecheck`, `npm run build`, `npm test` e o smoke E2E do editor
  embutido (`npm run test:e2e`).
- Se o upgrade não for viável nesta entrega (breaking change grande demais),
  documentar o risco aceito com justificativa (uso só local, conteúdo do
  workspace do próprio usuário) e a versão mínima segura para uma futura
  atualização, em vez de deixar o achado do `npm audit` sem decisão
  registrada.
- Revisar o restante das dependências diretas desatualizadas (`npm outdated`
  na raiz e em `apps/web`) só para itens de baixo risco (patch/minor sem
  breaking change documentado); não é escopo desta task fazer upgrade de
  major de nenhuma dependência direta sem avaliação própria.
- Atualizar `docs/PENDENCIAS.md` removendo ou reduzindo o item de `npm
  audit` conforme o resultado.

### Critérios de aceite

- `npm audit` documentado com decisão explícita (corrigido, ou aceito com
  justificativa) para cada achado atual — nenhum item shipado sem decisão
  registrada.
- Se houver upgrade de `monaco-editor`: `npm run typecheck`, `npm run
  build`, `npm test` e `npm run test:e2e` verdes, sem mudança de
  comportamento do editor embutido além do que o changelog da nova versão
  descreve.
- `docs/PENDENCIAS.md` atualizado.

### Fora de escopo

- Upgrades de dependências não relacionados aos achados do `npm audit`
  atual.
- Adotar Dependabot/Renovate ou qualquer automação de atualização contínua
  — isso é uma decisão de governança separada, não parte desta revisão
  pontual.
