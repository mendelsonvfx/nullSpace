import { useState, useEffect, useRef, useCallback } from 'react';
import { IconStarFilled, IconStar, IconSettings, IconX, IconCheck, IconFolderOpen, IconCreditCard, IconClock, IconRefresh, IconTrash, IconPlus, IconPencil } from '@tabler/icons-react';
import { invoke } from '@tauri-apps/api';
import { useProjectStore } from '../../store/projectStore';
import { LinkItem, LinkInputForm, NotesSection } from '../shared';
import { VersionsOverview } from './VersionsOverview';
import { OutputOverview } from './OutputOverview';
import { ShotsOverviewTable } from './ShotsOverviewTable';
import { SoftwareIcon } from '../SoftwareIcon';
import { STATUS_LABELS, SOFTWARE_OPTIONS } from '../../utils';
import { InlineTimer, TimeInfoBar } from '../time';
import { ManualTimeEntryModal } from '../modals/ManualTimeEntryModal';
import { useTimeTrackingFeature } from '../../hooks/useTimeTrackingFeature';
import { useTimeTrackingStore } from '../../features/time-tracking/stores/timeTrackingStore';
import { useThumbnail } from '../../hooks/useThumbnail';
import { useModalBlur } from '../../hooks/useModalBlur';
import SimpleBar from 'simplebar-react';

type ProjectStatus = 'active' | 'archived' | 'completed' | 'paused';

interface ProjectDetailsProps {
  project: any;
  launchingStatus: Record<string, 'idle' | 'launching' | 'success'>;
  onClose: () => void;
  onOpenFolder: () => void;
  onLaunchSoftware: (software: any) => void;
  onDeleteProject: (project: any) => void;
  showNotification: (type: 'success' | 'error' | 'warning' | 'info', message: string, title?: string, duration?: number) => void;
}

