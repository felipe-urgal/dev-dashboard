# Protótipos da central de notificações

Status: **para análise de UX**

Branch: `prototype/notification-center-options`

## Objetivo

Melhorar a leitura da central de notificações sem alterar o fluxo atual: abrir pelo sino, navegar ao selecionar um aviso, descartar individualmente e limpar a lista.

O componente atual apresenta cada aviso como uma frase única. Os protótipos abaixo separam origem, resultado, projeto, ação executada e horário para reduzir o esforço de leitura.

## Dados existentes que os protótipos reutilizam

- `origin`: `test`, `script` ou `server`;
- `outcome`: `succeeded`, `failed`, `cancelled` ou `stopped`;
- `projectName`;
- `label`;
- `createdAt`;
- `read`;
- `routeTo`;
- ações existentes: `markRead`, `dismiss` e `clearAll`.

Nenhuma das propostas exige mudança no contrato básico do store.

---

## Protótipo A — Inbox operacional

Cada evento aparece como uma linha estruturada:

1. ícone semântico do resultado;
2. origem em rótulo curto;
3. título do resultado;
4. projeto e comando em uma segunda linha;
5. horário relativo;
6. descarte individual.

### Exemplo de hierarquia

```text
[✓] SCRIPT                          agora   [×]
    Build concluído com sucesso
    fi-observatorio-app · build
```

### Pontos fortes

- preserva o modelo mental atual do dropdown;
- leitura rápida mesmo com origens diferentes;
- implementação pequena e segura;
- funciona bem com 1 a 8 avisos.

### Limitação

Repete o nome do projeto quando vários eventos do mesmo projeto chegam juntos.

### Recomendação

**Opção recomendada para a primeira implementação.** Entrega o maior ganho visual com a menor mudança de comportamento.

---

## Protótipo B — Agrupado por projeto

Os avisos são agrupados por `projectName`. Dentro de cada grupo, as linhas ficam mais compactas. O cabeçalho do grupo oferece navegação direta para o contexto do projeto.

### Exemplo de hierarquia

```text
fi-observatorio-app                   Abrir projeto →
● Build concluído com sucesso                  agora
  Script · build

api-admin                               Abrir testes →
● Suíte terminou com falhas                    4 min
  Testes · test:unit
● Lint concluído                                8 min
  Script · lint
```

### Pontos fortes

- reduz repetição;
- melhor para alto volume de eventos;
- facilita compreender o estado de cada projeto;
- permite filtros simples: todas, falhas e concluídas.

### Limitações

- cria uma lógica de agrupamento adicional no componente;
- a ordem temporal global fica menos óbvia;
- exige decidir o destino do link de cada grupo quando há origens diferentes.

### Quando escolher

Quando o uso real mostrar rajadas frequentes de notificações do mesmo projeto.

---

## Protótipo C — Feed temporal

A central vira um pequeno feed de atividade. O topo mostra um resumo recente e os eventos aparecem em uma linha do tempo com seções como “Agora” e “Mais cedo”.

### Exemplo de hierarquia

```text
Atividade recente                     3 novas
[2 concluídas] [1 com falha] [1 interrompida]

AGORA
✓ fi-observatorio-app                  SUCESSO
  O script build foi concluído.
  agora · abrir execução

MAIS CEDO
× api-admin                            FALHOU
  A suíte test:unit terminou com falhas.
  há 4 min · revisar testes
```

### Pontos fortes

- oferece mais contexto operacional;
- comunica muito bem sequência e resultado;
- aproxima a central do painel global de atividade.

### Limitações

- ocupa mais espaço;
- é visualmente mais pesada;
- pode duplicar parte da função da rota global de atividade;
- exige definir janela temporal e regras do resumo.

### Quando escolher

Quando a central precisar evoluir de um dropdown de avisos para uma superfície de diagnóstico.

---

## Regras visuais compartilhadas

- largura entre `360px` e `400px`, mantendo `max-width: calc(100vw - 32px)`;
- título explícito no painel;
- horário relativo calculado a partir de `createdAt`;
- cores semânticas já existentes nos tokens do projeto;
- aviso não lido indicado por uma barra lateral de destaque, sem pintar toda a linha;
- ícones de resultado com área de fundo suave;
- projeto e comando separados do título principal;
- `Escape`, clique externo e restauração de foco preservados;
- botão de descarte com `aria-label` específico;
- ações em texto no cabeçalho e ações destrutivas/limpeza no rodapé;
- estado vazio com mensagem curta e sem rodapé desabilitado ocupando espaço desnecessário.

## Comparação rápida

| Critério | A — Inbox | B — Projeto | C — Feed |
|---|---:|---:|---:|
| Mudança de comportamento | baixa | média | alta |
| Escaneabilidade | alta | alta | alta |
| Alto volume | média | alta | média |
| Ordem temporal | alta | média | muito alta |
| Complexidade | baixa | média | alta |
| Melhor uso | padrão geral | rajadas por projeto | diagnóstico |

## Próxima decisão

Escolher uma direção principal e, se necessário, combinar detalhes:

- base estrutural do **A**;
- filtros ou agrupamento opcional do **B**;
- horário, rótulos semânticos e acesso ao painel de atividade do **C**.

A combinação mais equilibrada é: **Protótipo A + link “Abrir atividade” + horário relativo**.
