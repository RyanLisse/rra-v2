/**
 * Agentic Document Processing
 * TypeScript implementation inspired by Landing AI's agentic-doc
 * Provides advanced document understanding and visual element extraction
 */

import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs/promises';

// Document Element Schema - similar to Landing AI's structure
export const DocumentElementSchema = z.object({
  id: z.string(),
  type: z.enum([
    'text',
    'table',
    'figure',
    'header',
    'footer',
    'list',
    'paragraph',
    'title',
  ]),
  content: z.string(),
  boundingBox: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    pageNumber: z.number(),
  }),
  confidence: z.number().min(0).max(1),
  metadata: z.record(z.any()).optional(),
  relationships: z.array(z.string()).optional(),
});

export const DocumentAnalysisSchema = z.object({
  documentId: z.string(),
  title: z.string().optional(),
  totalPages: z.number(),
  elements: z.array(DocumentElementSchema),
  structure: z.object({
    hasTable: z.boolean(),
    hasFigures: z.boolean(),
    hasHeaders: z.boolean(),
    sectionCount: z.number(),
  }),
  summary: z.string(),
  keyTopics: z.array(z.string()),
  metadata: z.record(z.any()).optional(),
});

export type DocumentElement = z.infer<typeof DocumentElementSchema>;
export type DocumentAnalysis = z.infer<typeof DocumentAnalysisSchema>;

export interface AgenticDocConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  enableVisionAnalysis: boolean;
  confidenceThreshold: number;
}

export interface DocumentProcessingOptions {
  analyzeStructure: boolean;
  extractTables: boolean;
  identifyFigures: boolean;
  generateSummary: boolean;
  extractKeyTopics: boolean;
  confidenceThreshold?: number;
}

/**
 * Agentic Document Processor
 * Provides intelligent document understanding using AI models
 */
export class AgenticDocProcessor {
  private config: AgenticDocConfig;

  constructor(config: Partial<AgenticDocConfig> = {}) {
    this.config = {
      model: 'gpt-4o',
      maxTokens: 4000,
      temperature: 0.1,
      enableVisionAnalysis: true,
      confidenceThreshold: 0.7,
      ...config,
    };
  }

