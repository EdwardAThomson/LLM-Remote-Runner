# LLM Remote Runner

> Execute LLM tasks remotely through a secure web interface with real-time streaming output.

This project was adapted from my other project: [Codex Remote Runner](https://github.com/EdwardAThomson/Codex-Remote-Runner)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10.0-red.svg)](https://nestjs.com/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black.svg)](https://nextjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

LLM Remote Runner is a full-stack application that provides a secure, web-based interface for executing LLM tasks through multiple backends. It features password-protected authentication, real-time streaming output, and a modern React UI.

### Supported Backends

**CLI Backends:**
- [Codex CLI](https://github.com/openai/codex-cli) (OpenAI)
- [Claude Code CLI](https://github.com/anthropics/claude-code) (Anthropic)
- [Gemini CLI](https://github.com/google-gemini/gemini-cli) (Google)

**API Backends:**
- OpenAI API (GPT-4, etc.)
- Anthropic API (Claude)
- Google Gemini API

**Note:** At least one CLI or API backend must be configured. CLI backends require the respective CLI tool to be installed and authenticated.


⚠️ **Warning** - This code has not been audited for security. Use at your own risk.


![Screenshot](./LLM_Remote_Runner_Screenshot_20251205.png)

### Key Features

- 🔐 **Secure Authentication** - Password-based login with bcrypt hashing and JWT sessions
- 📡 **Real-time Streaming** - Server-Sent Events (SSE) for live task output
- 🎯 **Task Management** - Create, monitor, and cancel LLM tasks
- 🌐 **Modern UI** - Clean, responsive Next.js interface with TailwindCSS
- 🔧 **Flexible Configuration** - Customizable workspace directories and paths
- 📦 **Monorepo Architecture** - Well-organized codebase with shared SDK

## Architecture

This monorepo contains:

- **`gateway/`** – NestJS REST API with authentication and task management
- **`sdk/`** – Shared TypeScript SDK for API clients
- **`web/`** – Next.js web application with App Router
- **`mobile/`** – Expo React Native mobile app (experimental)
- **`infra/`** – Docker Compose and infrastructure configuration
- **`docs/`** – Comprehensive documentation

## Prerequisites

Before you begin, ensure you have:

- **Node.js** 18+ and **pnpm** 8+
- **At least one LLM backend** configured (CLI and/or API) — see [Backend Setup](#backend-setup) below
- **Git** for cloning the repository

## Backend Setup

You only need one backend to use the runner. Each adapter is independent; the UI shows whichever ones are configured.

### Codex CLI (OpenAI)

```bash
npm install -g @openai/codex-cli
codex auth   # complete the OAuth flow in your browser
```

The adapter runs `codex exec --full-auto --skip-git-repo-check -C <cwd> "<prompt>"`. `--full-auto` skips all approval prompts — see the [Security Considerations](#security-considerations) section before exposing this to anyone you don't trust.

### Claude Code CLI (Anthropic)

```bash
npm install -g @anthropic-ai/claude-code
claude   # first run will prompt for OAuth login
```

The adapter runs `claude -p "<prompt>" --output-format json` and extracts the `result` field from the JSON envelope.

> If `claude` errors with `claude native binary not installed`, run `./scripts/fix-claude.sh` to repair the install. The package's postinstall sometimes silently no-ops; see the [Troubleshooting](#per-backend-issues) section for what the script does and why.

### Gemini CLI (Google)

```bash
npm install -g @google/gemini-cli
gemini   # first run will prompt for auth (OAuth or API key)
```

The adapter runs `gemini --skip-trust -p "<prompt>" -m <model>`. The model is taken from `GEMINI_DEFAULT_MODEL` (defaults to `gemini-3-flash-preview` — flash is the most reliable preview today; `gemini-3.1-pro-preview` is the newest pro variant but has been hitting capacity-exhausted 429s) unless overridden per task.

`--skip-trust` is required for Gemini CLI 0.42+ — newer versions block headless runs unless the workspace is interactively "trusted" or this flag is passed. The gateway's workspace allowlist (see [docs/SECURITY.md](docs/SECURITY.md), F-1) already constrains where CLIs run, so opting out of the per-folder trust prompt is safe.

### API backends (OpenAI / Anthropic / Gemini)

No CLI required — just set the relevant key in `gateway/.env`:

```bash
OPENAI_API_KEY=sk-...
# and/or
ANTHROPIC_API_KEY=sk-ant-...
# and/or
GEMINI_API_KEY=...
```

Model defaults and optional `*_BASE_URL` overrides are listed under [Environment Variables](#environment-variables).

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/EdwardAThomson/LLM-Remote-Runner.git
cd LLM-Remote-Runner

# Enable pnpm
corepack enable pnpm

# Install all dependencies
pnpm install --recursive
```

### 2. Configure Environment

```bash
# Copy example environment files
cp gateway/.env.example gateway/.env
cp web/.env.local.example web/.env.local
```

Edit `gateway/.env` and configure:

```bash
# Path to Codex binary (if you plan to use the Codex CLI backend)
CODEX_BIN_PATH=codex

# Default workspace for LLM tasks
DEFAULT_WORKSPACE=~/llm-workspace

# Generate a strong JWT secret
JWT_SECRET=$(openssl rand -base64 32)
```

### 3. Set Up Authentication

Run the interactive setup script to create your admin password:

```bash
cd gateway
pnpm tsx scripts/setup-auth.ts
```

The script will:
- Prompt for a password (minimum 16 characters recommended)
- Generate a bcrypt hash
- Save it to `gateway/.env`

**Security:** Delete the script after setup:
```bash
rm scripts/setup-auth.ts
```

⚠️ **Important:** The gateway will **refuse to start** if the setup script still exists. This prevents unauthorized password resets.

> 📖 See [`docs/AUTHENTICATION.md`](docs/AUTHENTICATION.md) for detailed authentication setup and security best practices.

### 4. Start the Application

Run both services in separate terminals:

**Terminal 1 - Backend API:**
```bash
cd gateway
pnpm dev
```

**Terminal 2 - Web UI:**
```bash
cd web
pnpm dev
```

### 5. Create Default Workspace (Optional)

The default workspace directory is `~/llm-workspace`. Create it if it doesn't exist:

```bash
mkdir -p ~/llm-workspace
```

**Note:** You can override this per-task in the web UI, or change the default in `gateway/.env` (`DEFAULT_WORKSPACE`).

### 6. Access the Application

1. Open your browser to **http://localhost:3001**
2. Log in with your admin password
3. Start executing LLM tasks with your configured backend(s)!

## Usage

### Web Interface

1. **Login** - Enter your admin password
2. **Set Workspace** - Specify the working directory for the selected backend
   - Leave empty to use default: `~/llm-workspace`
   - Or specify a custom path (e.g., `~/my-project`)
3. **Enter Prompt** - Describe the task for the selected LLM backend
4. **Submit** - Watch real-time output as the backend executes
5. **Review** - Output history is preserved for the session

### API Usage

You can also interact with the API directly:

```bash
# Login to get session token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"your-password"}'

# Create a task (with backend selection)
curl -X POST http://localhost:3000/api/tasks \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Create a hello world script","cwd":"/path/to/workspace","backend":"codex"}'

# Stream task output
curl -N http://localhost:3000/api/tasks/TASK_ID/stream?token=YOUR_TOKEN
```

> 📖 For programmatic / service-to-service use (API tokens, webhooks, rate limits, signed payloads) see [`docs/api.md`](docs/api.md). The interactive endpoint reference (with "try it" buttons) is at `/api/docs` once the gateway is running.
>
> 📖 See [`RUNNING.md`](RUNNING.md) for general operational notes.

## Configuration

### Environment Variables

#### Gateway (`gateway/.env`)

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Gateway server port | `3000` | No |
| `JWT_SECRET` | Secret for signing JWT tokens | - | Yes |
| `JWT_ISSUER` | JWT token issuer | `codex-remote-runner` | No |
| `ADMIN_PASSWORD_HASH` | Bcrypt hash of admin password | - | Yes |
| `DEFAULT_WORKSPACE` | Default workspace directory (always allowed) | `~/llm-workspace` | Yes |
| `ALLOWED_WORKSPACES` | Comma-separated extra workspace roots. Tasks with a `cwd` outside these (or `DEFAULT_WORKSPACE`) are rejected. | - | No |
| `EXTRA_SUBPROCESS_ENV` | Comma-separated env var names to forward to spawned CLIs in addition to the base allowlist (`PATH`, `HOME`, `USER`, `LANG`, proxy vars, etc.) | - | No |
| `RATE_LIMIT_POINTS` | Max requests per duration | `60` | No |
| `RATE_LIMIT_DURATION` | Rate limit window (seconds) | `60` | No |
| `TASK_HEARTBEAT_MS` | SSE heartbeat interval | `15000` | No |
| `DEFAULT_BACKEND` | Backend used when a task does not specify one (`codex`, `claude-cli`, `gemini-cli`, `openai-api`, `anthropic-api`, `gemini-api`) | `codex` | No |
| `LOG_LEVEL` | NestJS log level (`fatal` / `error` / `warn` / `log` / `debug` / `verbose`) | `log` | No |
| `API_TIMEOUT_MS` | Timeout for API-backend HTTP requests | `120000` | No |

**CLI Backend Paths:**

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `CODEX_BIN_PATH` | Path to Codex binary | `codex` | No* |
| `CLAUDE_BIN_PATH` | Path to Claude Code binary | `claude` | No* |
| `GEMINI_BIN_PATH` | Path to Gemini CLI binary | `gemini` | No* |
| `GEMINI_DEFAULT_MODEL` | Default model passed to Gemini CLI via `-m` | `gemini-3-flash-preview` | No |

**API Backend Keys & Models:**

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `OPENAI_API_KEY` | OpenAI API key | - | No* |
| `OPENAI_DEFAULT_MODEL` | Default OpenAI model | `gpt-5.5` | No |
| `OPENAI_BASE_URL` | Override OpenAI API base URL (for proxies / Azure-compat) | - | No |
| `ANTHROPIC_API_KEY` | Anthropic API key | - | No* |
| `ANTHROPIC_DEFAULT_MODEL` | Default Anthropic model | `claude-sonnet-4-5-20250929` | No |
| `ANTHROPIC_BASE_URL` | Override Anthropic API base URL | - | No |
| `GEMINI_API_KEY` | Google Gemini API key | - | No* |
| `GEMINI_API_DEFAULT_MODEL` | Default Gemini API model | `gemini-3-flash-preview` | No |
| `GEMINI_API_BASE_URL` | Override Gemini API base URL | - | No |

*At least one backend (CLI or API) must be configured.

#### Web (`web/.env.local`)

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NEXT_PUBLIC_GATEWAY_URL` | Gateway API URL | `http://localhost:3000` | Yes |

## Development

### Project Structure

```
LLM-Remote-Runner/
├── gateway/          # NestJS backend API
│   ├── src/
│   │   ├── auth/     # Authentication module
│   │   ├── tasks/    # Task management module
│   │   └── config/   # Configuration
│   └── scripts/      # Setup scripts
├── web/              # Next.js frontend
│   ├── app/          # App Router pages
│   ├── components/   # React components
│   └── lib/          # Utilities and SDK wrapper
├── sdk/              # Shared TypeScript SDK
├── mobile/           # React Native app (experimental)
├── infra/            # Infrastructure config
└── docs/             # Documentation
```

### Testing

```bash
# Run gateway tests
pnpm --filter @codex/gateway test

# Run with coverage
pnpm --filter @codex/gateway test -- --coverage
```

### Building for Production

```bash
# Build all packages
pnpm build --recursive

# Build specific package
pnpm --filter @codex/gateway build
pnpm --filter @codex/web build
```
## Security Considerations
  
 ⚠️ **Important:** This application may execute arbitrary code via configured LLM backends (especially CLI tools like Codex). Follow these security practices:
  
  ### Development
  - ✅ Use strong passwords (16+ characters)
  - ✅ Keep `.env` files in `.gitignore`
  - ✅ Run on `localhost` only
  - ✅ Delete setup script after configuration
  
  ### Production
  - 🔒 **Use HTTPS** - Configure reverse proxy with SSL/TLS
  - 🔒 **Change all secrets** - Generate new JWT_SECRET and admin password
  - 🔒 **Restrict CORS** - Update allowed origins in `gateway/src/main.ts`
  - 🔒 **Use environment variables** - Not `.env` files (use Docker secrets, K8s secrets, etc.)
  - 🔒 **Firewall rules** - Restrict gateway port access
  - 🔒 **Regular updates** - Keep dependencies up to date
  - 🔒 **Monitor logs** - Watch for unauthorized access attempts
  
  > 📖 See [`docs/AUTHENTICATION.md`](docs/AUTHENTICATION.md) for comprehensive security guidance.

  ### Frontend dependency notes

  The web UI currently uses **React 18** and **Next.js 14** (see `web/package.json`). Known issues like **CVE-2025-55182**, which target **React 19.x Server Components** and frameworks embedding those RSC packages, do not apply to this setup.

  If you upgrade to **React 19 / Next 19** in the future, re-check the relevant security advisories and ensure you are on patched versions before deploying.
  
  ## Documentation

- **[AUTHENTICATION.md](docs/AUTHENTICATION.md)** - Authentication setup
- **[SECURITY.md](docs/SECURITY.md)** - Threat model, current mitigations, and open risks
- **[RUNNING.md](RUNNING.md)** - Detailed setup and API documentation
- **[docs/plan.md](docs/plan.md)** - Project planning and architecture
- **[docs/spec.md](docs/spec.md)** - Technical specifications
- **[ROADMAP.md](ROADMAP.md)** - Multi-provider roadmap and progress

## Troubleshooting

### "Authentication not configured" error

Run the setup script:
```bash
cd gateway
pnpm tsx scripts/setup-auth.ts
```

### Gateway won't start

Check that:
- Port 3000 is available
- All environment variables are set in `gateway/.env`
- Required CLI backends (for example, Codex, Claude Code, Gemini CLI) are installed and in PATH if you use them

### Web app can't connect to gateway

Verify:
- Gateway is running on port 3000
- `NEXT_PUBLIC_GATEWAY_URL` in `web/.env.local` is correct
- No CORS issues (check browser console)

### Task fails with "directory not found" or permission errors

The default workspace directory may not exist:
```bash
mkdir -p ~/llm-workspace
chmod 755 ~/llm-workspace
```

Or specify a different directory in the web UI workspace field.

### Per-backend issues

**Codex** — `command not found: codex`: confirm the binary is on the gateway process's `PATH`, or set `CODEX_BIN_PATH` to its absolute path. If tasks fail immediately with auth errors, run `codex auth` (the OAuth state lives in `~/.codex/`, which must be readable by the gateway user).

**Claude Code CLI** — if the task completes but the UI shows raw JSON like `{"result": "..."}`, the adapter's output parser didn't get JSON it could read; check that `claude --version` and `claude -p hi --output-format json` work directly. Long prompts can hit `ARG_MAX` on some platforms since prompts are passed via argv.

If `claude` itself errors with `claude native binary not installed` (postinstall did not run / platform-native optional dep was omitted, or a previous install left the stub in place), use the bundled repair script:

```bash
./scripts/fix-claude.sh
```

The script locates your global `@anthropic-ai/claude-code` install, deletes the JS stub at `bin/claude.exe` (so the package's `install.cjs` can't silently no-op on it), re-runs the postinstall, and verifies that `bin/claude.exe` is now a real native binary (ELF on Linux, Mach-O on macOS, PE on Windows — the `.exe` filename is constant across platforms by design). Safe to re-run; if everything is already healthy it exits without doing anything.

If you'd rather fix it by hand:

```bash
CLAUDE_PKG="$(npm root -g)/@anthropic-ai/claude-code"
rm -f "$CLAUDE_PKG/bin/claude.exe"
node "$CLAUDE_PKG/install.cjs"
file "$CLAUDE_PKG/bin/claude.exe"   # should report ELF/Mach-O/PE, not ASCII
```

This issue commonly recurs with pnpm 11+, `npm install -g --omit=optional`, or any install that skipped scripts. Set `enable-pre-post-scripts=true` in `~/.npmrc` (npm) or `pnpm config set side-effects-cache false` to reduce how often it happens on future installs.

**Gemini CLI** — `ModelNotFoundError` / `404`: set `GEMINI_DEFAULT_MODEL` to a model your account has access to (try `gemini-3-flash-preview` or `gemini-2.5-flash` if `gemini-3.1-pro-preview` returns 404), or pass `model` on the task. Confirmed working strings on CLI 0.42: `gemini-3.1-pro-preview`, `gemini-3-pro-preview`, `gemini-3-flash-preview`, `gemini-2.5-pro`, `gemini-2.5-flash`. Auth issues: the CLI uses `~/.gemini/` for OAuth state; if you're running the gateway as a different user, that directory must be readable by them. If you see "not running in a trusted directory" you're on an older adapter — make sure `--skip-trust` is being passed (it should be automatic since this commit).

**OpenAI / Anthropic / Gemini API** — `401` or `invalid api key` in the task output means the relevant `*_API_KEY` is missing or wrong. If you're behind a corporate proxy or hitting an Azure-compatible endpoint, set the matching `*_BASE_URL`.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [NestJS](https://nestjs.com/), [Next.js](https://nextjs.org/), and [Codex CLI](https://github.com/openai/codex-cli)
- Authentication powered by [bcrypt](https://github.com/kelektiv/node.bcrypt.js) and [Passport](http://www.passportjs.org/)
- UI styled with [TailwindCSS](https://tailwindcss.com/)


---

**Note:** At least one LLM backend (CLI or API) must be configured. See the Environment Variables section for setup details.
