/**
 * Mock RAG Pipeline Runner for Evaluation Testing
 *
 * This mock version provides simulated responses for testing the evaluation framework
 * when the actual RAG pipeline is not available (e.g., API keys missing, DB not seeded).
 */

import type { RAGSystemOutput } from './rag-evaluator';
import type { RAGPipelineOptions } from './rag-pipeline-runner';

const MOCK_DOCUMENTS: Record<string, string[]> = {
  roborail_main_purpose: [
    'The RoboRail system is an automated rail measurement system designed for precision metrology applications.',
    'RoboRail provides high-accuracy positioning and measurement capabilities for industrial automation.',
    'The system is primarily used for automated quality control and dimensional measurement in manufacturing.',
  ],
  calibration_procedure: [
    'Chuck alignment calibration involves several critical steps for accurate positioning.',
    'First, ensure the system is properly initialized and all safety protocols are active.',
    'Use the calibration wizard in the control software to guide the alignment process.',
    'Verify calibration results using the built-in measurement verification routines.',
  ],
  communication_troubleshooting: [
    'Communication issues with PMAC can be resolved through several troubleshooting steps.',
    'Check all cable connections between the PMAC controller and the host computer.',
    'Verify that the correct communication protocol and settings are configured.',
    'Restart the PMAC controller and re-establish the communication link if necessary.',
  ],
  measurement_accuracy: [
    'The RoboRail system achieves measurement accuracy within ±2 micrometers under standard conditions.',
    'Environmental factors such as temperature and vibration can affect accuracy.',
    'Regular calibration and maintenance ensure optimal measurement performance.',
    'The system includes real-time error compensation algorithms for improved accuracy.',
  ],
  data_collection_setup: [
    'Data collection setup requires configuring measurement parameters and sampling rates.',
    'Define the measurement area and specify the data points to be collected.',
    'Set appropriate filtering and averaging parameters for your application.',
    'Configure data export formats and storage locations for analysis.',
  ],
  system_initialization: [
    'System initialization begins with powering on all components in the correct sequence.',
    'Load the appropriate configuration files for your specific measurement setup.',
    'Perform the system self-check and calibration verification routines.',
    'Confirm all axes are properly homed and ready for operation.',
  ],
  maintenance_schedule: [
    'Regular maintenance should be performed monthly for optimal system performance.',
    'Weekly cleaning of optical components and measurement surfaces is recommended.',
    'Annual calibration verification and comprehensive system inspection is required.',
    'Replace consumable components according to the maintenance schedule in the manual.',
  ],
};

const MOCK_ANSWERS: Record<string, string> = {
  roborail_main_purpose:
    'The RoboRail system is an automated rail measurement system designed for precision metrology applications in industrial automation. It provides high-accuracy positioning and measurement capabilities, primarily used for automated quality control and dimensional measurement in manufacturing environments.',

  calibration_procedure:
    'To perform chuck alignment calibration on the RoboRail: 1) Ensure the system is properly initialized with all safety protocols active, 2) Use the calibration wizard in the control software to guide the alignment process, 3) Follow the step-by-step alignment procedures, and 4) Verify calibration results using the built-in measurement verification routines.',

  communication_troubleshooting:
    'If there is no communication to PMAC, follow these troubleshooting steps: 1) Check all cable connections between the PMAC controller and host computer, 2) Verify correct communication protocol and settings are configured, 3) Restart the PMAC controller if necessary, and 4) Re-establish the communication link through the software interface.',

  measurement_accuracy:
    'The RoboRail system achieves measurement accuracy within ±2 micrometers under standard operating conditions. This accuracy can be affected by environmental factors such as temperature and vibration. Regular calibration and maintenance ensure optimal performance, and the system includes real-time error compensation algorithms.',

  data_collection_setup:
    'To set up data collection for measurement analysis: 1) Configure measurement parameters and sampling rates for your application, 2) Define the measurement area and specify data points to be collected, 3) Set appropriate filtering and averaging parameters, and 4) Configure data export formats and storage locations for subsequent analysis.',

  system_initialization:
    'To initialize the RoboRail system: 1) Power on all components in the correct sequence, 2) Load appropriate configuration files for your measurement setup, 3) Perform system self-check and calibration verification routines, and 4) Confirm all axes are properly homed and ready for operation.',

  maintenance_schedule:
    'The recommended maintenance schedule for RoboRail includes: Monthly regular maintenance for optimal performance, weekly cleaning of optical components and measurement surfaces, annual calibration verification and comprehensive inspection, and replacement of consumable components according to the schedule in the maintenance manual.',
};

