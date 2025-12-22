import React, { useState, useEffect } from 'react';
import { TargetNote } from '../types';
import { getNoteSticker } from '../utils/audioHelpers';

interface TargetCardProps {
  targetNote: TargetNote | null;
  isMatched: boolean;
}

export const TargetCard: React.FC<TargetCardProps> = ({ targetNote, isMatched }) => {
  const stickerData = targetNote ? getNoteSticker(targetNote.note) : null;
  const [imageError, setImageError] = useState(false);

  // Reset error state when the target note changes
  useEffect(() => {
    setImageError(false);
  }, [targetNote]);

  return (
    <div className={`
      relative flex flex-col items-center justify-center 
      w-96 h-80 rounded-3xl border-4 overflow-hidden
      transition-all duration-300 ease-out transform
      ${isMatched 
        ? 'border-green-400 bg-green-900/30 scale-105 shadow-[0_0_50px_rgba(74,222,128,0.5)]' 
        : 'border-indigo-500/50 bg-slate-800/50 shadow-xl'}
    `}>
      <div className="absolute top-4 text-xs font-bold tracking-widest uppercase text-indigo-300 z-10">
        Play This Note
      </div>

      {targetNote ? (
        <div className="flex flex-col items-center relative z-10 w-full px-6">
          
          {/* Container for Side-by-Side Layout */}
          <div className="flex flex-row items-center justify-center gap-6 w-full">
            <div className={`
              text-8xl font-black tracking-tighter transition-colors duration-300
              ${isMatched ? 'text-green-400' : 'text-white'}
            `}>
              {targetNote.note}
            </div>

            {/* Sticker Display */}
            {stickerData && (
              <div className={`
                flex flex-col items-center justify-center
                transition-all duration-500
                ${isMatched ? 'animate-bounce scale-110' : 'animate-float hover-wiggle cursor-pointer'}
              `}>
                <div className="w-32 h-32 relative flex items-center justify-center p-2 transition-transform duration-300">
                  {!imageError ? (
                    <img 
                      src={`/${stickerData.filename}`} 
                      alt={stickerData.characterName}
                      title={stickerData.characterName}
                      className={`
                        w-full h-full object-contain transition-all duration-300
                        ${isMatched ? 'drop-shadow-[0_0_20px_rgba(74,222,128,0.6)] brightness-110' : 'drop-shadow-2xl hover:brightness-110'}
                      `}
                      onError={() => setImageError(true)}
                    />
                  ) : (
                    <span className="text-6xl select-none filter drop-shadow-lg" role="img" aria-label={stickerData.characterName}>
                      {stickerData.emoji}
                    </span>
                  )}
                </div>
                <span className={`
                  mt-2 text-xs font-bold tracking-wide uppercase opacity-80 transition-colors
                  ${isMatched ? 'text-green-200' : 'text-indigo-200'}
                `}>
                  {stickerData.characterName}
                </span>
              </div>
            )}
          </div>
          
          {isMatched && (
            <div className="absolute -bottom-16 px-4 py-1 bg-green-500 text-slate-900 text-sm font-bold rounded-full animate-bounce shadow-lg">
              Excellent!
            </div>
          )}
        </div>
      ) : (
        <div className="text-slate-500 font-mono text-sm">Press Start</div>
      )}
      
      {/* Background Glow */}
      {targetNote && isMatched && (
        <div className="absolute inset-0 bg-green-500/10 z-0 animate-pulse"></div>
      )}
    </div>
  );
};