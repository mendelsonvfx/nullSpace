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
        className={`bg-green-600 rounded-2xl shadow-xl overflow-hidden transition-all duration-200 ${
          isVisible ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'
        }`}
        style={{ minWidth: '300px', maxWidth: '400px' }}
      >
        <div className="px-4 py-3 flex items-center gap-3">
          <Clock className="w-5 h-5 text-white flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white mb-0.5">
              Break over!
            </div>
            <div className="text-sm text-white opacity-90">
              {reminder.message || 'Time to get back to work!'}
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-white hover:opacity-70 transition-opacity flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-orange-600 rounded-2xl shadow-xl overflow-hidden transition-all duration-200 ${
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'
      }`}
      style={{ minWidth: '300px', maxWidth: '400px' }}
    >
      <div className="px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <Coffee className="w-5 h-5 text-white flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white mb-0.5">
              Time for a break!
            </div>
            <div className="text-sm text-white opacity-90">
              You've been working on <span className="font-semibold">{reminder.projectName}</span> for {formatTime(reminder.duration)}
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-white hover:opacity-70 transition-opacity flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={handleTakeBreak}
          className="w-full px-3 py-2.5 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium text-white transition-colors flex items-center justify-center gap-2"
        >
          <Coffee className="w-4 h-4" />
          Take {reminder.breakDuration} min break
        </button>
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
