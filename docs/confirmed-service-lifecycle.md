# Coordenação de lifecycle confirmado — fase interna

A issue #1116 agora possui um **núcleo de execução confirmada**, separado dos endpoints públicos. Ele não registra rota POST, não inicializa containers ou unidades systemd e não altera os serviços reais do host.

## Contratos

- `ConfirmedLifecycleRequest`: `projectId`, `environmentInstanceId`, ação `start|stop`, `expectedRevision`, `expectedPlanHash` e `acceptedObservedAt` da prévia aceita.
- `ConfirmedLifecycleResult`: estado `completed|failed|partial`, passos com `completed|failed|unverified` e diagnóstico saneado.
- `ConfirmedLifecycleRunner`: boundary estreito para um executor do domínio owner. Somente a interface é definida; **não há adapter de produção conectado**.
- `ConfirmedLifecycleStepWriter`: boundary para Activity/Jobs; não há nova persistência de eventos.

## Garantias nesta fase

1. A confirmação tem janela de 30 segundos. O servidor recalcula o preflight antes e depois de adquirir locks, exige mesmo hash/revisão, status ready e target correto.
2. Um lock **atômico e sem espera** abrange todos os recursos do plano e, para Compose, também seu projeto físico. Operações concorrentes recebem 409 e nunca entram simultaneamente no executor dentro do mesmo processo API.
3. Somente nodes de Compose com `relation=owned` e um único consumidor podem alcançar o boundary do runner. Unidades systemd, Docker externo e Managed Process permanecem proibidos.
4. Antes de cada step, estado e dependências pendentes são verificados novamente. Após cada step, Start exige runtime running **e** readiness ready; Stop exige stopped.
5. Nenhuma falha provoca rollback automático. A resposta `partial` evidencia mutação anterior, falha do owner ou pós-verificação não comprovada. Mensagens cruas de erro do executor não são expostas.
6. Falha de registro de evento não provoca retry de mutação.

## Limites de segurança — ainda não liberado ao usuário

- **Process-local:** locks não coordenam duas instâncias da API ou ferramentas externas. Para execução pública será preciso uma estratégia de lease interoperável e integração aos owners de lifecycle que já têm proteções próprias.
- A confirmação não é uma capacidade transferível nem um token criptográfico; o endpoint de preview continua somente leitura.
- Adapter real de Compose precisa resolver ownership registrado, bloqueios de portas, dependências automáticas e verificar impacto em outros workspaces **antes** de ser associado ao coordinator.
- Ainda faltam timeouts/cancelamento seguro, recuperação/reattach durável ao Activity/Jobs e regras para plano alvo Stack. Nenhuma mutação de host deve ser exposta pela UI até isso ser concluído.

## Testes

O `service-resource-operation-lock.test.ts` cobre locks físicos, rejeição 409 e liberação em erro. O `confirmed-service-lifecycle-coordinator.test.ts` cobre revalidação, TTL, revisão/hash, recursos compartilhados, ordem de passos, falha parcial, estado não comprovado, eventos e concorrência usando **runner simulado**.

Referências: #1113, #1116, #1072.
