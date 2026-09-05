# Test Intelligence

Test Intelligence é uma camada de recomendação **read-only** sobre as capacidades de testes existentes. O runner do projeto continua sendo a fonte de verdade; a recomendação nunca transforma ausência de evidência em um resultado verde.

## Primeiro recorte

O MVP reutiliza `RelatedTestService` e a detecção de testes existente para responder se a mudança atual possui mapeamento direto confiável para arquivos de teste.

O endpoint `GET /api/projects/:projectId/tests/:commandId/intelligence` retorna:

- branch base e branch atual usadas pela seleção existente;
- arquivos alterados;
- testes diretamente relacionados encontrados;
- arquivos alterados que ficaram sem mapeamento;
- evidências `direct-file-match` por arquivo;
- estado `direct` ou `unknown`;
- recomendação `targeted` ou `full-suite`.

O contrato já reserva `impacted`, mas o MVP não emite esse estado sem uma relação de dependency/import/coverage comprovada.

## Regra conservadora

`targeted` só é recomendado quando:

1. há pelo menos um arquivo alterado;
2. há pelo menos um teste relacionado;
3. **todo** arquivo alterado possui evidência direta.

Se qualquer arquivo não tiver mapeamento, se o runner não suportar seleção por arquivo ou se a resolução Git/provider falhar, a recomendação é `full-suite` com estado `unknown`.

Isso é intencional: um subconjunto conhecido de testes pode continuar sendo exibido como evidência útil, mas nunca é apresentado como equivalente à suíte completa quando a cobertura da mudança é incerta.

## Execução

O suggestion engine não executa testes. O MVP também não adiciona um caminho novo de shell: qualquer execução continua passando pelo catálogo e pelos providers estruturados já existentes.

### Scope persistido do run

O histórico de testes registra `scope` explicitamente em cada registro interno normalizado:

- `full-suite` quando o comando inteiro foi executado;
- `targeted` quando a execução veio do fluxo estruturado de arquivo/caso (`:file`). O `targetFile` preserva o alvo estruturado já usado pelo histórico: arquivo simples para execução por arquivo e `arquivo:linha` para execução de caso. Quando o provider acrescenta filtros como `-t`/`--test-name-pattern`, o padrão não é confundido com o alvo.

Esse campo descreve somente **o escopo efetivamente executado**. Ele não transforma um run targeted em equivalente à suíte completa e não representa sozinho um gate verde de Readiness.

### Identidade Git do run

No início da execução, quando o `ManagedProcess` possui `cwd` em um repositório Git, o histórico captura:

- `gitRevision`: o `HEAD` verificado naquele instante;
- `gitDirtyFingerprint`: `clean` para working tree limpo ou um SHA-256 derivado de status, diff tracked/staged e hashes dos arquivos untracked.

A captura usa somente comandos Git estruturados via `execFile`, com timeout/buffer menores que os defaults do serviço Git. Se a revisão não puder ser obtida, a execução continua sem identidade Git. Se o estado dirty não puder ser capturado por inteiro — por exemplo, mais de 100 arquivos untracked — o histórico preserva a revisão, mas **não** grava um fingerprint parcial. Ausência de fingerprint significa “não comparável com segurança”, nunca “clean”.

O arquivo persistido do histórico foi evoluído para a versão 3. Históricos v1/v2 continuam legíveis: `scope` ausente ainda é normalizado somente a partir de `targetFile`, e os campos de identidade permanecem opcionais para registros antigos.

No contrato TypeScript compartilhado, `scope`, `gitRevision`, `gitDirtyFingerprint` e `environmentInstanceId` permanecem opcionais durante a migração porque o schema HTTP existente ainda não os serializa. A exposição remota e a obrigatoriedade pública devem entrar juntas com uma revisão formal da rota e da documentação gerada por `docs:api`.

## Próximas camadas com evidência

### Environment identity

`environmentInstanceId` já está reservado no contrato, mas só deve ser preenchido quando a identidade explícita de Environment Instance (#598) estiver disponível no fluxo de execução. Worktrees/instances sem essa identidade não devem ser misturados por heurística de path.

### Impacted tests

Só deve ser emitido quando houver relação estruturada por imports/dependency graph/coverage mapping, com origem da evidência preservada.

### Coverage delta

Deve comparar artifacts com `gitRevision`, `gitDirtyFingerprint` e contexto de ambiente compatíveis. Percentual global isolado não é suficiente e artifacts sem identidade compatível não devem produzir delta.

### Flakiness

Uma falha única nunca classifica um teste como flaky. A classificação `suspected-flaky` exige múltiplas execuções comparáveis e identidade de revisão/contexto estável.

## Limites de segurança e qualidade

- nada é executado ao abrir o projeto;
- ausência de provider ou parser produz `unknown`, não `pass`;
- a recomendação não altera readiness por conta própria;
- targeted e full suite permanecem semanticamente diferentes;
- revisão sem fingerprint dirty não é considerada contexto suficiente para comparação;
- worktrees/environment instances só poderão compartilhar histórico quando a identidade de contexto permitir comparação explícita.
