Okay, this is an excellent project! We'll break this down into manageable vertical slices, making sure each step is clear for a junior developer. We'll leverage the Vercel AI Chatbot as our foundation and progressively integrate the powerful features outlined in your PRD.

Here's the step-by-step implementation guide:

## Implementation Guide: RAG Chat Application

This guide will walk you through building the RAG Chat Application in vertical slices. Each slice delivers a complete piece of functionality.

**Base Repository:** We will use [https://github.com/vercel/ai-chatbot](https://github.com/vercel/ai-chatbot) as our starting point.
**UI Components:** We'll use [Shadcn UI](https://ui.shadcn.com/docs) and [Shadcn Dropzone](https://shadcn-dropzone.vercel.app/docs) for UI elements.
**Package Manager:** We will use `bun`.

---

### Slice 0: Project Setup & Initialization

**What You're Building:** Setting up the development environment, cloning the base chatbot, and configuring it to use `bun`.

**Tasks:**

1.  **Environment Setup** - Complexity: 1
    *   [ ] Install `bun` on your system if you haven't already. (Visit [https://bun.sh/](https://bun.sh/) for instructions).
    *   [ ] Install `git`.
2.  **Clone Base Repository** - Complexity: 1
    *   [ ] Open your terminal.
    *   [ ] Clone the Vercel AI Chatbot: `git clone https://github.com/vercel/ai-chatbot.git rag-chat-app`
    *   [ ] Navigate into the project directory: `cd rag-chat-app`
3.  **Switch to `bun`** - Complexity: 2
    *   [ ] Delete `pnpm-lock.yaml` (or `yarn.lock` / `package-lock.json` if present).
    *   [ ] Install dependencies using bun: `bun install`.
    *   [ ] Update `package.json` scripts to use `bun` instead of `pnpm` (e.g., `"dev": "bun --bun next dev"`). Check all scripts.
4.  **Initial Run & Test** - Complexity: 1
    *   [ ] Copy `.env.example` to `.env.local`: `cp .env.example .env.local`.
    *   [ ] You'll need an OpenAI API key for the base chatbot to run initially. Add your `OPENAI_API_KEY` to `.env.local`. (We will replace this with Google Gemini later).
        *   If you don't have one, you can temporarily modify the API route `app/api/chat/route.ts` to return a hardcoded stream or message to ensure the frontend runs.
    *   [ ] Start the development server: `bun run dev`.
    *   [ ] Open your browser to `http://localhost:3000` and verify the basic chatbot interface loads.
5.  **Makefile Setup (Optional but Recommended)** - Complexity: 2
    *   [ ] Create a `Makefile` in the project root.
    *   [ ] Add common commands to the `Makefile`:
        ```makefile
        .PHONY: install dev build lint test clean

        install:
        	bun install

        dev:
        	bun run dev

        build:
        	bun run build

        lint:
        	bun run lint # Assuming a lint script exists or will be added

        # Add a placeholder test script for now if one doesn't exist
        # test:
        # bun test

        clean:
        	rm -rf .next
        	rm -rf node_modules
        	rm -f bun.lockb

        setup: clean install build
        ```
    *   [ ] Test a make command: `make dev`.
6.  **BiomeJS Integration (Code Quality Foundation)** - Complexity: 3
    *   [ ] Add BiomeJS: `bun add --dev @biomejs/biome`.
    *   [ ] Initialize BiomeJS: `bunx @biomejs/biome init`. This will create a `biome.json` configuration file.
    *   [ ] Add Biome scripts to `package.json`:
        ```json
        "scripts": {
          // ... other scripts
          "lint": "bunx @biomejs/biome lint ./",
          "format": "bunx @biomejs/biome format --write ./",
          "check": "bunx @biomejs/biome check --apply ./"
        },
        ```
    *   [ ] Update `Makefile` if you added a lint script:
        ```makefile
        lint:
        	bun run format
        	bun run lint
        ```
    *   [ ] Run `bun run format` and `bun run lint` to check the initial setup.

**Ready to Merge Checklist:**
*   [ ] Project clones and installs dependencies with `bun install`.
*   [ ] `bun run dev` starts the application successfully.
*   [ ] Basic chatbot UI is visible in the browser.
*   [ ] `Makefile` commands (if implemented) work.
*   [ ] BiomeJS is installed and basic `format` and `lint` commands run.

**Quick Research (5-10 minutes):**
*   **Bun:** [https://bun.sh/docs](https://bun.sh/docs)
*   **Vercel AI Chatbot Structure:** Browse the cloned repository folders like `app/`, `components/`, `lib/`.
*   **BiomeJS:** [https://biomejs.dev/docs/introduction/](https://biomejs.dev/docs/introduction/)

**Questions for Senior Dev:**
*   [ ] Are there any specific configurations in `biome.json` we should set up for this project?
*   [ ] Is the initial `.env.local` setup sufficient for now?

---

### Slice 1: Document Upload UI with Shadcn Dropzone

**What You're Building:** A UI component on the chat page (or a new dedicated page) that allows users to select and upload PDF files using `shadcn-dropzone`. For now, we'll just display the selected file names.

**Tasks:**

1.  **Install Shadcn UI & Dropzone Component** - Complexity: 2
    *   [ ] Initialize Shadcn UI if not already present in the base (the Vercel AI Chatbot likely uses it). Follow `bunx shadcn-ui@latest init` if needed.
    *   [ ] Add the `Dropzone` component from `shadcn-dropzone`. The docs suggest a manual copy-paste or a CLI if available for `shadcn-dropzone` components. Refer to [https://shadcn-dropzone.vercel.app/docs](https://shadcn-dropzone.vercel.app/docs).
        *   Typically, this involves creating a new file like `components/ui/dropzone.tsx` and pasting the code. Ensure you install any peer dependencies it might have (e.g., `react-dropzone`). `bun add react-dropzone`.
2.  **Create Upload Area in UI** - Complexity: 3
    *   [ ] Decide where to place the upload component. For simplicity, let's try adding it to the main chat page (`app/page.tsx`) or create a simple new page/modal.
    *   [ ] Import and use the `Dropzone` component.
    *   [ ] Implement a state to hold the selected files (`File[]`).
    *   [ ] Display the names of the selected files below the dropzone.
    *   [ ] Add a button "Upload Selected Files" (it won't do anything yet).
    *   **Subtask 2.1:** Create a new React component, e.g., `components/file-uploader.tsx`. - Complexity: 1
    *   **Subtask 2.2:** Integrate `shadcn-dropzone` into `file-uploader.tsx` to select files. - Complexity: 2
    *   **Subtask 2.3:** Display selected file names and an inert upload button. - Complexity: 1
3.  **Styling** - Complexity: 2
    *   [ ] Ensure the dropzone looks good and is responsive. Use Tailwind CSS classes.
4.  **Write Tests** - Complexity: 2
    *   [ ] Basic component rendering test for `FileUploader`.
    *   [ ] Test that selecting a file updates the displayed file names (using simulated file events if needed).
    *   (Note: Setting up Vitest might be its own sub-task if not already in the base project. The PRD mentions Vitest). If Vitest is not set up, skip an actual test run but write down what you would test.

**Code Example (Illustrative `components/file-uploader.tsx`):**
```typescript
// components/file-uploader.tsx
'use client';

import { useState } from 'react';
import { Dropzone, FileMosaic } from "@files-ui/react"; // Assuming this is the import from shadcn-dropzone or its underlying lib
// ^^^ IMPORTANT: The shadcn-dropzone docs (https://shadcn-dropzone.vercel.app/docs) show manual creation.
// The actual import might be: import { UploadCloudIcon, FileIcon, XIcon } from "lucide-react";
// And you'd use the custom Dropzone component you created based on their guide.
// For this example, I'll use the structure from their example page.

// Let's assume you've created components/ui/dropzone.tsx as per shadcn-dropzone docs.
import { Input } from "@/components/ui/input" // Example, actual component from shadcn-dropzone needed
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/use-toast" // If you want notifications

// A more realistic dropzone import based on shadcn-dropzone's manual setup guide
// would be something like:
// import { FileUploadDropzone } from '@/components/ui/file-upload-dropzone'; // Your custom component

export function FileUploader() {
  const [files, setFiles] = useState<File[]>([]);

  const handleFilesChange = (newFiles: File[]) => {
    setFiles(newFiles);
  };

  const handleUpload = () => {
    if (files.length === 0) {
      toast({ title: "No files selected", description: "Please select files to upload." });
      return;
    }
    // In future slices, this will call an API
    toast({ title: "Upload initiated (mock)", description: `${files.length} files: ${files.map(f => f.name).join(', ')}` });
    console.log('Uploading files:', files);
  };

  // This JSX will depend heavily on how you implemented the shadcn-dropzone component
  // Refer to: https://shadcn-dropzone.vercel.app/docs for the structure
  // The example below is a simplified representation.

  return (
    <div className="p-4 border rounded-lg">
      <h2 className="text-lg font-semibold mb-2">Upload Your Documents (PDF only)</h2>
      {/* Replace with your actual shadcn-dropzone component instance */}
      {/* For example: <FileUploadDropzone onFilesAdded={handleFilesChange} /> */}
      <div
        className="flex items-center justify-center w-full p-6 border-2 border-dashed rounded-md cursor-pointer border-gray-300 hover:border-gray-400"
        onClick={() => document.getElementById('fileInput')?.click()} // Simple click trigger
      >
        <div className="text-center">
          <p className="text-sm text-gray-500">Drag & drop PDF files here, or click to select</p>
          <Input
            id="fileInput"
            type="file"
            className="hidden"
            accept=".pdf"
            multiple
            onChange={(e) => handleFilesChange(Array.from(e.target.files || []))}
          />
        </div>
      </div>

      {files.length > 0 && (
        <div className="mt-4">
          <h3 className="text-md font-medium">Selected Files:</h3>
          <ul className="list-disc pl-5 mt-1">
            {files.map((file, index) => (
              <li key={index} className="text-sm">{file.name} ({ (file.size / 1024).toFixed(2) } KB)</li>
            ))}
          </ul>
        </div>
      )}
      <Button onClick={handleUpload} className="mt-4" disabled={files.length === 0}>
        Upload Selected Files (Mock)
      </Button>
    </div>
  );
}
```

**Ready to Merge Checklist:**
*   [ ] All tests pass (bun test) - *or tests written if runner not set up*.
*   [ ] Linting passes (bun run lint).
*   [ ] Build succeeds (bun run build).
*   [ ] Code reviewed by senior dev.
*   [ ] Feature works as expected: Can select PDF files, see their names, and the mock upload button is present.

**Quick Research (5-10 minutes):**
*   **Official Docs:** [https://shadcn-dropzone.vercel.app/docs](https://shadcn-dropzone.vercel.app/docs)
*   **Examples:** The `shadcn-dropzone` site has examples.
*   **React `useState` for managing file lists:** [https://react.dev/reference/react/useState](https://react.dev/reference/react/useState)
*   **Handling file inputs in React:** Search for "React file input multiple"

**Need to Go Deeper?**
*   **Research Prompt:** *"I'm building a file upload component in Next.js with Shadcn UI and `react-dropzone` (which `shadcn-dropzone` might use or guide). What are the key concepts for handling file objects, updating state, and common pitfalls for junior developers?"*

**Complexity Guide:**
*   **1-2:** Simple changes, copy existing patterns.
*   **3:** New feature, requires understanding docs.
*   **4-5:** Complex logic, needs senior developer help.

**Questions for Senior Dev:**
*   [ ] Is `components/file-uploader.tsx` the right place for this, or should it be integrated differently into `app/page.tsx`?
*   [ ] What's the best way to handle styling for the dropzone to match the rest of the Vercel AI Chatbot theme?
*   [ ] Are there any accessibility considerations I should be aware of for file dropzones?

---
### Slice 2: Backend API for Document Upload (Saving Locally)

**What You're Building:** A Next.js API route that accepts PDF file uploads and saves them to a temporary local directory on the server.

**Tasks:**

1.  **Create API Route for Upload** - Complexity: 3
    *   [ ] Create a new API route: `app/api/documents/upload/route.ts`.
    *   [ ] Implement a `POST` handler in this route.
    *   [ ] This handler should expect `multipart/form-data`.
    *   **Subtask 1.1:** Define the basic API route structure for `POST` requests. - Complexity: 1
    *   **Subtask 1.2:** Research how to parse `multipart/form-data` in Next.js API routes (e.g., using `formidable` or new built-in Next.js features if available). - Complexity: 2
2.  **Process Uploaded Files** - Complexity: 3
    *   [ ] In the API handler, access the uploaded file(s).
    *   [ ] For each file, save it to a designated temporary local folder (e.g., `uploads/` in the project root - ensure this folder is in `.gitignore`).
    *   [ ] Generate a unique filename or use the original, being careful about overwrites or special characters.
    *   [ ] Return a success response with file details (e.g., saved path, original name, size).
    *   **Subtask 2.1:** Read file data from the parsed form. - Complexity: 1
    *   **Subtask 2.2:** Implement file saving logic using Node.js `fs` module (e.g., `fs.promises.writeFile`). - Complexity: 2
    *   **Subtask 2.3:** Handle potential errors during file saving (e.g., disk full, permissions). - Complexity: 2
3.  **Connect Frontend to Backend** - Complexity: 2
    *   [ ] Modify `components/file-uploader.tsx`.
    *   [ ] When the "Upload Selected Files" button is clicked, create a `FormData` object.
    *   [ ] Append the selected files to the `FormData`.
    *   [ ] Make a `POST` request to `/api/documents/upload` using `fetch`.
    *   [ ] Handle the API response (success/error) and display a message to the user (e.g., using `toast`).
4.  **Error Handling & Validation** - Complexity: 3
    *   [ ] Add basic validation: check file type (allow only PDF), and file size (e.g., max 50MB as per PRD).
    *   [ ] Implement this validation both on the client-side (for quick feedback) and server-side (for security).
    *   [ ] Return appropriate error messages from the API.
5.  **Write Tests** - Complexity: 3
    *   [ ] **Frontend:** Test that the `fetch` call is made with correct `FormData`.
    *   [ ] **Backend:** Unit test the API route. Mock `fs` operations. Test file parsing, saving logic, and error responses for invalid file types/sizes. (Requires API route testing setup).

**Code Example (Illustrative `app/api/documents/upload/route.ts`):**
```typescript
// app/api/documents/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { nanoid } from 'nanoid'; // For unique filenames: bun add nanoid

const UPLOAD_DIR = path.join(process.cwd(), 'uploads'); // Ensure 'uploads' is in .gitignore

// Ensure upload directory exists
async function ensureUploadDirExists() {
  try {
    await fs.access(UPLOAD_DIR);
  } catch (error) {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  }
}

export async function POST(req: NextRequest) {
  await ensureUploadDirExists();

  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[]; // Assuming 'files' is the field name

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded.' }, { status: 400 });
    }

    const uploadedFilePaths = [];

    for (const file of files) {
      if (file.type !== 'application/pdf') {
        // Skip non-PDF files or return an error for the batch
        console.warn(`Skipping non-PDF file: ${file.name}`);
        continue; // Or collect errors and return
      }

      // Basic size check (e.g., 50MB)
      if (file.size > 50 * 1024 * 1024) {
        console.warn(`Skipping large file: ${file.name}`);
        continue;
      }

      const uniqueFilename = `${nanoid()}-${file.name.replace(/\s+/g, '_')}`;
      const filePath = path.join(UPLOAD_DIR, uniqueFilename);
      
      // Convert ArrayBuffer to Buffer
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(filePath, fileBuffer);
      uploadedFilePaths.push({ originalName: file.name, savedPath: filePath, size: file.size });
    }

    if (uploadedFilePaths.length === 0) {
        return NextResponse.json({ error: 'No valid PDF files were processed.' }, { status: 400 });
    }

    return NextResponse.json({
      message: 'Files uploaded successfully!',
      files: uploadedFilePaths,
    }, { status: 200 });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Error uploading files.' }, { status: 500 });
  }
}
```

**Code Example (Illustrative `components/file-uploader.tsx` update):**
```typescript
// components/file-uploader.tsx (partial update for handleUpload)
// ... (imports and existing state)

const handleUpload = async () => {
  if (files.length === 0) {
    toast({ title: "No files selected", variant: "destructive" });
    return;
  }

  const formData = new FormData();
  let hasValidFile = false;
  files.forEach(file => {
    if (file.type === "application/pdf" && file.size <= 50 * 1024 * 1024) {
      formData.append('files', file); // Ensure the key matches API: 'files'
      hasValidFile = true;
    } else {
      toast({ title: `Invalid file: ${file.name}`, description: "Only PDFs under 50MB are allowed.", variant: "destructive" });
    }
  });

  if (!hasValidFile) {
    toast({ title: "No valid files to upload", variant: "destructive" });
    return;
  }

  try {
    toast({ title: "Uploading...", description: "Please wait." });
    const response = await fetch('/api/documents/upload', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Upload failed');
    }

    toast({ title: "Success!", description: result.message });
    setFiles([]); // Clear selection on success
    console.log('Uploaded files info:', result.files);
    // In a real app, you might want to update a list of uploaded documents here
  } catch (error: any) {
    toast({ title: "Upload Error", description: error.message, variant: "destructive" });
    console.error('Upload failed:', error);
  }
};

// ... (rest of the component)
```

**Ready to Merge Checklist:**
*   [ ] All tests pass (bun test).
*   [ ] Linting passes (bun run lint).
*   [ ] Build succeeds (bun run build).
*   [ ] Code reviewed by senior dev.
*   [ ] Feature works as expected: PDF files can be uploaded, are saved locally in the `uploads` directory, and client gets success/error messages. Non-PDFs or oversized files are rejected.

**Quick Research (5-10 minutes):**
*   **Next.js API Routes:** [https://nextjs.org/docs/app/building-your-application/routing/route-handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
*   **FormData API:** [https://developer.mozilla.org/en-US/docs/Web/API/FormData](https://developer.mozilla.org/en-US/docs/Web/API/FormData)
*   **Node.js `fs` module:** [https://nodejs.org/api/fs.html](https://nodejs.org/api/fs.html) (specifically `fs.promises`)
*   **Multipart form data parsing in Next.js:** Search "nextjs api route multipart form data" (libraries like `formidable` or native `req.formData()`)

**Need to Go Deeper?**
*   **Research Prompt:** *"I'm building a file upload API in Next.js. What are the security considerations for handling file uploads (e.g., validating file types, size limits, sanitizing filenames, storage location)? Explain best practices for a junior developer."*

**Questions for Senior Dev:**
*   [ ] Is storing files directly in an `uploads` folder okay for now, or should we consider a different strategy even at this stage?
*   [ ] How should we handle concurrent uploads or very large files in terms of server resources for this local saving approach?
*   [ ] What's a good way to structure API response messages for uploads (success and errors)?

---

This covers the initial setup and the first crucial user-facing feature: uploading documents. The next slices would build upon this by integrating the actual RAG pipeline, starting with document processing. Let me know when you're ready for the next set of slices!