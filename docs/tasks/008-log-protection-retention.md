# Task 008 — Proteção e retenção de logs

## Status

Concluída em 26/07/2026.

## Objetivo e resultado

As respostas de logs de servidores, testes e execuções do catálogo agora passam por um mascaramento central e conservador antes de cruzarem a fronteira da API. A resposta informa se houve proteção e quantas ocorrências foram substituídas, permitindo que a interface avise o usuário sem revelar o valor original.

A retenção existente foi consolidada como política fechada: leituras retornam no máximo 262144 bytes, a limpeza remove estados terminais após sete dias por padrão e `DEV_DASHBOARD_LOG_RETENTION_DAYS` permite reduzir ou ampliar o período. A limpeza automática continua best-effort no ciclo de início, e a rota administrativa opera somente sobre IDs e caminhos derivados internamente do diretório de estado.

## Padrões protegidos

- atribuições com chaves como `password`, `secret`, `token`, `api_key` e `client_secret`;
- credenciais em URLs no formato `usuario:senha@host`;
- credenciais apresentadas após `Bearer`;
- tokens conhecidos com prefixos do GitHub e OpenAI.

O marcador fixo `[CONTEUDO_MASCARADO]` preserva o contexto da linha. Termos isolados, URLs sem senha e valores curtos parecidos com prefixos conhecidos não são alterados.

## Arquivos e decisões

- `packages/process-manager/src/log-protection.ts`: implementação pura e reutilizável do mascaramento;
- `packages/process-manager/src/process-manager.ts`: proteção central das leituras de servidor e teste;
- `apps/api/src/services/script-execution-service.ts`: mesma proteção para o terceiro produtor, o catálogo;
- `packages/contracts/src/process.ts` e `packages/contracts/src/script.ts`: metadados públicos de mascaramento;
- `apps/api/src/http/response-schemas.ts`: schemas explícitos que impedem omissão silenciosa dos metadados;
- painéis de servidor e scripts: aviso visual quando a resposta teve conteúdo protegido;
- testes unitários cobrem padrões reconhecidos, falsos positivos críticos e conteúdo já mascarado.

## Revisão de código

Antes da abertura do PR, a revisão identificou que a primeira expressão regular
mascarava apenas a primeira palavra de valores entre aspas e não reconhecia
propriedades JSON com a chave entre aspas. O parser foi corrigido para consumir o
valor citado completo, incluindo escapes, e o teste de integração do catálogo
agora comprova que o segredo não cruza a fronteira do serviço. A revisão também
ajustou a idempotência: conteúdo que já contém o marcador não é contado novamente
como uma nova substituição.

Na revisão do PR, o limite de reconhecimento das chaves também foi ajustado para
aceitar segmentos sensíveis delimitados por `_` ou `-`, como em
`DATABASE_PASSWORD`, `JWT_SECRET` e `NPM_TOKEN`, sem transformar nomes em que o
termo é apenas um sufixo alfanumérico, como `mytoken`. Um teste de regressão cobre
os nomes compostos mais frequentes.

## Segurança

- nenhuma rota nova aceita caminho;
- o arquivo original não é reescrito pelo leitor, evitando corrupção de diagnóstico e corrida com o processo produtor;
- a API nunca devolve os valores reconhecidos;
- limites de leitura, permissões `0600`, limpeza por idade e validação de identidade continuam ativos;
- estados corrompidos não interrompem a limpeza e um `logPath` persistido não controla o alvo removido.

## Critérios de aceite

- [x] padrões sensíveis conhecidos não aparecem nas respostas da API;
- [x] mascaramento central aplicado a servidor, teste e catálogo;
- [x] respostas indicam mascaramento e quantidade de substituições;
- [x] retenção por idade configurável e leitura com tamanho máximo fechado;
- [x] limpeza segura deriva caminhos do estado gerenciado;
- [x] interface apresenta aviso sem exibir o segredo;
- [x] typecheck, build e testes passam.

## Limitações

O mascaramento é intencionalmente conservador e não substitui um cofre de segredos. Formatos desconhecidos podem não ser reconhecidos; ampliar padrões exige testes contra falsos positivos. O valor bruto permanece no arquivo local protegido por permissões do usuário. A retenção desta entrega limita idade e tamanho de resposta, mas não implementa armazenamento remoto, exportação irrestrita nem auditoria multiusuário.

## PR

Título: `feat: proteger conteúdo sensível nos logs`

Referência: criada após o commit desta entrega.
