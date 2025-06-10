# RAG Chat Application (RRA_V2)

[![CI](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/RyanLisse/rra-v2/main/.github/badges/ci.json)](https://github.com/RyanLisse/rra-v2/actions/workflows/ci.yml)
[![Build](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/RyanLisse/rra-v2/main/.github/badges/build.json)](https://github.com/RyanLisse/rra-v2/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/RyanLisse/rra-v2/main/.github/badges/typescript.json)](https://github.com/RyanLisse/rra-v2)
[![Dependencies](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/RyanLisse/rra-v2/main/.github/badges/dependencies.json)](https://github.com/RyanLisse/rra-v2)

A production-grade Retrieval Augmented Generation (RAG) chat application built with Next.js 15, TypeScript, and Neon PostgreSQL.

## Features

- 🤖 **Multi-Provider AI Support**: OpenAI, Anthropic, Google Gemini
- 📄 **Document Processing**: PDF/DOCX extraction with intelligent chunking
- 🔍 **Vector Search**: PGVector-powered semantic search with reranking
- 💬 **Streaming Chat**: Real-time responses with artifact generation
- 🔐 **Authentication**: Better-auth with guest support
- 🧪 **Comprehensive Testing**: Unit, integration, E2E with isolated test environments
- 🚀 **CI/CD Pipeline**: Automated testing, linting, and build verification

## Quick Start

### Prerequisites

- Node.js 20+ or Bun
- PostgreSQL with PGVector extension (or Neon account)
- At least one AI provider API key

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/rra-v2.git
cd rra-v2

# Install dependencies
bun install

# Copy environment variables
cp .env.example .env.local

# Set up database
bun run db:migrate

# Start development server
bun dev
```

### Environment Variables

```bash
# Database (Neon)
POSTGRES_URL=postgresql://...
NEON_API_KEY=your-api-key        # For CI/CD
NEON_PROJECT_ID=your-project-id  # For CI/CD

# Authentication
BETTER_AUTH_SECRET=random-secret-string
BETTER_AUTH_URL=http://localhost:3000

# AI Providers (at least one required)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...

# Optional Services
REDIS_URL=redis://...
UPSTASH_REDIS_URL=https://...
```

## Development

### Commands

```bash
# Development
bun dev              # Start dev server
bun build            # Production build
bun start            # Start production server

# Database
bun db:generate      # Generate migrations
bun db:migrate       # Run migrations
bun db:studio        # Open Drizzle Studio

# Testing
bun test             # Run unit tests
bun test:e2e         # Run E2E tests
bun test:all         # Run all tests

# Linting & Formatting
bun lint             # Run linter
bun format           # Format code
```

### Project Structure

```
├── app/                    # Next.js app directory
│   ├── (auth)/            # Auth pages
│   ├── (chat)/            # Main chat interface
│   └── api/               # API routes
├── components/            # React components
├── lib/                   # Core libraries
│   ├── ai/               # AI providers & tools
│   ├── auth/             # Authentication
│   ├── db/               # Database & migrations
│   └── search/           # Vector search
├── tests/                # Test suites
├── scripts/              # CLI utilities
└── .github/workflows/    # CI/CD pipelines
```

## CI/CD Pipeline

### Automated Testing

Every PR gets:
- Isolated Neon test branch
- Parallel test execution
- Performance benchmarking
- Automatic cleanup

### PR Commands

Comment on PRs to run commands:
- `/test` - Run all tests
- `/test unit` - Run unit tests
- `/test e2e` - Run E2E tests
- `/test performance` - Run benchmarks
- `/reset-db` - Reset test database
- `/seed-data [preset]` - Seed test data

### GitHub Secrets Required

```yaml
NEON_API_KEY          # Neon API key
NEON_PROJECT_ID       # Neon project ID
NEON_DATABASE_URL     # Main branch database URL
SLACK_WEBHOOK_URL     # Optional: Slack notifications
```

## Testing

### Test Structure

```bash
tests/
├── unit/          # Unit tests
├── integration/   # Integration tests
├── e2e/          # End-to-end tests
├── performance/   # Performance tests
└── fixtures/      # Test data & utilities
```

### Running Tests

```bash
# Run all tests
bun test

# Run specific test suite
bun test tests/unit
bun test tests/integration
bun test tests/e2e

# Run with coverage
bun test:coverage

# Run in watch mode
bun test --watch
```

### Test Isolation

Tests run in isolated Neon branches:
- Automatic branch creation
- Fresh database per test run
- Parallel execution support
- Automatic cleanup

## Architecture

### RAG Pipeline

1. **Document Upload**: Multi-format support (PDF, DOCX)
2. **Text Extraction**: Intelligent content extraction
3. **Chunking**: Semantic text splitting
4. **Embedding**: Vector generation with multiple models
5. **Storage**: PGVector with hybrid search
6. **Retrieval**: Semantic search with reranking
7. **Generation**: Multi-provider AI responses

### Key Technologies

- **Frontend**: Next.js 15, React 19, TailwindCSS v4
- **Backend**: Node.js, Drizzle ORM, Better-auth
- **Database**: PostgreSQL with PGVector (Neon)
- **AI/ML**: OpenAI, Anthropic, Google Gemini, Cohere
- **Testing**: Vitest, Playwright, MSW
- **CI/CD**: GitHub Actions, Neon Branching

## Performance

### Optimization Strategies

- Intelligent test sharding
- Pre-warmed database branches
- Multi-level caching
- Selective test execution
- Resource right-sizing

### Benchmarks

| Operation | Target | Current |
|-----------|--------|---------|
| Document Upload (5MB) | < 2s | ~1.5s |
| Vector Search | < 100ms | ~80ms |
| Chat Response (TTFT) | < 500ms | ~400ms |
| Test Suite (Full) | < 10min | ~8min |

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Write tests first (TDD)
4. Commit changes (`git commit -m 'feat: add amazing feature'`)
5. Push branch (`git push origin feature/amazing-feature`)
6. Open Pull Request

### Commit Convention

Follow conventional commits:
- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation
- `test:` Test additions/changes
- `perf:` Performance improvements
- `chore:` Maintenance tasks

## Troubleshooting

### Common Issues

1. **Database Connection**
   ```bash
   # Check connection
   psql $POSTGRES_URL -c "SELECT version();"
   ```

2. **Test Failures**
   ```bash
   # Run with debug logs
   DEBUG=* bun test
   ```

3. **Build Errors**
   ```bash
   # Clear caches
   rm -rf .next node_modules
   bun install
   ```

See [docs/](./docs/) for detailed guides:
- [CI/CD Setup](./docs/ci-cd-setup.md)
- [Testing with Neon](./docs/testing-with-neon.md)
- [Troubleshooting](./docs/ci-cd-troubleshooting.md)
- [Performance Optimization](./docs/performance-optimization.md)

## License

MIT License - see [LICENSE](./LICENSE) for details

## Acknowledgments

- Next.js team for the amazing framework
- Neon for PostgreSQL branching
- Vercel AI SDK for streaming capabilities
- All contributors and testers