import { useState, useRef, useCallback, useEffect } from 'react';
import { NoteData, PitchDetectorState } from '../types';
import { getNoteFromFrequency, formatNoteDisplay } from '../utils/audioHelpers';

// Configuration
// Note: ml5's CREPE model doesn't expose confidence in the standard callback, 
// so we rely on its internal threshold and our stability check.
const STABILITY_THRESHOLD_MS = 100; // Time a note must be held to be registered
const HISTORY_LIMIT = 5;
const MODEL_URL = 'https://cdn.jsdelivr.net/gh/ml5js/ml5-data-and-models/models/pitch-detection/crepe/';

export const usePitchDetector = (): PitchDetectorState => {
  const [status, setStatus] = useState<PitchDetectorState['status']>('initial');
  const [currentNote, setCurrentNote] = useState<NoteData | null>(null);
  const [history, setHistory] = useState<NoteData[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Refs for audio context and model
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pitchDetectorRef = useRef<any>(null);
  const isListeningRef = useRef<boolean>(false);

  // Refs for stability/debouncing logic
  const candidateNoteRef = useRef<string | null>(null); // The string representation (e.g. "C4")
  const candidateStartTimeRef = useRef<number>(0);
  const currentStableNoteRef = useRef<string | null>(null);

  const updateHistory = useCallback((newNote: NoteData) => {
    setHistory(prev => {
      // Don't add if it's the exact same note object (reference check won't work, need content check)
      // But here we rely on the stability logic to only fire valid changes.
      // However, if the user plays C4, stops, then plays C4 again, we want it in history.
      const newState = [newNote, ...prev];
      return newState.slice(0, HISTORY_LIMIT);
    });
  }, []);

  const handlePitch = useCallback((err: any, frequency: number) => {
    if (!isListeningRef.current) return;

    if (err) {
      console.error("Pitch detection error:", err);
      // Recursively call to keep loop alive even on error, though usually we might want to stop
      if (pitchDetectorRef.current && isListeningRef.current) {
         pitchDetectorRef.current.getPitch(handlePitch);
      }
      return;
    }

    // ml5 sometimes returns null or very low/high frequencies for noise
    if (frequency && frequency > 0) {
      const detected = getNoteFromFrequency(frequency);

      if (detected) {
        const detectedNoteStr = formatNoteDisplay(detected);
        const now = Date.now();

        // 1. Check if matches candidate
        if (detectedNoteStr === candidateNoteRef.current) {
          // 2. Check stability duration
          if (now - candidateStartTimeRef.current > STABILITY_THRESHOLD_MS) {
            // 3. Check if it is a NEW stable note (different from what is currently displayed)
            // Or if we want to re-trigger for same note after a pause (not implemented here for simplicity)
            if (detectedNoteStr !== currentStableNoteRef.current) {
              // Commit the note
              currentStableNoteRef.current = detectedNoteStr;
              setCurrentNote(detected);
              updateHistory(detected);
            }
          }
        } else {
          // Reset candidate
          candidateNoteRef.current = detectedNoteStr;
          candidateStartTimeRef.current = now;
        }
      } 
      // If frequency detected but out of piano range (getNoteFromFrequency returns null), ignore
    } else {
       // No pitch detected (silence)
       // We don't immediately clear currentNote to prevent UI flashing during short gaps
       // But we do reset the candidate so a new note must be held again
       candidateNoteRef.current = null;
    }

    // Continue the loop
    if (pitchDetectorRef.current && isListeningRef.current) {
      pitchDetectorRef.current.getPitch(handlePitch);
    }
  }, [updateHistory]);

  const startListening = async () => {
    try {
      setStatus('loading');
      setError(null);

      // 1. Initialize AudioContext
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;

      // Resume context if suspended (browser policy)
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      // 2. Get User Media
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      // 3. Load ml5 PitchDetection
      // Ensure ml5 is loaded
      if (!window.ml5) {
        throw new Error("ml5.js library not loaded.");
      }

      // 'CREPE' is the model name.
      // We must point to the CDN URL for the model files since they are not local.
      
      // Set flag immediately so we know we are in "setup" or "listening" intent
      isListeningRef.current = true;

      const pitchDetector = window.ml5.pitchDetection(
        MODEL_URL,
        audioCtx,
        stream,
        () => {
          // Model Loaded Callback
          if (!isListeningRef.current) return; // In case user stopped while loading

          console.log("Model loaded");
          setStatus('listening');
          pitchDetectorRef.current = pitchDetector;
          
          // Start the loop
          pitchDetector.getPitch(handlePitch);
        }
      );

    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to access microphone or load model.");
      setStatus('error');
      stopListening();
    }
  };

  const stopListening = () => {
    isListeningRef.current = false;
    
    // Stop tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Suspend/Close context
    if (audioContextRef.current) {
      audioContextRef.current.suspend();
      // We don't close immediately in case we want to reuse, but creating new one is safer
      // audioContextRef.current = null; // Let's keep ref but create new one on start
    }

    // Reset state
    candidateNoteRef.current = null;
    currentStableNoteRef.current = null;
    
    setStatus('ready');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, []);

  return {
    status,
    currentNote,
    history,
    startListening,
    stopListening,
    error
  };
};