  /**
   * Analyze document structure and extract elements
   */
  async analyzeDocument(
    documentPath: string,
    imagePaths: string[],
    options: DocumentProcessingOptions = {
      analyzeStructure: true,
      extractTables: true,
      identifyFigures: true,
      generateSummary: true,
      extractKeyTopics: true,
    },
  ): Promise<DocumentAnalysis> {
    try {
      // Read document images for visual analysis
      const imageAnalyses = await this.analyzeDocumentImages(
        imagePaths,
        options,
      );

      // Extract text content if available
      const textContent = await this.extractTextContent(documentPath);

      // Combine visual and text analysis
      const analysis = await this.synthesizeAnalysis(
        textContent,
        imageAnalyses,
        options,
        path.basename(documentPath),
      );

      return analysis;
    } catch (error) {
      console.error('Document analysis failed:', error);
      throw new Error(
        `Failed to analyze document: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Analyze document images using vision models
   */
  private async analyzeDocumentImages(
    imagePaths: string[],
    options: DocumentProcessingOptions,
  ): Promise<
    Array<{ pageNumber: number; elements: DocumentElement[]; analysis: string }>
  > {
    const analyses = [];

    for (let i = 0; i < imagePaths.length; i++) {
      const imagePath = imagePaths[i];
      const pageNumber = i + 1;

      try {
        // Convert image to base64
        const imageBuffer = await fs.readFile(imagePath);
        const base64Image = imageBuffer.toString('base64');
        const mimeType = this.getMimeType(imagePath);

        // Analyze page structure
        const pageAnalysis = await this.analyzePageStructure(
          base64Image,
          mimeType,
          pageNumber,
          options,
        );

        analyses.push({
          pageNumber,
          elements: pageAnalysis.elements,
          analysis: pageAnalysis.description,
        });
      } catch (error) {
        console.warn(`Failed to analyze page ${pageNumber}:`, error);
        analyses.push({
          pageNumber,
          elements: [],
          analysis: `Failed to analyze page ${pageNumber}`,
        });
      }
    }

    return analyses;
  }

  /**
   * Analyze individual page structure using vision model
   */
  private async analyzePageStructure(
    base64Image: string,
    mimeType: string,
    pageNumber: number,
    options: DocumentProcessingOptions,
  ): Promise<{ elements: DocumentElement[]; description: string }> {
    const prompt = this.buildAnalysisPrompt(options);

    const result = await generateObject({
      model: openai(this.config.model),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
            {
              type: 'image',
              image: `data:${mimeType};base64,${base64Image}`,
            },
          ],
        },
      ],
      schema: z.object({
        elements: z.array(DocumentElementSchema),
        description: z.string(),
      }),
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
    });

    // Add page number to all elements
    const elementsWithPage = result.object.elements.map((element, index) => ({
      ...element,
      id: `page-${pageNumber}-element-${index + 1}`,
      boundingBox: {
        ...element.boundingBox,
        pageNumber,
      },
    }));

    return {
      elements: elementsWithPage,
      description: result.object.description,
    };
  }

  /**
   * Build analysis prompt based on options
   */
  private buildAnalysisPrompt(options: DocumentProcessingOptions): string {
    let prompt = `Analyze this document page and extract structural elements. For each element found, provide:
1. Type (text, table, figure, header, footer, list, paragraph, title)
2. Content (the actual text or description)
3. Bounding box coordinates (x, y, width, height as percentages of page size)
4. Confidence score (0-1)

Focus on:`;

    if (options.analyzeStructure) {
      prompt += '\n- Overall document structure and layout';
    }
    if (options.extractTables) {
      prompt += '\n- Tables with precise boundaries and content extraction';
    }
    if (options.identifyFigures) {
      prompt += '\n- Figures, charts, diagrams, and images with descriptions';
    }

    prompt += `\n\nReturn only elements with confidence >= ${options.confidenceThreshold || this.config.confidenceThreshold}.
Bounding box coordinates should be normalized (0-100) relative to page dimensions.`;

    return prompt;
  }

  /**
   * Extract text content if available
   */
  private async extractTextContent(documentPath: string): Promise<string> {
    try {
      // Check if there's a corresponding text extraction file
      const textPath = documentPath.replace(/\.pdf$/i, '.extraction.md');

      try {
        const textContent = await fs.readFile(textPath, 'utf-8');
        return textContent;
      } catch {
        // If no extraction file, return empty string
        return '';
      }
    } catch (error) {
      console.warn('Failed to extract text content:', error);
      return '';
    }
  }

  /**
   * Synthesize analysis from visual and text data
   */
  private async synthesizeAnalysis(
    textContent: string,
    imageAnalyses: Array<{
      pageNumber: number;
      elements: DocumentElement[];
      analysis: string;
    }>,
    options: DocumentProcessingOptions,
    documentName: string,
  ): Promise<DocumentAnalysis> {
    // Combine all elements
    const allElements = imageAnalyses.flatMap((page) => page.elements);

    // Generate document-level analysis
    const documentAnalysis = await this.generateDocumentSummary(
      textContent,
      imageAnalyses,
      options,
      documentName,
    );

    // Calculate structure metrics
    const structure = {
      hasTable: allElements.some((el) => el.type === 'table'),
      hasFigures: allElements.some((el) => el.type === 'figure'),
      hasHeaders: allElements.some((el) => el.type === 'header'),
      sectionCount: allElements.filter((el) => el.type === 'title').length,
    };

    return {
      documentId: this.generateDocumentId(documentName),
      title: documentAnalysis.title,
      totalPages: imageAnalyses.length,
      elements: allElements,
      structure,
      summary: documentAnalysis.summary,
      keyTopics: documentAnalysis.keyTopics,
      metadata: {
        processedAt: new Date().toISOString(),
        model: this.config.model,
        totalElements: allElements.length,
        averageConfidence: this.calculateAverageConfidence(allElements),
      },
    };
  }

  /**
   * Generate document-level summary and analysis
   */
  private async generateDocumentSummary(
    textContent: string,
    imageAnalyses: Array<{
      pageNumber: number;
      elements: DocumentElement[];
      analysis: string;
    }>,
    options: DocumentProcessingOptions,
    documentName: string,
  ): Promise<{ title: string; summary: string; keyTopics: string[] }> {
    const combinedContent = `
Document: ${documentName}

Text Content:
${textContent}

Visual Analysis:
${imageAnalyses.map((page) => `Page ${page.pageNumber}: ${page.analysis}`).join('\n')}

Elements Found:
${imageAnalyses
  .flatMap((page) => page.elements)
  .map((el) => `- ${el.type}: ${el.content.substring(0, 100)}`)
  .join('\n')}
`;

    const result = await generateObject({
      model: openai(this.config.model),
      messages: [
        {
          role: 'system',
          content:
            'You are an expert document analyst. Analyze the provided document content and structure.',
        },
        {
          role: 'user',
          content: `Analyze this document and provide:
1. A descriptive title
2. A comprehensive summary (2-3 paragraphs)
3. Key topics/themes (5-10 topics)

Document content:
${combinedContent}`,
        },
      ],
      schema: z.object({
        title: z.string(),
        summary: z.string(),
        keyTopics: z.array(z.string()),
      }),
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
    });

    return result.object;
  }

  /**
   * Query document for specific information
   */
  async queryDocument(
    analysis: DocumentAnalysis,
    query: string,
    includeVisualContext = true,
  ): Promise<{
    answer: string;
    relevantElements: DocumentElement[];
    confidence: number;
  }> {
    // Find relevant elements based on query
    const relevantElements = await this.findRelevantElements(analysis, query);

    // Build context from relevant elements
    const context = this.buildQueryContext(
      relevantElements,
      includeVisualContext,
    );

    // Generate answer
    const result = await generateObject({
      model: openai(this.config.model),
      messages: [
        {
          role: 'system',
          content:
            'You are a document analyst. Answer questions based on the provided document context.',
        },
        {
          role: 'user',
          content: `Based on the following document context, answer this question: "${query}"

Context:
${context}

Provide a detailed answer based only on the information available in the context.`,
        },
      ],
      schema: z.object({
        answer: z.string(),
        confidence: z.number().min(0).max(1),
      }),
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
    });

    return {
      answer: result.object.answer,
      relevantElements,
      confidence: result.object.confidence,
    };
  }

  /**
   * Find elements relevant to a query
   */
  private async findRelevantElements(
    analysis: DocumentAnalysis,
    query: string,
  ): Promise<DocumentElement[]> {
    // Simple text matching for now - could be enhanced with embeddings
    const queryLower = query.toLowerCase();

    return analysis.elements
      .filter((element) => {
        const contentLower = element.content.toLowerCase();
        return (
          contentLower.includes(queryLower) ||
          element.type === 'title' ||
          element.type === 'header'
        );
      })
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Build context for query answering
   */
  private buildQueryContext(
    elements: DocumentElement[],
    includeVisualContext: boolean,
  ): string {
    let context = '';

    elements.forEach((element, index) => {
      context += `Element ${index + 1} (${element.type}):\n`;
      context += `Content: ${element.content}\n`;

      if (includeVisualContext) {
        context += `Page: ${element.boundingBox.pageNumber}\n`;
        context += `Position: (${element.boundingBox.x}, ${element.boundingBox.y})\n`;
      }

      context += `Confidence: ${element.confidence}\n\n`;
    });

    return context;
  }

  /**
   * Utility methods
   */
  private getMimeType(imagePath: string): string {
    const ext = path.extname(imagePath).toLowerCase();
    switch (ext) {
      case '.png':
        return 'image/png';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.webp':
        return 'image/webp';
      default:
        return 'image/png';
    }
  }

  private generateDocumentId(documentName: string): string {
    return `doc_${documentName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}_${Date.now()}`;
  }

  private calculateAverageConfidence(elements: DocumentElement[]): number {
    if (elements.length === 0) return 0;
    const sum = elements.reduce((acc, el) => acc + el.confidence, 0);
    return sum / elements.length;
  }

  /**
   * Export analysis results in various formats
   */
  async exportAnalysis(
    analysis: DocumentAnalysis,
    format: 'json' | 'markdown' | 'csv',
    outputPath: string,
  ): Promise<void> {
    switch (format) {
      case 'json':
        await fs.writeFile(outputPath, JSON.stringify(analysis, null, 2));
        break;

      case 'markdown': {
        const markdown = this.generateMarkdownReport(analysis);
        await fs.writeFile(outputPath, markdown);
        break;
      }

      case 'csv': {
        const csv = this.generateCSVReport(analysis);
        await fs.writeFile(outputPath, csv);
        break;
      }

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  private generateMarkdownReport(analysis: DocumentAnalysis): string {
    let markdown = `# Document Analysis Report\n\n`;
    markdown += `**Document:** ${analysis.title || analysis.documentId}\n`;
    markdown += `**Pages:** ${analysis.totalPages}\n`;
    markdown += `**Elements:** ${analysis.elements.length}\n\n`;

    markdown += `## Summary\n\n${analysis.summary}\n\n`;

    markdown += `## Key Topics\n\n`;
    analysis.keyTopics.forEach((topic) => {
      markdown += `- ${topic}\n`;
    });

    markdown += `\n## Document Structure\n\n`;
    markdown += `- Has Tables: ${analysis.structure.hasTable}\n`;
    markdown += `- Has Figures: ${analysis.structure.hasFigures}\n`;
    markdown += `- Has Headers: ${analysis.structure.hasHeaders}\n`;
    markdown += `- Section Count: ${analysis.structure.sectionCount}\n\n`;

    markdown += `## Elements\n\n`;
    analysis.elements.forEach((element, index) => {
      markdown += `### Element ${index + 1}: ${element.type}\n`;
      markdown += `**Content:** ${element.content.substring(0, 200)}${element.content.length > 200 ? '...' : ''}\n`;
      markdown += `**Page:** ${element.boundingBox.pageNumber}\n`;
      markdown += `**Confidence:** ${element.confidence}\n\n`;
    });

    return markdown;
  }

  private generateCSVReport(analysis: DocumentAnalysis): string {
    let csv = 'Element ID,Type,Content,Page,X,Y,Width,Height,Confidence\n';

    analysis.elements.forEach((element) => {
      const content = element.content.replace(/"/g, '""').replace(/\n/g, ' ');
      csv += `"${element.id}","${element.type}","${content}",${element.boundingBox.pageNumber},${element.boundingBox.x},${element.boundingBox.y},${element.boundingBox.width},${element.boundingBox.height},${element.confidence}\n`;
    });

    return csv;
  }
}

/**
 * Factory function to create an agentic document processor
 */
export function createAgenticDocProcessor(
  config?: Partial<AgenticDocConfig>,
): AgenticDocProcessor {
  return new AgenticDocProcessor(config);
}

/**
 * Helper function to process a document with default settings
 */
export async function processDocument(
  documentPath: string,
  imagePaths: string[],
  options?: Partial<DocumentProcessingOptions>,
): Promise<DocumentAnalysis> {
  const processor = createAgenticDocProcessor();
  return processor.analyzeDocument(documentPath, imagePaths, {
    analyzeStructure: true,
    extractTables: true,
    identifyFigures: true,
    generateSummary: true,
    extractKeyTopics: true,
    ...options,
  });
}
