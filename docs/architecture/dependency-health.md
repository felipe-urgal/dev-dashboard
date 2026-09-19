# Dependency Health

Dependency Health separa fatos locais comprováveis de evidência externa que pode ficar indisponível ou desatualizada.

## Fatos locais

O inventário Node/npm é read-only e parte de `package.json` + `package-lock.json`:

- range declarado e versão resolvida são campos diferentes;
- lockfile ausente, inválido ou não suportado preserva o que ainda é conhecido;
- versão sem resolução comprovada permanece `unknown`;
- arquivos, quantidade de dependências e symlinks são bounded/fail-closed.

A descoberta de runtime Node usa somente declarações do projeto (`.node-version`, `.nvmrc` e `.tool-versions`). O runtime do processo da API não é usado como fallback.

## Metadata de versão

`NpmDependencyMetadataService` consulta somente o endpoint `latest` do npm Registry com origem `npm-registry`, `observedAt`, timeout, resposta bounded e concorrência limitada.

A classificação `none | patch | minor | major | unknown` só é produzida quando as versões são comparáveis. Compatibilidade com `engines.node` só é afirmada quando o runtime do projeto foi comprovado.

## Advisories

`OsvDependencyAdvisoryService` consulta o endpoint fixo `https://api.osv.dev/v1/querybatch` somente para dependências com versão resolvida comprovada.

Cada evidência preserva:

- pacote e versão consultada;
- origem fixa `osv`;
- `observedAt` da consulta;
- IDs de advisories retornados;
- `modified` de cada registro;
- indicador `complete`.

Estados:

- `available`: consulta completa para a versão exata;
- `partial`: OSV indicou paginação; a evidência não pode ser tratada como completa;
- `unknown-version`: a versão resolvida não foi comprovada e nenhuma consulta foi feita;
- `unavailable`: rede, timeout ou HTTP impediram a consulta;
- `invalid`: resposta externa não respeitou o contrato bounded esperado.

O primeiro corte não infere severidade. O batch OSV fornece IDs e `modified`; uma política de severidade só pode usar informação explícita de um registro detalhado validado em recorte futuro.

Uma lista vazia só significa “nenhum advisory conhecido retornado pela OSV para esta versão nesta consulta” quando o estado é `available` e `complete=true`. Não significa ausência absoluta de vulnerabilidades.

## Snapshot HTTP

`ProjectDependencyHealthService` compõe, por projeto:

- inventário npm local;
- runtime Node declarado;
- metadata `latest` do npm Registry;
- advisories OSV.

A API expõe `GET /api/projects/:projectId/dependency-health` com contrato fechado. `projectId` seleciona o projeto no backend; path, package name, registry URL e versão não ganham autoridade pelo browser.

Falhas são isoladas por fonte. Uma indisponibilidade externa não apaga inventário/runtime já conhecidos, e evidência incompleta permanece `unknown`, `unavailable`, `invalid` ou `partial` conforme a origem.

O serviço de metadata recebe o runtime comprovado por chamada, evitando carregar evidência de um projeto para outro quando a instância é compartilhada.

## Upgrade Planner

O Upgrade Planner é read-only e compõe somente o snapshot de Dependency Health já existente. A API expõe `GET /api/projects/:projectId/dependency-upgrade-plan`.

Cada item preserva:

- range declarado;
- versão atual somente quando a resolução local foi comprovada;
- versão alvo somente quando a metadata npm está disponível;
- classificação `none | patch | minor | major | unknown`;
- arquivos que uma futura aplicação deverá alterar;
- warnings conservadores;
- gates recomendados antes de qualquer mutação.

Estados do item:

- `upgrade`: versão atual e alvo são comprovadas e existe mudança comparável;
- `current`: versão atual e `latest` são comparáveis e não há upgrade;
- `unknown`: falta resolução local, metadata ou comparação suficiente.

O plano inteiro fica `partial` quando ao menos um item permanece `unknown`, e `unavailable` quando o inventário local não está disponível.

### Agrupamento e lockstep

Upgrades do mesmo manifesto raiz podem ser agrupados com `basis=shared-manifest`, pois essa relação é comprovada pelo inventário local. Esse agrupamento não afirma compatibilidade entre pacotes.

`lockstep` permanece `unknown` enquanto não existir evidência explícita que prove que duas dependências precisam avançar juntas. O planner não usa escopo npm, similaridade de nome ou versão como heurística de lockstep.

### Gates

O planner pode recomendar gates como:

- resolver a versão atual antes de classificar;
- atualizar metadata externa indisponível;
- revisar mudança major;
- verificar ou atualizar runtime Node;
- revisar advisories conhecidos da versão atual;
- renovar evidência OSV incompleta;
- verificar advisories da versão alvo;
- executar testes.

Uma mudança `major` é tratada apenas como possibilidade de breaking change. O planner não afirma que houve quebra sem evidência específica. A evidência OSV atual descreve a versão resolvida atual e não prova que a versão alvo está livre de advisories.

Aplicação automática continua fora deste domínio. Qualquer mutação futura precisa de plano confirmado, preflight, recovery/rollback e validação pós-mudança.

## Próximo recorte

Estabilizado o contrato read-only do planner, a UI pode consumir Health + Upgrade Planner sem ganhar autoridade para executar package manager. Mutação continua separada até os guardrails acima existirem.
