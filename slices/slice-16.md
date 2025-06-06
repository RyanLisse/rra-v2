Remembering...## Slice 17: User Authentication with Better Auth

**What You're Building:**
*   Migrating from NextAuth.js to Better Auth for improved type safety and modern authentication
*   Setting up Better Auth with Drizzle adapter for database-backed sessions
*   Configuring OAuth providers (GitHub, Google) and optional email/password authentication
*   Protecting API routes and server actions with Better Auth middleware
*   Updating frontend to use Better Auth hooks and components
*   Implementing user-scoped data access for conversations and documents

**Tasks:**

### 1. **Install Better Auth and Dependencies** - Complexity: 1
```bash
bun add better-auth
bun add @better-auth/client
```

### 2. **Configure Better Auth with Drizzle** - Complexity: 4
Create `lib/auth/auth.ts`:
```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg", // PostgreSQL for NeonDB
    schema: {
      // Map Better Auth tables to your schema
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true, // Optional: Enable email/password auth
    requireEmailVerification: false, // Set to true in production
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // Update session every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // Cache for 5 minutes
    },
  },
  advanced: {
    // CSRF protection enabled by default
    generateId: false, // Let database handle ID generation
    cookiePrefix: "better-auth",
    baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  },
  // Customization hooks
  hooks: {
    after: [
      {
        matcher(context) {
          return context.path === "/signup";
        },
        async handler(context) {
          // Log new user signups for analytics
          console.log("New user signed up:", context.body.user);
        },
      },
    ],
  },
});

// Export type-safe auth client
export type Auth = typeof auth;
```

### 3. **Create Database Schema for Auth Tables** - Complexity: 3
Update `lib/db/schema.ts`:
```typescript
import { pgTable, text, timestamp, uuid, boolean, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Better Auth tables
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false),
  name: text("name"),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"), // For email/password auth
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const verifications = pgTable("verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Update existing tables to reference users
export const conversationsTable = pgTable("conversations", {
  // ... existing fields ...
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const documentsTable = pgTable("documents", {
  // ... existing fields ...
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

// Define relations
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  conversations: many(conversationsTable),
  documents: many(documentsTable),
}));
```

**Subtask 3.1:** Generate and run migration for auth tables:
```bash
bun run db:generate
bun run db:migrate
```

### 4. **Set Up API Route Handler** - Complexity: 2
Create `app/api/auth/[...all]/route.ts`:
```typescript
import { auth } from "@/lib/auth/auth";
import { toNextJsHandler } from "better-auth/next-js";

// Better Auth provides a Next.js adapter
export const { GET, POST } = toNextJsHandler(auth);
```

### 5. **Create Client-Side Auth Configuration** - Complexity: 2
Create `lib/auth/auth-client.ts`:
```typescript
import { createAuthClient } from "@better-auth/client";
import type { Auth } from "./auth";

export const authClient = createAuthClient<Auth>({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
});

// Export typed hooks
export const {
  signIn,
  signUp,
  signOut,
  useSession,
  useActiveOrganization,
  useSessions,
} = authClient;
```

### 6. **Update Frontend with Auth UI Components** - Complexity: 3
Create `components/auth/auth-button.tsx`:
```typescript
"use client";

import { Button } from "@/components/ui/button";
import { signIn, signOut, useSession } from "@/lib/auth/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, User } from "lucide-react";

export function AuthButton() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <Button disabled>Loading...</Button>;
  }

  if (session) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-10 w-10 rounded-full">
            <Avatar className="h-10 w-10">
              <AvatarImage src={session.user.image || ""} alt={session.user.name || ""} />
              <AvatarFallback>
                {session.user.name?.charAt(0).toUpperCase() || 
                 session.user.email?.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuItem className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{session.user.name}</p>
              <p className="text-xs leading-none text-muted-foreground">
                {session.user.email}
              </p>
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => signOut()}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>Sign In</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuItem onClick={() => signIn.social({ provider: "github" })}>
          Sign in with GitHub
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => signIn.social({ provider: "google" })}>
          Sign in with Google
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => {
          // Navigate to email/password sign in page
          window.location.href = "/auth/signin";
        }}>
          Sign in with Email
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### 7. **Protect Server Actions and API Routes** - Complexity: 4
Create `lib/auth/session.ts` for server-side auth:
```typescript
import { auth } from "./auth";
import { headers } from "next/headers";
import { cache } from "react";

// Cache the session for the duration of the request
export const getSession = cache(async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  
  if (!session) {
    return null;
  }
  
  return {
    user: session.user,
    session: session.session,
  };
});

// Helper to require authentication
export async function requireAuth() {
  const session = await getSession();
  
  if (!session) {
    throw new Error("Unauthorized");
  }
  
  return session;
}
```

Update server actions in `app/lib/chat/actions.tsx`:
```typescript
import { requireAuth } from "@/lib/auth/session";

