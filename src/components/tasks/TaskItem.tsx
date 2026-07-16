import { useState, useRef, useEffect, useCallback, type CSSProperties, type ReactElement } from 'react';
import { Paperclip, X, Plus, Image, ChevronDown } from 'lucide-react';
import { IconCheck, IconFolderOpen, IconCopy, IconClipboard, IconTrash, IconPdf, IconFileText, IconMovie } from '@tabler/icons-react';
import { invoke } from '@tauri-apps/api/tauri';
import { readBinaryFile, removeFile, removeDir, readTextFile } from '@tauri-apps/api/fs';
import { selectAttachmentFile } from '../../utils/tauri';
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from '../ui/ContextMenu';
import { useContextMenu } from '../../hooks/useContextMenu';
import type { TodoItem, TaskAttachment, AttachmentFileType } from '../../types/project';

interface TaskItemProps {
  todo: TodoItem;
  onToggle: () => void;
  onRemove: () => void;
  onUpdate: (patch: Partial<TodoItem>) => void;
  projectPath: string;
  attachmentSubdir: string;
  isLastTaskWithAttachments?: boolean;
}

const PRIORITY_COLOR: Record<string, string> = {
  high: '#ef4444',
  med:  '#d99a3d',
  low:  '#4da6e8',
};

const PRIORITY_LABEL: Record<string, string> = {
  high: 'HIGH',
  med:  'MED',
  low:  'LOW',
};

const TYPE_FOLDER: Record<AttachmentFileType, string> = {
  image: 'img', video: 'vid', pdf: 'pdf', text: 'txt',
};

function detectFileType(name: string): AttachmentFileType {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['png','jpg','jpeg','gif','webp','bmp'].includes(ext)) return 'image';
  if (['mp4','mov','avi','mkv','mxf','webm'].includes(ext)) return 'video';
  if (ext === 'pdf') return 'pdf';
  return 'text';
}

function formatDeadline(iso: string): { text: string; color: string } {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return { text: 'Today',             color: '#d99a3d' };
  if (diff < 0)  return { text: `${-diff}d overdue`,  color: '#ef4444' };
  if (diff <= 3) return { text: `${diff}d left`,      color: '#d99a3d' };
  if (diff <= 7) return { text: `${diff}d left`,      color: '#9a9aa3' };
  return {
    text: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    color: '#6f6f78',
  };
}

// function getWeekDays(): Date[] {
//   return Array.from({ length: 7 }, (_, i) => {
//     const d = new Date();
//     const dow = d.getDay();
//     const monday = new Date(d);
//     monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1) + i);
//     monday.setHours(0, 0, 0, 0);
//     return monday;
//   });
// }

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function AttachmentThumb({ att, size = 'sm' }: { att: TaskAttachment; size?: 'sm' | 'lg' }) {
  const type = att.fileType ?? detectFileType(att.name);
  const [imgSrc, setImgSrc] = useState('');
  const [textPreview, setTextPreview] = useState<string | null>(null);

  useEffect(() => {
    if (type !== 'image') return;
    readBinaryFile(att.path)
      .then(data => {
        const ext = att.name.split('.').pop()?.toLowerCase() ?? 'png';
        const mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : `image/${ext}`;
        // Chunked btoa — avoids call stack overflow on large files
        let binary = '';
        const chunk = 8192;
        for (let i = 0; i < data.length; i += chunk) {
          binary += String.fromCharCode(...data.subarray(i, i + chunk));
        }
        setImgSrc(`data:${mime};base64,${btoa(binary)}`);
      })
      .catch(() => {});
  }, [att.path, type]);

  useEffect(() => {
    if (type !== 'text' || size !== 'lg') return;
    let cancelled = false;
    readTextFile(att.path)
      .then(content => { if (!cancelled) setTextPreview(content.slice(0, 400) || null); })
      .catch(() => { if (!cancelled) setTextPreview(null); });
    return () => { cancelled = true; };
  }, [att.path, type, size]);

  if (type === 'text' && size === 'lg' && textPreview !== null) {
    return (
      <div className="w-full h-full p-2 overflow-hidden">
        <pre className="text-[8.5px] text-text-secondary leading-[1.45] font-mono whitespace-pre-wrap break-all select-none">
          {textPreview}
        </pre>
      </div>
    );
  }

  if (type !== 'image') {
    const iconCls = size === 'lg' ? 'w-10 h-10' : 'w-5 h-5';
    const THUMB_ICONS: Record<Exclude<AttachmentFileType, 'image'>, ReactElement> = {
      pdf:   <IconPdf       className={`${iconCls} text-red-400`}    stroke={1.5} />,
      text:  <IconFileText  className={`${iconCls} text-zinc-400`}   stroke={1.5} />,
      video: <IconMovie     className={`${iconCls} text-purple-400`} stroke={1.5} />,
    };
    return (
      <div className="w-full h-full flex items-center justify-center">
        {THUMB_ICONS[type]}
      </div>
    );
  }

  if (!imgSrc) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Image className="w-4 h-4 text-text-muted" strokeWidth={1.4} />
      </div>
    );
  }

  return <img src={imgSrc} alt={att.name} className="w-full h-full object-cover" />;
}

