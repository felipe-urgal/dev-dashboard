# Referência da API HTTP local

> Documento gerado automaticamente por `scripts/generate-api-docs.mjs` a partir dos JSON
> Schemas declarados nas rotas Fastify (`apps/api/src/routes/*.ts`) e dos schemas de resposta
> compartilhados em `apps/api/src/http/response-schemas.ts`. **Não edite este arquivo à mão** —
> rode `npm run docs:api` depois de alterar uma rota. `npm run docs:api:check` falha se este
> arquivo estiver desatualizado em relação ao código.

Todas as rotas abaixo (exceto `GET /api/health`) exigem o header `X-Dev-Dashboard-Token` com o
token local persistido em `~/.config/dev-dashboard/api-token`. Veja
`docs/architecture/security.md` para o modelo de segurança completo.

## Erros comuns

A maioria das rotas pode responder com o formato de erro padrão da API
(`apps/api/src/http/api-error.ts`) nos códigos 400, 401, 403, 404, 409 e/ou 500 — o schema é
sempre o mesmo:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "error",
    "message"
  ],
  "properties": {
    "error": {
      "type": "string"
    },
    "message": {
      "type": "string"
    },
    "details": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "message"
        ],
        "properties": {
          "path": {
            "type": "string"
          },
          "message": {
            "type": "string"
          }
        }
      }
    }
  }
}
```

Abaixo, cada rota referencia este formato como "erro padrão da API" em vez de repetir o schema.

## Bundler

### `GET /api/projects/:projectId/bundler`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "bundler"
    ],
    "properties": {
      "bundler": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "supported",
          "outdated"
        ],
        "properties": {
          "supported": {
            "type": "boolean"
          },
          "check": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "satisfied",
              "message"
            ],
            "properties": {
              "satisfied": {
                "type": "boolean"
              },
              "message": {
                "type": "string"
              }
            }
          },
          "outdated": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "name",
                "installed",
                "newest"
              ],
              "properties": {
                "name": {
                  "type": "string"
                },
                "installed": {
                  "type": "string"
                },
                "newest": {
                  "type": "string"
                },
                "requested": {
                  "type": "string"
                }
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

## Database

### `GET /api/database`

_Rota sem schema declarado (ex. upgrade de WebSocket)._

### `POST /api/database/:serviceId/install`

_Rota sem schema declarado (ex. upgrade de WebSocket)._

### `POST /api/database/:serviceId/restart`

_Rota sem schema declarado (ex. upgrade de WebSocket)._

### `POST /api/database/:serviceId/start`

_Rota sem schema declarado (ex. upgrade de WebSocket)._

### `POST /api/database/:serviceId/stop`

_Rota sem schema declarado (ex. upgrade de WebSocket)._

### `GET /api/projects/:projectId/database`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "page": {
      "type": "integer",
      "minimum": 1,
      "maximum": 10000
    },
    "pageSize": {
      "type": "integer",
      "minimum": 1,
      "maximum": 50
    }
  }
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "database"
    ],
    "properties": {
      "database": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "supported",
          "environments",
          "page",
          "pageSize",
          "total"
        ],
        "properties": {
          "supported": {
            "type": "boolean"
          },
          "environments": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "id",
                "environment",
                "driver",
                "passwordConfigured",
                "source",
                "sourceDetail",
                "reachability",
                "serviceAvailable"
              ],
