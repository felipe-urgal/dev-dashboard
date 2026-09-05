# Test Intelligence

Test Intelligence é uma camada de recomendação **read-only** sobre as capacidades de testes existentes. O runner do projeto continua sendo a fonte de verdade; a recomendação nunca transforma ausência de evidência em resultado verde.

## Seleção por impacto direto

O serviço reutiliza `RelatedTestService` e a detecção de testes existente para responder se a mudança atual possui mapeamento direto confiável para arquivos de teste.

O endpoint `GET /api/projects/:projectId/tests/:commandId/intelligence` retorna:

- branch base e branch atual usadas pela seleção existente;
- arquivos alterados;
- testes diretamente relacionados encontrados;
- arquivos alterados que ficaram sem mapeamento;
- evidências `direct-file-match` por arquivo;
- estado `direct` ou `unknown`;
- recomendação `targeted` ou `full-suite`;
- análise de coverage delta, quando existe artifact comparável;
- análise de flakiness, somente quando existe evidência granular estruturada.

O contrato reserva `impacted`, mas o serviço não emite esse estado sem uma relação de dependency/import/coverage comprovada.

### Regra conservadora

`targeted` só é recomendado quando:

1. há pelo menos um arquivo alterado;
2. há pelo menos um teste relacionado;
3. **todo** arquivo alterado possui evidência direta.

Se qualquer arquivo não tiver mapeamento, se o runner não suportar seleção por arquivo ou se a resolução Git/provider falhar, a recomendação é `full-suite` com estado `unknown`.

Um subconjunto conhecido pode continuar sendo exibido como evidência útil, mas nunca é apresentado como equivalente à suíte completa quando a cobertura da mudança é incerta.

## Execução segura

O suggestion engine não executa comandos arbitrários. A ação de rodar testes relacionados reutiliza o fluxo estruturado já existente em `POST /api/projects/:projectId/tests/:commandId/related/start`, passando pelo catálogo de comandos, `RelatedTestService`, provider do runner e `ProcessManager`.

Não existe concatenação de shell a partir da sugestão. Se o provider não suporta seleção segura, a recomendação cai para suíte completa/`unknown`.

## Histórico e identidade da execução

### Scope persistido

O histórico de testes registra `scope` explicitamente em cada registro interno normalizado:

- `full-suite` quando o comando inteiro foi executado;
- `targeted` quando a execução veio do fluxo estruturado de arquivo/caso (`:file`).

`targetFile` preserva o alvo estruturado já usado pelo histórico: arquivo simples para execução por arquivo e `arquivo:linha` para execução de caso. Filtros como `-t`/`--test-name-pattern` não são confundidos com o alvo.

O scope descreve somente **o que foi executado**. Um run targeted não é tratado como equivalente à suíte completa nem vira gate verde de Readiness por esse campo.

### Identidade Git

No início da execução, quando o `ManagedProcess` possui `cwd` em um repositório Git, o histórico captura:

- `gitRevision`: o `HEAD` naquele instante;
- `gitDirtyFingerprint`: `clean` para working tree limpo ou SHA-256 derivado do estado dirty capturado integralmente.

A captura usa comandos Git estruturados via `execFile`, com timeout e buffer limitados. Se a revisão não puder ser obtida, a execução continua sem identidade Git. Se o estado dirty não puder ser capturado integralmente, a revisão pode ser preservada, mas nenhum fingerprint parcial é gravado.

Ausência de fingerprint significa **não comparável com segurança**, nunca `clean`.

O histórico de testes está na versão 3 e continua lendo v1/v2. Registros antigos permanecem válidos com campos de identidade opcionais.

`environmentInstanceId` permanece reservado para uma identidade explícita de Environment Instance. O serviço não inventa equivalência de ambiente a partir de paths ou nomes de worktree.

## Coverage delta

O histórico de coverage evoluiu para a versão 2. Cada novo snapshot pode persistir:

- totais agregados;
- métricas por arquivo do artifact;
- `gitRevision`;
- `gitDirtyFingerprint`;
- `environmentInstanceId`, quando existir uma fonte explícita.

Históricos v1 continuam legíveis. Um snapshot antigo sem identidade não é enriquecido por adivinhação; ele permanece não comparável até que exista um novo artifact identificável.

### Quando existe delta

O delta só é calculado quando o artifact atual e um baseline anterior têm a mesma identidade de origem comprovada:

- mesma `gitRevision`;
- mesmo `gitDirtyFingerprint`;
- mesmo `environmentInstanceId` quando esse campo estiver presente.

Se faltar revisão/fingerprint ou não existir baseline compatível, `coverageDelta.state` é `unknown`. Revisões diferentes nunca são comparadas como se fossem o mesmo baseline.

Quando a comparação é válida, a resposta traz:

- delta percentual de statements, branches, functions e lines no total;
- arquivos alterados cuja cobertura piorou em pelo menos uma métrica;
- arquivos alterados sem informação suficiente em um dos artifacts, em `missingFiles`.

A ausência de um arquivo no artifact não vira zero por inferência.

## Flakiness

Flakiness é calculada somente a partir de **tentativas estruturadas em nível de teste**. Cada evidência precisa conter:

- identidade estável do teste;
- outcome explícito `passed` ou `failed`;
- execução de origem;
- `gitRevision`;
- `gitDirtyFingerprint`;
- `environmentInstanceId`, quando aplicável.

Uma única falha nunca classifica um teste como flaky. O classificador exige pelo menos duas tentativas comparáveis da mesma identidade de teste e só marca como flaky quando existem outcomes `passed` **e** `failed` dentro do mesmo contexto comprovado.

Tentativas em revisões diferentes não são agrupadas. Duas ou mais tentativas comparáveis sempre verdes produzem análise disponível com lista de flaky vazia.

Os runners atuais ainda não expõem resultado individual estruturado de forma uniforme. Por isso, em produção, `flakiness.state` permanece `unknown` quando nenhum provider granular está disponível. Logs, exit code da suíte ou falha de arquivo **não** são reinterpretados como identidade de teste.

## Estados desconhecidos são parte do contrato

Coverage e flakiness degradam separadamente. Falha em uma fonte não apaga evidência válida de seleção direta nem cria falso positivo na outra análise.

Exemplos:

- coverage sem artifact atual: `no-current-artifact`;
- coverage sem identidade completa: `identity-incomplete`;
- coverage sem baseline seguro: `no-compatible-baseline`;
- runner sem resultados granulares: `no-granular-results`;
- tentativa sem identidade suficiente: `identity-incomplete`;
- tentativas em contextos incompatíveis: `insufficient-compatible-attempts`.

## Limites de segurança e qualidade

- nada é executado ao abrir o projeto;
- ausência de provider/parser/evidência produz `unknown`, não `pass`;
- a recomendação não altera Readiness por conta própria;
- targeted e full suite permanecem semanticamente diferentes;
- revisão sem fingerprint dirty não é suficiente para comparação;
- worktrees/environment instances só compartilham evidência quando a identidade de contexto permite comparação explícita;
- não há parsing heurístico de logs para fabricar test identity, coverage ou outcome;
- execução sugerida reutiliza catálogo/provider existente e não aceita shell arbitrário.
