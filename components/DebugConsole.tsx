
import React, { useEffect, useState, useRef } from 'react';
import { logger, LogEntry } from '../utils/logger';
import { X, Trash2, Terminal } from 'lucide-react';

interface DebugConsoleProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DebugConsole: React.FC<DebugConsoleProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Subscribe to logger
    const unsubscribe = logger.subscribe((entry) => {
      setLogs(prev => [...prev, entry]);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 w-full max-w-lg h-80 bg-slate-950 border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden z-50 font-mono text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2 text-cyan-400 font-bold">
          <Terminal className="w-4 h-4" />
          <span>Debug Console</span>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setLogs([])}
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-red-400 transition-colors"
            title="Clear Logs"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Log Content */}
      <div ref={scrollRef} className="flex-grow overflow-y-auto p-3 space-y-1 custom-scrollbar">
        {logs.length === 0 && (
          <div className="text-slate-600 italic text-center mt-10">Waiting for events...</div>
        )}
        {logs.map((log) => (
          <div key={log.id} className="flex gap-2 animate-pop-in">
            <span className="text-slate-600 shrink-0">
              {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}
            </span>
            <span className={`
              break-words
              ${log.type === 'error' ? 'text-red-400' : ''}
              ${log.type === 'warn' ? 'text-yellow-400' : ''}
              ${log.type === 'success' ? 'text-green-400' : ''}
              ${log.type === 'info' ? 'text-slate-300' : ''}
            `}>
              {log.type === 'error' && '❌ '}
              {log.type === 'warn' && '⚠️ '}
              {log.type === 'success' && '✅ '}
              {log.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
