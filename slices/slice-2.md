Okay, we've successfully uploaded PDFs and extracted their raw text. Now, we need a proper place to store information about these documents and their content. According to the PRD, we'll be using **NeonDB (PostgreSQL with PGVector extension)** and **Drizzle ORM**.

This slice will focus on setting up the database connection, defining our initial database schemas with Drizzle ORM, and creating a way to record document metadata and its extracted text path.

---

### Slice 4: Database Setup (NeonDB, Drizzle ORM) & Basic Document Tracking

**What You're Building:**
*   Setting up a NeonDB instance.
*   Integrating Drizzle ORM into the project.
*   Defining initial Drizzle schemas for `documents` (metadata) and `document_contents` (to store extracted text or its path).
*   Modifying the backend to record document information in the database after upload and text extraction.

**Tasks:**

1.  **Set up NeonDB** - Complexity: 2
    *   [ ] Go to [https://neon.tech/](https://neon.tech/) and create a free account/project.
    *   [ ] Once your project is created, find your PostgreSQL connection string. It will look something like `postgresql://user:password@host:port/dbname`.
    *   [ ] Add this connection string to your `.env.local` file: `POSTGRES_CONNECTION_STRING="your_neon_connection_string"`.
    *   [ ] Make sure your NeonDB project has the `pgvector` extension enabled. (Neon usually enables it by default or provides an easy way to enable it via their SQL editor: `CREATE EXTENSION IF NOT EXISTS vector;`).
2.  **Install Drizzle ORM and PG Driver** - Complexity: 1
    *   [ ] Install Drizzle ORM and the PostgreSQL driver:
        `bun add drizzle-orm postgres`
        `bun add -D drizzle-kit pgtyped` (drizzle-kit for migrations, pgtyped is optional but good for type generation from SQL)
3.  **Configure Drizzle ORM** - Complexity: 2
    *   [ ] Create a `drizzle.config.ts` file in the project root:
        ```typescript
        // drizzle.config.ts
        import type { Config } from 'drizzle-kit';
        import * as dotenv from 'dotenv';
        dotenv.config({ path: '.env.local' }); // Ensure .env.local is loaded

        export default {
          schema: './lib/db/schema.ts',
          out: './drizzle', // Migration output directory
          driver: 'pg',
          dbCredentials: {
            connectionString: process.env.POSTGRES_CONNECTION_STRING!,
          },
          verbose: true,
          strict: true,
        } satisfies Config;
        ```
    *   [ ] Create a directory for your database schema: `mkdir -p lib/db`.
    *   [ ] Create `lib/db/schema.ts` for your table definitions.
    *   [ ] Create `lib/db/index.ts` to initialize Drizzle client.
4.  **Define Initial Database Schemas** - Complexity: 3
    *   [ ] In `lib/db/schema.ts`, define two initial tables using Drizzle syntax:
        *   `documents`: `id` (uuid, primary key), `fileName` (text), `originalName` (text), `filePath` (text, path to original PDF), `status` (text, e.g., "uploaded", "processing", "processed", "error"), `createdAt`, `updatedAt`.
        *   `document_contents`: `id` (uuid, primary key), `documentId` (uuid, foreign key to `documents.id`), `textFilePath` (text, path to extracted .txt file), `extractedText` (text, optional, maybe store short texts directly later), `pageCount` (integer, from pdf-parse), `charCount` (integer), `createdAt`.
    *   **Subtask 4.1:** Define the `documents` table schema. - Complexity: 2
    *   **Subtask 4.2:** Define the `document_contents` table schema with a foreign key to `documents`. - Complexity: 2
5.  **Initialize Drizzle Client** - Complexity: 1
    *   [ ] In `lib/db/index.ts`:
        ```typescript
        // lib/db/index.ts
        import { drizzle } from 'drizzle-orm/postgres-js';
        import postgres from 'postgres';
        import * as dotenv from 'dotenv';
        import *a schema from './schema'; // Import all schemas

        dotenv.config({ path: '.env.local' });

        if (!process.env.POSTGRES_CONNECTION_STRING) {
          throw new Error("POSTGRES_CONNECTION_STRING is not set in .env.local");
        }

        const client = postgres(process.env.POSTGRES_CONNECTION_STRING);
        // Use schema here if you want to pass all schemas explicitly
        export const db = drizzle(client, { schema });
        ```
6.  **Generate and Run Initial Migration** - Complexity: 2
    *   [ ] Add migration scripts to `package.json`:
        ```json
        "scripts": {
          // ... other scripts
          "db:generate": "drizzle-kit generate:pg",
          "db:migrate": "bun run scripts/migrate.ts", // We'll create this script
          "db:studio": "drizzle-kit studio" // Optional: for Drizzle Studio
        },
        ```
    *   [ ] Create `scripts/migrate.ts`:
        ```typescript
        // scripts/migrate.ts
        import { drizzle } from 'drizzle-orm/postgres-js';
        import { migrate } from 'drizzle-orm/postgres-js/migrator';
        import postgres from 'postgres';
        import * as dotenv from 'dotenv';

        dotenv.config({ path: '.env.local' });

        async function runMigrations() {
          if (!process.env.POSTGRES_CONNECTION_STRING) {
            throw new Error("POSTGRES_CONNECTION_STRING is not set for migrations");
          }
          console.log("Starting migrations...");
          const sql = postgres(process.env.POSTGRES_CONNECTION_STRING, { max: 1 });
          const db = drizzle(sql);

          await migrate(db, { migrationsFolder: './drizzle' });

          console.log("Migrations applied successfully!");
          await sql.end();
          process.exit(0);
        }

        runMigrations().catch((err) => {
          console.error("Migration failed:", err);
          process.exit(1);
        });
        ```
    *   [ ] Generate the migration: `bun run db:generate`. This will create SQL files in the `./drizzle` directory.
    *   [ ] Apply the migration: `bun run db:migrate`. Verify the tables are created in your NeonDB console.
7.  **Update Backend to Record Document Info** - Complexity: 3
    *   [ ] Modify `app/api/documents/upload/route.ts`:
        *   After a file is successfully saved locally, insert a record into the `documents` table. Store `fileName` (the unique name on disk), `originalName`, `filePath`, and set `status` to "uploaded".
        *   Return the `id` of the newly created document record in the API response.
    *   [ ] Modify `app/api/documents/extract-text/route.ts`:
        *   Expect the `documentId` (from the previous step's response) instead of or in addition to `filePath`.
        *   After text is successfully extracted and saved to a `.txt` file, insert a record into `document_contents` linking to the `documentId`. Store `textFilePath`, `pageCount`, `charCount`.
        *   Update the corresponding `documents` record's `status` to "text_extracted".
8.  **Write Tests** - Complexity: 2
    *   [ ] **Backend:** Unit tests for the new database interaction logic. You'll need to mock the `db` client from Drizzle.
    *   [ ] Test that records are created in `documents` and `document_contents` tables correctly.
    *   [ ] Test status updates.

**Code Example (`lib/db/schema.ts`):**
```typescript
// lib/db/schema.ts
import { pgTable, uuid, text, timestamp, integer, primaryKey } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  fileName: text('file_name').notNull(), // Name on disk
  originalName: text('original_name').notNull(), // Original user file name
  filePath: text('file_path').notNull(), // Path to the original PDF on server
  status: text('status').notNull().default('uploaded'), // e.g., uploaded, processing_text, text_extracted, embedding, processed, error
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdate(() => new Date()),
});

export const documentContents = pgTable('document_contents', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  textFilePath: text('text_file_path'), // Path to the extracted .txt file
  extractedText: text('extracted_text'), // Potentially store very short texts directly
  pageCount: integer('page_count'),
  charCount: integer('char_count'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Define relations (optional for now, but good practice)
export const documentsRelations = relations(documents, ({ one }) => ({
  content: one(documentContents, {
    fields: [documents.id],
    references: [documentContents.documentId],
  }),
}));

export const documentContentsRelations = relations(documentContents, ({ one }) => ({
  document: one(documents, {
    fields: [documentContents.documentId],
    references: [documents.id],
  }),
}));

// Export all schemas for Drizzle client
export default { documents, documentContents, documentsRelations, documentContentsRelations };
```

**Code Example (Update `app/api/documents/upload/route.ts` - partial):**
```typescript
// app/api/documents/upload/route.ts
// ... (imports: add db and documents schema)
import { db } from '@/lib/db';
import { documents as documentsTable } from '@/lib/db/schema';
// ...

export async function POST(req: NextRequest) {
  // ... (ensureUploadDirExists, formData parsing, file loop)
  const savedFileObjects = [];

  for (const file of files) {
    // ... (validation, file saving logic)
    // const filePath = path.join(UPLOAD_DIR, uniqueFilename);
    // await fs.writeFile(filePath, fileBuffer);

    // Insert into database
    try {
      const [newDocument] = await db.insert(documentsTable).values({
        fileName: uniqueFilename,
        originalName: file.name,
        filePath: filePath, // The path where PDF is saved
        status: 'uploaded',
      }).returning();

      savedFileObjects.push({
        documentId: newDocument.id, // Return the DB ID
        originalName: file.name,
        savedPath: filePath, // Still useful for immediate next steps like text extraction
        size: file.size
      });

    } catch (dbError) {
      console.error('DB insert error:', dbError);
      // Decide how to handle: skip this file, return partial success, or full error
      // For now, let's assume we'd collect errors and report
      // This could also mean we need to delete the physically saved file if DB fails
      await fs.unlink(filePath).catch(e => console.error("Failed to cleanup file after DB error", e)); // Cleanup
      // Continue to next file or throw error for the batch
      return NextResponse.json({ error: 'Failed to record document in database.' }, { status: 500 });
    }
  }

  // ... (rest of the function, adjust response to include documentId)
  return NextResponse.json({
      message: `${savedFileObjects.length} files uploaded and recorded successfully!`,
      files: savedFileObjects, // Now includes documentId
    }, { status: 200 });
}
```

**Code Example (Update `app/api/documents/extract-text/route.ts` - partial):**
```typescript
// app/api/documents/extract-text/route.ts
// ... (imports: add db, documentContents schema, documents schema)
import { db } from '@/lib/db';
import { documentContents as documentContentsTable, documents as documentsTable } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
// ...

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Expect documentId now, filePath can be retrieved from DB or still passed for convenience
    const { documentId, filePath: initialFilePath } = body;

    if (!documentId || typeof documentId !== 'string') {
      return NextResponse.json({ error: 'Document ID is required.' }, { status: 400 });
    }

    // Fetch document details from DB to get the PDF path if not directly passed
    const docRecord = await db.query.documents.findFirst({ where: eq(documentsTable.id, documentId) });
    if (!docRecord) {
        return NextResponse.json({ error: 'Document not found in database.' }, { status: 404 });
    }
    const pdfPathToProcess = docRecord.filePath; // Use path from DB for consistency

    // ... (file reading using pdfPathToProcess, pdf-parse logic)
    // const data = await pdf(fileBuffer);
    // const textFilePath = pdfPathToProcess.replace(/\.pdf$/i, '.txt');
    // await fs.writeFile(textFilePath, data.text);

    // Insert into document_contents and update documents status
    await db.transaction(async (tx) => {
      await tx.insert(documentContentsTable).values({
        documentId: documentId,
        textFilePath: textFilePath,
        pageCount: data.numpages,
        charCount: data.text.length,
      });

      await tx.update(documentsTable)
        .set({ status: 'text_extracted', updatedAt: new Date() })
        .where(eq(documentsTable.id, documentId));
    });

    return NextResponse.json({
      message: 'Text extracted and recorded successfully!',
      documentId: documentId,
      textFilePath: textFilePath,
      numPages: data.numpages,
    }, { status: 200 });

  } catch (error: any) {
    // ... (error handling)
    // If there's an error, consider setting document status to 'error_text_extraction'
    // if (documentId) {
    //   await db.update(documentsTable)
    //     .set({ status: 'error_text_extraction', updatedAt: new Date() })
    //     .where(eq(documentsTable.id, documentId_from_request_or_derived));
    // }
    return NextResponse.json({ error: 'Error extracting text or updating database.', details: error.message }, { status: 500 });
  }
}
```

**Frontend Update `components/file-uploader.tsx`:**
*   The `handleUpload` function will now receive `documentId` from the `/api/documents/upload` response.
*   It should pass this `documentId` to the `/api/documents/extract-text` request.

**Ready to Merge Checklist:**
*   [ ] NeonDB project created, connection string in `.env.local`. `pgvector` enabled.
*   [ ] Drizzle ORM installed and configured (`drizzle.config.ts`, `lib/db/index.ts`, `lib/db/schema.ts`).
*   [ ] Initial migration generated and applied successfully. Tables exist in NeonDB.
*   [ ] API routes for upload and text extraction correctly interact with the database (inserting/updating records).
*   [ ] Frontend passes `documentId` correctly between API calls.
*   [ ] All tests pass (bun test).
*   [ ] Linting passes (bun run lint).
*   [ ] Build succeeds (bun run build).
*   [ ] Code reviewed by senior dev.
*   [ ] Feature works as expected: Document metadata and text extraction info are saved in NeonDB.

**Quick Research (5-10 minutes):**
*   **NeonDB:** [https://neon.tech/docs/introduction](https://neon.tech/docs/introduction)
*   **Drizzle ORM:** [https://orm.drizzle.team/docs/overview](https://orm.drizzle.team/docs/overview) (Getting Started, Schema Declaration, Migrations).
*   **Drizzle `pgTable` syntax:** [https://orm.drizzle.team/docs/column-types/pg](https://orm.drizzle.team/docs/column-types/pg)
*   **Drizzle `insert`, `update`, `query` operations.**

**Need to Go Deeper?**
*   **Research Prompt:** *"I'm using Drizzle ORM with NeonDB (PostgreSQL) for the first time. Explain how to define schemas, generate migrations, and perform basic CRUD operations (insert, update, select). What are common pitfalls for a junior developer when working with ORMs and database migrations?"*

**Questions for Senior Dev:**
*   [ ] Are the chosen `status` enum values for documents sufficient for now? (`uploaded`, `text_extracted`, `error_text_extraction`).
*   [ ] Is the current error handling (e.g., cleaning up files on DB error, updating status to error) robust enough for this stage?
*   [ ] For the `filePath` and `textFilePath`, should we store absolute paths or paths relative to a base `UPLOAD_DIR`? (Currently absolute).

---

This is a big foundational slice! With the database in place, we're now ready to process the extracted text further (chunking) and then move towards generating and storing embeddings.