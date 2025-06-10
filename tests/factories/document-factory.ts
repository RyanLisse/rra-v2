import { faker } from '@faker-js/faker';
import { BaseFactory } from './base-factory';
import type { FactoryOptions, DocumentInsert, SuggestionInsert } from './types';

/**
 * Document factory for creating test artifact document data
 */
export class DocumentFactory extends BaseFactory<DocumentInsert> {
  create(options?: FactoryOptions): DocumentInsert {
    const realistic = options?.realistic ?? true;
    const kind = faker.helpers.arrayElement(['text', 'code', 'image', 'sheet']);
    const baseTime = new Date();

    const document: DocumentInsert = {
      id: this.generateId(),
      createdAt: this.generateTimestamp(
        baseTime,
        -faker.number.int({ min: 0, max: 30 * 24 * 60 }),
      ),
      title: realistic
        ? this.generateDocumentTitle(kind)
        : `Test Document ${faker.string.alphanumeric(8)}`,
      content: realistic
        ? this.generateDocumentContent(kind)
        : 'Test document content',
      kind,
      userId: options?.overrides?.userId || this.generateId(),
    };

    return this.applyOverrides(document, options?.overrides);
  }

  /**
   * Create text document
   */
  createTextDocument(options?: FactoryOptions): DocumentInsert {
    return this.create({
      ...options,
      overrides: {
        kind: 'text',
        title: this.generateDocumentTitle('text'),
        content: this.generateTextContent(),
        ...options?.overrides,
      },
    });
  }

  /**
   * Create code document
   */
  createCodeDocument(options?: FactoryOptions): DocumentInsert {
    const language = faker.helpers.arrayElement([
      'javascript',
      'python',
      'typescript',
      'sql',
    ]);

    return this.create({
      ...options,
      overrides: {
        kind: 'code',
        title: this.generateDocumentTitle('code', language),
        content: this.generateCodeContent(language),
        ...options?.overrides,
      },
    });
  }

  /**
   * Create image document
   */
  createImageDocument(options?: FactoryOptions): DocumentInsert {
    return this.create({
      ...options,
      overrides: {
        kind: 'image',
        title: this.generateDocumentTitle('image'),
        content: this.generateImageContent(),
        ...options?.overrides,
      },
    });
  }

  /**
   * Create sheet document
   */
  createSheetDocument(options?: FactoryOptions): DocumentInsert {
    return this.create({
      ...options,
      overrides: {
        kind: 'sheet',
        title: this.generateDocumentTitle('sheet'),
        content: this.generateSheetContent(),
        ...options?.overrides,
      },
    });
  }

  /**
   * Create collaborative document with multiple edits
   */
  createCollaborativeDocument(options?: FactoryOptions): DocumentInsert {
    return this.create({
      ...options,
      overrides: {
        title: `Collaborative ${this.generateDocumentTitle('text')}`,
        content: this.generateCollaborativeContent(),
        ...options?.overrides,
      },
    });
  }

  private generateDocumentTitle(kind: string, language?: string): string {
    switch (kind) {
      case 'text':
        return faker.helpers.arrayElement([
          'Project Requirements',
          'Meeting Notes',
          'User Guide',
          'Technical Specification',
          'Design Document',
          'Research Findings',
          'Implementation Plan',
        ]);

      case 'code': {
        const codePrefix = language
          ? `${language.charAt(0).toUpperCase() + language.slice(1)} `
          : '';
        return faker.helpers.arrayElement([
          `${codePrefix}API Implementation`,
          `${codePrefix}Database Schema`,
          `${codePrefix}Utility Functions`,
          `${codePrefix}Test Suite`,
          `${codePrefix}Configuration`,
          `${codePrefix}Integration Script`,
        ]);
      }

      case 'image':
        return faker.helpers.arrayElement([
          'System Architecture Diagram',
          'User Flow Chart',
          'Database ERD',
          'API Documentation Diagram',
          'Component Mockup',
          'Process Flowchart',
        ]);

      case 'sheet':
        return faker.helpers.arrayElement([
          'Project Budget Analysis',
          'Performance Metrics',
          'User Analytics Dashboard',
          'Resource Planning',
          'Timeline Schedule',
          'Cost Breakdown',
        ]);

      default:
        return `${kind.charAt(0).toUpperCase() + kind.slice(1)} Document`;
    }
  }

  private generateDocumentContent(kind: string): string {
    switch (kind) {
      case 'text':
        return this.generateTextContent();
      case 'code':
        return this.generateCodeContent();
      case 'image':
        return this.generateImageContent();
      case 'sheet':
        return this.generateSheetContent();
      default:
        return faker.lorem.paragraphs(3, '\n\n');
    }
  }

