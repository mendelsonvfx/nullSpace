// Utility functions and constants
export * from './colorUtils';
export * from './constants';

export function isNewerVersion(current: string, stored: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
  const [cMaj = 0, cMin = 0, cPat = 0] = parse(current);
  const [sMaj = 0, sMin = 0, sPat = 0] = parse(stored);
  if (cMaj !== sMaj) return cMaj > sMaj;
  if (cMin !== sMin) return cMin > sMin;
  return cPat > sPat;
}
