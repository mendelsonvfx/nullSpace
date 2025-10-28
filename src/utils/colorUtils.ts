// Helper function to darken color by percentage
export function darkenColor(hex: string, percent: number): string {
  // Remove # if present
  hex = hex.replace('#', '');

  // Parse RGB values
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Darken each channel
  const factor = 1 - (percent / 100);
  const newR = Math.round(r * factor);
  const newG = Math.round(g * factor);
  const newB = Math.round(b * factor);

  // Convert back to hex
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
}

export const generateBrightColor = () => {
  const hue = Math.floor(Math.random() * 360);
  const saturation = 70 + Math.floor(Math.random() * 20); // 70-90%
  const lightness = 50 + Math.floor(Math.random() * 10);  // 50-60%
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

// Convert HSL to Hex
export function hslToHex(h: number, s: number, l: number): string {
  l /= 100;
  const a = s * Math.min(l, 1 - l) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Generate a consistent HSL color for a project based on its ID
 * Uses the same algorithm as Finance page pie chart
 * @param projectId - Project ID to generate color for
 * @returns HSL color string (e.g., "hsl(180, 85%, 60%)")
 */
export function generateProjectColor(projectId: string): string {
  const hash = projectId.split('').reduce((acc: number, char: string) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);

  const hue = Math.abs(hash % 360);

  // Use more vibrant colors: higher saturation (85-95%) and medium-high lightness (55-65%)
  const saturation = 85 + (Math.abs(hash) % 11); // 85-95%
  const lightness = 55 + (Math.abs(hash >> 8) % 11); // 55-65%

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Get project color or generate fallback if not set
 * @param project - Project object
 * @returns HSL color string
 */
export function getProjectColor(project: { id: string; color?: string }): string {
  return project.color || generateProjectColor(project.id);
}

/**
 * Create a soft gradient from a color (supports hex and hsl)
 * Creates a gradient that goes from darker (left) to brighter (right)
 * @param color - Color string (hex like "#8b5cf6" or hsl like "hsl(180, 85%, 60%)")
 * @returns CSS gradient string
 */
export function createSoftGradient(color: string): string {
  // If it's an HSL color, we can use it directly with lightness adjustment
  if (color.startsWith('hsl(')) {
    // Extract hsl values: hsl(180, 85%, 60%) -> [180, 85, 60]
    const match = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (match) {
      const [, h, s, l] = match;
      const lightness = parseInt(l);
      // Create gradient from darker to brighter (reversed)
      const darkerL = Math.max(lightness - 8, 35);
      const brighterL = Math.min(lightness + 12, 95);
      return `linear-gradient(135deg, hsl(${h}, ${s}%, ${darkerL}%) 0%, hsl(${h}, ${s}%, ${brighterL}%) 100%)`;
    }
  }

  // If it's a hex color, convert to hsl for better control
  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    // Convert RGB to HSL
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    // Convert to degrees and percentages
    h = Math.round(h * 360);
    s = Math.round(s * 100);
    l = Math.round(l * 100);

    // Create gradient from darker to brighter (reversed)
    const darkerL = Math.max(l - 8, 35);
    const brighterL = Math.min(l + 12, 95);
    return `linear-gradient(135deg, hsl(${h}, ${s}%, ${darkerL}%) 0%, hsl(${h}, ${s}%, ${brighterL}%) 100%)`;
  }

  // Fallback: use color as-is
  return color;
}
