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

## Activities

### `GET /api/activities`

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "workspaceId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "projectId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "origin": {
      "type": "string",
      "enum": [
        "script",
        "test",
        "server"
      ]
    },
    "status": {
      "type": "string",
      "enum": [
        "running",
        "succeeded",
        "failed",
        "cancelled",
        "unknown"
      ]
    },
    "search": {
      "type": "string",
      "maxLength": 200
    },
    "page": {
      "type": "integer",
      "minimum": 1,
      "default": 1
    },
    "pageSize": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100,
      "default": 20
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
      "activities"
    ],
    "properties": {
      "activities": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "items",
          "page",
          "pageSize",
          "total",
          "totalPages",
          "summary"
        ],
        "properties": {
          "items": {
            "type": "array",
            "items": {
              "anyOf": [
                {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "id",
                    "projectId",
                    "label",
                    "origin",
                    "status",
                    "startedAt",
                    "reference"
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
                    "label": {
                      "type": "string"
                    },
                    "origin": {
                      "type": "string",
                      "enum": [
                        "script"
                      ]
                    },
                    "status": {
                      "type": "string",
                      "enum": [
                        "running",
                        "succeeded",
                        "failed",
                        "cancelled",
                        "unknown"
                      ]
                    },
                    "startedAt": {
                      "type": "string"
                    },
                    "finishedAt": {
                      "type": "string"
                    },
                    "reference": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "executionId",
                        "actionId"
                      ],
                      "properties": {
                        "executionId": {
                          "type": "string"
                        },
                        "actionId": {
                          "type": "string"
                        }
                      }
                    }
                  }
                },
                {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "id",
                    "projectId",
                    "label",
                    "origin",
                    "status",
                    "startedAt",
                    "reference"
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
                    "label": {
                      "type": "string"
                    },
                    "origin": {
                      "type": "string",
                      "enum": [
                        "test"
                      ]
                    },
                    "status": {
                      "type": "string",
                      "enum": [
                        "running",
                        "succeeded",
                        "failed",
                        "cancelled",
                        "unknown"
                      ]
                    },
                    "startedAt": {
                      "type": "string"
                    },
                    "finishedAt": {
                      "type": "string"
                    },
                    "reference": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "processId"
                      ],
                      "properties": {
                        "processId": {
                          "type": "string"
                        }
                      }
                    }
                  }
                },
                {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "id",
                    "projectId",
                    "label",
                    "origin",
                    "status",
                    "startedAt",
                    "reference"
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
                    "label": {
                      "type": "string"
                    },
                    "origin": {
                      "type": "string",
                      "enum": [
                        "server"
                      ]
                    },
                    "status": {
                      "type": "string",
                      "enum": [
                        "running",
                        "succeeded",
                        "failed",
                        "cancelled",
                        "unknown"
                      ]
                    },
                    "startedAt": {
                      "type": "string"
                    },
                    "finishedAt": {
                      "type": "string"
                    },
                    "reference": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "processId"
                      ],
                      "properties": {
                        "processId": {
                          "type": "string"
                        }
                      }
                    }
                  }
                }
              ]
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
          },
          "summary": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "running",
              "succeeded",
              "failed",
              "total"
            ],
            "properties": {
              "running": {
                "type": "integer",
                "minimum": 0
              },
              "succeeded": {
                "type": "integer",
                "minimum": 0
              },
              "failed": {
                "type": "integer",
                "minimum": 0
              },
              "total": {
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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

## Ai Assistant

### `POST /api/projects/:projectId/ai/chat`

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
    "model",
    "messages"
  ],
  "properties": {
    "model": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "messages": {
      "type": "array",
      "minItems": 1,
      "maxItems": 40,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "role",
          "content"
        ],
        "properties": {
          "role": {
            "type": "string",
            "enum": [
              "user",
              "assistant",
              "system"
            ]
          },
          "content": {
            "type": "string",
            "minLength": 1,
            "maxLength": 8000
          }
        }
      }
    }
  }
}
```

### `POST /api/projects/:projectId/ai/complete`

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
    "model",
    "prefix"
  ],
  "properties": {
    "model": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "prefix": {
      "type": "string",
      "maxLength": 4000
    },
    "suffix": {
      "type": "string",
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
      "text"
    ],
    "properties": {
      "text": {
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

### `GET /api/projects/:projectId/ai/status`

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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

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

## Git Exclusive Branch History

### `GET /api/projects/:projectId/git/exclusive-branch-commits`

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

## Git File Mutations

### `POST /api/projects/:projectId/git/files/discard`

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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/git/mutation-history`

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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

## Git Mutations

### `POST /api/projects/:projectId/git/branches`

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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/commit`

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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/commit/amend`

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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/mutations/confirmations`

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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/pull`

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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/push`

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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/save`

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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/switch`

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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

## Git Pull Request

### `GET /api/projects/:projectId/git/pull-request-status`

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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/git/pull-request-summary`

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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/git/pull-request-url`

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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/pull-request-url`

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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

## Git Pull Request Mutations

