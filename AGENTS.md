# AGENTS.md

## Quick Setup
Run `./SETUP.sh` for automated environment setup with dependency installation and validation.
Run `bun validate:setup` to verify setup completeness and agent compatibility.

## Essential Commands
- `bun dev` - Start development server with Turbo mode
- `bun build` - Production build (includes automatic DB migration)
- `bun test` - Run Vitest unit tests  
- `bun test:e2e` - Run Playwright end-to-end tests
- `bun run lint` - Run ESLint + Biome linting with auto-fix
- `bun run db:migrate` - Apply database migrations
- `bun run db:studio` - Open database GUI

## Database Migration Troubleshooting
- `bun run db:fix-conflicts` - Fix "table already exists" errors
- `bun run db:reset-migrations` - Clear and regenerate all migrations (destructive)
- `./SETUP.sh` - Includes automatic migration conflict handling
- Migration errors are gracefully handled during automated setup

## Architecture Overview  
- **Type**: Next.js 15 + TypeScript RAG chat application
- **Database**: Drizzle ORM + PostgreSQL/PGVector (schema: `lib/db/schema.ts`)
- **Auth**: Kinde OAuth (`lib/auth/`) with session management
- **API**: Routes in `app/(chat)/api/` with authentication required
- **Pipeline**: upload → text_extracted → chunked → embedded → processed

## Development Guidelines
- Use Shadcn/UI components from `components/ui/`
- TypeScript strict mode + Zod runtime validation
- Biome for code formatting (replaces ESLint/Prettier)
- TailwindCSS v4 with custom design system
- Error handling via `ChatSDKError` class
- UUID primary keys with `defaultRandom()`

## Required Environment Variables
- `POSTGRES_URL` - NeonDB connection with PGVector support
- `KINDE_CLIENT_ID`, `KINDE_CLIENT_SECRET`, `KINDE_ISSUER_URL` - Kinde authentication
- AI Provider Keys: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`

## Multi-Agent Domains
- Frontend: React components and UI (`components/`, `app/`)
- Backend: API routes and business logic (`app/(chat)/api/`)
- Document: PDF processing and text extraction (`lib/document-processing/`)
- AI/RAG: Embeddings and vector operations (`lib/ai/`, `lib/search/`)
- Testing: Quality assurance (`tests/`, Playwright, Vitest)
