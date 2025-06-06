Okay, let's move on to the next slice. Now that we can upload PDF files and save them locally, the next logical step is to extract text content from these PDFs. This is the first crucial step in our RAG pipeline.

We'll start with a straightforward server-side text extraction process.

---

### Slice 3: Backend PDF Text Extraction

**What You're Building:** An API endpoint that takes the path of a locally saved PDF, uses a library to extract its text content, and (for now) saves this extracted text to a new `.txt` file. The frontend will call this API after a successful upload.

**Tasks:**

1.  **Install PDF Parsing Library** - Complexity: 1
    *   [ ] We'll use `pdf-parse`, a commonly used library for this.
    *   [ ] Install it: `bun add pdf-parse`.
2.  **Create API Route for Text Extraction** - Complexity: 3
    *   [ ] Create a new API route: `app/api/documents/extract-text/route.ts`.
    *   [ ] Implement a `POST` handler. This handler will expect the `filePath` of the PDF saved in Slice 2.
    *   **Subtask 2.1:** Define the API route structure for `POST` requests, expecting a JSON body with `filePath`. - Complexity: 1
    *   **Subtask 2.2:** Implement logic to read the PDF file from the given `filePath` using Node.js `fs.promises.readFile`. - Complexity: 1
    *   **Subtask 2.3:** Use `pdf-parse` to extract text from the file buffer. - Complexity: 2
3.  **Save Extracted Text** - Complexity: 2
    *   [ ] Once text is extracted, save it to a new file. For example, if the PDF is `uploads/xyz.pdf`, save the text to `uploads/xyz.txt`.
    *   [ ] The API should return a success message, including the path to the new `.txt` file and perhaps some metadata like character count or number of pages from `pdf-parse`.
4.  **Update Frontend to Trigger Extraction** - Complexity: 2
    *   [ ] Modify `components/file-uploader.tsx`.
    *   [ ] After a successful upload to `/api/documents/upload` (from Slice 2), and after receiving the `savedPath` for each file, make another `POST` request to `/api/documents/extract-text` for each successfully uploaded PDF.
    *   [ ] Display a message to the user indicating text extraction status (e.g., "Extracting text for file.pdf...", "Text extracted for file.pdf").
5.  **Error Handling** - Complexity: 2
    *   [ ] Handle errors in the API: file not found, PDF parsing errors. Return appropriate HTTP status codes and error messages.
    *   [ ] Handle errors in the frontend when calling the extraction API.
6.  **Write Tests** - Complexity: 3
    *   [ ] **Backend:** Unit test the API route. Mock `fs` operations and `pdf-parse`. Test successful extraction and error scenarios (e.g., corrupted PDF, file not found).
    *   [ ] **Frontend:** Test that the call to the extraction API is made after a successful upload.

