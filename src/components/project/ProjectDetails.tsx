import { useState, useEffect, useRef, useCallback } from 'react';
import { IconStarFilled, IconStar, IconSettings, IconX, IconFolderOpen, IconCreditCard, IconClock, IconTrash, IconPlus, IconPencil, IconPlayerPlay, IconAppWindow, IconChevronRight, IconInfoCircle, IconAlertCircle } from '@tabler/icons-react';
import { invoke } from '@tauri-apps/api';
import { selectExecutable } from '../../utils/tauri';
import { useProjectStore } from '../../store/projectStore';
import { LinkItem, LinkInputForm, NotesSection } from '../shared';
import { VersionsOverview } from './VersionsOverview';
import { AssetsLibrary, type AssetStats } from './AssetsLibrary';
import { OutputOverview } from './OutputOverview';
import { ShotsOverviewTable } from './ShotsOverviewTable';
import { SoftwareIcon } from '../SoftwareIcon';
import { LaunchCardContent } from './LaunchStatus';
import { STATUS_LABELS, SOFTWARE_OPTIONS, COMPOSE_ONLY_SOFTWARE, isComposeOnlySoftware } from '../../utils';
import { InlineTimer, TimeInfoBar } from '../time';
import { ManualTimeEntryModal } from '../modals/ManualTimeEntryModal';
import { useTimeTrackingFeature } from '../../hooks/useTimeTrackingFeature';
import { useTimeTrackingStore } from '../../features/time-tracking/stores/timeTrackingStore';
import { useShallow } from 'zustand/react/shallow';
import { useThumbnail } from '../../hooks/useThumbnail';
import { useModalBlur } from '../../hooks/useModalBlur';
import { useProjectNameInput } from '../../hooks/useProjectNameInput';
import { useProjectWatcher } from '../../hooks/useProjectWatcher';
import { hasVersionedSoftware, formatSoftwareName, normalizeSoftwareName, getSoftwareColor } from '../../features/time-tracking/utils/softwareUtils';
import { PROJECT_NAME_HINT } from '../../utils/fileNaming';
import SimpleBar from 'simplebar-react';
import { ContextMenu, ContextMenuItem } from '../ui/ContextMenu';
import { CustomSelect } from '../ui/CustomSelect';
import { CollapsibleHint } from '../ui/CollapsibleHint';
import { useContextMenu } from '../../hooks/useContextMenu';
import { useDraftField, numberDraft, parseNumberDraft } from '../../hooks/useDraftField';
import { getPaymentStatusUpdate } from '../../utils/financeService';
import { useTasks } from '../../hooks/useTasks';
import { TaskItem } from '../tasks/TaskItem';
import type { TaskContext, Project } from '../../types/project';

type ProjectStatus = 'active' | 'archived' | 'completed' | 'paused';

function sanitizeDirName(name: string): string {
  return name.replace(/[^\wа-яёА-ЯЁ\s_-]/gu, '').replace(/\s+/g, '-').slice(0, 64) || 'unnamed';
}

type FullContext = TaskContext & { specialContextType?: 'asset' | 'compose' };

function getAttachmentSubdir(context: FullContext, project: any): string {
  if (context.isShot && context.shotId) {
    const shot = project.shots?.find((s: any) => s.id === context.shotId);
    const scene = project.scenes?.find((s: any) => s.id === shot?.sceneId);
    const shotCode = shot ? `SH${String(shot.number).padStart(3, '0')}` : null;
    const parts = [scene && sanitizeDirName(scene.name), shotCode].filter(Boolean);
    return parts.join('/') || 'Shot';
  }
  if (context.isScene && context.sceneId) {
    const scene = project.scenes?.find((s: any) => s.id === context.sceneId);
    return scene ? `${sanitizeDirName(scene.name)}/SCENE` : 'Scene/SCENE';
  }
  if (context.isSpecialContext) {
    const type = context.specialContextType === 'asset' ? 'Asset' : 'Compose';
    if (context.sceneId) {
      const scene = project.scenes?.find((s: any) => s.id === context.sceneId);
      return `${scene ? sanitizeDirName(scene.name) : 'Scene'}/${type}`;
    }
    return type;
  }
  return 'Main';
}

