export interface TextChunk {
  content: string;
  metadata: {
    chunkIndex: number;
    startIndex: number;
    endIndex: number;
    tokenCount: number;
    documentType?: string;
    section?: {
      type: 'header' | 'paragraph' | 'list' | 'table' | 'code' | 'quote';
      level?: number;
      title?: string;
    };
    overlap?: {
      previousChunk?: string;
      nextChunk?: string;
    };
    quality?: {
      coherence: number; // 0-1 score
      completeness: number; // 0-1 score
      semanticBoundary: boolean;
    };
  };
}

export interface ChunkingOptions {
  chunkSize: number;
  chunkOverlap: number;
  separators: string[];
  keepSeparators: boolean;
  respectSentenceBoundaries: boolean;
  preserveStructure: boolean;
  minChunkSize: number;
  maxChunkSize: number;
  adaptiveOverlap: boolean;
  semanticBoundaryDetection: boolean;
}

export class SemanticTextSplitter {
  private options: ChunkingOptions;

  constructor(options: Partial<ChunkingOptions> = {}) {
    this.options = {
      chunkSize: 1000,
      chunkOverlap: 200,
      separators: ['\n\n', '\n', '. ', '! ', '? ', '; ', ': ', ', ', ' '],
      keepSeparators: true,
      respectSentenceBoundaries: true,
      preserveStructure: true,
      minChunkSize: 100,
      maxChunkSize: 2000,
      adaptiveOverlap: true,
      semanticBoundaryDetection: true,
      ...options,
    };
  }

  /**
   * Split text into semantic chunks with overlap
   */
  splitText(text: string, documentType?: string): TextChunk[] {
    if (!text || text.trim().length === 0) {
      return [];
    }

    // Preprocess text to identify structure
    const structuredText = this.preprocessText(text);
    const sections = this.identifyDocumentSections(structuredText);
    
    const chunks: TextChunk[] = [];
    let globalChunkIndex = 0;

    for (const section of sections) {
      const sectionChunks = this.chunkSection(section, globalChunkIndex);
      
      // Add overlap between sections if needed
      if (chunks.length > 0 && sectionChunks.length > 0) {
        const lastChunk = chunks[chunks.length - 1];
        const firstNewChunk = sectionChunks[0];
        const crossSectionOverlap = this.calculateCrossSectionOverlap(lastChunk, firstNewChunk);
        
        if (crossSectionOverlap) {
          firstNewChunk.metadata.overlap = {
            ...firstNewChunk.metadata.overlap,
            previousChunk: crossSectionOverlap,
          };
        }
      }
      
      chunks.push(...sectionChunks);
      globalChunkIndex += sectionChunks.length;
    }

    // Post-process chunks for quality assessment
    return this.postProcessChunks(chunks, documentType);
  }

  private getNextChunk(
    text: string,
    startIndex: number,
  ): { content: string; startIndex: number; endIndex: number } {
    const maxEndIndex = Math.min(
      startIndex + this.options.chunkSize,
      text.length,
    );

    if (maxEndIndex === text.length) {
      // Last chunk - take remaining text
      return {
        content: text.slice(startIndex),
        startIndex,
        endIndex: text.length,
      };
    }

    // Find the best split point using separators
    let bestSplitIndex = maxEndIndex;

    for (const separator of this.options.separators) {
      const lastSeparatorIndex = text.lastIndexOf(separator, maxEndIndex);

      if (lastSeparatorIndex > startIndex) {
        bestSplitIndex = this.options.keepSeparators
          ? lastSeparatorIndex + separator.length
          : lastSeparatorIndex;
        break;
      }
    }

    // If no good separator found, split at word boundary
    if (bestSplitIndex === maxEndIndex) {
      const lastSpaceIndex = text.lastIndexOf(' ', maxEndIndex);
      if (lastSpaceIndex > startIndex) {
        bestSplitIndex = lastSpaceIndex;
      }
    }

    return {
      content: text.slice(startIndex, bestSplitIndex),
      startIndex,
      endIndex: bestSplitIndex,
    };
  }

  private getNextStartIndex(
    chunk: { endIndex: number },
    textLength: number,
  ): number {
    const overlapStart = Math.max(
      0,
      chunk.endIndex - this.options.chunkOverlap,
    );
    return Math.min(overlapStart, textLength);
  }

  private calculateOverlap(
    previousChunk: TextChunk,
    currentChunk: { content: string },
  ): {
    previousChunk?: string;
    nextChunk?: string;
  } {
    const overlapLength = Math.min(
      this.options.chunkOverlap,
      previousChunk.content.length,
    );
    const previousOverlap = previousChunk.content.slice(-overlapLength);

    return {
      previousChunk: previousOverlap,
    };
  }