**Code Example (Illustrative `app/api/documents/extract-text/route.ts`):**
```typescript
// app/api/documents/extract-text/route.ts
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import pdf from 'pdf-parse'; // Changed from 'pdf-parse/lib/pdf-parse.js' for typical ESM/CJS interop

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { filePath } = body;

    if (!filePath || typeof filePath !== 'string') {
      return NextResponse.json({ error: 'File path is required.' }, { status: 400 });
    }

    // Basic security check: ensure filePath is within the UPLOAD_DIR
    // This is a simplified check; a more robust solution would normalize paths
    // and strictly contain them.
    const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
    const absoluteFilePath = path.resolve(filePath); // Resolve to absolute path
    if (!absoluteFilePath.startsWith(UPLOAD_DIR)) {
        return NextResponse.json({ error: 'Invalid file path.' }, { status: 400 });
    }

    let fileBuffer;
    try {
        fileBuffer = await fs.readFile(absoluteFilePath);
    } catch (error) {
        console.error('Error reading PDF file:', error);
        return NextResponse.json({ error: 'Could not read PDF file at specified path.' }, { status: 404 });
    }

    const data = await pdf(fileBuffer);

    // Save extracted text to a .txt file
    const textFilePath = absoluteFilePath.replace(/\.pdf$/i, '.txt');
    await fs.writeFile(textFilePath, data.text);

    return NextResponse.json({
      message: 'Text extracted successfully!',
      textFilePath: textFilePath, // Return the path to the .txt file
      originalPdfPath: absoluteFilePath,
      numPages: data.numpages,
      numChars: data.text.length,
      // info: data.info, // Other metadata from pdf-parse if needed
    }, { status: 200 });

  } catch (error: any) {
    console.error('Text extraction error:', error);
    // Check if it's a pdf-parse specific error or general
    if (error.message && error.message.includes('May be an XFA form')) {
         return NextResponse.json({ error: 'Error extracting text: PDF might be an XFA form or corrupted.', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'Error extracting text from PDF.', details: error.message }, { status: 500 });
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
  let validFilesForUpload: File[] = [];
  files.forEach(file => {
    if (file.type === "application/pdf" && file.size <= 50 * 1024 * 1024) {
      formData.append('files', file);
      validFilesForUpload.push(file);
    } else {
      toast({ title: `Invalid file: ${file.name}`, description: "Only PDFs under 50MB are allowed.", variant: "destructive" });
    }
  });

  if (validFilesForUpload.length === 0) {
    toast({ title: "No valid files to upload", variant: "destructive" });
    return;
  }

  try {
    toast({ title: "Uploading...", description: `Uploading ${validFilesForUpload.length} file(s).` });
    const uploadResponse = await fetch('/api/documents/upload', {
      method: 'POST',
      body: formData,
    });

    const uploadResult = await uploadResponse.json();

    if (!uploadResponse.ok) {
      throw new Error(uploadResult.error || 'Upload failed');
    }

    toast({ title: "Upload Successful!", description: `${uploadResult.files?.length || 0} file(s) uploaded.` });
    setFiles([]); // Clear selection

    // Now, trigger text extraction for each uploaded file
    if (uploadResult.files && uploadResult.files.length > 0) {
      for (const uploadedFile of uploadResult.files) {
        toast({ title: `Extracting text for ${uploadedFile.originalName}...`});
        try {
          const extractResponse = await fetch('/api/documents/extract-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: uploadedFile.savedPath }),
          });

          const extractResult = await extractResponse.json();

          if (!extractResponse.ok) {
            throw new Error(extractResult.error || `Text extraction failed for ${uploadedFile.originalName}`);
          }
          toast({ title: "Text Extracted!", description: `Text from ${uploadedFile.originalName} saved to ${extractResult.textFilePath}. Pages: ${extractResult.numPages}` });
          console.log('Extraction result:', extractResult);
          // Here you might want to update some state with the processed document info
        } catch (extractError: any) {
          toast({ title: `Extraction Error for ${uploadedFile.originalName}`, description: extractError.message, variant: "destructive" });
          console.error(`Extraction failed for ${uploadedFile.originalName}:`, extractError);
        }
      }
    }

  } catch (error: any) {
    toast({ title: "Operation Error", description: error.message, variant: "destructive" });
    console.error('Operation failed:', error);
  }
};

// ... (rest of the component)
```

**Ready to Merge Checklist:**
*   [ ] All tests pass (bun test).
*   [ ] Linting passes (bun run lint).
*   [ ] Build succeeds (bun run build).
*   [ ] Code reviewed by senior dev.
*   [ ] Feature works as expected: After PDF upload, text is extracted and saved as a `.txt` file in the `uploads` directory. Frontend shows appropriate messages. Errors are handled.

**Quick Research (5-10 minutes):**
*   **`pdf-parse` library:** [https://www.npmjs.com/package/pdf-parse](https://www.npmjs.com/package/pdf-parse) (check its GitHub for examples and API).
*   **Node.js `fs.promises.readFile` and `writeFile`:** [https://nodejs.org/api/fs.html#promises-api](https://nodejs.org/api/fs.html#promises-api)
*   **Error handling in async functions in JavaScript/TypeScript.**

**Need to Go Deeper?**
*   **Research Prompt:** *"I'm using `pdf-parse` to extract text from PDFs in a Node.js backend. What are common issues I might encounter (e.g., with different PDF versions, encrypted PDFs, scanned PDFs/OCR)? How can I make my error handling more robust for PDF processing?"*

**Questions for Senior Dev:**
*   [ ] Is the current approach of saving extracted text to a separate `.txt` file a good intermediate step, or should we aim to store it differently even now?
*   [ ] The `filePath` is passed from the client after upload. Is this secure enough, or should the backend generate/manage document IDs that the client then uses to request processing? (The current `filePath` check is a basic safeguard).
*   [ ] How should we handle PDFs that `pdf-parse` cannot process (e.g., image-only PDFs, XFA forms)? For now, we just error out.

---

This slice gets us the raw text. The next steps will involve chunking this text, generating embeddings, and storing them, which will bring us closer to the actual RAG functionality. We'll also need to think about a more persistent way to store document metadata and extracted content.