function fmtAssetDate(ts: number): string {
  const d = Math.floor((Date.now() - ts * 1000) / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

interface ProjectDetailsProps {
  project: any;
  launchingStatus: Record<string, 'idle' | 'launching' | 'success'>;
  onClose: () => void;
  onOpenFolder: () => void;
  onLaunchSoftware: (software: any) => void;
  onLaunchSoftwareWithoutProject?: (executablePath: string, software: string) => void;
  onDeleteProject: (project: any) => void;
  showNotification: (type: 'success' | 'error' | 'warning' | 'info', message: string, title?: string, duration?: number) => void;
}

export function ProjectDetails({ project, launchingStatus, onClose, onOpenFolder, onLaunchSoftware, onLaunchSoftwareWithoutProject, onDeleteProject, showNotification }: ProjectDetailsProps) {
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showManualTimeEntry, setShowManualTimeEntry] = useState(false);
  const [toolEditorOpen, setToolEditorOpen] = useState(false);
  const [toolEditorClosing, setToolEditorClosing] = useState(false);
  const [selectedToolKey, setSelectedToolKey] = useState('blender');
  const [toolSavedFlash, setToolSavedFlash] = useState(false);
  const [toolWorkingPath, setToolWorkingPath] = useState('');
  const [toolEditMode, setToolEditMode] = useState(false);
  const [isPaymentModalAnimating, setIsPaymentModalAnimating] = useState(false);
  const [isFavoriteAnimating, setIsFavoriteAnimating] = useState(false);
  const [shotToDelete, setShotToDelete] = useState<{ id: string; name: string } | null>(null);
  const [assetStats, setAssetStats] = useState<AssetStats | null>(null);
  const [softwareToRemove, setSoftwareToRemove] = useState<string | null>(null);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [showTopShadow, setShowTopShadow] = useState(false);
  const [tasksExpanded, setTasksExpanded] = useState(false);
  const [linksExpanded, setLinksExpanded] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState(project.description || '');
  const [nameInput, setNameInput] = useState(project.name);
  const projectNameInput = useProjectNameInput();
  useEffect(() => { setNameInput(project.name); }, [project.id]);
  const contentScrollRef = useRef<HTMLElement | null>(null);

  // Writes go to the latest store copy of the project, never a spread of this (possibly stale) prop
  const patch = (fields: Partial<Project>) => useProjectStore.getState().patchProject(project.id, fields);

  // Typed fields are saved when editing ends; a modal closing with an unsaved draft saves it too
  const draftKey = `${project.id}|${showPaymentModal}|${showProjectSettings}`;
  const costField = useDraftField(numberDraft(project.cost), d => patch({ cost: parseNumberDraft(d) }), draftKey);
  const prepaymentField = useDraftField(
    numberDraft(project.prepaymentAmount),
    d => patch({ prepaymentAmount: parseNumberDraft(d) }),
    draftKey
  );
  const descriptionField = useDraftField(project.description || '', d => patch({ description: d }), draftKey);

  // Context menu using centralized hook
  const { isOpen: isContextMenuOpen, position: contextMenuPosition, data: contextMenuData, openMenu: openContextMenu, closeMenu: closeContextMenu } = useContextMenu<{ software: any; executablePath: string }>();

  // Handle ESC to close Project Settings modal (capture phase to run before App.tsx handler)
  useEffect(() => {
    if (!showProjectSettings) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation(); // Stop all other handlers
        setShowProjectSettings(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true); // capture: true
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [showProjectSettings]);

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

  // Get fresh project from store; useShallow avoids re-renders when spread-unchanged fields (software, scenes) stay the same reference
  const latestProject = useProjectStore(
    useShallow(state => state.projects.find(p => p.id === project.id) || project)
  );
  const timeTrackingEnabled = useTimeTrackingFeature();
  // Only re-render when active+visible sessions change, not on every elapsedSeconds tick
  const activeVisibleSessions = useTimeTrackingStore(
    useShallow((state: { sessions: Map<string, any> }) => {
      const result: Record<string, boolean> = {};
      state.sessions.forEach((entry: any, id: string) => {
        if (entry.isActive && entry.widgetVisible) {
          result[id] = true;
        }
      });
      return result;
    })
  );

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

  // Versions / Outputs blocks — both hidden when only a scene (no shot) is selected
  const overviewsVisible = !(context.isScene && !context.isShot);
  // Asset/Compose contexts list files from shared folders, which can come from software outside
  // project.software (Assets Library creates assets in any software) — keep Versions there
  const showVersions = overviewsVisible && (hasVersionedSoftware(project.software) || context.isSpecialContext);
  const showOutputs = overviewsVisible && context.specialContextType !== 'asset';
  // Versions Overview normally runs the file watcher; when it's hidden (e.g. UE-only project),
  // keep the watcher here so rendered outputs still appear live
  useProjectWatcher(showOutputs && !showVersions ? project.path : null);

  const tasks = useTasks(project.id, context);
  const attachmentSubdir = getAttachmentSubdir(context, project);
  const isLastTaskWithAttachments = tasks.todos.filter(t => (t.attachments?.length ?? 0) > 0).length === 1;

  // Compute breadcrumb parts for reuse in rendering
  const breadcrumbParts = (() => {
    const parts: string[] = [];
    if (project.currentSpecialContextId) {
      const specialContext = project.specialContexts?.find((c: any) => c.id === project.currentSpecialContextId);
      if (specialContext) {
        if (specialContext.sceneId) {
          const scene = project.scenes?.find((s: any) => s.id === specialContext.sceneId);
          if (scene) parts.push(scene.name);
        }
        parts.push(specialContext.type === 'asset' ? 'Asset Projects' : 'Compose Projects');
      }
    } else if (project.hasScenes && project.hasShots) {
      // Show scene/shot breadcrumb when project uses both
      if (project.currentSceneId) {
        const scene = project.scenes?.find((s: any) => s.id === project.currentSceneId);
        if (scene) parts.push(scene.name);
      }
      if (project.currentShotId) {
        const shot = project.shots?.find((s: any) => s.id === project.currentShotId);
        if (shot) parts.push(shot.name);
      }
    } else if (!project.hasScenes && project.hasShots) {
      // Shots-only mode: show shot name
      if (project.currentShotId) {
        const shot = project.shots?.find((s: any) => s.id === project.currentShotId);
        if (shot) parts.push(shot.name);
      }
    }
    // hasScenes && !hasShots: scene-only — no breadcrumb (just "Main" is not useful)
    // !hasScenes && !hasShots: no breadcrumb
    return parts;
  })();

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
        patch({ thumbnail: thumbnailName });
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
        await createDir('preview', { dir: BaseDirectory.AppData, recursive: true });
      } catch (e) {
        // Directory might already exist, ignore error
      }

      // Write binary file to AppData directory
      await writeBinaryFile(`preview/${tempFileName}`, uint8Array, { dir: BaseDirectory.AppData });

      // Get full path using join
      const appDir = await appDataDir();
      const tempPath = await join(appDir, 'preview', tempFileName);

      // Set thumbnail
      const thumbnailName = await invoke<string>('set_project_thumbnail', {
        projectPath: project.path,
        imagePath: tempPath
      });

      // Clean up temp file after successful copy
      const { removeFile } = await import('@tauri-apps/api/fs');
      await removeFile(tempPath).catch(() => {}); // Ignore errors

      patch({ thumbnail: thumbnailName });
    } catch (error) {
      console.error('Failed to process image:', error);
    }
  };

  const openToolEditor = (key: string) => {
    const globalPaths: Record<string, string> = JSON.parse(localStorage.getItem('softwarePaths') || '{}');
    const projectPaths: Record<string, string> = JSON.parse(localStorage.getItem(`projectSoftwarePaths_${project.id}`) || '{}');
    const effective = projectPaths[key] ?? globalPaths[key] ?? '';
    setSelectedToolKey(key);
    setToolWorkingPath(effective);
    setToolSavedFlash(false);
    setToolEditorOpen(true);
    setToolEditorClosing(false);
  };

  const closeToolEditor = () => {
    setToolEditorOpen(false);
    setToolEditorClosing(true);
    setTimeout(() => setToolEditorClosing(false), 260);
  };

  const leaveEditMode = () => {
    setToolEditMode(false);
    if (toolEditorOpen) closeToolEditor();
  };

  const saveToolPath = () => {
    const key = `projectSoftwarePaths_${project.id}`;
    const map: Record<string, string> = JSON.parse(localStorage.getItem(key) || '{}');
    const globalPaths: Record<string, string> = JSON.parse(localStorage.getItem('softwarePaths') || '{}');
    const path = toolWorkingPath.trim();
    // Same as the global path (the editor pre-fills it) → no override: saving unchanged must not pin
    // today's global path to this project, or a later change in Settings would never reach it
    if (path && path !== (globalPaths[selectedToolKey] ?? '')) {
      map[selectedToolKey] = path;
    } else {
      delete map[selectedToolKey];
    }
    localStorage.setItem(key, JSON.stringify(map));
    setToolSavedFlash(true);
    setTimeout(() => setToolSavedFlash(false), 1800);
  };

  const resetToolToDefault = () => {
    const key = `projectSoftwarePaths_${project.id}`;
    const map: Record<string, string> = JSON.parse(localStorage.getItem(key) || '{}');
    delete map[selectedToolKey];
    localStorage.setItem(key, JSON.stringify(map));
    const globalPaths: Record<string, string> = JSON.parse(localStorage.getItem('softwarePaths') || '{}');
    setToolWorkingPath(globalPaths[selectedToolKey] ?? '');
    setToolSavedFlash(false);
  };

  const browseToolPath = async () => {
    const path = await selectExecutable();
    if (path) setToolWorkingPath(path);
  };

  const handleToggleSoftware = async (softwareName: string) => {
    const softwareKey = normalizeSoftwareName(softwareName);
    const { projects, updateProject } = useProjectStore.getState();
    const currentProject = projects.find(p => p.id === project.id) || project;
    const isCurrentlySelected = currentProject.software.some((sw: any) => {
      const existingKey = normalizeSoftwareName(sw.name);
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

    const softwareKey = normalizeSoftwareName(softwareToRemove);
    const { updateProject } = useProjectStore.getState();

    try {
      // Delete software folder
      await invoke('remove_software_from_project', {
        projectPath: project.path,
        softwareName: softwareKey
      });

      // Read the latest project after the await: updateProject replaces the whole object
      const latest = useProjectStore.getState().projects.find(p => p.id === project.id) || project;

      // Remove software from project metadata
      const updatedSoftware = latest.software.filter((sw: any) => {
        const existingKey = normalizeSoftwareName(sw.name);
        return existingKey !== softwareKey;
      });

      await updateProject({
        ...latest,
        software: updatedSoftware,
        // Keep compose in sync — otherwise Global Compose is left without a launch button
        composeSoftware: (latest.composeSoftware || []).filter((k: string) => k !== softwareKey),
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
              <h1 className="text-project-title font-bold select-text">{project.name}</h1>
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

          {/* Context Breadcrumb - shown below title */}
          {breadcrumbParts.length > 0 ? (
            <div className="text-xs text-text-dim -mt-3">
              {breadcrumbParts.join(' / ')}
            </div>
          ) : (project.description || isEditingDescription) ? (
            <div className="group/desc flex items-center gap-1.5 -mt-3">
              {isEditingDescription ? (
                <>
                  <input
                    type="text"
                    value={descriptionValue}
                    onChange={(e) => setDescriptionValue(e.target.value)}
                    onBlur={() => {
                      patch({ description: descriptionValue });
                      setIsEditingDescription(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setDescriptionValue(project.description || '');
                        setIsEditingDescription(false);
                      }
                      if (e.key === 'Enter') {
                        patch({ description: descriptionValue });
                        setIsEditingDescription(false);
                      }
                    }}
                    autoFocus
                    className="bg-transparent text-xs text-text-primary focus:outline-none"
                    placeholder="Add a description..."
                    style={{ width: `${Math.max(descriptionValue.length || 20, 20)}ch` }}
                  />
                </>
              ) : (
                <>
                  <span
                    className="text-xs text-text-dim cursor-text"
                    onClick={() => setIsEditingDescription(true)}
                  >
                    {project.description}
                  </span>
                  <button
                    onClick={() => setIsEditingDescription(true)}
                    className="opacity-0 group-hover/desc:opacity-100 transition-opacity p-0.5 hover:bg-hover-bg rounded"
                    title="Edit description"
                  >
                    <IconPencil size={14} stroke={1.5} className="text-text-muted" />
                  </button>
                </>
              )}
            </div>
          ) : null}

          {/* Project Description - shown only when breadcrumb has content (otherwise description is in breadcrumb position above) */}
          {(project.description || isEditingDescription) && breadcrumbParts.length > 0 && (
            <div className="group/desc inline-flex items-center gap-1.5 mt-2.5">
              {isEditingDescription ? (
                <>
                  <input
                    type="text"
                    value={descriptionValue}
                    onChange={(e) => setDescriptionValue(e.target.value)}
                    onBlur={() => {
                      patch({ description: descriptionValue });
                      setIsEditingDescription(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setDescriptionValue(project.description || '');
                        setIsEditingDescription(false);
                      }
                      if (e.key === 'Enter') {
                        patch({ description: descriptionValue });
                        setIsEditingDescription(false);
                      }
                    }}
                    autoFocus
                    className="bg-transparent text-sm text-text-primary focus:outline-none"
                    placeholder="Add a description..."
                    style={{ width: `${Math.max(descriptionValue.length || 20, 20)}ch` }}
                  />
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
      {context.isSpecialContext && context.specialContextType === 'asset' && !context.specialContextSceneId ? (
        <AssetsLibrary project={project} showNotification={showNotification} onStatsChange={setAssetStats} />
      ) : (
      <SimpleBar className="flex-1 custom-page-scrollbar" autoHide={false} scrollableNodeProps={{ ref: contentScrollRef }}>
        <div className="px-7 pb-16 pt-4">
        {/* Quick Actions */}
        <div className="mb-7">
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={onOpenFolder}
              className="group p-3 bg-card-bg border border-border-primary hover:bg-hover-bg hover:border-[#262626] rounded-med flex items-center gap-2.5 transition-all hover:-translate-y-0.5 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-button flex items-center justify-center bg-gradient-to-br from-blue-500/20 via-blue-600/10 to-blue-700/10">
                <IconFolderOpen stroke={1.5} className="w-5 h-5 text-blue-400 pointer-events-none" />
              </div>
              <span className="text-sm font-medium text-text-primary pointer-events-none">Open Folder</span>
            </button>
            <button
              onClick={() => setShowPaymentModal(true)}
              className="group p-3 bg-card-bg border border-border-primary hover:bg-hover-bg hover:border-[#262626] rounded-med flex items-center gap-2.5 transition-all hover:-translate-y-0.5 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-button flex items-center justify-center bg-gradient-to-br from-green-500/20 via-green-600/10 to-green-700/10">
                <IconCreditCard stroke={1.5} className="w-5 h-5 text-green-400 pointer-events-none" />
              </div>
              <span className="text-sm font-medium text-text-primary pointer-events-none">Payment</span>
            </button>
            {timeTrackingEnabled && (
              <button
                onClick={() => setShowManualTimeEntry(true)}
                className="group p-3 bg-card-bg border border-border-primary hover:bg-hover-bg hover:border-[#262626] rounded-med flex items-center gap-2.5 transition-all hover:-translate-y-0.5 cursor-pointer"
              >
                <div className="w-9 h-9 rounded-button flex items-center justify-center bg-gradient-to-br from-yellow-500/20 via-yellow-600/10 to-yellow-700/10">
                  <IconClock stroke={1.5} className="w-5 h-5 text-yellow-400 pointer-events-none" />
                </div>
                <span className="text-sm font-medium text-text-primary pointer-events-none">Add Time</span>
              </button>
            )}
          </div>
        </div>

        {/* Software Launchers - hidden when only scene is selected in scenes+shots mode */}
        {!(context.isScene && !context.isShot && project.hasScenes && project.hasShots) && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-text-secondary mb-3.5">Launch Software</h3>
            <div className="grid grid-cols-2 gap-2">
            {(() => {
              const savedPaths = localStorage.getItem('softwarePaths');
              const pathsMap: Record<string, string> = savedPaths ? JSON.parse(savedPaths) : {};
              const projectPathsMap: Record<string, string> = JSON.parse(
                localStorage.getItem(`projectSoftwarePaths_${project.id}`) || '{}'
              );
              const keyOf = (sw: any) => normalizeSoftwareName(sw.name);
              const composeKeys: string[] = project.composeSoftware || [];
              const launchList = (context.isSpecialContext && context.specialContextType === 'compose')
                ? [
                    // composeSoftware stores keys ('davinci'), which a display name doesn't always collapse to
                    ...project.software.filter((sw: any) => composeKeys.some(cs => cs === keyOf(sw) || cs === sw.name)),
                    // Compose-only software isn't in the project's software list: build its entry from the key
                    ...composeKeys
                      .filter(key => COMPOSE_ONLY_SOFTWARE.has(key) && !project.software.some((sw: any) => keyOf(sw) === key))
                      .map(key => ({ name: formatSoftwareName(key), executablePath: '' })),
                  ]
                : project.software.filter((sw: any) => !isComposeOnlySoftware(keyOf(sw), !!(project.hasShots || project.hasScenes)));
              return launchList.map((sw: any) => {
              const softwareKey = normalizeSoftwareName(sw.name);
              const executablePath = projectPathsMap[softwareKey] || pathsMap[softwareKey] || sw.executablePath;

              // Get launch status for this software
              // projectStore.launchSoftware keys the status by software key, not display name
              const statusKey = `${project.path}-${softwareKey}`;
              const status = launchingStatus?.[statusKey] || 'idle';

              // Find active session for this software (compare with softwareKey, not display name)
              // Use live timeTrackingStore state to avoid showing frozen timers during async projectStore updates
              const activeEntry = latestProject.timeEntries?.find((e: any) => {
                return e.software === softwareKey &&
                       activeVisibleSessions[e.id] === true;
              });

              // Software color for the card gradient
              const softwareColor = getSoftwareColor(softwareKey);

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

                    // Re-read paths at click time to ensure freshness (avoid stale closure)
                    const clickSavedPaths = localStorage.getItem('softwarePaths');
                    const clickPathsMap: Record<string, string> = clickSavedPaths ? JSON.parse(clickSavedPaths) : {};
                    const clickProjectPathsMap: Record<string, string> = JSON.parse(
                      localStorage.getItem(`projectSoftwarePaths_${project.id}`) || '{}'
                    );
                    const resolvedPath = clickProjectPathsMap[softwareKey] || clickPathsMap[softwareKey] || sw.executablePath;

                    onLaunchSoftware({
                      ...sw,
                      executablePath: resolvedPath,
                      sceneNumber: currentScene?.number,
                      shotNumber: currentShot?.number
                    });
                  }}
                  onContextMenu={(e) => {
                    if (status === 'launching' || !executablePath) {
                      e.preventDefault();
                      return;
                    }
                    openContextMenu(e, { software: sw, executablePath });
                  }}
                  disabled={status === 'launching' || !executablePath}
                  data-launch-software
                  className={`p-4 rounded-xl flex items-center gap-3 transition-all duration-200 group select-none relative overflow-hidden ${
                    !executablePath ? 'opacity-60 cursor-not-allowed' : status === 'launching' ? 'cursor-wait' : ''
                  }`}
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
                  <LaunchCardContent
                    name={sw.name}
                    icon={<SoftwareIcon name={sw.name} />}
                    color={softwareColor}
                    status={status}
                    sessionVisible={!!activeEntry}
                    timer={timeTrackingEnabled && activeEntry ? <InlineTimer activeEntry={activeEntry} /> : null}
                    idleText={executablePath ? 'Click to launch' : 'Path not set'}
                  />
                </button>
              );
              });
            })()}
          </div>
        </div>
        )}

        {/* Todo Section - hidden when only scene is selected (shown at top instead) */}
        {!(context.isScene && !context.isShot) && (
        <div className="mb-6">
          <div className="bg-card-bg border border-border-primary rounded-card p-4 transition-[border-color] duration-200 hover:border-[#262626]">
            {/* Header */}
            <div className="flex items-center justify-between mb-3 h-7">
              <span className="text-sm font-medium text-text-secondary">Tasks</span>
              {context.todos.length > 3 && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setTasksExpanded(!tasksExpanded)}
                    className={`flex items-center gap-1.5 px-2.5 py-[5px] rounded-[6px] text-[11px] font-medium transition-colors whitespace-nowrap border ${
                      tasksExpanded
                        ? 'bg-[#1a1a1a] border-[#3f3f46] text-zinc-500'
                        : 'border-[#262626] text-zinc-500 hover:bg-[#1a1a1a] hover:border-[#3f3f46]'
                    }`}
                  >
                    <span className="relative">
                      <span className="invisible">Collapse</span>
                      <span className="absolute inset-0 flex items-center">{tasksExpanded ? 'Collapse' : 'View all'}</span>
                    </span>
                    <IconChevronRight stroke={2} className={`w-3 h-3 transition-transform duration-200 ${tasksExpanded ? 'rotate-90' : ''}`} />
                  </button>
                  <span className="flex items-center justify-center min-w-[28px] px-2.5 py-[5px] rounded-[6px] border border-[#262626] text-[11px] font-bold text-zinc-500">
                    {context.todos.length}
                  </span>
                </div>
              )}
            </div>

            {/* Task list */}
            <div className="space-y-1.5 mb-3">
              {tasks.todos.slice(0, 3).map(todo => (
                <TaskItem
                  key={todo.id}
                  todo={todo}
                  onToggle={() => tasks.toggle(todo.id)}
                  onRemove={() => tasks.remove(todo.id)}
                  onUpdate={(patch) => tasks.update(todo.id, patch)}
                  projectPath={project.path}
                  attachmentSubdir={attachmentSubdir}
                  isLastTaskWithAttachments={isLastTaskWithAttachments}
                />
              ))}

              {/* Expandable overflow tasks */}
              {tasks.todos.length > 3 && (
                <div
                  className="grid transition-[grid-template-rows] duration-200 ease-out"
                  style={{ gridTemplateRows: tasksExpanded ? '1fr' : '0fr' }}
                >
                  <div className="overflow-hidden">
                    <div className="space-y-1.5 pt-1.5">
                      {tasks.todos.slice(3).map(todo => (
                        <TaskItem
                          key={todo.id}
                          todo={todo}
                          onToggle={() => tasks.toggle(todo.id)}
                          onRemove={() => tasks.remove(todo.id)}
                          onUpdate={(patch) => tasks.update(todo.id, patch)}
                          projectPath={project.path}
                          attachmentSubdir={attachmentSubdir}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Add task input */}
            <input
              type="text"
              placeholder="+ Add task..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                  tasks.add(e.currentTarget.value.trim());
                  e.currentTarget.value = '';
                }
              }}
              onBlur={(e) => {
                if (e.currentTarget.value.trim()) {
                  tasks.add(e.currentTarget.value.trim());
                  e.currentTarget.value = '';
                }
              }}
              className="w-full px-3 py-2 bg-transparent border border-border-secondary border-dashed rounded-card text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-border-secondary focus:border-solid"
            />
          </div>
        </div>
        )}

        {/* Versions Overview - hidden when only scene is selected (without shot) or the project has no versioned software */}
        {showVersions && (
        <VersionsOverview
          project={project}
          currentScene={context.sceneId ? project.scenes?.find((s: any) => s.id === context.sceneId) : null}
          currentShot={context.isShot && context.shotId ? project.shots?.find((s: any) => s.id === context.shotId) : null}
          specialContextType={context.isSpecialContext ? context.specialContextType : null}
          showNotification={showNotification}
        />
        )}

        {/* Output Overview - hidden when only scene is selected (without shot) or in asset context */}
        {showOutputs && (
        <OutputOverview
          project={project}
          currentScene={context.sceneId ? project.scenes?.find((s: any) => s.id === context.sceneId) : null}
          currentShot={context.isShot && context.shotId ? project.shots?.find((s: any) => s.id === context.shotId) : null}
          specialContextType={context.isSpecialContext ? context.specialContextType : null}
          showNotification={showNotification}
        />
        )}

        {/* Links Section */}
        <div className="mb-6">
          <div className="bg-card-bg border border-border-primary rounded-card p-4 transition-[border-color] duration-200 hover:border-[#262626]">
            {/* Header */}
            <div className="flex items-center justify-between mb-3 h-7">
              <span className="text-sm font-medium text-text-secondary">Links</span>
              {context.links.length > 5 && (
                <button
                  onClick={() => setLinksExpanded(!linksExpanded)}
                  className="flex items-center gap-2 text-xs font-medium text-text-secondary hover:bg-accent/10 px-2 h-7 rounded-button transition-all cursor-pointer"
                >
                  <IconChevronRight stroke={2} className={`w-3.5 h-3.5 transition-transform duration-200 ${linksExpanded ? 'rotate-90' : ''}`} />
                  <span>{linksExpanded ? 'Collapse' : 'View All Links'}</span>
                  <span className="bg-[#1e1e1e] text-text-secondary text-[11px] min-w-5 h-5 rounded grid place-items-center">{context.links.length}</span>
                </button>
              )}
            </div>
            {/* Links List */}
            <div className="space-y-1.5 mb-3">
              {context.links.slice(0, 5).map((link: any) => (
                <LinkItem key={link.id} link={link} projectId={project.id} shotId={context.shotId} sceneId={context.sceneId || null} specialContextId={context.specialContextId || null} />
              ))}

              {/* Expandable overflow links */}
              {context.links.length > 5 && (
                <div
                  className="grid transition-[grid-template-rows] duration-200 ease-out"
                  style={{ gridTemplateRows: linksExpanded ? '1fr' : '0fr' }}
                >
                  <div className="overflow-hidden">
                    <div className="space-y-1.5">
                      {context.links.slice(5).map((link: any) => (
                        <LinkItem key={link.id} link={link} projectId={project.id} shotId={context.shotId} sceneId={context.sceneId || null} specialContextId={context.specialContextId || null} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <LinkInputForm projectId={project.id} shotId={context.shotId} sceneId={context.sceneId || null} specialContextId={context.specialContextId || null} />
          </div>
        </div>

        {/* Tasks Section - shown when only scene is selected (after links) */}
        {(context.isScene && !context.isShot) && (
        <div className="mb-6">
          <div className="bg-card-bg border border-border-primary rounded-card p-4 transition-[border-color] duration-200 hover:border-[#262626]">
            {/* Header */}
            <div className="flex items-center justify-between mb-3 h-7">
              <span className="text-sm font-medium text-text-secondary">Tasks</span>
              {context.todos.length > 3 && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setTasksExpanded(!tasksExpanded)}
                    className={`flex items-center gap-1.5 px-2.5 py-[5px] rounded-[6px] text-[11px] font-medium transition-colors whitespace-nowrap border ${
                      tasksExpanded
                        ? 'bg-[#1a1a1a] border-[#3f3f46] text-zinc-500'
                        : 'border-[#262626] text-zinc-500 hover:bg-[#1a1a1a] hover:border-[#3f3f46]'
                    }`}
                  >
                    <span className="relative">
                      <span className="invisible">Collapse</span>
                      <span className="absolute inset-0 flex items-center">{tasksExpanded ? 'Collapse' : 'View all'}</span>
                    </span>
                    <IconChevronRight stroke={2} className={`w-3 h-3 transition-transform duration-200 ${tasksExpanded ? 'rotate-90' : ''}`} />
                  </button>
                  <span className="flex items-center justify-center min-w-[28px] px-2.5 py-[5px] rounded-[6px] border border-[#262626] text-[11px] font-bold text-zinc-500">
                    {context.todos.length}
                  </span>
                </div>
              )}
            </div>

            {/* Task list */}
            <div className="space-y-1.5 mb-3">
              {tasks.todos.slice(0, 3).map(todo => (
                <TaskItem
                  key={todo.id}
                  todo={todo}
                  onToggle={() => tasks.toggle(todo.id)}
                  onRemove={() => tasks.remove(todo.id)}
                  onUpdate={(patch) => tasks.update(todo.id, patch)}
                  projectPath={project.path}
                  attachmentSubdir={attachmentSubdir}
                  isLastTaskWithAttachments={isLastTaskWithAttachments}
                />
              ))}

              {/* Expandable overflow tasks */}
              {tasks.todos.length > 3 && (
                <div
                  className="grid transition-[grid-template-rows] duration-200 ease-out"
                  style={{ gridTemplateRows: tasksExpanded ? '1fr' : '0fr' }}
                >
                  <div className="overflow-hidden">
                    <div className="space-y-1.5 pt-1.5">
                      {tasks.todos.slice(3).map(todo => (
                        <TaskItem
                          key={todo.id}
                          todo={todo}
                          onToggle={() => tasks.toggle(todo.id)}
                          onRemove={() => tasks.remove(todo.id)}
                          onUpdate={(patch) => tasks.update(todo.id, patch)}
                          projectPath={project.path}
                          attachmentSubdir={attachmentSubdir}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Add task input */}
            <input
              type="text"
              placeholder="+ Add task..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                  tasks.add(e.currentTarget.value.trim());
                  e.currentTarget.value = '';
                }
              }}
              onBlur={(e) => {
                if (e.currentTarget.value.trim()) {
                  tasks.add(e.currentTarget.value.trim());
                  e.currentTarget.value = '';
                }
              }}
              className="w-full px-3 py-2 bg-transparent border border-border-secondary border-dashed rounded-card text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-border-secondary focus:border-solid"
            />
          </div>
        </div>
        )}

        {/* Shots Overview Table - shown only in scenes+shots mode when scene is selected */}
        {context.isScene && !context.isShot && project.hasShots && project.hasScenes && (
          <ShotsOverviewTable
            projectId={project.id}
            projectPath={project.path}
            projectName={project.name}
            currentScene={project.scenes?.find((s: any) => s.id === context.sceneId)}
            shots={project.shots?.filter((s: any) => s.sceneId === context.sceneId) || []}
          />
        )}

        {/* Notes Section */}
        <NotesSection project={project} context={context} />
        </div>
      </SimpleBar>
      )}

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
            className={`bg-card-bg rounded-card border border-border-secondary shadow-2xl w-full max-w-md mx-4 max-h-[85vh] overflow-hidden flex flex-col transition-all duration-200 ${
              isPaymentModalAnimating ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
            }`}
            onClick={(e) => e.stopPropagation()}
            data-modal-window
          >
            <div className="p-4 border-b border-border-secondary flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Payment Settings</h2>
              <button onClick={() => setShowPaymentModal(false)} className="w-7 h-7 flex items-center justify-center hover:bg-hover-bg rounded-badge transition-colors">
                <IconX stroke={1.5} className="w-5 h-5 text-text-muted" />
              </button>
            </div>

            <SimpleBar className="flex-1 custom-scrollbar" autoHide={false} style={{ maxHeight: '100%' }}>
              <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs text-text-muted mb-1.5 font-medium">Cost *</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    {...costField}
                    placeholder="0"
                    className="flex-1 bg-sidebar-bg border border-border-primary rounded-button px-3 py-2 text-sm text-white focus:outline-none focus:border-border-secondary transition-colors"
                  />
                  <CustomSelect
                    value={project.currency || 'USD'}
                    onChange={(val) => {
                      patch({ currency: val as 'USD' | 'RUB' | 'EUR' });
                    }}
                    options={[
                      { value: 'USD', label: 'USD' },
                      { value: 'RUB', label: 'RUB' },
                      { value: 'EUR', label: 'EUR' },
                    ]}
                    className="w-24"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-text-muted mb-1.5 font-medium">Payment Status</label>
                <CustomSelect
                  value={project.paymentStatus || 'unpaid'}
                  onChange={(val) => {
                    const newStatus = val as 'paid' | 'prepaid' | 'unpaid';
                    patch(getPaymentStatusUpdate(project, newStatus));
                  }}
                  options={[
                    { value: 'unpaid', label: 'Unpaid' },
                    { value: 'prepaid', label: 'Prepaid' },
                    { value: 'paid', label: 'Paid' },
                  ]}
                />
              </div>

              {project.paymentStatus === 'prepaid' && (
                <div>
                  <label className="block text-xs text-text-muted mb-1.5 font-medium">
                    Prepayment Amount {!project.prepaymentAmount && <span className="text-red-400">*</span>}
                  </label>
                  <input
                    type="number"
                    {...prepaymentField}
                    placeholder="0"
                    autoFocus={!project.prepaymentAmount}
                    className={`w-full bg-sidebar-bg border rounded-button px-3 py-2 text-sm text-white focus:outline-none transition-colors ${
                      !project.prepaymentAmount
                        ? 'border-red-500 focus:border-red-400'
                        : 'border-border-primary focus:border-border-secondary'
                    }`}
                  />
                  {!project.prepaymentAmount && (
                    <p className="text-xs text-red-400 mt-1">Required for prepaid status</p>
                  )}
                </div>
              )}
              </div>
            </SimpleBar>

            <div className="flex justify-end gap-2 p-4 border-t border-border-secondary">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm rounded-button transition-colors font-medium shadow-sm"
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
          className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4 rounded-lg ${blurClass}`}
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
          <div className="bg-card-bg border border-border-secondary rounded-card max-w-2xl w-full max-h-[90vh] flex flex-col animate-modal" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-border-secondary flex items-center justify-between flex-shrink-0">
              <h2 className="text-lg font-semibold">Project Settings</h2>
              <button onClick={() => setShowProjectSettings(false)} className="w-7 h-7 flex items-center justify-center hover:bg-hover-bg rounded-badge transition-colors">
                <IconX stroke={1.5} className="w-5 h-5 close-button-red" />
              </button>
            </div>

            <SimpleBar className="flex-1 min-h-0 custom-scrollbar" autoHide={false} style={{ maxHeight: '100%' }}>
              <div className="p-4 space-y-2.5">
              <div className="flex gap-3 items-center">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1.5">Project Name</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={nameInput}
                      onKeyDown={projectNameInput.onKeyDown}
                      onChange={(e) => setNameInput(projectNameInput.sanitize(e.target.value))}
                      onBlur={() => {
                        const trimmed = nameInput.trim();
                        if (trimmed && trimmed !== project.name) {
                          const { renameProject } = useProjectStore.getState();
                          renameProject(project, trimmed).catch(() => setNameInput(project.name));
                        } else {
                          setNameInput(project.name);
                        }
                      }}
                      className={`w-full bg-sidebar-bg rounded-button px-3 py-2 pr-9 text-sm focus:outline-none transition-colors ${
                        projectNameInput.rejected
                          ? 'border border-red-500'
                          : 'border border-border-primary focus:border-border-secondary'
                      }`}
                    />
                    {projectNameInput.rejected && (
                      <IconAlertCircle size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500" />
                    )}
                  </div>
                  <CollapsibleHint show={projectNameInput.rejected}>{PROJECT_NAME_HINT}</CollapsibleHint>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1.5">Description</label>
                  <textarea
                    {...descriptionField}
                    rows={2}
                    className="w-full bg-sidebar-bg border border-border-primary rounded-button px-3 py-2 text-sm focus:outline-none focus:border-border-secondary resize-none h-[60px]"
                  />
                </div>
                <div className="w-32">
                  <label className="block text-sm font-medium mb-1.5">Thumbnail <span className="text-xs text-text-muted">(Ctrl+V)</span></label>
                  {project.thumbnail ? (
                    <div className="relative h-[60px] rounded-button overflow-hidden border border-border-primary bg-sidebar-bg">
                      {thumbnailSrc && (
                        <img
                          src={thumbnailSrc}
                          alt="Project thumbnail"
                          className="w-full h-full object-cover"
                          draggable={false}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          patch({ thumbnail: undefined });
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
                            patch({ thumbnail: thumbnailName });
                          } catch (error) {
                            console.error('Failed to set thumbnail:', error);
                          }
                        }
                      }}
                      className="h-[60px] w-full bg-sidebar-bg hover:bg-hover-bg rounded-button transition-colors text-sm border border-border-primary flex items-center justify-center"
                    >
                      <IconPlus stroke={1.5} className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="border-t border-border-secondary pt-2"></div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Status</label>
                  <CustomSelect
                    value={project.status}
                    onChange={(val) => {
                      const { updateStatus } = useProjectStore.getState();
                      updateStatus(project.id, val as ProjectStatus);
                    }}
                    options={[
                      { value: 'active', label: 'Active' },
                      { value: 'paused', label: 'Paused' },
                      { value: 'completed', label: 'Completed' },
                      { value: 'archived', label: 'Archived' },
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Client</label>
                  <CustomSelect
                    value={project.clientId || ''}
                    onChange={(v) => {
                      patch({ clientId: v || undefined });
                    }}
                    options={[
                      { value: '', label: 'No client' },
                      ...useProjectStore.getState().clients.map(c => ({ value: c.id, label: c.name, color: c.color })),
                    ]}
                  />
                </div>
              </div>

              <div className="border-t border-border-secondary pt-2"></div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Deadline</label>
                  <div className="flex gap-2 items-center">
                    <div className="relative w-14">
                      <input
                        type="text"
                        placeholder="DD"
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
                        className="w-14 bg-sidebar-bg border border-border-primary rounded-button px-2 py-2 text-sm text-center focus:outline-none focus:border-border-secondary"
                      />
                    </div>
                    <span className="text-text-muted">.</span>
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
                        placeholder="MM"
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
                        className="w-14 bg-sidebar-bg border border-border-primary rounded-button px-2 py-2 text-sm text-center focus:outline-none focus:border-border-secondary"
                      />
                    </div>
                    <span className="text-text-muted">.</span>
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
                        placeholder="YY"
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
                        className="w-14 bg-sidebar-bg border border-border-primary rounded-button px-2 py-2 text-sm text-center focus:outline-none focus:border-border-secondary"
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
                        className="absolute opacity-0 [color-scheme:dark]"
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
                        className="w-5 h-5 text-text-muted"
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
                      {...costField}
                      placeholder="0"
                      className="flex-1 bg-sidebar-bg border border-border-primary rounded-button px-3 py-2 text-sm focus:outline-none focus:border-border-secondary"
                    />
                    <CustomSelect
                      value={project.currency || 'USD'}
                      onChange={(val) => {
                        patch({ currency: val as 'USD' | 'RUB' | 'EUR' });
                      }}
                      options={[
                        { value: 'USD', label: 'USD' },
                        { value: 'RUB', label: 'RUB' },
                        { value: 'EUR', label: 'EUR' },
                      ]}
                      className="w-20"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Payment Status</label>
                  <CustomSelect
                    value={project.paymentStatus || 'unpaid'}
                    onChange={(val) => {
                      const newStatus = val as 'paid' | 'prepaid' | 'unpaid';
                      patch(getPaymentStatusUpdate(project, newStatus));
                    }}
                    options={[
                      { value: 'unpaid', label: 'Unpaid' },
                      { value: 'prepaid', label: 'Prepaid' },
                      { value: 'paid', label: 'Paid' },
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Prepayment Amount {project.paymentStatus === 'prepaid' && !project.prepaymentAmount && <span className="text-red-400">*</span>}
                  </label>
                  <input
                    type="number"
                    {...prepaymentField}
                    placeholder="0"
                    disabled={project.paymentStatus !== 'prepaid'}
                    className={`w-full bg-sidebar-bg border rounded-button px-3 py-2 text-sm focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                      project.paymentStatus === 'prepaid' && !project.prepaymentAmount
                        ? 'border-red-500 focus:border-red-400'
                        : 'border-border-primary focus:border-border-secondary'
                    }`}
                  />
                  {project.paymentStatus === 'prepaid' && !project.prepaymentAmount && (
                    <p className="text-xs text-red-400 mt-1">Required</p>
                  )}
                </div>
              </div>

              <div className="border-t border-border-secondary pt-2"></div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Project Path</label>
                <input
                  type="text"
                  value={project.path}
                  readOnly
                  className="w-full bg-sidebar-bg border border-border-primary rounded-button px-3 py-2 text-sm focus:outline-none focus:border-border-secondary opacity-60"
                />
              </div>

              {/* Tools Section */}
              <div className="border-t border-border-secondary pt-4">
                {/* Header */}
                <div className="flex items-center gap-2.5 mb-3.5">
                  <span className="font-medium">Tools</span>
                  <div className="flex-1" />
                  <div className="relative h-[26px]">
                    {/* Close/Done — fades in from right on edit mode */}
                    <div
                      className="flex items-center gap-1"
                      style={{
                        opacity: toolEditMode ? 1 : 0,
                        transform: toolEditMode ? 'translateX(0)' : 'translateX(6px)',
                        transition: 'opacity 0.15s ease, transform 0.15s ease',
                        pointerEvents: toolEditMode ? undefined : 'none',
                      }}
                    >
                      <button onClick={leaveEditMode} className="h-[26px] px-1.5 text-[11.5px] font-medium text-text-muted hover:text-text-primary transition-colors">
                        Close
                      </button>
                      <button onClick={leaveEditMode} className="h-[26px] px-1.5 text-[11.5px] font-semibold text-text-secondary hover:text-text-primary transition-colors">
                        Done
                      </button>
                    </div>
                    {/* Pencil — fades out to right on edit mode */}
                    <button
                      onClick={() => setToolEditMode(true)}
                      title="Edit paths"
                      className="w-[26px] h-[26px] absolute right-0 top-0 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-hover-bg transition-colors"
                      style={{
                        opacity: toolEditMode ? 0 : 1,
                        transform: toolEditMode ? 'translateX(4px)' : 'translateX(0)',
                        transition: 'opacity 0.15s ease, transform 0.15s ease',
                        pointerEvents: toolEditMode ? 'none' : undefined,
                      }}
                    >
                      <IconPencil stroke={1.9} className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* 4-column card grid */}
                {(() => {
                  const globalPaths: Record<string, string> = JSON.parse(localStorage.getItem('softwarePaths') || '{}');
                  const projectPaths: Record<string, string> = JSON.parse(localStorage.getItem(`projectSoftwarePaths_${project.id}`) || '{}');

                  return (
                    <div className="grid grid-cols-4 gap-2">
                      {SOFTWARE_OPTIONS.map((sw) => {
                        const key = normalizeSoftwareName(sw);
                        const effective = projectPaths[key] ?? globalPaths[key] ?? '';
                        const isEdited = !!projectPaths[key] && projectPaths[key] !== (globalPaths[key] ?? '');
                        // Shot-based projects use compose-only software (DaVinci Resolve) in Compose: can't be toggled
                        // here, "selected" follows the Compose choice, its project path is still editable
                        const composeOnly = isComposeOnlySoftware(key, !!(latestProject.hasShots || latestProject.hasScenes));
                        const isSelected = composeOnly
                          ? (latestProject.composeSoftware || []).includes(key)
                          : latestProject.software.some((pSw: any) => {
                              const existingKey = normalizeSoftwareName(pSw.name);
                              return existingKey === key;
                            });

                        return (
                          <div
                            key={sw}
                            onClick={() => {
                              if (toolEditMode && isSelected) {
                                openToolEditor(key);
                              } else if (!composeOnly) {
                                handleToggleSoftware(sw);
                              }
                            }}
                            title={composeOnly && !toolEditMode
                              ? `In shot-based projects ${sw} runs in Compose — right-click Compose → Change Compose Software…`
                              : effective || sw}
                            className={`relative flex items-center gap-[9px] h-[42px] px-[11px] rounded-lg ${composeOnly && !(toolEditMode && isSelected) ? 'cursor-not-allowed' : 'cursor-pointer'} bg-card-bg border ${isSelected ? 'border-border-secondary' : 'border-border-secondary/50'} hover:border-border-hover transition-colors`}
                          >
                            <span style={{ opacity: isSelected ? 1 : 0.35 }} className="flex-none">
                              <SoftwareIcon name={sw} className="w-[22px] h-[22px]" />
                            </span>
                            <span
                              className="text-xs font-semibold whitespace-nowrap overflow-hidden text-ellipsis"
                              style={{ color: isSelected ? '#ededf2' : '#6b6b75' }}
                            >
                              {sw}
                            </span>
                            <div className="flex-1" />
                            {isSelected && isEdited && (
                              <span className="flex items-center gap-1.5 flex-none">
                                <span className="w-[7px] h-[7px] rounded-full bg-green-400 flex-none" />
                                <span className="text-[10px] font-mono font-semibold tracking-wide text-text-muted">edited</span>
                              </span>
                            )}
                            {isSelected && !isEdited && (
                              <span className="w-[7px] h-[7px] rounded-full bg-green-400 flex-none" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Path editor — animates open/close */}
                {(toolEditorOpen || toolEditorClosing) && (() => {
                  const selDef = SOFTWARE_OPTIONS.find(sw => (normalizeSoftwareName(sw)) === selectedToolKey);
                  const globalPaths: Record<string, string> = JSON.parse(localStorage.getItem('softwarePaths') || '{}');
                  const projectPaths: Record<string, string> = JSON.parse(localStorage.getItem(`projectSoftwarePaths_${project.id}`) || '{}');
                  const globalPath = globalPaths[selectedToolKey] ?? '';
                  const isDirty = toolWorkingPath !== (projectPaths[selectedToolKey] ?? globalPath);

                  return (
                    <div
                      className="overflow-hidden pt-2"
                      style={{
                        animation: toolEditorOpen
                          ? 'toolsExpand .26s cubic-bezier(.33,1,.68,1) both'
                          : 'toolsCollapse .26s cubic-bezier(.33,1,.68,1) both',
                        pointerEvents: toolEditorClosing ? 'none' : undefined,
                      }}
                    >
                      <div className="bg-sidebar-bg border border-border-secondary rounded-lg p-3 flex flex-col gap-2.5">
                        {/* Tool name + status */}
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold tracking-wider font-mono text-text-secondary">
                            {selDef?.toUpperCase() ?? selectedToolKey.toUpperCase()}
                          </span>
                          <div className="flex-1" />
                          {toolSavedFlash && (
                            <span className="text-[11px] text-green-400 font-medium">Saved</span>
                          )}
                          {!toolSavedFlash && isDirty && (
                            <span className="text-[11px] text-text-muted">Unsaved change</span>
                          )}
                          {!toolSavedFlash && !isDirty && toolWorkingPath && (
                            <span className="text-[11px] text-text-muted">Path set</span>
                          )}
                          {!toolSavedFlash && !isDirty && !toolWorkingPath && (
                            <span className="text-[11px] text-text-muted">No path</span>
                          )}
                        </div>

                        {/* Path input */}
                        <div className="flex gap-2 items-center">
                          <input
                            key={selectedToolKey}
                            type="text"
                            value={toolWorkingPath}
                            onChange={(e) => { setToolWorkingPath(e.target.value); setToolSavedFlash(false); }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveToolPath();
                              if (e.key === 'Escape') closeToolEditor();
                            }}
                            placeholder="Path to executable..."
                            autoFocus
                            className="flex-1 bg-card-bg border border-border-primary rounded px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-border-secondary"
                          />
                          <button
                            onClick={browseToolPath}
                            className="px-2.5 py-1.5 bg-card-bg border border-border-primary hover:bg-hover-bg rounded-button text-xs transition-colors whitespace-nowrap"
                          >
                            Browse
                          </button>
                          <button
                            onClick={saveToolPath}
                            className="px-2.5 py-1.5 bg-accent hover:bg-accent-hover rounded-button text-xs font-bold text-white transition-colors"
                          >
                            Save
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-text-muted flex items-center gap-1">
                            <IconInfoCircle stroke={1.5} className="w-3.5 h-3.5 flex-none" />
                            Set a custom path if this project needs a different version of the app.
                          </span>
                          <div className="flex-1" />
                          <button
                            onClick={resetToolToDefault}
                            className="text-[11px] text-text-muted hover:text-text-primary transition-colors flex-none"
                          >
                            Reset to default
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
              </div>
            </SimpleBar>

            {/* Footer */}
            <div className="border-t border-border-secondary px-4 py-4 flex justify-between items-center gap-3 flex-shrink-0">
              {/* Delete button on the left */}
              <button
                onClick={() => {
                  // Show custom confirmation dialog on top of settings modal
                  onDeleteProject(project);
                }}
                className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <IconTrash stroke={1.5} className="w-4 h-4" />
                Delete Project
              </button>

              {/* Close and Save buttons on the right */}
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowProjectSettings(false); setToolEditMode(false); if (toolEditorOpen) closeToolEditor(); }}
                  className="px-4 py-2 bg-sidebar-bg hover:bg-hover-bg border border-border-primary rounded-button transition-colors text-sm"
                >
                  Close
                </button>
                <button
                  onClick={() => { setShowProjectSettings(false); setToolEditMode(false); if (toolEditorOpen) closeToolEditor(); }}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover rounded-button transition-colors font-medium text-sm text-white"
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
            className="bg-card-bg border border-border-primary rounded-card p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">Delete Shot</h3>
            <p className="text-text-muted mb-6">
              Are you sure you want to delete "{shotToDelete.name}" and its version files? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShotToDelete(null)}
                className="px-4 py-2 bg-sidebar-bg hover:bg-hover-bg border border-border-primary rounded-button transition-colors"
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
            className="bg-card-bg border border-red-700 rounded-card p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">Remove {softwareToRemove}?</h3>
            <div className="text-text-muted mb-6">
              <p className="mb-3">
                This will permanently remove <span className="font-medium text-text-primary">{softwareToRemove}</span> from this project.
              </p>
              <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-lg p-3">
                <p className="text-sm text-yellow-200/90">
                  <strong>Warning:</strong> Removing software will delete its folder and all contents from the project directory. This action cannot be undone.
                </p>
                {(normalizeSoftwareName(softwareToRemove)) === 'unreal' && (
                  <p className="text-sm text-red-400 mt-2">
                    The Unreal Engine project (UnrealEngine/_Project) with all levels and assets will be deleted too.
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setSoftwareToRemove(null)}
                className="px-4 py-2 bg-sidebar-bg hover:bg-hover-bg border border-border-primary rounded-button transition-colors"
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

      {/* Asset Stats Bar — shown when in project-level asset context */}
      {context.isSpecialContext && context.specialContextType === 'asset' && !context.specialContextSceneId && assetStats && (
        <div className="absolute bottom-0 left-0 right-0 pointer-events-none z-50">
          <div className="pointer-events-auto relative z-10 px-7 pb-3">
            <div className="bg-card-bg border border-border-primary rounded-button px-6 py-2">
              <div className="flex gap-6 items-center text-xs">
                <div><span className="text-text-muted">Assets:</span>{' '}<span className="text-text-primary font-medium">{assetStats.totalAssets}</span></div>
                <div><span className="text-text-muted">Versions:</span>{' '}<span className="text-text-primary font-medium">{assetStats.totalVersions}</span></div>
                <div><span className="text-text-muted">Software:</span>{' '}<span className="text-text-primary font-medium">{assetStats.softwareCount}</span></div>
                {assetStats.lastModified != null && (
                  <div><span className="text-text-muted">Updated:</span>{' '}<span className="text-text-primary font-medium">{fmtAssetDate(assetStats.lastModified)}</span></div>
                )}
              </div>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none z-0" style={{
            background: 'linear-gradient(to bottom, transparent 0%, rgba(10, 10, 10, 0.15) 20%, rgba(10, 10, 10, 0.4) 40%, rgba(10, 10, 10, 0.7) 60%, rgba(10, 10, 10, 0.9) 80%, #0a0a0a 100%)'
          }} />
        </div>
      )}

      {/* Project Info Bar */}
      {timeTrackingEnabled && !(context.isSpecialContext && context.specialContextType === 'asset' && !context.specialContextSceneId) && (
        <div className="absolute bottom-0 left-0 right-0 pointer-events-none z-50">
          <div className="pointer-events-auto relative z-10">
            <TimeInfoBar project={latestProject} />
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none z-0" style={{
            background: 'linear-gradient(to bottom, transparent 0%, rgba(10, 10, 10, 0.15) 20%, rgba(10, 10, 10, 0.4) 40%, rgba(10, 10, 10, 0.7) 60%, rgba(10, 10, 10, 0.9) 80%, #0a0a0a 100%)'
          }}></div>
        </div>
      )}

      {/* Context Menu for Software Launch */}
      <ContextMenu
        isOpen={isContextMenuOpen}
        position={contextMenuPosition}
        onClose={closeContextMenu}
        menuId="software-launcher"
      >
        <ContextMenuItem
          icon={<IconPlayerPlay className="w-4 h-4" stroke={1.5} />}
          onClick={() => {
            if (!contextMenuData) return;
            const latestProject = useProjectStore.getState().projects.find(p => p.id === project.id);
            if (!latestProject) return;

            const currentScene = latestProject.hasShots && latestProject.currentSceneId
              ? latestProject.scenes?.find((s: any) => s.id === latestProject.currentSceneId)
              : null;

            const currentShot = latestProject.hasShots && latestProject.currentShotId
              ? latestProject.shots?.find((s: any) => s.id === latestProject.currentShotId)
              : null;

            onLaunchSoftware({
              ...contextMenuData.software,
              executablePath: contextMenuData.executablePath,
              sceneNumber: currentScene?.number,
              shotNumber: currentShot?.number
            });
            closeContextMenu();
          }}
        >
          Launch
        </ContextMenuItem>
        <ContextMenuItem
          icon={<IconAppWindow className="w-4 h-4" stroke={1.5} />}
          onClick={() => {
            if (!contextMenuData) return;
            if (onLaunchSoftwareWithoutProject) {
              const softwareKey = normalizeSoftwareName(contextMenuData.software.name);
              onLaunchSoftwareWithoutProject(contextMenuData.executablePath, softwareKey);
            }
            closeContextMenu();
          }}
        >
          Launch Without Project
        </ContextMenuItem>
      </ContextMenu>
    </div>
  );
}
