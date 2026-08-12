# ReferÃªncia da API HTTP local

> Documento gerado automaticamente por `scripts/generate-api-docs.mjs` a partir dos JSON
> Schemas declarados nas rotas Fastify (`apps/api/src/routes/*.ts`) e dos schemas de resposta
> compartilhados em `apps/api/src/http/response-schemas.ts`. **NÃ£o edite este arquivo Ã  mÃ£o** â
> rode `npm run docs:api` depois de alterar uma rota. `npm run docs:api:check` falha se este
> arquivo estiver desatualizado em relaÃ§Ã£o ao cÃ³digo.

Todas as rotas abaixo (exceto `GET /api/health`) exigem o header `X-Dev-Dashboard-Token` com o
token local persistido em `~/.config/dev-dashboard/api-token`. Veja
`docs/architecture/security.md` para o modelo de seguranÃ§a completo.

## Erros comuns

A maioria das rotas pode responder com o formato de erro padrÃ£o da API
(`apps/api/src/http/api-error.ts`) nos cÃ³digos 400, 401, 403, 404, 409 e/ou 500 â o schema Ã©
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

Abaixo, cada rota referencia este formato como "erro padrÃ£o da API" em vez de repetir o schema.

## Bundler

### `GET /api/projects/:projectId/bundler`

**ParÃ¢metros de rota (`params`)**

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
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

## Database

### `GET /api/projects/:projectId/database`

**ParÃ¢metros de rota (`params`)**

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
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/database/:environmentId/restart`

**ParÃ¢metros de rota (`params`)**

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
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/database/:environmentId/reveal`

**ParÃ¢metros de rota (`params`)**

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
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/database/:environmentId/start`

**ParÃ¢metros de rota (`params`)**

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
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/database/:environmentId/stop`

**ParÃ¢metros de rota (`params`)**

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
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/database/snapshots`

**ParÃ¢metros de rota (`params`)**

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
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/database/snapshots`

**ParÃ¢metros de rota (`params`)**

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
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/database/snapshots/:snapshotId/restore`

**ParÃ¢metros de rota (`params`)**

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
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/database/snapshots/:snapshotId/restore/confirmation`

**ParÃ¢metros de rota (`params`)**

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
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

## Dependencies Pty Routes

### `POST /api/projects/:projectId/dependencies/pty/cancel`

**ParÃ¢metros de rota (`params`)**

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
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/dependencies/pty/connect`

**ParÃ¢metros de rota (`params`)**

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

**ParÃ¢metros de rota (`params`)**

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
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/dependencies/pty/status`

**ParÃ¢metros de rota (`params`)**

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
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

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
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

## Git Branch Delete

### `POST /api/projects/:projectId/git/branches/delete`

**ParÃ¢metros de rota (`params`)**

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
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/branches/delete/confirmations`

**ParÃ¢metros de rota (`params`)**

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
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

## Git Branch Rename

### `POST /api/projects/:projectId/git/branches/rename`

**ParÃ¢metros de rota (`params`)**

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
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/branches/rename/confirmations`

**ParÃ¢metros de rota (`params`)**

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
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

## Git Commit Details

### `GET /api/projects/:projectId/git/commits`

**ParÃ¢metros de rota (`params`)**

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
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/git/commits/:commitHash`

**ParÃ¢metros de rota (`params`)**

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
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/git/commits/:commitHash/file`

**ParÃ¢metros de rota (`params`)**

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
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

## Git Current Branch History

### `GET /api/projects/:projectId/git/current-branch-commits`

**ParÃ¢metros de rota (`params`)**

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
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

## Git Exclusive Branch History

### `GET /api/projects/:projectId/git/exclusive-branch-commits`

**ParÃ¢metros de rota (`params`)**

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
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

## Git File Mutations

### `POST /api/projects/:projectId/git/files/discard`

