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

## Próximas camadas com evidência

### Impacted tests

Só deve ser emitido quando houver relação estruturada por imports/dependency graph/coverage mapping, com origem da evidência preservada.

### Coverage delta

Deve comparar artifacts com revisão e contexto compatíveis. Percentual global isolado não é suficiente e artifacts de revisões diferentes não devem produzir delta.

### Flakiness

Uma falha única nunca classifica um teste como flaky. A classificação `suspected-flaky` exige múltiplas execuções comparáveis e identidade de revisão/contexto estável.

## Limites de segurança e qualidade

- nada é executado ao abrir o projeto;
- ausência de provider ou parser produz `unknown`, não `pass`;
- a recomendação não altera readiness por conta própria;
- targeted e full suite permanecem semanticamente diferentes;
- worktrees/environment instances só poderão compartilhar histórico quando a identidade de contexto permitir comparação explícita.
