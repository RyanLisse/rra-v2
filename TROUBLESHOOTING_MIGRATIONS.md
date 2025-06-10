# Database Migration Troubleshooting Guide

This guide helps resolve common Drizzle migration issues, particularly "table already exists" errors.

## Common Issues

### 1. "Table Already Exists" Error

**Error Message:**
```
LibsqlError: SQLITE_ERROR: table `account` already exists
```

**Cause:** This typically happens when:
- Database schema exists but migration state is out of sync
- Previous migrations weren't properly tracked
- Switching between development environments
- Manual database changes outside of migrations

**Solutions (in order of preference):**

#### Option 1: Automated Fix (Recommended)
```bash
# Use the built-in conflict resolver
bun run db:fix-conflicts

# Or run the script directly
./scripts/fix-migration-conflicts.sh
```

#### Option 2: Use Setup Script
```bash
# Run the full setup which includes safe migration handling
./SETUP.sh
```

#### Option 3: Force Schema Sync
```bash
# Push current schema to database (may lose migration history)
bun run db:push --force
```

#### Option 4: Nuclear Option (Last Resort)
```bash
# Clear all migrations and start fresh
bun run db:reset-migrations

# Then regenerate fresh migrations
bun run db:generate
```

### 2. PostgreSQL vs SQLite Mismatch

**Error:** Your error mentions SQLite but drizzle.config.ts shows PostgreSQL

**Solution:** Check your database configuration:
```bash
# Check which database you're actually connecting to
grep -r "DATABASE_URL\|POSTGRES_URL" .env*

# Verify drizzle config matches your actual database
cat drizzle.config.ts
```

### 3. Migration State Corruption

**Symptoms:**
- Migrations fail despite fresh database
- Schema drift warnings
- Tables exist but aren't tracked

**Solution:**
```bash
# Reset migration state
drizzle-kit introspect

# Or force push current schema
drizzle-kit push --force
```

## Prevention

### 1. Consistent Environment Setup
Always use the automated setup script:
```bash
./SETUP.sh
```

### 2. Proper Development Workflow
```bash
# 1. Make schema changes
edit lib/db/schema.ts

# 2. Generate migration
bun run db:generate

# 3. Apply migration (with conflict handling)
bun run db:migrate

# 4. Verify changes
bun run db:studio
```

### 3. Team Coordination
- Always pull latest migrations before creating new ones
- Use version control for migration files
- Document any manual database changes

## Advanced Troubleshooting

### Check Migration State
```bash
# List migration files
ls -la lib/db/migrations/

# Check database connection
bun run db:studio
```

### Manual Migration State Reset
```sql
-- For PostgreSQL
DROP TABLE IF EXISTS __drizzle_migrations;

-- For SQLite
DROP TABLE IF EXISTS __drizzle_migrations;
```

### Database-Specific Commands

#### PostgreSQL
```bash
# Introspect existing schema
drizzle-kit introspect

# Push schema without migrations
drizzle-kit push
```

#### SQLite
```bash
# Force schema sync
drizzle-kit push --force

# Generate migrations from existing schema
drizzle-kit generate
```

## Getting Help

If you continue to have issues:

1. Check the database configuration in `drizzle.config.ts`
2. Verify environment variables in `.env.local`
3. Run the automated setup: `./SETUP.sh`
4. Use the migration conflict resolver: `bun run db:fix-conflicts`

For persistent issues, consider starting with a fresh database and regenerating all migrations.