**ParÃ¢metros de rota (`params`)**

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
    "path"
  ],
  "properties": {
    "path": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4096
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
      "file"
    ],
    "properties": {
      "file": {
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
  ```

### `POST /api/projects/:projectId/git/files/remove`

**ParÃ¢metros de rota (`params`)**

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
    "path"
  ],
  "properties": {
    "path": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4096
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
      "file"
    ],
    "properties": {
      "file": {
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
  ```

### `POST /api/projects/:projectId/git/files/stage`

**ParÃ¢metros de rota (`params`)**

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
    "path"
  ],
  "properties": {
    "path": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4096
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
      "file"
    ],
    "properties": {
      "file": {
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
  ```

### `POST /api/projects/:projectId/git/files/unstage`

**ParÃ¢metros de rota (`params`)**

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
    "path"
  ],
  "properties": {
    "path": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4096
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
      "file"
    ],
    "properties": {
      "file": {
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
  ```

## Git Mutation History

### `DELETE /api/projects/:projectId/git/mutation-history`

**ParÃ¢metros de rota (`params`)**

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
      "cleared"
    ],
    "properties": {
      "cleared": {
        "type": "integer",
        "minimum": 0
      }
    }
  }
  ```
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/git/mutation-history`

**ParÃ¢metros de rota (`params`)**

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
      "projectId",
      "page",
      "pageSize",
      "total",
      "totalPages",
      "events"
    ],
    "properties": {
      "projectId": {
        "type": "string"
      },
      "page": {
        "type": "integer",
        "minimum": 1
      },
      "pageSize": {
        "type": "integer",
        "minimum": 1
      },
      "total": {
        "type": "integer",
        "minimum": 0
      },
      "totalPages": {
        "type": "integer",
        "minimum": 0
      },
      "events": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "id",
            "projectId",
            "operationId",
            "risk",
            "occurredAt",
            "result"
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
            "operationId": {
              "type": "string"
            },
            "risk": {
              "type": "string",
              "enum": [
                "read-only",
                "write-safe",
                "write-remote",
                "destructive"
              ]
            },
            "occurredAt": {
              "type": "string"
            },
            "result": {
              "type": "string",
              "enum": [
                "succeeded",
                "failed"
              ]
            },
            "errorCode": {
              "type": "string"
            }
          }
        }
      }
    }
  }
  ```
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

## Git Mutations

### `POST /api/projects/:projectId/git/branches`

**ParÃ¢metros de rota (`params`)**

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
    "name",
    "confirmationToken"
  ],
  "properties": {
    "name": {
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

- **201**:

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
          },
          "impact": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "previousSha",
              "currentSha",
              "changedPaths",
              "actions"
            ],
            "properties": {
              "previousSha": {
                "type": "string"
              },
              "currentSha": {
                "type": "string"
              },
              "changedPaths": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "actions": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "category",
                    "label",
                    "description",
                    "matchedPaths"
                  ],
                  "properties": {
                    "category": {
                      "type": "string",
                      "enum": [
                        "dependencies",
                        "database",
                        "environment",
                        "server",
                        "tests"
                      ]
                    },
                    "label": {
                      "type": "string"
                    },
                    "description": {
                      "type": "string"
                    },
                    "routeName": {
                      "type": "string"
                    },
                    "matchedPaths": {
                      "type": "array",
                      "items": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/commit`

**ParÃ¢metros de rota (`params`)**

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
    "message",
    "confirmationToken"
  ],
  "properties": {
    "message": {
      "type": "string",
      "minLength": 1,
      "maxLength": 500
    },
    "includeAllChanges": {
      "type": "boolean"
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

- **201**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "commit"
    ],
    "properties": {
      "commit": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "hash",
          "shortHash",
          "subject"
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
          }
        }
      }
    }
  }
  ```
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/commit/amend`

**ParÃ¢metros de rota (`params`)**

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
    "message",
    "confirmationToken"
  ],
  "properties": {
    "message": {
      "type": "string",
      "minLength": 1,
      "maxLength": 500
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

- **201**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "commit"
    ],
    "properties": {
      "commit": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "hash",
          "shortHash",
          "subject"
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
          }
        }
      }
    }
  }
  ```
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/mutations/confirmations`

**ParÃ¢metros de rota (`params`)**

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
    "operation",
    "target"
  ],
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "create-branch",
        "switch-branch",
        "pull",
        "push",
        "commit",
        "amend",
        "save",
        "discard-file",
        "remove-untracked-file"
      ]
    },
    "target": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4096
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
              "create-branch",
              "switch-branch",
              "pull",
              "push",
              "commit"
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
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/pull`

**ParÃ¢metros de rota (`params`)**

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
          },
          "impact": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "previousSha",
              "currentSha",
              "changedPaths",
              "actions"
            ],
            "properties": {
              "previousSha": {
                "type": "string"
              },
              "currentSha": {
                "type": "string"
              },
              "changedPaths": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "actions": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "category",
                    "label",
                    "description",
                    "matchedPaths"
                  ],
                  "properties": {
                    "category": {
                      "type": "string",
                      "enum": [
                        "dependencies",
                        "database",
                        "environment",
                        "server",
                        "tests"
                      ]
                    },
                    "label": {
                      "type": "string"
                    },
                    "description": {
                      "type": "string"
                    },
                    "routeName": {
                      "type": "string"
                    },
                    "matchedPaths": {
                      "type": "array",
                      "items": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/push`

