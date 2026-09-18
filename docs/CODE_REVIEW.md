# Guia de Code Review

> Este documento define critérios técnicos locais de review. Estado do workflow, handoff, autorizações e próxima etapa pertencem à task canônica do `agent-orchestrator`.

O review prioriza correção, segurança, clareza, testabilidade e simplicidade.

## Regra principal

KISS prevalece sobre aplicação mecânica de SOLID. Só introduza abstração quando houver benefício concreto.

## S — Single Responsibility

Procure módulos que misturem transporte, regra, IO e apresentação. Pergunta: "Essa responsabilidade tem um owner claro?"

## O — Open/Closed

Observe if/else ou switch que crescem a cada variante. Estratégias ou registries só fazem sentido quando a variação é recorrente.

## L — Liskov Substitution

Implementações de um mesmo contrato devem manter expectativas compatíveis sem tratamento especial.

## I — Interface Segregation

Evite contratos, props e objetos maiores do que os consumidores precisam.

## D — Dependency Inversion

Isole GitHub, Vercel e outras integrações quando isso proteger regras do core; não crie adapters sem benefício real.

## Checklist

- [ ] Resolve exatamente o problema.
- [ ] Preserva comportamento fora do escopo.
- [ ] Trata erros e regressões relevantes.
- [ ] Mantém responsabilidades claras.
- [ ] Evita abstração prematura.
- [ ] Testes cobrem o comportamento importante.
- [ ] Segurança, concorrência, IO e performance foram consideradas quando aplicável.
- [ ] O diff final foi revisado.
