import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePitchDetector } from './hooks/usePitchDetector';
import { Visualizer } from './components/Visualizer';
import { TargetCard } from './components/TargetCard';
import { NoteHistory } from './components/NoteHistory';
import { VirtualPiano } from './components/VirtualPiano';
import { RewardOverlay } from './components/RewardOverlay';
import { StoryCard } from './components/StoryCard'; 
import { Mic, AlertCircle, Trophy, RefreshCw, Wand2, BookOpen, Music, Loader2, Volume2, VolumeX } from 'lucide-react';
import { generateRandomNote, decodeBase64, decodeAudioData } from './utils/audioHelpers';
import { generateStorySession, generateSpeechBatch } from './utils/genai'; 
import { TargetNote } from './types';

type GameMode = 'flashcard' | 'story';

interface StoryItem {
  note: TargetNote;
  text: string;
  audioBase64: string | null;
}

const App: React.FC = () => {
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

  // Story Mode State
  const [storyQueue, setStoryQueue] = useState<StoryItem[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [storyText, setStoryText] = useState<string>("");
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  
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

    } catch (e) {
      console.error("Audio playback error:", e);
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
      }
    } else {
      // If we stop listening or switch modes, stop audio
      if (!isListening || gameMode !== 'story') {
        stopCurrentAudio();
      }
    }
  }, [queueIndex, gameMode, isGeneratingStory, isListening, audioEnabled, storyQueue, playAudio, stopCurrentAudio]);
  // ----------------------------

  // Initialize a new story session (batch fetch)
  const startStorySession = useCallback(async () => {
    setIsGeneratingStory(true);
    setTargetNote(null); // Hide card while loading
    setStoryText("");
    stopCurrentAudio();

    const sessionLength = 50; // Increased to 50 items per session
    const newNotes: TargetNote[] = [];
    const noteNames: string[] = [];

    // 1. Generate local notes
    for (let i = 0; i < sessionLength; i++) {
      const n = generateRandomNote();
      newNotes.push(n);
      noteNames.push(n.note);
    }

    // 2. Fetch Story Text Batch
    const texts = await generateStorySession(noteNames);
    
    // 3. Fetch Audio Batch (Prefetching)
    const audios = await generateSpeechBatch(texts);

    // 4. Build Queue
    const newQueue: StoryItem[] = newNotes.map((note, i) => ({
      note,
      text: texts[i] || `Play ${note.note}!`,
      audioBase64: audios[i] || null
    }));

    // 5. Update State if still in story mode
    setStoryQueue(newQueue);
    setQueueIndex(0);

    if (newQueue.length > 0) {
      setTargetNote(newQueue[0].note);
      setStoryText(newQueue[0].text);
    }
    
    setIsGeneratingStory(false);
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
        // Flashcard mode
        const initialNote = generateRandomNote();
        setTargetNote(initialNote);
        setPerfectAttempt(true);
      }
    } else if (!isListening) {
      // Reset when stopped
      setTargetNote(null);
      setScore(0);
      setIsMatched(false);
      setPerfectAttempt(true);
      setShowReward(false);
      setStoryText("");
      setStoryQueue([]);
      stopCurrentAudio();
    }
  }, [isListening, targetNote, gameMode, storyQueue.length, startStorySession, isGeneratingStory, stopCurrentAudio]);

  // Main Game Logic Loop
  useEffect(() => {
    // Exit if not active or busy processing
    if (!isListening || !targetNote || !currentNote || processingMatchRef.current) return;

    // 1. Check if detected note matches target
    if (currentNote.note === targetNote.note) {
      // MATCH FOUND
      processingMatchRef.current = true;
      setIsMatched(true);
      setScore(s => s + 1);

      // Trigger reward if it was a perfect attempt
      if (perfectAttempt) {
        setShowReward(true);
        setTimeout(() => setShowReward(false), 2000); 
      }

      // Schedule next note
      setTimeout(() => {
        if (gameMode === 'story') {
          const nextIndex = queueIndex + 1;
          
          if (nextIndex < storyQueue.length) {
            // Move to next in queue
            setQueueIndex(nextIndex);
            setTargetNote(storyQueue[nextIndex].note);
            setStoryText(storyQueue[nextIndex].text);
            setIsMatched(false);
          } else {
            // End of queue -> Start new session
            startStorySession();
            setIsMatched(false);
          }
        } else {
          // Standard Mode
          const nextNote = generateRandomNote();
          setTargetNote(nextNote);
          setIsMatched(false);
        }

        setPerfectAttempt(true); 
        processingMatchRef.current = false;
      }, 1500); // Delay to enjoy success

    } else {
      // MISMATCH FOUND
      if (!isMatched) {
        if (perfectAttempt) {
          setPerfectAttempt(false);
        }
      }
    }
  }, [currentNote, targetNote, isListening, isMatched, perfectAttempt, gameMode, queueIndex, storyQueue, startStorySession]);

  const handleToggle = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleSkip = () => {
    if (isListening) {
      // Cancel speech immediately on skip
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
        setPerfectAttempt(true);
      } else {
        const nextNote = generateRandomNote();
        setTargetNote(nextNote);
        setPerfectAttempt(true);
      }
    }
  };

  const toggleMode = (mode: GameMode) => {
    if (mode === gameMode) return;
    stopCurrentAudio();
    setGameMode(mode);
    setScore(0);
    setIsMatched(false);
    
    // Clear current state to trigger useEffect
    setTargetNote(null); 
    setStoryQueue([]);
    setStoryText("");
    
    // If switching TO story mode while listening, manually trigger session start
    if (isListening && mode === 'story') {
       startStorySession();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 selection:bg-cyan-500/30 overflow-hidden">
      
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
          </div>
        </header>

        {/* Main UI */}
        <main className="relative flex flex-col items-center w-full max-w-5xl flex-grow">
          
          {/* Detected Note & Mini Piano Widget - Absolute Top Right */}
          {/* Always visible on all screens (top right), scaled down */}
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

          {/* Centered Target Card Area */}
          <div className="flex-grow flex flex-col justify-center items-center w-full min-h-[250px] py-4">
            
            {isGeneratingStory ? (
              <div className="flex flex-col items-center justify-center animate-pulse gap-4">
                 <Loader2 className="w-16 h-16 text-purple-500 animate-spin" />
                 <p className="text-purple-200 font-bold text-lg">Creating your adventure...</p>
                 <p className="text-slate-400 text-xs">Generating 50 chapters (this may take a moment)...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-8 w-full max-w-2xl">
                {/* 1. Target Card */}
                <div className="transform scale-90 md:scale-100 transition-transform">
                  <TargetCard targetNote={targetNote} isMatched={isMatched} />
                </div>
                
                {/* 2. Controls Row (Skip) */}
                <div className="flex gap-2">
                    <button 
                      onClick={handleSkip}
                      disabled={!isListening || isMatched || isGeneratingStory}
                      className="text-xs font-medium text-slate-500 hover:text-white transition-colors flex items-center gap-1 disabled:opacity-0"
                    >
                      <RefreshCw className="w-3 h-3" /> Skip Note
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

            {/* History Bar - Only show in Flashcard mode or general if desired, keeping it always for now */}
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