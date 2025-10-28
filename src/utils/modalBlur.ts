// src/utils/modalBlur.ts

export const getModalBlurClass = (): string => {
  const saved = localStorage.getItem('modalBlurEnabled');
  const isEnabled = saved !== null ? JSON.parse(saved) : true;
  return isEnabled ? 'backdrop-blur-[2px]' : '';
};
