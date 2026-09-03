# Testes e qualidade

Este documento registra o estado implementado dos gates de qualidade do Dev Dashboard e a política usada para cobertura automatizada.

## Gate principal

Antes de uma mudança ser considerada pronta, o repositório valida a sequência definida pelos scripts raiz:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm test
npm run test:cli
```

Quando a alteração afeta um fluxo web crítico, execute também:

```bash
npm run test:e2e
```

O CI executa esses gates sobre o head do pull request. A cobertura unitária da web faz parte de `npm test` e, portanto, uma regressão abaixo do piso configurado bloqueia a entrega.

## Cobertura da web

A suíte web usa Vitest com provider V8. O escopo unitário é `src/**/*.{ts,vue}` e as exclusões explícitas ficam centralizadas em `apps/web/vitest.config.ts`.

Os pisos globais atuais são:

| Métrica | Piso |
| --- | ---: |
| Statements | 59% |
| Branches | 51% |
| Functions | 65% |
| Lines | 61% |

Os shells de aplicação, router e superfícies explicitamente listadas no `exclude` do Vitest permanecem fora do gate unitário quando sua responsabilidade é validada pela suíte Playwright. A lista de exclusões não deve crescer apenas para melhorar percentuais.

Para executar o mesmo gate de cobertura da web usado pelo workspace:

```bash
npm run test -w dev-dashboard-web
```

## Política de ratchet

Cobertura funciona como ratchet: o piso pode permanecer estável ou subir, mas não deve ser reduzido para acomodar código novo sem uma justificativa técnica explícita.

Ao elevar o piso:

1. adicione testes de comportamento sobre lógica de produção relevante, incluindo sucesso, erro e caminhos condicionais quando aplicável;
2. mantenha o escopo de cobertura honesto, sem criar exclusões para produzir ganho artificial;
3. eleve os thresholds apenas até um valor sustentado pelo head do pull request;
4. confirme o novo piso no CI junto com typecheck, lint, formatação, build e demais testes;
5. registre mudanças futuras de meta/roadmap em issues, mantendo este documento focado somente no estado implementado.

A prioridade é aumentar confiança sobre comportamento crítico, não maximizar um número isolado.