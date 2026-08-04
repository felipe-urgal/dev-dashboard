# Task 086 — Auditoria de prioridades pós-IDE

## Status

Concluída e aguardando revisão.

## Objetivo

Comparar as principais pendências do Dev Dashboard com o estado real do código,
dos testes e da documentação, escolher uma única próxima implementação e evitar
que o produto continue aprofundando a IDE/IA apenas por inércia.

Esta task é somente documental. Nenhuma rota, contrato, componente ou regra de
execução foi alterada.

## Critérios usados

A classificação segue a ordem definida em `docs/roadmap.md`:

1. segurança e isolamento local;
2. confiabilidade e observabilidade;
3. valor diário;
4. cobertura automatizada do risco introduzido;
5. redução de tarefas repetitivas;
6. consistência entre interfaces;
7. acessibilidade e qualidade da experiência;
8. extensibilidade.

Também foram considerados tamanho, dependências, raio de mudança e facilidade
de validar a entrega de forma determinística.

## Evidência consolidada

### Logs já possuem uma fronteira segura reutilizável

`packages/process-manager/src/log-protection.ts` oferece
`maskSensitiveLogContent`, uma função pura e idempotente que cobre atribuições
sensíveis, Bearer tokens, credenciais em URL e tokens conhecidos.

`ProcessLogSnapshot` já carrega `content`, `sizeBytes`, `truncated`, `masked` e
`redactionCount`. A arquitetura de segurança limita a leitura a 262144 bytes,
não aceita caminho do navegador e aplica o mesmo mascaramento aos leitores de
servidor, testes e catálogo. A interface já consome esse conteúdo para exibir
logs, mas não oferece uma forma de salvar exatamente o trecho seguro que está
na tela.

Conclusão: a exportação pode ser implementada no frontend a partir do snapshot
já autorizado e mascarado, sem criar rota de download do arquivo bruto e sem
ampliar a leitura atual.

### Projetos recentes exigem persistência e uma nova definição de evento

A task 069 já entrega favoritos persistentes por identificador estável, com
arquivo privado, escrita atômica, rota fechada, ordenação e rollback no
frontend. Projetos recentes poderiam reaproveitar parte desse padrão, mas ainda
exigem decidir o que conta como acesso, quando registrar a visita, quantos itens
reter, como separar workspaces e como reconciliar projetos temporariamente
indisponíveis.

Conclusão: possui bom valor diário, porém é uma entrega média e cria uma nova
fonte de estado persistente. Deve vir depois de uma melhoria menor que já usa
infraestrutura existente.

### Confirmações Git existem, mas a unificação é ampla

`GitMutationOperation` já reúne treze operações, e os fluxos Git usam tokens de
confirmação vinculados à operação e ao alvo. O próprio registro da task 016
deixou confirmação progressiva por risco fora do escopo. Além disso,
sincronização e alguns fluxos posteriores cresceram com contratos e telas
próprios.

Unificar níveis de risco e persistir histórico exigiria inventariar todas as
mutações, definir um contrato comum de evento, decidir retenção e garantir que
a auditoria não replique o histórico de commits Git nem o painel global de
atividade.

Conclusão: reduz risco operacional, mas deve ser planejada como uma frente
própria de tamanho médio/grande, não como a próxima fatia curta.

### Caso/describe específico e cobertura atravessam vários runners

A task 027 suporta arquivo específico para Vitest, Jest, `node:test`, RSpec,
Rails Test e pytest, compondo comandos a partir do catálogo detectado e
reaproveitando o mesmo motor de execução. Caso, `describe` e cobertura ficaram
explicitamente fora do escopo.

Cada runner possui sintaxe, descoberta e formato de relatório diferentes.
Cobertura também exige decidir artefatos, limites, retenção, parsing e UX. Unir
as duas ideias numa única task produziria uma entrega grande e pouco coesa.

Conclusão: deve ser dividida no futuro, começando por uma matriz de runners e
um único incremento verificável.

### Monorepos e scan recursivo têm evidência clara, mas alto risco de descoberta

`scanWorkspace` lê apenas os filhos diretos do workspace, ignora diretórios
conhecidos e chama `detectProject` em cada candidato. Não há profundidade,
quantidade ou timeout de recursão porque a descoberta atual não é recursiva.

Adicionar recursão exige política de symlinks, limites de profundidade e
quantidade, orçamento de tempo, deduplicação por caminho real e uma UX de
opt-in. Uma implementação incompleta pode tornar scans lentos ou atravessar
árvores inesperadas.

