from pathlib import Path


def replace_required(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'{label} block not found')
    return text.replace(old, new)


architecture = Path('docs/architecture/database-explorer.md')
text = architecture.read_text()
text = replace_required(
    text,
    '    ↓\npsql / mysql',
    '    ↓\npg / mysql2 (protocolo nativo)',
    'architecture transport',
)
text = replace_required(
    text,
    '- variáveis de ambiente e argumentos do cliente;\n'
    '- configuração read-only específica do driver;\n'
    '- execução e classificação das falhas do cliente.',
    '- configuração read-only específica do driver;\n'
    '- conexão e execução pelo protocolo nativo via `pg`/`mysql2`;\n'
    '- normalização JSON-safe dos valores retornados;\n'
    '- timeout, cancelamento, limite de linhas/tamanho e classificação de falhas.',
    'architecture adapter bullets',
)
old = '''A execução CLI compartilhada fica em `database-explorer-cli.ts`, incluindo timeout, cancelamento, limite de resultado e o parser tabular atual. O parser TSV é mantido deliberadamente neste recorte para que a separação de adapters não seja misturada com a troca de protocolo de resultado.

## Decisão sobre `pg` e `mysql2`

O PR de adapters preserva `psql`/`mysql` como transporte para manter o comportamento atual enquanto cria a fronteira correta por driver. A adoção de `pg`/`mysql2` foi separada para o próximo recorte, que também removerá a fragilidade do TSV e passará a trabalhar com resultados estruturados. Fazer as duas mudanças ao mesmo tempo dificultaria distinguir regressões de arquitetura de regressões de protocolo/driver.

Os adapters foram desenhados para permitir essa substituição sem alterar `DatabaseExplorerService`, rotas ou política read-only comum.'''
new = '''## Resultados estruturados

Os adapters usam `pg` e `mysql2` diretamente, com rows em modo array e metadados de campos fornecidos pelo protocolo do banco. Não existe mais parser TSV no caminho do Explorer, portanto valores com tab, newline e `NULL` permanecem células reais em vez de delimitadores ambíguos.

A normalização antes da resposta HTTP preserva strings, números, booleanos e `null`; `bigint` vira string, datas viram ISO e binários viram hexadecimal. A query livre recebe um limite superior de 101 linhas antes de chegar ao driver, a resposta expõe no máximo 100 linhas e o payload estruturado mantém teto de 2 MiB. PostgreSQL e MySQL/MariaDB executam cada operação dentro de uma transação explicitamente read-only e sempre fazem rollback/cleanup ao final.'''
text = replace_required(text, old, new, 'architecture structured results')
text = replace_required(
    text,
    'cada adapter pode ser testado com um `DatabaseCommandRunner` injetado',
    'cada adapter pode ser testado com uma factory de client nativo injetada',
    'architecture testing',
)
text = replace_required(
    text,
    'O próximo recorte de infraestrutura substitui o protocolo TSV por resultados estruturados e reavalia `pg`/`mysql2` dentro dos adapters recém-criados, sem alterar as camadas superiores.\n\n'
    'O cancelamento nasce na requisição HTTP e é propagado como `AbortSignal` pelas camadas até o processo do cliente de banco.',
    'O protocolo TSV foi removido sem alterar o contrato HTTP nem as camadas superiores.\n\n'
    'O cancelamento nasce na requisição HTTP e é propagado como `AbortSignal` pelas camadas até o client nativo do banco.',
    'architecture next step',
)
architecture.write_text(text)

security = Path('docs/architecture/security.md')
text = security.read_text()
old = '''- PostgreSQL recebe `PGOPTIONS` com `default_transaction_read_only=on`; cada nova transação da
  sessão nasce em modo somente leitura. A sessão também recebe `statement_timeout=15000`;
- MySQL/MariaDB executam `SET SESSION TRANSACTION READ ONLY` via `--init-command` assim que o
  cliente conecta, definindo o modo de acesso das transações seguintes da sessão;'''
new = '''- PostgreSQL usa o driver `pg`, abre `BEGIN READ ONLY` antes da consulta e configura
  `statement_timeout`/`query_timeout` em 15 segundos;
- MySQL/MariaDB usam `mysql2` e abrem `START TRANSACTION READ ONLY` antes da consulta;'''
text = replace_required(text, old, new, 'security readonly')
text = replace_required(
    text,
    '- consultas têm até 4.000 caracteres, o processo cliente tem timeout de 15 segundos, PostgreSQL\n'
    '  também aplica timeout no servidor e a resposta exibida é limitada a 100 linhas;',
    '- consultas têm até 4.000 caracteres; queries livres são limitadas a 101 linhas no servidor, os\n'
    '  drivers têm timeout de 15 segundos, a resposta expõe no máximo 100 linhas e mantém teto de 2 MiB;',
    'security limits',
)
text = replace_required(
    text,
    '- credenciais são fornecidas ao subprocesso por ambiente (`PGPASSWORD`/`MYSQL_PWD`) e não entram\n'
    '  nos argumentos do processo. Falhas são traduzidas para mensagens genéricas antes de voltar à UI;',
    '- credenciais são entregues diretamente às opções de conexão dos drivers e não passam por argv,\n'
    '  shell ou logs. Falhas são traduzidas para mensagens genéricas antes de voltar à UI;\n'
    '- resultados vêm como arrays estruturados + metadados de coluna do protocolo nativo; tab, newline e\n'
    '  `NULL` não dependem mais de parsing por delimitador TSV;',
    'security credentials',
)
security.write_text(text)

guide = Path('docs/guia/banco-de-dados.md')
text = guide.read_text()
old = '''- PostgreSQL inicia a sessão com `default_transaction_read_only=on`; o mesmo canal também recebe
  `statement_timeout=15000` para limitar a consulta no servidor;
- MySQL e MariaDB executam `SET SESSION TRANSACTION READ ONLY` ao conectar, fazendo as transações
  seguintes da sessão nascerem em modo de leitura;'''
new = '''- PostgreSQL usa `pg` e abre cada operação com `BEGIN READ ONLY`, com timeout de 15 segundos;
- MySQL e MariaDB usam `mysql2` e abrem cada operação com `START TRANSACTION READ ONLY`;'''
text = replace_required(text, old, new, 'guide readonly')
text = replace_required(
    text,
    '- consultas digitadas têm no máximo 4.000 caracteres e o resultado exibido é limitado a 100\n'
    '  linhas;',
    '- consultas digitadas têm no máximo 4.000 caracteres, a query livre é limitada a 101 linhas no\n'
    '  servidor, o resultado exibido mostra até 100 linhas e o payload tem teto de 2 MiB;',
    'guide limits',
)
text = replace_required(
    text,
    '- senha de banco é passada ao cliente por variável de ambiente (`PGPASSWORD`/`MYSQL_PWD`), nunca\n'
    '  como argumento visível do processo;',
    '- credenciais são passadas diretamente às opções de conexão do driver, sem argv ou shell;\n'
    '- resultados são estruturados pelo protocolo nativo, preservando tab, newline e `NULL` sem parsing TSV;',
    'guide credentials',
)
guide.write_text(text)
