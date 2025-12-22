import React from 'react';
import { NoteData } from '../types';

interface VisualizerProps {
  currentNote: NoteData | null;
  isActive: boolean;
  compact?: boolean;
}

export const Visualizer: React.FC<VisualizerProps> = ({ currentNote, isActive, compact = false }) => {

  return (
    <div className={`
      relative flex flex-col items-center justify-center 
      transition-all duration-500 ease-in-out
      ${compact 
        ? 'w-48 h-36 rounded-2xl border-2 bg-slate-800/80 backdrop-blur-sm' 
        : 'w-96 h-80 rounded-3xl border-4 bg-slate-900'}
      ${isActive 
        ? 'border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.2)]' 
        : 'border-slate-700 shadow-none'}
    `}>
      {/* Label for Compact Mode */}
      {compact && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-950 px-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider whitespace-nowrap z-10">
          Detected
        </div>
      )}

      {/* Decorative pulse ring when active */}
      {isActive && (
        <div className={`absolute inset-0 rounded-xl border-2 border-cyan-400 opacity-20 animate-ping`}></div>
      )}

      {currentNote ? (
        <div className="flex flex-col items-center">
          
          <div className="flex items-center justify-center mb-1">
            <div 
              key={currentNote.note} /* Triggers re-render and animation on note change */
              className={`
                font-black text-transparent bg-clip-text bg-gradient-to-br from-cyan-400 to-purple-500 font-mono tracking-tighter
                ${compact ? 'text-7xl' : 'text-8xl'}
                animate-note-pop
              `}
            >
              {currentNote.note}
            </div>
          </div>
          
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <span className={`${compact ? 'text-4xl' : 'text-4xl'} text-slate-700`}>--</span>
          {!compact && (
            <span className="mt-2 text-sm text-slate-600">
              {isActive ? "Listening..." : "Paused"}
            </span>
          )}
        </div>
      )}
    </div>
  );
};