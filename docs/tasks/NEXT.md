# Próxima atividade

## Task 105 — Revisão dirigida do `npm audit`

### Objetivo

Transformar o resultado atual do `npm audit` em um inventário confiável e
acionável, separando vulnerabilidades relevantes para o runtime local das que
existem apenas em ferramentas de desenvolvimento, sem usar correções forçadas
ou upgrades principais automáticos.

### Decisões principais

- executar `npm audit --json` a partir do lockfile atual e registrar o resultado
  de forma resumida na task, sem versionar saída bruta volátil;
- classificar cada achado por dependência direta/transitiva, runtime/dev,
  severidade, caminho de dependência e exposição real no modelo local do
  produto;
- preferir upgrades patch/minor compatíveis e deliberados;
- nunca executar `npm audit fix --force`;
- vulnerabilidades sem correção compatível devem ficar documentadas com risco,
  mitigação existente e condição objetiva para reavaliação.

### Escopo

- conferir `npm audit`, `npm outdated` e os manifests dos workspaces;
- identificar quais pacotes diretos controlam cada cadeia vulnerável;
- aplicar somente upgrades compatíveis que não exijam migração funcional;
- regenerar `package-lock.json` de forma determinística;
- validar lint, typecheck, build, documentação da API, testes e smoke E2E;
- atualizar `docs/PENDENCIAS.md`, o registro da task e este `NEXT.md`.

### Critérios de aceite

- inventário dos achados com decisão explícita para cada cadeia relevante;
- nenhum uso de `--force` e nenhum major upgrade escondido;
- upgrades aplicados têm justificativa e permanecem dentro do escopo;
- lockfile consistente com `npm ci`;
- CI completo aprovado.

### Fora de escopo

- modernização geral de dependências sem relação com vulnerabilidades;
- troca de framework, bundler ou runner de testes;
- correção de alertas do CLI Bash ou de dependências dos projetos gerenciados
  pelo dashboard;
- automatizar atualização recorrente de dependências nesta mesma entrega.
