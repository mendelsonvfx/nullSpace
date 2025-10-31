import { useState, useEffect } from 'react';
import { X, Settings, Star, FolderOpen, CreditCard, Loader2, Check, Pencil, Clock, Plus, Trash2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api';
import { useProjectStore } from '../../store/projectStore';
import { LinkItem, LinkInputForm, NotesSection } from '../shared';
import { VersionsOverview } from './VersionsOverview';
import { OutputOverview } from './OutputOverview';
import { SoftwareIcon } from '../SoftwareIcon';
import { STATUS_LABELS } from '../../utils';
import { versionsCache } from '../../utils/versionsCache';
import { InlineTimer, TimeInfoBar } from '../time';
import { ManualTimeEntryModal } from '../modals/ManualTimeEntryModal';
import { useTimeTrackingFeature } from '../../hooks/useTimeTrackingFeature';
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
}

export function ProjectDetails({ project, launchingStatus, onClose, onOpenFolder, onLaunchSoftware, onDeleteProject }: ProjectDetailsProps) {
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showManualTimeEntry, setShowManualTimeEntry] = useState(false);
  const [isPaymentModalAnimating, setIsPaymentModalAnimating] = useState(false);
  const [isShotEditMode, setIsShotEditMode] = useState(false);
  const [isFavoriteAnimating, setIsFavoriteAnimating] = useState(false);
  const [shotToDelete, setShotToDelete] = useState<{ id: string; name: string } | null>(null);
  const [editingShotId, setEditingShotId] = useState<string | null>(null);
  const [editingShotNumber, setEditingShotNumber] = useState('');

  // Animation effect for Payment Modal
  useEffect(() => {
    if (showPaymentModal) {
      setTimeout(() => setIsPaymentModalAnimating(true), 10);
    } else {
      setIsPaymentModalAnimating(false);
    }
  }, [showPaymentModal]);

  // Track which date fields user has manually filled in Project Settings
  const [deadlineFieldsFilled, setDeadlineFieldsFilled] = useState({
    day: false,
    month: false,
    year: false
  });

  // Get fresh project from store for real-time timer updates
  const latestProject = useProjectStore(state => state.projects.find(p => p.id === project.id) || project);
  const timeTrackingEnabled = useTimeTrackingFeature();

  // Load cached thumbnail for Project Settings modal
  const thumbnailSrc = useThumbnail(project.path, project.thumbnail);

  // Modal blur effect
  const blurClass = useModalBlur();

  // Widget visibility is now handled by timeTrackingStore (after 1.5s delay)

  // Get current context (todos, notes, links, browserTabs) based on shot selection
  const getCurrentContext = () => {
    if (project.hasShots && project.currentShotId) {
      const currentShot = project.shots?.find((s: any) => s.id === project.currentShotId);
      if (currentShot) {
        return {
          todos: currentShot.todos || [],
          notes: currentShot.notes || [],
          links: currentShot.links || [],
          browserTabs: currentShot.browserTabs || [],
          isShot: true,
          shotId: currentShot.id
        };
      }
    }
    return {
      todos: project.todos || [],
      notes: project.notes || [],
      links: project.links || [],
      browserTabs: project.browserTabs || [],
      isShot: false,
      shotId: null
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

  return (
    <div
      className="flex-1 flex flex-col h-screen overflow-hidden min-w-0 animate-mode-switch focus:outline-none"
      onPaste={handlePaste}
      tabIndex={-1}
    >
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-5 flex items-center justify-between flex-shrink-0">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-2xl font-semibold">{project.name}</h2>
            <span className="text-xs text-zinc-500 font-normal">
              {STATUS_LABELS[project.status as keyof typeof STATUS_LABELS]}
            </span>
            <div className="flex gap-2 flex-wrap items-center ml-2">
              {project.tags.map((tag: string) => (
                <span
                  key={tag}
                  onClick={() => {
                    const { removeTag } = useProjectStore.getState();
                    removeTag(project.id, tag);
                  }}
                  className="px-2 py-0.5 bg-zinc-800 rounded text-xs cursor-pointer hover:bg-red-600 hover:line-through transition-all"
                  title="Click to remove"
                >
                  {tag}
                </span>
              ))}
              <input
                type="text"
                placeholder="+ Add tag..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                    const { addTag } = useProjectStore.getState();
                    addTag(project.id, e.currentTarget.value.trim());
                    e.currentTarget.value = '';
                  }
                }}
                onBlur={(e) => {
                  if (e.currentTarget.value.trim()) {
                    const { addTag } = useProjectStore.getState();
                    addTag(project.id, e.currentTarget.value.trim());
                    e.currentTarget.value = '';
                  }
                }}
                className="px-2 py-0.5 bg-transparent border border-zinc-700 border-dashed rounded text-xs text-zinc-300 placeholder-zinc-500 focus:outline-none focus:border-accent focus:border-solid w-24"
              />
            </div>
          </div>
          <p className="text-zinc-400 text-sm mb-2">{project.description}</p>
          {project.hasShots === true && (
            <div className="flex gap-2 flex-wrap items-center">
              {(project.shots || []).map((shot: any) => (
                <div
                  key={shot.id}
                  onClick={() => {
                    if (!isShotEditMode) {
                      const { setCurrentShot } = useProjectStore.getState();
                      setCurrentShot(project.id, shot.id);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    const { toggleShotCompleted } = useProjectStore.getState();
                    toggleShotCompleted(project.id, shot.id);
                  }}
                  className={`group relative flex items-center rounded overflow-hidden cursor-pointer transition-all hover:brightness-110 ${
                    project.currentShotId === shot.id
                      ? 'bg-accent text-white'
                      : 'bg-zinc-800 text-zinc-300'
                  }`}
                >
                  <div
                    className={`py-1 pl-3 text-sm font-medium flex items-center gap-1 transition-all ${shot.completed ? 'pr-1' : 'pr-3'}`}
                  >
                    {shot.name !== 'Main' && <span>Shot</span>}
                    {isShotEditMode && editingShotId === shot.id && shot.name !== 'Main' ? (
                      <input
                        type="text"
                        value={editingShotNumber}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Only allow digits and max 3 characters
                          if (/^\d{0,3}$/.test(value)) {
                            setEditingShotNumber(value);
                          }
                        }}
                        onBlur={async () => {
                          const shotNum = parseInt(editingShotNumber);
                          if (editingShotNumber.length === 3 && shotNum >= 1 && shotNum <= 999) {
                            const newShotName = `Shot ${editingShotNumber}`;

                            // Check if trying to change shot number
                            const currentShotMatch = shot.name.match(/\d{3}/);
                            const currentShotNumber = currentShotMatch ? parseInt(currentShotMatch[0]) : null;

                            if (currentShotNumber && currentShotNumber !== shotNum) {
                              // Shot number is being changed
                              try {
                                // Check if target shot number already exists
                                const versions = await invoke<any[]>('get_project_versions', {
                                  projectPath: project.path
                                });

                                const targetShotExists = versions.some(v => {
                                  const match = v.name.match(/_Shot(\d{3})/);
                                  return match && match[1] === editingShotNumber;
                                });

                                if (targetShotExists) {
                                  alert(`Shot ${editingShotNumber} already has files in the project. Choose a different number.`);
                                  setEditingShotId(null);
                                  setEditingShotNumber('');
                                  return;
                                }

                                // Check if current shot has files and if they are accessible
                                const currentShotFiles = versions.filter(v => {
                                  const match = v.name.match(/_Shot(\d{3})/);
                                  return match && parseInt(match[1]) === currentShotNumber;
                                });

                                if (currentShotFiles.length > 0) {
                                  // Check if files are accessible (not locked)
                                  const accessible = await invoke<boolean>('check_shot_files_accessible', {
                                    projectPath: project.path,
                                    shotNumber: currentShotNumber
                                  });

                                  if (!accessible) {
                                    alert(`Cannot rename shot ${currentShotMatch[0]} because some files are currently in use. Please close the files and try again.`);
                                    setEditingShotId(null);
                                    setEditingShotNumber('');
                                    return;
                                  }

                                  // Rename files
                                  const renamedCount = await invoke<number>('rename_shot_files', {
                                    projectPath: project.path,
                                    oldShotNumber: currentShotNumber,
                                    newShotNumber: shotNum
                                  });

                                  console.log(`Renamed ${renamedCount} files for shot ${currentShotNumber} -> ${shotNum}`);

                                  // Invalidate versions cache and trigger reload
                                  versionsCache.invalidate(project.path);

                                  // Wait a bit for file system to sync, then trigger version update event
                                  setTimeout(() => {
                                    window.dispatchEvent(new CustomEvent('version-created', {
                                      detail: { projectPath: project.path }
                                    }));
                                  }, 100);
                                }

                                // Rename shot in metadata
                                const { renameShot } = useProjectStore.getState();
                                renameShot(project.id, shot.id, newShotName);
                              } catch (error) {
                                console.error('Failed to rename shot:', error);
                                alert(`Failed to rename shot: ${error}`);
                              }
                            } else {
                              // No number change, just update name
                              const { renameShot } = useProjectStore.getState();
                              renameShot(project.id, shot.id, newShotName);
                            }
                          }
                          setEditingShotId(null);
                          setEditingShotNumber('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.currentTarget.blur();
                          } else if (e.key === 'Escape') {
                            setEditingShotId(null);
                            setEditingShotNumber('');
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                        className="w-12 px-1 py-0 text-sm font-medium bg-zinc-700 rounded text-center focus:outline-none focus:ring-1 focus:ring-accent"
                        placeholder="001"
                      />
                    ) : (
                      <span
                        onClick={(e) => {
                          if (isShotEditMode && shot.name !== 'Main') {
                            e.stopPropagation();
                            // Extract number from shot name (e.g., "Shot 001" -> "001")
                            const match = shot.name.match(/\d{3}/);
                            if (match) {
                              setEditingShotId(shot.id);
                              setEditingShotNumber(match[0]);
                            }
                          }
                        }}
                        className={isShotEditMode && shot.name !== 'Main' ? 'text-zinc-400 cursor-pointer hover:text-zinc-300 underline' : ''}
                      >
                        {shot.name.replace('Shot ', '')}
                      </span>
                    )}
                  </div>
                  <div className={`transition-all duration-200 ease-in-out overflow-hidden flex items-center ${shot.completed ? 'w-7 opacity-100' : 'w-0 opacity-0'}`}>
                    <Check className="w-4 h-4 text-green-500 mx-auto" />
                  </div>
                  <div className={`transition-all duration-200 ease-in-out overflow-hidden ${isShotEditMode && shot.name !== 'Main' ? 'w-5 opacity-100' : 'w-0 opacity-0'}`}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShotToDelete({ id: shot.id, name: shot.name });
                      }}
                      className="pl-0 pr-2 py-1"
                      title="Delete shot"
                    >
                      <X className="w-3 h-3 close-button-red" />
                    </button>
                  </div>
                </div>
              ))}
              <button
                onClick={() => {
                  const { addShot } = useProjectStore.getState();
                  addShot(project.id);
                }}
                className="px-3 py-1 bg-transparent border border-zinc-700 border-dashed rounded text-sm text-zinc-400 hover:border-accent hover:text-accent transition-all"
              >
                + Add shot...
              </button>
              <button
                onClick={() => setIsShotEditMode(!isShotEditMode)}
                className={`p-1 transition-colors relative z-10 ${
                  isShotEditMode ? 'text-accent' : 'text-zinc-400 hover:text-accent'
                }`}
                title={isShotEditMode ? 'Done editing' : 'Edit shots'}
              >
                <Pencil className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const { toggleFavorite } = useProjectStore.getState();
              toggleFavorite(project.id);

              // Trigger animation
              setIsFavoriteAnimating(true);
              setTimeout(() => {
                setIsFavoriteAnimating(false);
              }, 500);
            }}
            className={`group p-2 hover:bg-zinc-800 rounded-lg transition-colors ${
              project.isFavorite ? 'text-yellow-400' : 'text-zinc-400'
            }`}
            title={project.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Star className={`w-5 h-5 transition-all ${project.isFavorite ? 'text-yellow-400 fill-yellow-400' : 'text-zinc-300 group-hover:fill-zinc-600'} ${isFavoriteAnimating ? 'animate-favorite-star-bounce' : ''}`} />
          </button>
          <button
            onClick={() => setShowProjectSettings(true)}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
            title="Project Settings"
          >
            <Settings className="w-5 h-5 animate-settings-icon" />
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 close-button-red" />
          </button>
        </div>
      </div>

      {/* Content */}
      <SimpleBar className="flex-1 custom-page-scrollbar" autoHide={false}>
        <div className="p-6">
        {/* Quick Actions */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-3">Quick Actions</h3>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={onOpenFolder}
              className="relative px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg flex items-center gap-2 transition-colors cursor-pointer"
            >
              <FolderOpen className="w-4 h-4 pointer-events-none" />
              <span className="pointer-events-none">Open Folder</span>
            </button>
            <button
              onClick={() => setShowPaymentModal(true)}
              className="relative px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg flex items-center gap-2 transition-colors cursor-pointer"
            >
              <CreditCard className="w-4 h-4 pointer-events-none" />
              <span className="pointer-events-none">Payment</span>
            </button>
            {timeTrackingEnabled && (
              <button
                onClick={() => setShowManualTimeEntry(true)}
                className="relative px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Clock className="w-4 h-4 pointer-events-none" />
                <span className="pointer-events-none">Add Time</span>
              </button>
            )}
          </div>
        </div>

        {/* Software Launchers */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-3">Launch Software</h3>
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
              const activeEntry = latestProject.timeEntries?.find((e: any) =>
                e.isActive && e.widgetVisible && e.software === softwareKey
              );

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

                    const currentShot = project.hasShots && project.currentShotId
                      ? project.shots?.find((s: any) => s.id === project.currentShotId)
                      : null;

                    onLaunchSoftware({
                      ...sw,
                      executablePath,
                      shotNumber: currentShot?.number
                    });
                  }}
                  disabled={status === 'launching'}
                  data-launch-software
                  className="p-4 border border-zinc-800 rounded-lg flex items-center gap-3 transition-all duration-200 group select-none disabled:opacity-60 disabled:cursor-not-allowed relative overflow-hidden"
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
                      {status === 'launching' ? 'Launching...' : status === 'success' ? 'Launched!' : activeEntry ? 'Running...' : executablePath ? 'Click to launch' : 'Path not configured'}
                    </div>
                  </div>

                  {/* Inline Timer */}
                  {timeTrackingEnabled && activeEntry && <InlineTimer activeEntry={activeEntry} />}

                  {/* Status indicator */}
                  {!activeEntry && status === 'launching' && (
                    <Loader2 className="w-5 h-5 text-accent animate-spin" />
                  )}
                  {!activeEntry && status === 'success' && (
                    <Check className="w-5 h-5 text-green-500 animate-in fade-in zoom-in duration-300" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Versions Overview */}
        <VersionsOverview project={project} currentShot={context.isShot && context.shotId ? project.shots?.find((s: any) => s.id === context.shotId) : null} />

        {/* Output Overview */}
        <OutputOverview project={project} currentShot={context.isShot && context.shotId ? project.shots?.find((s: any) => s.id === context.shotId) : null} />

        {/* Links Section */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-3">Links</h3>
          <div className="space-y-2">
            {context.links.map((link: any) => (
              <LinkItem key={link.id} link={link} projectId={project.id} shotId={context.shotId} />
            ))}
            <LinkInputForm projectId={project.id} shotId={context.shotId} />
          </div>
        </div>

        {/* Todo Section */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-3">Tasks</h3>
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
                    <div className="h-px bg-zinc-700 flex-1" />
                    <span className="text-xs text-zinc-500 font-medium">{date}</span>
                    <div className="h-px bg-zinc-700 flex-1" />
                  </div>
                  {/* Tasks for this date */}
                  {todos.map((todo: any) => (
                    <div key={todo.id} className="flex items-center gap-2 group">
                      <button
                        onClick={() => {
                          if (context.isShot && context.shotId) {
                            const { toggleShotTodo } = useProjectStore.getState();
                            toggleShotTodo(project.id, context.shotId, todo.id);
                          } else {
                            const { toggleTodo } = useProjectStore.getState();
                            toggleTodo(project.id, todo.id);
                          }
                        }}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                          todo.completed
                            ? 'bg-accent border-accent'
                            : 'border-zinc-600 hover:border-accent'
                        }`}
                      >
                        {todo.completed && <Check className="w-3 h-3 text-white" />}
                      </button>
                      <span
                        className={`flex-1 text-sm ${
                          todo.completed ? 'line-through text-zinc-500' : 'text-zinc-300'
                        }`}
                      >
                        {todo.text}
                      </span>
                      <button
                        onClick={() => {
                          if (context.isShot && context.shotId) {
                            const { removeShotTodo } = useProjectStore.getState();
                            removeShotTodo(project.id, context.shotId, todo.id);
                          } else {
                            const { removeTodo } = useProjectStore.getState();
                            removeTodo(project.id, todo.id);
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-800 rounded transition-opacity"
                      >
                        <X className="w-3 h-3 close-button-red" />
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
                  } else {
                    const { addTodo } = useProjectStore.getState();
                    addTodo(project.id, e.currentTarget.value.trim());
                  }
                  e.currentTarget.value = '';
                }
              }}
              className="w-full px-3 py-2 bg-transparent border border-zinc-700 border-dashed rounded-lg text-sm text-zinc-300 placeholder-zinc-500 focus:outline-none focus:border-accent focus:border-solid"
            />
          </div>
        </div>

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
                <X className="w-5 h-5 text-zinc-400" />
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
                <X className="w-5 h-5 close-button-red" />
              </button>
            </div>

            <SimpleBar className="flex-1 custom-scrollbar" autoHide={false} style={{ maxHeight: '100%' }}>
              <div className="p-4 space-y-2.5">
              <div>
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
                        <X className="w-3 h-3" />
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
                      <Plus className="w-5 h-5" />
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

              <div className="border-t border-zinc-800 pt-4">
                <div className="mb-3">
                  <div className="font-medium mb-1 text-red-400">Delete Project</div>
                  <p className="text-sm text-zinc-400">
                    Permanently delete this project and all its data. This action cannot be undone.
                  </p>
                </div>
                <button
                  onClick={() => {
                    // Show custom confirmation dialog on top of settings modal
                    onDeleteProject(project);
                  }}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Project
                </button>
              </div>
              </div>
            </SimpleBar>

            {/* Footer */}
            <div className="border-t border-zinc-800 px-4 py-4 flex justify-end gap-3 flex-shrink-0">
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
      {timeTrackingEnabled && <TimeInfoBar project={latestProject} />}
    </div>
  );
}
