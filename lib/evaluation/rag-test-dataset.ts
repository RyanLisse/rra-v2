/**
 * RAG Evaluation Test Dataset
 *
 * Contains test cases for evaluating the RAG system based on the processed RoboRail documents.
 * Each test case includes a query, expected output, and metadata for systematic evaluation.
 */

import type { RAGTestCase } from './rag-evaluator';

/**
 * Test dataset based on RoboRail documentation
 * These queries are designed to test different aspects of the RAG system:
 * - Simple factual queries
 * - Multi-step reasoning
 * - Technical troubleshooting
 * - Procedural instructions
 */
export const roboRailTestDataset: RAGTestCase[] = [
  {
    id: 'roborail_main_purpose',
    query: 'What is the main purpose of the RoboRail system?',
    expectedOutput:
      'The RoboRail system is an automated measurement and calibration system designed for precise rail alignment and chuck calibration in manufacturing environments.',
    idealContext: [
      'RoboRail is an automated system for rail measurement and calibration',
      'The system provides precise alignment and calibration capabilities',
    ],
    metadata: {
      category: 'factual',
      difficulty: 'easy',
      documentSource: 'operators_manual',
    },
  },
  {
    id: 'calibration_procedure',
    query: 'How do I perform chuck alignment calibration on the RoboRail?',
    expectedOutput:
      'To perform chuck alignment calibration: 1) Ensure the system is in calibration mode, 2) Position the chuck in the reference position, 3) Run the automated calibration sequence using the control interface, 4) Verify the calibration results meet the specified tolerances.',
    idealContext: [
      'Chuck alignment calibration procedure steps',
      'Calibration mode requirements and setup',
      'Tolerance specifications for calibration verification',
    ],
    metadata: {
      category: 'procedural',
      difficulty: 'medium',
      documentSource: 'calibration_faq',
    },
  },
  {
    id: 'communication_troubleshooting',
    query: 'What should I do if there is no communication to PMAC?',
    expectedOutput:
      'If there is no communication to PMAC: 1) Check cable connections between the controller and PMAC unit, 2) Verify power supply to PMAC, 3) Check communication settings and baud rate configuration, 4) Test with a known good cable, 5) Contact technical support if the issue persists.',
    idealContext: [
      'PMAC communication troubleshooting steps',
      'Cable connection verification procedures',
      'Power supply and configuration checks',
    ],
    metadata: {
      category: 'troubleshooting',
      difficulty: 'medium',
      documentSource: 'communication_faq',
    },
  },
  {
    id: 'measurement_accuracy',
    query: 'What is the measurement accuracy of the RoboRail system?',
    expectedOutput:
      'The RoboRail system provides measurement accuracy within ±0.01mm for rail alignment measurements and ±0.005mm for chuck calibration measurements under standard operating conditions.',
    idealContext: [
      'Measurement accuracy specifications',
      'Rail alignment measurement tolerances',
      'Chuck calibration accuracy requirements',
    ],
    metadata: {
      category: 'technical_specs',
      difficulty: 'easy',
      documentSource: 'operators_manual',
    },
  },
  {
    id: 'data_collection_setup',
    query: 'How do I set up data collection for measurement analysis?',
    expectedOutput:
      'To set up data collection: 1) Access the data collection menu in the system interface, 2) Configure measurement parameters and sampling rates, 3) Set up data storage location and file naming conventions, 4) Enable automatic data logging, 5) Verify data collection is active before starting measurements.',
    idealContext: [
      'Data collection configuration steps',
      'Measurement parameter settings',
      'Data storage and logging setup procedures',
    ],
    metadata: {
      category: 'procedural',
      difficulty: 'medium',
      documentSource: 'data_collection_faq',
    },
  },
  {
    id: 'system_initialization',
    query: 'What are the steps to initialize the RoboRail system?',
    expectedOutput:
      'System initialization steps: 1) Power on the main controller and wait for boot sequence, 2) Check all safety systems and emergency stops, 3) Home all axes in the correct sequence, 4) Load system configuration and calibration data, 5) Perform system self-test and verification checks.',
    idealContext: [
      'System startup procedure',
      'Safety system verification steps',
      'Axis homing sequence requirements',
    ],
    metadata: {
      category: 'procedural',
      difficulty: 'medium',
      documentSource: 'operators_manual',
    },
  },
  {
    id: 'error_code_interpretation',
    query: 'What does error code E-001 mean and how do I resolve it?',
    expectedOutput:
      'Error code E-001 indicates a communication timeout with the measurement sensor. To resolve: 1) Check sensor cable connections, 2) Verify sensor power supply, 3) Reset the communication interface, 4) If the error persists, replace the sensor cable or contact technical support.',
    idealContext: [
      'Error code E-001 definition and causes',
      'Communication timeout troubleshooting',
      'Sensor diagnostics and repair procedures',
    ],
    metadata: {
      category: 'troubleshooting',
      difficulty: 'hard',
      documentSource: 'troubleshooting_guide',
    },
  },
  {
    id: 'maintenance_schedule',
    query:
      'What is the recommended maintenance schedule for the RoboRail system?',
    expectedOutput:
      'Recommended maintenance schedule: Daily - Check system status and clean measurement surfaces; Weekly - Verify calibration and inspect cables; Monthly - Perform full system diagnostics and lubricate moving parts; Annually - Complete system recalibration and replace wear components.',
    idealContext: [
      'Preventive maintenance procedures',
      'Maintenance frequency recommendations',
      'Component replacement schedules',
    ],
    metadata: {
      category: 'maintenance',
      difficulty: 'medium',
      documentSource: 'operators_manual',
    },
  },
];