  private estimateTokenCount(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Preprocess text to normalize and prepare for chunking
   */
  private preprocessText(text: string): string {
    // Normalize whitespace and line endings
    let processed = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Fix common OCR artifacts
    processed = processed.replace(/([a-z])\s*-\s*\n\s*([a-z])/g, '$1$2'); // Hyphenated words
    processed = processed.replace(/([.!?])\s*\n\s*([A-Z])/g, '$1\n\n$2'); // Sentence boundaries
    
    // Preserve table structures
    processed = processed.replace(/(\|.*\|.*\n)+/g, (match) => {
      return `\n\n[TABLE]\n${match}\n[/TABLE]\n\n`;
    });
    
    return processed;
  }

  /**
   * Identify document sections based on structure
   */
  private identifyDocumentSections(text: string): Array<{
    content: string;
    type: 'header' | 'paragraph' | 'list' | 'table' | 'code' | 'quote';
    level?: number;
    title?: string;
    startIndex: number;
    endIndex: number;
  }> {
    const sections = [];
    const lines = text.split('\n');
    let currentIndex = 0;
    let currentSection: any = { content: '', type: 'paragraph' as const, startIndex: 0 };
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Detect headers (# ## ### or numbered headers)
      const headerMatch = trimmed.match(/^(#{1,6})\s+(.+)$/) || 
                         trimmed.match(/^(\d+\.?\d*\.?)\s+(.+)$/) ||
                         (trimmed.length > 0 && i + 1 < lines.length && 
                          /^[=\-]{3,}$/.test(lines[i + 1].trim()));
      
      if (headerMatch) {
        // Save previous section
        if (currentSection.content.trim()) {
          sections.push({
            ...currentSection,
            endIndex: currentIndex,
          });
        }
        
        // Start new header section
        currentSection = {
          content: `${line}\n`,
          type: 'header' as const,
          level: (headerMatch as RegExpMatchArray)[1] ? (headerMatch as RegExpMatchArray)[1].length : 1,
          title: (headerMatch as RegExpMatchArray)[2] || trimmed,
          startIndex: currentIndex,
        };
      } else if (trimmed.startsWith('[TABLE]')) {
        // Handle table sections
        if (currentSection.content.trim()) {
          sections.push({ ...currentSection, endIndex: currentIndex });
        }
        currentSection = {
          content: `${line}\n`,
          type: 'table',
          startIndex: currentIndex,
        };
      } else if (trimmed.startsWith('```') || trimmed.startsWith('    ')) {
        // Handle code blocks
        if (currentSection.content.trim()) {
          sections.push({ ...currentSection, endIndex: currentIndex });
        }
        currentSection = {
          content: `${line}\n`,
          type: 'code',
          startIndex: currentIndex,
        };
      } else if (trimmed.match(/^[\-\*\+]\s+/) || trimmed.match(/^\d+\.\s+/)) {
        // Handle lists
        if (currentSection.type !== 'list') {
          if (currentSection.content.trim()) {
            sections.push({ ...currentSection, endIndex: currentIndex });
          }
          currentSection = {
            content: `${line}\n`,
            type: 'list',
            startIndex: currentIndex,
          };
        } else {
          currentSection.content += `${line}\n`;
        }
      } else {
        currentSection.content += `${line}\n`;
      }
      
      currentIndex += line.length + 1;
    }
    
    // Add final section
    if (currentSection.content.trim()) {
      sections.push({ ...currentSection, endIndex: currentIndex });
    }
    
    return sections;
  }

  /**
   * Chunk a specific document section
   */
  private chunkSection(section: any, startChunkIndex: number): TextChunk[] {
    const chunks: TextChunk[] = [];
    let chunkIndex = startChunkIndex;
    
    if (section.type === 'header' || section.content.length <= this.options.chunkSize) {
      // Keep headers and small sections intact
      chunks.push({
        content: section.content.trim(),
        metadata: {
          chunkIndex,
          startIndex: section.startIndex,
          endIndex: section.endIndex,
          tokenCount: this.estimateTokenCount(section.content),
          section: {
            type: section.type,
            level: section.level,
            title: section.title,
          },
          quality: this.assessChunkQuality(section.content, section.type),
        },
      });
      return chunks;
    }
    
    // Split large sections using existing logic but preserve section metadata
    let currentIndex = 0;
    while (currentIndex < section.content.length) {
      const chunk = this.getNextChunk(section.content, currentIndex);
      
      if (chunk.content.trim().length === 0) break;
      
      const overlap = chunkIndex > startChunkIndex
        ? this.calculateOverlap(chunks[chunks.length - 1], chunk)
        : undefined;
      
      chunks.push({
        content: chunk.content,
        metadata: {
          chunkIndex,
          startIndex: section.startIndex + chunk.startIndex,
          endIndex: section.startIndex + chunk.endIndex,
          tokenCount: this.estimateTokenCount(chunk.content),
          section: {
            type: section.type,
            level: section.level,
            title: section.title,
          },
          overlap,
          quality: this.assessChunkQuality(chunk.content, section.type),
        },
      });
      
      currentIndex = this.getNextStartIndex(chunk, section.content.length);
      chunkIndex++;
    }
    
    return chunks;
  }

  /**
   * Calculate cross-section overlap for better continuity
   */
  private calculateCrossSectionOverlap(lastChunk: TextChunk, firstNewChunk: TextChunk): string | undefined {
    if (!this.options.adaptiveOverlap) return undefined;
    
    const lastContent = lastChunk.content;
    const firstContent = firstNewChunk.content;
    
    // Take last 2 sentences from previous chunk if it helps context
    const sentences = lastContent.match(/[^.!?]+[.!?]+/g) || [];
    if (sentences.length >= 2) {
      return sentences.slice(-2).join(' ').trim();
    }
    
    return undefined;
  }

  /**
   * Assess chunk quality for better RAG performance
   */
  private assessChunkQuality(content: string, sectionType: string): {
    coherence: number;
    completeness: number;
    semanticBoundary: boolean;
  } {
    const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
    const words = content.trim().split(/\s+/);
    
    // Coherence: based on sentence structure and length
    const coherence = Math.min(1, sentences.length / 3) * 
                     Math.min(1, words.length / 50) *
                     (content.includes('...') ? 0.7 : 1.0);
    
    // Completeness: avoid cutting mid-sentence
    const endsWithPunctuation = /[.!?]$/.test(content.trim());
    const completeness = endsWithPunctuation ? 1.0 : 0.6;
    
    // Semantic boundary: check if chunk starts/ends at natural boundaries
    const startsWithCapital = /^[A-Z]/.test(content.trim());
    const semanticBoundary = endsWithPunctuation && (startsWithCapital || sectionType === 'header');
    
    return {
      coherence: Math.round(coherence * 100) / 100,
      completeness: Math.round(completeness * 100) / 100,
      semanticBoundary,
    };
  }

  /**
   * Post-process chunks for optimization
   */
  private postProcessChunks(chunks: TextChunk[], documentType?: string): TextChunk[] {
    return chunks.map((chunk, index) => {
      // Add document type metadata
      chunk.metadata.documentType = documentType;
      
      // Recalculate overlaps with quality consideration
      if (index > 0 && this.options.adaptiveOverlap) {
        const prevChunk = chunks[index - 1];
        const adaptiveOverlap = this.calculateAdaptiveOverlap(prevChunk, chunk);
        chunk.metadata.overlap = { ...chunk.metadata.overlap, ...adaptiveOverlap };
      }
      
      return chunk;
    }).filter(chunk => 
      chunk.content.trim().length >= this.options.minChunkSize &&
      chunk.metadata.quality?.coherence > 0.3
    );
  }

  /**
   * Calculate adaptive overlap based on chunk quality
   */
  private calculateAdaptiveOverlap(prevChunk: TextChunk, currentChunk: TextChunk): {
    previousChunk?: string;
  } {
    const prevQuality = prevChunk.metadata.quality!;
    const currentQuality = currentChunk.metadata.quality!;
    
    // Increase overlap for lower quality chunks
    const qualityFactor = 1 - Math.min(prevQuality.coherence, currentQuality.coherence);
    const adaptiveOverlapSize = Math.round(this.options.chunkOverlap * (1 + qualityFactor));
    
    const overlapLength = Math.min(adaptiveOverlapSize, prevChunk.content.length);
    const previousOverlap = prevChunk.content.slice(-overlapLength);
    
    return { previousChunk: previousOverlap };
  }

  /**
   * Create chunks optimized for specific document types
   */
  static createForDocumentType(
    type: 'academic' | 'technical' | 'general' | 'manual' | 'code' | 'markdown',
  ): SemanticTextSplitter {
    const configs = {
      academic: {
        chunkSize: 1200,
        chunkOverlap: 300,
        separators: ['\n\n', '\n', '. ', '! ', '? ', '; ', ': ', ', ', ' '],
        respectSentenceBoundaries: true,
        preserveStructure: true,
        adaptiveOverlap: true,
      },
      technical: {
        chunkSize: 800,
        chunkOverlap: 150,
        separators: [
          '\n\n',
          '\n',
          '. ',
          '! ',
          '? ',
          '; ',
          ': ',
          '```',
          '```\n',
          ', ',
          ' ',
        ],
        preserveStructure: true,
        semanticBoundaryDetection: true,
      },
      manual: {
        chunkSize: 1000,
        chunkOverlap: 250,
        separators: ['\n\n', '\n', '. ', '! ', '? ', '; ', ': ', ', ', ' '],
        respectSentenceBoundaries: true,
        preserveStructure: true,
        adaptiveOverlap: true,
      },
      code: {
        chunkSize: 600,
        chunkOverlap: 100,
        separators: ['\n\n', '\n```', '```\n', '\n', ';', '{', '}', ' '],
        preserveStructure: true,
        semanticBoundaryDetection: false,
      },
      markdown: {
        chunkSize: 1000,
        chunkOverlap: 200,
        separators: ['\n## ', '\n# ', '\n\n', '\n', '. ', '! ', '? ', ' '],
        preserveStructure: true,
        respectSentenceBoundaries: true,
      },
      general: {
        chunkSize: 1000,
        chunkOverlap: 200,
        separators: ['\n\n', '\n', '. ', '! ', '? ', '; ', ': ', ', ', ' '],
        respectSentenceBoundaries: true,
        adaptiveOverlap: true,
      },
    };

    return new SemanticTextSplitter(configs[type]);
  }
}