### `POST /api/projects/:projectId/git/pull-request/actions`

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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/pull-request/confirmations`

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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

## Git Sync

### `POST /api/projects/:projectId/git/sync`

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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/git/sync/compare`

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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/sync/confirmations`

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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/sync/main`

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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/sync/main/confirmations`

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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

## Git Undo

### `POST /api/projects/:projectId/git/undo/commit`

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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/branches/force-push-with-lease/confirmations`

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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/branches/publish`

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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/branches/publish/confirmations`

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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/branches/remote/delete`

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
    "remoteBranch",
    "confirmationToken"
  ],
  "properties": {
    "remoteBranch": {
      "type": "string",
      "minLength": 3,
      "maxLength": 300
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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/branches/remote/delete/confirmations`

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
    "remoteBranch"
  ],
  "properties": {
    "remoteBranch": {
      "type": "string",
      "minLength": 3,
      "maxLength": 300
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
              "track-branch",
              "delete-remote-branch"
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

### `POST /api/projects/:projectId/git/branches/track`

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
    "remoteBranch",
    "confirmationToken"
  ],
  "properties": {
    "remoteBranch": {
      "type": "string",
      "minLength": 3,
      "maxLength": 300
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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/git/branches/track/confirmations`

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
    "remoteBranch"
  ],
  "properties": {
    "remoteBranch": {
      "type": "string",
      "minLength": 3,
      "maxLength": 300
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
              "track-branch",
              "delete-remote-branch"
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

### `POST /api/projects/:projectId/git/remotes/:remote/fetch`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "remote"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "remote": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100,
      "pattern": "^[A-Za-z0-9._-]+$"
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
      "remote"
    ],
    "properties": {
      "remote": {
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
- **502** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/git/workspace`

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
      "workspace"
    ],
    "properties": {
      "workspace": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "branches",
          "remotes"
        ],
        "properties": {
          "branches": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "name",
                "shortName",
                "kind",
                "current",
                "ahead",
                "behind"
              ],
              "properties": {
                "name": {
                  "type": "string"
                },
                "shortName": {
                  "type": "string"
                },
                "kind": {
                  "type": "string",
                  "enum": [
                    "local",
                    "remote"
                  ]
                },
                "current": {
                  "type": "boolean"
                },
                "remote": {
                  "type": "string"
                },
                "upstream": {
                  "type": "string"
                },
                "ahead": {
                  "type": "integer",
                  "minimum": 0
                },
                "behind": {
                  "type": "integer",
                  "minimum": 0
                },
                "latestCommit": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "hash",
                    "shortHash",
                    "subject",
                    "authorName",
                    "authorEmail",
                    "authoredAt"
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
                    }
                  }
                }
              }
            }
          },
          "remotes": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "name",
                "fetchUrl",
                "pushUrl",
                "role"
              ],
              "properties": {
                "name": {
                  "type": "string"
                },
                "fetchUrl": {
                  "type": "string"
                },
                "pushUrl": {
                  "type": "string"
                },
                "role": {
                  "type": "string",
                  "enum": [
                    "origin",
                    "upstream",
                    "other"
                  ]
                }
              }
            }
          },
          "originComparison": {
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
          },
          "upstreamComparison": {
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
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

## Health

### `GET /api/health`

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "status",
      "service",
      "timestamp"
    ],
    "properties": {
      "status": {
        "type": "string"
      },
      "service": {
        "type": "string"
      },
      "timestamp": {
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

## Processes

### `GET /api/ports`

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "inspection"
    ],
    "properties": {
      "inspection": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "status",
          "platform",
          "inspectedAt",
          "entries",
          "truncated"
        ],
        "properties": {
          "status": {
            "type": "string",
            "enum": [
              "ready",
              "unsupported",
              "unavailable"
            ]
          },
          "platform": {
            "type": "string",
            "enum": [
              "linux",
              "unsupported"
            ]
          },
          "inspectedAt": {
            "type": "string"
          },
          "entries": {
            "type": "array",
            "maxItems": 100,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "port",
                "address",
                "scope",
                "state",
                "conflict",
                "expected"
              ],
              "properties": {
                "port": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 65535
                },
                "address": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 64
                },
                "scope": {
                  "type": "string",
                  "enum": [
                    "loopback",
                    "all-interfaces"
                  ]
                },
                "state": {
                  "type": "string",
                  "enum": [
                    "available",
                    "occupied"
                  ]
                },
                "conflict": {
                  "type": "boolean"
                },
                "expected": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "projectId",
                      "projectName",
                      "service"
                    ],
                    "properties": {
                      "projectId": {
                        "type": "string"
                      },
                      "projectName": {
                        "type": "string"
                      },
                      "service": {
                        "type": "string",
                        "enum": [
                          "server"
                        ]
                      }
                    }
                  }
                },
                "managedProcess": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "id",
                    "projectId",
                    "projectName",
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
                    "projectName": {
                      "type": "string"
                    },
                    "kind": {
                      "type": "string",
                      "enum": [
                        "server",
                        "webpack",
                        "worker",
                        "test",
                        "script",
                        "compose-build"
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
                    }
                  }
                },
                "externalProcess": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "pid",
                    "name"
                  ],
                  "properties": {
                    "pid": {
                      "type": "integer",
                      "minimum": 1
                    },
                    "name": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 64
                    }
                  }
                },
                "suggestedPort": {
                  "type": "integer",
                  "minimum": 1024,
                  "maximum": 65535
                }
              }
            }
          },
          "truncated": {
            "type": "boolean"
          },
          "warning": {
            "type": "string",
            "maxLength": 240
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

### `GET /api/processes`

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "workspaceId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "projectId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "kind": {
      "type": "string",
      "enum": [
        "server",
        "test"
      ]
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
      "processes"
    ],
    "properties": {
      "processes": {
        "type": "array",
        "items": {
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
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/processes/cleanup`

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "removed",
      "removedCount"
    ],
    "properties": {
      "removed": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "projectId": {
              "type": "string"
            },
            "logFile": {
              "type": "string"
            }
          }
        }
      },
      "removedCount": {
        "type": "integer",
        "minimum": 0
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

### `GET /api/projects/:projectId/process`

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

### `DELETE /api/projects/:projectId/process/logs`

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

### `GET /api/projects/:projectId/process/logs`

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

### `POST /api/projects/:projectId/process/start`

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
  "properties": {
    "port": {
      "anyOf": [
        {
          "type": "integer",
          "minimum": 1024,
          "maximum": 65535
        },
        {
          "type": "null"
        }
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

### `POST /api/projects/:projectId/process/stop`

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

### `GET /api/projects/:projectId/server-health`

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
      "health"
    ],
    "properties": {
      "health": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "projectId",
          "path",
          "pathSource",
          "status",
          "checkedAt"
        ],
        "properties": {
          "projectId": {
            "type": "string"
          },
          "path": {
            "type": "string"
          },
          "pathSource": {
            "type": "string",
            "enum": [
              "configured",
              "detected"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "healthy",
              "degraded",
              "unavailable"
            ]
          },
          "httpStatus": {
            "type": "integer"
          },
          "latencyMs": {
            "type": "integer",
            "minimum": 0
          },
          "checkedAt": {
            "type": "string"
          },
          "message": {
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

### `GET /api/projects/:projectId/server-settings`

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
      "settings",
      "environments"
    ],
    "properties": {
      "settings": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "projectId"
        ],
        "properties": {
          "projectId": {
            "type": "string"
          },
          "port": {
            "type": "integer"
          },
          "healthCheckPath": {
            "type": "string"
          },
          "environment": {
            "type": "string",
            "maxLength": 64
          },
          "updatedAt": {
            "type": "string"
          }
        }
      },
      "environments": {
        "type": "array",
        "maxItems": 50,
        "items": {
          "type": "string",
          "minLength": 1,
          "maxLength": 64,
          "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]*$"
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

### `PUT /api/projects/:projectId/server-settings`

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
  "properties": {
    "port": {
      "anyOf": [
        {
          "type": "integer",
          "minimum": 1024,
          "maximum": 65535
        },
        {
          "type": "null"
        }
      ]
    },
    "healthCheckPath": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        },
        {
          "type": "null"
        }
      ]
    },
    "environment": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 64,
          "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]*$"
        },
        {
          "type": "null"
        }
      ]
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
      "settings",
      "environments"
    ],
    "properties": {
      "settings": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "projectId"
        ],
        "properties": {
          "projectId": {
            "type": "string"
          },
          "port": {
            "type": "integer"
          },
          "healthCheckPath": {
            "type": "string"
          },
          "environment": {
            "type": "string",
            "maxLength": 64
          },
          "updatedAt": {
            "type": "string"
          }
        }
      },
      "environments": {
        "type": "array",
        "maxItems": 50,
        "items": {
          "type": "string",
          "minLength": 1,
          "maxLength": 64,
          "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]*$"
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

## Project Browser

### `POST /api/projects/:projectId/browser/open`

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
    "target"
  ],
  "properties": {
    "target": {
      "type": "string",
      "enum": [
        "server"
      ]
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
      "target",
      "url",
      "opened"
    ],
    "properties": {
      "target": {
        "type": "string",
        "enum": [
          "server"
        ]
      },
      "url": {
        "type": "string"
      },
      "opened": {
        "type": "boolean",
        "const": true
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

## Project Coverage

### `GET /api/projects/:projectId/coverage`

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
      "coverage"
    ],
    "properties": {
      "coverage": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "available"
        ],
        "properties": {
          "available": {
            "type": "boolean"
          },
          "generatedAt": {
            "type": "string"
          },
          "total": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "statements",
              "branches",
              "functions",
              "lines"
            ],
            "properties": {
              "statements": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "total",
                  "covered",
                  "pct"
                ],
                "properties": {
                  "total": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "covered": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "pct": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 100
                  }
                }
              },
              "branches": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "total",
                  "covered",
                  "pct"
                ],
                "properties": {
                  "total": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "covered": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "pct": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 100
                  }
                }
              },
              "functions": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "total",
                  "covered",
                  "pct"
                ],
                "properties": {
                  "total": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "covered": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "pct": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 100
                  }
                }
              },
              "lines": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "total",
                  "covered",
                  "pct"
                ],
                "properties": {
                  "total": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "covered": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "pct": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 100
                  }
                }
              }
            }
          },
          "files": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "path",
                "statements",
                "branches",
                "functions",
                "lines"
              ],
              "properties": {
                "path": {
                  "type": "string"
                },
                "statements": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "total",
                    "covered",
                    "pct"
                  ],
                  "properties": {
                    "total": {
                      "type": "integer",
                      "minimum": 0
                    },
                    "covered": {
                      "type": "integer",
                      "minimum": 0
                    },
                    "pct": {
                      "type": "number",
                      "minimum": 0,
                      "maximum": 100
                    }
                  }
                },
                "branches": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "total",
                    "covered",
                    "pct"
                  ],
                  "properties": {
                    "total": {
                      "type": "integer",
                      "minimum": 0
                    },
                    "covered": {
                      "type": "integer",
                      "minimum": 0
                    },
                    "pct": {
                      "type": "number",
                      "minimum": 0,
                      "maximum": 100
                    }
                  }
                },
                "functions": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "total",
                    "covered",
                    "pct"
                  ],
                  "properties": {
                    "total": {
                      "type": "integer",
                      "minimum": 0
                    },
                    "covered": {
                      "type": "integer",
                      "minimum": 0
                    },
                    "pct": {
                      "type": "number",
                      "minimum": 0,
                      "maximum": 100
                    }
                  }
                },
                "lines": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "total",
                    "covered",
                    "pct"
                  ],
                  "properties": {
                    "total": {
                      "type": "integer",
                      "minimum": 0
                    },
                    "covered": {
                      "type": "integer",
                      "minimum": 0
                    },
                    "pct": {
                      "type": "number",
                      "minimum": 0,
                      "maximum": 100
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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/coverage/history`

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
      "history"
    ],
    "properties": {
      "history": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "items",
          "total"
        ],
        "properties": {
          "items": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "id",
                "generatedAt",
                "recordedAt",
                "total"
              ],
              "properties": {
                "id": {
                  "type": "string"
                },
                "generatedAt": {
                  "type": "string"
                },
                "recordedAt": {
                  "type": "string"
                },
                "total": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "statements",
                    "branches",
                    "functions",
                    "lines"
                  ],
                  "properties": {
                    "statements": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "total",
                        "covered",
                        "pct"
                      ],
                      "properties": {
                        "total": {
                          "type": "integer",
                          "minimum": 0
                        },
                        "covered": {
                          "type": "integer",
                          "minimum": 0
                        },
                        "pct": {
                          "type": "number",
                          "minimum": 0,
                          "maximum": 100
                        }
                      }
                    },
                    "branches": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "total",
                        "covered",
                        "pct"
                      ],
                      "properties": {
                        "total": {
                          "type": "integer",
                          "minimum": 0
                        },
                        "covered": {
                          "type": "integer",
                          "minimum": 0
                        },
                        "pct": {
                          "type": "number",
                          "minimum": 0,
                          "maximum": 100
                        }
                      }
                    },
                    "functions": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "total",
                        "covered",
                        "pct"
                      ],
                      "properties": {
                        "total": {
                          "type": "integer",
                          "minimum": 0
                        },
                        "covered": {
                          "type": "integer",
                          "minimum": 0
                        },
                        "pct": {
                          "type": "number",
                          "minimum": 0,
                          "maximum": 100
                        }
                      }
                    },
                    "lines": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "total",
                        "covered",
                        "pct"
                      ],
                      "properties": {
                        "total": {
                          "type": "integer",
                          "minimum": 0
                        },
                        "covered": {
                          "type": "integer",
                          "minimum": 0
                        },
                        "pct": {
                          "type": "number",
                          "minimum": 0,
                          "maximum": 100
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "total": {
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

## Project Doctor

### `GET /api/projects/:projectId/doctor`

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
      "type": "string",
      "enum": [
        "true"
      ]
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
      "report"
    ],
    "properties": {
      "report": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "projectId",
          "generatedAt",
          "overallStatus",
          "summary",
          "checks"
        ],
        "properties": {
          "projectId": {
            "type": "string"
          },
          "generatedAt": {
            "type": "string"
          },
          "overallStatus": {
            "type": "string",
            "enum": [
              "healthy",
              "attention",
              "blocked"
            ]
          },
          "summary": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "passed",
              "warnings",
              "failed",
              "skipped"
            ],
            "properties": {
              "passed": {
                "type": "integer",
                "minimum": 0
              },
              "warnings": {
                "type": "integer",
                "minimum": 0
              },
              "failed": {
                "type": "integer",
                "minimum": 0
              },
              "skipped": {
                "type": "integer",
                "minimum": 0
              }
            }
          },
          "checks": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "id",
                "category",
                "label",
                "status",
                "summary"
              ],
              "properties": {
                "id": {
                  "type": "string"
                },
                "category": {
                  "type": "string",
                  "enum": [
                    "project",
                    "runtime",
                    "dependencies",
                    "configuration"
                  ]
                },
                "label": {
                  "type": "string"
                },
                "status": {
                  "type": "string",
                  "enum": [
                    "passed",
                    "warning",
                    "failed",
                    "skipped"
                  ]
                },
                "summary": {
                  "type": "string"
                },
                "recommendation": {
                  "type": "string"
                },
                "action": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "label",
                    "target"
                  ],
                  "properties": {
                    "label": {
                      "type": "string"
                    },
                    "target": {
                      "type": "string",
                      "enum": [
                        "dependencies",
                        "server",
                        "database",
                        "settings"
                      ]
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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

## Project Editor

### `POST /api/projects/:projectId/editor`

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
    "editorId"
  ],
  "properties": {
    "editorId": {
      "type": "string",
      "enum": [
        "vscode",
        "cursor",
        "vscodium",
        "sublime",
        "zed"
      ]
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
      "editor",
      "opened"
    ],
    "properties": {
      "editor": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "name"
        ],
        "properties": {
          "id": {
            "type": "string",
            "enum": [
              "vscode",
              "cursor",
              "vscodium",
              "sublime",
              "zed"
            ]
          },
          "name": {
            "type": "string"
          }
        }
      },
      "opened": {
        "type": "boolean",
        "const": true
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

### `GET /api/projects/:projectId/editors`

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
      "editors"
    ],
    "properties": {
      "editors": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "id",
            "name"
          ],
          "properties": {
            "id": {
              "type": "string",
              "enum": [
                "vscode",
                "cursor",
                "vscodium",
                "sublime",
                "zed"
              ]
            },
            "name": {
              "type": "string"
            }
          }
        }
      },
      "preferredEditorId": {
        "type": "string",
        "enum": [
          "vscode",
          "cursor",
          "vscodium",
          "sublime",
          "zed"
        ]
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

## Project Environment

### `GET /api/projects/:projectId/environment-variables`

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
      "environment"
    ],
    "properties": {
      "environment": {
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
                "file",
                "variables"
              ],
              "properties": {
                "file": {
                  "type": "string"
                },
                "variables": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "name",
                      "sensitive"
                    ],
                    "properties": {
                      "name": {
                        "type": "string"
                      },
                      "value": {
                        "type": "string"
                      },
                      "sensitive": {
                        "type": "boolean"
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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/environment-variables/value`

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
  "required": [
    "file",
    "name"
  ],
  "properties": {
    "file": {
      "type": "string",
      "enum": [
        ".env",
        ".env.local",
        ".env.development",
        ".env.test",
        ".env.production"
      ]
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 256,
      "pattern": "^[A-Za-z_][A-Za-z0-9_]*$"
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
      "variable"
    ],
    "properties": {
      "variable": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "file",
          "name",
          "value",
          "sensitive"
        ],
        "properties": {
          "file": {
            "type": "string"
          },
          "name": {
            "type": "string"
          },
          "value": {
            "type": "string"
          },
          "sensitive": {
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

## Project File Mutations

### `POST /api/projects/:projectId/files/entries`

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
    "path",
    "kind"
  ],
  "properties": {
    "path": {
      "type": "string",
      "minLength": 1,
      "maxLength": 2048
    },
    "kind": {
      "type": "string",
      "enum": [
        "file",
        "directory"
      ]
    },
    "content": {
      "type": "string",
      "maxLength": 524288
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
      "operation",
      "path",
      "kind"
    ],
    "properties": {
      "operation": {
        "type": "string",
        "enum": [
          "create",
          "rename",
          "delete"
        ]
      },
      "path": {
        "type": "string"
      },
      "destinationPath": {
        "type": "string"
      },
      "kind": {
        "type": "string",
        "enum": [
          "file",
          "directory"
        ]
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

### `POST /api/projects/:projectId/files/mutations/apply`

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
    "confirmationToken"
  ],
  "properties": {
    "confirmationToken": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "confirmationPhrase": {
      "type": "string",
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
      "operation",
      "path",
      "kind"
    ],
    "properties": {
      "operation": {
        "type": "string",
        "enum": [
          "create",
          "rename",
          "delete"
        ]
      },
      "path": {
        "type": "string"
      },
      "destinationPath": {
        "type": "string"
      },
      "kind": {
        "type": "string",
        "enum": [
          "file",
          "directory"
        ]
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

### `POST /api/projects/:projectId/files/mutations/preview`

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
    "operation",
    "path"
  ],
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "rename",
        "delete"
      ]
    },
    "path": {
      "type": "string",
      "minLength": 1,
      "maxLength": 2048
    },
    "destinationPath": {
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
      "confirmationToken",
      "operation",
      "path",
      "kind",
      "affectedFiles",
      "affectedDirectories",
      "totalBytes",
      "requiresPhrase",
      "expiresAt"
    ],
    "properties": {
      "confirmationToken": {
        "type": "string"
      },
      "operation": {
        "type": "string",
        "enum": [
          "rename",
          "delete"
        ]
      },
      "path": {
        "type": "string"
      },
      "destinationPath": {
        "type": "string"
      },
      "kind": {
        "type": "string",
        "enum": [
          "file",
          "directory"
        ]
      },
      "affectedFiles": {
        "type": "integer",
        "minimum": 0
      },
      "affectedDirectories": {
        "type": "integer",
        "minimum": 0
      },
      "totalBytes": {
        "type": "integer",
        "minimum": 0
      },
      "requiresPhrase": {
        "type": "boolean"
      },
      "confirmationPhrase": {
        "type": "string"
      },
      "expiresAt": {
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

## Project Files

### `GET /api/projects/:projectId/files`

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
    "path": {
      "type": "string",
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
      "path",
      "entries",
      "truncated"
    ],
    "properties": {
      "path": {
        "type": "string"
      },
      "entries": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "path",
            "name",
            "kind"
          ],
          "properties": {
            "path": {
              "type": "string"
            },
            "name": {
              "type": "string"
            },
            "kind": {
              "type": "string",
              "enum": [
                "file",
                "directory"
              ]
            },
            "language": {
              "type": "string"
            },
            "size": {
              "type": "integer",
              "minimum": 0
            }
          }
        }
      },
      "truncated": {
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

### `GET /api/projects/:projectId/files/content`

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
      "path",
      "name",
      "language",
      "content",
      "version",
      "size",
      "modifiedAt",
      "writable"
    ],
    "properties": {
      "path": {
        "type": "string"
      },
      "name": {
        "type": "string"
      },
      "language": {
        "type": "string"
      },
      "content": {
        "type": "string"
      },
      "version": {
        "type": "string"
      },
      "size": {
        "type": "integer",
        "minimum": 0
      },
      "modifiedAt": {
        "type": "string"
      },
      "writable": {
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

### `PUT /api/projects/:projectId/files/content`

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
    "path",
    "content",
    "expectedVersion"
  ],
  "properties": {
    "path": {
      "type": "string",
      "minLength": 1,
      "maxLength": 2048
    },
    "content": {
      "type": "string",
      "maxLength": 524288
    },
    "expectedVersion": {
      "type": "string",
      "pattern": "^[a-f0-9]{64}$"
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
      "path",
      "name",
      "language",
      "content",
      "version",
      "size",
      "modifiedAt",
      "writable"
    ],
    "properties": {
      "path": {
        "type": "string"
      },
      "name": {
        "type": "string"
      },
      "language": {
        "type": "string"
      },
      "content": {
        "type": "string"
      },
      "version": {
        "type": "string"
      },
      "size": {
        "type": "integer",
        "minimum": 0
      },
      "modifiedAt": {
        "type": "string"
      },
      "writable": {
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

### `GET /api/projects/:projectId/files/search`

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
  "required": [
    "query"
  ],
  "properties": {
    "query": {
      "type": "string",
      "minLength": 2,
      "maxLength": 100
    },
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100,
      "default": 50
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
      "query",
      "items",
      "truncated",
      "scannedFiles"
    ],
    "properties": {
      "query": {
        "type": "string"
      },
      "items": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "path",
            "name",
            "language",
            "line",
            "column",
            "preview"
          ],
          "properties": {
            "path": {
              "type": "string"
            },
            "name": {
              "type": "string"
            },
            "language": {
              "type": "string"
            },
            "line": {
              "type": "integer",
              "minimum": 1
            },
            "column": {
              "type": "integer",
              "minimum": 1
            },
            "preview": {
              "type": "string"
            }
          }
        }
      },
      "truncated": {
        "type": "boolean"
      },
      "scannedFiles": {
        "type": "integer",
        "minimum": 0
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

## Project Language Server

### `GET /api/projects/:projectId/language-server/:kind`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "kind"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "kind": {
      "type": "string",
      "enum": [
        "javascript-typescript",
        "ruby"
      ]
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
      "kind",
      "supported",
      "available",
      "state",
      "activeConnections",
      "message"
    ],
    "properties": {
      "kind": {
        "type": "string",
        "enum": [
          "javascript-typescript",
          "ruby"
        ]
      },
      "supported": {
        "type": "boolean"
      },
      "available": {
        "type": "boolean"
      },
      "state": {
        "type": "string",
        "enum": [
          "unavailable",
          "idle",
          "starting",
          "ready",
          "failed"
        ]
      },
      "activeConnections": {
        "type": "integer",
        "minimum": 0,
        "maximum": 1
      },
      "message": {
        "type": "string"
      },
      "lastStartedAt": {
        "type": "string"
      },
      "rails": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "addonAvailable",
          "runtimeState",
          "message"
        ],
        "properties": {
          "addonAvailable": {
            "type": "boolean"
          },
          "runtimeState": {
            "type": "string",
            "enum": [
              "unavailable",
              "disabled",
              "enabled"
            ]
          },
          "message": {
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

### `GET /api/projects/:projectId/language-server/:kind/connect`

_Rota sem schema declarado (ex. upgrade de WebSocket)._

### `POST /api/projects/:projectId/language-server/ruby/rails-runtime`

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
    "enabled"
  ],
  "properties": {
    "enabled": {
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

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "kind",
      "supported",
      "available",
      "state",
      "activeConnections",
      "message"
    ],
    "properties": {
      "kind": {
        "type": "string",
        "enum": [
          "javascript-typescript",
          "ruby"
        ]
      },
      "supported": {
        "type": "boolean"
      },
      "available": {
        "type": "boolean"
      },
      "state": {
        "type": "string",
        "enum": [
          "unavailable",
          "idle",
          "starting",
          "ready",
          "failed"
        ]
      },
      "activeConnections": {
        "type": "integer",
        "minimum": 0,
        "maximum": 1
      },
      "message": {
        "type": "string"
      },
      "lastStartedAt": {
        "type": "string"
      },
      "rails": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "addonAvailable",
          "runtimeState",
          "message"
        ],
        "properties": {
          "addonAvailable": {
            "type": "boolean"
          },
          "runtimeState": {
            "type": "string",
            "enum": [
              "unavailable",
              "disabled",
              "enabled"
            ]
          },
          "message": {
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

### `POST /api/projects/:projectId/language-server/ruby/rails-runtime/confirmations`

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
          "expiresAt"
        ],
        "properties": {
          "token": {
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

## Project Readme

### `GET /api/projects/:projectId/readme/files`

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
      "files",
      "truncated"
    ],
    "properties": {
      "files": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "path",
            "name",
            "kind"
          ],
          "properties": {
            "path": {
              "type": "string"
            },
            "name": {
              "type": "string"
            },
            "kind": {
              "type": "string",
              "enum": [
                "file",
                "directory"
              ]
            },
            "language": {
              "type": "string"
            },
            "size": {
              "type": "integer",
              "minimum": 0
            }
          }
        }
      },
      "truncated": {
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

## Project Terminal

### `GET /api/projects/:projectId/terminal/:kind`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "kind"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "kind": {
      "type": "string",
      "enum": [
        "shell",
        "rails-console"
      ]
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
      "kind",
      "supported",
      "activeSessions",
      "message"
    ],
    "properties": {
      "kind": {
        "type": "string",
        "enum": [
          "shell",
          "rails-console"
        ]
      },
      "supported": {
        "type": "boolean"
      },
      "activeSessions": {
        "type": "integer",
        "minimum": 0
      },
      "message": {
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

### `POST /api/projects/:projectId/terminal/:kind/confirmations`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "kind"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "kind": {
      "type": "string",
      "enum": [
        "shell",
        "rails-console"
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
          "expiresAt"
        ],
        "properties": {
          "token": {
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

### `GET /api/projects/:projectId/terminal/:kind/connect`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "kind"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "kind": {
      "type": "string",
      "enum": [
        "shell",
        "rails-console"
      ]
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
    "confirmationToken": {
      "type": "string",
      "minLength": 64,
      "maxLength": 64
    }
  }
}
```

## Project Workspace Edits

### `POST /api/projects/:projectId/files/watch`

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
    "files"
  ],
  "properties": {
    "files": {
      "type": "array",
      "maxItems": 20,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "path",
          "version"
        ],
        "properties": {
          "path": {
            "type": "string",
            "minLength": 1,
            "maxLength": 2048
          },
          "version": {
            "type": "string",
            "pattern": "^[a-f0-9]{64}$"
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
      "checkedAt",
      "items"
    ],
    "properties": {
      "checkedAt": {
        "type": "string"
      },
      "items": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "path",
            "state"
          ],
          "properties": {
            "path": {
              "type": "string"
            },
            "state": {
              "type": "string",
              "enum": [
                "unchanged",
                "changed",
                "deleted",
                "unavailable"
              ]
            },
            "file": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "path",
                "name",
                "language",
                "content",
                "version",
                "size",
                "modifiedAt",
                "writable"
              ],
              "properties": {
                "path": {
                  "type": "string"
                },
                "name": {
                  "type": "string"
                },
                "language": {
                  "type": "string"
                },
                "content": {
                  "type": "string"
                },
                "version": {
                  "type": "string"
                },
                "size": {
                  "type": "integer",
                  "minimum": 0
                },
                "modifiedAt": {
                  "type": "string"
                },
                "writable": {
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

### `POST /api/projects/:projectId/files/workspace-edits/apply`

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
      "files"
    ],
    "properties": {
      "files": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "path",
            "name",
            "language",
            "content",
            "version",
            "size",
            "modifiedAt",
            "writable"
          ],
          "properties": {
            "path": {
              "type": "string"
            },
            "name": {
              "type": "string"
            },
            "language": {
              "type": "string"
            },
            "content": {
              "type": "string"
            },
            "version": {
              "type": "string"
            },
            "size": {
              "type": "integer",
              "minimum": 0
            },
            "modifiedAt": {
              "type": "string"
            },
            "writable": {
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

### `POST /api/projects/:projectId/files/workspace-edits/preview`

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
    "files"
  ],
  "properties": {
    "files": {
      "type": "array",
      "minItems": 1,
      "maxItems": 20,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "path",
          "expectedVersion",
          "edits"
        ],
        "properties": {
          "path": {
            "type": "string",
            "minLength": 1,
            "maxLength": 2048
          },
          "expectedVersion": {
            "type": "string",
            "pattern": "^[a-f0-9]{64}$"
          },
          "edits": {
            "type": "array",
            "minItems": 1,
            "maxItems": 200,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "range",
                "newText"
              ],
              "properties": {
                "range": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": [
                    "start",
                    "end"
                  ],
                  "properties": {
                    "start": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "line",
                        "column"
                      ],
                      "properties": {
                        "line": {
                          "type": "integer",
                          "minimum": 1
                        },
                        "column": {
                          "type": "integer",
                          "minimum": 1
                        }
                      }
                    },
                    "end": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "line",
                        "column"
                      ],
                      "properties": {
                        "line": {
                          "type": "integer",
                          "minimum": 1
                        },
                        "column": {
                          "type": "integer",
                          "minimum": 1
                        }
                      }
                    }
                  }
                },
                "newText": {
                  "type": "string",
                  "maxLength": 524288
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

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "confirmationToken",
      "files",
      "expiresAt"
    ],
    "properties": {
      "confirmationToken": {
        "type": "string"
      },
      "expiresAt": {
        "type": "string"
      },
      "files": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "path",
            "language",
            "beforeVersion",
            "beforeContent",
            "afterContent"
          ],
          "properties": {
            "path": {
              "type": "string"
            },
            "language": {
              "type": "string"
            },
            "beforeVersion": {
              "type": "string"
            },
            "beforeContent": {
              "type": "string"
            },
            "afterContent": {
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

## Projects

### `GET /api/projects`

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "projects"
    ],
    "properties": {
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
            "favorite",
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
            "favorite": {
              "type": "boolean"
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

### `DELETE /api/projects/:projectId`

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

### `GET /api/projects/:projectId`

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
      "project"
    ],
    "properties": {
      "project": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "name",
          "path",
          "type",
          "source",
          "favorite",
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
          "favorite": {
            "type": "boolean"
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
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/access`

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
  "maxProperties": 0
}
```

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "project"
    ],
    "properties": {
      "project": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "name",
          "path",
          "type",
          "source",
          "favorite",
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
          "favorite": {
            "type": "boolean"
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
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `PUT /api/projects/:projectId/enabled`

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
    "enabled"
  ],
  "properties": {
    "enabled": {
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
      "project"
    ],
    "properties": {
      "project": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "name",
          "path",
          "type",
          "source",
          "favorite",
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
          "favorite": {
            "type": "boolean"
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
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/favicon`

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

### `PUT /api/projects/:projectId/favorite`

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
    "favorite"
  ],
  "properties": {
    "favorite": {
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
      "project"
    ],
    "properties": {
      "project": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "name",
          "path",
          "type",
          "source",
          "favorite",
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
          "favorite": {
            "type": "boolean"
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
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/git`

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
      "git"
    ],
    "properties": {
      "git": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "repository",
          "detached",
          "ahead",
          "behind",
          "clean",
          "files",
          "recentCommits"
        ],
        "properties": {
          "repository": {
            "type": "boolean"
          },
          "branch": {
            "type": "string"
          },
          "detached": {
            "type": "boolean"
          },
          "upstream": {
            "type": "string"
          },
          "ahead": {
            "type": "integer",
            "minimum": 0
          },
          "behind": {
            "type": "integer",
            "minimum": 0
          },
          "clean": {
            "type": "boolean"
          },
          "files": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "path",
                "indexStatus",
                "worktreeStatus",
                "status"
              ],
              "properties": {
                "path": {
                  "type": "string"
                },
                "previousPath": {
                  "type": "string"
                },
                "indexStatus": {
                  "type": "string"
                },
                "worktreeStatus": {
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
                    "untracked",
                    "conflicted",
                    "type-changed"
                  ]
                }
              }
            }
          },
          "latestCommit": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "hash",
              "shortHash",
              "subject",
              "authorName",
              "authorEmail",
              "authoredAt"
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
              }
            }
          },
          "recentCommits": {
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
                "authoredAt"
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

### `GET /api/projects/:projectId/git/diff`

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
    "scope": {
      "type": "string",
      "enum": [
        "worktree",
        "index",
        "combined"
      ]
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
      "diff"
    ],
    "properties": {
      "diff": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "repository",
          "scope",
          "files"
        ],
        "properties": {
          "repository": {
            "type": "boolean"
          },
          "scope": {
            "type": "string",
            "enum": [
              "worktree",
              "index",
              "combined"
            ]
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
                    "untracked",
                    "conflicted",
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

### `GET /api/projects/:projectId/git/diff/file`

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
  "required": [
    "path"
  ],
  "properties": {
    "path": {
      "type": "string",
      "minLength": 1,
      "maxLength": 2048
    },
    "scope": {
      "type": "string",
      "enum": [
        "worktree",
        "index",
        "combined"
      ]
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
          "path",
          "scope",
          "status",
          "binary",
          "content",
          "truncated",
          "masked",
          "redactionCount"
        ],
        "properties": {
          "path": {
            "type": "string"
          },
          "scope": {
            "type": "string",
            "enum": [
              "worktree",
              "index",
              "combined"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "added",
              "modified",
              "deleted",
              "renamed",
              "copied",
              "untracked",
              "conflicted",
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

### `GET /api/projects/:projectId/git/diff/file/lines`

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
  "required": [
    "path",
    "start",
    "end"
  ],
  "properties": {
    "path": {
      "type": "string",
      "minLength": 1,
      "maxLength": 2048
    },
    "scope": {
      "type": "string",
      "enum": [
        "worktree",
        "index",
        "combined"
      ]
    },
    "start": {
      "type": "integer",
      "minimum": 1
    },
    "end": {
      "type": "integer",
      "minimum": 1
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
      "lines"
    ],
    "properties": {
      "lines": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "path",
          "scope",
          "start",
          "end",
          "totalLines",
          "lines",
          "masked",
          "redactionCount"
        ],
        "properties": {
          "path": {
            "type": "string"
          },
          "scope": {
            "type": "string",
            "enum": [
              "worktree",
              "index",
              "combined"
            ]
          },
          "start": {
            "type": "integer",
            "minimum": 1
          },
          "end": {
            "type": "integer",
            "minimum": 0
          },
          "totalLines": {
            "type": "integer",
            "minimum": 0
          },
          "lines": {
            "type": "array",
            "items": {
              "type": "string"
            }
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

## Rails

### `GET /api/projects/:projectId/rails/credentials`

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
      "credentials"
    ],
    "properties": {
      "credentials": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "supported",
          "environments"
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
                "name",
                "credentialsPath",
                "credentialsFileExists",
                "keyPath",
                "keyFileExists",
                "keySource"
              ],
              "properties": {
                "name": {
                  "type": "string"
                },
                "credentialsPath": {
                  "type": "string"
                },
                "credentialsFileExists": {
                  "type": "boolean"
                },
                "keyPath": {
                  "type": "string"
                },
                "keyFileExists": {
                  "type": "boolean"
                },
                "keySource": {
                  "type": "string",
                  "enum": [
                    "file",
                    "environment-variable",
                    "missing"
                  ]
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

### `POST /api/projects/:projectId/rails/generate/confirmations`

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
    "kind",
    "name",
    "fields"
  ],
  "properties": {
    "kind": {
      "type": "string",
      "enum": [
        "model",
        "migration"
      ]
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 60
    },
    "fields": {
      "type": "array",
      "maxItems": 25,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "name",
          "type"
        ],
        "properties": {
          "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 60
          },
          "type": {
            "type": "string",
            "enum": [
              "string",
              "text",
              "integer",
              "bigint",
              "float",
              "decimal",
              "boolean",
              "date",
              "datetime",
              "time",
              "timestamp",
              "binary",
              "references",
              "uuid"
            ]
          }
        }
      }
    },
    "database": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_]*$",
      "maxLength": 60
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
          "kind",
          "name",
          "fields",
          "command",
          "expiresAt"
        ],
        "properties": {
          "token": {
            "type": "string"
          },
          "kind": {
            "type": "string",
            "enum": [
              "model",
              "migration"
            ]
          },
          "name": {
            "type": "string"
          },
          "fields": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "name",
                "type"
              ],
              "properties": {
                "name": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 60
                },
                "type": {
                  "type": "string",
                  "enum": [
                    "string",
                    "text",
                    "integer",
                    "bigint",
                    "float",
                    "decimal",
                    "boolean",
                    "date",
                    "datetime",
                    "time",
                    "timestamp",
                    "binary",
                    "references",
                    "uuid"
                  ]
                }
              }
            }
          },
          "database": {
            "type": "string"
          },
          "command": {
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

### `POST /api/projects/:projectId/rails/generate/mutations`

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
          "kind",
          "name",
          "succeeded",
          "createdFiles",
          "output",
          "truncated",
          "masked",
          "redactionCount"
        ],
        "properties": {
          "kind": {
            "type": "string",
            "enum": [
              "model",
              "migration"
            ]
          },
          "name": {
            "type": "string"
          },
          "succeeded": {
            "type": "boolean"
          },
          "createdFiles": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "output": {
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

### `GET /api/projects/:projectId/rails/migrations`

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
    "database": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_]*$",
      "maxLength": 60
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
      "migrations"
    ],
    "properties": {
      "migrations": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "supported",
          "databases",
          "migrations"
        ],
        "properties": {
          "supported": {
            "type": "boolean"
          },
          "databases": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "database": {
            "type": "string"
          },
          "migrations": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "version",
                "name",
                "status"
              ],
              "properties": {
                "version": {
                  "type": "string"
                },
                "name": {
                  "type": "string"
                },
                "status": {
                  "type": "string",
                  "enum": [
                    "up",
                    "down"
                  ]
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

### `GET /api/projects/:projectId/rails/migrations/:version`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "version"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "version": {
      "type": "string",
      "pattern": "^[0-9]{8,20}$"
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
    "database": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_]*$",
      "maxLength": 60
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
      "migration"
    ],
    "properties": {
      "migration": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "supported",
          "version",
          "truncated"
        ],
        "properties": {
          "supported": {
            "type": "boolean"
          },
          "version": {
            "type": "string"
          },
          "name": {
            "type": "string"
          },
          "status": {
            "type": "string",
            "enum": [
              "up",
              "down"
            ]
          },
          "filePath": {
            "type": "string"
          },
          "source": {
            "type": "string"
          },
          "truncated": {
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

### `POST /api/projects/:projectId/rails/migrations/confirmations`

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
    "operation"
  ],
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "migrate",
        "rollback",
        "seed",
        "prepare"
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
          "operation",
          "expiresAt"
        ],
        "properties": {
          "token": {
            "type": "string"
          },
          "operation": {
            "type": "string",
            "enum": [
              "migrate",
              "rollback",
              "seed",
              "prepare"
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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `POST /api/projects/:projectId/rails/migrations/mutations`

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
    "operation",
    "confirmationToken"
  ],
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "migrate",
        "rollback",
        "seed",
        "prepare"
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
          "operation",
          "succeeded",
          "output",
          "truncated",
          "masked",
          "redactionCount"
        ],
        "properties": {
          "operation": {
            "type": "string",
            "enum": [
              "migrate",
              "rollback",
              "seed",
              "prepare"
            ]
          },
          "succeeded": {
            "type": "boolean"
          },
          "output": {
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

### `GET /api/projects/:projectId/rails/models`

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
    "database": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_]*$",
      "maxLength": 60
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
      "models"
    ],
    "properties": {
      "models": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "supported",
          "databases",
          "tables"
        ],
        "properties": {
          "supported": {
            "type": "boolean"
          },
          "databases": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "schemaPath": {
            "type": "string"
          },
          "tables": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "name",
                "columns",
                "indexes",
                "foreignKeys"
              ],
              "properties": {
                "name": {
                  "type": "string"
                },
                "columns": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "name",
                      "type",
                      "nullable",
                      "primaryKey"
                    ],
                    "properties": {
                      "name": {
                        "type": "string"
                      },
                      "type": {
                        "type": "string"
                      },
                      "nullable": {
                        "type": "boolean"
                      },
                      "primaryKey": {
                        "type": "boolean"
                      },
                      "default": {
                        "type": "string"
                      },
                      "limit": {
                        "type": "integer"
                      },
                      "precision": {
                        "type": "integer"
                      },
                      "scale": {
                        "type": "integer"
                      }
                    }
                  }
                },
                "indexes": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "columns",
                      "unique"
                    ],
                    "properties": {
                      "name": {
                        "type": "string"
                      },
                      "columns": {
                        "type": "array",
                        "items": {
                          "type": "string"
                        }
                      },
                      "unique": {
                        "type": "boolean"
                      }
                    }
                  }
                },
                "foreignKeys": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "fromTable",
                      "toTable",
                      "column"
                    ],
                    "properties": {
                      "fromTable": {
                        "type": "string"
                      },
                      "toTable": {
                        "type": "string"
                      },
                      "column": {
                        "type": "string"
                      },
                      "primaryKey": {
                        "type": "string"
                      },
                      "name": {
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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `GET /api/projects/:projectId/rails/routes`

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
      "routes"
    ],
    "properties": {
      "routes": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "supported",
          "routes"
        ],
        "properties": {
          "supported": {
            "type": "boolean"
          },
          "routes": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "verb",
                "path",
                "controllerAction"
              ],
              "properties": {
                "name": {
                  "type": "string"
                },
                "verb": {
                  "type": "string"
                },
                "path": {
                  "type": "string"
                },
                "controllerAction": {
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

### `GET /api/projects/:projectId/rails/workers/:workerId`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "workerId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "workerId": {
      "type": "string",
      "enum": [
        "sidekiq",
        "webpack"
      ]
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
      "worker"
    ],
    "properties": {
      "worker": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "detected",
          "process"
        ],
        "properties": {
          "id": {
            "type": "string",
            "enum": [
              "sidekiq",
              "webpack"
            ]
          },
          "detected": {
            "type": "boolean"
          },
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
    }
  }
  ```
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

### `DELETE /api/projects/:projectId/rails/workers/:workerId/logs`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "workerId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "workerId": {
      "type": "string",
      "enum": [
        "sidekiq",
        "webpack"
      ]
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

### `GET /api/projects/:projectId/rails/workers/:workerId/logs`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "workerId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "workerId": {
      "type": "string",
      "enum": [
        "sidekiq",
        "webpack"
      ]
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

### `POST /api/projects/:projectId/rails/workers/:workerId/restart`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "workerId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "workerId": {
      "type": "string",
      "enum": [
        "sidekiq",
        "webpack"
      ]
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

### `POST /api/projects/:projectId/rails/workers/:workerId/start`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "workerId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "workerId": {
      "type": "string",
      "enum": [
        "sidekiq",
        "webpack"
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

### `POST /api/projects/:projectId/rails/workers/:workerId/stop`

**Parâmetros de rota (`params`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "projectId",
    "workerId"
  ],
  "properties": {
    "projectId": {
      "type": "string",
      "minLength": 1
    },
    "workerId": {
      "type": "string",
      "enum": [
        "sidekiq",
        "webpack"
      ]
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

## Script History

### `DELETE /api/projects/:projectId/scripts/executions`

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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

## Scripts

### `GET /api/projects/:projectId/scripts`

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
      "maximum": 100,
      "default": 20
    },
    "search": {
      "type": "string",
      "maxLength": 120
    },
    "origin": {
      "type": "string",
      "enum": [
        "package-script",
        "rails-task",
        "bin"
      ]
    },
    "risk": {
      "type": "string",
      "enum": [
        "read-only",
        "mutable",
        "destructive"
      ]
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
      "catalog"
    ],
    "properties": {
      "catalog": {
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
                "name",
                "description",
                "command",
                "origin",
                "risk",
                "enabled"
              ],
              "properties": {
                "id": {
                  "type": "string"
                },
                "name": {
                  "type": "string"
                },
                "description": {
                  "type": "string"
                },
                "command": {
                  "type": "string"
                },
                "origin": {
                  "type": "string",
                  "enum": [
                    "package-script",
                    "package-manager",
                    "bundler",
                    "rails-task",
                    "bin"
                  ]
                },
                "risk": {
                  "type": "string",
                  "enum": [
                    "read-only",
                    "mutable",
                    "destructive"
                  ]
                },
                "enabled": {
                  "type": "boolean"
                },
                "variables": {
                  "type": "array",
                  "maxItems": 20,
                  "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                      "name",
                      "required"
                    ],
                    "properties": {
                      "name": {
                        "type": "string"
                      },
                      "required": {
                        "type": "boolean"
                      },
                      "defaultValue": {
                        "type": "string"
                      },
                      "placeholder": {
                        "type": "string"
                      }
                    }
                  }
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

### `POST /api/projects/:projectId/scripts/confirmations`

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
    },
    "variables": {
      "type": "object",
      "additionalProperties": {
        "type": "string",
        "maxLength": 4096,
        "pattern": "^[^\\u0000\\r\\n]*$"
      },
      "propertyNames": {
        "pattern": "^[A-Z][A-Z0-9_]{0,63}$"
      },
      "maxProperties": 20
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

### `GET /api/projects/:projectId/scripts/executions`

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
      "maximum": 50,
      "default": 20
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
                "actionId",
                "actionName",
                "risk",
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
                "actionId": {
                  "type": "string"
                },
                "actionName": {
                  "type": "string"
                },
                "risk": {
                  "type": "string",
                  "enum": [
                    "read-only",
                    "mutable",
                    "destructive"
                  ]
                },
                "status": {
                  "type": "string",
                  "enum": [
                    "running",
                    "succeeded",
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

### `POST /api/projects/:projectId/scripts/executions`

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
    },
    "confirmationToken": {
      "type": "string",
      "minLength": 64,
      "maxLength": 64
    },
    "variables": {
      "type": "object",
      "additionalProperties": {
        "type": "string",
        "maxLength": 4096,
        "pattern": "^[^\\u0000\\r\\n]*$"
      },
      "propertyNames": {
        "pattern": "^[A-Z][A-Z0-9_]{0,63}$"
      },
      "maxProperties": 20
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
      "execution"
    ],
    "properties": {
      "execution": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "projectId",
          "actionId",
          "actionName",
          "risk",
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
          "actionId": {
            "type": "string"
          },
          "actionName": {
            "type": "string"
          },
          "risk": {
            "type": "string",
            "enum": [
              "read-only",
              "mutable",
              "destructive"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "running",
              "succeeded",
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

### `GET /api/projects/:projectId/scripts/executions/:executionId`

**Parâmetros de rota (`params`)**

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
          "projectId",
          "actionId",
          "actionName",
          "risk",
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
          "actionId": {
            "type": "string"
          },
          "actionName": {
            "type": "string"
          },
          "risk": {
            "type": "string",
            "enum": [
              "read-only",
              "mutable",
              "destructive"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "running",
              "succeeded",
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

### `POST /api/projects/:projectId/scripts/executions/:executionId/cancel`

**Parâmetros de rota (`params`)**

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

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "maxProperties": 0
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
          "projectId",
          "actionId",
          "actionName",
          "risk",
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
          "actionId": {
            "type": "string"
          },
          "actionName": {
            "type": "string"
          },
          "risk": {
            "type": "string",
            "enum": [
              "read-only",
              "mutable",
              "destructive"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "running",
              "succeeded",
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

### `GET /api/projects/:projectId/scripts/executions/:executionId/events`

**Parâmetros de rota (`params`)**

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

### `GET /api/projects/:projectId/scripts/executions/:executionId/log`

**Parâmetros de rota (`params`)**

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
      "log"
    ],
    "properties": {
      "log": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "executionId",
          "content",
          "truncated",
          "masked",
          "redactionCount"
        ],
        "properties": {
          "executionId": {
            "type": "string"
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

### `GET /api/projects/:projectId/scripts/executions/latest`

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
              "projectId",
              "actionId",
              "actionName",
              "risk",
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
              "actionId": {
                "type": "string"
              },
              "actionName": {
                "type": "string"
              },
              "risk": {
                "type": "string",
                "enum": [
                  "read-only",
                  "mutable",
                  "destructive"
                ]
              },
              "status": {
                "type": "string",
                "enum": [
                  "running",
                  "succeeded",
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
              "exitCode": {
                "type": "integer"
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
- **400** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **401** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **403** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **404** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **409** — erro padrão da API (ver [Erros comuns](#erros-comuns)).
- **500** — erro padrão da API (ver [Erros comuns](#erros-comuns)).

## Settings

### `GET /api/settings/environment-profiles`

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "profiles",
      "limits"
    ],
    "properties": {
      "profiles": {
        "type": "array",
        "items": {
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
      },
      "limits": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "maxProfiles",
          "maxVariablesPerProfile",
          "maxNameLength",
          "maxValueLength"
        ],
        "properties": {
          "maxProfiles": {
            "type": "integer"
          },
          "maxVariablesPerProfile": {
            "type": "integer"
          },
          "maxNameLength": {
            "type": "integer"
          },
          "maxValueLength": {
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

### `POST /api/settings/environment-profiles`

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

- **201**:

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

### `GET /api/settings/retention`

**Resposta**

- **200**:

  ```json
  {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "values",
      "limits",
      "appliesAfterRestart"
    ],
    "properties": {
      "values": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "retentionDays",
          "scriptHistoryLimit",
          "testHistoryLimit"
        ],
        "properties": {
          "retentionDays": {
            "type": "integer"
          },
          "scriptHistoryLimit": {
            "type": "integer"
          },
          "testHistoryLimit": {
            "type": "integer"
          }
        }
      },
      "limits": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "retentionDays",
          "scriptHistoryLimit",
          "testHistoryLimit"
        ],
        "properties": {
          "retentionDays": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "minimum",
              "maximum",
              "default"
            ],
            "properties": {
              "minimum": {
                "type": "integer"
              },
              "maximum": {
                "type": "integer"
              },
              "default": {
                "type": "integer"
              }
            }
          },
          "scriptHistoryLimit": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "minimum",
              "maximum",
              "default"
            ],
            "properties": {
              "minimum": {
                "type": "integer"
              },
              "maximum": {
                "type": "integer"
              },
              "default": {
                "type": "integer"
              }
            }
          },
          "testHistoryLimit": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "minimum",
              "maximum",
              "default"
            ],
            "properties": {
              "minimum": {
                "type": "integer"
              },
              "maximum": {
                "type": "integer"
              },
              "default": {
                "type": "integer"
              }
            }
          }
        }
      },
      "appliesAfterRestart": {
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

### `PUT /api/settings/retention`

**Corpo (`body`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "retentionDays",
    "scriptHistoryLimit",
    "testHistoryLimit"
  ],
  "properties": {
    "retentionDays": {
      "type": "integer",
      "minimum": 1,
      "maximum": 365
    },
    "scriptHistoryLimit": {
      "type": "integer",
      "minimum": 10,
      "maximum": 1000
    },
    "testHistoryLimit": {
      "type": "integer",
      "minimum": 10,
      "maximum": 500
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
      "values",
      "limits",
      "appliesAfterRestart"
    ],
    "properties": {
      "values": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "retentionDays",
          "scriptHistoryLimit",
          "testHistoryLimit"
        ],
        "properties": {
          "retentionDays": {
            "type": "integer"
          },
          "scriptHistoryLimit": {
            "type": "integer"
          },
          "testHistoryLimit": {
            "type": "integer"
          }
        }
      },
      "limits": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "retentionDays",
          "scriptHistoryLimit",
          "testHistoryLimit"
        ],
        "properties": {
          "retentionDays": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "minimum",
              "maximum",
              "default"
            ],
            "properties": {
              "minimum": {
                "type": "integer"
              },
              "maximum": {
                "type": "integer"
              },
              "default": {
                "type": "integer"
              }
            }
          },
          "scriptHistoryLimit": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "minimum",
              "maximum",
              "default"
            ],
            "properties": {
              "minimum": {
                "type": "integer"
              },
              "maximum": {
                "type": "integer"
              },
              "default": {
                "type": "integer"
              }
            }
          },
          "testHistoryLimit": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "minimum",
              "maximum",
              "default"
            ],
            "properties": {
              "minimum": {
                "type": "integer"
              },
              "maximum": {
                "type": "integer"
              },
              "default": {
                "type": "integer"
              }
            }
          }
        }
      },
      "appliesAfterRestart": {
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
  "required": [
    "recursiveScan"
  ],
  "properties": {
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

**Query string (`querystring`)**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "restoreDismissed": {
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
            "favorite",
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
            "favorite": {
              "type": "boolean"
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
