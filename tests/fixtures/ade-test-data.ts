import { nanoid } from 'nanoid';
import type { AdeElement, AdeElementType, AdeOutput, BoundingBox } from '@/lib/ade/types';
import type { DocumentChunk } from '@/lib/db/schema';

/**
 * Factory for creating realistic ADE test data
 */
export const createAdeTestDataFactory = () => {
  // Realistic element types distribution
  const ELEMENT_TYPE_WEIGHTS: Record<AdeElementType, number> = {
    paragraph: 0.4,
    title: 0.15,
    list_item: 0.2,
    table: 0.1,
    figure: 0.05,
    header: 0.03,
    footer: 0.02,
    caption: 0.03,
    table_text: 0.02,
  };

  // Sample content templates for different element types
  const CONTENT_TEMPLATES: Record<AdeElementType, string[]> = {
    title: [
      'System Overview and Architecture',
      'Installation Requirements',
      'Operating Procedures Manual',
      'Troubleshooting Guidelines',
      'Safety Protocols and Procedures',
      'Calibration and Maintenance',
      'Technical Specifications',
      'Performance Metrics and Benchmarks',
    ],
    paragraph: [
      'The system operates within specified temperature and humidity ranges to ensure optimal performance.',
      'Regular maintenance is essential for maintaining system reliability and extending operational lifespan.',
      'This procedure must be performed by qualified technicians with appropriate safety equipment.',
      'The calibration process involves multiple steps that must be completed in the specified sequence.',
      'Warning: Improper operation may result in equipment damage or personal injury.',
      'Performance metrics indicate optimal operation when following the recommended guidelines.',
      'Environmental factors significantly impact measurement accuracy and system stability.',
      'Quality control measures ensure consistent output and reliable operation under various conditions.',
    ],
    list_item: [
      '1. Turn off the main power switch before beginning maintenance',
      '2. Check all cable connections for proper seating and damage',
      '3. Verify sensor calibration using the provided test equipment',
      '4. Document all findings in the maintenance log',
      '• Ensure proper grounding of all electrical connections',
      '• Use only approved cleaning solutions on optical components',
      '• Replace filters according to the maintenance schedule',
      '• Test emergency stop functions before operation',
    ],
    table: [
      'Measurement Parameters and Tolerances',
      'System Configuration Settings',
      'Error Codes and Descriptions',
      'Maintenance Schedule Matrix',
      'Performance Specifications Table',
      'Environmental Operating Conditions',
      'Component Part Numbers and Specifications',
      'Calibration Standards Reference',
    ],
    figure: [
      'System architecture block diagram',
      'Installation mounting dimensions',
      'Wiring schematic and connections',
      'User interface layout and controls',
      'Calibration procedure flowchart',
      'Safety zone boundaries diagram',
      'Component location reference',
      'Troubleshooting decision tree',
    ],
    header: [
      'Document Classification: Technical Manual',
      'Revision 3.2 - Updated March 2024',
      'Proprietary and Confidential Information',
      'For Authorized Personnel Only',
    ],
    footer: [
      'Page 1 of 45 - System Manual v3.2',
      'Copyright 2024 - All Rights Reserved',
      'Document ID: TM-SYS-2024-001',
      'Last Updated: March 15, 2024',
    ],
    caption: [
      'Figure 1: System overview and component layout',
      'Table 2: Operating parameter specifications',
      'Diagram 3: Electrical connection schematic',
      'Chart 4: Performance characteristics graph',
    ],
    table_text: [
      'Parameter: Operating Temperature | Value: -10°C to +60°C | Tolerance: ±2°C',
      'Measurement Range: 0-100mm | Resolution: 0.001mm | Accuracy: ±0.005mm',
      'Power Requirements: 24VDC | Current: 2.5A | Protection: IP65',
      'Communication: Ethernet | Protocol: TCP/IP | Data Rate: 100Mbps',
    ],
  };

  return {
    /**
     * Create a single ADE element with realistic content and metadata
     */
    createAdeElement: (
      elementType?: AdeElementType,
      pageNumber: number = 1,
      overrides?: Partial<AdeElement>,
    ): AdeElement => {
      const type = elementType || selectWeightedElementType();
      const templates = CONTENT_TEMPLATES[type];
      const content = templates[Math.floor(Math.random() * templates.length)];

      return {
        id: `ade_${nanoid()}`,
        type,
        content,
        pageNumber,
        bbox: generateRealisticBoundingBox(type, pageNumber),
        confidence: 0.75 + Math.random() * 0.25, // 0.75-1.0
        metadata: {
          extracted_at: new Date().toISOString(),
          processing_version: '1.0',
          element_sequence: Math.floor(Math.random() * 100),
        },
        ...overrides,
      };
    },

    /**
     * Create a complete ADE output for a document
     */
    createAdeOutput: (
      documentId: string,
      pageCount: number = 10,
      elementsPerPage: number = 8,
      overrides?: Partial<AdeOutput>,
    ): AdeOutput => {
      const elements: AdeElement[] = [];
      
      for (let page = 1; page <= pageCount; page++) {
        // Ensure each page has a title element
        elements.push({
          ...createAdeTestDataFactory().createAdeElement('title', page),
          id: `title_page_${page}_${nanoid()}`,
        });

        // Add other elements for the page
        for (let i = 1; i < elementsPerPage; i++) {
          elements.push({
            ...createAdeTestDataFactory().createAdeElement(undefined, page),
            id: `elem_page_${page}_${i}_${nanoid()}`,
          });
        }
      }

      const totalElements = elements.length;
      const processingTimeMs = 1000 + (totalElements * 50) + (Math.random() * 2000);

      return {
        documentId,
        elements,
        processingTimeMs,
        totalElements,
        pageCount,
        confidence: elements.reduce((sum, el) => sum + (el.confidence || 0), 0) / totalElements,
        ...overrides,
      };
    },

    /**
     * Create realistic document chunks with ADE metadata
     */
    createEnhancedDocumentChunks: (
      documentId: string,
      adeOutput: AdeOutput,
      chunkingStrategy: 'element_per_chunk' | 'semantic_grouping' = 'element_per_chunk',
    ): Omit<DocumentChunk, 'id' | 'createdAt'>[] => {
      if (chunkingStrategy === 'element_per_chunk') {
        // One chunk per ADE element
        return adeOutput.elements.map((element, index) => ({
          documentId,
          chunkIndex: index.toString(),
          content: element.content || `Content for ${element.type} element`,
          metadata: {
            chunkIndex: index,
            adeElementId: element.id,
            confidence: element.confidence,
            elementMetadata: element.metadata,
          },
          tokenCount: Math.ceil((element.content?.length || 50) / 4).toString(),
          elementType: element.type,
          pageNumber: element.pageNumber,
          bbox: element.bbox || null,
        }));
      } else {
        // Semantic grouping - combine related elements
        const groupedChunks: Omit<DocumentChunk, 'id' | 'createdAt'>[] = [];
        const elementsByPage = groupElements(adeOutput.elements);

        Object.entries(elementsByPage).forEach(([pageStr, pageElements]) => {
          const pageNumber = parseInt(pageStr);
          const semanticGroups = createSemanticGroups(pageElements);

          semanticGroups.forEach((group, groupIndex) => {
            const combinedContent = group.map(el => el.content).join('\n\n');
            const primaryElement = group[0];
            
            groupedChunks.push({
              documentId,
              chunkIndex: `${pageNumber}_${groupIndex}`,
              content: combinedContent,
              metadata: {
                chunkIndex: groupedChunks.length,
                pageNumber,
                elementGroup: group.map(el => el.id),
                primaryElementType: primaryElement.type,
                confidence: group.reduce((sum, el) => sum + (el.confidence || 0), 0) / group.length,
              },
              tokenCount: Math.ceil(combinedContent.length / 4).toString(),
              elementType: primaryElement.type,
              pageNumber: primaryElement.pageNumber,
              bbox: primaryElement.bbox || null,
            });
          });
        });

        return groupedChunks;
      }
    },

    /**
     * Create test data for mixed document scenarios
     */
    createMixedDocumentScenario: (userId: string) => {
      const enhancedDoc = {
        fileName: `enhanced_${nanoid()}.pdf`,
        originalName: 'Enhanced Document with ADE.pdf',
        filePath: `/uploads/enhanced_${nanoid()}.pdf`,
        mimeType: 'application/pdf',
        fileSize: (5 * 1024 * 1024).toString(),
        status: 'processed' as const,
        uploadedBy: userId,
      };

      const legacyDoc = {
        fileName: `legacy_${nanoid()}.pdf`,
        originalName: 'Legacy Document.pdf',
        filePath: `/uploads/legacy_${nanoid()}.pdf`,
        mimeType: 'application/pdf',
        fileSize: (3 * 1024 * 1024).toString(),
        status: 'processed' as const,
        uploadedBy: userId,
      };

      return { enhancedDoc, legacyDoc };
    },

    /**
     * Create performance test data with specified characteristics
     */
    createPerformanceTestData: (
      documentCount: number,
      chunksPerDocument: number,
      userId: string,
    ) => {
      const documents = Array.from({ length: documentCount }, (_, docIndex) => ({
        fileName: `perf_doc_${docIndex}_${nanoid()}.pdf`,
        originalName: `Performance Test Document ${docIndex + 1}.pdf`,
        filePath: `/uploads/perf_${docIndex}_${nanoid()}.pdf`,
        mimeType: 'application/pdf',
        fileSize: (Math.random() * 10 * 1024 * 1024 + 1024 * 1024).toString(),
        status: 'processed' as const,
        uploadedBy: userId,
      }));

      const allChunks = documents.flatMap((doc, docIndex) =>
        Array.from({ length: chunksPerDocument }, (_, chunkIndex) => {
          const globalIndex = docIndex * chunksPerDocument + chunkIndex;
          const elementType = selectWeightedElementType();
          const pageNumber = Math.floor(chunkIndex / 5) + 1;

          return {
            documentId: '', // Will be filled after document insertion
            chunkIndex: chunkIndex.toString(),
            content: generateRealisticContent(elementType, globalIndex),
            metadata: {
              chunkIndex,
              performance_test: true,
              document_index: docIndex,
              global_index: globalIndex,
            },
            tokenCount: Math.ceil(Math.random() * 100 + 50).toString(),
            elementType,
            pageNumber,
            bbox: generateRealisticBoundingBox(elementType, pageNumber),
          };
        }),
      );

      return { documents, chunks: allChunks };
    },

    /**
     * Create spatial distribution test data
     */
    createSpatialTestData: (
      documentId: string,
      layoutType: 'single_column' | 'two_column' | 'complex_layout' = 'single_column',
    ): Omit<DocumentChunk, 'id' | 'createdAt'>[] => {
      const chunks: Omit<DocumentChunk, 'id' | 'createdAt'>[] = [];
      const pageWidth = 595; // A4 width in points
      const pageHeight = 842; // A4 height in points

      if (layoutType === 'single_column') {
        const elements = [
          { type: 'header' as AdeElementType, bbox: [50, 50, 545, 80] },
          { type: 'title' as AdeElementType, bbox: [50, 100, 545, 150] },
          { type: 'paragraph' as AdeElementType, bbox: [50, 180, 545, 280] },
          { type: 'table' as AdeElementType, bbox: [50, 300, 545, 500] },
          { type: 'figure' as AdeElementType, bbox: [100, 520, 495, 720] },
          { type: 'footer' as AdeElementType, bbox: [50, 760, 545, 792] },
        ];

        elements.forEach((element, index) => {
          chunks.push({
            documentId,
            chunkIndex: index.toString(),
            content: generateRealisticContent(element.type, index),
            metadata: { chunkIndex: index, layout: 'single_column' },
            tokenCount: '25',
            elementType: element.type,
            pageNumber: 1,
            bbox: element.bbox,
          });
        });
      } else if (layoutType === 'two_column') {
        const leftColumn = pageWidth * 0.48;
        const rightColumnStart = pageWidth * 0.52;
        
        const elements = [
          { type: 'header' as AdeElementType, bbox: [50, 50, 545, 80] },
          { type: 'title' as AdeElementType, bbox: [50, 100, 545, 150] },
          { type: 'paragraph' as AdeElementType, bbox: [50, 180, leftColumn, 350] },
          { type: 'paragraph' as AdeElementType, bbox: [rightColumnStart, 180, 545, 350] },
          { type: 'figure' as AdeElementType, bbox: [50, 370, leftColumn, 500] },
          { type: 'table' as AdeElementType, bbox: [rightColumnStart, 370, 545, 500] },
        ];

        elements.forEach((element, index) => {
          chunks.push({
            documentId,
            chunkIndex: index.toString(),
            content: generateRealisticContent(element.type, index),
            metadata: { chunkIndex: index, layout: 'two_column' },
            tokenCount: '20',
            elementType: element.type,
            pageNumber: 1,
            bbox: element.bbox,
          });
        });
      }

      return chunks;
    },

    /**
     * Create citation test scenarios
     */
    createCitationTestData: (documentId: string, documentName: string) => {
      const citationScenarios = [
        {
          elementType: 'title' as AdeElementType,
          content: 'System Installation and Setup Guidelines',
          pageNumber: 1,
          expected: `${documentName}, page 1 (title)`,
        },
        {
          elementType: 'paragraph' as AdeElementType,
          content: 'The installation process requires careful attention to environmental conditions.',
          pageNumber: 3,
          expected: `${documentName}, page 3 (paragraph)`,
        },
        {
          elementType: 'table' as AdeElementType,
          content: 'Component specifications and part numbers',
          pageNumber: 7,
          expected: `${documentName}, page 7 (table)`,
        },
        {
          elementType: 'list_item' as AdeElementType,
          content: 'Step 1: Verify power requirements before connection',
          pageNumber: 9,
          expected: `${documentName}, page 9 (list item)`,
        },
        {
          elementType: 'figure' as AdeElementType,
          content: 'Installation diagram with component placement',
          pageNumber: 11,
          expected: `${documentName}, page 11 (figure)`,
        },
      ];

      return citationScenarios.map((scenario, index) => ({
        documentId,
        chunkIndex: index.toString(),
        content: scenario.content,
        metadata: { chunkIndex: index, citation_test: true },
        tokenCount: Math.ceil(scenario.content.length / 4).toString(),
        elementType: scenario.elementType,
        pageNumber: scenario.pageNumber,
        bbox: generateRealisticBoundingBox(scenario.elementType, scenario.pageNumber),
        expectedCitation: scenario.expected,
      }));
    },

    /**
     * Create context assembly test data
     */
    createContextAssemblyData: (documentId: string, contextSize: number = 20) => {
      const contextTypes: AdeElementType[] = ['title', 'paragraph', 'list_item', 'table', 'figure'];
      
      return Array.from({ length: contextSize }, (_, index) => {
        const elementType = contextTypes[index % contextTypes.length];
        const pageNumber = Math.floor(index / 4) + 1;
        
        return {
          documentId,
          chunkIndex: index.toString(),
          content: generateContextContent(elementType, index),
          metadata: { 
            chunkIndex: index, 
            context_test: true,
            relevance_score: Math.random() * 0.3 + 0.7, // 0.7-1.0
          },
          tokenCount: Math.ceil(Math.random() * 50 + 25).toString(),
          elementType,
          pageNumber,
          bbox: generateRealisticBoundingBox(elementType, pageNumber),
        };
      });
    },
  };

  // Helper functions
  function selectWeightedElementType(): AdeElementType {
    const random = Math.random();
    let cumulative = 0;
    
    for (const [type, weight] of Object.entries(ELEMENT_TYPE_WEIGHTS)) {
      cumulative += weight;
      if (random <= cumulative) {
        return type as AdeElementType;
      }
    }
    
    return 'paragraph'; // fallback
  }

  function generateRealisticBoundingBox(
    elementType: AdeElementType,
    pageNumber: number,
  ): BoundingBox {
    const pageWidth = 595; // A4 width in points
    const pageHeight = 842; // A4 height in points
    const margin = 50;
    
    // Base dimensions by element type
    const baseDimensions = {
      title: { width: pageWidth - 2 * margin, height: 50 },
      header: { width: pageWidth - 2 * margin, height: 30 },
      footer: { width: pageWidth - 2 * margin, height: 30 },
      paragraph: { width: pageWidth - 2 * margin, height: 80 },
      table: { width: pageWidth - 2 * margin, height: 200 },
      figure: { width: pageWidth - 4 * margin, height: 200 },
      list_item: { width: pageWidth - 3 * margin, height: 30 },
      caption: { width: pageWidth - 4 * margin, height: 25 },
      table_text: { width: pageWidth - 2 * margin, height: 20 },
    };

    const dims = baseDimensions[elementType] || baseDimensions.paragraph;
    
    // Position based on element type and some randomness
    let x1 = margin;
    let y1 = margin + (Math.random() * 200);
    
    if (elementType === 'header') {
      y1 = margin;
    } else if (elementType === 'footer') {
      y1 = pageHeight - margin - dims.height;
    } else if (elementType === 'figure' || elementType === 'caption') {
      x1 = margin * 2; // Center figures
    } else if (elementType === 'list_item') {
      x1 = margin + 20; // Indent list items
    }

    const x2 = x1 + dims.width;
    const y2 = y1 + dims.height;

    return [x1, y1, x2, y2];
  }

  function generateRealisticContent(elementType: AdeElementType, index: number): string {
    const templates = CONTENT_TEMPLATES[elementType];
    const baseContent = templates[index % templates.length];
    
    // Add some variation
    if (elementType === 'paragraph') {
      return `${baseContent} This provides additional context and detail for chunk ${index + 1}.`;
    } else if (elementType === 'list_item') {
      return baseContent.replace(/\d+/, (index + 1).toString());
    }
    
    return baseContent;
  }

  function generateContextContent(elementType: AdeElementType, index: number): string {
    const contextPhrases = {
      title: [`Section ${index + 1}: Advanced System Configuration`],
      paragraph: [
        `This section covers the detailed procedures for system configuration step ${index + 1}.`,
        `Important considerations for operation include proper environmental conditions and safety protocols.`,
        `Performance optimization requires careful attention to parameter settings and calibration procedures.`,
      ],
      list_item: [
        `${index + 1}. Execute the primary initialization sequence`,
        `${index + 1}. Verify all connections are secure and properly seated`,
        `${index + 1}. Document the configuration changes in the system log`,
      ],
      table: [`Configuration Parameter Table ${index + 1}`],
      figure: [`Diagram ${index + 1}: System component relationships`],
    };

    const phrases = contextPhrases[elementType] || contextPhrases.paragraph;
    return phrases[index % phrases.length];
  }

  function groupElements(elements: AdeElement[]): Record<string, AdeElement[]> {
    return elements.reduce((groups, element) => {
      const page = element.pageNumber.toString();
      if (!groups[page]) {
        groups[page] = [];
      }
      groups[page].push(element);
      return groups;
    }, {} as Record<string, AdeElement[]>);
  }

  function createSemanticGroups(pageElements: AdeElement[]): AdeElement[][] {
    const groups: AdeElement[][] = [];
    
    // Sort by position on page
    const sorted = pageElements.sort((a, b) => {
      const aY = a.bbox?.[1] || 0;
      const bY = b.bbox?.[1] || 0;
      return aY - bY;
    });

    let currentGroup: AdeElement[] = [];
    
    sorted.forEach((element) => {
      // Start new group for titles or when group gets too large
      if (element.type === 'title' || currentGroup.length >= 3) {
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
        }
        currentGroup = [element];
      } else {
        currentGroup.push(element);
      }
    });

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }
};

