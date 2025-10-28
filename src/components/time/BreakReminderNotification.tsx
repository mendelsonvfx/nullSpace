// src/components/time/BreakReminderNotification.tsx
import React, { useEffect, useState } from 'react';
import { Clock, Coffee, X } from 'lucide-react';
import { formatTime } from '../../features/time-tracking';

export interface BreakReminder {
  id: string;
  sessionId: string;
  projectName: string;
  duration: number; // Minutes worked
  breakDuration: number; // Recommended break minutes
  type: 'break' | 'break-over';
  message?: string;
}

interface BreakReminderNotificationProps {
  reminder: BreakReminder;
  onTakeBreak?: (sessionId: string, breakMinutes: number) => void;
  onDismiss: (id: string) => void;
}

export const BreakReminderNotification: React.FC<BreakReminderNotificationProps> = ({
  reminder,
  onTakeBreak,
  onDismiss
}) => {
  const [isVisible, setIsVisible] = useState(false);

  // Fade in animation
  useEffect(() => {
    const timeout = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timeout);
  }, []);

  // Auto-dismiss after 10 seconds
  useEffect(() => {
    const timeout = setTimeout(() => {
      handleDismiss();
    }, 10000);

    return () => clearTimeout(timeout);
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(() => {
      onDismiss(reminder.id);
    }, 300); // Wait for fade out animation
  };

  const handleTakeBreak = () => {
    if (onTakeBreak) {
      onTakeBreak(reminder.sessionId, reminder.breakDuration);
    }
    handleDismiss();
  };

  if (reminder.type === 'break-over') {
    return (
      <div
        className={`
          bg-zinc-800 border border-green-700/50 rounded-lg p-4 shadow-xl w-80
          transition-all duration-300 transform
          ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
        `}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
            <Clock className="w-5 h-5 text-green-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-white mb-1">
              Break over!
            </div>
            <div className="text-sm text-zinc-400">
              {reminder.message || 'Time to get back to work!'}
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 hover:bg-zinc-700 rounded transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`
        bg-zinc-800 border border-yellow-700/50 rounded-lg p-4 shadow-xl w-80
        transition-all duration-300 transform
        ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
      `}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0 animate-pulse">
          <Coffee className="w-5 h-5 text-yellow-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <div className="font-semibold text-white">
              Time for a break!
            </div>
            <button
              onClick={handleDismiss}
              className="p-1 hover:bg-zinc-700 rounded transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4 text-zinc-400" />
            </button>
          </div>
          <div className="text-sm text-zinc-400 mb-3">
            You've been working on <span className="font-medium text-white">{reminder.projectName}</span> for {formatTime(reminder.duration)}
          </div>
          <button
            onClick={handleTakeBreak}
            className="w-full px-3 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-sm font-medium text-white transition-colors flex items-center justify-center gap-2"
          >
            <Coffee className="w-4 h-4" />
            Take {reminder.breakDuration} min break
          </button>
        </div>
      </div>
    </div>
  );
};

interface BreakReminderContainerProps {
  reminders: BreakReminder[];
  onTakeBreak?: (sessionId: string, breakMinutes: number) => void;
  onDismiss: (id: string) => void;
}

export const BreakReminderContainer: React.FC<BreakReminderContainerProps> = ({
  reminders,
  onTakeBreak,
  onDismiss
}) => {
  if (reminders.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-3 pointer-events-none">
      <div className="pointer-events-auto">
        {reminders.map(reminder => (
          <div key={reminder.id} className="mb-3">
            <BreakReminderNotification
              reminder={reminder}
              onTakeBreak={onTakeBreak}
              onDismiss={onDismiss}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
