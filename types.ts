

export interface NoteData {
  note: string;      // e.g., "C", "F#"
  octave: number;    // e.g., 4, 5
  frequency: number; // e.g., 440.0
  cents: number;     // Deviation from perfect pitch
}

export interface TargetNote {
  note: string;
  octave: number;
}

export interface PitchDetectorState {
  status: 'initial' | 'loading' | 'ready' | 'listening' | 'error';
  currentNote: NoteData | null;
  history: NoteData[];
  startListening: () => Promise<void>;
  stopListening: () => void;
  error: string | null;
}

// Augment window to include ml5 and aistudio
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    ml5: any;
    AudioContext: typeof AudioContext;
    webkitAudioContext: typeof AudioContext;
  }
}