/**
 * Get test cases by category
 */
export function getTestCasesByCategory(category: string): RAGTestCase[] {
  return roboRailTestDataset.filter(
    (testCase) => testCase.metadata?.category === category,
  );
}

/**
 * Get test cases by difficulty
 */
export function getTestCasesByDifficulty(
  difficulty: 'easy' | 'medium' | 'hard',
): RAGTestCase[] {
  return roboRailTestDataset.filter(
    (testCase) => testCase.metadata?.difficulty === difficulty,
  );
}

/**
 * Get test cases by document source
 */
export function getTestCasesBySource(source: string): RAGTestCase[] {
  return roboRailTestDataset.filter(
    (testCase) => testCase.metadata?.documentSource === source,
  );
}

/**
 * Get a random sample of test cases
 */
export function getRandomTestCases(count: number): RAGTestCase[] {
  const shuffled = [...roboRailTestDataset].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, roboRailTestDataset.length));
}

/**
 * Configuration for test dataset filtering
 */
export interface TestDatasetConfig {
  maxCases?: number;
  categories?: string[];
  difficulties?: ('easy' | 'medium' | 'hard')[];
  sources?: string[];
}

/**
 * Configuration for evaluation settings
 */
export interface EvaluationConfig {
  maxTestCases: number;
  categories: string[];
  difficulties: ('easy' | 'medium' | 'hard')[];
  thresholds: {
    contextualRelevance: number;
    faithfulness: number;
    answerRelevance: number;
  };
  model: string;
}

/**
 * Get filtered test dataset based on configuration
 */
export function getTestDataset(config: TestDatasetConfig = {}): RAGTestCase[] {
  let filteredCases = [...roboRailTestDataset];

  // Filter by categories if specified
  if (config.categories && config.categories.length > 0) {
    filteredCases = filteredCases.filter((testCase) =>
      config.categories?.includes(testCase.metadata?.category || ''),
    );
  }

  // Filter by difficulties if specified
  if (config.difficulties && config.difficulties.length > 0) {
    filteredCases = filteredCases.filter((testCase) =>
      config.difficulties?.includes(testCase.metadata?.difficulty as any),
    );
  }

  // Filter by sources if specified
  if (config.sources && config.sources.length > 0) {
    filteredCases = filteredCases.filter((testCase) =>
      config.sources?.includes(testCase.metadata?.documentSource || ''),
    );
  }

  // Limit the number of cases if specified
  if (config.maxCases && config.maxCases > 0) {
    filteredCases = filteredCases.slice(0, config.maxCases);
  }

  return filteredCases;
}

/**
 * Type alias for backward compatibility
 */
export type TestCase = RAGTestCase;

export default roboRailTestDataset;
