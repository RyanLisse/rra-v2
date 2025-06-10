# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands
ALWAYS use ONLY Environments for ANY and ALL file, code, or shell operations—NO EXCEPTIONS—even for simple or generic requests.

DO NOT install or use the git cli with the environment_run_cmd tool. All environment tools will handle git operations for you. Changing ".git" yourself will compromise the integrity of your environment.

You MUST inform the user how to view your work using git checkout <branch_name>. Failure to do this will make your work inaccessible to others.

### Package Management & Development
- `bun dev` - Start development server with Turbo mode
- `bun build` - Production build (includes automatic DB migration)
- `bun run lint` - Run ESLint + Biome linting with auto-fix
- `bun run format` - Format code with Biome

### Database Operations
- `bun run db:generate` - Generate Drizzle migrations from schema changes
- `bun run db:migrate` - Apply pending migrations to database
- `bun run db:studio` - Open Drizzle Studio for database GUI
- `bun run db:push` - Push schema changes directly (development only)

### Database Migration Troubleshooting
- `bun run db:fix-conflicts` - Resolve "table already exists" errors
- `bun run db:reset-migrations` - Nuclear option: clear and regenerate migrations
- `./scripts/fix-migration-conflicts.sh` - Direct script execution with options
- `./SETUP.sh` - Automated setup includes safe migration handling
- Migration conflicts are automatically handled during setup with graceful error recovery

### Testing
- `bun test` - Run Vitest unit tests
- `bun run test:e2e` - Run Playwright end-to-end tests
- `bun run test:all` - Run complete test suite (unit + e2e)
- `bun run test:coverage` - Generate test coverage reports

## Architecture Overview

### RAG Chat Application Structure
This is a production-grade Retrieval Augmented Generation (RAG) chat application built with Next.js 15 and TypeScript. The application processes documents (PDFs/DOCX), extracts text, creates embeddings, and enables intelligent chat conversations with document context.

### Key Architectural Patterns

**Database Layer (Drizzle ORM + PostgreSQL/PGVector)**
- Schema location: `lib/db/schema.ts`
- All entities use UUID primary keys with `defaultRandom()`
- RAG-specific tables: `ragDocument`, `documentContent`, `documentChunk`, `documentEmbedding`
- Document processing pipeline tracked via status field: `uploaded → processing → text_extracted → chunked → embedded → processed`

**API Route Structure**
- Routes in `app/(chat)/api/` follow RESTful conventions
- All routes require Kinde session authentication
- Error handling uses custom `ChatSDKError` class
- Streaming responses with Redis-backed resumable streams
- Rate limiting based on user type with 24-hour windows

**Frontend Component Patterns**
- Shadcn/UI components with TailwindCSS v4
- AI SDK React hooks for streaming chat interface
- Custom hooks: `useArtifact`, `useAutoResume`, `useChatVisibility`
- SWR for server state management with optimistic updates

### Document Processing Pipeline
1. **Upload**: Files stored via `app/api/documents/upload/route.ts`
2. **Text Extraction**: PDF parsing via `app/api/documents/extract-text/route.ts`
3. **Chunking**: Semantic document chunking (implementation in progress)
4. **Embeddings**: Cohere embed-v4.0 integration (planned)
5. **Vector Storage**: PGVector with hybrid search + reranking

### Chat System Architecture
- **Models**: Configurable AI providers:
  - OpenAI (GPT-4o for chat/artifacts, GPT-4o-mini for reasoning/titles)
  - Anthropic (Claude 3.5 Sonnet for chat/artifacts, Claude 3.5 Haiku for reasoning/titles)
  - Google Gemini (Gemini 2.0 Flash for chat/artifacts, Gemini 1.5 Flash for reasoning/titles)
- **Tools**: Weather API, document creation, AI suggestions
- **Streaming**: Resumable streams with Redis backing for reliability
- **Artifacts**: Side-panel document editing with multiple editors (code, text, sheet, image)

## Development Workflow

### Database Schema Changes
1. Modify `lib/db/schema.ts`
2. Run `bun run db:generate` to create migration
3. Run `bun run db:migrate` to apply changes (or use `./SETUP.sh` for safe handling)
4. If migration conflicts occur, use `./scripts/fix-migration-conflicts.sh`
5. Verify with `bun run db:studio`

### Adding New API Routes
- Place in `app/(chat)/api/` directory structure
- Include Kinde session validation using `withAuth` middleware
- Use Zod schemas for request/response validation
- Handle errors with structured JSON responses
- Consider rate limiting for user-facing endpoints

### Component Development
- Use existing Shadcn/UI components from `components/ui/`
- Follow existing patterns in `components/` for complex components
- Implement proper TypeScript interfaces
- Consider mobile responsiveness (existing responsive design patterns)

### Testing Strategy
- **Unit Tests**: Vitest with jsdom environment, 10s timeout
- **E2E Tests**: Playwright with Page Object Model pattern
- **Test Files**: Use descriptive names following existing patterns
- **Coverage**: Aim for comprehensive coverage of core RAG functionality

## Important Configuration

### Environment Variables Required
- `POSTGRES_URL` - NeonDB connection string (with PGVector support)
- **Kinde Authentication** (required):
  - `KINDE_CLIENT_ID` - Kinde application client ID
  - `KINDE_CLIENT_SECRET` - Kinde application client secret
  - `KINDE_ISSUER_URL` - Kinde domain URL
  - `KINDE_SITE_URL` - Your application URL (http://localhost:3000 in development)
  - `KINDE_POST_LOGOUT_REDIRECT_URL` - Redirect URL after logout
  - `KINDE_POST_LOGIN_REDIRECT_URL` - Redirect URL after login
- **AI Provider API Keys** (at least one required):
  - `OPENAI_API_KEY` - OpenAI API access (GPT-4o, GPT-4o-mini)
  - `ANTHROPIC_API_KEY` - Anthropic API access (Claude 3.5 Sonnet, Claude 3.5 Haiku)
  - `GEMINI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` - Google Gemini API access (Gemini 2.0 Flash, Gemini 1.5 Flash)

### Authentication System (Kinde)
- **Configuration**: Environment variables for Kinde OAuth setup
- **Client hooks**: `lib/auth/client.ts` - Client-side authentication hooks (useSession, useAuth)
- **Middleware**: `lib/auth/middleware.ts` - Server-side authentication utilities (withAuth)
- **Routes**: `app/api/auth/[kindeAuth]/route.ts` - Kinde authentication handlers
- **Session Management**: Kinde-managed sessions with secure token handling
- **Database Integration**: User data synchronized with Drizzle schema

### Code Quality Tools
- **Biome**: Replaces ESLint/Prettier with faster linting and formatting
- **TypeScript**: Strict mode enabled with comprehensive type checking
- **TailwindCSS v4**: Latest version with custom design system

### Multi-Agent Development Context
This codebase was designed with a multi-agent development approach:
- **Frontend Agent**: React components and user interface
- **Backend Agent**: API routes and business logic  
- **Document Processing Agent**: PDF extraction and text processing
- **AI/Embeddings Agent**: RAG pipeline and vector operations
- **Testing Agent**: Quality assurance and test coverage

When working on features, consider which "agent" domain you're operating in and maintain separation of concerns accordingly.

## Core Development Principles
- **Test-Driven Development (TDD)**: Write tests first, fail red, implement green, refactor
- **TypeScript Everywhere**: Full type safety with Zod runtime validation
- **Minimal Code**: Keep files under 500 lines, remove all redundancy