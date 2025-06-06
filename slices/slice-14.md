Okay, we've made significant strides in processing documents for multimodal understanding, including a (real or simulated) Landing AI ADE step and generating both text and image embeddings.

The PRD mentions several aspects of "Enhanced Document Management" and "Visual Document Management" that we haven't fully addressed on the frontend yet. This slice will focus on building out the UI to manage and view uploaded documents, including their processing status and image previews.

---

### Slice 15: Frontend Document Management UI

**What You're Building:**
*   A new page or section in the application (e.g., `/documents`) to list all uploaded documents for the (mock) user.
*   Displaying key metadata for each document: original name, upload date, processing status (fetched from our status API or directly from the `documents` table via a server action), page count, image count.
*   Allowing users to view more details for a selected document, including a gallery or list of its extracted images (from the `document_images` table).
*   Providing an option to delete a document (which should trigger a backend call to remove the document, its files, and all associated DB records).

**Tasks:**

1.  **Create New Page/Route for Document Management** - Complexity: 1
    *   [ ] Create a new Next.js App Router page, e.g., `app/documents/page.tsx`.
    *   [ ] Add navigation to this page from the main layout (e.g., sidebar).
2.  **Backend: Server Action to List Documents** - Complexity: 2
    *   [ ] In `app/lib/chat/actions.tsx` (or a new `app/lib/documents/actions.tsx`):
        *   Create a server action `getManagedDocuments(userId?: string)` (using mock user ID for now).
        *   This action will query the `documents` table and join with `document_contents` (for page count) and potentially count images from `document_images`.
        *   Return an array of document objects with fields like: `id`, `originalName`, `status`, `createdAt`, `updatedAt`, `pageCount` (from `document_contents`), `imageCount`.
        ```typescript
        // Example query structure in the server action
        // const docs = await db.select({
        //   id: documentsTable.id,
        //   originalName: documentsTable.originalName,
        //   status: documentsTable.status,
        //   createdAt: documentsTable.createdAt,
        //   updatedAt: documentsTable.updatedAt,
        //   pageCount: documentContentsTable.pageCount,
        //   // To get imageCount, you might need a subquery or a separate query per document if complex
        //   // Or a left join and count, but be mindful of cartesian products if not careful.
        //   // Simpler: fetch image counts separately if needed, or if only a few docs are listed.
        // }).from(documentsTable)
        // .leftJoin(documentContentsTable, eq(documentsTable.id, documentContentsTable.documentId))
        // .where(eq(documentsTable.userId, targetUserId)) // User scoping
        // .orderBy(desc(documentsTable.updatedAt));
        // // Then, for each doc, potentially fetch image count:
        // // const imageCount = await db.select({ count: count() }).from(documentImagesTable)...
        ```
3.  **Frontend: Display Document List** - Complexity: 3
    *   [ ] In `app/documents/page.tsx`:
        *   Call the `getManagedDocuments` server action to fetch the list of documents.
        *   Use Shadcn UI's `Table` component ([https://ui.shadcn.com/docs/components/table](https://ui.shadcn.com/docs/components/table)) to display the documents.
        *   Columns: Original Name, Status, Uploaded Date, Page Count, Image Count, Actions (e.g., View Details, Delete).
        *   The "Status" column should clearly reflect the current processing state (e.g., "Uploading", "Processing Text", "Processing Images", "ADE Processing", "Embedding", "Completed", "Error").
    *   **Subtask 3.1:** Fetch data using the server action.
    *   **Subtask 3.2:** Implement the Shadcn `Table` with appropriate columns.
    *   **Subtask 3.3:** Style the table and make status display clear (e.g., using Badges).
4.  **Backend: Server Action to Get Document Details (including Images)** - Complexity: 2
    *   [ ] Create a server action `getDocumentDetails(documentId: string, userId?: string)`.
    *   [ ] This action fetches the specific document from `documents` table.
    *   [ ] It also fetches all associated images from `document_images` table ( `id`, `pageNumber`, `imagePath`).
    *   Return a combined object with document metadata and its list of images.
