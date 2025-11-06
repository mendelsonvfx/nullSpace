import React, { useState, useMemo } from 'react';
import SimpleBar from 'simplebar-react';
import {
  IconLayoutGrid,
  IconLayoutList,
  IconSearch,
  IconChevronDown,
  IconChevronRight,
  IconCamera,
  IconVersions,
  IconCircleCheck,
  IconClock,
  IconMovie,
} from '@tabler/icons-react';

// Mock data types
interface Shot {
  id: string;
  name: string;
  sceneId: string;
  versions: number;
  thumbnail?: string;
  status: 'wip' | 'done';
}

interface Scene {
  id: string;
  name: string;
  shots: Shot[];
  thumbnail?: string;
  color?: string;
}

// Mock data для демонстрации
const MOCK_SCENES: Scene[] = [
  {
    id: 'scene-001',
    name: 'Opening Scene',
    color: '#8b5cf6',
    shots: [
      { id: 'shot-001', name: 'Shot_010', sceneId: 'scene-001', versions: 3, status: 'done' },
      { id: 'shot-002', name: 'Shot_020', sceneId: 'scene-001', versions: 5, status: 'wip' },
      { id: 'shot-003', name: 'Shot_030', sceneId: 'scene-001', versions: 2, status: 'wip' },
      { id: 'shot-004', name: 'Shot_040', sceneId: 'scene-001', versions: 1, status: 'wip' },
    ],
  },
  {
    id: 'scene-002',
    name: 'Action Sequence',
    color: '#ef4444',
    shots: [
      { id: 'shot-005', name: 'Shot_010', sceneId: 'scene-002', versions: 7, status: 'done' },
      { id: 'shot-006', name: 'Shot_020', sceneId: 'scene-002', versions: 4, status: 'done' },
      { id: 'shot-007', name: 'Shot_030', sceneId: 'scene-002', versions: 2, status: 'wip' },
    ],
  },
  {
    id: 'scene-003',
    name: 'Finale',
    color: '#10b981',
    shots: [
      { id: 'shot-008', name: 'Shot_010', sceneId: 'scene-003', versions: 1, status: 'wip' },
      { id: 'shot-009', name: 'Shot_020', sceneId: 'scene-003', versions: 1, status: 'wip' },
    ],
  },
];

interface ShotCardProps {
  shot: Shot;
  isSelected: boolean;
  viewMode: 'grid' | 'list';
  onClick: () => void;
}

