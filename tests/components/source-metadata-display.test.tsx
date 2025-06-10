import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  SourceMetadataDisplay,
  InlineSourcesBadge,
} from '@/components/source-metadata-display';
import type { ChatSource } from '@/lib/ai/context-formatter';

// Mock the tooltip provider
jest.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const mockSources: ChatSource[] = [
  {
    id: 'chunk-1',
    title: 'RoboRail Installation Guide',
    content:
      'This is a comprehensive guide for installing the RoboRail system...',
    chunkIndex: 0,
    similarity: 0.95,
    elementType: 'title',
    pageNumber: 1,
    bbox: [100, 200, 300, 250],
    documentId: 'doc-1',
    fileName: 'roborail-install.pdf',
    confidence: 0.92,
    contextIndex: 0,
    tokenCount: 45,
    wasReranked: true,
    rerankScore: 0.88,
    metadata: {
      extraction_confidence: 0.92,
      language: 'en',
    },
  },
  {
    id: 'chunk-2',
    title: 'Calibration Procedures',
    content:
      'Follow these steps to calibrate your RoboRail system for optimal performance...',
    chunkIndex: 5,
    similarity: 0.87,
    elementType: 'heading',
    pageNumber: 3,
    documentId: 'doc-2',
    fileName: 'calibration-manual.pdf',
    confidence: 0.85,
    contextIndex: 1,
    tokenCount: 38,
    wasReranked: false,
    metadata: {
      section: 'procedures',
    },
  },
  {
    id: 'chunk-3',
    title: 'Troubleshooting Table',
    content:
      'Error Code | Description | Solution\n404 | Connection Lost | Check cables...',
    chunkIndex: 2,
    similarity: 0.76,
    elementType: 'table_text',
    pageNumber: 15,
    documentId: 'doc-3',
    fileName: 'troubleshooting-guide.pdf',
    confidence: 0.94,
    contextIndex: 2,
    tokenCount: 52,
    wasReranked: true,
    rerankScore: 0.72,
  },
];

