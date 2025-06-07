import { 
  AdeProcessRequest,
  AdeProcessRequestSchema,
  AdeOutput,
  AdeOutputSchema,
  AdeElement,
  LandingAiApiResponse,
  AdeError,
  AdeValidationError,
  AdeElementType,
  ADE_ELEMENT_TYPES
} from './types';
import { getAdeClient } from './client';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';

/**
 * Process a document through Landing AI ADE and return structured elements
 */
export async function processDocumentWithAde(
  request: AdeProcessRequest
): Promise<AdeOutput> {
  try {
    // Validate request
    const validatedRequest = AdeProcessRequestSchema.parse(request);
    
    // Get ADE client (will use simulation if API key not available)
    const client = getAdeClient();
    
    // Determine processing method
    const useSimulation = !process.env.LANDING_AI_API_KEY || process.env.NODE_ENV === 'test';
    
    let apiResponse: LandingAiApiResponse;
    
    if (useSimulation) {
      console.log(`[ADE] Simulating processing for document ${validatedRequest.documentId}`);
      apiResponse = await client.simulateProcessing(
        validatedRequest.filePath, 
        validatedRequest.documentId
      );
    } else {
      console.log(`[ADE] Processing document ${validatedRequest.documentId} with Landing AI`);
      apiResponse = await client.processDocument(
        validatedRequest.filePath, 
        validatedRequest.documentId
      );
    }
    
    // Transform API response to our format
    const adeOutput = await transformApiResponse(apiResponse, validatedRequest);
    
    // Validate output
    return AdeOutputSchema.parse(adeOutput);
    
  } catch (error) {
    if (error instanceof AdeError) {
      throw error;
    }
    
    throw new AdeError(
      `Failed to process document with ADE: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'ADE_PROCESSING_ERROR',
      500,
      error
    );
  }
}

/**
 * Transform Landing AI API response to our standardized format
 */
async function transformApiResponse(
  apiResponse: LandingAiApiResponse,
  request: AdeProcessRequest
): Promise<AdeOutput> {
  if (apiResponse.status !== 'success' || !apiResponse.data) {
    throw new AdeError(
      `ADE API returned error: ${apiResponse.error?.message || 'Unknown error'}`,
      apiResponse.error?.code || 'ADE_API_ERROR',
      500,
      apiResponse.error
    );
  }

  const { data } = apiResponse;
  const elements: AdeElement[] = [];

  // Transform each element
  for (const apiElement of data.elements) {
    try {
      const element = await transformElement(apiElement, request);
      elements.push(element);
    } catch (error) {
      console.warn(`[ADE] Failed to transform element ${apiElement.element_id}:`, error);
      // Continue processing other elements
    }
  }

  return {
    documentId: request.documentId,
    elements,
    processingTimeMs: data.document_metadata.processing_time_ms,
    totalElements: elements.length,
    pageCount: data.document_metadata.total_pages,
    confidence: data.document_metadata.confidence_score,
  };
}

/**
 * Transform individual ADE element from API format to our format
 */
async function transformElement(
  apiElement: any,
  request: AdeProcessRequest
): Promise<AdeElement> {
  // Map API element types to our types
  const elementType = mapApiElementType(apiElement.element_type);
  
  // Handle image data if present
  let imagePath: string | undefined;
  if (apiElement.image_data) {
    imagePath = await saveElementImage(
      apiElement.image_data,
      request.documentId,
      apiElement.element_id,
      apiElement.page_number
    );
  }

  return {
    id: apiElement.element_id,
    type: elementType,
    content: apiElement.text_content,
    imagePath,
    pageNumber: apiElement.page_number,
    bbox: apiElement.bounding_box ? [
      apiElement.bounding_box.x1,
      apiElement.bounding_box.y1,
      apiElement.bounding_box.x2,
      apiElement.bounding_box.y2
    ] : undefined,
    confidence: apiElement.confidence_score,
    metadata: apiElement.metadata,
  };
}

/**
 * Map Landing AI element types to our standardized types
 */
function mapApiElementType(apiType: string): AdeElementType {
  const typeMapping: Record<string, AdeElementType> = {
    'text_paragraph': 'paragraph',
    'paragraph': 'paragraph',
    'table_text': 'table_text',
    'table': 'table_text',
    'figure': 'figure',
    'image': 'figure',
    'list_item': 'list_item',
    'bullet_point': 'list_item',
    'title': 'title',
    'heading': 'title',
    'header': 'header',
    'page_header': 'header',
    'footer': 'footer',
    'page_footer': 'footer',
    'caption': 'caption',
  };

  const mapped = typeMapping[apiType.toLowerCase()];
  
  if (!mapped || !ADE_ELEMENT_TYPES.includes(mapped)) {
    console.warn(`[ADE] Unknown element type '${apiType}', defaulting to 'paragraph'`);
    return 'paragraph';
  }

  return mapped;
}

/**
 * Save element image data to file system
 */
async function saveElementImage(
  imageData: string,
  documentId: string,
  elementId: string,
  pageNumber: number
): Promise<string> {
  try {
    // Create directory for document images
    const imagesDir = join(process.cwd(), 'uploads', documentId, 'ade-elements');
    await mkdir(imagesDir, { recursive: true });

    // Generate filename
    const filename = `page-${pageNumber}-element-${elementId}.png`;
    const filePath = join(imagesDir, filename);

    // Handle different image data formats
    let buffer: Buffer;
    
    if (imageData.startsWith('data:')) {
      // Data URL format: data:image/png;base64,<data>
      const base64Data = imageData.split(',')[1];
      buffer = Buffer.from(base64Data, 'base64');
    } else {
      // Assume raw base64
      buffer = Buffer.from(imageData, 'base64');
    }

    // Save image
    await writeFile(filePath, buffer);
    
    return filePath;
    
  } catch (error) {
    console.error(`[ADE] Failed to save element image for ${elementId}:`, error);
    throw new AdeError(
      `Failed to save element image: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'ADE_IMAGE_SAVE_ERROR',
      500,
      error
    );
  }
}

