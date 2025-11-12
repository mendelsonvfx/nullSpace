import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Info, X, Clock } from 'lucide-react';

export interface GeneralNotification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  title?: string; // Optional title
  duration?: number; // in milliseconds, default 5000
}

interface GeneralNotificationProps {
  notification: GeneralNotification;
  onClose: () => void;
}

export function GeneralNotification({ notification, onClose }: GeneralNotificationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState(100);
  const duration = notification.duration || 5000;

  useEffect(() => {
    setIsVisible(true);

    const progressInterval = setInterval(() => {
      setProgress((prev) => Math.max(0, prev - (100 / (duration / 100))));
    }, 100);

    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 200);
    }, duration);

    return () => {
      clearInterval(progressInterval);
      clearTimeout(timer);
    };
  }, [duration, onClose]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 200);
  };

  const getConfig = () => {
    switch (notification.type) {
      case 'success':
        return {
          bgColor: 'bg-green-600',
          textColor: 'text-white',
          icon: <CheckCircle className="w-5 h-5" />,
          progressColor: 'bg-green-800/50'
        };
      case 'error':
        return {
          bgColor: 'bg-red-600',
          textColor: 'text-white',
          icon: <AlertCircle className="w-5 h-5" />,
          progressColor: 'bg-red-800/50'
        };
      case 'warning':
        return {
          bgColor: 'bg-orange-600',
          textColor: 'text-white',
          icon: <Clock className="w-5 h-5" />,
          progressColor: 'bg-orange-800/50'
        };
      case 'info':
        return {
          bgColor: 'bg-blue-600',
          textColor: 'text-white',
          icon: <Info className="w-5 h-5" />,
          progressColor: 'bg-blue-800/50'
        };
    }
  };

  const config = getConfig();

  return (
    <div
      className={`${config.bgColor} rounded-2xl shadow-xl transition-all duration-200 overflow-hidden ${
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'
      }`}
      style={{ minWidth: '300px', maxWidth: '400px' }}
    >
      {/* Content */}
      <div className="px-4 py-3 flex items-center gap-3">
        <div className={config.textColor}>{config.icon}</div>
        <div className="flex-1 min-w-0">
          {notification.title && (
            <p className={`text-sm font-semibold ${config.textColor} mb-0.5`}>
              {notification.title}
            </p>
          )}
          <p className={`text-sm ${config.textColor} break-words ${notification.title ? 'opacity-90' : ''}`}>
            {notification.message}
          </p>
        </div>
        <button
          onClick={handleClose}
          className={`${config.textColor} hover:opacity-70 transition-opacity flex-shrink-0`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {/* Progress bar */}
      <div className={`h-1 ${config.progressColor}`}>
        <div
          className={`h-full ${config.bgColor} transition-all duration-100 ease-linear brightness-125`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
