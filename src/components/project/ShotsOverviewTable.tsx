import { useState, useEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api';
import { useThumbnail } from '../../hooks/useThumbnail';
import { useBlendThumbnail } from '../../hooks/useBlendThumbnail';
import { usePsdThumbnail } from '../../hooks/usePsdThumbnail';
import { useC4dThumbnail } from '../../hooks/useC4dThumbnail';
import { useProjectStore } from '../../store/projectStore';
import { IconCircleCheckFilled, IconClock, IconMoon, IconCircle } from '@tabler/icons-react';
import ReactMarkdown from 'react-markdown';
import { extractShotNumber, extractVersion, getScenePattern } from '../../utils/fileNaming';
import type { TodoItem } from '../../types/project';
import { versionsCache, type ProjectVersion } from '../../utils/versionsCache';

interface Note {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface Shot {
  id: string;
  name: string;
  number: number;
  preview?: string;
  wip?: boolean;
  completed?: boolean;
  sceneId: string;
  todos?: TodoItem[];
  notes?: Note[];
}

interface ShotsOverviewTableProps {
  projectId: string;
  projectPath: string;
  projectName: string;
  currentScene: any;
  shots: Shot[];
}

export function ShotsOverviewTable({ projectId, projectPath, projectName, currentScene, shots }: ShotsOverviewTableProps) {
  const setCurrentShot = useProjectStore(state => state.setCurrentShot);

  const [allVersions, setAllVersions] = useState<ProjectVersion[]>([]);
  const loadVersionsReqRef = useRef(0);
  useEffect(() => {
    const capturedPath = projectPath;
    loadVersionsReqRef.current += 1;
    const reqId = loadVersionsReqRef.current;

    const cached = versionsCache.get(capturedPath);
    if (cached) {
      setAllVersions(cached);
      return;
    }

    versionsCache.fetch(capturedPath, () =>
      invoke<ProjectVersion[]>('get_project_versions', { projectPath: capturedPath })
    ).then(result => {
      if (reqId !== loadVersionsReqRef.current) return;
      setAllVersions(result);
    }).catch(() => {});
  }, [projectId]);

  // Latest versioned file per shot, split by preview type — each goes to its own thumbnail extractor
  // (a single "latest of any software" path sent to the Blender extractor failed for .psd/.c4d)
  const shotLatestPreviewPaths = useMemo(() => {
    const maps = { blend: new Map<string, string>(), psd: new Map<string, string>(), c4d: new Map<string, string>() };
    const best = { blend: new Map<string, number>(), psd: new Map<string, number>(), c4d: new Map<string, number>() };
    if (!allVersions.length || !currentScene) return maps;
    allVersions.forEach(version => {
      if (!version.is_versioned) return;
      const kind = version.software.includes('Blender') ? 'blend'
        : version.software.includes('Photoshop') ? 'psd'
        : version.software.includes('Cinema 4D') ? 'c4d'
        : null;
      if (!kind) return;
      const shotNumber = extractShotNumber(version.name);
      if (shotNumber === null) return;
      const versionNum = extractVersion(version.name);
      if (!versionNum) return;
      if (!version.name.startsWith(getScenePattern(projectName, currentScene.name))) return;
      const key = String(shotNumber);
      if (versionNum > (best[kind].get(key) ?? 0)) {
        best[kind].set(key, versionNum);
        maps[kind].set(key, version.path);
      }
    });
    return maps;
  }, [allVersions, currentScene, projectName]);

  // Sort shots by number
  const sortedShots = useMemo(
    () => [...shots].sort((a, b) => a.number - b.number),
    [shots]
  );

  const handleShotClick = (shotId: string) => {
    setCurrentShot(projectId, shotId);
  };

  return (
    <div className="mb-7">
      <div className="bg-card-bg border border-border-primary rounded-xl p-4">
        <h3 className="text-sm font-medium text-text-secondary mb-5">
          Shots overview
        </h3>
        {/* Table Header */}
        {/* minmax(0,1fr): the Notes column never grows past the row for a long unbroken path */}
        <div className="grid grid-cols-[140px_120px_120px_minmax(0,1fr)_120px] gap-4 pb-3 px-4">
          <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Preview</div>
          <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Number</div>
          <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Tasks</div>
          <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Notes</div>
          <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Status</div>
        </div>

        {/* Table Body */}
        <div className="flex flex-col gap-2 mt-2">
          {sortedShots.length === 0 ? (
            <div className="py-8 text-center text-text-muted text-sm">
              No shots in this scene
            </div>
          ) : (
            sortedShots.map((shot) => (
              <ShotRow
                key={shot.id}
                shot={shot}
                projectId={projectId}
                projectPath={projectPath}
                blendPath={shotLatestPreviewPaths.blend.get(String(shot.number))}
                psdPath={shotLatestPreviewPaths.psd.get(String(shot.number))}
                c4dPath={shotLatestPreviewPaths.c4d.get(String(shot.number))}
                onClick={() => handleShotClick(shot.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

interface ShotRowProps {
  shot: Shot;
  projectId: string;
  projectPath: string;
  blendPath?: string;
  psdPath?: string;
  c4dPath?: string;
  onClick: () => void;
}

function ShotRow({ shot, projectId: _projectId, projectPath, blendPath, psdPath, c4dPath, onClick }: ShotRowProps) {
  const previewSrc = useThumbnail(projectPath, shot.preview);
  const [blendPreviewsEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('blendPreviewsEnabled');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const autoEnabled = !shot.preview && blendPreviewsEnabled;
  const autoBlendSrc = useBlendThumbnail(autoEnabled ? blendPath : undefined);
  const autoPsdSrc = usePsdThumbnail(autoEnabled ? psdPath : undefined);
  const autoC4dSrc = useC4dThumbnail(autoEnabled ? c4dPath : undefined);
  // Same priority as the shot cards in ShotsBrowser
  const displaySrc = previewSrc || autoBlendSrc || autoPsdSrc || autoC4dSrc;
  const wasImageReadyOnMount = useRef(!!displaySrc);

  const getStatusBadge = () => {
    if (shot.completed) {
      return (
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 text-[10px] font-semibold w-fit">
          <IconCircleCheckFilled size={10} />
          Done
        </div>
      );
    }
    if (shot.wip) {
      return (
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 text-[10px] font-semibold w-fit">
          <IconClock size={10} />
          In Progress
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-500/10 text-zinc-400 text-[10px] font-semibold w-fit">
        <IconMoon size={10} />
        Idle
      </div>
    );
  };

  // Get last 3 incomplete todos (safe check)
  const incompleteTodos = (shot.todos && Array.isArray(shot.todos))
    ? shot.todos
        .filter(todo => !todo.completed)
        .slice(-3)
        .reverse()
    : [];

  // Combine all notes into one text (safe check)
  const allNotesText = (shot.notes && Array.isArray(shot.notes) && shot.notes.length > 0)
    ? shot.notes.map(note => note.content).join('\n\n')
    : '';

  return (
    <div className="grid grid-cols-[140px_120px_120px_minmax(0,1fr)_120px] gap-4 px-4 py-3.5 bg-[#0f0f0f] border border-border-primary rounded-xl hover:border-border-secondary transition-colors cursor-pointer" onClick={onClick}>
      {/* Preview */}
      <div className="flex items-center">
        <div className="relative w-32 h-20 rounded-lg overflow-hidden bg-zinc-900 flex items-center justify-center border border-zinc-800">
          {!displaySrc && <span className="text-[10px] text-zinc-600">No preview</span>}
          {displaySrc && (
            <img
              src={displaySrc}
              alt={shot.name}
              className={`absolute inset-0 w-full h-full object-cover${wasImageReadyOnMount.current ? '' : ' animate-fade-in'}`}
              draggable={false}
            />
          )}
        </div>
      </div>

      {/* Number */}
      <div className="flex items-center justify-start">
        <span className="text-sm font-semibold text-text-primary">
          {shot.name}
        </span>
      </div>

      {/* Tasks */}
      <div className="flex flex-col justify-center gap-1">
        {incompleteTodos.length > 0 ? (
          incompleteTodos.map((todo) => (
            <div key={todo.id} className="flex items-center gap-1.5">
              <IconCircle size={10} className="text-text-muted flex-shrink-0" />
              <span className="text-xs text-text-secondary truncate">
                {todo.text}
              </span>
            </div>
          ))
        ) : (
          <span className="text-xs text-text-muted">No tasks</span>
        )}
      </div>

      {/* Notes */}
      <div className="flex items-center justify-start min-w-0">
        {allNotesText ? (
          // overflow-wrap:anywhere: paths and links without spaces wrap inside the column
          <div className="prose prose-invert prose-xs max-w-none min-w-0 [overflow-wrap:anywhere] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 text-xs text-text-secondary">
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="mb-1 last:mb-0 text-xs">{children}</p>,
                ul: ({ children }) => <ul className="list-disc list-inside mb-1 last:mb-0 text-xs">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-inside mb-1 last:mb-0 text-xs">{children}</ol>,
                li: ({ children }) => <li className="mb-0.5 text-xs">{children}</li>,
                h1: ({ children }) => <h1 className="text-sm font-bold mb-1">{children}</h1>,
                h2: ({ children }) => <h2 className="text-sm font-semibold mb-1">{children}</h2>,
                h3: ({ children }) => <h3 className="text-xs font-semibold mb-1">{children}</h3>,
                code: ({ children }) => <code className="bg-zinc-800 px-1 rounded text-xs break-all">{children}</code>,
                pre: ({ children }) => <pre className="bg-zinc-800 p-2 rounded mb-1 text-xs overflow-x-auto">{children}</pre>,
              }}
            >
              {allNotesText}
            </ReactMarkdown>
          </div>
        ) : (
          <span className="text-xs text-text-muted">No notes</span>
        )}
      </div>

      {/* Status */}
      <div className="flex items-center justify-start">
        {getStatusBadge()}
      </div>
    </div>
  );
}
