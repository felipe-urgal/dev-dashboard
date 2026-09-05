# Cockpit GitHub

O Cockpit GitHub é uma extensão **somente leitura** do resumo de Pull Request existente. Ele não substitui o Git local e não cria uma segunda integração remota: a API continua descobrindo o PR pela branch publicada e enriquece o mesmo resultado com evidências do GitHub.

## Objetivo

Permitir que a interface responda, sem reinterpretar payloads do provedor:

- qual revisão remota está sendo exibida (`headSha`);
- se o PR está draft e se o GitHub o considera mergeable;
- quais checks estão pending, success ou failure;
- qual link leva ao detalhe de um check;
- se há aprovação, changes requested ou review request pendente;
- se a leitura remota está disponível, sem autenticação, limitada por rate limit ou indisponível.

## Contrato

O endpoint já existente `GET /api/projects/:projectId/git/pull-request-summary` mantém os campos anteriores e, para PRs GitHub que podem ser correlacionados, acrescenta `cockpit`.

O bloco contém:

- `remoteStatus`: `available`, `unauthenticated`, `rate-limited` ou `unavailable`;
- `headSha`: SHA remoto do PR quando conhecido;
- `draft`, `mergeable` e `mergeableState` quando o GitHub fornece esses dados;
- `reviewState`: `approved`, `changes-requested`, `review-required` ou `unknown`;
- `requestedReviewers`: logins solicitados pelo próprio GitHub;
- `checks`: nome, estado normalizado e `detailsUrl` opcional.

O `ciStatus` agregado anterior continua existindo para compatibilidade.

## Degradação segura

Falha da API remota não vira falha do Git local. Quando o GitHub não pode ser consultado, o PR básico continua sendo retornado e o `cockpit.remoteStatus` explica o estado remoto. Isso evita que rate limit, ausência de autenticação ou indisponibilidade de rede derrubem as ferramentas locais.

A leitura pública da API é tentada primeiro. Quando necessário, o backend pode reutilizar a sessão local autenticada do `gh`, sempre por `execFile` e argumentos estruturados, sem shell arbitrário.

## Segurança

- nenhum token ou credencial é retornado ao navegador;
- nenhuma credencial é persistida no projeto;
- URLs de detalhes vêm do payload do GitHub e servem apenas para navegação;
- o MVP não executa mutações remotas;
- o SHA é tratado como evidência para impedir que a UI confunda checks de uma revisão anterior com o estado atual do PR.

## Limites do MVP

O estado de review é derivado das reviews disponíveis e das solicitações de reviewer. Regras avançadas de branch protection e approvals obrigatórios não são reinterpretadas localmente. `mergeable` também permanece a leitura do GitHub, inclusive quando estiver temporariamente `null` enquanto o provedor calcula o resultado.
