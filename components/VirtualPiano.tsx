import React from 'react';
import { NoteData, TargetNote } from '../types';

interface VirtualPianoProps {
  currentNote: NoteData | null;
  targetNote: TargetNote | null;
  showHints: boolean;
  compact?: boolean;
}

const NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const HAS_SHARP = ['C', 'D', 'F', 'G', 'A'];

export const VirtualPiano: React.FC<VirtualPianoProps> = ({ currentNote, targetNote, showHints, compact = false }) => {

  // Check if note matches, ignoring octave
  const isNoteActive = (note: string) => {
    if (!currentNote) return false;
    return currentNote.note === note;
  };

  const isTarget = (note: string) => {
    if (!showHints || !targetNote) return false;
    return targetNote.note === note;
  };

  const getKeyColor = (note: string, isBlack: boolean) => {
    const active = isNoteActive(note);
    const target = isTarget(note);

    if (active) return isBlack ? 'bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.8)]' : 'bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.6)]';
    if (target) return isBlack ? 'bg-blue-600 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-blue-200 shadow-[0_0_8px_rgba(59,130,246,0.5)]';
    return isBlack ? 'bg-slate-900 border-slate-950' : 'bg-slate-100 border-slate-300';
  };

  return (
    <div className={`flex justify-center ${compact ? 'p-1' : 'p-2'}`}>
        <div className={`
          relative flex
          ${compact ? 'p-1 gap-[1px]' : 'p-2'}
          bg-slate-800/80 rounded-lg border border-slate-700/50
          backdrop-blur-sm
        `}>
            {/* Single Octave Render */}
            <div className="flex flex-shrink-0 relative">
                {NOTES.map(note => {
                    const noteName = note;
                    const sharpName = `${note}#`;
                    const hasSharp = HAS_SHARP.includes(note);

                    return (
                        <div key={note} className="relative group">
                            {/* White Key */}
                            <div
                                className={`
                                    border-b-4 border-l border-r rounded-b-[4px] mx-[1px]
                                    transition-all duration-100 ease-out flex items-end justify-center pb-1 relative z-10
                                    ${compact ? 'w-6 h-16' : 'w-8 h-24 md:w-12 md:h-36'}
                                    ${getKeyColor(noteName, false)}
                                    ${isNoteActive(noteName) ? 'border-b-cyan-600 scale-[0.98] translate-y-0.5' : 'border-b-slate-300'}
                                `}
                            >
                               <span className={`
                                 font-bold select-none pointer-events-none
                                 ${compact ? 'text-[8px] mb-0.5' : 'text-[10px] md:text-xs mb-1'}
                                 ${isNoteActive(noteName) ? 'text-cyan-900' : 'text-slate-400'}
                               `}>
                                 {noteName}
                               </span>
                            </div>

                            {/* Black Key */}
                            {hasSharp && (
                                <div
                                    className={`
                                        absolute z-20 top-0 border-b-4 rounded-b text-[0px]
                                        border-x border-slate-950
                                        transition-all duration-100 ease-out
                                        ${compact ? 'w-4 h-10 -right-2 border-b-2' : 'w-5 h-14 md:w-8 md:h-20 -right-2.5 md:-right-4'}
                                        ${getKeyColor(sharpName, true)}
                                        ${isNoteActive(sharpName) ? 'border-b-cyan-700 scale-[0.98] translate-y-0.5' : 'border-b-black'}
                                    `}
                                >
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    </div>
  );
};