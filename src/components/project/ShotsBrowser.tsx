import React, { useState, useMemo, useEffect, useRef } from 'react';
import SimpleBar from 'simplebar-react';
import {
  IconLayoutGrid,
  IconLayoutList,
  IconSearch,
  IconChevronRight,
  IconVersions,
  IconCircleCheck,
  IconClock,
  IconMovie,
  IconPhoto,
  IconX,
  IconCircleFilled,
  IconPencil,
  IconTrash,
  IconFileText,
  IconPlus,
  IconBox,
  IconStack2,
  IconMoon,
} from '@tabler/icons-react';
import { invoke } from '@tauri-apps/api/tauri';
import { useProjectStore } from '../../store/projectStore';
import { useContextMenuStore } from '../../store/contextMenuStore';
import { useThumbnail } from '../../hooks/useThumbnail';
import { extractShotNumber } from '../../utils/fileNaming';

interface ProjectVersion {
  name: string;
  path: string;
  software: string[];
  created_at: number;
  is_versioned: boolean;
}

// Local types for component
interface Shot {
  id: string;
  name: string;
  number: number;
  sceneId: string;
  versions: number;
  thumbnail?: string;
  preview?: string;
  wip?: boolean;
  completed?: boolean;
}

interface Scene {
  id: string;
  name: string;
  number: number;
  description?: string;
  shots: Shot[];
  thumbnail?: string;
  preview?: string;
  color?: string;
  wip?: boolean;
  completed?: boolean;
}

interface ShotCardProps {
  shot: Shot;
  isSelected: boolean;
  viewMode: 'grid' | 'list';
  projectPath: string;
  onClick: () => void;
  onStatusChange: (shotId: string) => void;
  onContextMenu: (e: React.MouseEvent, shotId: string, type: 'preview' | 'name') => void;
  onHover: (shotId: string | null) => void;
  isAnimating: boolean;
  isEditing: boolean;
  editValue: string;
  onEditChange: (value: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
}

const ShotCard: React.FC<ShotCardProps> = ({
  shot,
  isSelected,
  viewMode,
  projectPath,
  onClick,
  onStatusChange,
  onContextMenu,
  onHover,
  isAnimating,
  isEditing,
  editValue,
  onEditChange,
  onEditSave,
  onEditCancel
}) => {
  const shotPreviewSrc = useThumbnail(projectPath, shot.preview);

  const handleNameContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onStatusChange(shot.id);
  };

