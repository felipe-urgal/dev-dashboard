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

Os endpoints existentes de lookup/summary de Pull Request mantêm os campos anteriores e, para PRs GitHub que podem ser correlacionados, acrescentam `cockpit` ao `GitOpenPullRequest`.

O bloco contém:

- `remoteStatus`: `available`, `unauthenticated`, `rate-limited` ou `unavailable`;
- `headSha`: SHA remoto do PR quando conhecido;
- `draft`, `mergeable` e `mergeableState` quando o GitHub fornece esses dados;
- `reviewState`: `approved`, `changes-requested`, `review-required` ou `unknown`;
- `requestedReviewers`: logins solicitados pelo próprio GitHub;
- `checks`: nome, estado normalizado e `detailsUrl` opcional.

O `ciStatus` agregado anterior continua existindo para compatibilidade.

## Apresentação no fluxo de Pull Request

A página de Pull Request reutiliza o mesmo lookup que já decide se existe PR aberta. Quando `cockpit` está disponível, o status do PR mostra no próprio card:

- SHA curto do head remoto;
- draft/pronta para review;
- estado normalizado de review;
- mergeability quando conhecida;
- reviewers solicitados;
- checks individuais e deep-link para o detalhe do provider.

Não existe um segundo fetch só para preencher a UI. Isso evita duas fontes remotas com freshness diferente para o mesmo PR.

`detailsUrl` é navegação explícita do usuário e abre em novo contexto com `noopener noreferrer`. A UI não interpreta a página do check nem transforma esse link em autorização para mutação.

## Degradação segura

Falha da API remota não vira falha do Git local. Quando o GitHub não pode ser consultado, o PR básico continua sendo retornado e o `cockpit.remoteStatus` explica o estado remoto. Isso evita que rate limit, ausência de autenticação ou indisponibilidade de rede derrubem as ferramentas locais.

Na interface, a degradação aparece dentro do bloco remoto; branch, diff, commits e demais operações Git locais continuam representando o estado real do repositório.

A leitura pública da API é tentada primeiro. Quando necessário, o backend pode reutilizar a sessão local autenticada do `gh`, sempre por `execFile` e argumentos estruturados, sem shell arbitrário.

## Segurança

- nenhum token ou credencial é retornado ao navegador;
- nenhuma credencial é persistida no projeto;
- URLs de detalhes vêm do payload do GitHub e servem apenas para navegação;
- este slice não adiciona nenhuma nova mutação remota às ações já existentes da ferramenta Git;
- o SHA é tratado como evidência para impedir que a UI confunda checks de uma revisão anterior com o estado atual do PR.

## Limites atuais

O estado de review é derivado das reviews disponíveis e das solicitações de reviewer. Regras avançadas de branch protection e approvals obrigatórios não são reinterpretadas localmente. `mergeable` também permanece a leitura do GitHub, inclusive quando estiver temporariamente `null` enquanto o provedor calcula o resultado.
