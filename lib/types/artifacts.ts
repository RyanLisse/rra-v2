/**
 * Artifact kind definitions
 */
export type ArtifactKind = 'text' | 'code' | 'image' | 'sheet';

/**
 * Artifact status during processing
 */
export type ArtifactStatus = 'streaming' | 'idle';

/**
 * Bounding box for artifact positioning
 */
export interface ArtifactBoundingBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Core artifact interface
 */
export interface UIArtifact {
  title: string;
  documentId: string;
  kind: ArtifactKind;
  content: string;
  isVisible: boolean;
  status: ArtifactStatus;
  boundingBox: ArtifactBoundingBox;
}

/**
 * Artifact definition for registering different artifact types
 */
export interface ArtifactDefinition {
  kind: ArtifactKind;
  description: string;
  content: React.ComponentType<any>;
  actions: Array<any>;
  toolbar: Array<any>;
  initialize?: (parameters: any) => void;
  onStreamPart: (args: any) => void;
}

/**
 * Artifact hook return type
 */
export interface ArtifactHookReturn {
  artifact: UIArtifact;
  setArtifact: (
    updaterFn: UIArtifact | ((currentArtifact: UIArtifact) => UIArtifact),
  ) => void;
  metadata: any;
  setMetadata: (metadata: any) => void;
}

/**
 * Artifact selector function type
 */
export type ArtifactSelector<T> = (state: UIArtifact) => T;

/**
 * Artifact context properties
 */
export interface ArtifactContextProps {
  children: React.ReactNode;
  initialArtifact?: UIArtifact;
}

/**
 * Default artifact state
 */
export const INITIAL_ARTIFACT_DATA: UIArtifact = {
  documentId: 'init',
  content: '',
  kind: 'text',
  title: '',
  status: 'idle',
  isVisible: false,
  boundingBox: {
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  },
};

/**
 * Artifact action types for state management
 */
export type ArtifactAction =
  | { type: 'SET_ARTIFACT'; payload: UIArtifact }
  | { type: 'UPDATE_ARTIFACT'; payload: Partial<UIArtifact> }
  | { type: 'SET_VISIBILITY'; payload: boolean }
  | { type: 'SET_STATUS'; payload: ArtifactStatus }
  | { type: 'SET_CONTENT'; payload: string }
  | { type: 'SET_BOUNDING_BOX'; payload: ArtifactBoundingBox }
  | { type: 'RESET' };

/**
 * Artifact configuration options
 */
export interface ArtifactConfig {
  maxContentLength?: number;
  defaultKind?: ArtifactKind;
  autoSave?: boolean;
  autoSaveInterval?: number;
  enableVersioning?: boolean;
  enableCollaboration?: boolean;
}

/**
 * Artifact event handlers
 */
export interface ArtifactEventHandlers {
  onContentChange?: (content: string, artifact: UIArtifact) => void;
  onVisibilityChange?: (isVisible: boolean, artifact: UIArtifact) => void;
  onStatusChange?: (status: ArtifactStatus, artifact: UIArtifact) => void;
  onSave?: (artifact: UIArtifact) => Promise<void>;
  onError?: (error: Error, artifact: UIArtifact) => void;
}
