import React from 'react';
import { Sparkles, Loader2 } from 'lucide-react';

interface StoryCardProps {
  storyText: string;
  isLoading: boolean;
}

export const StoryCard: React.FC<StoryCardProps> = ({ storyText, isLoading }) => {
  return (
    <div className="w-full max-w-2xl mb-6 relative">
      {/* Decorative Background */}
      <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 rounded-2xl blur opacity-25"></div>
      
      <div className="relative bg-slate-900/90 border border-slate-700/50 rounded-xl p-6 md:p-8 min-h-[120px] flex flex-col items-center justify-center text-center shadow-2xl">
        
        {/* Header Label */}
        <div className="absolute -top-3 bg-slate-950 px-3 py-1 rounded-full border border-purple-500/30 flex items-center gap-2">
          <Sparkles className="w-3 h-3 text-purple-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-purple-300">Story Mode</span>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
            <span className="text-sm font-medium animate-pulse">Writing next chapter...</span>
          </div>
        ) : (
          <p className="text-xl md:text-2xl font-serif font-medium text-slate-100 leading-relaxed animate-pop-in">
            “{storyText}”
          </p>
        )}

      </div>
    </div>
  );
};