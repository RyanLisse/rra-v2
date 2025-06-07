# Technical Context

## Technology Stack

- **Frontend:** Next.js 15 (App Router) with React 19, TypeScript, Shadcn UI, TailwindCSS v4
- **Backend:** Next.js API Routes with TypeScript, NextAuth for authentication
- **Database:** NeonDB (PostgreSQL) with PGVector extension for vector storage
- **ORM:** Drizzle ORM with migration management and type safety
- **Runtime:** Bun for package management and development server
- **AI Services:** Google Gemini 2.5 Flash, Cohere embed-v4.0, Cohere Rerank v3.0
- **Deployment:** Vercel-ready with environment configuration

## Key Libraries & Frameworks

### Core Framework
- `next@15.3.0-canary.31` - Next.js with experimental PPR
- `react@19.0.0-rc` - Latest React with concurrent features
- `typescript@5.6.3` - Strict TypeScript configuration

### Database & ORM
- `drizzle-orm@0.34.0` - Type-safe database queries
- `drizzle-kit@0.25.0` - Migration management
- `postgres@3.4.4` - PostgreSQL client
- `@vercel/postgres@0.10.0` - Vercel PostgreSQL integration

### AI & Processing
- `ai@4.3.13` - Vercel AI SDK for streaming and tool calling
- `@ai-sdk/xai@1.2.15` - xAI Grok model integration
- `pdf-parse@1.1.1` - PDF text extraction
- `react-dropzone@14.3.8` - File upload interface

### UI & Styling
- `@radix-ui/*` - Headless UI components
- `tailwindcss@4.1.8` - Latest TailwindCSS with modern features
- `lucide-react@0.513.0` - Icon library
- `framer-motion@11.3.19` - Animations and interactions

### Development & Testing
- `@biomejs/biome@1.9.4` - Fast linting and formatting
- `vitest@3.2.2` - Unit testing framework
- `@playwright/test@1.50.1` - End-to-end testing
- `tsx@4.19.1` - TypeScript execution

### Authentication & Security
- `next-auth@5.0.0-beta.25` - Authentication framework
- `bcrypt-ts@5.0.2` - Password hashing

## Constraints & Limitations

### Performance Targets
- **Response Time**: < 3 seconds for chat responses
- **Concurrent Users**: Support 100+ simultaneous users
- **Document Processing**: < 5 minutes for typical documents
- **Cache Hit Rate**: 80%+ for embeddings and frequently accessed data

### Technical Constraints
- **File Size Limits**: 50MB per PDF/DOCX upload
- **Database**: PostgreSQL with PGVector extension required
- **Memory Usage**: Optimized for Vercel serverless functions
- **API Rate Limits**: Respect Google Gemini and Cohere API limits

### Browser Compatibility
- **Modern Browsers**: Chrome 90+, Firefox 90+, Safari 14+
- **Mobile Support**: Responsive design for tablets and phones
- **JavaScript Required**: No server-side rendering fallbacks for dynamic features

### Development Constraints
- **Code Quality**: < 500 lines per file, 80%+ test coverage
- **Build Time**: < 5 minutes for full build and test cycle
- **Bundle Size**: Optimized for fast initial page loads

## Secret Management Strategy

### Environment Variables
- **Local Development**: `.env.local` file (gitignored)
- **Production**: Vercel environment variables dashboard
- **Required Variables**:
  - `POSTGRES_URL` - NeonDB connection string
  - `NEXTAUTH_SECRET` - Authentication secret
  - `XAI_API_KEY` - xAI Grok API access
  - `COHERE_API_KEY` - Cohere embeddings and rerank
  - `GOOGLE_API_KEY` - Google Gemini access (future)

### Security Best Practices
- **No Hardcoded Secrets**: All sensitive data via environment variables
- **API Key Rotation**: Regular rotation strategy for production
- **Server-Side Only**: API keys never exposed to client-side code
- **Validation**: Environment variable validation on startup

### Development Workflow
```bash
# Local setup
cp .env.example .env.local
# Edit .env.local with actual credentials

# Production deployment
# Set environment variables in Vercel dashboard
# Variables automatically available to serverless functions
```

### Database Security
- **Connection Pooling**: Managed by NeonDB and Vercel
- **SSL/TLS**: Enforced connections to database
- **User Isolation**: Each user can only access their own documents
- **Input Sanitization**: Drizzle ORM prevents SQL injection
