import { useEffect, useState } from 'react';
import { X, AlertCircle } from 'lucide-react';

interface DeadlineNotificationProps {
  projectName: string;
  daysRemaining: number;
  onClose: () => void;
}

export function DeadlineNotification({ projectName, daysRemaining, onClose }: DeadlineNotificationProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Auto-hide after 10 seconds
    const timer = setTimeout(() => {
      handleClose();
    }, 10000);

    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300); // Wait for animation to complete
  };

  const getBgColor = () => {
    if (daysRemaining === 0) return 'bg-red-600/90';
    if (daysRemaining === 1) return 'bg-orange-600/90';
    return 'bg-orange-500/90';
  };

  const getMessage = () => {
    if (daysRemaining === 0) return 'Дедлайн сегодня!';
    if (daysRemaining === 1) return 'Остался 1 день до дедлайна';
    return `Осталось ${daysRemaining} дня до дедлайна`;
  };

  return (
    <div
      className={`transition-all duration-300 ${
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
    >
      <div
        className={`${getBgColor()} backdrop-blur-sm rounded-lg shadow-2xl p-4 min-w-[320px] max-w-[400px] border border-white/20`}
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="w-6 h-6 text-white flex-shrink-0 mt-0.5" />

          <div className="flex-1 min-w-0">
            <h3 className="text-white font-semibold text-sm mb-1">
              {getMessage()}
            </h3>
            <p className="text-white/90 text-sm break-words">
              {projectName}
            </p>
          </div>

          <button
            onClick={handleClose}
            className="text-white/80 hover:text-white transition-colors flex-shrink-0"
            aria-label="Закрыть уведомление"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress bar for auto-hide */}
        <div className="mt-3 h-1 bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-white/60 rounded-full animate-shrink"
            style={{
              animation: 'shrink 10s linear forwards'
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes shrink {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
        .animate-shrink {
          animation: shrink 10s linear forwards;
        }
      `}</style>
    </div>
  );
}
