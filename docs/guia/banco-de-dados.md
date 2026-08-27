# Guia da aba Banco de dados

> Parte do [Guia passo a passo do dashboard web](README.md).

Mostra os bancos e serviços de dados detectados para o projeto, deixa iniciar/pausar/reiniciar os
serviços reconhecidos, tira e restaura snapshots, e — só para projetos Rails — inspeciona
migrations e o schema (modelos, colunas, índices, relacionamentos). Essa aba só aparece quando o
dashboard detecta suporte a banco no projeto.

## Seções

A aba é dividida em sub-seções, navegáveis por `?section=` na URL:

| Seção | O que mostra |
|---|---|
| Visão geral | Resumo consolidado: ambientes, migrations pendentes/aplicadas, contagem de tabelas. |
| Ambientes | Cada banco/ambiente detectado, com driver, acessibilidade e serviço local associado. |
| Snapshots | Cópias do estado do banco guardadas antes de trocar de branch, com criação e restauração. |
| Migrations *(só Rails)* | Status (`up`/`down`) e código-fonte de cada migration do projeto. |
| Modelos *(só Rails)* | Tabelas do schema com colunas, índices e chaves estrangeiras. |
| Operações *(só Rails)* | Console de comandos de banco e geração de model/migration a partir de campos informados. |

## Ambientes e serviços

- Cada ambiente detectado mostra a acessibilidade atual: **Acessível**, **Indisponível** ou **Não
  verificado**.
- Para drivers com serviço systemd reconhecido (`mariadb`, `mongodb`, `mysql`/`mysql2`,
  `postgres`/`postgresql`, `redis`), o dashboard oferece **Iniciar**, **Pausar** e **Reiniciar** o
  serviço local — e avisa quando outro ambiente do mesmo projeto compartilha o mesmo serviço
  systemd, já que pausar ou reiniciar um afeta os dois.
- A URL de conexão de cada ambiente fica oculta por padrão; o botão de revelar mostra o valor uma
  vez, sem persistir esse estado.

## Explorador de leitura

Para MySQL, MariaDB e PostgreSQL locais, o explorador permite listar bancos e tabelas, visualizar
uma amostra de tabela e executar uma única consulta de leitura `SELECT`/`WITH`.

A proteção é feita em camadas:

- PostgreSQL inicia a sessão com `default_transaction_read_only=on`; o mesmo canal também recebe
  `statement_timeout=15000` para limitar a consulta no servidor;
- MySQL e MariaDB executam `SET SESSION TRANSACTION READ ONLY` ao conectar, fazendo as transações
  seguintes da sessão nascerem em modo de leitura;
- a API continua rejeitando comandos múltiplos, comentários SQL, DML/DDL, locking reads e
  construções conhecidas com efeito colateral, como `SELECT ... INTO OUTFILE`/`DUMPFILE` e funções
  administrativas bloqueadas;
- consultas digitadas têm no máximo 4.000 caracteres e o resultado exibido é limitado a 100
  linhas;
- somente hosts de loopback (`localhost`, `127.0.0.1` e `::1`) são aceitos nesta versão;
- senha de banco é passada ao cliente por variável de ambiente (`PGPASSWORD`/`MYSQL_PWD`), nunca
  como argumento visível do processo.

O modo read-only do banco é a barreira principal contra alterações de dados/schema. A validação
textual é uma defesa adicional e não substitui as permissões do banco. Extensões, UDFs ou funções
criadas pelo próprio projeto podem produzir efeitos externos que o mecanismo transacional do banco
não consegue impedir; por isso, para consultas livres, use preferencialmente um usuário de banco
com o menor conjunto de privilégios necessário para leitura.

## Snapshots

- **Criar snapshot** guarda o estado atual do banco do ambiente selecionado.
- **Restaurar** exige confirmação explícita: a API gera um token de confirmação válido por 60
  segundos, e só restaura de fato depois que esse token é reenviado — cancelar a qualquer momento
  descarta o pedido sem tocar no banco.

## Migrations (Rails)

- Lista todas as migrations do projeto com status `up` (aplicada) ou `down` (pendente), com filtro
  por nome/versão e por status.
- Abrir uma migration mostra o código-fonte do arquivo em um modal, com destaque de sintaxe.
- A sub-seção Operações permite rodar as mutações conhecidas de migration (`db:migrate`,
  `db:rollback` — 1 passo —, `db:seed`, `db:prepare`) pelo catálogo fechado de comandos do projeto
  — nunca uma string de shell livre. A saída é exibida ao vivo num terminal (mesmo mecanismo de
  execução destacável da suíte de testes, ver `docs/guia/testes.md`): pedir a operação abre um
  diálogo de confirmação, e a execução continua no servidor mesmo que a aba seja fechada — reabrir
  a aba de Operações reconecta e mostra a saída acumulada. Só uma operação por vez; um botão
  **Cancelar** aparece enquanto ela está rodando.

## Modelos (Rails)

- Explora o schema atual: tabelas, colunas (com tipo, limite, precisão/escala), índices e chaves
  estrangeiras, com busca por nome de tabela ou coluna.

## Segurança

Como as demais abas mutáveis do dashboard, toda ação que altera algo (iniciar/pausar/reiniciar um
serviço, restaurar um snapshot, rodar uma migration) usa o catálogo fechado de comandos conhecidos
pela API — nunca um comando arbitrário vindo do navegador. Restaurar snapshot exige o token de
confirmação de uso único descrito acima; as operações de migration pedem confirmação no próprio
navegador antes de iniciar e, por rodarem num canal WebSocket somente leitura (sem stdin livre),
não usam token de confirmação do servidor.

O explorador SQL livre é uma operação separada: ele só aceita leitura, combina política read-only
no próprio banco com validação adicional na API e nunca deve ser usado como substituto de um usuário
de banco com privilégios mínimos. Ver `docs/architecture/security.md` para o detalhe do modelo de
ameaça.
