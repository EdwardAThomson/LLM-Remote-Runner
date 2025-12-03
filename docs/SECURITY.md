# Security Considerations

## Sensitive Files (DO NOT COMMIT)

The following files contain sensitive information and are excluded via `.gitignore`:

### Environment Files
- `gateway/.env` - Contains JWT secret and system paths
- `web/.env.local` - Contains JWT token
- Any `.env*.local` files

### What's Sensitive?

1. **JWT_SECRET** (`gateway/.env`)
   - Used to sign authentication tokens
   - If exposed, attackers can forge valid tokens
   - **Action**: Change to a strong random value in production
   - Generate with: `openssl rand -base64 32`

2. **NEXT_PUBLIC_AUTH_TOKEN** (`web/.env.local`)
   - Valid JWT token for API access
   - If exposed, anyone can execute Codex tasks on your system
   - **Action**: Regenerate periodically, especially if exposed

3. **CODEX_BIN_PATH** (`gateway/.env`)
   - Reveals your system paths
   - Not critical but better kept private

4. **DEFAULT_WORKSPACE** (`gateway/.env`)
   - Reveals your file system structure
   - Not critical but better kept private

## Safe to Commit

- `.env.example` files (templates with placeholder values)
- All source code
- Documentation
- Configuration files (package.json, tsconfig.json, etc.)

## Setup for New Users

1. Copy example files:
   ```bash
   cp gateway/.env.example gateway/.env
   cp web/.env.local.example web/.env.local
   ```

2. Generate a strong JWT secret:
   ```bash
   openssl rand -base64 32
   ```

3. Update `gateway/.env` with:
   - Your JWT secret
   - Path to Codex binary
   - Your workspace directory

4. Generate a JWT token:
   ```bash
   cd gateway
   node -e "const jwt = require('@nestjs/jwt'); const service = new jwt.JwtService({ secret: 'YOUR_SECRET_HERE' }); const token = service.sign({ sub: 'user-id', name: 'User Name' }, { issuer: 'codex-remote-runner', expiresIn: '30d' }); console.log(token);"
   ```

5. Update `web/.env.local` with the generated token

## Production Deployment

### Critical Actions

1. **Change JWT_SECRET** to a strong random value
2. **Use HTTPS** for all connections
3. **Implement proper authentication** (current setup uses a single shared token)
4. **Restrict CORS** origins in `gateway/src/main.ts`
5. **Add rate limiting** per user (currently global)
6. **Validate workspace paths** against an allowlist
7. **Set token expiration** appropriately
8. **Use environment-specific secrets** (don't reuse dev secrets)

### Recommended: Use Environment Variables

Instead of `.env` files in production, use:
- Docker secrets
- Kubernetes secrets
- Cloud provider secret managers (AWS Secrets Manager, GCP Secret Manager, etc.)
- Environment variables from your deployment platform

## Current Security Model

⚠️ **This is a development setup** with a single shared JWT token.

For production, you should:
- Implement user registration/login
- Generate tokens per user
- Store user credentials securely
- Add token refresh mechanism
- Implement proper authorization (who can access which workspaces)

## Reporting Security Issues

If you discover a security vulnerability, please email [your-email] instead of opening a public issue.