export async function getChats() {
  const { user } = await requireAuth();
  
  try {
    const conversations = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.userId, user.id))
      .orderBy(desc(conversationsTable.createdAt));
    
    return conversations;
  } catch (error) {
    console.error("Failed to get chats:", error);
    return [];
  }
}

export async function saveChat(chat: {
  id: string;
  title: string;
  messages: Array<Message>;
}) {
  const { user } = await requireAuth();
  
  const messageCount = countCoreMessages(chat.messages);
  
  try {
    await db.insert(conversationsTable).values({
      id: chat.id,
      userId: user.id, // Use authenticated user ID
      title: chat.title,
      messages: chat.messages,
      messageCount,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("Failed to save chat:", error);
    throw error;
  }
}
```

**Subtask 7.1:** Update all server actions to use `requireAuth()`
**Subtask 7.2:** Update document upload API route:
```typescript
// app/api/documents/upload/route.ts
import { requireAuth } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  const { user } = await requireAuth();
  
  // ... existing upload logic ...
  
  // Use authenticated user ID when creating document
  const newDocument = await db
    .insert(documentsTable)
    .values({
      userId: user.id,
      name: originalName,
      filePath,
      // ... other fields ...
    });
    
  // Include userId in Inngest event
  await inngest.send({
    name: "event/document.uploaded",
    data: { 
      documentId: newDocument.id, 
      filePath, 
      originalName,
      userId: user.id,
    },
  });
}
```

### 8. **Create Email/Password Sign In Page** - Complexity: 2
Create `app/auth/signin/page.tsx`:
```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await signIn.email({
        email,
        password,
        callbackURL: "/",
      });
      router.push("/");
    } catch (error) {
      toast.error("Invalid email or password");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle>Sign In</CardTitle>
          <CardDescription>
            Enter your email and password to sign in
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

### 9. **Add Environment Variables** - Complexity: 1
Update `.env.local`:
```bash
# Better Auth
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=your-secret-key-here # Generate with: openssl rand -base64 32

# OAuth Providers
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

### 10. **Write Tests** - Complexity: 2
Create `lib/auth/__tests__/auth.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSession, requireAuth } from "../session";

// Mock Better Auth
vi.mock("../auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

describe("Auth Session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return session when authenticated", async () => {
    const mockSession = {
      user: { id: "123", email: "test@example.com" },
      session: { token: "abc" },
    };
    
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);
    
    const session = await getSession();
    expect(session).toEqual(mockSession);
  });

  it("should throw error when not authenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    
    await expect(requireAuth()).rejects.toThrow("Unauthorized");
  });
});
```

**Ready to Merge Checklist:**
- [ ] Better Auth installed with Drizzle adapter configured
- [ ] Database schema updated with auth tables and migrations run
- [ ] API route handler set up at `/api/auth/[...all]`
- [ ] Client-side auth configured with typed hooks
- [ ] Frontend UI includes working sign in/out functionality
- [ ] OAuth providers (GitHub, Google) configured and tested
- [ ] Email/password authentication working (if enabled)
- [ ] All server actions and API routes protected with `requireAuth()`
- [ ] User data properly scoped to authenticated users
- [ ] Inngest events include userId for user-scoped operations
- [ ] Environment variables configured
- [ ] All tests pass (`bun test`)
- [ ] Linting passes (`bun run lint`)
- [ ] Build succeeds (`bun run build`)
- [ ] Code reviewed by senior dev

**Quick Research (5-10 minutes):**
- **Better Auth Documentation:** https://www.better-auth.com/docs/introduction
- **Better Auth Drizzle Adapter:** https://www.better-auth.com/docs/adapters/drizzle
- **Migration Guide from NextAuth:** https://www.better-auth.com/docs/guides/next-auth-migration-guide
- **Better Auth with Next.js App Router:** https://www.better-auth.com/docs/integrations/next-js

**Need to Go Deeper?**
- **Research Prompt:** *"I'm migrating from NextAuth.js to Better Auth in my Next.js 14 App Router application. Explain how to: 1. Set up Better Auth with Drizzle adapter for PostgreSQL. 2. Configure OAuth providers and email/password authentication. 3. Protect server actions using Better Auth session helpers. 4. Access user information in both client and server components. What are the key differences from NextAuth.js?"*

- **Research Prompt (Advanced Features):** *"How do I implement advanced Better Auth features like: 1. Two-factor authentication (2FA). 2. Organizations and team management. 3. Custom session properties. 4. Rate limiting for auth endpoints. Show examples with the Drizzle adapter."*

**Questions for Senior Dev:**
- [ ] Should we enable email verification for email/password signups immediately or add it in a later slice?
- [ ] Do we need organization/team features for multi-tenant support, or keep it single-tenant for now?
- [ ] Should we implement refresh token rotation for enhanced security in this slice?

---

Better Auth provides superior type safety, modern architecture, and better performance compared to NextAuth.js. The migration sets up a solid foundation for authentication with full database backing through Drizzle, preparing the application for production use.