  const handlePreviewContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e, shot.id, 'preview');
  };

  return (
    <div
      onClick={onClick}
      className={`
        cursor-pointer rounded-med transition-transform duration-150
        ${!isSelected && !shot.completed ? 'hover:-translate-y-0.5' : ''}
        ${shot.completed && !isSelected ? 'hover:-translate-y-0.5' : ''}
        ${isAnimating ? 'animate-shot-complete-glow' : ''}
      `}
    >
      <div
        className={`
          w-full h-full overflow-hidden rounded-med transition-colors duration-150 border
          ${isSelected
            ? 'bg-accent/10 border-accent'
            : shot.completed
            ? 'bg-card-bg hover:bg-hover-bg border-green-500/25'
            : 'bg-card-bg hover:bg-hover-bg border-border-primary hover:border-border-secondary'
          }
          ${viewMode === 'grid' ? '' : 'flex items-center gap-3 p-2'}
        `}
      >
        {viewMode === 'grid' ? (
        <>
          {/* Thumbnail area */}
          <div
            data-context-menu="shot"
            className="relative w-full h-20 bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center"
            onContextMenu={handlePreviewContextMenu}
            onMouseEnter={() => onHover(shot.id)}
            onMouseLeave={() => onHover(null)}
          >
            {shotPreviewSrc ? (
              <img
                src={shotPreviewSrc}
                alt={shot.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-0.5">
                <span className="text-2xl font-bold text-text-primary">{String(shot.number).padStart(3, '0')}</span>
                <span className="text-[10px] text-text-muted">No preview</span>
              </div>
            )}
            {/* Versions badge in top right corner - only show if versions exist */}
            {shot.versions > 0 && (
              <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 bg-sidebar-bg/90 rounded-badge flex items-center gap-1">
                <IconVersions size={10} className="text-text-secondary" />
                <span className="text-xs font-medium text-text-secondary">{shot.versions}</span>
              </div>
            )}
          </div>
          {/* Shot info */}
          <div
            data-context-menu="shot"
            className="p-2.5"
            onContextMenu={handleNameContextMenu}
          >
            <div className="flex items-center justify-between gap-2">
              {isEditing ? (
                <div className="flex items-center gap-1 flex-1">
                  <span className="text-xs font-semibold text-text-primary">
                    {shot.name.replace(/\d+$/, '')}
                  </span>
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (/^\d{0,3}$/.test(value)) {
                        onEditChange(value);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onEditSave();
                      if (e.key === 'Escape') onEditCancel();
                    }}
                    onBlur={onEditSave}
                    autoFocus
                    maxLength={3}
                    placeholder="000"
                    className="text-xs font-semibold text-text-primary bg-transparent border-none p-0 focus:outline-none focus:ring-0"
                    style={{ width: '24px' }}
                  />
                </div>
              ) : (
                <span className="text-xs font-semibold text-text-primary truncate">{shot.name}</span>
              )}
              <div className="flex items-center gap-1 flex-shrink-0">
                {shot.wip ? (
                  <>
                    <IconClock size={11} className="text-yellow-500 transition-all duration-300" />
                    <span className="text-xs text-yellow-500 whitespace-nowrap">WIP</span>
                  </>
                ) : shot.completed ? (
                  <>
                    <IconCircleCheck size={11} className="text-green-500 transition-all duration-300" />
                    <span className="text-xs text-green-500 whitespace-nowrap">Done</span>
                  </>
                ) : (
                  <>
                    <IconMoon size={11} className="text-zinc-500 transition-all duration-300" />
                    <span className="text-xs text-zinc-500 whitespace-nowrap">Idle</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* List view */}
          <div
            data-context-menu="shot"
            className="w-16 h-10 rounded-badge bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center flex-shrink-0 overflow-hidden"
            onContextMenu={handlePreviewContextMenu}
            onMouseEnter={() => onHover(shot.id)}
            onMouseLeave={() => onHover(null)}
          >
            {shotPreviewSrc ? (
              <img
                src={shotPreviewSrc}
                alt={shot.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-sm font-bold text-text-primary">{String(shot.number).padStart(3, '0')}</span>
            )}
          </div>
          <div
            data-context-menu="shot"
            className="flex-1 min-w-0"
            onContextMenu={handleNameContextMenu}
          >
            <div className="flex items-center justify-between gap-2">
              {isEditing ? (
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium text-text-primary">
                    {shot.name.replace(/\d+$/, '')}
                  </span>
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (/^\d{0,3}$/.test(value)) {
                        onEditChange(value);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onEditSave();
                      if (e.key === 'Escape') onEditCancel();
                    }}
                    onBlur={onEditSave}
                    autoFocus
                    maxLength={3}
                    placeholder="000"
                    className="text-xs font-medium text-text-primary bg-transparent border-none p-0 focus:outline-none focus:ring-0"
                    style={{ width: '24px' }}
                  />
                </div>
              ) : (
                <div className="text-xs font-medium text-text-primary truncate">{shot.name}</div>
              )}
              <div className="flex items-center gap-1 flex-shrink-0">
                {shot.wip ? (
                  <>
                    <IconClock size={11} className="text-yellow-500" />
                    <span className="text-xs text-yellow-500 whitespace-nowrap">WIP</span>
                  </>
                ) : shot.completed ? (
                  <>
                    <IconCircleCheck size={11} className="text-green-500" />
                    <span className="text-xs text-green-500 whitespace-nowrap">Done</span>
                  </>
                ) : (
                  <>
                    <IconMoon size={11} className="text-zinc-500" />
                    <span className="text-xs text-zinc-500 whitespace-nowrap">Idle</span>
                  </>
                )}
              </div>
            </div>
            {shot.versions > 0 && (
              <div className="flex items-center gap-1 text-text-secondary mt-0.5">
                <IconVersions size={11} />
                <span className="text-xs">{shot.versions} version{shot.versions !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
    </div>
  );
};

interface SceneCardProps {
  scene: Scene;
  isExpanded: boolean;
  isSelected: boolean;
  selectedShotId: string | null;
  viewMode: 'grid' | 'list';
  project: any; // Full project object to check special context state
  onSetSpecialContext: (contextType: 'asset' | 'compose', sceneId: string) => void;
  onToggle: () => void;
  onShotSelect: (shotId: string) => void;
  onSceneClick: (sceneId: string) => void;
  onShotStatusChange: (shotId: string) => void;
  onShotContextMenu: (e: React.MouseEvent, shotId: string, type: 'preview' | 'name') => void;
  onSceneContextMenu: (e: React.MouseEvent, sceneId: string) => void;
  onSceneHover: (sceneId: string | null) => void;
  onShotHover: (shotId: string | null) => void;
  onAddShot: (sceneId: string) => void;
  animatingShotId: string | null;
  editingItem: { type: 'shot' | 'scene' | 'description'; id: string; value: string } | null;
  onEditChange: (value: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
}

const SceneCard: React.FC<SceneCardProps> = ({
  scene,
  isExpanded,
  isSelected,
  selectedShotId,
  viewMode,
  project,
  onSetSpecialContext,
  onToggle,
  onShotSelect,
  onSceneClick,
  onShotStatusChange,
  onShotContextMenu,
  onSceneContextMenu,
  onSceneHover,
  onShotHover,
  onAddShot,
  animatingShotId,
  editingItem,
  onEditChange,
  onEditSave,
  onEditCancel,
}) => {
  const scenePreviewSrc = useThumbnail(project.path, scene.preview);
  const [isShotsAreaHovered, setIsShotsAreaHovered] = useState(false);

  // Grid view: large preview card
  if (viewMode === 'grid') {
    return (
      <div
        onContextMenu={(e) => e.stopPropagation()}
        className={`bg-card-bg border rounded-med overflow-hidden ${
          isSelected && !selectedShotId
            ? 'border-accent bg-accent/10'
            : isExpanded
            ? 'border-border-secondary bg-hover-bg'
            : 'border-border-primary hover:border-border-secondary'
        }`}
      >
        {/* Scene preview */}
        <div
          data-context-menu="scene"
          onClick={() => {
            onSceneClick(scene.id);
          }}
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggle();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSceneContextMenu(e, scene.id);
          }}
          className="relative w-full h-28 bg-gradient-to-br from-zinc-800 to-zinc-900 cursor-pointer overflow-hidden select-none"
        >
          {/* Expand indicator */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="absolute top-2 left-2 w-6 h-6 bg-sidebar-bg rounded-badge flex items-center justify-center hover:bg-hover-bg cursor-pointer z-10"
          >
            <IconChevronRight
              size={14}
              className={`text-text-secondary transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}
            />
          </div>

          {/* Shot count badge */}
          <div className="absolute top-2 right-2 px-2 py-1 bg-sidebar-bg rounded-badge text-xs font-semibold text-text-secondary flex items-center gap-1">
            <IconMovie size={13} />
            <span>{scene.shots.length} {scene.shots.length === 1 ? 'shot' : 'shots'}</span>
          </div>

          {/* Status badges in bottom right */}
          {(scene.wip || scene.completed) && (
            <div className="absolute bottom-2 right-2 flex items-center gap-1 z-10">
              {scene.wip && (
                <div className="px-1.5 py-0.5 bg-yellow-500/90 text-yellow-950 rounded-badge text-[10px] font-semibold flex items-center gap-0.5">
                  <IconClock size={10} />
                  WIP
                </div>
              )}
              {scene.completed && (
                <div className="px-1.5 py-0.5 bg-green-500/90 text-green-950 rounded-badge text-[10px] font-semibold flex items-center gap-0.5">
                  <IconCircleCheck size={10} />
                  Done
                </div>
              )}
            </div>
          )}

          {/* Scene preview or icon */}
          {scenePreviewSrc ? (
            <img
              src={scenePreviewSrc}
              alt={scene.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center flex-col gap-2 scene-preview-content">
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
          )}

          {/* Scene overlay */}
          <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/60 to-transparent">
            {editingItem?.type === 'scene' && editingItem.id === scene.id ? (
              <input
                type="text"
                value={editingItem.value}
                onChange={(e) => onEditChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onEditSave();
                  if (e.key === 'Escape') onEditCancel();
                }}
                onBlur={onEditSave}
                autoFocus
                className="text-sm font-semibold text-white bg-transparent border-none p-0 w-full focus:outline-none focus:ring-0"
              />
            ) : (
              <div className="text-sm font-semibold text-white truncate">{scene.name}</div>
            )}
            {editingItem?.type === 'description' && editingItem.id === scene.id ? (
              <input
                type="text"
                value={editingItem.value}
                onChange={(e) => onEditChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onEditSave();
                  if (e.key === 'Escape') onEditCancel();
                }}
                onBlur={onEditSave}
                autoFocus
                placeholder="Add description..."
                className="text-xs text-white/70 bg-transparent border-none p-0 w-full focus:outline-none focus:ring-0 placeholder:text-white/40"
              />
            ) : (
              scene.description && (
                <div className="text-xs text-white/70 truncate">{scene.description}</div>
              )
            )}
          </div>
        </div>

        {/* Global Folders */}
        <div className="px-3 py-1.5 grid grid-cols-2 gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSetSpecialContext('asset', scene.id);
            }}
            className={`flex items-center justify-center gap-1 px-2 py-1.5 text-xs select-none transition-all cursor-pointer rounded-badge ${
              project?.currentSpecialContextId &&
              project?.specialContexts?.find((c: any) => c.id === project.currentSpecialContextId)?.type === 'asset' &&
              project?.specialContexts?.find((c: any) => c.id === project.currentSpecialContextId)?.sceneId === scene.id
                ? 'bg-accent/20 border border-accent text-text-primary'
                : 'bg-sidebar-bg border border-border-primary hover:bg-hover-bg hover:border-border-secondary'
            }`}
          >
            <IconBox size={12} stroke={1.5} className="text-text-secondary flex-shrink-0" />
            <span className="text-text-primary font-medium">Assets</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSetSpecialContext('compose', scene.id);
            }}
            className={`flex items-center justify-center gap-1 px-2 py-1.5 text-xs select-none transition-all cursor-pointer rounded-badge ${
              project?.currentSpecialContextId &&
              project?.specialContexts?.find((c: any) => c.id === project.currentSpecialContextId)?.type === 'compose' &&
              project?.specialContexts?.find((c: any) => c.id === project.currentSpecialContextId)?.sceneId === scene.id
                ? 'bg-accent/20 border border-accent text-text-primary'
                : 'bg-sidebar-bg border border-border-primary hover:bg-hover-bg hover:border-border-secondary'
            }`}
          >
            <IconStack2 size={12} stroke={1.5} className="text-text-secondary flex-shrink-0" />
            <span className="text-text-primary font-medium">Compose</span>
          </button>
        </div>


        {/* Shots container */}
        <div
          onMouseEnter={() => {
            onSceneHover(scene.id);
            setIsShotsAreaHovered(true);
          }}
          onMouseLeave={() => {
            onSceneHover(null);
            setIsShotsAreaHovered(false);
          }}
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
                  projectPath={project.path}
                  onClick={() => onShotSelect(shot.id)}
                  onStatusChange={onShotStatusChange}
                  onContextMenu={onShotContextMenu}
                  onHover={onShotHover}
                  isAnimating={animatingShotId === shot.id}
                  isEditing={editingItem?.type === 'shot' && editingItem.id === shot.id}
                  editValue={editingItem?.type === 'shot' && editingItem.id === shot.id ? editingItem.value : ''}
                  onEditChange={onEditChange}
                  onEditSave={onEditSave}
                  onEditCancel={onEditCancel}
                />
              ))}
            </div>

            {/* Add Shot button - appears on hover */}
            <div
              className={`transition-all duration-200 ease-in-out overflow-hidden ${
                isShotsAreaHovered ? 'max-h-8 opacity-100 mt-2' : 'max-h-0 opacity-0 mt-0'
              }`}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddShot(scene.id);
                }}
                className="w-full px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary bg-sidebar-bg hover:bg-hover-bg border border-border-primary hover:border-border-secondary rounded-med transition-colors flex items-center justify-center gap-1.5"
              >
                <span className="text-base leading-none">+</span>
                <span>Add Shot</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // List view: compact plash
  return (
    <div
      onContextMenu={(e) => e.stopPropagation()}
    >
      {/* Compact header (list mode style) */}
      <div
        data-context-menu="scene"
        onClick={() => {
          onSceneClick(scene.id);
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onSceneContextMenu(e, scene.id);
        }}
        className={`px-3 py-2.5 bg-card-bg border rounded-med cursor-pointer hover:bg-hover-bg select-none ${
          isSelected && !selectedShotId
            ? 'border-accent bg-accent/10'
            : isExpanded
            ? 'border-border-secondary bg-hover-bg hover:border-border-secondary'
            : 'border-border-primary hover:border-border-secondary'
        }`}
      >
        {/* Top row: Chevron, Preview, Info */}
        <div className="flex items-center gap-2.5">
          {/* Chevron */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="hover:bg-hover-bg rounded p-0.5 -m-0.5 cursor-pointer"
          >
            <IconChevronRight
              size={14}
              className={`text-text-muted flex-shrink-0 transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}
            />
          </div>

          {/* Scene preview */}
          <div
            className="w-16 h-10 rounded-badge bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center flex-shrink-0 overflow-hidden"
          >
            {scenePreviewSrc ? (
              <img
                src={scenePreviewSrc}
                alt={scene.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <IconMovie size={16} className="text-text-muted" />
            )}
          </div>

          {/* Scene info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              {editingItem?.type === 'scene' && editingItem.id === scene.id ? (
                <input
                  type="text"
                  value={editingItem.value}
                  onChange={(e) => onEditChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onEditSave();
                    if (e.key === 'Escape') onEditCancel();
                  }}
                  onBlur={onEditSave}
                  autoFocus
                  className="text-xs font-semibold text-text-primary bg-transparent border-none p-0 flex-1 focus:outline-none focus:ring-0"
                />
              ) : (
                <div className="text-xs font-semibold text-text-primary truncate">{scene.name}</div>
              )}
              {(scene.wip || scene.completed) && (
                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                  {scene.wip && (
                    <div className="px-1.5 py-0.5 bg-yellow-500/90 text-yellow-950 rounded-badge text-[10px] font-semibold flex items-center gap-0.5">
                      <IconClock size={10} />
                      WIP
                    </div>
                  )}
                  {scene.completed && (
                    <div className="px-1.5 py-0.5 bg-green-500/90 text-green-950 rounded-badge text-[10px] font-semibold flex items-center gap-0.5">
                      <IconCircleCheck size={10} />
                      Done
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="text-xs text-text-muted">
              {scene.shots.length} {scene.shots.length === 1 ? 'shot' : 'shots'}
            </div>
          </div>
        </div>

        {/* Bottom row: Global Folders buttons */}
        <div className="mt-2 grid grid-cols-2 gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSetSpecialContext('asset', scene.id);
            }}
            className={`flex items-center justify-center gap-1 px-1.5 py-1 text-xs select-none transition-all cursor-pointer rounded-badge ${
              project?.currentSpecialContextId &&
              project?.specialContexts?.find((c: any) => c.id === project.currentSpecialContextId)?.type === 'asset' &&
              project?.specialContexts?.find((c: any) => c.id === project.currentSpecialContextId)?.sceneId === scene.id
                ? 'bg-accent/20 border border-accent text-text-primary'
                : 'bg-sidebar-bg border border-border-primary hover:bg-hover-bg hover:border-border-secondary'
            }`}
          >
            <IconBox size={12} stroke={1.5} className="text-text-secondary flex-shrink-0" />
            <span className="text-text-primary font-medium">Assets</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSetSpecialContext('compose', scene.id);
            }}
            className={`flex items-center justify-center gap-1 px-1.5 py-1 text-xs select-none transition-all cursor-pointer rounded-badge ${
              project?.currentSpecialContextId &&
              project?.specialContexts?.find((c: any) => c.id === project.currentSpecialContextId)?.type === 'compose' &&
              project?.specialContexts?.find((c: any) => c.id === project.currentSpecialContextId)?.sceneId === scene.id
                ? 'bg-accent/20 border border-accent text-text-primary'
                : 'bg-sidebar-bg border border-border-primary hover:bg-hover-bg hover:border-border-secondary'
            }`}
          >
            <IconStack2 size={12} stroke={1.5} className="text-text-secondary flex-shrink-0" />
            <span className="text-text-primary font-medium">Compose</span>
          </button>
        </div>
      </div>

      {/* Shots container */}
      <div
        onMouseEnter={() => {
          onSceneHover(scene.id);
          setIsShotsAreaHovered(true);
        }}
        onMouseLeave={() => {
          onSceneHover(null);
          setIsShotsAreaHovered(false);
        }}
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
              projectPath={project.path}
              onClick={() => onShotSelect(shot.id)}
              onStatusChange={onShotStatusChange}
              onContextMenu={onShotContextMenu}
              onHover={onShotHover}
              isAnimating={animatingShotId === shot.id}
              isEditing={editingItem?.type === 'shot' && editingItem.id === shot.id}
              editValue={editingItem?.type === 'shot' && editingItem.id === shot.id ? editingItem.value : ''}
              onEditChange={onEditChange}
              onEditSave={onEditSave}
              onEditCancel={onEditCancel}
            />
          ))}

          {/* Add Shot button - appears on hover */}
          <div
            className={`transition-all duration-200 ease-in-out overflow-hidden ${
              isShotsAreaHovered ? 'max-h-8 opacity-100 mt-2' : 'max-h-0 opacity-0 mt-0'
            }`}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddShot(scene.id);
              }}
              className="w-full px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary bg-sidebar-bg hover:bg-hover-bg border border-border-primary hover:border-border-secondary rounded-med transition-colors flex items-center justify-center gap-1.5"
            >
              <span className="text-base leading-none">+</span>
              <span>Add Shot</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ShotsBrowserProps {
  projectId: string;
  className?: string;
}

