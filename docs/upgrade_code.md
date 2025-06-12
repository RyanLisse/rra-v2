# 🛠️ Code & Dependency Upgrade Guide

_Upgrade and migrate the RRA codebase safely and efficiently; prevent regressions, data loss, and outages._

## When Should You Upgrade?
- When new framework/library versions are released (e.g., Next.js, Bun, Drizzle ORM)
- After security advisories affecting dependencies
- When upgrading AI providers (OpenAI, Anthropic, Kinde, etc.)
- To refactor for new platform (serverless, cloud, Vercel)
- Before production deployments

---

## Step 1: Preparation & Preflight
- **Review**: Read CODEOWNERS, SYSTEM_ARCHITECTURE.md
- **Backup**: Export DB or use staging branch
- **Read Existing Issues/Docs**:
  - See prior critical issues (see appendix of this doc)

---

## Step 2: Upgrade Dependencies
- Use Bun for JavaScript/TypeScript deps:
  - `bun upgrade` to update all, or edit `package.json` for targeted upgrades
  - `bun install` after edits
- For Next.js and framework major upgrades:
  - Review [Next.js upgrade guide](https://nextjs.org/docs/upgrading)
  - Run all Vercel/serverless checks locally
- For Drizzle ORM/PGVector/Postgres updates:
  - Pin versions that affect schema format/migrations
  - Always review the migration files generated
- Update Tailwind, shadcn/ui:
  - Run `bun upgrade tailwindcss` and consult Tailwind/Changelog
  - Update component code if breaking changes

---

## Step 3: Database Migration Workflow
- Modify schema in `lib/db/schema.ts`
- Generate new migrations:
  - `bun run db:generate`
- Apply migrations safely:
  - `bun run db:migrate` (for dev/local)
  - Or use `./SETUP.sh` for automated staging/prod-safe migration
- If conflicts:
  - Use `bun run db:fix-conflicts` or `./scripts/fix-migration-conflicts.sh`
  - For nuclear option: `bun run db:reset-migrations`
- Review Drizzle Studio:
  - `bun run db:studio` to inspect DB after migration

---

## Step 4: Auth, Cloud & AI Provider Upgrades
- **Kinde**:
  - Consult [Kinde SDK changelogs](https://github.com/kinde-oss/kinde-auth-nextjs)
  - Never bypass official SDK in API routes (`app/api/auth/[kindeAuth]/route.ts`)
- **AI Provider/Model**:
  - Set correct API keys in `.env` or `.cursor/mcp.json`
  - Use `task-master models` or MCP to update model IDs
  - Match API changes (payloads/response schema) across all `lib/ai/`, `lib/auth/`, and `lib/services/`
- **Storage**:
  - Use cloud storage for documents/images (S3/GCS); never local only
  - Migrate uploads if moving provider

---

## Step 5: Test & Verification
- Run all core tests:
  - `bun test` for Vitest unit tests
  - `bun run test:e2e` for Playwright E2E
  - `bun run test:all` for complete coverage
- Confirm DB status and data retention
- Manually test upload, chat, auth, and search flows
- Roll back if breaking errors found

---

## Step 6: Document, Commit, Report
- Update docs and `.md` files to reflect new process or breaking changes
- Note any migration scripts or manual steps taken
- If you found/solved critical issues, describe in this file or append to the Issues section below

---

## ✨ Reference: Prior Critical Review Results
- Appendix: Major blockers, legacy issues and recurring migration patterns
- [See below for a summary of historic critical issues / typical upgrade mistakes]
- Always double-check for in-memory state, file system usage, or API auth flows if doing a major upgrade

---

## 📝 Appendix: Historic Critical Issues (Excerpted)

```
- Serverless incompatibility: in-memory Maps and local file storage
- Auth: Custom OAuth bypassing Kinde SDK, token manipulation
- DB: Unwrapped multi-step transactions; migration conflicts
- API: Mixed error formats, inconsistent auth wrappers, missing CORS
- Tests: Failing to mock Kinde SDK, missing env vars for E2E/DB
```

> For a full breakdown and remediation details, see previous codebase review (old section below, may be archived in future)

---

**Upgrade with care—reference this guide with each major change.**