const ShotCard: React.FC<ShotCardProps> = ({ shot, isSelected, viewMode, onClick }) => {
  return (
    <div
      onClick={onClick}
      className={`
        cursor-pointer rounded-med border overflow-hidden
        ${isSelected
          ? 'border-accent bg-accent/10'
          : 'border-border-primary bg-card-bg hover:border-border-secondary hover:bg-hover-bg hover:-translate-y-0.5'
        }
        ${viewMode === 'grid' ? '' : 'flex items-center gap-3 p-2'}
      `}
    >
      {viewMode === 'grid' ? (
        <>
          {/* Thumbnail area */}
          <div className="relative w-full h-20 bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
            <span className="text-xs text-text-muted">No preview</span>
            {/* Versions badge in top right corner */}
            <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 bg-sidebar-bg/90 rounded-badge flex items-center gap-1">
              <IconVersions size={10} className="text-text-secondary" />
              <span className="text-xs font-medium text-text-secondary">{shot.versions}</span>
            </div>
          </div>
          {/* Shot info */}
          <div className="p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-primary truncate">{shot.name}</span>
              {(shot.status === 'done' || shot.status === 'wip') && (
                <div className={`flex items-center gap-1 ml-2 flex-shrink-0 ${
                  shot.status === 'done'
                    ? 'text-green-500'
                    : 'text-yellow-500'
                }`}>
                  {shot.status === 'wip' && <IconClock size={11} />}
                  {shot.status === 'done' && <IconCircleCheck size={11} />}
                  <span className="text-xs">
                    {shot.status === 'done' ? 'Done' : 'WIP'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* List view */}
          <div className="w-16 h-10 rounded-badge bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center flex-shrink-0">
            <IconCamera size={16} className="text-text-muted" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-text-primary truncate">{shot.name}</div>
              {(shot.status === 'done' || shot.status === 'wip') && (
                <div className={`flex items-center gap-1 ml-2 flex-shrink-0 ${
                  shot.status === 'done'
                    ? 'text-green-500'
                    : 'text-yellow-500'
                }`}>
                  {shot.status === 'wip' && <IconClock size={11} />}
                  {shot.status === 'done' && <IconCircleCheck size={11} />}
                  <span className="text-xs">
                    {shot.status === 'done' ? 'Done' : 'WIP'}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 text-text-secondary mt-0.5">
              <IconVersions size={11} />
              <span className="text-xs">{shot.versions} versions</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

interface SceneCardProps {
  scene: Scene;
  isExpanded: boolean;
  selectedShotId: string | null;
  viewMode: 'grid' | 'list';
  onToggle: () => void;
  onShotSelect: (shotId: string) => void;
}

const SceneCard: React.FC<SceneCardProps> = ({
  scene,
  isExpanded,
  selectedShotId,
  viewMode,
  onToggle,
  onShotSelect,
}) => {
  const completedShots = scene.shots.filter(s => s.status === 'done').length;
  const wipShots = scene.shots.filter(s => s.status === 'wip').length;

  // Grid view: large preview card
  if (viewMode === 'grid') {
    return (
      <div className={`bg-card-bg border border-border-primary rounded-med overflow-hidden ${
        isExpanded ? 'bg-accent/10 border-accent/30' : 'hover:border-border-secondary'
      }`}>
        {/* Scene preview */}
        <div
          onClick={onToggle}
          className="relative w-full h-28 bg-gradient-to-br from-zinc-800 to-zinc-900 cursor-pointer overflow-hidden"
        >
          {/* Expand indicator */}
          <div className="absolute top-2 left-2 w-6 h-6 bg-sidebar-bg rounded-badge flex items-center justify-center transition-all duration-300">
            <IconChevronRight
              size={14}
              className={`text-text-secondary transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}
            />
          </div>

          {/* Shot count badge */}
          <div className="absolute top-2 right-2 px-2 py-1 bg-sidebar-bg rounded-badge text-xs font-semibold text-text-secondary">
            {scene.shots.length} {scene.shots.length === 1 ? 'shot' : 'shots'}
          </div>

          {/* Scene icon */}
          <div className="w-full h-full flex items-center justify-center flex-col gap-2">
            <div
              className="w-10 h-10 rounded-badge flex items-center justify-center text-white text-lg font-bold"
              style={{
                background: scene.color
                  ? `linear-gradient(135deg, ${scene.color}, ${scene.color}aa)`
                  : 'linear-gradient(135deg, #8b5cf6, #8b5cf6aa)',
              }}
            >
              {scene.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs text-text-muted">No preview</span>
          </div>

          {/* Scene overlay */}
          <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/60 to-transparent">
            <div className="text-sm font-semibold text-white truncate">{scene.name}</div>
            <div className="text-xs text-white/70">
              {scene.shots.length} {scene.shots.length === 1 ? 'shot' : 'shots'}
            </div>
          </div>
        </div>

        {/* Scene info bar */}
        <div className="px-3 py-2.5 flex justify-between items-center cursor-pointer" onClick={onToggle}>
          <div className="flex gap-3 text-xs text-text-muted">
            <div className="flex items-center gap-1.5">
              <IconMovie size={13} />
              <span>{scene.shots.length} shots</span>
            </div>
            <div className={`flex items-center gap-1.5 ${completedShots === scene.shots.length ? 'text-green-500' : 'text-yellow-500'}`}>
              {completedShots === scene.shots.length ? (
                <IconCircleCheck size={13} />
              ) : (
                <IconClock size={13} />
              )}
              <span>{completedShots === scene.shots.length ? 'Done' : 'In Progress'}</span>
            </div>
          </div>
        </div>

        {/* Shots container */}
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden bg-sidebar-bg/50 ${
            isExpanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="px-3 pb-3 pt-3">
            <div className="grid grid-cols-2 gap-2">
              {scene.shots.map(shot => (
                <ShotCard
                  key={shot.id}
                  shot={shot}
                  isSelected={selectedShotId === shot.id}
                  viewMode={viewMode}
                  onClick={() => onShotSelect(shot.id)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // List view: compact plash
  return (
    <div>
      {/* Compact header (list mode style) */}
      <div
        onClick={onToggle}
        className={`px-3 py-2.5 bg-card-bg border border-border-primary rounded-med cursor-pointer hover:bg-hover-bg hover:border-border-secondary flex items-center gap-2.5 ${
          isExpanded ? 'bg-accent/10 border-accent/30' : ''
        }`}
      >
        {/* Chevron */}
        <IconChevronRight
          size={14}
          className={`text-text-muted flex-shrink-0 transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}
        />

        {/* Scene icon */}
        <div
          className="w-7 h-7 rounded-badge flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
          style={{
            background: scene.color
              ? `linear-gradient(135deg, ${scene.color}, ${scene.color}aa)`
              : 'linear-gradient(135deg, #8b5cf6, #8b5cf6aa)',
          }}
        >
          {scene.name.charAt(0).toUpperCase()}
        </div>

        {/* Scene info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-text-primary truncate">{scene.name}</div>
            <div className={`flex items-center gap-1.5 ml-2 flex-shrink-0 ${
              completedShots === scene.shots.length ? 'text-green-500' : 'text-yellow-500'
            }`}>
              {completedShots === scene.shots.length ? (
                <IconCircleCheck size={11} />
              ) : (
                <IconClock size={11} />
              )}
              <span className="text-xs">
                {completedShots === scene.shots.length ? 'Done' : 'WIP'}
              </span>
            </div>
          </div>
          <div className="text-xs text-text-muted">
            {scene.shots.length} {scene.shots.length === 1 ? 'shot' : 'shots'}
          </div>
        </div>
      </div>

      {/* Shots container */}
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          isExpanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="mt-2 ml-9 space-y-2">
          {scene.shots.map(shot => (
            <ShotCard
              key={shot.id}
              shot={shot}
              isSelected={selectedShotId === shot.id}
              viewMode={viewMode}
              onClick={() => onShotSelect(shot.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

interface ShotsBrowserProps {
  className?: string;
}

const ShotsBrowser: React.FC<ShotsBrowserProps> = ({ className = '' }) => {
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set(['scene-001']));
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);

  // Filter scenes and shots based on search
  const filteredScenes = useMemo(() => {
    if (!searchTerm.trim()) return MOCK_SCENES;

    const term = searchTerm.toLowerCase();
    return MOCK_SCENES.map(scene => ({
      ...scene,
      shots: scene.shots.filter(shot =>
        shot.name.toLowerCase().includes(term) ||
        scene.name.toLowerCase().includes(term)
      ),
    })).filter(scene =>
      scene.name.toLowerCase().includes(term) || scene.shots.length > 0
    );
  }, [searchTerm]);

  const toggleScene = (sceneId: string) => {
    setExpandedScenes(prev => {
      const next = new Set(prev);
      if (next.has(sceneId)) {
        next.delete(sceneId);
      } else {
        next.add(sceneId);
      }
      return next;
    });
  };

  const totalShots = MOCK_SCENES.reduce((sum, scene) => sum + scene.shots.length, 0);

  return (
    <div className={`flex flex-col bg-sidebar-bg border-l border-border-primary border-t border-border-primary p-4 relative ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 justify-between">
        <div className="flex items-center gap-2.5">
          <IconMovie className="w-5 h-5 text-text-secondary flex-shrink-0" stroke={1.5} />
          <h3 className="text-section-title font-semibold text-text-primary leading-none">Shots Browser</h3>
        </div>
        {/* View mode toggle buttons */}
        <div className="flex items-center gap-0.5 bg-card-bg rounded-button p-0.5 flex-shrink-0">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1 rounded-badge transition-colors ${
                viewMode === 'grid'
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-hover-bg'
              }`}
              title="Grid view"
            >
              <IconLayoutGrid size={13} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1 rounded-badge transition-colors ${
                viewMode === 'list'
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-hover-bg'
              }`}
              title="List view"
            >
              <IconLayoutList size={13} />
            </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-3">
        <div className="relative">
          <IconSearch
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            placeholder="Search scenes & shots..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-card-bg border border-border-primary rounded-button text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
          />
        </div>
      </div>

      {/* Scenes list */}
      <SimpleBar className="flex-1 custom-scrollbar" style={{ paddingBottom: '45px' }}>
        <div className="space-y-3">
          {filteredScenes.length > 0 ? (
            filteredScenes.map(scene => (
              <SceneCard
                key={scene.id}
                scene={scene}
                isExpanded={expandedScenes.has(scene.id)}
                selectedShotId={selectedShotId}
                viewMode={viewMode}
                onToggle={() => toggleScene(scene.id)}
                onShotSelect={setSelectedShotId}
              />
            ))
          ) : (
            <div className="text-center py-8 text-text-muted text-xs">
              No scenes or shots found
            </div>
          )}
        </div>
      </SimpleBar>

      {/* Footer - Absolute positioned */}
      <div className="absolute bottom-3 left-4 right-4 pt-2.5">
        <div className="bg-card-bg border border-border-primary rounded-button px-4 py-2">
          <div className="text-xs">
            <span className="text-text-muted">Scenes:</span>{' '}
            <span className="text-text-primary font-medium">{MOCK_SCENES.length}</span>
            <span className="text-text-muted mx-2">•</span>
            <span className="text-text-muted">Shots:</span>{' '}
            <span className="text-text-primary font-medium">{totalShots}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShotsBrowser;
