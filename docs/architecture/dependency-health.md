# Dependency Health

Dependency Health evolui a leitura de dependências para separar **fatos locais comprováveis** de metadata externa que pode estar stale ou indisponível. O primeiro recorte é deliberadamente offline e somente leitura.

## Primeiro recorte: inventário Node/npm local

`NodeDependencyInventoryService` lê apenas arquivos conhecidos na raiz real de um projeto Node:

- `package.json`;
- `package-lock.json`, quando existir.

O serviço não executa npm, não acessa registry e não consulta advisories.

Para cada dependência direta, o snapshot preserva:

- nome do pacote;
- origem `dependency` ou `devDependency`;
- range declarado no `package.json`;
- estado da resolução (`resolved` ou `unknown`);
- versão resolvida somente quando ela pode ser comprovada pelo lockfile suportado.

Range declarado e versão resolvida são fatos diferentes e não são colapsados em um único campo.

## Package lock

O parser aceita `lockfileVersion` 1, 2 e 3.

- v1 usa a entrada direta em `dependencies`;
- v2/v3 usam a entrada correspondente em `packages/node_modules/<nome>`;
- dependência declarada sem entrada comprovável permanece `unknown`;
- lockfile ausente mantém o inventário local utilizável, mas sem versão resolvida;
- lockfile inválido ou de versão não suportada nunca é usado para inferir resolução.

O inventário continua `ready` quando o `package.json` é válido e o lockfile está ausente/incompatível, porque os ranges declarados ainda são evidência local válida. O warning deixa explícita a limitação.

`package.json` ausente, ilegível ou estruturalmente inválido faz a inspeção falhar fechada como `invalid`.

## Segurança e limites

- nenhum processo é executado;
- nenhum acesso de rede ocorre;
- a raiz usada é o `realpath` de `Project.path` conhecido pelo backend;
- `package.json` e `package-lock.json` precisam ser arquivos regulares, não symlinks;
- limites de tamanho são aplicados antes do parse;
- no máximo 5.000 dependências diretas entram no snapshot;
- nomes e ranges possuem limites de tamanho;
- conteúdo externo, stdout e secrets não fazem parte deste domínio.

## O que este recorte não afirma

Sem metadata externa, o Dashboard **não** marca uma dependência como:

- desatualizada;
- patch/minor/major disponível;
- vulnerável;
- incompatível com runtime;
- parte de um grupo de upgrade obrigatório.

Esses sinais exigem fonte própria, timestamp/freshness e evidência explícita. Falha de registry no futuro não deve apagar o inventário local produzido por este serviço.

## Próximos recortes

A evolução pode enriquecer este inventário com metadata externa e então construir o Upgrade Planner. O enriquecimento deve preservar a distinção entre:

```text
fato local -> range declarado / versão resolvida
metadata externa -> latest / advisory / compatibilidade / freshness
plano -> alvo / tipo de mudança / arquivos / gates / grupos relacionados
```

Mutação automática continua fora do MVP inicial e deve exigir plano, confirmação e rollback adequados antes de alterar manifest ou lockfile.
