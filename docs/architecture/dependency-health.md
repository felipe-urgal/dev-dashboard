# Dependency Health

Dependency Health evolui a leitura de dependências para separar **fatos locais comprováveis** de metadata externa que pode estar stale ou indisponível. O domínio continua somente leitura nestes primeiros recortes.

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

## Segundo recorte: metadata externa npm

`NpmDependencyMetadataService` enriquece um inventário local já produzido sem alterá-lo. O retorno mantém o objeto `inventory` como fonte dos fatos locais e acrescenta uma coleção separada `metadata`.

Cada evidência externa informa:

- pacote consultado;
- estado `available | unavailable | invalid`;
- fonte fixa `npm-registry`;
- `observedAt` da consulta;
- `latestVersion` somente quando a resposta é válida;
- classificação `none | patch | minor | major | unknown`.

A consulta é somente leitura e usa exclusivamente o endpoint conhecido `https://registry.npmjs.org/<pacote>/latest`. O browser não fornece registry, URL, headers, token ou parâmetros livres.

A classificação só ocorre quando a versão resolvida local e a versão `latest` externa são versões comparáveis. Versão local ausente, formato inválido ou prerelease ambíguo permanece `unknown`; o Dashboard não inventa a magnitude de uma atualização.

### Degradação offline

Falha de DNS/rede, timeout, HTTP não bem-sucedido ou payload inválido afeta apenas a metadata daquele pacote. O inventário local permanece integralmente disponível.

Isso preserva a fronteira:

```text
fato local -> range declarado / versão resolvida
metadata externa -> latest / origem / freshness / classificação
```

Um registry indisponível nunca transforma uma versão local conhecida em `unknown` nem apaga dependências declaradas.

### Limites da consulta externa

- timeout por pacote;
- concorrência limitada por workers;
- payload limitado a 256 KiB, inclusive durante leitura do stream;
- redirects não são aceitos;
- nenhum package manager é executado;
- nenhum `.npmrc`, token ou secret é transportado pela API do serviço;
- respostas externas entram apenas pelo shape mínimo necessário para `version`.

## Package lock

O parser aceita `lockfileVersion` 1, 2 e 3.

- v1 usa a entrada direta em `dependencies`;
- v2/v3 usam a entrada correspondente em `packages/node_modules/<nome>`;
- dependência declarada sem entrada comprovável permanece `unknown`;
- lockfile ausente mantém o inventário local utilizável, mas sem versão resolvida;
- lockfile inválido ou de versão não suportada nunca é usado para inferir resolução.

O inventário continua `ready` quando o `package.json` é válido e o lockfile está ausente/incompatível, porque os ranges declarados ainda são evidência local válida. O warning deixa explícita a limitação.

`package.json` ausente, ilegível ou estruturalmente inválido faz a inspeção falhar fechada como `invalid`.

## Segurança e limites locais

- nenhum processo é executado;
- a raiz usada é o `realpath` de `Project.path` conhecido pelo backend;
- `package.json` e `package-lock.json` precisam ser arquivos regulares, não symlinks;
- limites de tamanho são aplicados antes do parse;
- no máximo 5.000 dependências diretas entram no snapshot;
- nomes e ranges possuem limites de tamanho;
- stdout e secrets não fazem parte deste domínio.

## O que estes recortes ainda não afirmam

O enriquecimento de `latest` não é evidência suficiente para marcar uma dependência como:

- vulnerável;
- compatível ou incompatível com o runtime do projeto;
- parte de um grupo/lockstep de upgrade obrigatório;
- segura para atualização automática.

Advisories e compatibilidade exigem providers/fontes próprias com origem e freshness. O Upgrade Planner deve ser construído sobre essas evidências sem misturá-las ao inventário local.

## Próximos recortes

A evolução seguinte pode adicionar advisories e runtime compatibility, e então construir o Upgrade Planner:

```text
fato local -> range declarado / versão resolvida
metadata externa -> latest / advisory / compatibilidade / freshness
plano -> alvo / tipo de mudança / arquivos / gates / grupos relacionados
```

Mutação automática continua fora do MVP e deve exigir plano, confirmação e rollback adequados antes de alterar manifest ou lockfile.
