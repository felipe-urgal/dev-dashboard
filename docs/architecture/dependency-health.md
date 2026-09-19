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

## Próximo recorte

O Upgrade Planner deve compor os fatos já existentes sem aplicar upgrades automaticamente:

- versão atual e alvo;
- tipo de mudança;
- arquivos afetados;
- agrupamentos/lockstep comprováveis;
- warnings de major/breaking;
- gates recomendados antes de qualquer mutação.

Aplicação automática permanece fora deste domínio até existir plano, confirmação, recovery/rollback e validação pós-mudança.