export function TaskItem({ todo, onToggle, onRemove, onUpdate, projectPath, attachmentSubdir, isLastTaskWithAttachments }: TaskItemProps) {
  const [expanded, setExpanded]         = useState(todo.expanded ?? false);
  const [isHovered, setIsHovered]       = useState(false);
  const [attachHover, setAttachHover]   = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [hoveredAttId,    setHoveredAttId]    = useState<string | null>(null);
  const [popupBaseStyle,  setPopupBaseStyle]  = useState<CSSProperties>({ position: 'fixed', top: 0, left: -9999 });
  const [hoveredFileSize, setHoveredFileSize] = useState<string | null>(null);
  const [showAttachmentPreview, setShowAttachmentPreview] = useState(() => {
    const s = localStorage.getItem('taskAttachmentPreview');
    return s !== null ? JSON.parse(s) : true;
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const attachments  = todo.attachments ?? [];
  const attCount     = attachments.length;

  const attachmentsRef = useRef(attachments);
  useEffect(() => { attachmentsRef.current = attachments; }, [attachments]);
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
  const justRemovedRef = useRef(false);

  useEffect(() => {
    const handler = () => {
      const s = localStorage.getItem('taskAttachmentPreview');
      setShowAttachmentPreview(s !== null ? JSON.parse(s) : true);
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  useEffect(() => {
    if (!hoveredAttId) { setHoveredFileSize(null); return; }
    const att = attachmentsRef.current.find(a => a.id === hoveredAttId);
    if (!att) return;
    let cancelled = false;
    invoke<number>('get_file_size', { path: att.path })
      .then(bytes => { if (!cancelled) setHoveredFileSize(formatBytes(bytes)); })
      .catch(() => { if (!cancelled) setHoveredFileSize(null); });
    return () => { cancelled = true; };
  }, [hoveredAttId]);

  useEffect(() => {
    if (!hoveredAttId) return;
    const handler = () => setHoveredAttId(null);
    window.addEventListener('scroll', handler, true);
    return () => window.removeEventListener('scroll', handler, true);
  }, [hoveredAttId]);

  const { isOpen: isAttachMenuOpen, position: attachMenuPos, data: attachMenuData,
          openMenu: openAttachMenu, closeMenu: closeAttachMenu } = useContextMenu<TaskAttachment>();

  const pasteFromClipboard = useCallback(async () => {
    // CF_HDROP: file copied from Explorer
    try {
      const nativePath = await invoke<string>('get_clipboard_file_path');
      const name = nativePath.replace(/\\/g, '/').split('/').pop()!;
      const fileType = detectFileType(name);
      const subdir = `${attachmentSubdir}/${TYPE_FOLDER[fileType]}`;
      const fullPath = await invoke<string>('copy_attachment', {
        srcPath: nativePath.replace(/\//g, '\\'), projectPath, subdir, filename: name,
      });
      onUpdateRef.current({ attachments: [...attachmentsRef.current, { id: crypto.randomUUID(), name, size: '—', path: fullPath, fileType }] });
      return;
    } catch { /* no file path in clipboard */ }
    // CF_BITMAP: screenshot or "Copy Image"
    const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    try {
      const fullPath = await invoke<string>('paste_clipboard_image', {
        projectPath, subdir: `${attachmentSubdir}/img`, filename: `paste-${ts}.png`,
      });
      onUpdateRef.current({ attachments: [...attachmentsRef.current, { id: crypto.randomUUID(), name: `paste-${ts}.png`, size: '—', path: fullPath, fileType: 'image' as AttachmentFileType }] });
    } catch { /* no image in clipboard */ }
  }, [projectPath, attachmentSubdir]);

  // Clipboard paste listener — active when mouse is over this task row.
  // Uses capture phase so it fires before React's delegation (which would trigger
  // ProjectDetails.handlePaste → set_project_thumbnail for the same paste event).
  useEffect(() => {
    if (!isHovered) return;

    const handlePaste = async (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      // While hovering a task, claim the paste — prevents ProjectDetails.onPaste
      // from running processImageBlob / set_project_thumbnail on the same event.
      e.stopPropagation();

      const items = e.clipboardData?.items;
      let hasImage = false;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith('image/')) { hasImage = true; break; }
        }
      }
      const textData = e.clipboardData?.getData('text')?.trim() ?? '';

      // Strategy 1: text has a file path (getData works in some WebView environments)
      const isFilePath = /\.[a-zA-Z0-9]{2,5}$/.test(textData)
        && (textData.includes('\\') || textData.includes('/'));
      if (isFilePath && !hasImage) {
        const name = textData.replace(/\\/g, '/').split('/').pop()!;
        const fileType = detectFileType(name);
        const subdir = `${attachmentSubdir}/${TYPE_FOLDER[fileType]}`;
        try {
          const fullPath = await invoke<string>('copy_attachment', {
            srcPath: textData, projectPath, subdir, filename: name,
          });
          onUpdateRef.current({ attachments: [...attachmentsRef.current, { id: crypto.randomUUID(), name, size: '—', path: fullPath, fileType }] });
        } catch (err) { console.error('copy_attachment from path failed:', err); }
        return;
      }

      // Strategy 2: clipboard has image bitmap (screenshot, "Copy Image" in browser, etc.)
      if (hasImage) {
        const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
        const filenameStem = isFilePath
          ? (textData.replace(/\\/g, '/').split('/').pop()?.replace(/\.[^.]+$/, '') ?? `paste-${ts}`)
          : `paste-${ts}`;
        const filename = `${filenameStem}.png`;
        try {
          const fullPath = await invoke<string>('paste_clipboard_image', {
            projectPath, subdir: `${attachmentSubdir}/img`, filename,
          });
          onUpdateRef.current({ attachments: [...attachmentsRef.current, { id: crypto.randomUUID(), name: filename, size: '—', path: fullPath, fileType: 'image' as AttachmentFileType }] });
          return;
        } catch {
          // arboard found no CF_BITMAP — file likely copied from Explorer (CF_HDROP only)
          // fall through to strategy 3
        }
      }

      // Strategy 3: read CF_HDROP natively (file copied from Explorer / Desktop)
      try {
        const nativePath = await invoke<string>('get_clipboard_file_path');
        const name = nativePath.replace(/\\/g, '/').split('/').pop()!;
        const fileType = detectFileType(name);
        const subdir = `${attachmentSubdir}/${TYPE_FOLDER[fileType]}`;
        const fullPath = await invoke<string>('copy_attachment', {
          srcPath: nativePath.replace(/\//g, '\\'), projectPath, subdir, filename: name,
        });
        onUpdateRef.current({ attachments: [...attachmentsRef.current, { id: crypto.randomUUID(), name, size: '—', path: fullPath, fileType }] });
      } catch { /* no file in clipboard */ }
    };

    document.addEventListener('paste', handlePaste, { capture: true });
    return () => document.removeEventListener('paste', handlePaste, { capture: true });
  }, [isHovered, projectPath, attachmentSubdir]);

  const addAttachment = async () => {
    const srcPath = await selectAttachmentFile();
    if (!srcPath) return;
    const name = (srcPath as string).split(/[\\/]/).pop() ?? (srcPath as string);
    const fileType = detectFileType(name);
    const subdir = `${attachmentSubdir}/${TYPE_FOLDER[fileType]}`;
    try {
      const fullPath = await invoke<string>('copy_attachment', { srcPath, projectPath, subdir, filename: name });
      onUpdate({ attachments: [...attachments, { id: crypto.randomUUID(), name, size: '—', path: fullPath, fileType }] });
    } catch (err) {
      console.error('copy_attachment failed:', err);
    }
  };

  const removeAttachment = async (id: string) => {
    justRemovedRef.current = true;
    setTimeout(() => { justRemovedRef.current = false; }, 400);
    const att = attachments.find(a => a.id === id);
    if (att) { try { await removeFile(att.path); } catch {} }
    const newAttachments = attachments.filter(a => a.id !== id);
    const isLast = newAttachments.length === 0;
    if (isLast) setExpanded(false);
    onUpdate({ attachments: newAttachments, ...(isLast && { expanded: false }) });
  };

  const handleDeleteConfirmed = async () => {
    setShowDeleteConfirm(false);
    if (isLastTaskWithAttachments && attachmentSubdir) {
      try { await removeDir(`${projectPath}/_attachments/${attachmentSubdir}`, { recursive: true }); } catch {}
    } else {
      for (const att of attachments) {
        try { await removeFile(att.path); } catch {}
      }
    }
    onRemove();
  };

  const cyclePriority = () => {
    const next: Record<string, 'high' | 'med' | 'low' | undefined> = {
      high: 'med', med: 'low', low: undefined,
    };
    onUpdate({ priority: todo.priority ? next[todo.priority] : 'high' });
  };

  const { isOpen: isTaskMenuOpen, position: taskMenuPos,
          openMenu: openTaskMenu, closeMenu: closeTaskMenu } = useContextMenu<null>();

  const barColor = todo.priority ? PRIORITY_COLOR[todo.priority] : 'transparent';
  const deadline = todo.deadlineDate ? formatDeadline(todo.deadlineDate) : null;
  // const weekDays = getWeekDays();

  const hoveredAtt = hoveredAttId ? attachments.find(a => a.id === hoveredAttId) : null;
  const showPopup = Boolean(hoveredAtt && expanded && showAttachmentPreview);

  return (
    <div ref={containerRef} className="relative" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      {/* Main row */}
      <div
        onClick={() => { onToggle(); }}
        onContextMenu={(e) => openTaskMenu(e, null)}
        className="relative overflow-hidden flex items-center gap-3 px-3 py-2 bg-[#0f0f0f] border border-border-primary rounded-button group hover:bg-hover-bg hover:border-border-secondary transition-all cursor-pointer"
        style={expanded ? {
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          transition: 'border-bottom-left-radius 0ms, border-bottom-right-radius 0ms',
        } : {
          borderBottomLeftRadius: '8px',
          borderBottomRightRadius: '8px',
          transition: 'border-bottom-left-radius 0ms 150ms, border-bottom-right-radius 0ms 150ms',
        }}
      >

        {/* Priority bar */}
        <span
          className={`absolute left-0 inset-y-0 w-[3px] transition-[opacity,background-color] duration-200 ${todo.completed ? 'opacity-40' : 'opacity-100'}`}
          style={{ background: barColor }}
        />

        {/* Checkbox */}
        <div className="w-4 h-4 flex-none flex items-center justify-center">
          {todo.completed
            ? <IconCheck stroke={3} className="w-3 h-3 text-text-muted" />
            : <div className="w-1 h-1 rounded-full bg-text-primary" />
          }
        </div>

        {/* Text */}
        <span
          className={`flex-1 text-[13px] truncate transition-all duration-200 ${
            todo.completed ? 'text-text-muted' : 'text-text-primary'
          }`}
        >
          {todo.text}
        </span>

        {/* Priority badge */}
        {todo.priority && (
          <button
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => { e.stopPropagation(); e.preventDefault(); cyclePriority(); }}
            className={`flex-none flex items-center font-bold text-[10px] tracking-[.06em] rounded-[5px] px-[7px] py-[2px] cursor-pointer border transition-opacity duration-200 ${todo.completed ? 'opacity-40' : 'opacity-100'}`}
            style={{
              color: PRIORITY_COLOR[todo.priority],
              background: `${PRIORITY_COLOR[todo.priority]}1a`,
              borderColor: `${PRIORITY_COLOR[todo.priority]}4d`,
            }}
          >
            {PRIORITY_LABEL[todo.priority]}
          </button>
        )}

        {/* Deadline */}
        {deadline && (
          <button
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => { e.stopPropagation(); e.preventDefault(); onUpdate({ deadlineDate: undefined }); }}
            className="flex-none font-semibold text-[11px] cursor-pointer hover:brightness-125 transition-all min-w-[52px] text-right"
            style={{ color: deadline.color }}
          >
            {deadline.text}
          </button>
        )}

        {/* Attachment button */}
        <div className="flex-none w-[41px] flex items-center justify-center">
          {attCount > 0 ? (
            <button
              onClick={(e) => { e.stopPropagation(); const next = !expanded; setExpanded(next); onUpdate({ expanded: next }); setAttachHover(false); }}
              onMouseEnter={() => setAttachHover(true)}
              onMouseLeave={() => setAttachHover(false)}
              onContextMenu={(e) => e.stopPropagation()}
              className="flex items-center gap-1 h-[23px] px-2 bg-transparent border border-transparent group-hover:border-[#26262d] rounded-[7px] text-[#9a9aa3] text-[11px] font-semibold cursor-pointer hover:bg-[#0f0f0f] hover:border-border-secondary hover:text-text-primary transition-all"
            >
              <Paperclip className="w-[13px] h-[13px]" strokeWidth={1.9} />
              {attCount}
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); addAttachment(); }}
              className="opacity-0 group-hover:opacity-100 flex items-center gap-1 h-[22px] px-2 bg-card-bg border border-dashed border-[#26262d] rounded-[7px] text-[#6f6f78] text-[11px] font-semibold cursor-pointer hover:border-border-secondary hover:text-text-primary transition-all"
            >
              <Paperclip className="w-[21px] h-[13px]" strokeWidth={1.9} />
            </button>
          )}
        </div>

        {/* Delete */}
        <button
          onClick={(e) => { e.stopPropagation(); if (attachments.length > 0) setShowDeleteConfirm(true); else onRemove(); }}
          onContextMenu={(e) => e.stopPropagation()}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-hover-bg rounded-lg transition-opacity cursor-pointer"
        >
          <X strokeWidth={1.5} className="w-3.5 h-3.5 text-text-muted hover:text-red-500 transition-colors" />
        </button>
      </div>

      {/* Hover preview popover */}
      {!expanded && attCount > 0 && (
        <div className={`absolute top-[46px] right-2 z-40 flex gap-2 p-2 bg-hover-bg border border-border-secondary rounded-[11px] shadow-2xl transition-opacity duration-150 ${attachHover ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          {attachments.slice(0, 3).map(att => (
            <div key={att.id} className="w-[88px]">
              <div className="h-[54px] rounded-[7px] border border-border-primary overflow-hidden flex items-center justify-center bg-card-bg">
                <AttachmentThumb att={att} />
              </div>
              <div className="text-[9.5px] font-mono text-text-secondary mt-1 truncate">{att.name}</div>
            </div>
          ))}
        </div>
      )}

      {/* Date popover — temporarily disabled
      {openPopover === 'date' && (
        <div className="absolute top-[46px] right-[56px] z-[110] p-3 bg-[#161619] border border-[#2a2a33] rounded-[11px] shadow-2xl w-[214px]">
          <div className="text-[10px] font-bold tracking-[.1em] text-[#6f6f78] mb-2 uppercase">Set Deadline</div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {[
              { label: 'Today',     days: 0 },
              { label: '+3 days',   days: 3 },
              { label: 'Next week', days: 7 },
            ].map(({ label, days }) => {
              const d = new Date(); d.setDate(d.getDate() + days); d.setHours(0,0,0,0);
              return (
                <button
                  key={label}
                  onClick={() => { onUpdate({ deadlineDate: d.toISOString().split('T')[0] }); setOpenPopover(null); }}
                  className="text-[11px] font-semibold text-[#c9c9d0] bg-[#101014] border border-[#26262d] rounded-[7px] px-2.5 py-1 cursor-pointer hover:border-purple-500 hover:text-white transition-all"
                >
                  {label}
                </button>
              );
            })}
            {todo.deadlineDate && (
              <button
                onClick={() => { onUpdate({ deadlineDate: undefined }); setOpenPopover(null); }}
                className="text-[11px] font-semibold text-text-muted bg-[#101014] border border-dashed border-[#26262d] rounded-[7px] px-2.5 py-1 cursor-pointer hover:border-red-500/50 hover:text-red-400 transition-all"
              >
                Clear
              </button>
            )}
          </div>
          <div className="grid grid-cols-7 gap-[3px]">
            {weekDays.map((d, i) => {
              const isSelected = todo.deadlineDate === d.toISOString().split('T')[0];
              const isToday = d.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];
              return (
                <button
                  key={i}
                  onClick={() => { onUpdate({ deadlineDate: d.toISOString().split('T')[0] }); setOpenPopover(null); }}
                  className="text-center text-[10.5px] py-1 rounded-[6px] cursor-pointer transition-all"
                  style={{
                    color: isSelected ? '#c9b6ff' : isToday ? '#a0a0aa' : '#8a8a92',
                    background: isSelected ? '#1e1a2e' : '#101014',
                    border: `1px solid ${isSelected ? 'rgba(124,58,237,.4)' : '#1c1c22'}`,
                  }}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
      */}

      {/* Expanded attachments accordion */}
      <div style={{
        display: 'grid',
        gridTemplateRows: expanded ? '1fr' : '0fr',
        transition: 'grid-template-rows 200ms ease-out',
      }}>
        <div className="overflow-hidden min-h-0">
        <div className="p-3 bg-[#0f0f0f] border border-border-primary border-t-0 rounded-b-button">

          <div className="flex flex-wrap gap-2 max-h-[200px] overflow-y-auto overflow-x-hidden pr-2" onScroll={() => setHoveredAttId(null)}>
            {attachments.map(att => (
              <div
                key={att.id}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={async (e) => { e.stopPropagation(); if (justRemovedRef.current) return; await invoke('open_file', { filePath: att.path }); }}
                onContextMenu={(e) => openAttachMenu(e, att)}
                onMouseEnter={(e) => {
                  if (!showAttachmentPreview) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  const PREVIEW_H = 145;
                  setPopupBaseStyle(r.top > PREVIEW_H + 16
                    ? { position: 'fixed', top: r.top, left: r.left, width: r.width, transform: 'translateY(calc(-100% - 8px))' }
                    : { position: 'fixed', top: r.bottom + 8, left: r.left, width: r.width });
                  setHoveredAttId(att.id);
                }}
                onMouseLeave={() => setHoveredAttId(null)}
                className="group relative flex items-center gap-2.5 px-2.5 py-1.5 rounded-[9px] border border-[#232329] bg-card-bg hover:border-white/25 transition-colors cursor-pointer"
              >
                <div className="w-10 h-7 flex-none rounded-[6px] border border-[#2a2a31] overflow-hidden flex items-center justify-center bg-[#1a1a1f] cursor-pointer">
                  <AttachmentThumb att={att} />
                </div>
                <div>
                  <span className="text-[11px] font-mono text-[#c9c9d0] whitespace-nowrap">
                    {att.name.length > 10 ? att.name.slice(0, 10) + '...' : att.name}
                  </span>
                  {att.name.length > 10 && !showAttachmentPreview && (
                    <div className="absolute top-full left-0 mt-1.5 px-2 py-1 bg-[#1a1a1f] border border-[#2a2a31] rounded-[6px] text-[11px] font-mono text-[#c9c9d0] whitespace-nowrap pointer-events-none z-50 shadow-lg opacity-0 group-hover:opacity-100 group-hover:delay-[200ms] transition-opacity duration-150">
                      {att.name}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => removeAttachment(att.id)}
                  onDoubleClick={(e) => e.stopPropagation()}
                  className="w-5 h-5 flex items-center justify-center rounded-[5px] text-[#6f6f78] cursor-pointer hover:bg-red-950/50 hover:text-red-400 transition-colors"
                >
                  <X className="w-[11px] h-[11px]" strokeWidth={2} />
                </button>
              </div>
            ))}
            <button
              onClick={addAttachment}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-[#2c2c34] rounded-[9px] cursor-pointer text-[#6f6f78] hover:border-white/25 hover:text-white/70 hover:bg-white/5 transition-all"
            >
              <Plus className="w-[15px] h-[15px]" strokeWidth={2} />
              <span className="text-[11px] font-semibold">Add file</span>
              <span className="text-[10px] text-text-muted opacity-50">Ctrl+V</span>
            </button>
          </div>
        </div>
        </div>
      </div>

      {/* Attachment card hover preview — always rendered for CSS fade, hidden offscreen when inactive */}
      {expanded && attCount > 0 && (
        <div
          className={`z-[200] pointer-events-none p-2 bg-hover-bg border border-border-secondary rounded-[11px] shadow-2xl transition-opacity duration-150 ${showPopup ? 'opacity-100 delay-[200ms]' : 'opacity-0 delay-[0ms]'}`}
          style={popupBaseStyle}
        >
          {hoveredAtt && (
            <>
              <div className="w-full h-[103px] rounded-[8px] border border-border-primary overflow-hidden flex items-center justify-center bg-card-bg">
                <AttachmentThumb att={hoveredAtt} size="lg" />
              </div>
              <div className="flex items-center gap-2 mt-1.5 w-full">
                <div className="text-[10px] font-mono text-text-secondary truncate flex-1 min-w-0">
                  {hoveredAtt.name}
                </div>
                {hoveredFileSize && (
                  <div className="text-[10px] font-mono text-text-muted flex-none">
                    {hoveredFileSize}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* import { ContextMenuSubmenu } from '../ui/ContextMenu'; — re-enable when deadline is implemented */}
      <ContextMenu isOpen={isTaskMenuOpen} position={taskMenuPos} onClose={closeTaskMenu}>
        <ContextMenuItem
          icon={<ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} strokeWidth={1.5} />}
          disabled={attCount === 0}
          onClick={() => { const next = !expanded; setExpanded(next); onUpdate({ expanded: next }); closeTaskMenu(); }}
        >
          {expanded ? 'Collapse' : 'Expand'}
        </ContextMenuItem>
        <ContextMenuDivider />
        <ContextMenuItem
          icon={<IconCopy className="w-4 h-4" stroke={1.5} />}
          onClick={() => { navigator.clipboard.writeText(todo.text); closeTaskMenu(); }}
        >
          Copy
        </ContextMenuItem>
        <ContextMenuDivider />
        <div className="px-3 pb-2">
          <div className="text-[10px] font-bold tracking-[.1em] text-text-muted uppercase pt-1 pb-1.5">Priority</div>
          <div className="flex gap-2">
            {(['high', 'med', 'low'] as const).map(p => (
              <button
                key={p}
                onClick={() => { onUpdate({ priority: todo.priority === p ? undefined : p }); closeTaskMenu(); }}
                className={`w-5 h-5 rounded-full transition-all ${todo.priority === p ? 'ring-2 ring-white/60 ring-offset-1 ring-offset-[#1a1a1f]' : 'hover:ring-2 hover:ring-white/40'}`}
                style={{ backgroundColor: PRIORITY_COLOR[p] }}
                title={p === 'high' ? 'High' : p === 'med' ? 'Medium' : 'Low'}
              />
            ))}
            <button
              onClick={() => { onUpdate({ priority: undefined }); closeTaskMenu(); }}
              className="w-5 h-5 rounded-full border-2 border-zinc-500 hover:bg-white/10 transition-all"
              title="Clear"
            />
          </div>
        </div>
        <ContextMenuDivider />
        {/* Deadline — temporarily disabled
        <ContextMenuSubmenu label="Deadline">
          {[
            { label: 'Today', days: 0 }, { label: '+3 days', days: 3 },
            { label: '+7 days', days: 7 }, { label: '+2 weeks', days: 14 },
          ].map(({ label, days }) => {
            const d = new Date(); d.setDate(d.getDate() + days);
            return (
              <ContextMenuItem key={label} onClick={() => { onUpdate({ deadlineDate: d.toISOString().split('T')[0] }); closeTaskMenu(); }}>
                {label}
              </ContextMenuItem>
            );
          })}
          {todo.deadlineDate && (
            <ContextMenuItem onClick={() => { onUpdate({ deadlineDate: undefined }); closeTaskMenu(); }}>Clear</ContextMenuItem>
          )}
        </ContextMenuSubmenu>
        <ContextMenuDivider />
        */}
        <ContextMenuItem
          danger
          icon={<IconTrash className="w-4 h-4" stroke={1.5} />}
          onClick={() => { closeTaskMenu(); if (attachments.length > 0) setShowDeleteConfirm(true); else onRemove(); }}
        >
          Delete
        </ContextMenuItem>
      </ContextMenu>

      <ContextMenu isOpen={isAttachMenuOpen} position={attachMenuPos} onClose={closeAttachMenu}>
        <ContextMenuItem
          icon={<IconFolderOpen className="w-4 h-4" stroke={1.5} />}
          onClick={() => { invoke('reveal_in_explorer', { path: attachMenuData!.path }); closeAttachMenu(); }}
        >
          Reveal in Explorer
        </ContextMenuItem>
        <ContextMenuDivider />
        <ContextMenuItem
          icon={<IconCopy className="w-4 h-4" stroke={1.5} />}
          onClick={() => { invoke('copy_file_to_clipboard', { path: attachMenuData!.path }); closeAttachMenu(); }}
        >
          Copy
        </ContextMenuItem>
        <ContextMenuItem
          icon={<IconClipboard className="w-4 h-4" stroke={1.5} />}
          onClick={() => { pasteFromClipboard(); closeAttachMenu(); }}
        >
          Paste
        </ContextMenuItem>
        <ContextMenuDivider />
        <ContextMenuItem
          icon={<IconTrash className="w-4 h-4" stroke={1.5} />}
          onClick={() => { if (attachMenuData) removeAttachment(attachMenuData.id); closeAttachMenu(); }}
          danger
        >
          Delete
        </ContextMenuItem>
      </ContextMenu>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={(e) => e.stopPropagation()}>
          <div className="bg-zinc-900 border border-red-700 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Delete Task</h3>
            <p className="text-zinc-400 mb-6">
              This task has {attachments.length} attachment{attachments.length > 1 ? 's' : ''}. Deleting it will permanently remove all attached files. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors">
                Cancel
              </button>
              <button onClick={handleDeleteConfirmed} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-button transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