  private generateTextContent(): string {
    const sections = faker.number.int({ min: 3, max: 8 });
    const content: string[] = [];

    content.push(`# ${faker.company.catchPhrase()}\n`);
    content.push(`${faker.lorem.paragraph(3)}\n`);

    for (let i = 0; i < sections; i++) {
      content.push(
        `## ${faker.helpers.arrayElement(['Overview', 'Requirements', 'Implementation', 'Testing', 'Deployment', 'Maintenance'])}\n`,
      );
      content.push(
        `${faker.lorem.paragraphs(faker.number.int({ min: 1, max: 3 }), '\n\n')}\n`,
      );

      // Sometimes add lists
      if (faker.datatype.boolean(0.4)) {
        const listItems = faker.number.int({ min: 2, max: 5 });
        for (let j = 0; j < listItems; j++) {
          content.push(`- ${faker.lorem.sentence()}`);
        }
        content.push('\n');
      }
    }

    return content.join('\n');
  }

  private generateCodeContent(language?: string): string {
    const lang =
      language ||
      faker.helpers.arrayElement(['javascript', 'python', 'typescript']);

    const codeTemplates = {
      javascript: `// ${faker.hacker.phrase()}
class ${faker.helpers.arrayElement(['Service', 'Manager', 'Controller', 'Utility'])} {
  constructor(${faker.hacker.noun()}) {
    this.${faker.hacker.noun()} = ${faker.hacker.noun()};
  }

  async ${faker.hacker.verb()}${faker.helpers.arrayElement(['Data', 'Info', 'Result'])}() {
    try {
      const ${faker.hacker.noun()} = await this.${faker.hacker.verb()}();
      return ${faker.hacker.noun()}.${faker.hacker.verb()}();
    } catch (error) {
      console.error('Error:', error);
      throw error;
    }
  }
}

export default ${faker.helpers.arrayElement(['Service', 'Manager', 'Controller', 'Utility'])};`,

      python: `"""${faker.hacker.phrase()}"""
import ${faker.helpers.arrayElement(['os', 'sys', 'json', 'requests'])}
from ${faker.helpers.arrayElement(['typing', 'dataclasses', 'abc'])} import ${faker.helpers.arrayElement(['List', 'Dict', 'Optional'])}

class ${faker.helpers.arrayElement(['Service', 'Manager', 'Handler'])}:
    def __init__(self, ${faker.hacker.noun()}: str):
        self.${faker.hacker.noun()} = ${faker.hacker.noun()}
    
    def ${faker.hacker.verb()}_${faker.hacker.noun()}(self) -> ${faker.helpers.arrayElement(['Dict', 'List', 'str'])}:
        """${faker.lorem.sentence()}"""
        ${faker.hacker.noun()} = "${faker.hacker.phrase()}"
        return ${faker.hacker.noun()}.${faker.hacker.verb()}()`,

      typescript: `// ${faker.hacker.phrase()}
interface ${faker.helpers.arrayElement(['User', 'Data', 'Config', 'Response'])} {
  ${faker.hacker.noun()}: string;
  ${faker.hacker.verb()}${faker.helpers.arrayElement(['At', 'By', 'Time'])}: Date;
  ${faker.hacker.adjective()}?: boolean;
}

export class ${faker.helpers.arrayElement(['Service', 'Manager', 'Controller'])} {
  private ${faker.hacker.noun()}: ${faker.helpers.arrayElement(['User', 'Data', 'Config'])};

  constructor(${faker.hacker.noun()}: ${faker.helpers.arrayElement(['User', 'Data', 'Config'])}) {
    this.${faker.hacker.noun()} = ${faker.hacker.noun()};
  }

  public async ${faker.hacker.verb()}${faker.helpers.arrayElement(['Data', 'Info'])}(): Promise<${faker.helpers.arrayElement(['User', 'Data', 'Response'])}> {
    const ${faker.hacker.noun()} = await this.${faker.hacker.verb()}();
    return ${faker.hacker.noun()};
  }
}`,
    };

    return (
      codeTemplates[lang as keyof typeof codeTemplates] ||
      codeTemplates.javascript
    );
  }

  private generateImageContent(): string {
    // For image documents, content might be SVG or image metadata
    return JSON.stringify(
      {
        type: 'image',
        format: faker.helpers.arrayElement(['svg', 'png', 'jpg']),
        width: faker.number.int({ min: 400, max: 1920 }),
        height: faker.number.int({ min: 300, max: 1080 }),
        description: faker.lorem.sentence(),
        elements: Array.from(
          { length: faker.number.int({ min: 2, max: 8 }) },
          () => ({
            type: faker.helpers.arrayElement([
              'rectangle',
              'circle',
              'text',
              'arrow',
            ]),
            x: faker.number.int({ min: 0, max: 800 }),
            y: faker.number.int({ min: 0, max: 600 }),
            properties: {
              color: faker.color.rgb(),
              text: faker.hacker.noun(),
            },
          }),
        ),
      },
      null,
      2,
    );
  }

