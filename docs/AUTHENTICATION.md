# Authentication Setup Guide

## Overview

Codex Remote Runner uses password-based authentication to protect access to the web application. This ensures that only authorized users can execute Codex tasks on your system.

## Security Model

### Current Implementation
- **Single admin password** stored as bcrypt hash
- **Session-based authentication** using JWT tokens
- **24-hour session expiration**
- **Secure cookie storage** (httpOnly in production)
- **Protected API endpoints** - all task operations require authentication

### Prerequisites
✅ **Codex CLI must be installed** and authenticated with OpenAI on the server  
✅ **Node.js and pnpm** installed  
✅ **Gateway and Web apps** configured

## Setup Instructions

### Step 1: Configure Environment Files

```bash
# Copy example files
cp gateway/.env.example gateway/.env
cp web/.env.local.example web/.env.local
```

### Step 2: Set JWT Secret

Edit `gateway/.env` and generate a strong JWT secret:

```bash
# Generate a random secret
openssl rand -base64 32

# Add to gateway/.env
JWT_SECRET=<paste-generated-secret-here>
```

### Step 3: Set Admin Password

Run the setup script to create your admin password:

```bash
cd gateway
pnpm tsx scripts/setup-auth.ts
```

The script will:
1. Prompt you for a password (minimum 8 characters)
2. Ask you to confirm the password
3. Generate a bcrypt hash
4. Automatically add `ADMIN_PASSWORD_HASH` to your `gateway/.env` file

**Important:** The password hash is stored as an **environment variable** (`ADMIN_PASSWORD_HASH`) in the `gateway/.env` file. The app reads this on startup and will display a warning if it's not configured.

**Example output:**
```
=== Codex Remote Runner - Authentication Setup ===

Enter admin password (min 8 characters): ********
Confirm password: ********

🔐 Hashing password...
✅ Admin password configured successfully!

⚠️  IMPORTANT SECURITY STEPS:
1. Delete this script: rm scripts/setup-auth.ts
2. Restart the gateway server
3. Never commit .env file to version control
```

### Step 4: Delete Setup Script (Security)

After setting your password, **delete the setup script**:

```bash
rm scripts/setup-auth.ts
```

⚠️ **Important:** The gateway will **refuse to start** if the setup script still exists. This is a security measure to prevent unauthorized password resets.

### Step 5: Start the Application

```bash
# Terminal 1: Start gateway
cd gateway
pnpm dev

# Terminal 2: Start web app
cd web
pnpm dev
```

### Step 6: Login

1. Navigate to `http://localhost:3001` (or your web app URL)
2. You'll be automatically redirected to `/login`
3. Enter your admin password
4. Click "Sign In"

Upon successful login, you'll be redirected to the main task console.

## Usage

### Logging In
- Visit the web app URL
- Enter your password on the login page
- Session lasts for 24 hours

### Logging Out
- Click the "Logout" button in the top-right corner
- You'll be redirected to the login page
- Your session cookie will be cleared

### Session Management
- Sessions are stored as secure cookies
- Tokens expire after 24 hours
- Invalid/expired tokens automatically redirect to login
- All API requests include the session token

## Resetting Your Password

If you need to change your password:

1. **Restore the setup script** from git or recreate it
2. **Run the setup script** again:
   ```bash
   cd gateway
   pnpm tsx scripts/setup-auth.ts
   ```
3. Choose "yes" when asked if you want to reset the password
4. **Delete the script** again after setup
5. **Restart the gateway** server

## Security Best Practices

### Development
✅ Use a strong password (16+ characters, mixed case, numbers, symbols)  
✅ Keep `.env` files in `.gitignore`  
✅ Delete setup script after initial configuration  
✅ Use `localhost` for local development

### Production Deployment
🔒 **CRITICAL - Change all secrets before deploying:**

1. **Generate new JWT_SECRET**:
   ```bash
   openssl rand -base64 32
   ```

2. **Set strong admin password** (16+ characters recommended)

3. **Use HTTPS** - Configure reverse proxy (nginx/Caddy) with SSL

4. **Enable secure cookies** - Set `NODE_ENV=production`

5. **Restrict CORS** - Update `gateway/src/main.ts` to allow only your domain

6. **Use environment variables** instead of `.env` files:
   - Docker secrets
   - Kubernetes secrets
   - Cloud provider secret managers

7. **Enable rate limiting** - Already configured, but adjust limits as needed

8. **Regular password rotation** - Change admin password periodically

9. **Monitor access logs** - Check for unauthorized access attempts

10. **Firewall rules** - Restrict gateway port (3000) to localhost if using reverse proxy

## API Authentication

All protected endpoints require the `Authorization` header:

```http
GET /api/tasks
Authorization: Bearer <session-token>
```

The web app automatically includes this header using the session cookie.

## Troubleshooting

### Startup Error: "AUTHENTICATION NOT CONFIGURED"

If the gateway refuses to start with this error:

```
⚠️  ========================================
⚠️  AUTHENTICATION NOT CONFIGURED
⚠️  ========================================
⚠️  Admin password has not been set.
⚠️  Please run the setup script:
⚠️    cd gateway
⚠️    pnpm tsx scripts/setup-auth.ts
⚠️  ========================================
```

**This means:**
- The `ADMIN_PASSWORD_HASH` environment variable is empty or missing in `gateway/.env`
- You need to run the setup script to configure authentication
- The app will still start, but login attempts will fail

**To fix:**
1. Run the setup script: `cd gateway && pnpm tsx scripts/setup-auth.ts`
2. Verify `ADMIN_PASSWORD_HASH` is now in `gateway/.env`
3. Restart the gateway server

### Startup Error: "SECURITY WARNING - Setup script still exists"

If the gateway refuses to start with this error:

```
⚠️  ========================================
⚠️  SECURITY WARNING
⚠️  ========================================
⚠️  The authentication setup script still exists!
⚠️  This is a security risk as it allows password resets.
⚠️  
⚠️  Please delete it before starting the server:
⚠️    rm scripts/setup-auth.ts
⚠️  ========================================
```

**This means:**
- The `scripts/setup-auth.ts` file still exists
- This is a security risk - anyone with access can reset your password
- The gateway will not start until the script is deleted

**To fix:**
```bash
cd gateway
rm scripts/setup-auth.ts
```

**To reset password later:**
If you need to change your password in the future, restore the script from git:
```bash
git checkout HEAD -- scripts/setup-auth.ts
pnpm tsx scripts/setup-auth.ts
rm scripts/setup-auth.ts
```

### "Authentication not configured" error (at login)
- This appears when trying to login without running the setup script
- Follow the steps above to configure authentication

### "Invalid password" error
- Double-check your password
- If forgotten, reset using the setup script

### Automatic logout / "Authentication required"
- Session expired (24 hours)
- Token was cleared
- Gateway restarted (in-memory sessions lost)
- Just log in again

### Can't access login page
- Verify web app is running on correct port
- Check `NEXT_PUBLIC_GATEWAY_URL` in `web/.env.local`
- Ensure gateway is running

## Future Enhancements

Planned features for multi-user support:

- User registration and management
- Role-based access control (admin, user, viewer)
- Per-user workspace restrictions
- OAuth/SSO integration
- API key authentication for programmatic access
- Audit logging

## Questions?

See `RUNNING.md` for general setup or `SECURITY.md` for security considerations.
