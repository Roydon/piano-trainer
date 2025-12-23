
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePitchDetector } from './hooks/usePitchDetector';
import { Visualizer } from './components/Visualizer';
import { TargetCard } from './components/TargetCard';
import { NoteHistory } from './components/NoteHistory';
import { VirtualPiano } from './components/VirtualPiano';
import { RewardOverlay } from './components/RewardOverlay';
import { StoryCard } from './components/StoryCard'; 
import { DebugConsole } from './components/DebugConsole';
import { Mic, AlertCircle, Trophy, Wand2, BookOpen, Music, Loader2, Volume2, VolumeX, ChevronLeft, ChevronRight, KeyRound, ExternalLink, Bug } from 'lucide-react';
import { generateRandomNote, decodeBase64, decodeAudioData } from './utils/audioHelpers';
import { generateStorySession, generateSpeechBatch } from './utils/genai'; 
import { TargetNote } from './types';
import { logger } from './utils/logger';

type GameMode = 'flashcard' | 'story';

interface StoryItem {
  note: TargetNote;
  text: string;
  audioBase64: string | null;
}

const App: React.FC = () => {
  // --- API Key Selection State ---
  const [hasApiKey, setHasApiKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  
  // Debug State
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      } else {
        // Fallback for local dev or if env var is hardcoded
        if (process.env.API_KEY) {
          setHasApiKey(true);
        }
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      try {
        await window.aistudio.openSelectKey();
        // Assume success if no error thrown
        setHasApiKey(true);
        setKeyError(null);
        logger.success("API Key connected successfully.");
      } catch (e: any) {
        console.error("Key selection failed:", e);
        if (e.message && e.message.includes("Requested entity was not found")) {
            setKeyError("Selection failed. Please try selecting the key again.");
            setHasApiKey(false);
            logger.error("API Key selection failed: Entity not found.");
        } else {
            setKeyError("Failed to select API key. Please try again.");
            logger.error(`API Key selection failed: ${e.message}`);
        }
      }
    } else {
      setKeyError("API Key selection not available in this environment.");
      logger.error("API Key selection unavailable.");
    }
  };
  // ------------------------------

  const { 
    status, 
    currentNote, 
    history, 
    startListening, 
    stopListening, 
    error 
  } = usePitchDetector();

  const isListening = status === 'listening';
  const isLoading = status === 'loading';

  // Game State
  const [gameMode, setGameMode] = useState<GameMode>('flashcard');
  const [targetNote, setTargetNote] = useState<TargetNote | null>(null);
  const [score, setScore] = useState(0);
  const [isMatched, setIsMatched] = useState(false);
  const [easyMode, setEasyMode] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  
  const processingMatchRef = useRef(false);
  const matchTimerRef = useRef<number | null>(null);
  
  // Session ID to manage cancellation of background tasks
  const currentSessionIdRef = useRef<string>("");

  // Story Mode State
  const [storyQueue, setStoryQueue] = useState<StoryItem[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [storyText, setStoryText] = useState<string>("");
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  
  // Flashcard Mode History
  const [flashcardHistory, setFlashcardHistory] = useState<TargetNote[]>([]);
  const [flashcardIndex, setFlashcardIndex] = useState(-1);

  // Perfect Attempt Logic
  const [perfectAttempt, setPerfectAttempt] = useState(true);
  const [showReward, setShowReward] = useState(false);

  // --- Audio Output Logic (Gemini TTS) ---
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const stopCurrentAudio = useCallback(() => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch (e) {
        // Ignore errors if already stopped
      }
      currentSourceRef.current = null;
    }
  }, []);

  const playAudio = useCallback(async (base64Audio: string) => {
    if (!audioEnabled || !base64Audio) return;

    // Stop previous audio immediately
    stopCurrentAudio();

    try {
      // Initialize output AudioContext if needed
      if (!outputAudioCtxRef.current) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        outputAudioCtxRef.current = new AudioContextClass({ sampleRate: 24000 });
      }

      // Resume context if suspended (browser requirement)
      if (outputAudioCtxRef.current.state === 'suspended') {
        await outputAudioCtxRef.current.resume();
      }

      // Decode raw PCM
      const audioBuffer = await decodeAudioData(
        decodeBase64(base64Audio),
        outputAudioCtxRef.current,
        24000,
        1
      );

      // Create and play source
      const source = outputAudioCtxRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(outputAudioCtxRef.current.destination);
      source.start();
      currentSourceRef.current = source;

      // Cleanup ref on end
      source.onended = () => {
         if (currentSourceRef.current === source) {
             currentSourceRef.current = null;
         }
      };

    } catch (e: any) {
      console.error("Audio playback error:", e);
      logger.error(`Audio playback error: ${e.message}`);
    }
  }, [audioEnabled, stopCurrentAudio]);

  // Trigger speech when queue index changes and we are in story mode
  useEffect(() => {
    // Check game mode and active listening status
    if (gameMode === 'story' && !isGeneratingStory && isListening) {
      const currentItem = storyQueue[queueIndex];
      // Only play if we have an item and it has audio data
      if (currentItem && currentItem.audioBase64) {
        if (audioEnabled) {
          playAudio(currentItem.audioBase64);
        } else {
          stopCurrentAudio();
        }
      } else if (currentItem && !currentItem.audioBase64) {
          logger.warn(`Audio not ready yet for index ${queueIndex}`);
      }
    } else {
      // If we stop listening or switch modes, stop audio
      if (!isListening || gameMode !== 'story') {
        stopCurrentAudio();
      }
    }
  }, [queueIndex, gameMode, isGeneratingStory, isListening, audioEnabled, storyQueue, playAudio, stopCurrentAudio]);
  // ----------------------------

  const loadBackgroundAudio = async (sessionId: string, fullTexts: string[], startIndex: number, batchSize: number) => {
      // Loop through remaining batches
      for (let i = startIndex; i < fullTexts.length; i += batchSize) {
          // 1. Check Cancellation
          if (currentSessionIdRef.current !== sessionId) {
              logger.info(`Background audio loading cancelled for old session.`);
              return;
          }

          const end = Math.min(i + batchSize, fullTexts.length);
          const batchTexts = fullTexts.slice(i, end);

          logger.info(`[Background] generating audio for items ${i} to ${end - 1}...`);
          
          // 2. Generate
          const batchAudio = await generateSpeechBatch(batchTexts);

          // 3. Check Cancellation again after await
          if (currentSessionIdRef.current !== sessionId) return;

          // 4. Update State
          setStoryQueue(prevQueue => {
              const newQueue = [...prevQueue];
              batchAudio.forEach((audio, idx) => {
                  const globalIndex = i + idx;
                  if (newQueue[globalIndex]) {
                      newQueue[globalIndex].audioBase64 = audio;
                  }
              });
              return newQueue;
          });
          
          logger.success(`[Background] Audio loaded for items ${i} to ${end - 1}`);
      }
      logger.success("[Background] All audio generation complete.");
  };

  // Initialize a new story session (batch fetch)
  const startStorySession = useCallback(async () => {
    // Generate new Session ID
    const sessionId = Math.random().toString(36).substring(7);
    currentSessionIdRef.current = sessionId;

    setIsGeneratingStory(true);
    setTargetNote(null); // Hide card while loading
    setStoryText("");
    stopCurrentAudio();

    const SESSION_LENGTH = 50; 
    const INITIAL_AUDIO_BATCH = 10;
    
    logger.info(`Generating new story session with ${SESSION_LENGTH} steps.`);
    
    const newNotes: TargetNote[] = [];
    const noteNames: string[] = [];

    // 1. Generate local notes (Full Set)
    for (let i = 0; i < SESSION_LENGTH; i++) {
      const prevNote = newNotes.length > 0 ? newNotes[newNotes.length - 1].note : undefined;
      const n = generateRandomNote(3, 5, prevNote);
      newNotes.push(n);
      noteNames.push(n.note);
    }

    // 2. Fetch Story Text (Full Set - Single Batch)
    const texts = await generateStorySession(noteNames);
    
    // Check if session cancelled while waiting for text
    if (currentSessionIdRef.current !== sessionId) return;

    // 3. Fetch Audio Phase 1 (Blocking - First 10)
    logger.info(`Generating initial audio batch (first ${INITIAL_AUDIO_BATCH})...`);
    const initialTexts = texts.slice(0, INITIAL_AUDIO_BATCH);
    const initialAudios = await generateSpeechBatch(initialTexts);

    if (currentSessionIdRef.current !== sessionId) return;

    // 4. Build Queue
    // Items beyond INITIAL_AUDIO_BATCH start with null audio
    const newQueue: StoryItem[] = newNotes.map((note, i) => ({
      note,
      text: texts[i] || `Play ${note.note}!`,
      audioBase64: i < initialAudios.length ? initialAudios[i] : null
    }));

    // 5. Update State (Start Game)
    setStoryQueue(newQueue);
    setQueueIndex(0);

    if (newQueue.length > 0) {
      setTargetNote(newQueue[0].note);
      setStoryText(newQueue[0].text);
    }
    
    setIsGeneratingStory(false);

    // 6. Trigger Background Audio Loading for the rest
    if (texts.length > INITIAL_AUDIO_BATCH) {
        loadBackgroundAudio(sessionId, texts, INITIAL_AUDIO_BATCH, 10);
    }

  }, [stopCurrentAudio]);

  // Initialize target note on start or mode switch
  useEffect(() => {
    // Initial Setup when listening starts
    if (isListening && !targetNote && !isGeneratingStory) {
      if (gameMode === 'story') {
        if (storyQueue.length === 0) {
          startStorySession();
        }
      } else {
        // Flashcard mode initialization
        if (flashcardHistory.length === 0) {
          const initialNote = generateRandomNote();
          setFlashcardHistory([initialNote]);
          setFlashcardIndex(0);
          setTargetNote(initialNote);
          setPerfectAttempt(true);
        } else if (flashcardIndex === -1 && flashcardHistory.length > 0) {
          // Restore from history if needed (e.g. paused)
          setFlashcardIndex(0);
          setTargetNote(flashcardHistory[0]);
        }
      }
    } else if (!isListening) {
      // Reset when stopped
      currentSessionIdRef.current = ""; // Cancel any running background tasks
      setTargetNote(null);
      setScore(0);
      setIsMatched(false);
      setPerfectAttempt(true);
      setShowReward(false);
      setStoryText("");
      setStoryQueue([]);
      // Reset flashcard history on stop
      setFlashcardHistory([]);
      setFlashcardIndex(-1);
      stopCurrentAudio();
    }
  }, [isListening, targetNote, gameMode, storyQueue.length, startStorySession, isGeneratingStory, stopCurrentAudio, flashcardHistory.length, flashcardIndex]);

  // Handle Next / Previous Logic
  const handlePrevious = useCallback(() => {
    // Clear any pending match timers
    if (matchTimerRef.current) {
      clearTimeout(matchTimerRef.current);
      matchTimerRef.current = null;
    }
    processingMatchRef.current = false;
    
    stopCurrentAudio();

    if (gameMode === 'story') {
      if (queueIndex > 0) {
        const newIndex = queueIndex - 1;
        setQueueIndex(newIndex);
        setTargetNote(storyQueue[newIndex].note);
        setStoryText(storyQueue[newIndex].text);
        setIsMatched(false);
        setPerfectAttempt(true);
      }
    } else {
      // Flashcard Mode
      if (flashcardIndex > 0) {
        const newIndex = flashcardIndex - 1;
        setFlashcardIndex(newIndex);
        setTargetNote(flashcardHistory[newIndex]);
        setIsMatched(false);
        setPerfectAttempt(true);
      }
    }
  }, [gameMode, queueIndex, storyQueue, flashcardIndex, flashcardHistory, stopCurrentAudio]);

  const handleNext = useCallback(() => {
    // Clear any pending match timers to avoid double skips
    if (matchTimerRef.current) {
      clearTimeout(matchTimerRef.current);
      matchTimerRef.current = null;
    }
    processingMatchRef.current = false;

    stopCurrentAudio();

    if (gameMode === 'story') {
      const nextIndex = queueIndex + 1;
      
      if (nextIndex < storyQueue.length) {
        setQueueIndex(nextIndex);
        setTargetNote(storyQueue[nextIndex].note);
        setStoryText(storyQueue[nextIndex].text);
      } else {
        startStorySession();
      }
    } else {
      // Flashcard Mode
      const nextIndex = flashcardIndex + 1;
      
      if (nextIndex < flashcardHistory.length) {
        // Forward in history
        setFlashcardIndex(nextIndex);
        setTargetNote(flashcardHistory[nextIndex]);
      } else {
        // Generate new, excluding current to avoid duplicates
        const currentNoteName = targetNote?.note;
        const nextNote = generateRandomNote(3, 5, currentNoteName);
        setFlashcardHistory(prev => [...prev, nextNote]);
        setFlashcardIndex(prev => prev + 1);
        setTargetNote(nextNote);
      }
    }
    setIsMatched(false);
    setPerfectAttempt(true);
  }, [gameMode, queueIndex, storyQueue, startStorySession, stopCurrentAudio, flashcardHistory, flashcardIndex, targetNote]);


  // Main Game Logic Loop (Matching)
  useEffect(() => {
    // Exit if not active or busy processing
    if (!isListening || !targetNote || !currentNote || processingMatchRef.current) return;

    // 1. Check if detected note matches target
    if (currentNote.note === targetNote.note) {
      // MATCH FOUND
      processingMatchRef.current = true;
      setIsMatched(true);
      setScore(s => s + 1);
      logger.success(`Matched Note: ${currentNote.note}! Score: ${score + 1}`);

      // Trigger reward if it was a perfect attempt
      if (perfectAttempt) {
        setShowReward(true);
        setTimeout(() => setShowReward(false), 2000); 
      }

      // Schedule next note
      matchTimerRef.current = setTimeout(() => {
        handleNext();
        // We do NOT reset processingMatchRef.current here; handleNext does it
      }, 1500); // Delay to enjoy success

    } else {
      // MISMATCH FOUND
      if (!isMatched) {
        if (perfectAttempt) {
          setPerfectAttempt(false);
        }
      }
    }
  }, [currentNote, targetNote, isListening, isMatched, perfectAttempt, handleNext, score]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (matchTimerRef.current) {
        clearTimeout(matchTimerRef.current);
      }
    };
  }, []);

  const handleToggle = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const toggleMode = (mode: GameMode) => {
    if (mode === gameMode) return;
    logger.info(`Switching to ${mode} mode`);
    
    // Clear timers
    if (matchTimerRef.current) {
        clearTimeout(matchTimerRef.current);
        matchTimerRef.current = null;
    }
    processingMatchRef.current = false;

    stopCurrentAudio();
    setGameMode(mode);
    setScore(0);
    setIsMatched(false);
    
    // Clear current state to trigger useEffect
    setTargetNote(null); 
    setStoryQueue([]);
    setStoryText("");
    setFlashcardHistory([]);
    setFlashcardIndex(-1);
    
    // If switching TO story mode while listening, manually trigger session start
    if (isListening && mode === 'story') {
       startStorySession();
    }
  };

  // --- RENDER: SETUP SCREEN ---
  if (!hasApiKey) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 p-4 text-center">
        {/* Pass through debug console even in setup screen */}
        <DebugConsole isOpen={showDebug} onClose={() => setShowDebug(false)} />
        
        {/* Absolute Debug Toggle for setup screen */}
        <div className="absolute top-4 right-4 z-50">
           <button onClick={() => setShowDebug(!showDebug)} className="text-slate-600 hover:text-white p-2">
             <Bug className="w-5 h-5" />
           </button>
        </div>

        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          {/* Decorative glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-cyan-500/20 rounded-full blur-3xl"></div>
          
          <div className="relative z-10 flex flex-col items-center gap-6">
            <div className="p-4 bg-slate-800 rounded-full border border-slate-700 shadow-lg">
              <KeyRound className="w-10 h-10 text-cyan-400" />
            </div>
            
            <div>
              <h1 className="text-2xl font-black text-white mb-2">Welcome to Chloe's <span className="text-cyan-400">Musical Adventure</span></h1>
              <p className="text-slate-400 text-sm leading-relaxed">
                To enable the AI Storyteller and Voice features, please connect your Google Cloud Project.
              </p>
            </div>

            {keyError && (
               <div className="w-full p-3 bg-red-900/30 border border-red-500/50 rounded-lg flex items-center gap-2 text-red-200 text-xs">
                 <AlertCircle className="w-4 h-4 shrink-0" />
                 <span>{keyError}</span>
               </div>
            )}

            <button
              onClick={handleSelectKey}
              className="w-full py-3.5 px-6 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2"
            >
              Connect API Key
            </button>
            
            <a 
              href="https://ai.google.dev/gemini-api/docs/billing" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-slate-500 hover:text-cyan-400 flex items-center gap-1 transition-colors"
            >
              About billing & API keys <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER: MAIN APP ---
  return (
    <div className="min-h-screen flex flex-col bg-slate-950 selection:bg-cyan-500/30 overflow-hidden">
      
      <DebugConsole isOpen={showDebug} onClose={() => setShowDebug(false)} />

      {/* Reward Overlay */}
      {showReward && <RewardOverlay />}

      {/* Scrollable Main Content */}
      <div className="flex-grow flex flex-col items-center p-4 pb-0 overflow-y-auto custom-scrollbar">
        {/* Header */}
        <header className="w-full max-w-5xl flex flex-col md:flex-row justify-between items-center mb-6 z-10 relative gap-4">
          <div className="text-center md:text-left">
            <h1 className="text-xl md:text-3xl font-black tracking-tight text-white">
              Chloe’s <span className="text-cyan-400">Musical Adventure</span>
            </h1>
            <p className="text-slate-500 text-xs md:text-sm font-medium">Real-time Pitch Trainer</p>
          </div>
          
          <div className="flex flex-wrap justify-center items-center gap-3">
            
            {/* Mode Switcher */}
            <div className="bg-slate-900 p-1 rounded-full border border-slate-700 flex items-center">
              <button
                onClick={() => toggleMode('flashcard')}
                disabled={isGeneratingStory}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${gameMode === 'flashcard' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'} disabled:opacity-50`}
              >
                <Music className="w-3 h-3" /> Practice
              </button>
              <button
                onClick={() => toggleMode('story')}
                disabled={isGeneratingStory}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${gameMode === 'story' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'} disabled:opacity-50`}
              >
                <BookOpen className="w-3 h-3" /> Story
              </button>
            </div>

            {/* Audio Toggle */}
            <button
              onClick={() => setAudioEnabled(!audioEnabled)}
              className={`
                flex items-center justify-center w-8 h-8 rounded-full border transition-all
                ${audioEnabled
                  ? 'bg-slate-800 border-slate-600 text-cyan-400 hover:bg-slate-700' 
                  : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-400'}
              `}
              title={audioEnabled ? "Mute Story Voice" : "Enable Story Voice"}
            >
              {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Easy Mode Toggle */}
            <button
              onClick={() => setEasyMode(!easyMode)}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-wider transition-all
                ${easyMode 
                  ? 'bg-blue-900/30 border-blue-500/50 text-blue-300 shadow-[0_0_15px_rgba(59,130,246,0.3)]' 
                  : 'bg-slate-900 border-slate-700 text-slate-500 hover:text-slate-300'}
              `}
            >
              <Wand2 className="w-3 h-3" />
              Easy
            </button>

            {/* Score Board */}
            <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-900 rounded-full border border-slate-800">
              <Trophy className="w-4 h-4 text-yellow-500" />
              <span className="text-sm font-black text-white">{score}</span>
            </div>

            {/* Debug Toggle */}
            <button 
              onClick={() => setShowDebug(!showDebug)} 
              className={`flex items-center justify-center w-8 h-8 rounded-full border transition-all ${showDebug ? 'bg-slate-800 text-cyan-400 border-cyan-500' : 'bg-slate-900 border-slate-800 text-slate-600 hover:text-slate-400'}`}
              title="Toggle Debug Console"
            >
              <Bug className="w-4 h-4" />
            </button>

          </div>
        </header>

        {/* Main UI */}
        <main className="relative flex flex-col items-center w-full max-w-5xl flex-grow">
          
          {/* Detected Note & Mini Piano Widget - Absolute Top Right */}
           <div className="absolute top-0 right-0 z-20 flex flex-col items-end gap-2 transform scale-50 origin-top-right">
             <Visualizer currentNote={currentNote} isActive={isListening} compact={true} />
             <VirtualPiano 
                currentNote={currentNote} 
                targetNote={targetNote} 
                showHints={easyMode} 
                compact={true} 
             />
           </div>

          {/* Story Display */}
          {gameMode === 'story' && isListening && !isGeneratingStory && (
            <StoryCard storyText={storyText} isLoading={false} />
          )}

          {/* Error Message */}
          {error && (
            <div className="w-full mb-6 p-4 bg-red-900/20 border border-red-500/50 rounded-lg flex items-center gap-3 text-red-200 z-10">
              <AlertCircle className="w-5 h-5" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Centered Target Card Area with Navigation Arrows */}
          <div className="flex-grow flex flex-col justify-center items-center w-full min-h-[250px] py-4">
            
            {isGeneratingStory ? (
              <div className="flex flex-col items-center justify-center animate-pulse gap-4">
                 <Loader2 className="w-16 h-16 text-purple-500 animate-spin" />
                 <p className="text-purple-200 font-bold text-lg">Creating your adventure...</p>
                 <p className="text-slate-400 text-xs">Generating story and voice (check debug console)...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 w-full max-w-4xl">
                
                {/* Card Row: Arrow - Card - Arrow */}
                <div className="flex flex-row items-center justify-center gap-4 md:gap-12 w-full">
                  
                  {/* Previous Button */}
                  <button 
                    onClick={handlePrevious}
                    disabled={!isListening || isMatched || isGeneratingStory || (gameMode === 'story' ? queueIndex === 0 : flashcardIndex <= 0)}
                    className="p-3 md:p-4 rounded-full bg-slate-800/50 hover:bg-slate-700 border border-slate-700 hover:border-cyan-500/50 text-slate-400 hover:text-cyan-400 transition-all disabled:opacity-20 disabled:cursor-not-allowed group focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                    aria-label="Previous Note"
                  >
                    <ChevronLeft className="w-6 h-6 md:w-8 md:h-8 group-hover:scale-110 transition-transform" />
                  </button>

                  {/* Target Card */}
                  <div className="transform scale-90 md:scale-100 transition-transform">
                    <TargetCard targetNote={targetNote} isMatched={isMatched} />
                  </div>

                  {/* Next Button (Skip) */}
                  <button 
                    onClick={handleNext}
                    disabled={!isListening || isMatched || isGeneratingStory}
                    className="p-3 md:p-4 rounded-full bg-slate-800/50 hover:bg-slate-700 border border-slate-700 hover:border-cyan-500/50 text-slate-400 hover:text-cyan-400 transition-all disabled:opacity-20 disabled:cursor-not-allowed group focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                    aria-label="Next Note"
                  >
                    <ChevronRight className="w-6 h-6 md:w-8 md:h-8 group-hover:scale-110 transition-transform" />
                  </button>

                </div>
              </div>
            )}
          
          </div>

          {/* Start/Stop Button */}
          <div className="flex flex-col items-center space-y-4 md:space-y-6 mt-8 mb-8 z-10">
            <button
              onClick={handleToggle}
              disabled={isLoading || isGeneratingStory}
              className={`
                group relative inline-flex items-center gap-3 px-8 py-4 md:px-10 md:py-5 rounded-full 
                font-bold text-lg md:text-xl transition-all duration-300 transform active:scale-95 shadow-lg
                ${isListening 
                  ? 'bg-slate-800 text-red-400 border border-red-900/50 hover:bg-red-900/20 hover:border-red-500' 
                  : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-[0_0_40px_rgba(34,211,238,0.4)] hover:scale-105 border border-transparent'}
                ${(isLoading || isGeneratingStory) ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5" />
                  Loading Model...
                </>
              ) : (
                <>
                  {isListening ? (
                    <>Stop Session</>
                  ) : (
                    <>
                      <Mic className="w-6 h-6" />
                      Start {gameMode === 'story' ? 'Adventure' : 'Training'}
                    </>
                  )}
                </>
              )}
            </button>

            {/* History Bar */}
            <div className={`transition-opacity duration-700 ${history.length > 0 ? 'opacity-100' : 'opacity-0'}`}>
              <NoteHistory history={history} />
            </div>
          </div>

        </main>
      </div>
    </div>
  );
};

export default App;
