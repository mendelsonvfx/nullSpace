import { useState, useEffect, useRef, RefObject } from 'react';

// HSV ↔ RGB helpers
function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  s /= 100; v /= 100;
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), diff = max - min;
  let h = 0;
  if (diff !== 0) {
    if (max === r)      h = ((g - b) / diff) % 6;
    else if (max === g) h = (b - r) / diff + 2;
    else                h = (r - g) / diff + 4;
    h = h * 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : (diff / max) * 100, v: max * 100 };
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
}

interface ColorPickerPopupProps {
  isOpen: boolean;
  color: string;
  position: { top: number; left: number };
  triggerRef: RefObject<HTMLElement>;
  onChange: (color: string) => void;
  onApply: () => void;
  onCancel: () => void;
}

export function ColorPickerPopup({ isOpen, color, position, triggerRef, onChange, onApply, onCancel }: ColorPickerPopupProps) {
  const [pickerH, setPickerH] = useState(284);
  const [pickerS, setPickerS] = useState(98.5);
  const [pickerV, setPickerV] = useState(77.6);
  const canvasRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Sync HSV from color prop when picker opens
  useEffect(() => {
    if (isOpen) {
      const rgb = hexToRgb(color);
      if (rgb) {
        const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
        setPickerH(hsv.h);
        setPickerS(hsv.s);
        setPickerV(hsv.v);
      }
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Click-outside → cancel
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => {
      if (
        popupRef.current && !popupRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        onCancel();
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [isOpen, onCancel]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    const update = (clientX: number, clientY: number) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const s = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
      const v = Math.max(0, Math.min(100, 100 - ((clientY - rect.top) / rect.height) * 100));
      setPickerS(s);
      setPickerV(v);
      const rgb = hsvToRgb(pickerH, s, v);
      onChange(rgbToHex(rgb.r, rgb.g, rgb.b));
    };
    update(e.clientX, e.clientY);
    const onMove = (ev: MouseEvent) => update(ev.clientX, ev.clientY);
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const handleHueMouseDown = (e: React.MouseEvent) => {
    const update = (clientX: number) => {
      if (!hueRef.current) return;
      const rect = hueRef.current.getBoundingClientRect();
      const h = Math.max(0, Math.min(360, ((clientX - rect.left) / rect.width) * 360));
      setPickerH(h);
      const rgb = hsvToRgb(h, pickerS, pickerV);
      onChange(rgbToHex(rgb.r, rgb.g, rgb.b));
    };
    update(e.clientX);
    const onMove = (ev: MouseEvent) => update(ev.clientX);
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  if (!isOpen) return null;

  const hueColor = hsvToRgb(pickerH, 100, 100);

  return (
    <div
      ref={popupRef}
      className="fixed z-[9999] w-56 p-3 bg-sidebar-bg border border-border-primary rounded-button shadow-2xl space-y-2"
      style={{ top: position.top, left: position.left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="text-xs font-medium text-text-muted">Color Selection</div>

      {/* Hex input */}
      <input
        type="text"
        value={color}
        onChange={(e) => {
          const val = e.target.value.toUpperCase();
          onChange(val);
          if (/^#[0-9A-F]{6}$/.test(val)) {
            const rgb = hexToRgb(val);
            if (rgb) {
              const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
              setPickerH(hsv.h);
              setPickerS(hsv.s);
              setPickerV(hsv.v);
            }
          }
        }}
        maxLength={7}
        className="w-full bg-app-bg border border-border-primary rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-accent"
      />

      {/* Color canvas */}
      <div
        ref={canvasRef}
        className="w-full h-40 rounded-lg relative cursor-crosshair overflow-hidden border border-border-primary select-none"
        style={{
          backgroundColor: rgbToHex(hueColor.r, hueColor.g, hueColor.b),
          backgroundImage: 'linear-gradient(to bottom, transparent, #000), linear-gradient(to right, #fff, transparent)',
        }}
        onMouseDown={handleCanvasMouseDown}
      >
        <div
          className="absolute w-3 h-3 border-2 border-white rounded-full shadow pointer-events-none"
          style={{ left: `${pickerS}%`, top: `${100 - pickerV}%`, transform: 'translate(-50%, -50%)' }}
        />
      </div>

      {/* Hue slider */}
      <div
        ref={hueRef}
        className="w-full h-5 rounded-lg relative cursor-pointer overflow-hidden border border-border-primary select-none"
        style={{ backgroundImage: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)' }}
        onMouseDown={handleHueMouseDown}
      >
        <div
          className="absolute top-0 w-1 h-full bg-white rounded shadow pointer-events-none"
          style={{ left: `${(pickerH / 360) * 100}%`, transform: 'translateX(-50%)' }}
        />
      </div>

      {/* RGB inputs */}
      <div className="grid grid-cols-3 gap-2">
        {(['R', 'G', 'B'] as const).map((channel, i) => {
          const rgb = hsvToRgb(pickerH, pickerS, pickerV);
          const val = [rgb.r, rgb.g, rgb.b][i];
          return (
            <div key={channel} className="flex flex-col gap-1">
              <input
                type="number"
                min={0}
                max={255}
                value={val}
                onChange={(e) => {
                  const current = hsvToRgb(pickerH, pickerS, pickerV);
                  const raw: [number, number, number] = [current.r, current.g, current.b];
                  raw[i] = Math.max(0, Math.min(255, parseInt(e.target.value) || 0));
                  const hsv = rgbToHsv(raw[0], raw[1], raw[2]);
                  if (hsv.s > 0) setPickerH(hsv.h);
                  setPickerS(hsv.s);
                  setPickerV(hsv.v);
                  onChange(rgbToHex(raw[0], raw[1], raw[2]));
                }}
                className="bg-app-bg border border-border-primary rounded px-2 py-1 text-sm text-center focus:outline-none focus:border-accent"
              />
              <span className="text-xs text-text-muted text-center">{channel}</span>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 py-1 bg-border-secondary hover:bg-border-primary rounded text-sm transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onApply}
          className="flex-1 py-1 rounded text-sm font-medium text-white bg-accent hover:bg-accent-hover transition-colors"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