/**
 * Run a mock query through a simulated RAG pipeline
 */
export async function runMockRAGPipeline(
  query: string,
  documentId?: string,
  options: RAGPipelineOptions = {},
): Promise<RAGSystemOutput> {
  // Simulate processing delay
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Find the most relevant mock response based on query keywords
  const testCaseId = findTestCaseByQuery(query);
  const retrievalContext = MOCK_DOCUMENTS[testCaseId] || [
    'Generic RoboRail system information for unknown queries.',
    'Please refer to the system documentation for specific details.',
    'Contact technical support for additional assistance.',
  ];

  const actualOutput =
    MOCK_ANSWERS[testCaseId] ||
    "I apologize, but I don't have specific information about that topic in the RoboRail documentation. Please consult the technical manual or contact support for detailed guidance.";

  return {
    actualOutput,
    retrievalContext,
    sources: retrievalContext.map((context, index) => ({
      id: `mock_chunk_${testCaseId}_${index}`,
      type: 'text',
      score: 0.8 - index * 0.1, // Decreasing relevance scores
      rerankScore: 0.9 - index * 0.05,
      documentId: documentId || `doc_mock_${testCaseId}`,
      chunkIndex: index,
    })),
  };
}

/**
 * Find test case ID based on query content
 */
function findTestCaseByQuery(query: string): string {
  const queryLower = query.toLowerCase();

  if (
    queryLower.includes('main purpose') ||
    queryLower.includes('what is roborail')
  ) {
    return 'roborail_main_purpose';
  }
  if (
    queryLower.includes('chuck alignment') ||
    queryLower.includes('calibration')
  ) {
    return 'calibration_procedure';
  }
  if (queryLower.includes('communication') && queryLower.includes('pmac')) {
    return 'communication_troubleshooting';
  }
  if (
    queryLower.includes('measurement accuracy') ||
    queryLower.includes('accuracy')
  ) {
    return 'measurement_accuracy';
  }
  if (queryLower.includes('data collection') || queryLower.includes('setup')) {
    return 'data_collection_setup';
  }
  if (
    queryLower.includes('initialize') ||
    queryLower.includes('initialization')
  ) {
    return 'system_initialization';
  }
  if (queryLower.includes('maintenance') || queryLower.includes('schedule')) {
    return 'maintenance_schedule';
  }

  return 'roborail_main_purpose'; // Default fallback
}

/**
 * Run multiple queries through the mock RAG pipeline
 */
export async function runMockRAGPipelineBatch(
  queries: string[],
  documentId?: string,
  options: RAGPipelineOptions = {},
): Promise<RAGSystemOutput[]> {
  const results: RAGSystemOutput[] = [];

  for (const query of queries) {
    const result = await runMockRAGPipeline(query, documentId, options);
    results.push(result);

    // Simulate small delay between queries
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return results;
}

/**
 * Test the mock RAG pipeline
 */
export async function testMockRAGPipeline(): Promise<void> {
  console.log('Testing Mock RAG Pipeline...');

  const testQuery = 'What is the main purpose of the RoboRail system?';
  const result = await runMockRAGPipeline(testQuery);

  console.log('Query:', testQuery);
  console.log('Generated Answer:', result.actualOutput);
  console.log('Retrieved Context Count:', result.retrievalContext.length);
  console.log('Sources Count:', result.sources?.length || 0);
  console.log('Mock RAG Pipeline test completed successfully!');
}