  private generateSheetContent(): string {
    const rows = faker.number.int({ min: 5, max: 20 });
    const cols = faker.number.int({ min: 3, max: 8 });

    const headers = Array.from({ length: cols }, () =>
      faker.helpers.arrayElement([
        'Name',
        'Value',
        'Date',
        'Status',
        'Count',
        'Amount',
        'Category',
      ]),
    );

    const data = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, (_, i) => {
        const header = headers[i];
        switch (header) {
          case 'Name':
            return faker.person.fullName();
          case 'Value':
          case 'Amount':
            return faker.number.int({ min: 100, max: 10000 });
          case 'Date':
            return faker.date.recent().toISOString().split('T')[0];
          case 'Status':
            return faker.helpers.arrayElement([
              'Active',
              'Inactive',
              'Pending',
              'Complete',
            ]);
          case 'Count':
            return faker.number.int({ min: 1, max: 100 });
          case 'Category':
            return faker.helpers.arrayElement(['A', 'B', 'C', 'D']);
          default:
            return faker.lorem.word();
        }
      }),
    );

    return JSON.stringify(
      {
        headers,
        data,
        metadata: {
          title: faker.company.catchPhrase(),
          created: new Date().toISOString(),
          format: 'spreadsheet',
        },
      },
      null,
      2,
    );
  }

  private generateCollaborativeContent(): string {
    const baseContent = this.generateTextContent();

    // Add collaboration markers
    const collaborativeElements = [
      '\n<!-- Comment: Need to add more details here - @user1 -->',
      '\n**[REVIEW NEEDED]** This section requires technical review.',
      '\n> **Note from reviewer:** Consider adding examples here.',
      '\n<!-- TODO: Update with latest API changes -->',
    ];

    return (
      baseContent +
      faker.helpers
        .arrayElements(collaborativeElements, { min: 1, max: 3 })
        .join('\n')
    );
  }
}

/**
 * Suggestion factory for creating test suggestion data
 */
export class SuggestionFactory extends BaseFactory<SuggestionInsert> {
  create(options?: FactoryOptions): SuggestionInsert {
    const originalText = faker.lorem.sentence();
    const suggestedText = this.generateSuggestedText(originalText);

    const suggestion: SuggestionInsert = {
      id: this.generateId(),
      documentId: options?.overrides?.documentId || this.generateId(),
      documentCreatedAt: options?.overrides?.documentCreatedAt || new Date(),
      originalText,
      suggestedText,
      description: this.generateSuggestionDescription(),
      isResolved: faker.datatype.boolean(0.3),
      userId: options?.overrides?.userId || this.generateId(),
      createdAt: this.generateTimestamp(
        new Date(),
        -faker.number.int({ min: 0, max: 24 * 60 }),
      ),
    };

    return this.applyOverrides(suggestion, options?.overrides);
  }

  /**
   * Create grammar suggestion
   */
  createGrammarSuggestion(options?: FactoryOptions): SuggestionInsert {
    return this.create({
      ...options,
      overrides: {
        originalText: 'This are incorrect grammar',
        suggestedText: 'This is incorrect grammar',
        description: 'Grammar correction: Subject-verb agreement',
        ...options?.overrides,
      },
    });
  }

  /**
   * Create style suggestion
   */
  createStyleSuggestion(options?: FactoryOptions): SuggestionInsert {
    return this.create({
      ...options,
      overrides: {
        originalText: 'The implementation of the feature is done by the team',
        suggestedText: 'The team implemented the feature',
        description: 'Style improvement: Use active voice',
        ...options?.overrides,
      },
    });
  }

  /**
   * Create resolved suggestion
   */
  createResolvedSuggestion(options?: FactoryOptions): SuggestionInsert {
    return this.create({
      ...options,
      overrides: {
        isResolved: true,
        ...options?.overrides,
      },
    });
  }

  private generateSuggestedText(originalText: string): string {
    const improvements = [
      (text: string) => text.replace(/\b(is|are) done by\b/g, 'completed by'),
      (text: string) => text.replace(/\butilize\b/g, 'use'),
      (text: string) => text.replace(/\bin order to\b/g, 'to'),
      (text: string) => text.replace(/\bdue to the fact that\b/g, 'because'),
      (text: string) => text.charAt(0).toUpperCase() + text.slice(1),
    ];

    const improvement = faker.helpers.arrayElement(improvements);
    return improvement(originalText);
  }

  private generateSuggestionDescription(): string {
    const descriptions = [
      'Grammar correction: Fix subject-verb agreement',
      'Style improvement: Use active voice',
      'Clarity enhancement: Simplify complex sentence',
      'Consistency fix: Match document style guide',
      'Brevity improvement: Remove redundant words',
      'Technical accuracy: Update terminology',
      'Formatting fix: Correct heading structure',
      'Link update: Fix broken reference',
    ];

    return faker.helpers.arrayElement(descriptions);
  }
}

// Export factory instances
export const documentFactory = new DocumentFactory();
export const suggestionFactory = new SuggestionFactory();