**ParÃ¢metros de rota (`params`)**

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
          },
          "impact": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "previousSha",
              "currentSha",
              "changedPaths",
              "actions"
            ],
            "properties": {
              "previousSha": {
                "type": "string"
              },
              "currentSha": {
                "type": "string"
              },
              "changedPaths": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "actions": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "category",
                    "label",
                    "description",
                    "matchedPaths"
                  ],
                  "properties": {
                    "category": {
                      "type": "string",
                      "enum": [
                        "dependencies",
                        "database",
                        "environment",
                        "server",
                        "tests"
                      ]
                    },
                    "label": {
                      "type": "string"
                    },
                    "description": {
                      "type": "string"
                    },
                    "routeName": {
                      "type": "string"
                    },
                    "matchedPaths": {
                      "type": "array",
                      "items": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/save`

**ParÃ¢metros de rota (`params`)**

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
    "message",
    "confirmationToken"
  ],
  "properties": {
    "message": {
      "type": "string",
      "minLength": 1,
      "maxLength": 500
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

- **201**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "commit"
    ],
    "properties": {
      "commit": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "hash",
          "shortHash",
          "subject"
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
          }
        }
      }
    }
  }
  ```
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/switch`

**ParÃ¢metros de rota (`params`)**

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
    "name",
    "confirmationToken"
  ],
  "properties": {
    "name": {
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
          },
          "impact": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "previousSha",
              "currentSha",
              "changedPaths",
              "actions"
            ],
            "properties": {
              "previousSha": {
                "type": "string"
              },
              "currentSha": {
                "type": "string"
              },
              "changedPaths": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "actions": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "category",
                    "label",
                    "description",
                    "matchedPaths"
                  ],
                  "properties": {
                    "category": {
                      "type": "string",
                      "enum": [
                        "dependencies",
                        "database",
                        "environment",
                        "server",
                        "tests"
                      ]
                    },
                    "label": {
                      "type": "string"
                    },
                    "description": {
                      "type": "string"
                    },
                    "routeName": {
                      "type": "string"
                    },
                    "matchedPaths": {
                      "type": "array",
                      "items": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

## Git Pull Request

### `GET /api/projects/:projectId/git/pull-request-status`

**ParÃ¢metros de rota (`params`)**

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
  "required": [
    "targetRemote",
    "baseBranch"
  ],
  "properties": {
    "targetRemote": {
      "type": "string",
      "enum": [
        "origin",
        "upstream"
      ]
    },
    "baseBranch": {
      "type": "string",
      "minLength": 1,
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
      "lookup"
    ],
    "properties": {
      "lookup": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "checked"
        ],
        "properties": {
          "checked": {
            "type": "boolean"
          },
          "existing": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "provider",
              "number",
              "title",
              "url",
              "sourceBranch",
              "baseBranch"
            ],
            "properties": {
              "provider": {
                "type": "string",
                "enum": [
                  "github",
                  "gitlab"
                ]
              },
              "number": {
                "type": "integer",
                "minimum": 1
              },
              "title": {
                "type": "string"
              },
              "url": {
                "type": "string"
              },
              "sourceBranch": {
                "type": "string"
              },
              "baseBranch": {
                "type": "string"
              },
              "ciStatus": {
                "type": "string",
                "enum": [
                  "success",
                  "pending",
                  "failure",
                  "unknown"
                ]
              },
              "commentsCount": {
                "type": "integer",
                "minimum": 0
              },
              "unresolvedConversationsCount": {
                "type": "integer",
                "minimum": 0
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/git/pull-request-summary`

**ParÃ¢metros de rota (`params`)**

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
  "required": [
    "targetRemote",
    "baseBranch"
  ],
  "properties": {
    "targetRemote": {
      "type": "string",
      "enum": [
        "origin",
        "upstream"
      ]
    },
    "baseBranch": {
      "type": "string",
      "minLength": 1,
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
      "lookup"
    ],
    "properties": {
      "lookup": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "checked"
        ],
        "properties": {
          "checked": {
            "type": "boolean"
          },
          "existing": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "provider",
              "number",
              "title",
              "url",
              "sourceBranch",
              "baseBranch"
            ],
            "properties": {
              "provider": {
                "type": "string",
                "enum": [
                  "github",
                  "gitlab"
                ]
              },
              "number": {
                "type": "integer",
                "minimum": 1
              },
              "title": {
                "type": "string"
              },
              "url": {
                "type": "string"
              },
              "sourceBranch": {
                "type": "string"
              },
              "baseBranch": {
                "type": "string"
              },
              "ciStatus": {
                "type": "string",
                "enum": [
                  "success",
                  "pending",
                  "failure",
                  "unknown"
                ]
              },
              "commentsCount": {
                "type": "integer",
                "minimum": 0
              },
              "unresolvedConversationsCount": {
                "type": "integer",
                "minimum": 0
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/git/pull-request-url`

**ParÃ¢metros de rota (`params`)**

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
      "pullRequest"
    ],
    "properties": {
      "pullRequest": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "provider",
          "url",
          "branch",
          "defaultBranch"
        ],
        "properties": {
          "provider": {
            "type": "string",
            "enum": [
              "github",
              "gitlab"
            ]
          },
          "url": {
            "type": "string"
          },
          "branch": {
            "type": "string"
          },
          "defaultBranch": {
            "type": "string"
          }
        }
      }
    }
  }
  ```
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/pull-request-url`

**ParÃ¢metros de rota (`params`)**

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
    "targetRemote",
    "baseBranch",
    "title",
    "description"
  ],
  "properties": {
    "targetRemote": {
      "type": "string",
      "enum": [
        "origin",
        "upstream"
      ]
    },
    "baseBranch": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "title": {
      "type": "string",
      "minLength": 1,
      "maxLength": 256
    },
    "description": {
      "type": "string",
      "maxLength": 20000
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
      "pullRequest"
    ],
    "properties": {
      "pullRequest": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "provider",
          "url",
          "branch",
          "defaultBranch"
        ],
        "properties": {
          "provider": {
            "type": "string",
            "enum": [
              "github",
              "gitlab"
            ]
          },
          "url": {
            "type": "string"
          },
          "branch": {
            "type": "string"
          },
          "defaultBranch": {
            "type": "string"
          }
        }
      }
    }
  }
  ```
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/pull-request/ai-review-executions`

**ParÃ¢metros de rota (`params`)**

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
    "targetRemote",
    "baseBranch",
    "model"
  ],
  "properties": {
    "targetRemote": {
      "type": "string",
      "enum": [
        "origin",
        "upstream"
      ]
    },
    "baseBranch": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "model": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "paths": {
      "type": "array",
      "minItems": 1,
      "maxItems": 500,
      "items": {
        "type": "string",
        "minLength": 1,
        "maxLength": 1000
      }
    },
    "concurrency": {
      "type": "integer",
      "enum": [
        1,
        2
      ]
    }
  }
}
```

**Resposta**

- **202**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "execution"
    ],
    "properties": {
      "execution": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "targetRemote",
          "baseBranch",
          "sourceBranch",
          "files",
          "provider",
          "mode",
          "model",
          "status",
          "concurrency",
          "completedFileCount",
          "currentFilePaths",
          "fileExecutions",
          "failedFiles",
          "startedAt"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "targetRemote": {
            "type": "string",
            "enum": [
              "origin",
              "upstream"
            ]
          },
          "baseBranch": {
            "type": "string"
          },
          "sourceBranch": {
            "type": "string"
          },
          "files": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "provider": {
            "type": "string",
            "enum": [
              "ollama",
              "openai"
            ]
          },
          "mode": {
            "type": "string",
            "enum": [
              "fast",
              "complete"
            ]
          },
          "model": {
            "type": "string"
          },
          "status": {
            "type": "string",
            "enum": [
              "running",
              "completed",
              "failed",
              "cancelled"
            ]
          },
          "concurrency": {
            "type": "integer",
            "enum": [
              1,
              2
            ]
          },
          "completedFileCount": {
            "type": "integer",
            "minimum": 0
          },
          "currentFilePaths": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "fileExecutions": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "path",
                "status"
              ],
              "properties": {
                "path": {
                  "type": "string"
                },
                "status": {
                  "type": "string",
                  "enum": [
                    "queued",
                    "running",
                    "completed",
                    "failed",
                    "cancelled"
                  ]
                },
                "startedAt": {
                  "type": "string"
                },
                "finishedAt": {
                  "type": "string"
                },
                "errorCode": {
                  "type": "string"
                },
                "errorMessage": {
                  "type": "string"
                }
              }
            }
          },
          "failedFiles": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "path",
                "message"
              ],
              "properties": {
                "path": {
                  "type": "string"
                },
                "message": {
                  "type": "string"
                },
                "code": {
                  "type": "string"
                }
              }
            }
          },
          "startedAt": {
            "type": "string"
          },
          "finishedAt": {
            "type": "string"
          },
          "errorCode": {
            "type": "string"
          },
          "errorMessage": {
            "type": "string"
          },
          "review": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "targetRemote",
              "baseBranch",
              "sourceBranch",
              "files",
              "model",
              "reviewedAt",
              "summary",
              "findings",
              "diffTruncated",
              "masked",
              "redactionCount"
            ],
            "properties": {
              "targetRemote": {
                "type": "string",
                "enum": [
                  "origin",
                  "upstream"
                ]
              },
              "baseBranch": {
                "type": "string"
              },
              "sourceBranch": {
                "type": "string"
              },
              "files": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "model": {
                "type": "string"
              },
              "reviewedAt": {
                "type": "string"
              },
              "summary": {
                "type": "string"
              },
              "diffTruncated": {
                "type": "boolean"
              },
              "masked": {
                "type": "boolean"
              },
              "redactionCount": {
                "type": "integer",
                "minimum": 0
              },
              "findings": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "severity",
                    "path",
                    "title",
                    "explanation",
                    "recommendation"
                  ],
                  "properties": {
                    "severity": {
                      "type": "string",
                      "enum": [
                        "critical",
                        "warning",
                        "suggestion"
                      ]
                    },
                    "path": {
                      "type": "string"
                    },
                    "line": {
                      "type": "integer",
                      "minimum": 1
                    },
                    "title": {
                      "type": "string"
                    },
                    "explanation": {
                      "type": "string"
                    },
                    "recommendation": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **422** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **429** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **502** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **503** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **504** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/pull-request/ai-review-executions/:executionId/cancel`

**ParÃ¢metros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "executionId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "executionId": {
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
      "execution"
    ],
    "properties": {
      "execution": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "targetRemote",
          "baseBranch",
          "sourceBranch",
          "files",
          "provider",
          "mode",
          "model",
          "status",
          "concurrency",
          "completedFileCount",
          "currentFilePaths",
          "fileExecutions",
          "failedFiles",
          "startedAt"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "targetRemote": {
            "type": "string",
            "enum": [
              "origin",
              "upstream"
            ]
          },
          "baseBranch": {
            "type": "string"
          },
          "sourceBranch": {
            "type": "string"
          },
          "files": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "provider": {
            "type": "string",
            "enum": [
              "ollama",
              "openai"
            ]
          },
          "mode": {
            "type": "string",
            "enum": [
              "fast",
              "complete"
            ]
          },
          "model": {
            "type": "string"
          },
          "status": {
            "type": "string",
            "enum": [
              "running",
              "completed",
              "failed",
              "cancelled"
            ]
          },
          "concurrency": {
            "type": "integer",
            "enum": [
              1,
              2
            ]
          },
          "completedFileCount": {
            "type": "integer",
            "minimum": 0
          },
          "currentFilePaths": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "fileExecutions": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "path",
                "status"
              ],
              "properties": {
                "path": {
                  "type": "string"
                },
                "status": {
                  "type": "string",
                  "enum": [
                    "queued",
                    "running",
                    "completed",
                    "failed",
                    "cancelled"
                  ]
                },
                "startedAt": {
                  "type": "string"
                },
                "finishedAt": {
                  "type": "string"
                },
                "errorCode": {
                  "type": "string"
                },
                "errorMessage": {
                  "type": "string"
                }
              }
            }
          },
          "failedFiles": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "path",
                "message"
              ],
              "properties": {
                "path": {
                  "type": "string"
                },
                "message": {
                  "type": "string"
                },
                "code": {
                  "type": "string"
                }
              }
            }
          },
          "startedAt": {
            "type": "string"
          },
          "finishedAt": {
            "type": "string"
          },
          "errorCode": {
            "type": "string"
          },
          "errorMessage": {
            "type": "string"
          },
          "review": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "targetRemote",
              "baseBranch",
              "sourceBranch",
              "files",
              "model",
              "reviewedAt",
              "summary",
              "findings",
              "diffTruncated",
              "masked",
              "redactionCount"
            ],
            "properties": {
              "targetRemote": {
                "type": "string",
                "enum": [
                  "origin",
                  "upstream"
                ]
              },
              "baseBranch": {
                "type": "string"
              },
              "sourceBranch": {
                "type": "string"
              },
              "files": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "model": {
                "type": "string"
              },
              "reviewedAt": {
                "type": "string"
              },
              "summary": {
                "type": "string"
              },
              "diffTruncated": {
                "type": "boolean"
              },
              "masked": {
                "type": "boolean"
              },
              "redactionCount": {
                "type": "integer",
                "minimum": 0
              },
              "findings": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "severity",
                    "path",
                    "title",
                    "explanation",
                    "recommendation"
                  ],
                  "properties": {
                    "severity": {
                      "type": "string",
                      "enum": [
                        "critical",
                        "warning",
                        "suggestion"
                      ]
                    },
                    "path": {
                      "type": "string"
                    },
                    "line": {
                      "type": "integer",
                      "minimum": 1
                    },
                    "title": {
                      "type": "string"
                    },
                    "explanation": {
                      "type": "string"
                    },
                    "recommendation": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/git/pull-request/ai-review-executions/latest`

**ParÃ¢metros de rota (`params`)**

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
  "required": [
    "targetRemote",
    "baseBranch"
  ],
  "properties": {
    "targetRemote": {
      "type": "string",
      "enum": [
        "origin",
        "upstream"
      ]
    },
    "baseBranch": {
      "type": "string",
      "minLength": 1,
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
      "execution"
    ],
    "properties": {
      "execution": {
        "anyOf": [
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id",
              "targetRemote",
              "baseBranch",
              "sourceBranch",
              "files",
              "provider",
              "mode",
              "model",
              "status",
              "concurrency",
              "completedFileCount",
              "currentFilePaths",
              "fileExecutions",
              "failedFiles",
              "startedAt"
            ],
            "properties": {
              "id": {
                "type": "string"
              },
              "targetRemote": {
                "type": "string",
                "enum": [
                  "origin",
                  "upstream"
                ]
              },
              "baseBranch": {
                "type": "string"
              },
              "sourceBranch": {
                "type": "string"
              },
              "files": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "provider": {
                "type": "string",
                "enum": [
                  "ollama",
                  "openai"
                ]
              },
              "mode": {
                "type": "string",
                "enum": [
                  "fast",
                  "complete"
                ]
              },
              "model": {
                "type": "string"
              },
              "status": {
                "type": "string",
                "enum": [
                  "running",
                  "completed",
                  "failed",
                  "cancelled"
                ]
              },
              "concurrency": {
                "type": "integer",
                "enum": [
                  1,
                  2
                ]
              },
              "completedFileCount": {
                "type": "integer",
                "minimum": 0
              },
              "currentFilePaths": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "fileExecutions": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "path",
                    "status"
                  ],
                  "properties": {
                    "path": {
                      "type": "string"
                    },
                    "status": {
                      "type": "string",
                      "enum": [
                        "queued",
                        "running",
                        "completed",
                        "failed",
                        "cancelled"
                      ]
                    },
                    "startedAt": {
                      "type": "string"
                    },
                    "finishedAt": {
                      "type": "string"
                    },
                    "errorCode": {
                      "type": "string"
                    },
                    "errorMessage": {
                      "type": "string"
                    }
                  }
                }
              },
              "failedFiles": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "path",
                    "message"
                  ],
                  "properties": {
                    "path": {
                      "type": "string"
                    },
                    "message": {
                      "type": "string"
                    },
                    "code": {
                      "type": "string"
                    }
                  }
                }
              },
              "startedAt": {
                "type": "string"
              },
              "finishedAt": {
                "type": "string"
              },
              "errorCode": {
                "type": "string"
              },
              "errorMessage": {
                "type": "string"
              },
              "review": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "targetRemote",
                  "baseBranch",
                  "sourceBranch",
                  "files",
                  "model",
                  "reviewedAt",
                  "summary",
                  "findings",
                  "diffTruncated",
                  "masked",
                  "redactionCount"
                ],
                "properties": {
                  "targetRemote": {
                    "type": "string",
                    "enum": [
                      "origin",
                      "upstream"
                    ]
                  },
                  "baseBranch": {
                    "type": "string"
                  },
                  "sourceBranch": {
                    "type": "string"
                  },
                  "files": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    }
                  },
                  "model": {
                    "type": "string"
                  },
                  "reviewedAt": {
                    "type": "string"
                  },
                  "summary": {
                    "type": "string"
                  },
                  "diffTruncated": {
                    "type": "boolean"
                  },
                  "masked": {
                    "type": "boolean"
                  },
                  "redactionCount": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "findings": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "severity",
                        "path",
                        "title",
                        "explanation",
                        "recommendation"
                      ],
                      "properties": {
                        "severity": {
                          "type": "string",
                          "enum": [
                            "critical",
                            "warning",
                            "suggestion"
                          ]
                        },
                        "path": {
                          "type": "string"
                        },
                        "line": {
                          "type": "integer",
                          "minimum": 1
                        },
                        "title": {
                          "type": "string"
                        },
                        "explanation": {
                          "type": "string"
                        },
                        "recommendation": {
                          "type": "string"
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          {
            "type": "null"
          }
        ]
      }
    }
  }
  ```
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/git/pull-request/ai-review-file-diff`