const ShotsBrowser: React.FC<ShotsBrowserProps> = ({ projectId, className = '' }) => {
  // Get the entire projects array to ensure reactivity
  const projects = useProjectStore(state => state.projects);
  const project = projects.find(p => p.id === projectId);
  const toggleShotCompleted = useProjectStore(state => state.toggleShotCompleted);
  const setShotStatus = useProjectStore(state => state.setShotStatus);
  const setCurrentShot = useProjectStore(state => state.setCurrentShot);
  const renameScene = useProjectStore(state => state.renameScene);
  const renameShot = useProjectStore(state => state.renameShot);
  const setSceneDescription = useProjectStore(state => state.setSceneDescription);
  const removeShot = useProjectStore(state => state.removeShot);
  const removeScene = useProjectStore(state => state.removeScene);
  const addShot = useProjectStore(state => state.addShot);
  const addScene = useProjectStore(state => state.addScene);
  const setSpecialContext = useProjectStore(state => state.setSpecialContext);
  const { setActiveMenu } = useContextMenuStore();

  // Load expanded scenes from localStorage
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(`shotsbrowser_expanded_${projectId}`);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [animatingShotId, setAnimatingShotId] = useState<string | null>(null);
  const [isContainerHovered, setIsContainerHovered] = useState(false);
  const [showTopShadow, setShowTopShadow] = useState(false);
  const [hoveredSceneId, setHoveredSceneId] = useState<string | null>(null);
  const [hoveredShotId, setHoveredShotId] = useState<string | null>(null);
  const [allVersions, setAllVersions] = useState<ProjectVersion[]>([]);
  const scrollRef = useRef<any>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: 'shot' | 'scene' | 'container';
    id?: string;
  } | null>(null);
  const [editingItem, setEditingItem] = useState<{
    type: 'shot' | 'scene' | 'description';
    id: string;
    value: string;
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'shot' | 'scene';
    name: string;
    id: string;
    shotCount?: number;
  } | null>(null);

  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Toggle shot status: none → wip → completed → none
  const handleShotStatusChange = (shotId: string) => {
    // Get current shot state
    const shot = project?.shots?.find(s => s.id === shotId);
    const isGoingToCompleted = shot?.wip && !shot?.completed;

    toggleShotCompleted(projectId, shotId);

    // Animate only when going to Completed (not WIP)
    if (isGoingToCompleted) {
      setAnimatingShotId(shotId);
      setTimeout(() => setAnimatingShotId(null), 600);
    }
  };

  // Handle scene selection
  const handleSceneClick = (sceneId: string) => {
    // Use batch update to set scene and clear shot and special context atomically
    useProjectStore.setState((state) => {
      const project = state.projects.find(p => p.id === projectId);
      if (!project) return state;

      return {
        ...state,
        projects: state.projects.map(p =>
          p.id === projectId
            ? { ...p, currentSceneId: sceneId, currentShotId: undefined, currentSpecialContextId: undefined }
            : p
        )
      };
    });

    // Save to file
    const project = useProjectStore.getState().projects.find(p => p.id === projectId);
    if (project) {
      useProjectStore.getState().updateProject(project);
    }
  };

  // Handle shot selection
  const handleShotSelect = (shotId: string) => {
    setCurrentShot(projectId, shotId);
  };

  // Handle shot context menu
  const handleShotContextMenu = (e: React.MouseEvent, shotId: string, _type: 'preview' | 'name') => {
    setActiveMenu('shots');
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'shot', id: shotId });
  };

  // Handle scene context menu
  const handleSceneContextMenu = (e: React.MouseEvent, sceneId: string) => {
    setActiveMenu('scenes');
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'scene', id: sceneId });
  };

  // Close context menu
  const closeContextMenu = () => {
    setContextMenu(null);
    setActiveMenu(null);
  };

  // Handle rename
  const handleStartRename = (type: 'shot' | 'scene', id: string) => {
    if (type === 'shot') {
      const shot = project?.shots?.find(s => s.id === id);
      if (shot) {
        // For shots, extract only the number part
        const match = shot.name.match(/\d+$/);
        setEditingItem({ type: 'shot', id, value: match ? match[0] : shot.name });
      }
    } else {
      const scene = project?.scenes?.find(s => s.id === id);
      if (scene) {
        setEditingItem({ type: 'scene', id, value: scene.name });
      }
    }
    closeContextMenu();
  };

  const handleSaveRename = () => {
    if (!editingItem) return;

    if (editingItem.type === 'shot') {
      const shot = project?.shots?.find(s => s.id === editingItem.id);
      if (shot) {
        // For shots, only update the number part
        const prefix = shot.name.replace(/\d+$/, '');
        let numberPart = editingItem.value;

        // If empty, find the next available number
        if (!numberPart || numberPart.trim() === '') {
          const shotsInScene = project?.shots?.filter(s => s.sceneId === shot.sceneId) || [];
          const existingNumbers = shotsInScene
            .map(s => {
              const match = s.name.match(/\d+$/);
              return match ? parseInt(match[0], 10) : 0;
            })
            .sort((a, b) => a - b);

          // Find the first available number starting from 1
          let nextNumber = 1;
          for (const num of existingNumbers) {
            if (num === nextNumber) {
              nextNumber++;
            } else {
              break;
            }
          }

          numberPart = String(nextNumber).padStart(3, '0');
        }

        const newName = prefix + numberPart;
        renameShot(projectId, editingItem.id, newName);
      }
    } else if (editingItem.type === 'scene') {
      renameScene(projectId, editingItem.id, editingItem.value);
    } else if (editingItem.type === 'description') {
      setSceneDescription(projectId, editingItem.id, editingItem.value);
    }

    setEditingItem(null);
  };

  const handleCancelRename = () => {
    setEditingItem(null);
  };

  // Handle scene description edit
  const handleSetDescription = (sceneId: string) => {
    const scene = project?.scenes?.find(s => s.id === sceneId);
    if (!scene) return;

    setEditingItem({ type: 'description', id: sceneId, value: scene.description || '' });
    closeContextMenu();
  };

  // Handle add shot to scene
  const handleAddShot = (_sceneId: string) => {
    addShot(projectId);
    closeContextMenu();
  };

  // Handle delete shot with confirmation
  const handleDeleteShot = (shotId: string) => {
    const shot = project?.shots?.find(s => s.id === shotId);
    if (!shot) return;

    setDeleteConfirm({
      type: 'shot',
      name: shot.name,
      id: shotId,
    });
    closeContextMenu();
  };

  // Handle delete scene with confirmation
  const handleDeleteScene = (sceneId: string) => {
    const scene = project?.scenes?.find(s => s.id === sceneId);
    if (!scene) return;

    const shotCount = project?.shots?.filter(s => s.sceneId === sceneId).length || 0;
    setDeleteConfirm({
      type: 'scene',
      name: scene.name,
      id: sceneId,
      shotCount,
    });
    closeContextMenu();
  };

  // Handle shot status change from context menu
  const handleShotStatusChangeFromMenu = (shotId: string, targetStatus: 'none' | 'wip' | 'done') => {
    const shot = project?.shots?.find(s => s.id === shotId);
    if (!shot) return;

    // Set the status directly
    setShotStatus(projectId, shotId, targetStatus);

    // Trigger animation only when going to 'done'
    if (targetStatus === 'done') {
      setAnimatingShotId(shotId);
      setTimeout(() => setAnimatingShotId(null), 600);
    }

    closeContextMenu();
  };

  // Process image blob for scene preview
  const processImageBlobForScene = async (sceneId: string, blob: Blob) => {
    if (!project) return;

    const scene = project.scenes?.find(s => s.id === sceneId);
    if (!scene) return;

    try {
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      const { writeBinaryFile, createDir, BaseDirectory } = await import('@tauri-apps/api/fs');
      const { join, appDataDir } = await import('@tauri-apps/api/path');
      const tempFileName = `temp_scene_preview_${Date.now()}.png`;

      try {
        await createDir('', { dir: BaseDirectory.AppData, recursive: true });
      } catch (e) {
        // Directory might already exist
      }

      await writeBinaryFile(tempFileName, uint8Array, { dir: BaseDirectory.AppData });

      const appDir = await appDataDir();
      const tempPath = await join(appDir, tempFileName);

      const { invoke } = await import('@tauri-apps/api/tauri');
      const previewPath = await invoke<string>('set_scene_preview', {
        projectPath: project.path,
        sceneNumber: scene.number,
        imagePath: tempPath
      });

      // Clear cache for old preview if it exists
      if (scene.preview) {
        const { clearThumbnailCache } = await import('../../hooks/useThumbnail');
        clearThumbnailCache(project.path, scene.preview);
      }

      const updatedScenes = project.scenes!.map(s =>
        s.id === sceneId ? { ...s, preview: previewPath } : s
      );

      const { updateProject } = useProjectStore.getState();
      await updateProject({
        ...project,
        scenes: updatedScenes,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to process scene image:', error);
    }
  };

  // Process image blob for shot preview
  const processImageBlobForShot = async (shotId: string, blob: Blob) => {
    if (!project) return;

    const shot = project.shots?.find(s => s.id === shotId);
    if (!shot) return;

    const scene = project.scenes?.find(s => s.id === shot.sceneId);
    if (!scene) return;

    try {
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      const { writeBinaryFile, createDir, BaseDirectory } = await import('@tauri-apps/api/fs');
      const { join, appDataDir } = await import('@tauri-apps/api/path');
      const tempFileName = `temp_shot_preview_${Date.now()}.png`;

      try {
        await createDir('', { dir: BaseDirectory.AppData, recursive: true });
      } catch (e) {
        // Directory might already exist
      }

      await writeBinaryFile(tempFileName, uint8Array, { dir: BaseDirectory.AppData });

      const appDir = await appDataDir();
      const tempPath = await join(appDir, tempFileName);

      const { invoke } = await import('@tauri-apps/api/tauri');
      const previewPath = await invoke<string>('set_shot_preview', {
        projectPath: project.path,
        sceneNumber: scene.number,
        shotNumber: shot.number,
        imagePath: tempPath
      });

      // Clear cache for old preview if it exists
      if (shot.preview) {
        const { clearThumbnailCache } = await import('../../hooks/useThumbnail');
        clearThumbnailCache(project.path, shot.preview);
      }

      const updatedShots = project.shots!.map(s =>
        s.id === shotId ? { ...s, preview: previewPath } : s
      );

      const { updateProject } = useProjectStore.getState();
      updateProject({
        ...project,
        shots: updatedShots,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to process shot image:', error);
    }
  };

  // Remove scene preview
  const removeScenePreview = async (sceneId: string) => {
    if (!project) return;

    const scene = project.scenes?.find(s => s.id === sceneId);
    if (!scene || !scene.preview) return;

    try {
      // Clear cache for old preview
      const { clearThumbnailCache } = await import('../../hooks/useThumbnail');
      clearThumbnailCache(project.path, scene.preview);

      // Delete preview file from filesystem
      const previewPath = `${project.path}/${scene.preview}`;
      const { removeFile } = await import('@tauri-apps/api/fs');

      try {
        await removeFile(previewPath);
      } catch (error) {
        console.warn('Failed to delete preview file:', error);
      }

      // Update project state
      const updatedScenes = project.scenes!.map(s =>
        s.id === sceneId ? { ...s, preview: undefined } : s
      );

      const { updateProject } = useProjectStore.getState();
      updateProject({
        ...project,
        scenes: updatedScenes,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to remove scene preview:', error);
    }
  };

  // Remove shot preview
  const removeShotPreview = async (shotId: string) => {
    if (!project) return;

    const shot = project.shots?.find(s => s.id === shotId);
    if (!shot || !shot.preview) return;

    try {
      // Clear cache for old preview
      const { clearThumbnailCache } = await import('../../hooks/useThumbnail');
      clearThumbnailCache(project.path, shot.preview);

      // Delete preview file from filesystem
      const previewPath = `${project.path}/${shot.preview}`;
      const { removeFile } = await import('@tauri-apps/api/fs');

      try {
        await removeFile(previewPath);
      } catch (error) {
        console.warn('Failed to delete preview file:', error);
      }

      // Update project state
      const updatedShots = project.shots!.map(s =>
        s.id === shotId ? { ...s, preview: undefined } : s
      );

      const { updateProject } = useProjectStore.getState();
      updateProject({
        ...project,
        shots: updatedShots,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to remove shot preview:', error);
    }
  };

  // Global paste handler
  useEffect(() => {
    const handleGlobalPaste = async (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      // Check if hovering over a shot first, then scene
      if (hoveredShotId) {
        const items = e.clipboardData?.items;
        const files = e.clipboardData?.files;

        if (items) {
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.indexOf('image') !== -1) {
              e.preventDefault();
              const blob = item.getAsFile();
              if (blob) {
                await processImageBlobForShot(hoveredShotId, blob);
                return;
              }
            }
          }
        }

        if (files && files.length > 0) {
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.type.indexOf('image') !== -1) {
              e.preventDefault();
              await processImageBlobForShot(hoveredShotId, file);
              return;
            }
          }
        }

        const text = e.clipboardData?.getData('text');
        if (text && text.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/i)) {
          e.preventDefault();
          if (!project) return;
          try {
            const { invoke } = await import('@tauri-apps/api/tauri');
            const shot = project.shots?.find(s => s.id === hoveredShotId);
            const scene = project.scenes?.find(s => s.id === shot?.sceneId);
            if (shot && scene) {
              const previewPath = await invoke<string>('set_shot_preview', {
                projectPath: project.path,
                sceneNumber: scene.number,
                shotNumber: shot.number,
                imagePath: text
              });
              const updatedShots = project.shots!.map(s =>
                s.id === hoveredShotId ? { ...s, preview: previewPath } : s
              );
              const { updateProject } = useProjectStore.getState();
              updateProject({
                ...project,
                shots: updatedShots,
                updatedAt: new Date().toISOString()
              });
            }
          } catch (error) {
            console.error('Failed to set shot preview from path:', error);
          }
        }
      } else if (hoveredSceneId) {
        const items = e.clipboardData?.items;
        const files = e.clipboardData?.files;

        if (items) {
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.indexOf('image') !== -1) {
              e.preventDefault();
              const blob = item.getAsFile();
              if (blob) {
                await processImageBlobForScene(hoveredSceneId, blob);
                return;
              }
            }
          }
        }

        if (files && files.length > 0) {
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.type.indexOf('image') !== -1) {
              e.preventDefault();
              await processImageBlobForScene(hoveredSceneId, file);
              return;
            }
          }
        }

        const text = e.clipboardData?.getData('text');
        if (text && text.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/i)) {
          e.preventDefault();
          if (!project) return;
          try {
            const { invoke } = await import('@tauri-apps/api/tauri');
            const scene = project.scenes?.find(s => s.id === hoveredSceneId);
            if (scene) {
              const previewPath = await invoke<string>('set_scene_preview', {
                projectPath: project.path,
                sceneNumber: scene.number,
                imagePath: text
              });
              const updatedScenes = project.scenes!.map(s =>
                s.id === hoveredSceneId ? { ...s, preview: previewPath } : s
              );
              const { updateProject } = useProjectStore.getState();
              updateProject({
                ...project,
                scenes: updatedScenes,
                updatedAt: new Date().toISOString()
              });
            }
          } catch (error) {
            console.error('Failed to set scene preview from path:', error);
          }
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [hoveredSceneId, hoveredShotId, project]);

  // Save expanded scenes to localStorage
  useEffect(() => {
    localStorage.setItem(`shotsbrowser_expanded_${projectId}`, JSON.stringify(Array.from(expandedScenes)));
  }, [expandedScenes, projectId]);

  // Auto-expand scene with current shot on load
  useEffect(() => {
    if (project?.currentShotId && project?.shots) {
      const currentShot = project.shots.find(s => s.id === project.currentShotId);
      if (currentShot?.sceneId) {
        setExpandedScenes(prev => {
          const newSet = new Set(prev);
          newSet.add(currentShot.sceneId);
          return newSet;
        });
      }
    }
  }, [project?.currentShotId, project?.shots]);

  // Load versions to calculate shot version counts
  useEffect(() => {
    if (!project?.path) return;

    const loadVersions = async () => {
      try {
        const result = await invoke<ProjectVersion[]>('get_project_versions', {
          projectPath: project.path
        });
        setAllVersions(result);
      } catch (error) {
        console.error('Failed to load versions:', error);
        setAllVersions([]);
      }
    };

    loadVersions();

    // Listen for version updates
    const handleVersionUpdate = () => {
      loadVersions();
    };

    window.addEventListener('version-created', handleVersionUpdate);
    window.addEventListener('refresh-all', handleVersionUpdate);

    return () => {
      window.removeEventListener('version-created', handleVersionUpdate);
      window.removeEventListener('refresh-all', handleVersionUpdate);
    };
  }, [project?.path]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };

    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu]);

  // Handle keyboard shortcuts for delete confirmation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!deleteConfirm) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        setDeleteConfirm(null);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (deleteConfirm.type === 'shot') {
          removeShot(projectId, deleteConfirm.id);
        } else if (deleteConfirm.type === 'scene') {
          removeScene(projectId, deleteConfirm.id);
        }
        setDeleteConfirm(null);
      }
    };

    if (deleteConfirm) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [deleteConfirm, projectId, removeShot, removeScene]);

  // Handle scroll for top shadow
  useEffect(() => {
    const scrollElement = scrollRef.current?.getScrollElement();
    if (!scrollElement) return;

    const handleScroll = () => {
      const scrollTop = scrollElement.scrollTop;
      setShowTopShadow(scrollTop > 5);
    };

    scrollElement.addEventListener('scroll', handleScroll);
    return () => scrollElement.removeEventListener('scroll', handleScroll);
  }, []);

  // Helper function to extract version number from filename
  const extractVersionNumber = (filename: string): number => {
    const match = filename.match(/_v(\d+)/i);
    return match ? parseInt(match[1], 10) : 0;
  };

  // Calculate highest version number for each shot
  const shotVersions = useMemo(() => {
    const versionMap = new Map<number, number>();

    if (!project?.shots || !allVersions.length) return versionMap;

    // Process each version file
    allVersions.forEach(version => {
      if (!version.is_versioned) return;

      // Extract shot number using file naming utility
      const shotNumber = extractShotNumber(version.name);
      if (shotNumber === null) return;

      // Extract version number
      const versionNum = extractVersionNumber(version.name);
      if (versionNum === 0) return;

      // Update highest version for this shot
      const currentHighest = versionMap.get(shotNumber) || 0;
      if (versionNum > currentHighest) {
        versionMap.set(shotNumber, versionNum);
      }
    });

    return versionMap;
  }, [allVersions, project?.shots]);

  // Get scenes and shots from project
  const scenes = useMemo(() => {
    if (!project?.hasShots || !project.scenes || !project.shots) return [];

    return project.scenes.map(scene => {
      const sceneShots = project.shots
        ?.filter(shot => shot.sceneId === scene.id)
        .map(shot => ({
          id: shot.id,
          name: shot.name,
          sceneId: shot.sceneId,
          versions: shotVersions.get(shot.number) || 0,
          wip: shot.wip,
          completed: shot.completed,
          preview: shot.preview,
          number: shot.number,
        })) || [];

      // Calculate scene status based on shots
      let sceneWip = false;
      let sceneCompleted = false;

      if (sceneShots.length > 0) {
        // If all shots are completed, scene is completed
        const allCompleted = sceneShots.every(shot => shot.completed);
        // If at least one shot is WIP (and not all completed), scene is WIP
        const hasWip = sceneShots.some(shot => shot.wip && !shot.completed);

        if (allCompleted) {
          sceneCompleted = true;
          sceneWip = false;
        } else if (hasWip) {
          sceneWip = true;
          sceneCompleted = false;
        }
      }

      return {
        id: scene.id,
        name: scene.name,
        description: scene.description,
        preview: scene.preview,
        number: scene.number,
        wip: sceneWip,
        completed: sceneCompleted,
        shots: sceneShots,
      };
    });
  }, [project, shotVersions]);

  // Filter scenes and shots based on search
  const filteredScenes = useMemo(() => {
    if (!searchTerm.trim()) return scenes;

    const term = searchTerm.toLowerCase();
    return scenes.map(scene => ({
      ...scene,
      shots: scene.shots.filter(shot =>
        shot.name.toLowerCase().includes(term) ||
        scene.name.toLowerCase().includes(term)
      ),
    })).filter(scene =>
      scene.name.toLowerCase().includes(term) || scene.shots.length > 0
    );
  }, [searchTerm, scenes]);

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

  const totalShots = scenes.reduce((sum, scene) => sum + scene.shots.length, 0);

  if (!project || !project.hasShots) {
    return (
      <div className={`flex flex-col bg-sidebar-bg border-l border-l-border-primary border-t border-t-border-primary p-4 relative ${className}`}>
        <div className="flex items-center justify-center h-full text-text-muted text-sm">
          This project doesn't have shots enabled
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col bg-sidebar-bg border-l border-l-border-primary border-t border-t-border-primary p-4 relative ${className}`}
      onContextMenuCapture={(e) => {
        // Check if element or its parents have custom context menu
        const target = e.target as HTMLElement;
        const hasCustomMenu = target.closest('[data-context-menu]');

        // If no custom menu, prevent default Windows context menu
        if (!hasCustomMenu) {
          e.preventDefault();
        }
      }}
    >
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

      {/* Global Folders */}
      <div className="mb-3 grid grid-cols-2 gap-1.5">
        <button
          onClick={() => {
            setSpecialContext(projectId, 'asset');
          }}
          className={`flex items-center justify-center gap-1.5 px-2 py-2 text-xs select-none transition-all cursor-pointer rounded-badge ${
            project?.currentSpecialContextId &&
            project?.specialContexts?.find((c: any) => c.id === project.currentSpecialContextId)?.type === 'asset' &&
            !project?.specialContexts?.find((c: any) => c.id === project.currentSpecialContextId)?.sceneId &&
            !project?.currentSceneId &&
            !project?.currentShotId
              ? 'bg-accent/20 border border-accent text-text-primary'
              : 'bg-card-bg border border-border-primary hover:bg-hover-bg hover:border-border-secondary'
          }`}
        >
          <IconBox size={14} stroke={1.5} className="text-text-secondary flex-shrink-0" />
          <span className="text-text-primary font-medium truncate">Asset Projects</span>
        </button>
        <button
          onClick={() => {
            setSpecialContext(projectId, 'compose');
          }}
          className={`flex items-center justify-center gap-1.5 px-2 py-2 text-xs select-none transition-all cursor-pointer rounded-badge ${
            project?.currentSpecialContextId &&
            project?.specialContexts?.find((c: any) => c.id === project.currentSpecialContextId)?.type === 'compose' &&
            !project?.specialContexts?.find((c: any) => c.id === project.currentSpecialContextId)?.sceneId &&
            !project?.currentSceneId &&
            !project?.currentShotId
              ? 'bg-accent/20 border border-accent text-text-primary'
              : 'bg-card-bg border border-border-primary hover:bg-hover-bg hover:border-border-secondary'
          }`}
        >
          <IconStack2 size={14} stroke={1.5} className="text-text-secondary flex-shrink-0" />
          <span className="text-text-primary font-medium truncate">Compose Projects</span>
        </button>
      </div>

      {/* Top gradient shadow */}
      <div
        className="h-4 pointer-events-none transition-opacity duration-300 -mb-4 relative z-10"
        style={{
          background: 'linear-gradient(to bottom, #0f0f0f 0%, rgba(15, 15, 15, 0.7) 30%, rgba(15, 15, 15, 0.3) 60%, transparent 100%)',
          opacity: showTopShadow ? 1 : 0
        }}
      ></div>

      {/* Scenes list */}
      <SimpleBar
        ref={scrollRef}
        className="flex-1 custom-scrollbar"
        style={{ paddingBottom: '45px', minHeight: 0 }}
        onMouseEnter={() => setIsContainerHovered(true)}
        onMouseLeave={() => {
          setIsContainerHovered(false);
          setHoveredSceneId(null);
        }}
      >
        <div className="space-y-3">
          {filteredScenes.length > 0 ? (
            filteredScenes.map(scene => (
              <SceneCard
                key={scene.id}
                scene={scene}
                isExpanded={expandedScenes.has(scene.id)}
                isSelected={project?.currentSceneId === scene.id}
                selectedShotId={project?.currentShotId || null}
                viewMode={viewMode}
                project={project}
                onSetSpecialContext={(contextType, sceneId) => setSpecialContext(projectId, contextType, sceneId)}
                onToggle={() => toggleScene(scene.id)}
                onShotSelect={handleShotSelect}
                onSceneClick={handleSceneClick}
                onShotStatusChange={handleShotStatusChange}
                onShotContextMenu={handleShotContextMenu}
                onSceneContextMenu={handleSceneContextMenu}
                animatingShotId={animatingShotId}
                editingItem={editingItem}
                onEditChange={(value) => setEditingItem(editingItem ? { ...editingItem, value } : null)}
                onEditSave={handleSaveRename}
                onEditCancel={handleCancelRename}
                onSceneHover={setHoveredSceneId}
                onShotHover={setHoveredShotId}
                onAddShot={(sceneId) => addShot(projectId, sceneId)}
              />
            ))
          ) : (
            <div className="text-center py-8 text-text-muted text-xs">
              No scenes or shots found
            </div>
          )}

          {/* Add Scene button - hide when hovering over a scene */}
          <button
            onClick={() => addScene(projectId)}
            className={`w-full mt-2 px-3 py-2 bg-transparent border border-border-secondary border-dashed rounded-button text-xs text-text-muted hover:border-accent hover:text-accent transition-all ${
              isContainerHovered && !hoveredSceneId ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            + Add Scene...
          </button>
        </div>
      </SimpleBar>

      {/* Footer - Absolute positioned */}
      <div className="absolute bottom-3 left-4 right-4 pt-2.5">
        <div className="bg-card-bg border border-border-primary rounded-button px-4 py-2">
          <div className="text-xs">
            <span className="text-text-muted">Scenes:</span>{' '}
            <span className="text-text-primary font-medium">{scenes.length}</span>
            <span className="text-text-muted mx-2">•</span>
            <span className="text-text-muted">Shots:</span>{' '}
            <span className="text-text-primary font-medium">{totalShots}</span>
          </div>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-zinc-800 border border-zinc-700 rounded-button shadow-lg py-1 z-50 min-w-[180px] animate-slideDown"
          style={{
            top: `${(() => {
              const menuHeight = contextMenu.type === 'shot' ? 320 : contextMenu.type === 'scene' ? 220 : 200;
              const windowHeight = window.innerHeight;
              const wouldOverflow = contextMenu.y + menuHeight > windowHeight;
              return wouldOverflow ? Math.max(10, windowHeight - menuHeight - 10) : contextMenu.y;
            })()}px`,
            left: `${(() => {
              const menuWidth = 180;
              const windowWidth = window.innerWidth;
              const wouldOverflow = contextMenu.x + menuWidth > windowWidth;
              return wouldOverflow ? windowWidth - menuWidth - 10 : contextMenu.x;
            })()}px`
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === 'shot' && contextMenu.id ? (
            <>
              {/* Shot Context Menu */}
              <button
                onClick={async () => {
                  const shot = project?.shots?.find(s => s.id === contextMenu.id);
                  if (!shot || !project) return;

                  try {
                    const { open } = await import('@tauri-apps/api/dialog');
                    const selected = await open({
                      multiple: false,
                      filters: [{
                        name: 'Image',
                        extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
                      }]
                    });

                    if (selected && typeof selected === 'string') {
                      const { readBinaryFile } = await import('@tauri-apps/api/fs');
                      const fileData = await readBinaryFile(selected);
                      const arrayBuffer = fileData.buffer as ArrayBuffer;
                      const blob = new Blob([arrayBuffer]);
                      await processImageBlobForShot(contextMenu.id!, blob);
                    }
                  } catch (error) {
                    console.error('Failed to set shot preview:', error);
                  }
                  closeContextMenu();
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
              >
                <IconPhoto stroke={1.5} className="w-4 h-4" />
                Set Preview
              </button>
              <button
                onClick={async () => {
                  const shot = project?.shots?.find(s => s.id === contextMenu.id);
                  if (shot) {
                    try {
                      const clipboardItems = await navigator.clipboard.read();
                      for (const item of clipboardItems) {
                        const imageTypes = item.types.filter(type => type.startsWith('image/'));
                        if (imageTypes.length > 0) {
                          const blob = await item.getType(imageTypes[0]);
                          await processImageBlobForShot(contextMenu.id!, blob);
                          break;
                        }
                      }
                    } catch (error) {
                      console.error('Failed to paste shot preview from clipboard:', error);
                    }
                  }
                  closeContextMenu();
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
              >
                <IconPhoto stroke={1.5} className="w-4 h-4" />
                Paste Preview
              </button>
              <button
                onClick={async () => {
                  if (contextMenu.id) {
                    await removeShotPreview(contextMenu.id);
                  }
                  closeContextMenu();
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
              >
                <IconX stroke={1.5} className="w-4 h-4" />
                Remove Preview
              </button>
              <div className="border-t border-zinc-700 my-1" />
              <div className="px-2 py-1 text-xs text-zinc-500 font-medium">Status</div>
              <button
                onClick={() => {
                  handleShotStatusChangeFromMenu(contextMenu.id!, 'wip');
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
              >
                <IconCircleFilled stroke={1.5} className="w-4 h-4 fill-yellow-500 text-yellow-500" />
                WIP
              </button>
              <button
                onClick={() => {
                  handleShotStatusChangeFromMenu(contextMenu.id!, 'done');
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
              >
                <IconCircleFilled stroke={1.5} className="w-4 h-4 fill-green-500 text-green-500" />
                Done
              </button>
              <button
                onClick={() => {
                  handleShotStatusChangeFromMenu(contextMenu.id!, 'none');
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
              >
                <IconX stroke={1.5} className="w-4 h-4" />
                Clear Status
              </button>
              <div className="border-t border-zinc-700 my-1" />
              <button
                onClick={() => {
                  handleStartRename('shot', contextMenu.id!);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
              >
                <IconPencil stroke={1.5} className="w-4 h-4" />
                Renumber
              </button>
              <button
                onClick={() => {
                  handleDeleteShot(contextMenu.id!);
                }}
                disabled={(() => {
                  const shot = project?.shots?.find(s => s.id === contextMenu.id);
                  if (!shot) return true;
                  const shotsInScene = project?.shots?.filter(s => s.sceneId === shot.sceneId) || [];
                  return shotsInScene.length <= 1;
                })()}
                className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${
                  (() => {
                    const shot = project?.shots?.find(s => s.id === contextMenu.id);
                    if (!shot) return 'text-zinc-600 cursor-not-allowed';
                    const shotsInScene = project?.shots?.filter(s => s.sceneId === shot.sceneId) || [];
                    return shotsInScene.length <= 1
                      ? 'text-zinc-600 cursor-not-allowed'
                      : 'hover:bg-red-900/50 text-red-400';
                  })()
                }`}
              >
                <IconTrash stroke={1.5} className="w-4 h-4" />
                Delete
              </button>
            </>
          ) : contextMenu.type === 'scene' && contextMenu.id ? (
            <>
              {/* Scene Context Menu */}
              <button
                onClick={async () => {
                  const scene = project?.scenes?.find(s => s.id === contextMenu.id);
                  if (!scene || !project) return;

                  try {
                    const { open } = await import('@tauri-apps/api/dialog');
                    const selected = await open({
                      multiple: false,
                      filters: [{
                        name: 'Image',
                        extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
                      }]
                    });

                    if (selected && typeof selected === 'string') {
                      const { readBinaryFile } = await import('@tauri-apps/api/fs');
                      const fileData = await readBinaryFile(selected);
                      const arrayBuffer = fileData.buffer as ArrayBuffer;
                      const blob = new Blob([arrayBuffer]);
                      await processImageBlobForScene(contextMenu.id!, blob);
                    }
                  } catch (error) {
                    console.error('Failed to set scene preview:', error);
                  }
                  closeContextMenu();
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
              >
                <IconPhoto stroke={1.5} className="w-4 h-4" />
                Set Preview
              </button>
              <button
                onClick={async () => {
                  const scene = project?.scenes?.find(s => s.id === contextMenu.id);
                  if (scene) {
                    try {
                      const clipboardItems = await navigator.clipboard.read();
                      for (const item of clipboardItems) {
                        const imageTypes = item.types.filter(type => type.startsWith('image/'));
                        if (imageTypes.length > 0) {
                          const blob = await item.getType(imageTypes[0]);
                          await processImageBlobForScene(contextMenu.id!, blob);
                          break;
                        }
                      }
                    } catch (error) {
                      console.error('Failed to paste scene preview from clipboard:', error);
                    }
                  }
                  closeContextMenu();
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
              >
                <IconPhoto stroke={1.5} className="w-4 h-4" />
                Paste Preview
              </button>
              <button
                onClick={async () => {
                  if (contextMenu.id) {
                    await removeScenePreview(contextMenu.id);
                  }
                  closeContextMenu();
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
              >
                <IconX stroke={1.5} className="w-4 h-4" />
                Remove Preview
              </button>
              <div className="border-t border-zinc-700 my-1" />
              <button
                onClick={() => {
                  handleAddShot(contextMenu.id!);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
              >
                <IconPlus stroke={1.5} className="w-4 h-4" />
                Add Shot
              </button>
              <button
                onClick={() => {
                  handleSetDescription(contextMenu.id!);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
              >
                <IconFileText stroke={1.5} className="w-4 h-4" />
                Set Description
              </button>
              <button
                onClick={() => {
                  handleStartRename('scene', contextMenu.id!);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
              >
                <IconPencil stroke={1.5} className="w-4 h-4" />
                Rename
              </button>
              <button
                onClick={() => {
                  handleDeleteScene(contextMenu.id!);
                }}
                disabled={(project?.scenes || []).length <= 1}
                className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${
                  (project?.scenes || []).length <= 1
                    ? 'text-zinc-600 cursor-not-allowed'
                    : 'hover:bg-red-900/50 text-red-400'
                }`}
              >
                <IconTrash stroke={1.5} className="w-4 h-4" />
                Delete
              </button>
            </>
          ) : (
            <>
              {/* Container Context Menu */}
              <button
                onClick={() => {
                  addScene(projectId);
                  closeContextMenu();
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
              >
                <IconPlus stroke={1.5} className="w-4 h-4" />
                Add Scene
              </button>
              <div className="border-t border-zinc-700 my-1" />
              <div className="px-2 py-1 text-xs text-zinc-500 font-medium">View Mode</div>
              <button
                onClick={() => {
                  setViewMode('grid');
                  closeContextMenu();
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
              >
                <IconLayoutGrid stroke={1.5} className="w-4 h-4" />
                Grid View
              </button>
              <button
                onClick={() => {
                  setViewMode('list');
                  closeContextMenu();
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 flex items-center gap-2"
              >
                <IconLayoutList stroke={1.5} className="w-4 h-4" />
                List View
              </button>
            </>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">Confirm Delete</h3>
            <p className="text-zinc-400 mb-6">
              {deleteConfirm.type === 'scene' && deleteConfirm.shotCount
                ? `Are you sure you want to delete scene "${deleteConfirm.name}" and its ${deleteConfirm.shotCount} shot(s)? This action cannot be undone.`
                : `Are you sure you want to delete "${deleteConfirm.name}"? This action cannot be undone.`
              }
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors animate-button"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (deleteConfirm.type === 'shot') {
                    removeShot(projectId, deleteConfirm.id);
                  } else if (deleteConfirm.type === 'scene') {
                    removeScene(projectId, deleteConfirm.id);
                  }
                  setDeleteConfirm(null);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors font-medium animate-button"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShotsBrowser;