/**
 * Mock ADE API responses for testing
 */
export const createMockAdeApiResponse = (
  documentId: string,
  success: boolean = true,
  elements?: AdeElement[],
) => {
  if (!success) {
    return {
      status: 'error' as const,
      error: {
        code: 'ADE_PROCESSING_FAILED',
        message: 'Document processing failed due to invalid format',
        details: { documentId },
      },
    };
  }

  const mockElements = elements || createAdeTestDataFactory().createAdeOutput(documentId, 5, 6).elements;

  return {
    status: 'success' as const,
    data: {
      elements: mockElements.map((element) => ({
        element_id: element.id,
        element_type: element.type,
        text_content: element.content,
        image_data: element.imagePath,
        page_number: element.pageNumber,
        bounding_box: element.bbox
          ? {
              x1: element.bbox[0],
              y1: element.bbox[1],
              x2: element.bbox[2],
              y2: element.bbox[3],
            }
          : undefined,
        confidence_score: element.confidence || 0.8,
        metadata: element.metadata,
      })),
      document_metadata: {
        total_pages: Math.max(...mockElements.map(e => e.pageNumber)),
        processing_time_ms: 2500,
        confidence_score: mockElements.reduce((sum, el) => sum + (el.confidence || 0), 0) / mockElements.length,
      },
    },
  };
};

