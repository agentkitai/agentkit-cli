<p align="center">
  <h1 align="center">⚡ AgentKit CLI</h1>
  <p align="center">
    <strong>Unified CLI for the AgentKit ecosystem</strong><br>
    Manage all your AI agent services from one tool.
  </p>
  <p align="center">
    <a href="https://www.npmjs.com/package/@agentkitai/agentkit-cli"><img src="https://img.shields.io/npm/v/%40agentkitai%2Fagentkit-cli?label=npm" alt="npm version"></a>
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
    <a href="https://github.com/agentkitai/agentkit-cli/actions"><img src="https://img.shields.io/github/actions/workflow/status/agentkitai/agentkit-cli/ci.yml?branch=main" alt="CI"></a>
  </p>
</p>

---

## Quick Start

```bash
npx @agentkitai/agentkit-cli init
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
- `-w, --watch [seconds]` — Live-refresh the table every N seconds (default 2; Ctrl+C to exit)

### `agentkit up` / `down` / `logs`

Thin wrappers around `docker compose` in your stack directory (they do **not**
reimplement an orchestrator):

```
$ agentkit up --profile minimal     # docker compose --profile minimal up -d
$ agentkit logs -f lore             # docker compose logs -f lore
$ agentkit down -v                  # docker compose down -v  (removes volumes)
```

Options:
- `up`: `-p, --profile <name>` (minimal | governance | full), `--no-detach`
- `down`: `-v, --volumes` (also remove volumes)
- `logs [service]`: `-f, --follow`
- all: `-c, --config <path>` (locates the stack's `docker-compose.yml`)

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

## 🤝 Contributing

Contributions are welcome! Fork the repo, make your changes, and open a pull request. For major changes, open an issue first to discuss what you'd like to change.

## 🧰 AgentKit Ecosystem

| Project | Description | |
|---------|-------------|-|
| [AgentLens](https://github.com/agentkitai/agentlens) | Observability & audit trail for AI agents | |
| [Lore](https://github.com/agentkitai/lore) | Cross-agent memory and lesson sharing | |
| [AgentGate](https://github.com/agentkitai/agentgate) | Human-in-the-loop approval gateway | |
| [FormBridge](https://github.com/agentkitai/formbridge) | Agent-human mixed-mode forms | |
| [AgentEval](https://github.com/agentkitai/agenteval) | Testing & evaluation framework | |
| **agentkit-cli** | Unified CLI orchestrator | ⬅️ you are here |

## License

[MIT](LICENSE) © [Amit Paz](https://github.com/amitpaz)
