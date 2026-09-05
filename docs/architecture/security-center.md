# Security Center

O Security Center agrega findings locais de scanners opcionais sem transformar a API em scanner próprio e sem transportar material sensível além do necessário para a decisão do usuário.

## Primeiro provider: Trivy

O primeiro recorte implementa a fronteira de normalização da saída estruturada do Trivy para duas categorias:

- `secret`;
- `misconfiguration`.

Vulnerabilidades de dependências permanecem fora desta superfície para não duplicar o domínio de Dependency Health.

## Regra de segurança para secrets

A normalização usa **allowlist de campos públicos**. O adapter nunca copia o objeto bruto retornado pelo Trivy para o DTO normalizado.

Para secrets, somente estes dados podem sobreviver à normalização:

- provider;
- categoria;
- rule ID;
- severidade;
- título;
- path relativo do arquivo;
- linha quando disponível;
- fingerprint derivado de metadados não secretos;
- timestamp da observação.

Campos como `Match`, conteúdo de código, trechos, valores detectados e estruturas não reconhecidas são descartados por construção. Isso evita depender de masking visual ou de sanitização tardia.

## Paths e referências

Findings com target absoluto ou path que escape por `..` são descartados. A futura execução do provider ainda deve resolver o `cwd` a partir do projeto validado pelo backend; um path presente no relatório não concede autoridade de filesystem.

Referências externas só são preservadas quando usam `http` ou `https`.

## Fingerprint

O fingerprint usa SHA-256 sobre categoria, rule ID, arquivo e linha. Ele serve para deduplicação sem persistir conteúdo do finding.

## Limites deste recorte

Este slice implementa parsing, normalização e testes de não-vazamento. Ainda não inicia processos do Trivy, não cria rota HTTP, não persiste findings e não adiciona UI.

A execução entra em recorte posterior com argv fixo/estruturado, `cwd` validado, timeout, limite de output, lifecycle explícito e estado suportado para scanner ausente.
