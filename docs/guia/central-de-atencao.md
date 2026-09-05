# Central de Atenção

A **Central de Atenção** aparece no início da home do workspace e resume sinais que exigem ação agora. Ela não substitui as ferramentas de cada projeto: cada item aponta para a tela onde o problema pode ser entendido e resolvido.

## O que entra na central

O MVP agrega somente sinais explícitos e verificáveis:

- **Processos**: processo em estado de falha ou encerrado com código diferente de zero.
- **Git**: branch divergente, atrás do remoto ou workspace com alterações locais.
- **Testes**: última execução conhecida com falha.
- **Produção**: operação em estado `failed` ou `recovery-required`.
- **Doctor**: diagnóstico geral em estado `blocked`.

Projetos desabilitados não geram itens.

## Severidade

A severidade é uma regra de domínio, não uma estimativa da interface:

- **Crítico**: processo/teste/Doctor/Produção com falha, ou Git divergente ao mesmo tempo à frente e atrás.
- **Atenção**: Git atrás do remoto ou com alterações locais sem divergência.

Itens críticos aparecem antes dos itens de atenção. Dentro da mesma severidade, a ordenação é determinística por projeto e categoria.

## Dados parciais

As fontes são consultadas de forma independente. Se Git, Testes, Doctor, Processos ou Produção não puderem ser consultados, a central continua mostrando os sinais disponíveis e marca o resultado como **Parcial**.

Um resultado parcial não significa que o workspace está saudável. Significa apenas que nenhuma condição problemática foi encontrada entre as fontes que responderam.

Cada item possui `observedAt`, que informa quando o sinal foi observado. A central não inventa frescor quando a fonte não fornece um timestamp próprio; nesse caso usa o instante da agregação.

## Atualização e resolução

A central é recarregada quando:

- o workspace ativo muda;
- um scan do workspace termina;
- o usuário escolhe **Atualizar**.

Quando a condição deixa de existir na fonte, o item desaparece na próxima leitura. Não existe estado local de “dispensado” ou “resolvido” na Central de Atenção.

## Segurança

A Central de Atenção é somente leitura. Ela **não executa automaticamente** commit, reset, sincronização, testes, restart, recovery ou deploy. O botão **Abrir** apenas navega para a ferramenta responsável, onde continuam valendo as confirmações e salvaguardas específicas daquela operação.

## Estado saudável

Quando todas as fontes consultadas estão saudáveis, a home mostra **Nada exige atenção agora**. Se a coleta estiver parcial, a mensagem deixa claro que esse estado vale apenas para os sinais disponíveis.
