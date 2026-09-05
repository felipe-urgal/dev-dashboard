# Security Center

O Security Center agrega findings locais de scanners opcionais sem transformar a API em scanner próprio e sem transportar material sensível além do necessário para a decisão do usuário.

## Contrato de provider

`apps/api/src/services/security-scanner-provider.ts` define uma fronteira independente de scanner para:

- disponibilidade (`available`, `missing`, `unavailable`);
- execução (`completed`, `failed`, `invalid-output`);
- timestamp e diagnóstico sanitizado;
- resultado tipado pelo provider.

Scanner ausente é capability opcional indisponível, não erro global do projeto.

## Primeiro provider: Trivy

O provider Trivy cobre somente:

- `secret`;
- `misconfiguration`.

Vulnerabilidades de dependências permanecem fora desta superfície para não duplicar o domínio de Dependency Health.

A disponibilidade usa `trivy --version` e preserva somente uma versão curta reconhecida. O scan usa argv fixo equivalente a:

```text
trivy fs --format json --scanners secret,misconfig --no-progress \
  --skip-dirs node_modules --skip-dirs dist --skip-dirs build \
  --skip-dirs coverage .
```

O `cwd` vem do `Project` conhecido pelo backend. O processo usa `execFile`, sem shell, com timeout de 60 segundos e limite de 4 MiB para stdout estruturado. O Dashboard não baixa nem instala Trivy automaticamente.

## Regra de segurança para secrets

A normalização usa **allowlist de campos públicos**. O adapter nunca copia o objeto bruto retornado pelo Trivy para o DTO normalizado.

Para secrets, somente estes dados podem sobreviver à normalização:

- provider;
- categoria;
- rule ID validado;
- severidade;
- título local derivado do rule ID;
- path relativo do arquivo;
- linha quando disponível;
- fingerprint derivado de metadados não secretos;
- timestamp da observação.

Campos como `Match`, título remoto, conteúdo de código, trechos, valores detectados e estruturas não reconhecidas são descartados por construção. Isso evita depender de masking visual ou de sanitização tardia.

O rule ID também passa por allowlist curta de caracteres. Assim um provider malformado não consegue usar esse campo como canal alternativo para transportar conteúdo livre/sensível.

Erros de execução, stderr e stdout inválido não são devolvidos pelo provider. A resposta contém apenas códigos/diagnósticos locais estáveis; um erro que carregue path, URL ou secret não vira DTO público.

## Paths, limites e referências

Findings com target absoluto, path Windows absoluto ou path que escape por `..` são descartados. Um path presente no relatório não concede autoridade de filesystem.

Strings públicas são bounded e o parser retém no máximo 1.000 findings por relatório normalizado. Referências externas só são preservadas quando usam `http` ou `https`.

Diretórios gerados/pesados conhecidos (`node_modules`, `dist`, `build`, `coverage`) são ignorados pelo argv do MVP. Isso não autoriza filtros vindos da UI nem paths arbitrários.

## Fingerprint

O fingerprint usa SHA-256 sobre categoria, rule ID, arquivo e linha. Ele serve para deduplicação sem persistir conteúdo do finding.

## Limites atuais

Este recorte adiciona disponibilidade e scan manual executável, mas ainda não cria rota HTTP, persistência ou UI. Também não existe instalação automática do binário nem política de bloquear Release Readiness por finding; qualquer integração futura precisa preservar freshness e política explícita.