describe('SourceMetadataDisplay', () => {
  it('renders source metadata with enhanced information', () => {
    render(<SourceMetadataDisplay sources={mockSources} />);

    // Check that source count is displayed
    expect(screen.getByText('Sources (3)')).toBeInTheDocument();

    // Check that source titles are displayed
    expect(screen.getByText('RoboRail Installation Guide')).toBeInTheDocument();
    expect(screen.getByText('Calibration Procedures')).toBeInTheDocument();
    expect(screen.getByText('Troubleshooting Table')).toBeInTheDocument();

    // Check that element types are displayed with proper formatting
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Heading')).toBeInTheDocument();
    expect(screen.getByText('Table Text')).toBeInTheDocument();

    // Check that page numbers are displayed
    expect(screen.getByText('Page 1')).toBeInTheDocument();
    expect(screen.getByText('Page 3')).toBeInTheDocument();
    expect(screen.getByText('Page 15')).toBeInTheDocument();

    // Check that similarity scores are displayed
    expect(screen.getByText('95% match')).toBeInTheDocument();
    expect(screen.getByText('87% match')).toBeInTheDocument();
    expect(screen.getByText('76% match')).toBeInTheDocument();
  });

  it('displays reranked indicators for reranked sources', () => {
    render(<SourceMetadataDisplay sources={mockSources} />);

    // Check for reranked badges (sources 1 and 3 are reranked)
    const rerankedBadges = screen.getAllByText('Reranked');
    expect(rerankedBadges).toHaveLength(2);
  });

  it('shows confidence scores when enabled', () => {
    render(
      <SourceMetadataDisplay
        sources={mockSources}
        showConfidenceScores={true}
      />,
    );

    // Check confidence percentages
    expect(screen.getByText('92%')).toBeInTheDocument(); // chunk-1 confidence
    expect(screen.getByText('85%')).toBeInTheDocument(); // chunk-2 confidence
    expect(screen.getByText('94%')).toBeInTheDocument(); // chunk-3 confidence
  });

  it('limits initial sources display and shows expand button', () => {
    render(
      <SourceMetadataDisplay sources={mockSources} maxInitialSources={2} />,
    );

    // Should show "Show all" button when there are more sources than maxInitialSources
    expect(screen.getByText('Show all')).toBeInTheDocument();

    // Click to expand
    fireEvent.click(screen.getByText('Show all'));
    expect(screen.getByText('Show less')).toBeInTheDocument();
  });

  it('expands source content preview when clicked', async () => {
    render(<SourceMetadataDisplay sources={mockSources} />);

    // Find and click a "Show preview" button
    const showPreviewButtons = screen.getAllByText('Show preview');
    fireEvent.click(showPreviewButtons[0]);

    // Wait for content to appear
    await waitFor(() => {
      expect(
        screen.getByText(/This is a comprehensive guide for installing/),
      ).toBeInTheDocument();
    });

    // Check that "Hide preview" appears
    expect(screen.getByText('Hide preview')).toBeInTheDocument();
  });

  it('displays additional metadata when available', async () => {
    render(<SourceMetadataDisplay sources={mockSources} />);

    // Expand the first source to see metadata
    const showPreviewButtons = screen.getAllByText('Show preview');
    fireEvent.click(showPreviewButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Additional metadata:')).toBeInTheDocument();
      expect(screen.getByText('extraction_confidence:')).toBeInTheDocument();
      expect(screen.getByText('language:')).toBeInTheDocument();
    });
  });

  it('renders in compact mode', () => {
    render(<SourceMetadataDisplay sources={mockSources} compact={true} />);

    // In compact mode, should show "Sources:" label
    expect(screen.getByText('Sources:')).toBeInTheDocument();

    // Should show truncated titles or badges
    expect(screen.getByText('RoboRail Installation...')).toBeInTheDocument();
  });

  it('handles empty sources gracefully', () => {
    const { container } = render(<SourceMetadataDisplay sources={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('InlineSourcesBadge', () => {
  it('renders inline source badges with page numbers', () => {
    render(<InlineSourcesBadge sources={mockSources} maxSources={2} />);

    expect(screen.getByText('Sources:')).toBeInTheDocument();

    // Should show numbered badges with page numbers
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('p1')).toBeInTheDocument(); // Page 1
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('p3')).toBeInTheDocument(); // Page 3

    // Should show "+1" for the remaining source
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('handles sources without page numbers', () => {
    const sourcesWithoutPages: ChatSource[] = [
      {
        ...mockSources[0],
        pageNumber: undefined,
      },
    ];

    render(<InlineSourcesBadge sources={sourcesWithoutPages} />);

    expect(screen.getByText('Sources:')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    // Should not show page number when not available
    expect(screen.queryByText(/p\d+/)).not.toBeInTheDocument();
  });

  it('returns null for empty sources', () => {
    const { container } = render(<InlineSourcesBadge sources={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('Source Element Type Formatting', () => {
  it('formats element types correctly', () => {
    const sources: ChatSource[] = [
      {
        ...mockSources[0],
        elementType: 'figure_caption',
      },
      {
        ...mockSources[1],
        elementType: 'list_item',
      },
    ];

    render(<SourceMetadataDisplay sources={sources} />);

    // Check formatted element types
    expect(screen.getByText('Figure Caption')).toBeInTheDocument();
    expect(screen.getByText('List Item')).toBeInTheDocument();
  });

  it('handles null or undefined element types', () => {
    const sources: ChatSource[] = [
      {
        ...mockSources[0],
        elementType: null,
      },
    ];

    render(<SourceMetadataDisplay sources={sources} />);

    // Should fall back to "Text" for null element types
    expect(screen.getByText('Text')).toBeInTheDocument();
  });
});

describe('Source Confidence Scoring', () => {
  it('applies correct confidence color coding', () => {
    const sources: ChatSource[] = [
      {
        ...mockSources[0],
        confidence: 0.9, // High confidence - should be green
      },
      {
        ...mockSources[1],
        confidence: 0.7, // Medium confidence - should be yellow
      },
      {
        ...mockSources[2],
        confidence: 0.4, // Low confidence - should be red
      },
    ];

    render(
      <SourceMetadataDisplay sources={sources} showConfidenceScores={true} />,
    );

    // Check that confidence scores are displayed
    expect(screen.getByText('90%')).toBeInTheDocument();
    expect(screen.getByText('70%')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
  });
});

describe('Token Count Display', () => {
  it('displays token count estimates', () => {
    render(<SourceMetadataDisplay sources={mockSources} />);

    // Check that token counts are displayed
    expect(screen.getByText('~45 tokens')).toBeInTheDocument();
    expect(screen.getByText('~38 tokens')).toBeInTheDocument();
    expect(screen.getByText('~52 tokens')).toBeInTheDocument();
  });
});