5.  **Frontend: Document Detail View (Modal or New Page)** - Complexity: 4
    *   [ ] When a user clicks "View Details" for a document in the list:
        *   Either navigate to a new page `app/documents/[documentId]/page.tsx` or open a Shadcn `Dialog` or `Sheet`.
        *   Fetch document details using `getDocumentDetails(documentId)`.
        *   Display document metadata.
        *   Display a gallery or list of its images. Each image should be rendered using the `/api/images/...` endpoint created in Slice 10.
        *   Consider using Shadcn's `Carousel` ([https://ui.shadcn.com/docs/components/carousel](https://ui.shadcn.com/docs/components/carousel)) or a simple grid for the image gallery.
    *   **Subtask 5.1:** Decide on modal vs. new page for details. Implement routing/trigger.
    *   **Subtask 5.2:** Fetch and display document metadata.
    *   **Subtask 5.3:** Implement image gallery using `Carousel` or grid, fetching images via API.
6.  **Backend: Server Action to Delete Document** - Complexity: 2
    *   [ ] Create a server action `deleteDocument(documentId: string, userId?: string)`.
    *   [ ] This action should:
        *   Delete records from `document_embeddings` (for this document).
        *   Delete records from `document_chunks` (for this document).
        *   Delete records from `document_images` (for this document).
        *   Delete records from `document_contents` (for this document).
        *   Finally, delete the record from `documents`. (Database `ON DELETE CASCADE` constraints on foreign keys will handle much of this automatically if set up correctly).
        *   **Crucially: Delete the actual files from the local filesystem** (original PDF, extracted text file, all page images). Be very careful with `fs.unlink` or `fs.rm`.
        *   Use `revalidatePath('/documents')` to refresh the list.
