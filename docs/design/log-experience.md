# Experiência compartilhada de logs

O dashboard adota duas camadas para saídas de processos e comandos:

- **Fluxo / Execução / Saída**: leitura normal, densa e cronológica, com o evento mais recente no final e acompanhamento automático enquanto a pessoa permanece próxima ao fim.
- **Diagnóstico**: triagem de sinais que merecem atenção antes de mostrar os detalhes completos. Erros, avisos, lentidão, retries e padrões repetidos são apresentados como problemas investigáveis.

A regra de produto é **conclusão antes de evidência**: o dashboard destaca primeiro o que parece errado e só então expõe stack trace, SQL, parâmetros, renderização ou o trecho bruto relacionado.

## Aplicação por ferramenta

| Ferramenta | Visão normal | Diagnóstico |
| --- | --- | --- |
| Logs do servidor | Fluxo HTTP/Rails/Node | 5xx/exceptions, requests lentas, N+1 e SQL repetido |
| Sidekiq | Fluxo de jobs | falhas, retries e jobs lentos |
| Webpack | Fluxo de compilação | erros, warnings e builds lentos |
| Testes | Execução | falhas, warnings e contexto do runner |
| Scripts | Saída | erros, warnings e execução lenta |
| Dependências/build | Saída | erros, warnings e build lento |
| Operações Rails de banco | Saída | erros e warnings do comando pontual |

O suporte a Docker Compose não faz parte desta entrega porque essa integração não existe mais no produto atual.

## Fluxo normal

- Uma linha por evento sempre que possível.
- Busca e filtros sem transformar cada linha em um card.
- Auto-follow pelo final da saída, como em um terminal.
- Rolagem manual pausa o acompanhamento; voltar ao final permite retomar.
- Segredos continuam respeitando o mascaramento aplicado pela API.
- Logs grandes continuam limitados para preservar responsividade.

## Diagnóstico

O diagnóstico não tenta interpretar qualquer mensagem como certeza. Ele usa sinais conservadores e específicos do domínio, preservando o conteúdo original como evidência.

### Servidor Rails

A estrutura do log permite um diagnóstico mais rico:

- status 5xx e exceptions;
- request acima de 1 segundo;
- SQL agrupado por padrão;
- possível N+1;
- consulta repetida;
- tempos de Active Record, views e GC.

SQL, parâmetros, renderização e log completo começam recolhidos para que uma consulta extensa não domine a tela.

### Sidekiq

A visualização procura eventos de job, falhas, retries e duração elevada. JID, classe e fila continuam pesquisáveis no fluxo original.

### Webpack

Compilação, conclusão, warnings e errors recebem classificação sem alterar a saída original. Builds acima do limiar configurado pelo parser aparecem como lentos.

### Testes

O modo normal acompanha a execução. O modo Diagnóstico combina a classificação compartilhada com o navegador especializado de falhas já existente, mantendo expected/actual, arquivo, linha e contexto do runner quando disponíveis.

### Scripts, dependências e comandos pontuais

Como a saída pode pertencer a ferramentas arbitrárias, o diagnóstico é propositalmente conservador: erros, warnings e lentidão evidente. Não há tentativa de inferir semântica específica quando o formato não é conhecido.

## Implementação

`ProjectLogExperience.vue` fornece a composição compartilhada e `utils/log-experience.ts` concentra a classificação genérica. Ferramentas com estrutura própria podem manter um diagnóstico especializado, como o inspetor Rails dos logs do servidor, sem duplicar a linguagem visual e o comportamento do fluxo.

A implementação deve continuar respeitando os limites de renderização, cancelamento/streaming existentes e os contratos de segurança de cada ferramenta.