**ParÃ¢metros de rota (`params`)**

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
  "required": [
    "targetRemote",
    "baseBranch",
    "path"
  ],
  "properties": {
    "targetRemote": {
      "type": "string",
      "enum": [
        "origin",
        "upstream"
      ]
    },
    "baseBranch": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "path": {
      "type": "string",
      "minLength": 1,
      "maxLength": 1000
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
      "review"
    ],
    "properties": {
      "review": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "targetRemote",
          "baseBranch",
          "sourceBranch",
          "files",
          "diff"
        ],
        "properties": {
          "targetRemote": {
            "type": "string",
            "enum": [
              "origin",
              "upstream"
            ]
          },
          "baseBranch": {
            "type": "string"
          },
          "sourceBranch": {
            "type": "string"
          },
          "files": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "diff": {
            "type": "string"
          }
        }
      }
    }
  }
  ```
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/git/pull-request/ai-review-files`

**ParÃ¢metros de rota (`params`)**

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
  "required": [
    "targetRemote",
    "baseBranch"
  ],
  "properties": {
    "targetRemote": {
      "type": "string",
      "enum": [
        "origin",
        "upstream"
      ]
    },
    "baseBranch": {
      "type": "string",
      "minLength": 1,
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
      "review"
    ],
    "properties": {
      "review": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "targetRemote",
          "baseBranch",
          "sourceBranch",
          "files"
        ],
        "properties": {
          "targetRemote": {
            "type": "string",
            "enum": [
              "origin",
              "upstream"
            ]
          },
          "baseBranch": {
            "type": "string"
          },
          "sourceBranch": {
            "type": "string"
          },
          "files": {
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
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/git/pull-request/ai-status`

**ParÃ¢metros de rota (`params`)**

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
      "available",
      "models",
      "message"
    ],
    "properties": {
      "available": {
        "type": "boolean"
      },
      "baseUrl": {
        "type": "string"
      },
      "message": {
        "type": "string"
      },
      "errorCode": {
        "type": "string"
      },
      "models": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "name",
            "capabilities"
          ],
          "properties": {
            "name": {
              "type": "string"
            },
            "capabilities": {
              "type": "array",
              "items": {
                "type": "string",
                "enum": [
                  "chat",
                  "tools",
                  "fill-in-the-middle"
                ]
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

## Git Pull Request Mutations

### `POST /api/projects/:projectId/git/pull-request/actions`

**ParÃ¢metros de rota (`params`)**

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
    "actionId",
    "confirmationToken"
  ],
  "properties": {
    "actionId": {
      "type": "string",
      "enum": [
        "pull-request-create",
        "pull-request-edit",
        "pull-request-close",
        "pull-request-merge"
      ]
    },
    "targetRemote": {
      "type": "string",
      "enum": [
        "origin",
        "upstream"
      ]
    },
    "baseBranch": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "title": {
      "type": "string",
      "minLength": 1,
      "maxLength": 256
    },
    "description": {
      "type": "string",
      "maxLength": 20000
    },
    "draft": {
      "type": "boolean"
    },
    "number": {
      "type": "integer",
      "minimum": 1
    },
    "mergeMethod": {
      "type": "string",
      "enum": [
        "merge",
        "squash",
        "rebase"
      ]
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
      "result"
    ],
    "properties": {
      "result": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "action",
          "number",
          "url",
          "title",
          "state"
        ],
        "properties": {
          "action": {
            "type": "string",
            "enum": [
              "pull-request-create",
              "pull-request-edit",
              "pull-request-close",
              "pull-request-merge"
            ]
          },
          "number": {
            "type": "integer",
            "minimum": 1
          },
          "url": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "state": {
            "type": "string",
            "enum": [
              "open",
              "closed",
              "merged"
            ]
          }
        }
      }
    }
  }
  ```
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/pull-request/confirmations`

**ParÃ¢metros de rota (`params`)**

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
      "enum": [
        "pull-request-create",
        "pull-request-edit",
        "pull-request-close",
        "pull-request-merge"
      ]
    },
    "targetRemote": {
      "type": "string",
      "enum": [
        "origin",
        "upstream"
      ]
    },
    "baseBranch": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "title": {
      "type": "string",
      "minLength": 1,
      "maxLength": 256
    },
    "description": {
      "type": "string",
      "maxLength": 20000
    },
    "draft": {
      "type": "boolean"
    },
    "number": {
      "type": "integer",
      "minimum": 1
    },
    "mergeMethod": {
      "type": "string",
      "enum": [
        "merge",
        "squash",
        "rebase"
      ]
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
          "actionId",
          "expiresAt"
        ],
        "properties": {
          "token": {
            "type": "string"
          },
          "actionId": {
            "type": "string",
            "enum": [
              "pull-request-create",
              "pull-request-edit",
              "pull-request-close",
              "pull-request-merge"
            ]
          },
          "expiresAt": {
            "type": "string"
          }
        }
      }
    }
  }
  ```
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

## Git Sync

### `POST /api/projects/:projectId/git/sync`

**ParÃ¢metros de rota (`params`)**

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
    "reference",
    "strategy",
    "confirmationToken"
  ],
  "properties": {
    "reference": {
      "type": "string",
      "minLength": 3,
      "maxLength": 300
    },
    "strategy": {
      "type": "string",
      "enum": [
        "ff-only",
        "rebase",
        "merge"
      ]
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
      "result"
    ],
    "properties": {
      "result": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "branch",
          "reference",
          "strategy",
          "changed",
          "previousHead",
          "currentHead",
          "impact"
        ],
        "properties": {
          "branch": {
            "type": "string"
          },
          "reference": {
            "type": "string"
          },
          "strategy": {
            "type": "string",
            "enum": [
              "ff-only",
              "rebase",
              "merge"
            ]
          },
          "changed": {
            "type": "boolean"
          },
          "previousHead": {
            "type": "string"
          },
          "currentHead": {
            "type": "string"
          },
          "impact": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "previousSha",
              "currentSha",
              "changedPaths",
              "actions"
            ],
            "properties": {
              "previousSha": {
                "type": "string"
              },
              "currentSha": {
                "type": "string"
              },
              "changedPaths": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "actions": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "category",
                    "label",
                    "description",
                    "matchedPaths"
                  ],
                  "properties": {
                    "category": {
                      "type": "string",
                      "enum": [
                        "dependencies",
                        "database",
                        "environment",
                        "server",
                        "tests"
                      ]
                    },
                    "label": {
                      "type": "string"
                    },
                    "description": {
                      "type": "string"
                    },
                    "routeName": {
                      "type": "string"
                    },
                    "matchedPaths": {
                      "type": "array",
                      "items": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/git/sync/compare`

**ParÃ¢metros de rota (`params`)**

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
  "required": [
    "reference"
  ],
  "properties": {
    "reference": {
      "type": "string",
      "minLength": 3,
      "maxLength": 300
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
      "comparison"
    ],
    "properties": {
      "comparison": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "reference",
          "ahead",
          "behind"
        ],
        "properties": {
          "reference": {
            "type": "string"
          },
          "ahead": {
            "type": "integer",
            "minimum": 0
          },
          "behind": {
            "type": "integer",
            "minimum": 0
          }
        }
      }
    }
  }
  ```
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/sync/confirmations`

**ParÃ¢metros de rota (`params`)**

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
    "reference",
    "strategy"
  ],
  "properties": {
    "reference": {
      "type": "string",
      "minLength": 3,
      "maxLength": 300
    },
    "strategy": {
      "type": "string",
      "enum": [
        "ff-only",
        "rebase",
        "merge"
      ]
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
          "reference",
          "strategy",
          "expiresAt"
        ],
        "properties": {
          "token": {
            "type": "string"
          },
          "reference": {
            "type": "string"
          },
          "strategy": {
            "type": "string",
            "enum": [
              "ff-only",
              "rebase",
              "merge"
            ]
          },
          "expiresAt": {
            "type": "string"
          }
        }
      }
    }
  }
  ```
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/sync/main`

**ParÃ¢metros de rota (`params`)**

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
      "result"
    ],
    "properties": {
      "result": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "branch",
          "reference",
          "strategy",
          "changed",
          "previousHead",
          "currentHead",
          "impact"
        ],
        "properties": {
          "branch": {
            "type": "string"
          },
          "reference": {
            "type": "string"
          },
          "strategy": {
            "type": "string",
            "enum": [
              "ff-only",
              "rebase",
              "merge"
            ]
          },
          "changed": {
            "type": "boolean"
          },
          "previousHead": {
            "type": "string"
          },
          "currentHead": {
            "type": "string"
          },
          "impact": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "previousSha",
              "currentSha",
              "changedPaths",
              "actions"
            ],
            "properties": {
              "previousSha": {
                "type": "string"
              },
              "currentSha": {
                "type": "string"
              },
              "changedPaths": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "actions": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "category",
                    "label",
                    "description",
                    "matchedPaths"
                  ],
                  "properties": {
                    "category": {
                      "type": "string",
                      "enum": [
                        "dependencies",
                        "database",
                        "environment",
                        "server",
                        "tests"
                      ]
                    },
                    "label": {
                      "type": "string"
                    },
                    "description": {
                      "type": "string"
                    },
                    "routeName": {
                      "type": "string"
                    },
                    "matchedPaths": {
                      "type": "array",
                      "items": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/sync/main/confirmations`

**ParÃ¢metros de rota (`params`)**

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
          "reference",
          "strategy",
          "expiresAt"
        ],
        "properties": {
          "token": {
            "type": "string"
          },
          "reference": {
            "type": "string"
          },
          "strategy": {
            "type": "string",
            "enum": [
              "ff-only",
              "rebase",
              "merge"
            ]
          },
          "expiresAt": {
            "type": "string"
          }
        }
      }
    }
  }
  ```
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

## Git Undo

### `POST /api/projects/:projectId/git/undo/commit`

**ParÃ¢metros de rota (`params`)**

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
      "undo"
    ],
    "properties": {
      "undo": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "strategy",
          "undone"
        ],
        "properties": {
          "strategy": {
            "type": "string",
            "enum": [
              "reset",
              "revert"
            ]
          },
          "undone": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "hash",
              "shortHash",
              "subject"
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
              }
            }
          },
          "result": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "hash",
              "shortHash",
              "subject"
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
              }
            }
          }
        }
      }
    }
  }
  ```

### `POST /api/projects/:projectId/git/undo/confirmations`

**ParÃ¢metros de rota (`params`)**

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
    "operation",
    "target"
  ],
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "commit",
        "file"
      ]
    },
    "target": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4096
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
              "commit",
              "file"
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

