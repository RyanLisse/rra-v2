# Troubleshooting Guide

This guide helps you resolve common issues during setup and development of the RAG Chat Application.

## Table of Contents
- [Setup Issues](#setup-issues)
- [Development Server Issues](#development-server-issues)
- [Database Issues](#database-issues)
- [Authentication Issues](#authentication-issues)
- [Document Processing Issues](#document-processing-issues)
- [Testing Issues](#testing-issues)
- [Build Issues](#build-issues)

## Setup Issues

### Bun Installation Fails

**Problem**: The automatic Bun installation script fails.

**Solutions**:
1. **Manual Installation (macOS/Linux)**:
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

2. **Using Homebrew (macOS)**:
   ```bash
   brew install oven-sh/bun/bun
   ```

3. **Windows Installation**:
   ```powershell
   powershell -c "irm bun.sh/install.ps1 | iex"
   ```

4. **PATH Issues**:
   If Bun is installed but not found, add to your shell configuration:
   ```bash
   # For bash (~/.bashrc)
   export BUN_INSTALL="$HOME/.bun"
   export PATH="$BUN_INSTALL/bin:$PATH"
   
   # For zsh (~/.zshrc)
   export BUN_INSTALL="$HOME/.bun"
   export PATH="$BUN_INSTALL/bin:$PATH"
   ```

### Node.js Version Too Old

**Problem**: Node.js version is below 18.0.0.

**Solution**:
1. Install Node.js 18+ from [nodejs.org](https://nodejs.org)
2. Or use nvm:
   ```bash
   nvm install 18
   nvm use 18
   ```

### Dependencies Installation Fails

**Problem**: `bun install` fails with network or permission errors.

**Solutions**:
1. **Clear Bun cache**:
   ```bash
   bun pm cache rm
   ```

2. **Remove lock file and retry**:
   ```bash
   rm bun.lockb
   bun install
   ```

3. **Network issues** - Check proxy settings:
   ```bash
   # If behind a proxy
   export HTTP_PROXY=http://your-proxy:port
   export HTTPS_PROXY=http://your-proxy:port
   ```

## Development Server Issues

### Server Won't Start

**Problem**: `bun dev` fails to start the development server.

**Solutions**:
1. **Port already in use**:
   ```bash
   # Find process using port 3000
   lsof -i :3000
   # Kill the process
   kill -9 <PID>
   ```

2. **Missing environment variables**:
   - Ensure `.env.local` exists
   - Check all required variables are set
   - Run `cp .env.example .env.local` if needed

3. **Module resolution errors**:
   ```bash
   # Clear Next.js cache
   rm -rf .next
   bun dev
   ```

### Health Check Fails

**Problem**: Server starts but health check returns errors.

**Solutions**:
1. **Check API keys**:
   - Ensure at least one AI provider API key is set (OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY)
   - Verify COHERE_API_KEY is set for embeddings

2. **Database connection**:
   - Verify POSTGRES_URL is correct
   - Ensure database is accessible
   - Check if pgvector extension is enabled

## Database Issues

### Migration Fails

**Problem**: `bun run db:migrate` fails with connection or syntax errors.

**Solutions**:
1. **Connection refused**:
   - Verify POSTGRES_URL format: `postgresql://user:password@host:port/database`
   - Check if database server is running
   - Verify network connectivity

2. **Permission denied**:
   - Ensure database user has CREATE TABLE permissions
   - Check if database exists

3. **PGVector extension missing**:
   ```sql
   -- Connect to your database and run:
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

### Drizzle Studio Won't Open

**Problem**: `bun run db:studio` fails to start.

**Solution**:
```bash
# Try with explicit port
bunx drizzle-kit studio --port 4983
```

## Authentication Issues

### Can't Sign In

**Problem**: Authentication fails with Better Auth.

**Solutions**:
1. **Missing BETTER_AUTH_SECRET**:
   ```bash
   # Generate a new secret
   openssl rand -base64 32
   # Add to .env.local
   BETTER_AUTH_SECRET=your_generated_secret
   ```

2. **OAuth Provider Issues**:
   - Verify GitHub/Google OAuth app credentials
   - Check redirect URLs match your domain
   - Ensure OAuth apps are not in test mode

## Document Processing Issues

### PDF Upload Fails

**Problem**: PDF files won't upload or process.

**Solutions**:
1. **File size too large**:
   - Default limit is 50MB
   - For larger files, update `MAX_FILE_SIZE` in upload route

2. **Invalid file type**:
   - Only PDF files are supported
   - Check file MIME type is `application/pdf`

3. **Storage directory missing**:
   ```bash
   mkdir -p uploads
   ```

### Text Extraction Fails

**Problem**: PDF text extraction returns errors.

**Solutions**:
1. **Corrupted PDF**:
   - Try opening the PDF in a viewer first
   - Re-save the PDF using a PDF editor

2. **Image-only PDF**:
   - Current implementation doesn't support OCR
   - Convert to text-based PDF first

## Testing Issues

### Vitest Not Running

**Problem**: `bun test` fails with module errors.

**Solutions**:
1. **Use npm/node for tests**:
   ```bash
   npm run test
   ```

2. **Clear test cache**:
   ```bash
   rm -rf node_modules/.vitest
   ```

### E2E Tests Fail

**Problem**: Playwright tests fail to run.

**Solutions**:
1. **Install browsers**:
   ```bash
   bunx playwright install
   ```

2. **Headless mode issues**:
   ```bash
   # Run with headed mode for debugging
   bunx playwright test --headed
   ```

## Build Issues

### Build Fails

**Problem**: `bun run build` fails with type or compilation errors.

**Solutions**:
1. **Type errors**:
   ```bash
   # Check TypeScript errors
   bunx tsc --noEmit
   ```

2. **Linting errors**:
   ```bash
   # Fix linting issues
   bun run lint
   ```

3. **Clear build cache**:
   ```bash
   rm -rf .next
   rm tsconfig.tsbuildinfo
   bun run build
   ```

### Production Build Won't Start

**Problem**: Built application fails to start in production.

**Solutions**:
1. **Run migrations first**:
   ```bash
   bun run db:migrate
   bun run build
   bun start
   ```

2. **Environment variables**:
   - Ensure all required variables are set in production
   - Don't commit `.env.local` to git

## Common Error Messages

### "Module not found"
```bash
# Solution: Reinstall dependencies
rm -rf node_modules bun.lockb
bun install
```

### "EADDRINUSE: address already in use"
```bash
# Solution: Kill process using the port
lsof -ti:3000 | xargs kill -9
```

### "ECONNREFUSED" (Database)
```bash
# Solution: Check database is running and accessible
psql $POSTGRES_URL -c "SELECT 1"
```

### "Invalid environment variables"
```bash
# Solution: Check all required variables
bun run check-env
```

## Getting Help

If you're still experiencing issues:

1. **Check logs**: Look for detailed error messages in the console
2. **GitHub Issues**: Search or create an issue in the repository
3. **Documentation**: Review the README.md and CLAUDE.md files
4. **Clean install**: Try a fresh clone and setup

## Quick Fixes Checklist

- [ ] Bun installed and in PATH
- [ ] Node.js 18+ installed
- [ ] `.env.local` exists with all required variables
- [ ] Database is accessible
- [ ] PGVector extension enabled
- [ ] No port conflicts on 3000
- [ ] Dependencies installed (`bun install`)
- [ ] Migrations run (`bun run db:migrate`)