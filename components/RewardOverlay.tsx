import React from 'react';
import { Star } from 'lucide-react';

export const RewardOverlay: React.FC = () => {
  return (
    <div className="fixed inset-0 pointer-events-none z-50 flex items-start justify-center pt-16 md:pt-24">
      {/* Background radial burst */}
      <div className="absolute inset-0 bg-radial-gradient from-yellow-500/20 to-transparent opacity-0 animate-pulse"></div>
      
      {/* Pop-in Star Container */}
      <div className="animate-pop-in relative transform transition-all duration-500">
        <Star className="w-48 h-48 md:w-64 md:h-64 text-yellow-400 fill-yellow-400 drop-shadow-[0_0_50px_rgba(250,204,21,0.8)] animate-spin-slow" />
        
        {/* Sparkles (simulated with smaller stars absolutely positioned) */}
        <Star className="absolute -top-4 -right-4 w-12 h-12 text-yellow-200 fill-white animate-bounce delay-75" />
        <Star className="absolute top-1/2 -left-8 w-8 h-8 text-yellow-300 fill-yellow-100 animate-pulse" />
        <Star className="absolute -bottom-2 right-1/2 w-10 h-10 text-yellow-300 fill-white animate-bounce delay-150" />

        <div className="absolute inset-0 flex items-center justify-center">
             <span className="text-3xl md:text-4xl font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] -rotate-3">
               Perfect!
             </span>
        </div>
      </div>
    </div>
  );
};