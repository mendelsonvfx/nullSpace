// src/hooks/useModalBlur.ts
import { useState, useEffect } from 'react';

export const useModalBlur = (): string => {
  const [blurClass, setBlurClass] = useState(() => {
    const saved = localStorage.getItem('modalBlurEnabled');
    const isEnabled = saved !== null ? JSON.parse(saved) : true;
    return isEnabled ? 'backdrop-blur-[2px]' : '';
  });

  useEffect(() => {
    const handleStorageChange = () => {
      const saved = localStorage.getItem('modalBlurEnabled');
      const isEnabled = saved !== null ? JSON.parse(saved) : true;
      setBlurClass(isEnabled ? 'backdrop-blur-[2px]' : '');
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return blurClass;
};