7.  **Frontend: Delete Document Functionality** - Complexity: 2
    *   [ ] Add a "Delete" button/icon to each row in the document list table (and/or in the detail view).
    *   [ ] On click, show a confirmation dialog (Shadcn `AlertDialog` - [https://ui.shadcn.com/docs/components/alert-dialog](https://ui.shadcn.com/docs/components/alert-dialog)).
    *   [ ] If confirmed, call the `deleteDocument` server action.
    *   [ ] Update the UI to reflect the deletion (table should refresh).
8.  **Polling for Status Updates (Optional Enhancement)** - Complexity: 2
    *   [ ] On the `/documents` page, for documents with a "processing" status, you could implement a simple polling mechanism (e.g., every 5-10 seconds) that calls the `/api/documents/[documentId]/status` API (from Slice 8) to update the status in the table live.
    *   Or, simply rely on page refresh/revalidation.
9.  **Write Tests**
    *   [ ] **Server Actions:** Unit test the DB logic and file deletion logic (mock `fs` and `db`). - Complexity: 2
    *   [ ] **Frontend Components:** Test rendering of the document table and detail view with mock data. Test delete confirmation flow. - Complexity: 2

**Code Example (`app/lib/documents/actions.tsx` - conceptual for `getManagedDocuments`):**
```typescript
// app/lib/documents/actions.tsx
'use server';
import { db } from '@/lib/db';
import {
  documents as documentsTable,
  documentContents as documentContentsTable,
  documentImages as documentImagesTable,
} from '@/lib/db/schema';
import { eq, desc, count as sqlCount } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import fs from 'fs/promises';
import path from 'path';

const MOCK_USER_ID = 'mock-user-123'; // Placeholder
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

export interface ManagedDocumentView {
  id: string;
  originalName: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  pageCount: number | null;
  imageCount: number;
}

export async function getManagedDocuments(userId?: string): Promise<ManagedDocumentView[]> {
  const targetUserId = userId || MOCK_USER_ID;
  try {
    const docsData = await db
      .select({
        id: documentsTable.id,
        originalName: documentsTable.originalName,
        status: documentsTable.status,
        createdAt: documentsTable.createdAt,
        updatedAt: documentsTable.updatedAt,
        pageCount: documentContentsTable.pageCount,
      })
      .from(documentsTable)
      .leftJoin(documentContentsTable, eq(documentsTable.id, documentContentsTable.documentId))
      .where(eq(documentsTable.userId, targetUserId)) // Ensure user scoping
      .orderBy(desc(documentsTable.updatedAt));

    const results: ManagedDocumentView[] = [];
    for (const doc of docsData) {
      const imageStats = await db
        .select({ value: sqlCount(documentImagesTable.id) })
        .from(documentImagesTable)
        .where(eq(documentImagesTable.documentId, doc.id));
      results.push({
        ...doc,
        imageCount: imageStats[0]?.value || 0,
      });
    }
    return results;
  } catch (error) {
    console.error("Error fetching managed documents:", error);
    return [];
  }
}

export interface DocumentDetailView extends ManagedDocumentView {
  filePath: string | null; // Original PDF path
  images: Array<{ id: string; pageNumber: number; imagePath: string }>;
}

export async function getDocumentDetails(documentId: string, userId?: string): Promise<DocumentDetailView | null> {
    const targetUserId = userId || MOCK_USER_ID;
    try {
        const docData = await db.query.documents.findFirst({
            where: (table, { and }) => and(eq(table.id, documentId), eq(table.userId, targetUserId)),
            with: {
                content: { columns: { pageCount: true } }, // from documentContents
                // Need a way to get images. Drizzle relations might help here if set up.
                // Or a separate query:
            }
        });

        if (!docData) return null;

        const images = await db.select({
            id: documentImagesTable.id,
            pageNumber: documentImagesTable.pageNumber,
            imagePath: documentImagesTable.imagePath,
        }).from(documentImagesTable)
          .where(eq(documentImagesTable.documentId, documentId))
          .orderBy(documentImagesTable.pageNumber);

        const imageCountResult = await db.select({ value: sqlCount() })
            .from(documentImagesTable)
            .where(eq(documentImagesTable.documentId, documentId));


        return {
            id: docData.id,
            originalName: docData.originalName,
            status: docData.status,
            createdAt: docData.createdAt,
            updatedAt: docData.updatedAt,
            pageCount: docData.content?.pageCount ?? null,
            imageCount: imageCountResult[0]?.value ?? 0,
            filePath: docData.filePath,
            images: images,
        };

    } catch (error) {
        console.error(`Error fetching details for document ${documentId}:`, error);
        return null;
    }
}


export async function deleteDocument(documentId: string, userId?: string): Promise<{ success: boolean; message?: string }> {
    const targetUserId = userId || MOCK_USER_ID;
    try {
        // 1. Get document details to find file paths for deletion
        const doc = await db.query.documents.findFirst({
            where: (table, { and }) => and(eq(table.id, documentId), eq(table.userId, targetUserId)),
            with: {
                content: true, // To get textFilePath
                images: true,  // To get imagePaths
            }
        });

        if (!doc) {
            return { success: false, message: "Document not found or access denied." };
        }

        // 2. Delete files from filesystem
        if (doc.filePath) {
            try { await fs.unlink(path.join(UPLOAD_DIR, path.basename(doc.filePath))); } // Assuming filePath is just basename in UPLOAD_DIR
            // More robust: if filePath is absolute and within UPLOAD_DIR: await fs.unlink(doc.filePath);
            // Or if it's relative: await fs.unlink(path.join(UPLOAD_DIR, doc.filePath));
            // For this example, let's assume doc.filePath is the full path.
            // Ensure path.isAbsolute(doc.filePath) and doc.filePath.startsWith(UPLOAD_DIR) for safety.
            if (path.isAbsolute(doc.filePath) && doc.filePath.startsWith(UPLOAD_DIR)) await fs.unlink(doc.filePath).catch(e => console.warn(`Failed to delete PDF ${doc.filePath}: ${e.message}`));
        }
        if (doc.content?.textFilePath) {
            if (path.isAbsolute(doc.content.textFilePath) && doc.content.textFilePath.startsWith(UPLOAD_DIR)) await fs.unlink(doc.content.textFilePath).catch(e => console.warn(`Failed to delete TXT ${doc.content.textFilePath}: ${e.message}`));
        }
        for (const img of doc.images) {
            if (path.isAbsolute(img.imagePath) && img.imagePath.startsWith(UPLOAD_DIR)) await fs.unlink(img.imagePath).catch(e => console.warn(`Failed to delete image ${img.imagePath}: ${e.message}`));
        }
        // Also delete the document-specific image directory if it exists and is empty
        const docImageDir = path.join(UPLOAD_DIR, documentId); // e.g., uploads/docId/images
         try {
            // Check if it's the specific image dir: uploads/documentId/images
            const specificImageDir = path.join(UPLOAD_DIR, documentId, 'images');
            const entries = await fs.readdir(specificImageDir);
            if (entries.length === 0) {
                await fs.rmdir(specificImageDir);
                // Now check and remove parent `documentId` dir if empty
                const parentEntries = await fs.readdir(path.join(UPLOAD_DIR, documentId));
                if (parentEntries.length === 0) {
                     await fs.rmdir(path.join(UPLOAD_DIR, documentId));
                }
            }
        } catch (e) {
            // Ignore if dir not found or not empty, or not the specific one we made
            if (e.code !== 'ENOENT' && e.code !== 'ENOTEMPTY' && e.code !== 'EEXIST') console.warn(`Could not clean up image directory for ${documentId}: ${e.message}`);
        }


        // 3. Delete from database (CASCADE should handle related tables)
        await db.delete(documentsTable)
            .where(eq(documentsTable.id, documentId)); // CASCADE will delete from other tables

        revalidatePath('/documents');
        return { success: true };
    } catch (error: any) {
        console.error(`Error deleting document ${documentId}:`, error);
        return { success: false, message: error.message };
    }
}
```

**Frontend (`app/documents/page.tsx` - conceptual Table and Delete):**
```typescript
// app/documents/page.tsx
// import { getManagedDocuments, deleteDocument, ManagedDocumentView } from '@/app/lib/documents/actions';
// import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
// import { Button } from "@/components/ui/button";
// import { TrashIcon, EyeOpenIcon } from '@radix-ui/react-icons'; // Or other icons
// import { AlertDialog, AlertDialogAction, AlertDialogCancel, ... } from "@/components/ui/alert-dialog";
// import Link from 'next/link'; // For View Details link to new page
// import { useState } from 'react'; // For managing AlertDialog open state

// export default async function DocumentsPage() {
//   const documents = await getManagedDocuments(); // User ID will be handled by action
//   // const [dialogOpen, setDialogOpen] = useState(false); // Can't use useState in Server Component
//   // For client-side interactions like AlertDialog, you'd need a client component.

//   return (
//     <div className="container mx-auto py-10">
//       <h1 className="text-3xl font-bold mb-6">Document Management</h1>
//       <Table>
//         <TableHeader>...</TableHeader>
//         <TableBody>
//           {documents.map((doc) => (
//             <TableRow key={doc.id}>
//               <TableCell>{doc.originalName}</TableCell>
//               <TableCell><Badge variant={doc.status === 'processed_embeddings' ? 'success' : 'outline'}>{doc.status}</Badge></TableCell>
//               {/* ... other cells ... */}
//               <TableCell>
//                 <Link href={`/documents/${doc.id}`} passHref> {/* If using a details page */}
//                   <Button variant="ghost" size="icon"><EyeOpenIcon /></Button>
//                 </Link>
//                 {/* Delete button would need to be in a client component or use server action with form */}
//                 {/* <DeleteDocumentButton documentId={doc.id} /> */}
//               </TableCell>
//             </TableRow>
//           ))}
//         </TableBody>
//       </Table>
//     </div>
//   );
// }

// Client component for delete button with confirmation
// components/delete-document-button.tsx
// 'use client';
// import { deleteDocument } from '@/app/lib/documents/actions';
// import { AlertDialog, ... } from "@/components/ui/alert-dialog";
// import { Button } from "@/components/ui/button";
// import { TrashIcon } from '@radix-ui/react-icons';
// import { useState } from 'react';
// import { useToast } from "@/components/ui/use-toast";

// export function DeleteDocumentButton({ documentId }: { documentId: string }) {
//   const [isOpen, setIsOpen] = useState(false);
//   const { toast } = useToast();
//   const handleDelete = async () => {
//     const result = await deleteDocument(documentId);
//     if (result.success) {
//       toast({ title: "Document deleted successfully." });
//       // Revalidation should refresh the list on the server component.
//       // If more immediate client-side update is needed, manage state or router.refresh().
//     } else {
//       toast({ title: "Error deleting document.", description: result.message, variant: "destructive" });
//     }
//     setIsOpen(false);
//   };
//   return ( <> <AlertDialog open={isOpen} onOpenChange={setIsOpen}> ... <AlertDialogAction onClick={handleDelete}>Confirm Delete</AlertDialogAction> ... </AlertDialog> <Button variant="ghost" size="icon" onClick={() => setIsOpen(true)}><TrashIcon /></Button> </> )
// }
```

**Ready to Merge Checklist:**
*   [ ] New `/documents` page created and accessible.
*   [ ] Server action `getManagedDocuments` fetches and returns document list with necessary metadata (name, status, counts).
*   [ ] Document list is displayed in a Shadcn `Table` on the `/documents` page. Status is clearly indicated.
*   [ ] Server action `getDocumentDetails` fetches specific document metadata and its associated image paths.
*   [ ] Document detail view (modal/page) displays metadata and a gallery of document images (fetched via `/api/images/...`).
*   [ ] Server action `deleteDocument` correctly deletes all database records (using CASCADE or explicit deletes) AND associated files from the local filesystem.
*   [ ] Frontend "Delete" button with `AlertDialog` confirmation calls `deleteDocument` and UI updates.
*   [ ] (Optional) Basic status polling implemented or considered.
*   [ ] All tests pass (bun test).
*   [ ] Linting passes (bun run lint).
*   [ ] Build succeeds (bun run build).
*   [ ] Code reviewed by senior dev.
*   [ ] Feature works as expected: Users can list, view details (including images), and delete uploaded documents.

**Quick Research (5-10 minutes):**
*   **Shadcn UI `Table`, `Dialog`, `Sheet`, `Carousel`, `AlertDialog`, `Badge`:** Review component APIs and examples.
*   **Next.js Server Actions:** For `getManagedDocuments`, `getDocumentDetails`, `deleteDocument`.
*   **Drizzle ORM Joins and Subqueries:** For efficiently fetching related counts (like imageCount).
*   **Node.js `fs` module for file deletion (`fs.unlink`, `fs.rm`, `fs.rmdir`):** Ensure you understand their behavior, especially with directories.
*   **Error handling with `fs` operations.**

**Need to Go Deeper?**
*   **Research Prompt:** *"I'm building a document management page in Next.js with Server Actions and Drizzle ORM. Show how to: 1. Fetch a list of documents with related counts (e.g., image count per document). 2. Implement a 'delete document' server action that removes database records (with CASCADE) AND deletes associated files (PDF, text, images) from the server's filesystem securely. How should the frontend trigger this delete action with a confirmation dialog using Shadcn UI?"*
*   **Research Prompt:** *"How can I display a gallery of images in a Next.js/React component using Shadcn UI's `Carousel` or a simple responsive grid, where image URLs are dynamically generated to call a backend API route that serves them from local storage?"*

**Questions for Senior Dev:**
*   [ ] For deleting files, what's the most robust way to handle potential errors during file system operations (e.g., file not found, permissions issues) after DB records might have already been deleted (or vice-versa)? (Transactions don't span DB and filesystem).
*   [ ] Is the current approach for getting `imageCount` (separate query per document) efficient enough for a list view, or should we optimize with a more complex SQL join/subquery from the start? (For a small number of docs per page, it's often fine; can optimize if it becomes a bottleneck).
*   [ ] For the document detail view, would a modal (`Dialog`/`Sheet`) or a separate page (`/documents/[id]`) be a better user experience? (Depends on amount of detail; modal is quicker, page is better for more content/actions).

---

This slice provides users with essential control over their uploaded documents and visibility into their processing, fulfilling a key part of the "Enhanced Document Management" requirement.