/**
 * Extract text content from ADE elements for embedding generation
 */
export function extractTextFromAdeElements(elements: AdeElement[]): string[] {
  const textChunks: string[] = [];
  
  for (const element of elements) {
    if (element.content && element.content.trim()) {
      // Add context about element type and page
      const contextPrefix = `[${element.type.toUpperCase()}${element.pageNumber ? ` - Page ${element.pageNumber}` : ''}] `;
      textChunks.push(contextPrefix + element.content.trim());
    }
  }
  
  return textChunks;
}

/**
 * Extract image elements for visual embedding generation
 */
export function extractImageElements(elements: AdeElement[]): Array<{
  elementId: string;
  imagePath: string;
  pageNumber: number;
  type: string;
  description?: string;
}> {
  return elements
    .filter(element => element.imagePath && element.type === 'figure')
    .map(element => ({
      elementId: element.id,
      imagePath: element.imagePath!,
      pageNumber: element.pageNumber,
      type: element.type,
      description: element.content || `Figure on page ${element.pageNumber}`,
    }));
}

/**
 * Group elements by page for structured analysis
 */
export function groupElementsByPage(elements: AdeElement[]): Map<number, AdeElement[]> {
  const pageGroups = new Map<number, AdeElement[]>();
  
  for (const element of elements) {
    const page = element.pageNumber;
    if (!pageGroups.has(page)) {
      pageGroups.set(page, []);
    }
    pageGroups.get(page)!.push(element);
  }
  
  // Sort elements within each page by bounding box position (top to bottom, left to right)
  for (const [page, pageElements] of pageGroups) {
    pageElements.sort((a, b) => {
      if (!a.bbox || !b.bbox) return 0;
      
      // Sort by y-position first (top to bottom)
      const yDiff = a.bbox[1] - b.bbox[1];
      if (Math.abs(yDiff) > 10) { // Allow some tolerance for same line
        return yDiff;
      }
      
      // Then by x-position (left to right)
      return a.bbox[0] - b.bbox[0];
    });
  }
  
  return pageGroups;
}

/**
 * Calculate processing statistics
 */
export function calculateAdeStatistics(output: AdeOutput): {
  elementsByType: Record<string, number>;
  averageConfidence: number;
  pagesWithElements: number;
  textElements: number;
  imageElements: number;
} {
  const elementsByType: Record<string, number> = {};
  let totalConfidence = 0;
  let confidenceCount = 0;
  const pagesWithElements = new Set<number>();
  let textElements = 0;
  let imageElements = 0;
  
  for (const element of output.elements) {
    // Count by type
    elementsByType[element.type] = (elementsByType[element.type] || 0) + 1;
    
    // Track confidence
    if (element.confidence !== undefined) {
      totalConfidence += element.confidence;
      confidenceCount++;
    }
    
    // Track pages
    pagesWithElements.add(element.pageNumber);
    
    // Count text vs image elements
    if (element.content) textElements++;
    if (element.imagePath) imageElements++;
  }
  
  return {
    elementsByType,
    averageConfidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
    pagesWithElements: pagesWithElements.size,
    textElements,
    imageElements,
  };
}