### `POST /api/projects/:projectId/git/undo/file`

**ParÃ¢metros de rota (`params`)**

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
    "path",
    "confirmationToken"
  ],
  "properties": {
    "path": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4096
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
      "file"
    ],
    "properties": {
      "file": {
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
  ```

## Git Workspace

### `POST /api/projects/:projectId/git/branches/force-push-with-lease`

**ParÃ¢metros de rota (`params`)**

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
          },
          "impact": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "previousSha",
              "currentSha",
              "changedPaths",
              "actions"
            ],
            "properties": {
              "previousSha": {
                "type": "string"
              },
              "currentSha": {
                "type": "string"
              },
              "changedPaths": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "actions": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "category",
                    "label",
                    "description",
                    "matchedPaths"
                  ],
                  "properties": {
                    "category": {
                      "type": "string",
                      "enum": [
                        "dependencies",
                        "database",
                        "environment",
                        "server",
                        "tests"
                      ]
                    },
                    "label": {
                      "type": "string"
                    },
                    "description": {
                      "type": "string"
                    },
                    "routeName": {
                      "type": "string"
                    },
                    "matchedPaths": {
                      "type": "array",
                      "items": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  ```
- **400** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **401** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **403** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **404** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **409** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).
- **500** â erro padrÃ£o da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/branches/force-push-with-lease/confirmations`

**ParÃ¢metros de rota (`params`)**

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
   