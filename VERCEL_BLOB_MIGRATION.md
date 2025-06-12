# Vercel Blob Storage Migration

## What was changed

1. **Installed `@vercel/blob` package** - Added Vercel's blob storage SDK to the project

2. **Updated upload route** (`app/api/documents/upload/route.ts`):
   - Removed local file system storage logic
   - Files are now uploaded to Vercel Blob storage with organized paths: `documents/{userId}/{filename}`
   - Database now stores the blob URL instead of local file path
   - Added blob URL to Inngest event metadata

3. **Updated delete route** (`app/api/documents/[id]/route.ts`):
   - Replaced local file deletion with Vercel Blob deletion
   - Uses `del()` function to remove blobs from storage

4. **Updated PDF extraction** (`lib/document-processing/pdf-extractor.ts`):
   - Modified to fetch PDFs from blob URLs instead of reading local files
   - Uses fetch() to download PDF content from blob storage
   - Maintains same extraction logic with pdf-parse

## Environment Setup

To use Vercel Blob storage, you need to:

1. **Deploy to Vercel** or **Link your local project to Vercel**:
   ```bash
   vercel link
   ```

2. **Create a blob store** in your Vercel dashboard:
   - Go to your project settings
   - Navigate to Storage
   - Create a new Blob store
   - Connect it to your project

3. **Environment variables** are automatically added when you link the blob store:
   - `BLOB_READ_WRITE_TOKEN` - Automatically injected by Vercel

## Benefits

- **No local storage needed** - Works perfectly with serverless deployments
- **Automatic CDN** - Files served from Vercel's global edge network
- **Simple API** - Clean put/del functions for upload/delete
- **No file size limits** - Beyond the 50MB application limit
- **Automatic URL generation** - Secure, permanent URLs for each file
- **Built-in access control** - Public/private access options

## Testing

The upload flow now works as follows:
1. User uploads file → Vercel Blob storage
2. Blob URL saved to database
3. Text extraction fetches from blob URL
4. All downstream processing uses the blob URL

No changes needed to the frontend or other parts of the application - the blob URLs work transparently as file references.