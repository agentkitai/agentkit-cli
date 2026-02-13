# AgentKit CLI

Unified CLI for the [AgentKit](https://github.com/agentkit) ecosystem — manage all your AI agent services from one tool.

## Quick Start

```bash
npx agentkit init
```

This creates an `agentkit.config.yaml` in your project, sets up `docker-compose.yaml`, and scaffolds your workspace.

## Commands

### `agentkit init`

Interactive project setup. Asks for project name, language (TypeScript/Python), and which services to enable.

```
$ agentkit init
? Project name: my-agent
? Language: typescript
? Enable AgentLens? yes
? Enable Lore? yes
...
✅ Project initialized!
```

### `agentkit status`

Show the status of all configured services.

```
$ agentkit status
Service        | Status     | Port  | Version
---------------|------------|-------|--------
agentlens      | ✅ running | 3000  | 1.2.0
lore           | ❌ down    | 3001  | -
agenteval      | ⚪ disabled | -     | -
```

Options:
- `-c, --config <path>` — Config file path (auto-detected if omitted)
- `-t, --timeout <ms>` — Connection timeout (default: 3000)

### `agentkit doctor`

Run diagnostic checks on your setup.

```
$ agentkit doctor
✅ Config file
✅ Docker daemon
✅ agentlens container
❌ lore health → Check logs with `docker compose logs lore`
```

Options:
- `-c, --config <path>` — Config file path (auto-detected if omitted)
- `-t, --timeout <ms>` — Connection timeout (default: 3000)

## Configuration

The `agentkit.config.yaml` file:

```yaml
projectName: my-agent
language: typescript
services:
  agentlens:
    enabled: true
    port: 3000
  lore:
    enabled: true
    port: 3001
  agentgate:
    enabled: false
  formbridge:
    enabled: false
  agenteval:
    enabled: false
```

### Schema

| Field | Type | Description |
|-------|------|-------------|
| `projectName` | string | Project name (required) |
| `language` | `"typescript"` \| `"python"` | Project language |
| `services.<name>.enabled` | boolean | Whether the service is active |
| `services.<name>.port` | number | Override default port |
| `services.<name>.version` | string | Pin a specific version |

## Supported Services

| Service | Default Port | Description |
|---------|-------------|-------------|
| AgentLens | 3000 | Observability and monitoring for AI agents |
| Lore | 3001 | Knowledge management and RAG pipeline |
| AgentGate | 3002 | API gateway and rate limiting |
| FormBridge | 3003 | Form generation and data collection |
| AgentEval | — | Evaluation and benchmarking (CLI-only) |

## Config Auto-Discovery

When you run `status` or `doctor` without `--config`, the CLI walks up the directory tree (up to 10 levels) looking for `agentkit.config.yaml`. If none is found, it prints:

```
No agentkit.config.yaml found. Run `agentkit init` to get started.
```

## License

ISC
