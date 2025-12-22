import React from 'react';
import { NoteData } from '../types';

interface NoteHistoryProps {
  history: NoteData[];
}

export const NoteHistory: React.FC<NoteHistoryProps> = ({ history }) => {
  // Create fixed slots for the history to prevent jumping layout
  const slots = Array.from({ length: 5 });

  return (
    <div className="w-full max-w-md mt-12 p-6 rounded-2xl bg-slate-800/50 backdrop-blur-sm border border-slate-700/50">
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 text-center">
        History
      </h3>
      <div className="flex justify-between items-center px-2">
        {slots.map((_, index) => {
          const noteData = history[index];
          return (
            <div 
              key={index} 
              className={`
                flex flex-col items-center justify-center w-12 h-12 rounded-lg
                transition-all duration-300
                ${noteData 
                  ? 'bg-slate-700 border border-slate-600 scale-100 opacity-100' 
                  : 'bg-slate-800/30 border border-transparent scale-90 opacity-30'}
              `}
            >
              {noteData && (
                <span className="text-lg font-bold text-slate-200">
                  {noteData.note}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};