export function ProjectDetails({ project, launchingStatus, onClose, onOpenFolder, onLaunchSoftware, onDeleteProject, showNotification }: ProjectDetailsProps) {
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showManualTimeEntry, setShowManualTimeEntry] = useState(false);
  const [isPaymentModalAnimating, setIsPaymentModalAnimating] = useState(false);
  const [isFavoriteAnimating, setIsFavoriteAnimating] = useState(false);
  const [shotToDelete, setShotToDelete] = useState<{ id: string; name: string } | null>(null);
  const [softwareToRemove, setSoftwareToRemove] = useState<string | null>(null);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [showTopShadow, setShowTopShadow] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState(project.description || '');
  const contentScrollRef = useRef<HTMLElement | null>(null);

  // Sync description value when project changes
  useEffect(() => {
    setDescriptionValue(project.description || '');
  }, [project.description]);

  // Animation effect for Payment Modal
  useEffect(() => {
    if (showPaymentModal) {
      setTimeout(() => setIsPaymentModalAnimating(true), 10);
    } else {
      setIsPaymentModalAnimating(false);
    }
  }, [showPaymentModal]);

  // Scroll handler for header gradient
  const handleContentScroll = useCallback(() => {
    if (!contentScrollRef.current) return;
    const scrollTop = contentScrollRef.current.scrollTop;
    const isAtTop = scrollTop < 5;
    setShowTopShadow(!isAtTop);
  }, []);

  // Add scroll event listener to content
  useEffect(() => {
    const scrollElement = contentScrollRef.current;
    if (scrollElement) {
      scrollElement.addEventListener('scroll', handleContentScroll);
      return () => {
        scrollElement.removeEventListener('scroll', handleContentScroll);
      };
    }
  }, [handleContentScroll]);

  // Track which date fields user has manually filled in Project Settings
  const [deadlineFieldsFilled, setDeadlineFieldsFilled] = useState({
    day: false,
    month: false,
    year: false
  });

  // Get fresh project from store for real-time timer updates
  const latestProject = useProjectStore(state => state.projects.find(p => p.id === project.id) || project);
  const timeTrackingEnabled = useTimeTrackingFeature();
  const timeTrackingSessions = useTimeTrackingStore(state => state.sessions);

  // Load cached thumbnail for Project Settings modal
  const thumbnailSrc = useThumbnail(project.path, project.thumbnail);

  // Modal blur effect
  const blurClass = useModalBlur();

  // Widget visibility is now handled by timeTrackingStore (after 1.5s delay)

  // Get current context (todos, notes, links, browserTabs) based on scene/shot/special context selection
  const getCurrentContext = () => {
    // Check if special context (Asset/Compose) is active
    if (project.currentSpecialContextId) {
      const specialContext = project.specialContexts?.find((c: any) => c.id === project.currentSpecialContextId);
      if (specialContext) {
        return {
          todos: specialContext.todos || [],
          notes: specialContext.notes || [],
          links: specialContext.links || [],
          browserTabs: specialContext.browserTabs || [],
          isShot: false,
          isScene: false,
          isSpecialContext: true,
          specialContextType: specialContext.type,
          specialContextSceneId: specialContext.sceneId,
          shotId: undefined,
          sceneId: specialContext.sceneId || undefined,
          specialContextId: specialContext.id
        };
      }
    }

    // If shot is selected, return shot context (shot has its own sceneId)
    if (project.hasShots && project.currentShotId) {
      const currentShot = project.shots?.find((s: any) => s.id === project.currentShotId);
      if (currentShot) {
        return {
          todos: currentShot.todos || [],
          notes: currentShot.notes || [],
          links: currentShot.links || [],
          browserTabs: currentShot.browserTabs || [],
          isShot: true,
          isScene: false,
          isSpecialContext: false,
          shotId: currentShot.id,
          sceneId: currentShot.sceneId, // Use sceneId from shot, not from project.currentSceneId
          specialContextId: undefined
        };
      }
    }

    // If only scene is selected (no shot)
    if (project.hasShots && project.currentSceneId) {
      const currentScene = project.scenes?.find((s: any) => s.id === project.currentSceneId);

      if (currentScene) {
        // Return scene context
        return {
          todos: currentScene.todos || [],
          notes: currentScene.notes || [],
          links: currentScene.links || [],
          browserTabs: currentScene.browserTabs || [],
          isShot: false,
          isScene: true,
          isSpecialContext: false,
          shotId: undefined,
          sceneId: currentScene.id,
          specialContextId: undefined
        };
      }
    }

    // Return project context (no scenes/shots)
    return {
      todos: project.todos || [],
      notes: project.notes || [],
      links: project.links || [],
      browserTabs: project.browserTabs || [],
      isShot: false,
      isScene: false,
      isSpecialContext: false,
      shotId: undefined,
      sceneId: undefined,
      specialContextId: undefined
    };
  };

  const context = getCurrentContext();

  const handlePaste = async (e: React.ClipboardEvent) => {
    // Ignore paste in input/textarea fields
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }

    const items = e.clipboardData?.items;
    const files = e.clipboardData?.files;

    // Check for image in clipboard items
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) {
            await processImageBlob(blob);
            return;
          }
        }
      }
    }

    // Check for image files
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.indexOf('image') !== -1) {
          e.preventDefault();
          await processImageBlob(file);
          return;
        }
      }
    }

    // Try to get text (might be a file path)
    const text = e.clipboardData?.getData('text');
    if (text && text.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/i)) {
      e.preventDefault();
      try {
        const thumbnailName = await invoke<string>('set_project_thumbnail', {
          projectPath: project.path,
          imagePath: text
        });
        const { updateProject } = useProjectStore.getState();
        updateProject({ ...project, thumbnail: thumbnailName });
      } catch (error) {
        console.error('Failed to set thumbnail from path:', error);
      }
    }
  };

  const processImageBlob = async (blob: Blob) => {
    try {
      // Convert blob to array buffer
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Save to temp file using Tauri
      const { writeBinaryFile, createDir, BaseDirectory } = await import('@tauri-apps/api/fs');
      const { join, appDataDir } = await import('@tauri-apps/api/path');
      const tempFileName = `temp_thumbnail_${Date.now()}.png`;

      // Ensure AppData directory exists
      try {
        await createDir('', { dir: BaseDirectory.AppData, recursive: true });
      } catch (e) {
        // Directory might already exist, ignore error
      }

      // Write binary file to AppData directory
      await writeBinaryFile(tempFileName, uint8Array, { dir: BaseDirectory.AppData });

      // Get full path using join
      const appDir = await appDataDir();
      const tempPath = await join(appDir, tempFileName);

      // Set thumbnail
      const thumbnailName = await invoke<string>('set_project_thumbnail', {
        projectPath: project.path,
        imagePath: tempPath
      });

      const { updateProject } = useProjectStore.getState();
      updateProject({ ...project, thumbnail: thumbnailName });
    } catch (error) {
      console.error('Failed to process image:', error);
    }
  };

  // Map display names to internal keys (same as in software launch section)
  const nameToKey: Record<string, string> = {
    'Blender': 'blender',
    'Houdini': 'houdini',
    'Maya': 'maya',
    'After Effects': 'after-effects',
    'Cinema 4D': 'cinema4d',
    'Substance': 'substance',
    'Unreal': 'unreal',
    'Unity': 'unity',
    'ZBrush': 'zbrush',
    'Photoshop': 'photoshop',
    'Marmoset': 'marmoset'
  };

  const handleToggleSoftware = async (softwareName: string) => {
    const softwareKey = nameToKey[softwareName] || softwareName.toLowerCase().replace(/\s+/g, '-');
    const { projects, updateProject } = useProjectStore.getState();
    const currentProject = projects.find(p => p.id === project.id) || project;
    const isCurrentlySelected = currentProject.software.some((sw: any) => {
      const existingKey = nameToKey[sw.name] || sw.name.toLowerCase().replace(/\s+/g, '-');
      return existingKey === softwareKey;
    });

    if (isCurrentlySelected) {
      // Show confirmation modal before removing
      setSoftwareToRemove(softwareName);
    } else {
      // Add software directly without confirmation
      try {
        // Create folders for the software
        await invoke('add_software_to_project', {
          projectPath: project.path,
          softwareName: softwareKey
        });

        // Update project metadata
        const newSoftware = {
          name: softwareName,
          executablePath: '', // Will be set from settings
          version: undefined,
          icon: undefined
        };

        await updateProject({
          ...currentProject,
          software: [...currentProject.software, newSoftware]
        });

        // Trigger tree refresh
        window.dispatchEvent(new CustomEvent('tree-refresh'));
      } catch (error) {
        console.error('Failed to add software:', error);
      }
    }
  };

  const handleRemoveSoftware = async () => {
    if (!softwareToRemove) return;

    const softwareKey = nameToKey[softwareToRemove] || softwareToRemove.toLowerCase().replace(/\s+/g, '-');
    const { updateProject } = useProjectStore.getState();

    try {
      // Delete software folder
      await invoke('remove_software_from_project', {
        projectPath: project.path,
        softwareName: softwareKey
      });

      // Remove software from project metadata
      const updatedSoftware = project.software.filter((sw: any) => {
        const existingKey = nameToKey[sw.name] || sw.name.toLowerCase().replace(/\s+/g, '-');
        return existingKey !== softwareKey;
      });

      await updateProject({
        ...project,
        software: updatedSoftware
      });

      // Trigger tree refresh
      window.dispatchEvent(new CustomEvent('tree-refresh'));
    } catch (error) {
      console.error('Failed to remove software:', error);
    }

    setSoftwareToRemove(null);
  };

  return (
    <div
      className="flex-1 flex flex-col h-screen overflow-hidden min-w-0 animate-mode-switch focus:outline-none bg-app-bg relative"
      onPaste={handlePaste}
      tabIndex={-1}
    >
      {/* Header */}
      <div className="px-7 pt-5 flex-shrink-0 relative z-10">
        {/* Gradient fade at the bottom */}
        <div className="absolute -bottom-8 left-0 right-0 h-8 pointer-events-none z-10 transition-opacity duration-300" style={{
          background: 'linear-gradient(to bottom, #0a0a0a 0%, rgba(10, 10, 10, 0.9) 20%, rgba(10, 10, 10, 0.7) 40%, rgba(10, 10, 10, 0.4) 60%, rgba(10, 10, 10, 0.15) 80%, transparent 100%)',
          opacity: showTopShadow ? 1 : 0
        }}></div>
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <h1 className="text-project-title font-bold">{project.name}</h1>
                {/* Context Breadcrumb */}
                {(() => {
                  const parts: string[] = [];

                  // Check for special context (Asset/Compose)
                  if (project.currentSpecialContextId) {
                    const specialContext = project.specialContexts?.find((c: any) => c.id === project.currentSpecialContextId);
                    if (specialContext) {
                      if (specialContext.sceneId) {
                        const scene = project.scenes?.find((s: any) => s.id === specialContext.sceneId);
                        if (scene) parts.push(scene.name);
                      }
                      parts.push(specialContext.type === 'asset' ? 'Asset Projects' : 'Compose Projects');
                    }
                  } else {
                    // Regular scene/shot context
                    if (project.currentSceneId) {
                      const scene = project.scenes?.find((s: any) => s.id === project.currentSceneId);
                      if (scene) parts.push(scene.name);
                    }
                    if (project.currentShotId) {
                      const shot = project.shots?.find((s: any) => s.id === project.currentShotId);
                      if (shot) parts.push(shot.name);
                    }
                  }

                  if (parts.length > 0) {
                    return (
                      <span className="text-sm font-normal text-text-muted flex items-center gap-1.5">
                        <span>/</span>
                        {parts.join(' / ')}
                      </span>
                    );
                  }
                  return null;
                })()}
              </div>
              <span className={`px-2.5 py-1 rounded-badge text-xs font-medium ${
              project.status === 'active' ? 'bg-status-active/15 text-status-active border border-status-active/30' :
              project.status === 'completed' ? 'bg-status-completed/15 text-status-completed border border-status-completed/30' :
              project.status === 'paused' ? 'bg-status-paused/15 text-status-paused border border-status-paused/30' :
              'bg-status-archived/15 text-status-archived border border-status-archived/30'
            }`}>
              {STATUS_LABELS[project.status as keyof typeof STATUS_LABELS]}
            </span>
            {/* Tags Container with Hover Effect */}
            <div className="flex items-center gap-2 group/tags">
              {/* Existing Tags */}
              {project.tags.map((tag: string) => (
                <button
                  key={tag}
                  onClick={() => {
                    const { removeTag } = useProjectStore.getState();
                    removeTag(project.id, tag);
                  }}
                  className="px-2.5 py-1 bg-hover-bg rounded-full text-xs text-text-muted border border-transparent hover:border-red-700/60 hover:bg-red-900/20 hover:line-through transition-all cursor-pointer"
                  title="Click to remove tag"
                >
                  {tag}
                </button>
              ))}
              {/* Add Tag Input or Button */}
              {isAddingTag ? (
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTag.trim()) {
                      const { addTag } = useProjectStore.getState();
                      addTag(project.id, newTag.trim());
                      setNewTag('');
                      setIsAddingTag(false);
                    } else if (e.key === 'Escape') {
                      setNewTag('');
                      setIsAddingTag(false);
                    }
                  }}
                  onBlur={() => {
                    if (newTag.trim()) {
                      const { addTag } = useProjectStore.getState();
                      addTag(project.id, newTag.trim());
                    }
                    setNewTag('');
                    setIsAddingTag(false);
                  }}
                  autoFocus
                  placeholder="Type tag name..."
                  className="px-2.5 py-1 bg-hover-bg border border-accent rounded-full text-xs text-text-muted focus:outline-none focus:text-text-primary w-32 placeholder:text-text-muted/50"
                />
              ) : (
                project.tags.length > 0 ? (
                  <button
                    onClick={() => setIsAddingTag(true)}
                    className="px-2.5 py-1 bg-transparent border border-border-secondary border-dashed rounded-full text-xs text-text-muted hover:border-accent hover:text-accent transition-all cursor-pointer opacity-0 group-hover/tags:opacity-100"
                    title="Add tag to project"
                  >
                    + Add tag...
                  </button>
                ) : (
                  <button
                    onClick={() => setIsAddingTag(true)}
                    className="px-2.5 py-1 bg-transparent border border-border-secondary border-dashed rounded-full text-xs text-text-muted hover:border-accent hover:text-accent transition-all cursor-pointer"
                    title="Add tag to project"
                  >
                    + Add tag...
                  </button>
                )
              )}
            </div>
            </div>
            <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const { toggleFavorite } = useProjectStore.getState();
                toggleFavorite(project.id);
                setIsFavoriteAnimating(true);
                setTimeout(() => setIsFavoriteAnimating(false), 500);
              }}
              className="w-9 h-9 bg-card-bg border border-border-primary rounded-button flex items-center justify-center hover:bg-hover-bg hover:border-border-secondary transition-all"
              title={project.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              {project.isFavorite ? (
                <IconStarFilled stroke={1.5} className={`w-[18px] h-[18px] text-yellow-400 transition-all ${isFavoriteAnimating ? 'animate-favorite-star-bounce' : ''}`} />
              ) : (
                <IconStar stroke={1.5} className={`w-[18px] h-[18px] text-text-secondary transition-all ${isFavoriteAnimating ? 'animate-favorite-star-bounce' : ''}`} />
              )}
            </button>
            <button
              onClick={() => setShowProjectSettings(true)}
              className="w-9 h-9 bg-card-bg border border-border-primary rounded-button flex items-center justify-center hover:bg-hover-bg hover:border-border-secondary transition-all"
              title="Project Settings"
            >
              <IconSettings stroke={1.5} className="w-[18px] h-[18px] text-text-secondary animate-settings-icon" />
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 bg-card-bg border border-border-primary rounded-button flex items-center justify-center hover:bg-hover-bg hover:border-border-secondary transition-all group"
              title="Close"
            >
              <IconX stroke={1.5} className="w-[18px] h-[18px] text-text-secondary group-hover:text-red-500 transition-colors" />
            </button>
            </div>
          </div>

          {/* Project Description */}
          {(project.description || isEditingDescription) && (
            <div className="group/desc inline-flex items-center gap-1.5">
              {isEditingDescription ? (
                <>
                  <input
                    type="text"
                    value={descriptionValue}
                    onChange={(e) => setDescriptionValue(e.target.value)}
                    onBlur={() => {
                      const { updateProject } = useProjectStore.getState();
                      updateProject({ ...project, description: descriptionValue });
                      setIsEditingDescription(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setDescriptionValue(project.description || '');
                        setIsEditingDescription(false);
                      }
                      if (e.key === 'Enter') {
                        const { updateProject } = useProjectStore.getState();
                        updateProject({ ...project, description: descriptionValue });
                        setIsEditingDescription(false);
                      }
                    }}
                    autoFocus
                    className="bg-transparent text-sm text-text-primary focus:outline-none"
                    placeholder="Add a description..."
                    style={{ width: `${Math.max(descriptionValue.length || 20, 20)}ch` }}
                  />
                  <IconPencil size={16} stroke={1.5} className="text-accent" />
                </>
              ) : (
                <>
                  <span
                    className="text-sm text-text-muted cursor-text"
                    onClick={() => setIsEditingDescription(true)}
                  >
                    {project.description}
                  </span>
                  <button
                    onClick={() => setIsEditingDescription(true)}
                    className="opacity-0 group-hover/desc:opacity-100 transition-opacity p-0.5 hover:bg-hover-bg rounded"
                    title="Edit description"
                  >
                    <IconPencil size={16} stroke={1.5} className="text-text-muted" />
                  </button>
                </>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Content */}
      <SimpleBar className="flex-1 custom-page-scrollbar" autoHide={false} scrollableNodeProps={{ ref: contentScrollRef }}>
        <div className="px-7 pb-16 pt-4">
        {/* Quick Actions - hidden when only scene is selected (without shot) */}
        {!(context.isScene && !context.isShot) && (
        <div className="mb-7">
          <h3 className="text-sm font-semibold text-text-primary mb-3.5">Quick Actions</h3>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={onOpenFolder}
              className="group p-3 bg-card-bg border border-border-primary hover:bg-hover-bg hover:border-accent/30 rounded-med flex items-center gap-2.5 transition-all hover:-translate-y-0.5 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-button flex items-center justify-center bg-gradient-to-br from-blue-500/20 via-blue-600/10 to-blue-700/10">
                <IconFolderOpen stroke={1.5} className="w-5 h-5 text-blue-400 pointer-events-none" />
              </div>
              <span className="text-sm font-medium text-text-primary pointer-events-none">Open Folder</span>
            </button>
            <button
              onClick={() => setShowPaymentModal(true)}
              className="group p-3 bg-card-bg border border-border-primary hover:bg-hover-bg hover:border-accent/30 rounded-med flex items-center gap-2.5 transition-all hover:-translate-y-0.5 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-button flex items-center justify-center bg-gradient-to-br from-green-500/20 via-green-600/10 to-green-700/10">
                <IconCreditCard stroke={1.5} className="w-5 h-5 text-green-400 pointer-events-none" />
              </div>
              <span className="text-sm font-medium text-text-primary pointer-events-none">Payment</span>
            </button>
            {timeTrackingEnabled && (
              <button
                onClick={() => setShowManualTimeEntry(true)}
                className="group p-3 bg-card-bg border border-border-primary hover:bg-hover-bg hover:border-accent/30 rounded-med flex items-center gap-2.5 transition-all hover:-translate-y-0.5 cursor-pointer"
              >
                <div className="w-9 h-9 rounded-button flex items-center justify-center bg-gradient-to-br from-yellow-500/20 via-yellow-600/10 to-yellow-700/10">
                  <IconClock stroke={1.5} className="w-5 h-5 text-yellow-400 pointer-events-none" />
                </div>
                <span className="text-sm font-medium text-text-primary pointer-events-none">Add Time</span>
              </button>
            )}
          </div>
        </div>
        )}

        {/* Software Launchers - hidden when only scene is selected in scenes+shots mode */}
        {!(context.isScene && !context.isShot && project.hasScenes && project.hasShots) && (
          <div className="mb-7">
            <h3 className="text-sm font-semibold text-text-primary mb-3.5">Launch Software</h3>
            <div className="grid grid-cols-2 gap-2">
            {project.software.map((sw: any) => {
              // Get executable path from localStorage
              const savedPaths = localStorage.getItem('softwarePaths');
              const pathsMap: Record<string, string> = savedPaths ? JSON.parse(savedPaths) : {};

              // Map display names to internal keys
              const nameToKey: Record<string, string> = {
                'Blender': 'blender',
                'Houdini': 'houdini',
                'Maya': 'maya',
                'After Effects': 'after-effects',
                'Cinema 4D': 'cinema4d',
                'Substance': 'substance',
                'Unreal': 'unreal',
                'Unity': 'unity',
                'ZBrush': 'zbrush',
                'Marmoset': 'marmoset'
              };

              const softwareKey = nameToKey[sw.name] || sw.name.toLowerCase().replace(/\s+/g, '-');
              const executablePath = pathsMap[softwareKey] || sw.executablePath;

              // Get launch status for this software
              const statusKey = `${project.path}-${sw.name}`;
              const status = launchingStatus?.[statusKey] || 'idle';

              // Find active session for this software (compare with softwareKey, not display name)
              // Use live timeTrackingStore state to avoid showing frozen timers during async projectStore updates
              const activeEntry = latestProject.timeEntries?.find((e: any) => {
                const liveSession = timeTrackingSessions.get(e.id);
                return e.software === softwareKey &&
                       liveSession?.isActive === true &&
                       liveSession?.widgetVisible === true;
              });

              // Get software color for gradient
              const softwareColors: Record<string, string> = {
                'blender': '#E87D0D',
                'houdini': '#FF4713',
                'after-effects': '#9999FF',
                'photoshop': '#31A8FF',
                'maya': '#0FADED',
                'cinema4d': '#0099D8',
                'substance': '#F37A3A',
                'unreal': '#313131',
                'unity': '#000000',
                'zbrush': '#F37021',
                'marmoset': '#FF6B00'
              };
              const softwareColor = softwareColors[softwareKey] || '#6366f1';

              return (
                <button
                  key={sw.name}
                  onClick={() => {
                    if (status === 'launching' || activeEntry) return;

                    // Read the latest project from store to avoid stale closure
                    const latestProject = useProjectStore.getState().projects.find(p => p.id === project.id);
                    if (!latestProject) return;

                    const currentScene = latestProject.hasShots && latestProject.currentSceneId
                      ? latestProject.scenes?.find((s: any) => s.id === latestProject.currentSceneId)
                      : null;

                    const currentShot = latestProject.hasShots && latestProject.currentShotId
                      ? latestProject.shots?.find((s: any) => s.id === latestProject.currentShotId)
                      : null;

                    onLaunchSoftware({
                      ...sw,
                      executablePath,
                      sceneNumber: currentScene?.number,
                      shotNumber: currentShot?.number
                    });
                  }}
                  disabled={status === 'launching' || !executablePath}
                  data-launch-software
                  className="p-4 border border-zinc-800 rounded-xl flex items-center gap-3 transition-all duration-200 group select-none disabled:opacity-60 disabled:cursor-not-allowed relative overflow-hidden"
                  onMouseDown={(e) => {
                    // Применяем эффект прожатия только для ЛКМ (левая кнопка мыши)
                    if (e.button === 0) {
                      e.currentTarget.style.transform = 'scale(0.98)';
                      e.currentTarget.style.filter = 'brightness(0.95)';
                    }
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.transform = '';
                    e.currentTarget.style.filter = '';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = '';
                    e.currentTarget.style.filter = '';
                    e.currentTarget.style.background = `
                      radial-gradient(circle at 00% 120%, ${softwareColor}15 0%, transparent 80%),
                      rgb(24, 24, 27)
                    `;
                  }}
                  style={{
                    background: `
                      radial-gradient(circle at 00% 120%, ${softwareColor}15 0%, transparent 80%),
                      rgb(24, 24, 27)
                    `
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = `
                      radial-gradient(circle at 00% 120%, ${softwareColor}40 0%, transparent 100%),
                      rgb(28, 28, 31)
                    `;
                  }}
                >
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center">
                    <SoftwareIcon name={sw.name} />
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-medium">{sw.name}</div>
                    <div className="text-xs text-zinc-500">
                      {status === 'launching' ? 'Launching...' : status === 'success' ? 'Launched!' : activeEntry ? 'Running...' : executablePath ? 'Click to launch' : 'Path not set'}
                    </div>
                  </div>

                  {/* Inline Timer */}
                  {timeTrackingEnabled && activeEntry && <InlineTimer activeEntry={activeEntry} />}

                  {/* Status indicator */}
                  {!activeEntry && status === 'launching' && (
                    <IconRefresh stroke={1.5} className="w-5 h-5 text-accent animate-spin" />
                  )}
                  {!activeEntry && status === 'success' && (
                    <IconCheck stroke={1.5} className="w-5 h-5 text-green-500 animate-in fade-in zoom-in duration-300" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
        )}

        {/* Versions Overview - hidden when only scene is selected (without shot) */}
        {!(context.isScene && !context.isShot) && (
        <VersionsOverview
          project={project}
          currentScene={context.sceneId ? project.scenes?.find((s: any) => s.id === context.sceneId) : null}
          currentShot={context.isShot && context.shotId ? project.shots?.find((s: any) => s.id === context.shotId) : null}
          specialContextType={context.isSpecialContext ? context.specialContextType : null}
          showNotification={showNotification}
        />
        )}

        {/* Output Overview - hidden when only scene is selected (without shot) */}
        {!(context.isScene && !context.isShot) && (
        <OutputOverview
          project={project}
          currentScene={context.sceneId ? project.scenes?.find((s: any) => s.id === context.sceneId) : null}
          currentShot={context.isShot && context.shotId ? project.shots?.find((s: any) => s.id === context.shotId) : null}
          specialContextType={context.isSpecialContext ? context.specialContextType : null}
        />
        )}

        {/* Links Section */}
        <div className="mb-7">
          <h3 className="text-sm font-semibold text-text-primary mb-3.5">Links</h3>
          <div className="space-y-2">
            {context.links.map((link: any) => (
              <LinkItem key={link.id} link={link} projectId={project.id} shotId={context.shotId} sceneId={context.sceneId || null} specialContextId={context.specialContextId || null} />
            ))}
            <LinkInputForm projectId={project.id} shotId={context.shotId} sceneId={context.sceneId || null} specialContextId={context.specialContextId || null} />
          </div>
        </div>

        {/* Todo Section */}
        <div className="mb-7">
          <h3 className="text-sm font-semibold text-text-primary mb-3.5">Tasks</h3>
          <div className="space-y-2">
            {(() => {
              // Group todos by date
              const todosByDate: { [key: string]: any[] } = {};
              context.todos.forEach((todo: any) => {
                const dateKey = todo.createdAt
                  ? new Date(todo.createdAt).toLocaleDateString('en-US', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })
                  : 'No Date';
                if (!todosByDate[dateKey]) {
                  todosByDate[dateKey] = [];
                }
                todosByDate[dateKey].push(todo);
              });

              return Object.entries(todosByDate).map(([date, todos]) => (
                <div key={date} className="space-y-2">
                  {/* Date separator */}
                  <div className="flex items-center gap-2 mt-4 mb-2">
                    <div className="h-px bg-border-secondary flex-1" />
                    <span className="text-xs text-text-dim font-medium">{date}</span>
                    <div className="h-px bg-border-secondary flex-1" />
                  </div>
                  {/* Tasks for this date */}
                  {todos.map((todo: any) => (
                    <div key={todo.id} className="flex items-center group">
                      <button
                        onClick={() => {
                          if (context.isShot && context.shotId) {
                            const { toggleShotTodo } = useProjectStore.getState();
                            toggleShotTodo(project.id, context.shotId, todo.id);
                          } else if (context.isSpecialContext && context.specialContextId) {
                            const { toggleSpecialContextTodo } = useProjectStore.getState();
                            toggleSpecialContextTodo(project.id, context.specialContextId, todo.id);
                          } else if (context.isScene && context.sceneId) {
                            const { toggleSceneTodo } = useProjectStore.getState();
                            toggleSceneTodo(project.id, context.sceneId, todo.id);
                          } else {
                            const { toggleTodo } = useProjectStore.getState();
                            toggleTodo(project.id, todo.id);
                          }
                        }}
                        className={`flex items-center justify-center transition-all duration-200 ${
                          todo.completed
                            ? 'w-5 opacity-100'
                            : 'w-0 opacity-0 group-hover:w-5 group-hover:opacity-100'
                        } overflow-hidden`}
                      >
                        <IconCheck stroke={1.5} className={`w-3 h-3 flex-shrink-0 ${
                          todo.completed ? 'text-zinc-400' : 'text-zinc-600'
                        }`} />
                      </button>
                      <span
                        className={`flex-1 text-sm transition-all duration-200 ${
                          todo.completed
                            ? 'text-text-muted ml-1'
                            : 'text-text-primary ml-0 group-hover:ml-1'
                        }`}
                      >
                        {todo.text}
                      </span>
                      <button
                        onClick={() => {
                          if (context.isShot && context.shotId) {
                            const { removeShotTodo } = useProjectStore.getState();
                            removeShotTodo(project.id, context.shotId, todo.id);
                          } else if (context.isSpecialContext && context.specialContextId) {
                            const { removeSpecialContextTodo } = useProjectStore.getState();
                            removeSpecialContextTodo(project.id, context.specialContextId, todo.id);
                          } else if (context.isScene && context.sceneId) {
                            const { removeSceneTodo } = useProjectStore.getState();
                            removeSceneTodo(project.id, context.sceneId, todo.id);
                          } else {
                            const { removeTodo } = useProjectStore.getState();
                            removeTodo(project.id, todo.id);
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-hover-bg rounded-lg transition-opacity"
                      >
                        <IconX stroke={1.5} className="w-3.5 h-3.5 text-text-muted" />
                      </button>
                    </div>
                  ))}
                </div>
              ));
            })()}
            <input
              type="text"
              placeholder="+ Add task..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                  if (context.isShot && context.shotId) {
                    const { addShotTodo } = useProjectStore.getState();
                    addShotTodo(project.id, context.shotId, e.currentTarget.value.trim());
                  } else if (context.isSpecialContext && context.specialContextId) {
                    const { addSpecialContextTodo } = useProjectStore.getState();
                    addSpecialContextTodo(project.id, context.specialContextId, e.currentTarget.value.trim());
                  } else if (context.isScene && context.sceneId) {
                    const { addSceneTodo } = useProjectStore.getState();
                    addSceneTodo(project.id, context.sceneId, e.currentTarget.value.trim());
                  } else {
                    const { addTodo } = useProjectStore.getState();
                    addTodo(project.id, e.currentTarget.value.trim());
                  }
                  e.currentTarget.value = '';
                }
              }}
              onBlur={(e) => {
                if (e.currentTarget.value.trim()) {
                  if (context.isShot && context.shotId) {
                    const { addShotTodo } = useProjectStore.getState();
                    addShotTodo(project.id, context.shotId, e.currentTarget.value.trim());
                  } else if (context.isSpecialContext && context.specialContextId) {
                    const { addSpecialContextTodo } = useProjectStore.getState();
                    addSpecialContextTodo(project.id, context.specialContextId, e.currentTarget.value.trim());
                  } else if (context.isScene && context.sceneId) {
                    const { addSceneTodo } = useProjectStore.getState();
                    addSceneTodo(project.id, context.sceneId, e.currentTarget.value.trim());
                  } else {
                    const { addTodo } = useProjectStore.getState();
                    addTodo(project.id, e.currentTarget.value.trim());
                  }
                  e.currentTarget.value = '';
                }
              }}
              className="w-full px-3 py-2 bg-transparent border border-border-secondary border-dashed rounded-card text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:border-solid"
            />
          </div>
        </div>

        {/* Shots Overview Table - shown only in scenes+shots mode when scene is selected */}
        {context.isScene && !context.isShot && project.hasShots && project.hasScenes && (
          <ShotsOverviewTable
            projectId={project.id}
            projectPath={project.path}
            currentScene={project.scenes?.find((s: any) => s.id === context.sceneId)}
            shots={project.shots?.filter((s: any) => s.sceneId === context.sceneId) || []}
          />
        )}

        {/* Notes Section */}
        <NotesSection project={project} context={context} />
        </div>
      </SimpleBar>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div
          className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 transition-opacity duration-200 rounded-lg ${blurClass} ${
            isPaymentModalAnimating ? 'opacity-100' : 'opacity-0'
          }`}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              (e.currentTarget as HTMLDivElement).dataset.mousedownTarget = 'backdrop';
            }
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && (e.currentTarget as HTMLDivElement).dataset.mousedownTarget === 'backdrop') {
              setShowPaymentModal(false);
            }
            delete (e.currentTarget as HTMLDivElement).dataset.mousedownTarget;
          }}
        >
          <div
            className={`bg-zinc-900 rounded-xl border border-zinc-800 shadow-2xl w-full max-w-md mx-4 max-h-[85vh] overflow-hidden flex flex-col transition-all duration-200 ${
              isPaymentModalAnimating ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
            }`}
            onClick={(e) => e.stopPropagation()}
            data-modal-window
          >
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Payment Settings</h2>
              <button onClick={() => setShowPaymentModal(false)} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
                <IconX stroke={1.5} className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            <SimpleBar className="flex-1 custom-scrollbar" autoHide={false} style={{ maxHeight: '100%' }}>
              <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5 font-medium">Cost *</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={project.cost || ''}
                    onChange={(e) => {
                      const { updateProject } = useProjectStore.getState();
                      updateProject({ ...project, cost: e.target.value ? parseFloat(e.target.value) : undefined });
                    }}
                    placeholder="0"
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent transition-colors"
                  />
                  <select
                    value={project.currency || 'USD'}
                    onChange={(e) => {
                      const { updateProject } = useProjectStore.getState();
                      updateProject({ ...project, currency: e.target.value as 'USD' | 'RUB' | 'EUR' });
                    }}
                    className="w-24 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent transition-colors"
                  >
                    <option value="USD">USD</option>
                    <option value="RUB">RUB</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1.5 font-medium">Payment Status</label>
                <select
                  value={project.paymentStatus || 'unpaid'}
                  onChange={(e) => {
                    const { updateProject } = useProjectStore.getState();
                    const newStatus = e.target.value as 'paid' | 'prepaid' | 'unpaid';

                    // Set completedAt when changing TO paid or prepaid (if not already set)
                    // Clear completedAt when changing TO unpaid
                    let completedAt = project.completedAt;
                    if (newStatus === 'paid' || newStatus === 'prepaid') {
                      if (project.paymentStatus !== newStatus) {
                        completedAt = completedAt || new Date().toISOString();
                      }
                    } else if (newStatus === 'unpaid') {
                      completedAt = undefined;
                    }

                    updateProject({ ...project, paymentStatus: newStatus, completedAt });
                  }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent transition-colors"
                >
                  <option value="unpaid">Unpaid</option>
                  <option value="prepaid">Prepaid</option>
                  <option value="paid">Paid</option>
                </select>
              </div>

              {project.paymentStatus === 'prepaid' && (
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5 font-medium">Prepayment Amount</label>
                  <input
                    type="number"
                    value={project.prepaymentAmount || ''}
                    onChange={(e) => {
                      const { updateProject } = useProjectStore.getState();
                      updateProject({ ...project, prepaymentAmount: e.target.value ? parseFloat(e.target.value) : undefined });
                    }}
                    placeholder="0"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent transition-colors"
                  />
                </div>
              )}
              </div>
            </SimpleBar>

            <div className="flex justify-end gap-2 p-4 border-t border-zinc-800">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg transition-colors font-medium shadow-sm"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project Settings Modal */}
      {showProjectSettings && (
        <div
          className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 rounded-lg ${blurClass}`}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              (e.currentTarget as HTMLDivElement).dataset.mousedownTarget = 'backdrop';
            }
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && (e.currentTarget as HTMLDivElement).dataset.mousedownTarget === 'backdrop') {
              setShowProjectSettings(false);
            }
            delete (e.currentTarget as HTMLDivElement).dataset.mousedownTarget;
          }}
        >
          <div className="bg-zinc-900 rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col animate-modal" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
              <h2 className="text-lg font-semibold">Project Settings</h2>
              <button onClick={() => setShowProjectSettings(false)} className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors">
                <IconX stroke={1.5} className="w-5 h-5 close-button-red" />
              </button>
            </div>

            <SimpleBar className="flex-1 custom-scrollbar" autoHide={false} style={{ maxHeight: '100%' }}>
              <div className="p-4 space-y-2.5">
              <div className="flex gap-3 items-center">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1.5">Project Name</label>
                  <input
                    type="text"
                    value={project.name}
                    onChange={(e) => {
                      const { updateProject } = useProjectStore.getState();
                      updateProject({ ...project, name: e.target.value });
                    }}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer h-[38px] px-3 mt-6">
                  <span className="text-sm whitespace-nowrap">Has scenes</span>
                  <input
                    type="checkbox"
                    checked={project.hasScenes || false}
                    onChange={(e) => {
                      const { updateProject } = useProjectStore.getState();
                      updateProject({ ...project, hasScenes: e.target.checked });
                    }}
                    className="w-4 h-4"
                  />
                </label>
                <label className="flex items-center gap-2 cursor-pointer h-[38px] px-3 mt-6">
                  <span className="text-sm whitespace-nowrap">Has shots</span>
                  <input
                    type="checkbox"
                    checked={project.hasShots || false}
                    onChange={(e) => {
                      const { updateProject } = useProjectStore.getState();
                      updateProject({ ...project, hasShots: e.target.checked });
                    }}
                    className="w-4 h-4"
                  />
                </label>
              </div>

              <div className="flex gap-3 items-start">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1.5">Description</label>
                  <textarea
                    value={project.description}
                    onChange={(e) => {
                      const { updateProject } = useProjectStore.getState();
                      updateProject({ ...project, description: e.target.value });
                    }}
                    rows={2}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none h-[60px]"
                  />
                </div>
                <div className="w-32">
                  <label className="block text-sm font-medium mb-1.5">Thumbnail <span className="text-xs text-zinc-500">(Ctrl+V)</span></label>
                  {project.thumbnail ? (
                    <div className="relative h-[60px] rounded-lg overflow-hidden border border-zinc-700 bg-zinc-800">
                      {thumbnailSrc && (
                        <img
                          src={thumbnailSrc}
                          alt="Project thumbnail"
                          className="w-full h-full object-cover"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const { updateProject } = useProjectStore.getState();
                          updateProject({ ...project, thumbnail: undefined });
                        }}
                        className="absolute top-1 right-1 w-6 h-6 bg-red-600 hover:bg-red-700 rounded transition-colors text-sm flex items-center justify-center"
                      >
                        <IconX stroke={1.5} className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        const { selectImageFile } = await import('../../utils/tauri');
                        const imagePath = await selectImageFile();
                        if (imagePath) {
                          try {
                            const thumbnailName = await invoke<string>('set_project_thumbnail', {
                              projectPath: project.path,
                              imagePath
                            });
                            const { updateProject } = useProjectStore.getState();
                            updateProject({ ...project, thumbnail: thumbnailName });
                          } catch (error) {
                            console.error('Failed to set thumbnail:', error);
                          }
                        }
                      }}
                      className="h-[60px] w-full bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors text-sm border border-zinc-700 flex items-center justify-center"
                    >
                      <IconPlus stroke={1.5} className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="border-t border-zinc-800 pt-2"></div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Status</label>
                  <select
                    value={project.status}
                    onChange={(e) => {
                      const { updateStatus } = useProjectStore.getState();
                      updateStatus(project.id, e.target.value as ProjectStatus);
                    }}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Client</label>
                  <select
                    value={project.clientId || ''}
                    onChange={(e) => {
                      const { updateProject } = useProjectStore.getState();
                      updateProject({ ...project, clientId: e.target.value || undefined });
                    }}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="">No client</option>
                    {(() => {
                      const { clients } = useProjectStore.getState();
                      return clients.map(client => (
                        <option key={client.id} value={client.id}>{client.name}</option>
                      ));
                    })()}
                  </select>
                </div>
              </div>

              <div className="border-t border-zinc-800 pt-2"></div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Deadline</label>
                  <div className="flex gap-2 items-center">
                    <div className="relative w-14">
                      <input
                        type="text"
                        placeholder="ДД"
                        value={project.deadline ? project.deadline.split('-')[2] : ''}
                        onKeyDown={(e) => {
                          if (e.key >= '0' && e.key <= '9') {
                            e.preventDefault();
                            const parts = project.deadline ? project.deadline.split('-') : ['', '', ''];
                            const currentDay = parts[2] || '';

                            let newDay;
                            if (currentDay.length >= 2) {
                              newDay = currentDay.slice(-1) + e.key;
                            } else {
                              newDay = currentDay + e.key;
                            }

                            const now = new Date();
                            const year = parts[0] || String(now.getFullYear());
                            const month = parts[1] || String(now.getMonth() + 1).padStart(2, '0');

                            const maxDays = new Date(parseInt(year), parseInt(month), 0).getDate();

                            let dayNum = parseInt(newDay);
                            if (dayNum > maxDays) {
                              dayNum = maxDays;
                              newDay = String(maxDays);
                            }
                            if (dayNum < 1) {
                              dayNum = 1;
                              newDay = '01';
                            }

                            const { updateDeadline } = useProjectStore.getState();
                            updateDeadline(project.id, `${year}-${month}-${newDay.padStart(2, '0')}`);
                            setDeadlineFieldsFilled(prev => ({ ...prev, day: true }));
                          } else if (e.key === 'Backspace') {
                            e.preventDefault();
                            const { updateDeadline } = useProjectStore.getState();
                            updateDeadline(project.id, undefined);
                            setDeadlineFieldsFilled({ day: false, month: false, year: false });
                          }
                        }}
                        onChange={() => {}}
                        className="w-14 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:border-accent"
                      />
                    </div>
                    <span className="text-zinc-500">.</span>
                    <div className="relative w-14">
                      {(() => {
                        const showAutofill = deadlineFieldsFilled.day && !deadlineFieldsFilled.month;
                        const now = new Date();
                        const currentMonth = String(now.getMonth() + 1).padStart(2, '0');

                        return showAutofill ? (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-white" style={{ opacity: 0.3 }}>
                            {currentMonth}
                          </div>
                        ) : null;
                      })()}
                      <input
                        type="text"
                        placeholder="ММ"
                        value={project.deadline ? project.deadline.split('-')[1] : ''}
                        onKeyDown={(e) => {
                          if (e.key >= '0' && e.key <= '9') {
                            e.preventDefault();
                            const parts = project.deadline ? project.deadline.split('-') : ['', '', ''];
                            const currentMonth = parts[1] || '';

                            let newMonth;
                            if (currentMonth.length >= 2) {
                              newMonth = currentMonth.slice(-1) + e.key;
                            } else {
                              newMonth = currentMonth + e.key;
                            }

                            let monthNum = parseInt(newMonth);
                            if (monthNum > 12) {
                              monthNum = 12;
                              newMonth = '12';
                            }
                            if (monthNum < 1) {
                              monthNum = 1;
                              newMonth = '01';
                            }

                            const now = new Date();
                            const year = parts[0] || String(now.getFullYear());
                            let day = parts[2] || '01';

                            const maxDays = new Date(parseInt(year), parseInt(newMonth.padStart(2, '0')), 0).getDate();
                            const dayNum = parseInt(day);
                            if (dayNum > maxDays) {
                              day = String(maxDays).padStart(2, '0');
                            }

                            const { updateDeadline } = useProjectStore.getState();
                            updateDeadline(project.id, `${year}-${newMonth.padStart(2, '0')}-${day}`);
                            setDeadlineFieldsFilled(prev => ({ ...prev, month: true }));
                          } else if (e.key === 'Backspace') {
                            e.preventDefault();
                            const parts = project.deadline ? project.deadline.split('-') : ['', '', ''];
                            if (parts[1]) {
                              const newMonth = parts[1].slice(0, -1);
                              if (newMonth && parts[0] && parts[2]) {
                                const { updateDeadline } = useProjectStore.getState();
                                updateDeadline(project.id, `${parts[0]}-${newMonth.padStart(2, '0')}-${parts[2]}`);
                              } else {
                                setDeadlineFieldsFilled(prev => ({ ...prev, month: false }));
                              }
                            }
                          }
                        }}
                        onChange={() => {}}
                        className="w-14 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:border-accent"
                      />
                    </div>
                    <span className="text-zinc-500">.</span>
                    <div className="relative w-14">
                      {(() => {
                        const showAutofill = deadlineFieldsFilled.day && !deadlineFieldsFilled.year;
                        const now = new Date();
                        const currentYear = String(now.getFullYear()).slice(-2);

                        return showAutofill ? (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-white" style={{ opacity: 0.3 }}>
                            {currentYear}
                          </div>
                        ) : null;
                      })()}
                      <input
                        type="text"
                        placeholder="ГГ"
                        value={project.deadline ? project.deadline.split('-')[0].slice(-2) : ''}
                        onKeyDown={(e) => {
                          if (e.key >= '0' && e.key <= '9') {
                            e.preventDefault();
                            const parts = project.deadline ? project.deadline.split('-') : ['', '', ''];
                            const currentYear = parts[0] ? parts[0].slice(-2) : '';

                            let newYear;
                            if (currentYear.length >= 2) {
                              newYear = currentYear.slice(-1) + e.key;
                            } else {
                              newYear = currentYear + e.key;
                            }

                            const now = new Date();
                            const currentYearFull = now.getFullYear();
                            const maxYearFull = currentYearFull + 1;
                            const maxYearShort = String(maxYearFull).slice(-2);

                            let fullYear = '20' + newYear.padStart(2, '0');
                            let fullYearNum = parseInt(fullYear);

                            if (fullYearNum > maxYearFull) {
                              fullYear = String(maxYearFull);
                              newYear = maxYearShort;
                            }

                            const month = parts[1] || String(now.getMonth() + 1).padStart(2, '0');
                            let day = parts[2] || '01';

                            const maxDays = new Date(parseInt(fullYear), parseInt(month), 0).getDate();
                            const dayNum = parseInt(day);
                            if (dayNum > maxDays) {
                              day = String(maxDays).padStart(2, '0');
                            }

                            const { updateDeadline } = useProjectStore.getState();
                            updateDeadline(project.id, `${fullYear}-${month}-${day}`);
                            setDeadlineFieldsFilled(prev => ({ ...prev, year: true }));
                          } else if (e.key === 'Backspace') {
                            e.preventDefault();
                            const parts = project.deadline ? project.deadline.split('-') : ['', '', ''];
                            if (parts[0]) {
                              const currentYear = parts[0].slice(-2);
                              const newYear = currentYear.slice(0, -1);
                              if (newYear && parts[1] && parts[2]) {
                                const fullYear = '20' + newYear.padStart(2, '0');
                                const { updateDeadline } = useProjectStore.getState();
                                updateDeadline(project.id, `${fullYear}-${parts[1]}-${parts[2]}`);
                              } else {
                                setDeadlineFieldsFilled(prev => ({ ...prev, year: false }));
                              }
                            }
                          }
                        }}
                        onChange={() => {}}
                        className="w-14 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:border-accent"
                      />
                    </div>
                    <div className="relative w-8 h-8 flex items-center justify-center calendar-icon-wrapper">
                      <input
                        type="date"
                        value={project.deadline || ''}
                        onChange={(e) => {
                          const { updateDeadline } = useProjectStore.getState();
                          updateDeadline(project.id, e.target.value || undefined);
                          if (e.target.value) {
                            setDeadlineFieldsFilled({ day: true, month: true, year: true });
                          }
                        }}
                        className="absolute opacity-0"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          zIndex: 10
                        }}
                      />
                      <svg
                        className="w-5 h-5 text-zinc-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        style={{ pointerEvents: 'none', position: 'relative', zIndex: 5 }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Cost</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={project.cost || ''}
                      onChange={(e) => {
                        const { updateProject } = useProjectStore.getState();
                        updateProject({ ...project, cost: e.target.value ? parseFloat(e.target.value) : undefined });
                      }}
                      placeholder="0"
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                    />
                    <select
                      value={project.currency || 'USD'}
                      onChange={(e) => {
                        const { updateProject } = useProjectStore.getState();
                        updateProject({ ...project, currency: e.target.value as 'USD' | 'RUB' | 'EUR' });
                      }}
                      className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                    >
                      <option value="USD">USD</option>
                      <option value="RUB">RUB</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Payment Status</label>
                  <select
                    value={project.paymentStatus || 'unpaid'}
                    onChange={(e) => {
                      const { updateProject } = useProjectStore.getState();
                      const newStatus = e.target.value as 'paid' | 'prepaid' | 'unpaid';

                      // Set completedAt when changing TO paid or prepaid (if not already set)
                      // Clear completedAt when changing TO unpaid
                      let completedAt = project.completedAt;
                      if (newStatus === 'paid' || newStatus === 'prepaid') {
                        if (project.paymentStatus !== newStatus) {
                          completedAt = completedAt || new Date().toISOString();
                        }
                      } else if (newStatus === 'unpaid') {
                        completedAt = undefined;
                      }

                      updateProject({ ...project, paymentStatus: newStatus, completedAt });
                    }}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="unpaid">Unpaid</option>
                    <option value="prepaid">Prepaid</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Prepayment Amount</label>
                  <input
                    type="number"
                    value={project.prepaymentAmount || ''}
                    onChange={(e) => {
                      const { updateProject } = useProjectStore.getState();
                      updateProject({ ...project, prepaymentAmount: e.target.value ? parseFloat(e.target.value) : undefined });
                    }}
                    placeholder="0"
                    disabled={project.paymentStatus !== 'prepaid'}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="border-t border-zinc-800 pt-2"></div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Project Path</label>
                <input
                  type="text"
                  value={project.path}
                  readOnly
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent opacity-60"
                />
              </div>

              {/* Tools Section */}
              <div className="border-t border-zinc-800 pt-4">
                <div className="font-medium mb-3">Tools</div>
                <div className="flex gap-2">
                  {SOFTWARE_OPTIONS.map((sw) => {
                    const softwareKey = nameToKey[sw] || sw.toLowerCase().replace(/\s+/g, '-');
                    const isSelected = latestProject.software.some((pSw: any) => {
                      const existingKey = nameToKey[pSw.name] || pSw.name.toLowerCase().replace(/\s+/g, '-');
                      return existingKey === softwareKey;
                    });

                    return (
                      <button
                        key={sw}
                        onClick={() => handleToggleSoftware(sw)}
                        className={`flex-1 px-3 py-1.5 rounded text-xs transition-all duration-200 ease-out whitespace-nowrap flex items-center justify-center relative ${
                          isSelected
                            ? 'bg-zinc-700 text-white'
                            : 'bg-zinc-800/50 text-zinc-400 hover:text-white hover:bg-zinc-800'
                        }`}
                      >
                        <div
                          className="flex items-center gap-1.5 transition-transform duration-200 ease-out"
                          style={{ transform: isSelected ? 'translateX(-8px)' : 'translateX(0)' }}
                        >
                          <SoftwareIcon name={sw} className="w-3.5 h-3.5" />
                          {sw}
                        </div>
                        <IconCheck
                          stroke={1.5}
                          className={`w-3.5 h-3.5 text-green-500 flex-shrink-0 absolute right-3 transition-all duration-200 ease-out ${
                            isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
              </div>
            </SimpleBar>

            {/* Footer */}
            <div className="border-t border-zinc-800 px-4 py-4 flex justify-between items-center gap-3 flex-shrink-0">
              {/* Delete button on the left */}
              <button
                onClick={() => {
                  // Show custom confirmation dialog on top of settings modal
                  onDeleteProject(project);
                }}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <IconTrash stroke={1.5} className="w-4 h-4" />
                Delete Project
              </button>

              {/* Close and Save buttons on the right */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowProjectSettings(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors text-sm"
                >
                  Close
                </button>
                <button
                  onClick={() => setShowProjectSettings(false)}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover rounded-lg transition-colors font-medium text-sm"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Shot Confirmation Dialog */}
      {shotToDelete && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setShotToDelete(null);
            }
          }}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">Delete Shot</h3>
            <p className="text-zinc-400 mb-6">
              Are you sure you want to delete "{shotToDelete.name}"? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShotToDelete(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const { removeShot } = useProjectStore.getState();
                  removeShot(project.id, shotToDelete.id);
                  setShotToDelete(null);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Software Confirmation Dialog */}
      {softwareToRemove && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              (e.currentTarget as HTMLDivElement).dataset.mousedownTarget = 'backdrop';
            }
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget &&
                (e.currentTarget as HTMLDivElement).dataset.mousedownTarget === 'backdrop') {
              setSoftwareToRemove(null);
            }
            delete (e.currentTarget as HTMLDivElement).dataset.mousedownTarget;
          }}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">Remove {softwareToRemove}?</h3>
            <div className="text-zinc-400 mb-6">
              <p className="mb-3">
                This will permanently remove <span className="font-medium text-zinc-300">{softwareToRemove}</span> from this project.
              </p>
              <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-lg p-3">
                <p className="text-sm text-yellow-200/90">
                  <strong>Warning:</strong> Removing software will delete its folder and all contents from the project directory. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setSoftwareToRemove(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveSoftware}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors font-medium"
              >
                Remove Software
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Time Entry Modal */}
      {timeTrackingEnabled && (
        <ManualTimeEntryModal
          isOpen={showManualTimeEntry}
          onClose={() => setShowManualTimeEntry(false)}
          project={project}
          onAddEntry={(software, durationMinutes, date, shotId, notes, countInStats) => {
            const { addManualTimeEntry } = useProjectStore.getState();
            addManualTimeEntry(project.id, software, durationMinutes, date, shotId, notes, countInStats);
          }}
          onRemoveEntry={(entryId) => {
            const { removeTimeEntry } = useProjectStore.getState();
            removeTimeEntry(project.id, entryId);
          }}
        />
      )}

      {/* Project Info Bar */}
      {timeTrackingEnabled && (
        <div className="absolute bottom-0 left-0 right-0 pointer-events-none z-50">
          <div className="pointer-events-auto relative z-10">
            <TimeInfoBar project={latestProject} />
          </div>
          {/* Gradient fade at the bottom edge of screen */}
          <div className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none z-0" style={{
            background: 'linear-gradient(to bottom, transparent 0%, rgba(10, 10, 10, 0.15) 20%, rgba(10, 10, 10, 0.4) 40%, rgba(10, 10, 10, 0.7) 60%, rgba(10, 10, 10, 0.9) 80%, #0a0a0a 100%)'
          }}></div>
        </div>
      )}
    </div>
  );
}
