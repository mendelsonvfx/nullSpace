import { useEffect, useState } from 'react';
import { X, Clock } from 'lucide-react';

interface DeadlineNotificationProps {
  projectName: string;
  daysRemaining: number;
  onClose: () => void;
}

export function DeadlineNotification({ projectName, daysRemaining, onClose }: DeadlineNotificationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState(100);
  const duration = 10000;

  useEffect(() => {
    setIsVisible(true);

    const progressInterval = setInterval(() => {
      setProgress((prev) => Math.max(0, prev - (100 / (duration / 100))));
    }, 100);

    const timer = setTimeout(() => {
      handleClose();
    }, duration);

    return () => {
      clearInterval(progressInterval);
      clearTimeout(timer);
    };
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 200);
  };

  const getBgColor = () => {
    if (daysRemaining === 0) return 'bg-red-600';
    if (daysRemaining === 1) return 'bg-orange-600';
    return 'bg-orange-500';
  };

  const getProgressColor = () => {
    if (daysRemaining === 0) return 'bg-red-800/50';
    if (daysRemaining === 1) return 'bg-orange-800/50';
    return 'bg-orange-700/50';
  };

  const getMessage = () => {
    if (daysRemaining === 0) return 'Deadline today!';
    if (daysRemaining === 1) return '1 day until deadline';
    return `${daysRemaining} days until deadline`;
  };

  return (
    <div
      className={`${getBgColor()} rounded-2xl shadow-xl transition-all duration-200 overflow-hidden ${
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'
      }`}
      style={{ minWidth: '300px', maxWidth: '400px' }}
    >
      {/* Content */}
      <div className="px-4 py-3 flex items-center gap-3">
        <Clock className="w-5 h-5 text-white flex-shrink-0" />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white mb-0.5">
            {getMessage()}
          </p>
          <p className="text-sm text-white opacity-90 break-words">
            {projectName}
          </p>
        </div>

        <button
          onClick={handleClose}
          className="text-white hover:opacity-70 transition-opacity flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className={`h-1 ${getProgressColor()}`}>
        <div
          className={`h-full ${getBgColor()} transition-all duration-100 ease-linear brightness-125`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