Conclusão: alto valor para projetos complexos, mas tamanho grande e risco
superior ao de uma melhoria operacional baseada em dados já carregados.

### Embeddings e restauração de estado não são uma única pequena pendência

A task 081 registrou que contexto semântico local exige índice persistente,
política de exclusão, autorização explícita e tela de configurações. A
restauração de abas/estado é independente e possui seu próprio modelo de
persistência e invalidação.

O arco central da IDE/IA já foi concluído nas tasks 076–084. Nenhuma das duas
capacidades bloqueia chat, ferramentas, edições propostas, LSP ou compleção
inline.

Conclusão: separar as duas ideias antes de qualquer implementação e não
priorizá-las enquanto melhorias operacionais menores continuarem abertas.

### Qualidade de engenharia precisa ser dividida por objetivo

O `package.json` raiz possui build, typecheck, testes e E2E, mas não possui lint
ou formatação. Cobertura, documentação da API, revisão de dependências e
refatoração de serviços grandes são necessidades reais, porém não formam uma
única entrega. Agrupá-las causaria churn amplo sem um critério de saída único.

Conclusão: manter no backlog e abrir tasks independentes quando houver uma
motivação concreta, como prevenir regressão, desbloquear release ou reduzir
risco de uma área que voltará a mudar.

## Classificação final

| Ordem | Candidata | Valor | Risco | Tamanho | Motivo |
| --- | --- | --- | --- | --- | --- |
| 1 | Exportação segura de logs | alto | baixo | pequeno | reutiliza snapshots já limitados e mascarados, sem backend novo |
| 2 | Projetos recentes por workspace | alto | baixo/médio | médio | melhora retomada diária, mas cria persistência e semântica novas |
| 3 | Política de risco e histórico Git | alto | médio/alto | médio/grande | melhora segurança, porém atravessa muitos fluxos mutáveis |
| 4 | Caso/describe específico | médio/alto | médio | médio/grande | depende de diferenças entre runners e descoberta de casos |
| 5 | Monorepos e scan recursivo opt-in | alto para parte dos usuários | alto | grande | exige limites, symlinks, deduplicação e timeout |
| 6 | Qualidade de engenharia | indireto | variável | variável | precisa ser dividida em tasks com motivação e saída próprias |
| 7 | Embeddings e restauração da IDE | médio | médio/alto | grande | opcional, não bloqueia o fluxo central e reúne duas frentes distintas |

## Decisão

A próxima entrega será **Task 087 — Exportação segura de logs**.

Ela vence porque:

- completa um fluxo diário já existente: consultar, compartilhar ou arquivar um
  diagnóstico;
- não aumenta o acesso ao filesystem nem cria download do arquivo bruto;
- reaproveita o mesmo conteúdo mascarado e truncado que já cruzou a API;
- pode cobrir servidor, testes e scripts com uma utilidade compartilhada;
- é pequena, revisável e fácil de testar sem depender de processos reais;
- entrega valor fora do arco de IA antes de iniciar outra frente estrutural.

## Direção da task 087

A implementação deve exportar somente o snapshot atualmente autorizado pela
API, por meio de `Blob` no navegador. O arquivo deve possuir nome seguro e
metadados mínimos sobre origem, captura, truncamento e mascaramento. Não deve
haver rota para receber caminho, ler o arquivo completo ou devolver conteúdo
sem os limites atuais.

## Itens eliminados ou reconciliados

- o E2E real de ghost text continua descartado sem uma estratégia diferente da
  task 082;
- smoke E2E de ferramentas adicionais da IA continua não bloqueante porque os
  caminhos possuem testes unitários;
- shell livre, plugins remotos e exposição da API na rede permanecem fora de
  escopo;
- a arquitetura de segurança já descreve corretamente leitura limitada e
  mascaramento; a task 087 deve preservar essas regras, não substituí-las;
- projetos recentes, Git, testes focados, monorepos e qualidade permanecem no
  inventário, agora com ordem e dependências explícitas neste documento.

## Validação da auditoria

- `docs/PENDENCIAS.md`, `docs/roadmap.md`, `docs/product/vision.md` e documentos
  ativos de arquitetura foram revisados;
- contratos e implementações centrais de logs, Git e descoberta foram
  conferidos;
- tasks 008, 016, 027, 053, 069 e 081 foram usadas para confirmar decisões e
  limitações já registradas;
- `docs/tasks/NEXT.md` foi substituído por um plano executável da task 087;
- nenhuma mudança funcional foi incluída.
