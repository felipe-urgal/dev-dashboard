# Próxima atividade

Após o merge do **PR #289 — modos de execução `fast` / `complete`**, iniciar o **PR 5 — síntese global da Code review** do plano em [`AI-MULTI-PROVIDER.md`](AI-MULTI-PROVIDER.md).

O objetivo é **preservar a revisão atual por arquivo e acrescentar uma segunda etapa opcional que raciocina sobre a Pull Request como um conjunto**, usando a policy de execução criada no PR anterior.

## Escopo obrigatório

1. Preservar o processamento individual por arquivo e a concorrência atual.
2. Manter o comportamento atual no modo `fast`.
3. Executar síntese global somente quando `runGlobalSynthesis` da policy estiver ativo (`complete`).
4. Reunir summaries e findings locais em contexto compacto para a etapa global.
5. Criar prompt específico para cruzar alterações entre arquivos sem permitir ferramentas.
6. Deduplicar findings que descrevam o mesmo problema.
7. Procurar incompatibilidades de contratos entre arquivos, regressões sistêmicas e testes ausentes/impactados.
8. Validar a saída estruturada da síntese global antes de aceitá-la.
9. Tratar JSON/estrutura inválida como falha ou degradação explícita, nunca como sucesso silencioso.
10. Preservar masking e metadados de redação em todo o pipeline.
11. Cobrir PRs multi-arquivo, deduplicação, falha da síntese e diferença entre `fast`/`complete` com testes.

## Fluxo esperado

```text
arquivos da PR
    │
    ├── review arquivo A ─┐
    ├── review arquivo B  ├── concorrência atual
    └── review arquivo C ─┘
              │
              ▼
       summaries/findings
              │
       fast ───┴─── complete
        │               │
        ▼               ▼
  agregação atual   síntese global
                        │
                        ▼
                  review final
```

### `fast`

- não faz nova chamada de síntese;
- mantém a revisão separada por arquivo;
- preserva latência/custo atuais.

### `complete`

- executa uma chamada final de síntese após as revisões locais;
- cruza alterações entre arquivos;
- deduplica achados;
- produz resumo final da PR.

## Fora do escopo

Não fazer nesse PR:

- provider cloud;
- seleção de provider/modo na UI;
- fallback;
- `ProviderRegistry` dinâmico;
- `ContextBuilder` como serviço independente;
- cache de contexto/símbolos;
- reescrever o paralelismo atual da Code review;
- mudanças visuais.

## Critério de conclusão

O PR termina quando:

- `fast` continua equivalente ao fluxo atual;
- `complete` executa uma síntese global após os reviews individuais;
- achados duplicados são consolidados de forma determinística;
- problemas entre arquivos podem aparecer no resultado final;
- saída estruturada inválida não vira sucesso silencioso;
- masking continua preservado;
- cancelamento durante a etapa global é tratado corretamente;
- a suíte obrigatória do projeto está verde;
- `tasks/AI-MULTI-PROVIDER.md` e este `NEXT.md` avançam para o **PR 6 — primeiro provider cloud**.
