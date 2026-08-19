Warning: truncated output (original token count: 91538)
Total output lines: 17235

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

### `POST /api/database/:serviceId/uninstall`

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
              "properties": {
                "id": {
                  "type": "string"
                },
                "environment": {
                  "type": "string"
                },
                "driver": {
                  "type": "string"
                },
                "host": {
                  "type": "string"
                },
                "port": {
                  "type": "integer"
                },
                "database": {
                  "type": "string"
                },
                "username": {
                  "type": "string"
                },
                "passwordConfigured": {
                  "type": "boolean"
                },
                "maskedUrl": {
                  "type": "string"
                },
                "source": {
                  "type": "string",
                  "enum": [
                    "rails-database-yml",
                    "dotenv",
                    "prisma",
                    "knex"
                  ]
                },
                "sourceDetail": {
                  "type": "string"
                },
                "reachability": {
                  "type": "string",
                  "enum": [
                    "reachable",
                    "unreachable",
                    "unknown"
                  ]
                },
                "serviceAvailable": {
                  "type": "boolean"
                }
              }
            }
          },
          "page": {
            "type": "integer"
          },
          "pageSize": {
            "type": "integer"
          },
          "total": {
            "type": "integer"
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

### `POST /api/projects/:projectId/database/:environmentId/restart`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "environmentId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "environmentId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "action"
    ],
    "properties": {
      "action": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "environmentId",
          "action",
          "succeeded"
        ],
        "properties": {
          "environmentId": {
            "type": "string"
          },
          "action": {
            "type": "string",
            "enum": [
              "start",
              "stop",
              "restart"
            ]
          },
          "succeeded": {
            "type": "boolean"
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

### `POST /api/projects/:projectId/database/:environmentId/reveal`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "environmentId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "environmentId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "secret"
    ],
    "properties": {
      "secret": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "environmentId",
          "databaseUrl"
        ],
        "properties": {
          "environmentId": {
            "type": "string"
          },
          "databaseUrl": {
            "type": "string"
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

### `POST /api/projects/:projectId/database/:environmentId/start`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "environmentId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "environmentId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "action"
    ],
    "properties": {
      "action": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "environmentId",
          "action",
          "succeeded"
        ],
        "properties": {
          "environmentId": {
            "type": "string"
          },
          "action": {
            "type": "string",
            "enum": [
              "start",
              "stop",
              "restart"
            ]
          },
          "succeeded": {
            "type": "boolean"
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

### `POST /api/projects/:projectId/database/:environmentId/stop`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "environmentId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "environmentId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "action"
    ],
    "properties": {
      "action": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "environmentId",
          "action",
          "succeeded"
        ],
        "properties": {
          "environmentId": {
            "type": "string"
          },
          "action": {
            "type": "string",
            "enum": [
              "start",
              "stop",
              "restart"
            ]
          },
          "succeeded": {
            "type": "boolean"
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

### `GET /api/projects/:projectId/database/snapshots`

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
  "properties": {}
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "snapshots"
    ],
    "properties": {
      "snapshots": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "snapshots",
          "total",
          "retentionLimit",
          "supportedEnvironmentIds"
        ],
        "properties": {
          "snapshots": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "id",
                "environmentId",
                "environment",
                "driver",
                "database",
                "label",
                "createdAt",
                "sizeBytes"
              ],
              "properties": {
                "id": {
                  "type": "string"
                },
                "environmentId": {
                  "type": "string"
                },
                "environment": {
                  "type": "string"
                },
                "driver": {
                  "type": "string",
                  "enum": [
                    "mysql",
                    "postgresql"
                  ]
                },
                "database": {
                  "type": "string"
                },
                "label": {
                  "type": "string"
                },
                "createdAt": {
                  "type": "string"
                },
                "sizeBytes": {
                  "type": "integer",
                  "minimum": 0
                }
              }
            }
          },
          "total": {
            "type": "integer",
            "minimum": 0
          },
          "retentionLimit": {
            "type": "integer",
            "minimum": 1
          },
          "supportedEnvironmentIds": {
            "type": "array",
            "items": {
              "type": "string"
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

### `POST /api/projects/:projectId/database/snapshots`

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
  "properties": {}
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "environmentId"
  ],
  "properties": {
    "environmentId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120
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
      "snapshot"
    ],
    "properties": {
      "snapshot": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "environmentId",
          "environment",
          "driver",
          "database",
          "label",
          "createdAt",
          "sizeBytes"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "environmentId": {
            "type": "string"
          },
          "environment": {
            "type": "string"
          },
          "driver": {
            "type": "string",
            "enum": [
              "mysql",
              "postgresql"
            ]
          },
          "database": {
            "type": "string"
          },
          "label": {
            "type": "string"
          },
          "createdAt": {
            "type": "string"
          },
          "sizeBytes": {
            "type": "integer",
            "minimum": 0
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

### `POST /api/projects/:projectId/database/snapshots/:snapshotId/restore`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "snapshotId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "snapshotId": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "confirmationToken"
  ],
  "properties": {
    "confirmationToken": {
      "type": "string",
      "minLength": 64,
      "maxLength": 64
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
      "restore"
    ],
    "properties": {
      "restore": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "snapshotId",
          "restored"
        ],
        "properties": {
          "snapshotId": {
            "type": "string"
          },
          "restored": {
            "type": "boolean"
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

### `POST /api/projects/:projectId/database/snapshots/:snapshotId/restore/confirmation`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "snapshotId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "snapshotId": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "confirmation"
    ],
    "properties": {
      "confirmation": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "token",
          "snapshotId",
          "expiresAt"
        ],
        "properties": {
          "token": {
            "type": "string"
          },
          "snapshotId": {
            "type": "string"
          },
          "expiresAt": {
            "type": "string"
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

## Dependencies Pty Routes

### `POST /api/projects/:projectId/dependencies/pty/cancel`

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

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "ok"
    ],
    "properties": {
      "ok": {
        "type": "boolean"
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

### `GET /api/projects/:projectId/dependencies/pty/connect`

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

### `POST /api/projects/:projectId/dependencies/pty/start`

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

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "actionId"
  ],
  "properties": {
    "actionId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    }
  }
}
```

**Resposta**

- **201**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "snapshot"
    ],
    "properties": {
      "snapshot": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "actionId",
          "actionName",
          "status",
          "exitCode",
          "exitSignal",
          "startedAt",
          "endedAt"
        ],
        "properties": {
          "actionId": {
            "type": "string"
          },
          "actionName": {
            "type": "string"
          },
          "status": {
            "type": "string",
            "enum": [
              "running",
              "exited"
            ]
          },
          "exitCode": {
            "type": [
              "integer",
              "null"
            ]
          },
          "exitSignal": {
            "type": [
              "integer",
              "null"
            ]
          },
          "startedAt": {
            "type": "string"
          },
          "endedAt": {
            "type": [
              "string",
              "null"
            ]
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

### `GET /api/projects/:projectId/dependencies/pty/status`

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
      "snapshot"
    ],
    "properties": {
      "snapshot": {
        "type": [
          "object",
          "null"
        ],
        "additionalProperties": false,
        "required": [
          "actionId",
          "actionName",
          "status",
          "exitCode",
          "exitSignal",
          "startedAt",
          "endedAt"
        ],
        "properties": {
          "actionId": {
            "type": "string"
          },
          "actionName": {
            "type": "string"
          },
          "status": {
            "type": "string",
            "enum": [
              "running",
              "exited"
            ]
          },
          "exitCode": {
            "type": [
              "integer",
              "null"
            ]
          },
          "exitSignal": {
            "type": [
              "integer",
              "null"
            ]
          },
          "startedAt": {
            "type": "string"
          },
          "endedAt": {
            "type": [
              "string",
              "null"
            ]
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

## Directories

### `GET /api/directories`

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "path": {
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
      "rootPath",
      "currentPath",
      "parentPath",
      "directories"
    ],
    "properties": {
      "rootPath": {
        "type": "string"
      },
      "currentPath": {
        "type": "string"
      },
      "parentPath": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ]
      },
      "directories": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "name",
            "path"
          ],
          "properties": {
            "name": {
              "type": "string"
            },
            "path": {
              "type": "string"
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

## Git Branch Delete

### `POST /api/projects/:projectId/git/branches/delete`

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

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "branch",
    "confirmationToken"
  ],
  "properties": {
    "branch": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "confirmationToken": {
      "type": "string",
      "minLength": 64,
      "maxLength": 64
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
      "branch"
    ],
    "properties": {
      "branch": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "branch"
        ],
        "properties": {
          "branch": {
            "type": "string"
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

### `POST /api/projects/:projectId/git/branches/delete/confirmations`

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

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "branch"
  ],
  "properties": {
    "branch": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    }
  }
}
```

**Resposta**

- **201**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "confirmation"
    ],
    "properties": {
      "confirmation": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "token",
          "operation",
          "target",
          "expiresAt"
        ],
        "properties": {
          "token": {
            "type": "string"
          },
          "operation": {
            "type": "string",
            "enum": [
              "delete-branch"
            ]
          },
          "target": {
            "type": "string"
          },
          "expiresAt": {
            "type": "string"
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

## Git Branch Rename

### `POST /api/projects/:projectId/git/branches/rename`

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

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "currentName",
    "nextName",
    "confirmationToken"
  ],
  "properties": {
    "currentName": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "nextName": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "confirmationToken": {
      "type": "string",
      "minLength": 64,
      "maxLength": 64
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
      "branch"
    ],
    "properties": {
      "branch": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "branch"
        ],
        "properties": {
          "branch": {
            "type": "string"
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

### `POST /api/projects/:projectId/git/branches/rename/confirmations`

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

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "currentName",
    "nextName"
  ],
  "properties": {
    "currentName": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "nextName": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    }
  }
}
```

**Resposta**

- **201**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "confirmation"
    ],
    "properties": {
      "confirmation": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "token",
          "operation",
          "currentName",
          "nextName",
          "expiresAt"
        ],
        "properties": {
          "token": {
            "type": "string"
          },
          "operation": {
            "type": "string",
            "enum": [
              "rename-branch"
            ]
          },
          "currentName": {
            "type": "string"
          },
          "nextName": {
            "type": "string"
          },
          "expiresAt": {
            "type": "string"
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

## Git Commit Details

### `GET /api/projects/:projectId/git/commits`

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
    "ref": {
      "type": "string",
      "minLength": 1,
      "maxLength": 250,
      "pattern": "^(?!-)[^\\u0000-\\u001F\\u007F]+$"
    },
    "page": {
      "type": "integer",
      "minimum": 1,
      "default": 1
    },
    "pageSize": {
      "type": "integer",
      "minimum": 1,
      "maximum": 50,
      "default": 10
    },
    "search": {
      "type": "string",
      "maxLength": 200
    },
    "author": {
      "type": "string",
      "maxLength": 320
    },
    "kind": {
      "type": "string",
      "enum": [
        "all",
        "regular",
        "merge"
      ],
      "default": "all"
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
      "history"
    ],
    "properties": {
      "history": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "branch",
          "page",
          "pageSize",
          "total",
          "totalPages",
          "commits"
        ],
        "properties": {
          "branch": {
            "type": "string"
          },
          "page": {
            "type": "integer",
            "minimum": 1
          },
          "pageSize": {
            "type": "integer",
            "minimum": 1,
            "maximum": 10
          },
          "total": {
            "type": "integer",
            "minimum": 0
          },
          "totalPages": {
            "type": "integer",
            "minimum": 0
          },
          "commits": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "hash",
                "shortHash",
                "subject",
                "authorName",
                "authorEmail",
                "authoredAt",
                "parentCount"
              ],
              "properties": {
                "hash": {
                  "type": "string"
                },
                "shortHash": {
                  "type": "string"
                },
                "subject": {
                  "type": "string"
                },
                "authorName": {
                  "type": "string"
                },
                "authorEmail": {
                  "type": "string"
                },
                "authoredAt": {
                  "type": "string"
                },
                "parentCount": {
                  "type": "integer",
                  "minimum": 0
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

### `GET /api/projects/:projectId/git/commits/:commitHash`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "commitHash"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "commitHash": {
      "type": "string",
      "minLength": 7,
      "maxLength": 40,
      "pattern": "^[0-9a-fA-F]+$"
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
      "detail"
    ],
    "properties": {
      "detail": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "hash",
          "shortHash",
          "subject",
          "body",
          "authorName",
          "authorEmail",
          "authoredAt",
          "files",
          "additions",
          "deletions",
          "patch",
          "truncated",
          "masked",
          "redactionCount"
        ],
        "properties": {
          "hash": {
            "type": "string"
          },
          "shortHash": {
            "type": "string"
          },
          "subject": {
            "type": "string"
          },
          "body": {
            "type": "string"
          },
          "authorName": {
            "type": "string"
          },
          "authorEmail": {
            "type": "string"
          },
          "authoredAt": {
            "type": "string"
          },
          "files": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "path",
                "status",
                "additions",
                "deletions",
                "binary"
              ],
              "properties": {
                "path": {
                  "type": "string"
                },
                "previousPath": {
                  "type": "string"
                },
                "status": {
                  "type": "string",
                  "enum": [
                    "added",
                    "modified",
                    "deleted",
                    "renamed",
                    "copied",
                    "type-changed"
                  ]
                },
                "additions": {
                  "type": "integer",
                  "minimum": 0
                },
                "deletions": {
                  "type": "integer",
                  "minimum": 0
                },
                "binary": {
                  "type": "boolean"
                }
              }
            }
          },
          "additions": {
            "type": "integer",
            "minimum": 0
          },
          "deletions": {
            "type": "integer",
            "minimum": 0
          },
          "patch": {
            "type": "string"
          },
          "truncated": {
            "type": "boolean"
          },
          "masked": {
            "type": "boolean"
          },
          "redactionCount": {
            "type": "integer",
            "minimum": 0
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

### `GET /api/projects/:projectId/git/commits/:commitHash/file`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "commitHash"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "commitHash": {
      "type": "string",
      "minLength": 7,
      "maxLength": 40,
      "pattern": "^[0-9a-fA-F]+$"
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "path"
  ],
  "properties": {
    "path": {
      "type": "string",
      "minLength": 1,
      "maxLength": 2048
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
      "file"
    ],
    "properties": {
      "file": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "hash",
          "path",
          "status",
          "binary",
          "content",
          "truncated",
          "masked",
          "redactionCount"
        ],
        "properties": {
          "hash": {
            "type": "string"
          },
          "path": {
            "type": "string"
          },
          "status": {
            "type": "string",
            "enum": [
              "added",
              "modified",
              "deleted",
              "renamed",
              "copied",
              "type-changed"
            ]
          },
          "binary": {
            "type": "boolean"
          },
          "content": {
            "type": "string"
          },
          "truncated": {
            "type": "boolean"
          },
          "masked": {
            "type": "boolean"
          },
          "redactionCount": {
            "type": "integer",
            "minimum": 0
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

## Git Current Branch History

### `GET /api/projects/:projectId/git/current-branch-commits`

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
      "default": 1
    },
    "pageSize": {
      "type": "integer",
      "minimum": 1,
      "maximum": 10,
      "default": 10
    },
    "search": {
      "type": "string",
      "maxLength": 200
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
      "history"
    ],…67538 tokens truncated…
      "profile": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "name",
          "variables",
          "createdAt",
          "updatedAt"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "name": {
            "type": "string"
          },
          "variables": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "name"
              ],
              "properties": {
                "name": {
                  "type": "string"
                },
                "value": {
                  "type": "string"
                }
              }
            }
          },
          "createdAt": {
            "type": "string"
          },
          "updatedAt": {
            "type": "string"
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

### `DELETE /api/settings/environment-profiles/:profileId`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "profileId"
  ],
  "properties": {
    "profileId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Resposta**

- **204**:

  ```json
  {
    "type": "null"
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `PUT /api/settings/environment-profiles/:profileId`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "profileId"
  ],
  "properties": {
    "profileId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "name",
    "variables"
  ],
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "variables": {
      "type": "array",
      "maxItems": 30,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "name"
        ],
        "properties": {
          "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 100
          },
          "value": {
            "type": "string",
            "maxLength": 4096
          }
        }
      }
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
      "profile"
    ],
    "properties": {
      "profile": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "name",
          "variables",
          "createdAt",
          "updatedAt"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "name": {
            "type": "string"
          },
          "variables": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "name"
              ],
              "properties": {
                "name": {
                  "type": "string"
                },
                "value": {
                  "type": "string"
                }
              }
            }
          },
          "createdAt": {
            "type": "string"
          },
          "updatedAt": {
            "type": "string"
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

## Test Related

### `GET /api/projects/:projectId/tests/:commandId/related`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "commandId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "commandId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 80
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "related"
    ],
    "properties": {
      "related": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "baseBranch",
          "currentBranch",
          "changedFiles",
          "testFiles"
        ],
        "properties": {
          "baseBranch": {
            "type": "string",
            "maxLength": 256
          },
          "currentBranch": {
            "type": "string",
            "maxLength": 256
          },
          "changedFiles": {
            "type": "array",
            "maxItems": 2000,
            "items": {
              "type": "string",
              "maxLength": 2048
            }
          },
          "testFiles": {
            "type": "array",
            "maxItems": 100,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "path"
              ],
              "properties": {
                "path": {
                  "type": "string",
                  "maxLength": 2048
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

### `POST /api/projects/:projectId/tests/:commandId/related/start`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "commandId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "commandId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 80
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Resposta**

- **201**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "process"
    ],
    "properties": {
      "process": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "projectId",
          "kind",
          "status"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "projectId": {
            "type": "string"
          },
          "workspaceId": {
            "type": "string"
          },
          "kind": {
            "type": "string",
            "enum": [
              "server",
              "webpack",
              "worker",
              "test",
              "script"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "starting",
              "running",
              "stopping",
              "stopped",
              "failed"
            ]
          },
          "pid": {
            "type": "integer"
          },
          "port": {
            "type": "integer"
          },
          "url": {
            "type": "string"
          },
          "urls": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "command": {
            "type": "string"
          },
          "args": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "startedAt": {
            "type": "string"
          },
          "stoppedAt": {
            "type": "string"
          },
          "exitCode": {
            "type": "integer"
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

## Tests

### `GET /api/projects/:projectId/tests`

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
    "refresh": {
      "type": "boolean"
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
      "tests"
    ],
    "properties": {
      "tests": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "supported",
          "commands"
        ],
        "properties": {
          "supported": {
            "type": "boolean"
          },
          "commands": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "id",
                "runner",
                "label",
                "description",
                "origin",
                "priority",
                "supportsFileTarget",
                "supportsCaseTarget",
                "supportsNamePatternTarget"
              ],
              "properties": {
                "id": {
                  "type": "string"
                },
                "runner": {
                  "type": "string",
                  "enum": [
                    "vitest",
                    "jest",
                    "node-test",
                    "rspec",
                    "rails-test",
                    "minitest",
                    "pytest"
                  ]
                },
                "label": {
                  "type": "string"
                },
                "description": {
                  "type": "string"
                },
                "origin": {
                  "type": "string",
                  "enum": [
                    "package-script",
                    "binary",
                    "gemfile",
                    "directory",
                    "python-config"
                  ]
                },
                "originDetail": {
                  "type": "string"
                },
                "priority": {
                  "type": "integer"
                },
                "supportsFileTarget": {
                  "type": "boolean"
                },
                "supportsCaseTarget": {
                  "type": "boolean"
                },
                "supportsNamePatternTarget": {
                  "type": "boolean"
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

### `GET /api/projects/:projectId/tests/:commandId/files`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "commandId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "commandId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 80
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "files"
    ],
    "properties": {
      "files": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "path"
          ],
          "properties": {
            "path": {
              "type": "string"
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

### `POST /api/projects/:projectId/tests/:commandId/files/start`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "commandId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "commandId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 80
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "path"
  ],
  "properties": {
    "path": {
      "type": "string",
      "minLength": 1,
      "maxLength": 2048
    },
    "line": {
      "type": "integer",
      "minimum": 1,
      "maximum": 1000000
    },
    "namePattern": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    }
  }
}
```

**Resposta**

- **201**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "process"
    ],
    "properties": {
      "process": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "projectId",
          "kind",
          "status"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "projectId": {
            "type": "string"
          },
          "workspaceId": {
            "type": "string"
          },
          "kind": {
            "type": "string",
            "enum": [
              "server",
              "webpack",
              "worker",
              "test",
              "script"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "starting",
              "running",
              "stopping",
              "stopped",
              "failed"
            ]
          },
          "pid": {
            "type": "integer"
          },
          "port": {
            "type": "integer"
          },
          "url": {
            "type": "string"
          },
          "urls": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "command": {
            "type": "string"
          },
          "args": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "startedAt": {
            "type": "string"
          },
          "stoppedAt": {
            "type": "string"
          },
          "exitCode": {
            "type": "integer"
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

### `POST /api/projects/:projectId/tests/:commandId/start`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "commandId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "commandId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 80
    }
  }
}
```

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Resposta**

- **201**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "process"
    ],
    "properties": {
      "process": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "projectId",
          "kind",
          "status"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "projectId": {
            "type": "string"
          },
          "workspaceId": {
            "type": "string"
          },
          "kind": {
            "type": "string",
            "enum": [
              "server",
              "webpack",
              "worker",
              "test",
              "script"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "starting",
              "running",
              "stopping",
              "stopped",
              "failed"
            ]
          },
          "pid": {
            "type": "integer"
          },
          "port": {
            "type": "integer"
          },
          "url": {
            "type": "string"
          },
          "urls": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "command": {
            "type": "string"
          },
          "args": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "startedAt": {
            "type": "string"
          },
          "stoppedAt": {
            "type": "string"
          },
          "exitCode": {
            "type": "integer"
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

### `DELETE /api/projects/:projectId/tests/history`

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
      "history"
    ],
    "properties": {
      "history": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "removedCount"
        ],
        "properties": {
          "removedCount": {
            "type": "integer",
            "minimum": 0
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

### `GET /api/projects/:projectId/tests/history`

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
      "minimum": 1
    },
    "pageSize": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100
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
      "history"
    ],
    "properties": {
      "history": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "items",
          "page",
          "pageSize",
          "total",
          "totalPages"
        ],
        "properties": {
          "items": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "id",
                "projectId",
                "commandId",
                "status",
                "startedAt"
              ],
              "properties": {
                "id": {
                  "type": "string"
                },
                "projectId": {
                  "type": "string"
                },
                "commandId": {
                  "type": "string"
                },
                "targetFile": {
                  "type": "string"
                },
                "status": {
                  "type": "string",
                  "enum": [
                    "starting",
                    "running",
                    "stopping",
                    "stopped",
                    "failed"
                  ]
                },
                "startedAt": {
                  "type": "string"
                },
                "finishedAt": {
                  "type": "string"
                },
                "exitCode": {
                  "type": "integer"
                }
              }
            }
          },
          "page": {
            "type": "integer"
          },
          "pageSize": {
            "type": "integer"
          },
          "total": {
            "type": "integer"
          },
          "totalPages": {
            "type": "integer"
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

### `GET /api/projects/:projectId/tests/process`

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
  "properties": {}
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "process"
    ],
    "properties": {
      "process": {
        "type": [
          "object",
          "null"
        ],
        "additionalProperties": false,
        "required": [
          "id",
          "projectId",
          "kind",
          "status"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "projectId": {
            "type": "string"
          },
          "workspaceId": {
            "type": "string"
          },
          "kind": {
            "type": "string",
            "enum": [
              "server",
              "webpack",
              "worker",
              "test",
              "script"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "starting",
              "running",
              "stopping",
              "stopped",
              "failed"
            ]
          },
          "pid": {
            "type": "integer"
          },
          "port": {
            "type": "integer"
          },
          "url": {
            "type": "string"
          },
          "urls": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "command": {
            "type": "string"
          },
          "args": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "startedAt": {
            "type": "string"
          },
          "stoppedAt": {
            "type": "string"
          },
          "exitCode": {
            "type": "integer"
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

### `GET /api/projects/:projectId/tests/process/events`

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

### `DELETE /api/projects/:projectId/tests/process/logs`

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
  "properties": {}
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "log"
    ],
    "properties": {
      "log": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "projectId",
          "processId",
          "content",
          "sizeBytes",
          "truncated",
          "masked",
          "redactionCount",
          "readAt"
        ],
        "properties": {
          "projectId": {
            "type": "string"
          },
          "processId": {
            "type": "string"
          },
          "content": {
            "type": "string"
          },
          "sizeBytes": {
            "type": "integer"
          },
          "truncated": {
            "type": "boolean"
          },
          "masked": {
            "type": "boolean"
          },
          "redactionCount": {
            "type": "integer",
            "minimum": 0
          },
          "updatedAt": {
            "type": "string"
          },
          "readAt": {
            "type": "string"
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

### `GET /api/projects/:projectId/tests/process/logs`

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
    "maxBytes": {
      "type": "integer",
      "minimum": 1,
      "maximum": 262144
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
      "log"
    ],
    "properties": {
      "log": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "projectId",
          "processId",
          "content",
          "sizeBytes",
          "truncated",
          "masked",
          "redactionCount",
          "readAt"
        ],
        "properties": {
          "projectId": {
            "type": "string"
          },
          "processId": {
            "type": "string"
          },
          "content": {
            "type": "string"
          },
          "sizeBytes": {
            "type": "integer"
          },
          "truncated": {
            "type": "boolean"
          },
          "masked": {
            "type": "boolean"
          },
          "redactionCount": {
            "type": "integer",
            "minimum": 0
          },
          "updatedAt": {
            "type": "string"
          },
          "readAt": {
            "type": "string"
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

### `POST /api/projects/:projectId/tests/process/stop`

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
  "properties": {}
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "process"
    ],
    "properties": {
      "process": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "projectId",
          "kind",
          "status"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "projectId": {
            "type": "string"
          },
          "workspaceId": {
            "type": "string"
          },
          "kind": {
            "type": "string",
            "enum": [
              "server",
              "webpack",
              "worker",
              "test",
              "script"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "starting",
              "running",
              "stopping",
              "stopped",
              "failed"
            ]
          },
          "pid": {
            "type": "integer"
          },
          "port": {
            "type": "integer"
          },
          "url": {
            "type": "string"
          },
          "urls": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "command": {
            "type": "string"
          },
          "args": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "startedAt": {
            "type": "string"
          },
          "stoppedAt": {
            "type": "string"
          },
          "exitCode": {
            "type": "integer"
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

### `POST /api/projects/:projectId/tests/pty/cancel`

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

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "ok"
    ],
    "properties": {
      "ok": {
        "type": "boolean"
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

### `GET /api/projects/:projectId/tests/pty/connect`

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

### `POST /api/projects/:projectId/tests/pty/start`

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

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "commandId"
  ],
  "properties": {
    "commandId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    }
  }
}
```

**Resposta**

- **201**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "snapshot"
    ],
    "properties": {
      "snapshot": {
        "type": [
          "object",
          "null"
        ],
        "additionalProperties": false,
        "required": [
          "status",
          "exitCode",
          "exitSignal",
          "startedAt",
          "endedAt"
        ],
        "properties": {
          "status": {
            "type": "string",
            "enum": [
              "running",
              "exited"
            ]
          },
          "exitCode": {
            "type": [
              "integer",
              "null"
            ]
          },
          "exitSignal": {
            "type": [
              "integer",
              "null"
            ]
          },
          "startedAt": {
            "type": "string"
          },
          "endedAt": {
            "type": [
              "string",
              "null"
            ]
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

### `GET /api/projects/:projectId/tests/pty/status`

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
      "snapshot"
    ],
    "properties": {
      "snapshot": {
        "type": [
          "object",
          "null"
        ],
        "additionalProperties": false,
        "required": [
          "status",
          "exitCode",
          "exitSignal",
          "startedAt",
          "endedAt"
        ],
        "properties": {
          "status": {
            "type": "string",
            "enum": [
              "running",
              "exited"
            ]
          },
          "exitCode": {
            "type": [
              "integer",
              "null"
            ]
          },
          "exitSignal": {
            "type": [
              "integer",
              "null"
            ]
          },
          "startedAt": {
            "type": "string"
          },
          "endedAt": {
            "type": [
              "string",
              "null"
            ]
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

## Workspaces

### `GET /api/workspaces`

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "workspaces"
    ],
    "properties": {
      "workspaces": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "id",
            "name",
            "path",
            "enabled",
            "recursiveScan"
          ],
          "properties": {
            "id": {
              "type": "string"
            },
            "name": {
              "type": "string"
            },
            "path": {
              "type": "string"
            },
            "enabled": {
              "type": "boolean"
            },
            "recursiveScan": {
              "type": "boolean"
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

### `POST /api/workspaces`

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "name",
    "path"
  ],
  "properties": {
    "id": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "path": {
      "type": "string",
      "minLength": 1
    },
    "recursiveScan": {
      "type": "boolean"
    }
  }
}
```

**Resposta**

- **201**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "id",
      "name",
      "path",
      "enabled",
      "recursiveScan"
    ],
    "properties": {
      "id": {
        "type": "string"
      },
      "name": {
        "type": "string"
      },
      "path": {
        "type": "string"
      },
      "enabled": {
        "type": "boolean"
      },
      "recursiveScan": {
        "type": "boolean"
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

### `DELETE /api/workspaces/:workspaceId`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "workspaceId"
  ],
  "properties": {
    "workspaceId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Resposta**

- **204**:

  ```json
  {
    "type": "null"
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `PATCH /api/workspaces/:workspaceId`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "workspaceId"
  ],
  "properties": {
    "workspaceId": {
      "type": "string",
      "minLength": 1
    }
  }
}
```

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "minProperties": 1,
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "recursiveScan": {
      "type": "boolean"
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
      "id",
      "name",
      "path",
      "enabled",
      "recursiveScan"
    ],
    "properties": {
      "id": {
        "type": "string"
      },
      "name": {
        "type": "string"
      },
      "path": {
        "type": "string"
      },
      "enabled": {
        "type": "boolean"
      },
      "recursiveScan": {
        "type": "boolean"
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

### `POST /api/workspaces/:workspaceId/scan`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "workspaceId"
  ],
  "properties": {
    "workspaceId": {
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
      "workspaceId",
      "workspacePath",
      "projects",
      "warnings",
      "scannedAt"
    ],
    "properties": {
      "workspaceId": {
        "type": "string"
      },
      "workspacePath": {
        "type": "string"
      },
      "projects": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "id",
            "name",
            "path",
            "type",
            "source",
            "enabled",
            "capabilities"
          ],
          "properties": {
            "id": {
              "type": "string"
            },
            "name": {
              "type": "string"
            },
            "path": {
              "type": "string"
            },
            "type": {
              "type": "string",
              "enum": [
                "rails",
                "node",
                "unknown"
              ]
            },
            "source": {
              "type": "string",
              "enum": [
                "workspace",
                "standalone"
              ]
            },
            "workspaceId": {
              "type": "string"
            },
            "port": {
              "type": "integer"
            },
            "enabled": {
              "type": "boolean"
            },
            "lastAccessedAt": {
              "type": "string"
            },
            "capabilities": {
              "type": "array",
              "items": {
                "type": "string",
                "enum": [
                  "server",
                  "git",
                  "tests",
                  "database",
                  "scripts",
                  "webpack",
                  "sidekiq",
                  "rake",
                  "bundler",
                  "docker"
                ]
              }
            }
          }
        }
      },
      "warnings": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "path",
            "code",
            "message"
          ],
          "properties": {
            "path": {
              "type": "string"
            },
            "code": {
              "type": "string",
              "enum": [
                "UNREADABLE_DIRECTORY",
                "PROJECT_DETECTION_FAILED",
                "SCAN_DEPTH_LIMIT_REACHED",
                "SCAN_PROJECT_LIMIT_REACHED",
                "SCAN_TIMEOUT"
              ]
            },
            "message": {
              "type": "string"
            }
          }
        }
      },
      "scannedAt": {
        "type": "string"
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
