import type React from 'react';
import {
  IconBrandPython,
  IconBrandReact,
  IconTerminal2,
  IconPackage,
  IconPhoto,
  IconMovie,
  IconMusic,
  IconFileZip,
  IconFileText,
  IconPdf,
} from '@tabler/icons-react';

/** File type icons by extension (Project Structure, Render Output) */
export const EXTENSION_ICONS: Record<string, React.ReactNode> = {
  py:   <IconBrandPython className="w-4 h-4 text-blue-400 flex-shrink-0" stroke={1.5} />,
  jsx:  <IconBrandReact  className="w-4 h-4 text-cyan-400 flex-shrink-0" stroke={1.5} />,
  tsx:  <IconBrandReact  className="w-4 h-4 text-cyan-400 flex-shrink-0" stroke={1.5} />,
  bat:  <IconTerminal2   className="w-4 h-4 text-yellow-400 flex-shrink-0" stroke={1.5} />,
  sh:   <IconTerminal2   className="w-4 h-4 text-yellow-400 flex-shrink-0" stroke={1.5} />,
  exe:  <IconPackage     className="w-4 h-4 text-zinc-400 flex-shrink-0" stroke={1.5} />,
  zip:  <IconFileZip     className="w-4 h-4 text-amber-400 flex-shrink-0" stroke={1.5} />,
  rar:  <IconFileZip     className="w-4 h-4 text-amber-400 flex-shrink-0" stroke={1.5} />,
  '7z': <IconFileZip     className="w-4 h-4 text-amber-400 flex-shrink-0" stroke={1.5} />,
  tar:  <IconFileZip     className="w-4 h-4 text-amber-400 flex-shrink-0" stroke={1.5} />,
  gz:   <IconFileZip     className="w-4 h-4 text-amber-400 flex-shrink-0" stroke={1.5} />,
  txt:  <IconFileText    className="w-4 h-4 text-zinc-400 flex-shrink-0" stroke={1.5} />,
  pdf:  <IconPdf         className="w-4 h-4 text-red-400 flex-shrink-0" stroke={1.5} />,
  jpg:  <IconPhoto       className="w-4 h-4 text-emerald-400 flex-shrink-0" stroke={1.5} />,
  jpeg: <IconPhoto       className="w-4 h-4 text-emerald-400 flex-shrink-0" stroke={1.5} />,
  png:  <IconPhoto       className="w-4 h-4 text-emerald-400 flex-shrink-0" stroke={1.5} />,
  gif:  <IconPhoto       className="w-4 h-4 text-emerald-400 flex-shrink-0" stroke={1.5} />,
  webp: <IconPhoto       className="w-4 h-4 text-emerald-400 flex-shrink-0" stroke={1.5} />,
  bmp:  <IconPhoto       className="w-4 h-4 text-emerald-400 flex-shrink-0" stroke={1.5} />,
  svg:  <IconPhoto       className="w-4 h-4 text-emerald-400 flex-shrink-0" stroke={1.5} />,
  tiff: <IconPhoto       className="w-4 h-4 text-emerald-400 flex-shrink-0" stroke={1.5} />,
  tif:  <IconPhoto       className="w-4 h-4 text-emerald-400 flex-shrink-0" stroke={1.5} />,
  ico:  <IconPhoto       className="w-4 h-4 text-emerald-400 flex-shrink-0" stroke={1.5} />,
  tga:  <IconPhoto       className="w-4 h-4 text-emerald-400 flex-shrink-0" stroke={1.5} />,
  exr:  <IconPhoto       className="w-4 h-4 text-emerald-400 flex-shrink-0" stroke={1.5} />,
  hdr:  <IconPhoto       className="w-4 h-4 text-emerald-400 flex-shrink-0" stroke={1.5} />,
  dpx:  <IconPhoto       className="w-4 h-4 text-emerald-400 flex-shrink-0" stroke={1.5} />,
  mp4:  <IconMovie       className="w-4 h-4 text-purple-400 flex-shrink-0" stroke={1.5} />,
  mov:  <IconMovie       className="w-4 h-4 text-purple-400 flex-shrink-0" stroke={1.5} />,
  avi:  <IconMovie       className="w-4 h-4 text-purple-400 flex-shrink-0" stroke={1.5} />,
  mkv:  <IconMovie       className="w-4 h-4 text-purple-400 flex-shrink-0" stroke={1.5} />,
  webm: <IconMovie       className="w-4 h-4 text-purple-400 flex-shrink-0" stroke={1.5} />,
  flv:  <IconMovie       className="w-4 h-4 text-purple-400 flex-shrink-0" stroke={1.5} />,
  wmv:  <IconMovie       className="w-4 h-4 text-purple-400 flex-shrink-0" stroke={1.5} />,
  m4v:  <IconMovie       className="w-4 h-4 text-purple-400 flex-shrink-0" stroke={1.5} />,
  mxf:  <IconMovie       className="w-4 h-4 text-purple-400 flex-shrink-0" stroke={1.5} />,
  wav:  <IconMusic       className="w-4 h-4 text-pink-400 flex-shrink-0" stroke={1.5} />,
  mp3:  <IconMusic       className="w-4 h-4 text-pink-400 flex-shrink-0" stroke={1.5} />,
  aac:  <IconMusic       className="w-4 h-4 text-pink-400 flex-shrink-0" stroke={1.5} />,
  flac: <IconMusic       className="w-4 h-4 text-pink-400 flex-shrink-0" stroke={1.5} />,
  ogg:  <IconMusic       className="w-4 h-4 text-pink-400 flex-shrink-0" stroke={1.5} />,
  opus: <IconMusic       className="w-4 h-4 text-pink-400 flex-shrink-0" stroke={1.5} />,
  m4a:  <IconMusic       className="w-4 h-4 text-pink-400 flex-shrink-0" stroke={1.5} />,
  aif:  <IconMusic       className="w-4 h-4 text-pink-400 flex-shrink-0" stroke={1.5} />,
  aiff: <IconMusic       className="w-4 h-4 text-pink-400 flex-shrink-0" stroke={1.5} />,
  wma:  <IconMusic       className="w-4 h-4 text-pink-400 flex-shrink-0" stroke={1.5} />,
};

const extOf = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};

export function getExtensionIcon(fileName: string): React.ReactNode | null {
  return EXTENSION_ICONS[extOf(fileName)] ?? null;
}

/** Image formats with a thumbnail (decoded in Rust: image_thumbnail.rs, or ffmpeg for webp/dpx/sgi/pic/rgb) */
const PREVIEW_IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tga', 'tif', 'tiff', 'exr', 'hdr', 'psd', 'psb', 'dpx', 'sgi', 'pic', 'rgb',
]);

/** Video formats with a thumbnail and scrubbing (ffmpeg) */
const PREVIEW_VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm', 'mxf', 'wmv', 'flv']);

export function isPreviewImage(name: string): boolean {
  return PREVIEW_IMAGE_EXTENSIONS.has(extOf(name));
}

export function isPreviewVideo(name: string): boolean {
  return PREVIEW_VIDEO_EXTENSIONS.has(extOf(name));
}