/**
 * Performance benchmarking utilities
 */
export const createPerformanceBenchmark = () => ({
  /**
   * Benchmark search operations with different chunk sizes and metadata complexity
   */
  generateSearchBenchmarkData: (
    baselineChunks: number,
    enhancedChunks: number,
    documentId: string,
  ) => {
    const baseline = Array.from({ length: baselineChunks }, (_, i) => ({
      documentId,
      chunkIndex: i.toString(),
      content: `Baseline chunk ${i} without enhanced metadata`,
      metadata: { chunkIndex: i, baseline: true },
      tokenCount: '15',
      elementType: null,
      pageNumber: null,
      bbox: null,
    }));

    const enhanced = Array.from({ length: enhancedChunks }, (_, i) => {
      const elementType = (['paragraph', 'title', 'table', 'list_item'] as AdeElementType[])[i % 4];
      
      return {
        documentId,
        chunkIndex: (baselineChunks + i).toString(),
        content: `Enhanced chunk ${i} with ADE metadata`,
        metadata: { chunkIndex: baselineChunks + i, enhanced: true },
        tokenCount: '15',
        elementType,
        pageNumber: Math.floor(i / 10) + 1,
        bbox: [50, 100 + (i % 10) * 40, 500, 140 + (i % 10) * 40],
      };
    });

    return { baseline, enhanced };
  },

  /**
   * Memory usage tracking for ADE operations
   */
  trackMemoryUsage: (operation: string) => {
    const before = process.memoryUsage();
    
    return {
      start: () => before,
      end: () => {
        const after = process.memoryUsage();
        return {
          operation,
          heapUsedDelta: after.heapUsed - before.heapUsed,
          heapTotalDelta: after.heapTotal - before.heapTotal,
          externalDelta: after.external - before.external,
          before,
          after,
        };
      },
    };
  },
});