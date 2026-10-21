import { useState, useEffect } from 'react';
import { X, Plus, AlertCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';
import { selectProjectDirectory } from '../../utils/tauri';
import { useProjectStore } from '../../store/projectStore';
import { SoftwareIcon } from '../SoftwareIcon';
import { generateBrightColor, SOFTWARE_OPTIONS, isComposeOnlySoftware } from '../../utils';
import { normalizeSoftwareName } from '../../features/time-tracking/utils/softwareUtils';
import { useModalBlur } from '../../hooks/useModalBlur';
import { useProjectNameInput } from '../../hooks/useProjectNameInput';
import { PROJECT_NAME_HINT } from '../../utils/fileNaming';
import SimpleBar from 'simplebar-react';
import { CustomSelect } from '../ui/CustomSelect';
import { CollapsibleHint } from '../ui/CollapsibleHint';

interface CreateProjectModalProps {
  onClose: () => void;
  onCreate: (projectData: any) => Promise<void>;
  onProjectCreated?: (projectId: string) => void;
}

export function CreateProjectModal({ onClose, onCreate, onProjectCreated }: CreateProjectModalProps) {
  const blurClass = useModalBlur();
  const nameInput = useProjectNameInput();
  const { defaultProjectsPath, clients, addClient, selectedCategory } = useProjectStore();
  const [useDefaultPath, setUseDefaultPath] = useState(true);
  const [newClientName, setNewClientName] = useState('');
  const [thumbnailPreview, setThumbnailPreview] = useState<string>('');

  // Get base currency from settings
  const baseCurrency = (localStorage.getItem('baseCurrency') || 'USD') as 'USD' | 'RUB' | 'EUR';

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    path: defaultProjectsPath,
    software: [] as string[],
    tags: [] as string[],
    deadline: '',
    cost: '',
    currency: baseCurrency,
    paymentStatus: 'unpaid' as 'paid' | 'prepaid' | 'unpaid',
    prepaymentAmount: '',
    clientId: '',
    thumbnailPath: '',
    shotBased: false,
    category: selectedCategory
  });

  // Track which date fields user has manually filled
  const [deadlineFieldsFilled, setDeadlineFieldsFilled] = useState({
    day: false,
    month: false,
    year: false
  });

  useEffect(() => {
    if (useDefaultPath && formData.name) {
      const projectName = formData.name.replace(/\s+/g, '');
      // Path now includes category folder
      setFormData(prev => ({
        ...prev,
        path: `${defaultProjectsPath}\\${selectedCategory}\\${projectName}`
      }));
    }
  }, [useDefaultPath, formData.name, defaultProjectsPath, selectedCategory]);

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile();
          if (blob) {
            try {
              // Convert blob to array buffer
              const arrayBuffer = await blob.arrayBuffer();
              const uint8Array = new Uint8Array(arrayBuffer);

              // Create data URL for preview
              const base64 = btoa(
                uint8Array.reduce((data, byte) => data + String.fromCharCode(byte), '')
              );
              const dataUrl = `data:${blob.type};base64,${base64}`;
              setThumbnailPreview(dataUrl);

              // Save to temp file using Tauri
              const { writeBinaryFile, BaseDirectory } = await import('@tauri-apps/api/fs');
              const { appDataDir } = await import('@tauri-apps/api/path');
              const { createDir } = await import('@tauri-apps/api/fs');
              const appDir = await appDataDir();
              const tempFileName = `temp_thumbnail_${Date.now()}.png`;
              const tempPath = `${appDir}\\preview\\${tempFileName}`;

              try {
                await createDir('preview', { dir: BaseDirectory.AppData, recursive: true });
              } catch (e) {
                // Directory might already exist
              }

              // Write binary file
              await writeBinaryFile(`preview/${tempFileName}`, uint8Array, { dir: BaseDirectory.AppData });

              setFormData(prev => ({ ...prev, thumbnailPath: tempPath }));
              console.log('Image pasted from clipboard:', tempPath);
            } catch (error) {
              console.error('Failed to paste image:', error);
            }
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const toggleSoftware = (sw: string) => {
    setFormData(prev => ({
      ...prev,
      software: prev.software.includes(sw)
        ? prev.software.filter(s => s !== sw)
        : [...prev.software, sw]
    }));
  };

  const handleCreate = async () => {
    if (!formData.name.trim() || !formData.path) return;

    // If there's a new client name entered but not yet created, create it first
    let finalClientId = formData.clientId;
    if (newClientName.trim() && !formData.clientId) {
      const clientName = newClientName.trim();
      const newClientId = addClient({ name: clientName, color: generateBrightColor() });
      console.log('Auto-created new client with ID:', newClientId);
      finalClientId = newClientId;
    }

    // Auto-fill deadline if only day is entered
    let finalDeadline = formData.deadline;
    if (finalDeadline && deadlineFieldsFilled.day) {
      // If only day is entered (partial date), auto-fill with current month and year
      if (!deadlineFieldsFilled.month || !deadlineFieldsFilled.year) {
        const parts = finalDeadline.split('-');
        const now = new Date();
        const year = parts[0] || String(now.getFullYear());
        const month = parts[1] || String(now.getMonth() + 1).padStart(2, '0');
        const day = parts[2];

        finalDeadline = `${year}-${month}-${day.padStart(2, '0')}`;
      }
    }

    console.log('Creating project with formData:', formData);
    console.log('finalClientId value:', finalClientId);
    console.log('finalClientId type:', typeof finalClientId);

    const projectData = {
      ...formData,
      deadline: finalDeadline || undefined,
      cost: formData.cost ? parseFloat(formData.cost) : undefined,
      prepaymentAmount: formData.prepaymentAmount ? parseFloat(formData.prepaymentAmount) : undefined,
      paymentStatus: formData.paymentStatus || undefined,
      clientId: finalClientId || undefined,
      hasScenes: formData.shotBased,
      hasShots: formData.shotBased
    };
    console.log('Project data being sent:', projectData);
    console.log('projectData.clientId:', projectData.clientId);

    await onCreate(projectData);

    // Get the created project and select it
    const { projects, selectProject } = useProjectStore.getState();
    const createdProject = projects.find(p => p.path === formData.path);

    // If thumbnail was selected, set it after project creation
    if (formData.thumbnailPath && createdProject) {
      try {
        const thumbnailName = await invoke<string>('set_project_thumbnail', {
          projectPath: formData.path,
          imagePath: formData.thumbnailPath
        });
        console.log('Thumbnail set:', thumbnailName);

        // Clean up temp file if it was pasted from clipboard
        if (formData.thumbnailPath.includes('temp_thumbnail_')) {
          const { removeFile } = await import('@tauri-apps/api/fs');
          await removeFile(formData.thumbnailPath).catch(() => {}); // Ignore errors
        }

        // Update the project with the thumbnail immediately
        const { updateProject } = useProjectStore.getState();
        updateProject({ ...createdProject, thumbnail: thumbnailName });

        // Select the updated project
        selectProject({ ...createdProject, thumbnail: thumbnailName });
        onProjectCreated?.(createdProject.id);
      } catch (error) {
        console.error('Failed to set thumbnail:', error);
        // Still select the project even if thumbnail fails
        selectProject(createdProject);
        onProjectCreated?.(createdProject.id);
      }
    } else if (createdProject) {
      // Select the project if no thumbnail
      selectProject(createdProject);
      onProjectCreated?.(createdProject.id);
    }

    onClose();
  };

  const handleBrowse = async () => {
    console.log('Browse clicked');
    const selected = await selectProjectDirectory();
    console.log('Selected:', selected);
    if (selected) {
      setFormData(prev => ({ ...prev, path: selected }));
      setUseDefaultPath(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 rounded-lg ${blurClass}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          (e.currentTarget as HTMLDivElement).dataset.mousedownTarget = 'backdrop';
        }
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && (e.currentTarget as HTMLDivElement).dataset.mousedownTarget === 'backdrop') {
          onClose();
        }
        delete (e.currentTarget as HTMLDivElement).dataset.mousedownTarget;
      }}
    >
      <div className="bg-card-bg border border-border-secondary rounded-card max-w-2xl w-full max-h-[90vh] min-h-[520px] flex flex-col animate-modal" onClick={(e) => e.stopPropagation()} data-modal-window>
        <div className="p-4 border-b border-border-secondary flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-semibold">Create New Project</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center hover:bg-hover-bg rounded-badge transition-colors">
            <X className="w-5 h-5 close-button-red" />
          </button>
        </div>

        <SimpleBar className="flex-1 custom-scrollbar" autoHide={false} style={{ maxHeight: '100%' }}>
          <div className="p-4 space-y-2.5">
          <div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1.5">Project Name</label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.name}
                  onKeyDown={nameInput.onKeyDown}
                  onChange={(e) => {
                    const name = nameInput.sanitize(e.target.value);
                    setFormData(prev => ({ ...prev, name }));
                  }}
                  placeholder="My Awesome Project"
                  className={`w-full bg-sidebar-bg rounded-button px-3 py-2 pr-9 text-sm focus:outline-none transition-colors ${
                    nameInput.rejected
                      ? 'border border-red-500'
                      : 'border border-border-primary focus:border-accent'
                  }`}
                />
                {nameInput.rejected && (
                  <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 h-[38px] px-3">
              <span className="text-sm whitespace-nowrap">Shot-based</span>
              <button
                type="button"
                onClick={() => setFormData(prev => {
                  const shotBased = !prev.shotBased;
                  // Shot-based projects use compose-only software (DaVinci Resolve) in Compose: drop it from the selection
                  return {
                    ...prev,
                    shotBased,
                    software: prev.software.filter(sw => !isComposeOnlySoftware(normalizeSoftwareName(sw), shotBased)),
                  };
                })}
                className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${
                  formData.shotBased ? 'bg-accent' : 'bg-border-secondary'
                }`}
              >
                <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${
                  formData.shotBased ? 'translate-x-[18px]' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
          </div>
          <CollapsibleHint show={nameInput.rejected}>{PROJECT_NAME_HINT}</CollapsibleHint>
          </div>

          <div className="flex gap-3 items-start">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1.5">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of your project..."
                rows={2}
                className="w-full bg-sidebar-bg border border-border-primary rounded-button px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none h-[60px]"
              />
            </div>
            <div className="w-32">
              <label className="block text-sm font-medium mb-1.5">Thumbnail <span className="text-xs text-text-muted">(Ctrl+V)</span></label>
              {formData.thumbnailPath ? (
                <div className="relative h-[60px] rounded-button overflow-hidden border border-border-primary bg-sidebar-bg">
                  {thumbnailPreview && (
                    <img
                      src={thumbnailPreview}
                      alt="Thumbnail preview"
                      className="w-full h-full object-cover"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setFormData(prev => ({ ...prev, thumbnailPath: '' }));
                      setThumbnailPreview('');
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
                        // Read file and create data URL for preview
                        const { readBinaryFile } = await import('@tauri-apps/api/fs');
                        const fileData = await readBinaryFile(imagePath);

                        // Determine MIME type
                        const extension = imagePath.split('.').pop()?.toLowerCase();
                        const mimeTypes: Record<string, string> = {
                          'jpg': 'image/jpeg',
                          'jpeg': 'image/jpeg',
                          'png': 'image/png',
                          'gif': 'image/gif',
                          'webp': 'image/webp',
                          'bmp': 'image/bmp'
                        };
                        const mimeType = mimeTypes[extension || 'jpg'] || 'image/jpeg';

                        // Convert to base64
                        const base64 = btoa(
                          fileData.reduce((data, byte) => data + String.fromCharCode(byte), '')
                        );
                        const dataUrl = `data:${mimeType};base64,${base64}`;
                        setThumbnailPreview(dataUrl);

                        setFormData(prev => ({ ...prev, thumbnailPath: imagePath }));
                      } catch (error) {
                        console.error('Failed to load image:', error);
                      }
                    }
                  }}
                  className="h-[60px] w-full bg-sidebar-bg hover:bg-hover-bg rounded-button transition-colors text-sm border border-border-primary flex items-center justify-center"
                >
                  <Plus className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          <div className="border-t border-border-primary pt-2"></div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">Client</label>
              <CustomSelect
                value={formData.clientId}
                onChange={(v) => {
                  console.log('Select changed to:', v);
                  setFormData(prev => ({ ...prev, clientId: v }));
                }}
                options={[
                  { value: '', label: 'No client' },
                  ...clients.map(c => ({ value: c.id, label: c.name, color: c.color })),
                ]}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Or Add New</label>
              <input
                type="text"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Client name (Enter)"
                disabled={!!formData.clientId}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newClientName.trim()) {
                    e.preventDefault();
                    const clientName = newClientName.trim();

                    // Add client and get the generated ID
                    const newClientId = addClient({ name: clientName, color: generateBrightColor() });
                    console.log('Created new client with ID:', newClientId);

                    // Set the clientId immediately
                    setFormData(prev => {
                      console.log('Setting formData.clientId to:', newClientId);
                      const newData = { ...prev, clientId: newClientId };
                      console.log('New formData:', newData);
                      return newData;
                    });

                    setNewClientName('');
                    console.log('Clients after add:', useProjectStore.getState().clients);
                  }
                }}
                className="w-full bg-sidebar-bg border border-border-primary rounded-button px-3 py-2 text-sm focus:outline-none focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">Deadline</label>
              <div className="flex gap-2 items-center">
                <div className="relative w-14">
                <input
                  type="text"
                  placeholder="DD"
                  value={formData.deadline ? formData.deadline.split('-')[2] : ''}
                  onKeyDown={(e) => {
                  if (e.key >= '0' && e.key <= '9') {
                    e.preventDefault();
                    const parts = formData.deadline ? formData.deadline.split('-') : ['', '', ''];
                    const currentDay = parts[2] || '';

                    let newDay;
                    if (currentDay.length >= 2) {
                      // Shift: берем последнюю цифру и добавляем новую
                      newDay = currentDay.slice(-1) + e.key;
                    } else {
                      // Просто добавляем
                      newDay = currentDay + e.key;
                    }

                    const now = new Date();
                    const year = parts[0] || String(now.getFullYear());
                    const month = parts[1] || String(now.getMonth() + 1).padStart(2, '0');

                    // Получаем максимальное количество дней в выбранном месяце
                    const maxDays = new Date(parseInt(year), parseInt(month), 0).getDate();

                    let dayNum = parseInt(newDay);
                    // Если больше максимума для этого месяца, ставим максимум
                    if (dayNum > maxDays) {
                      dayNum = maxDays;
                      newDay = String(maxDays);
                    }
                    // Если меньше 1, ставим 01
                    if (dayNum < 1) {
                      dayNum = 1;
                      newDay = '01';
                    }

                    setFormData(prev => ({ ...prev, deadline: `${year}-${month}-${newDay.padStart(2, '0')}` }));
                    setDeadlineFieldsFilled(prev => ({ ...prev, day: true }));
                  } else if (e.key === 'Backspace') {
                    e.preventDefault();
                    setFormData(prev => ({ ...prev, deadline: '' }));
                    setDeadlineFieldsFilled({ day: false, month: false, year: false });
                  }
                }}
                onChange={() => {}}
                className="w-14 bg-sidebar-bg border border-border-primary rounded-button px-2 py-2 text-sm text-center focus:outline-none focus:border-accent"
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
                value={formData.deadline ? formData.deadline.split('-')[1] : ''}
                onKeyDown={(e) => {
                  if (e.key >= '0' && e.key <= '9') {
                    e.preventDefault();
                    const parts = formData.deadline ? formData.deadline.split('-') : ['', '', ''];
                    const currentMonth = parts[1] || '';

                    let newMonth;
                    if (currentMonth.length >= 2) {
                      // Shift: берем последнюю цифру и добавляем новую
                      newMonth = currentMonth.slice(-1) + e.key;
                    } else {
                      // Просто добавляем
                      newMonth = currentMonth + e.key;
                    }

                    let monthNum = parseInt(newMonth);
                    // Если больше 12, ставим 12
                    if (monthNum > 12) {
                      monthNum = 12;
                      newMonth = '12';
                    }
                    // Если меньше 1, ставим 01
                    if (monthNum < 1) {
                      monthNum = 1;
                      newMonth = '01';
                    }

                    const now = new Date();
                    const year = parts[0] || String(now.getFullYear());
                    let day = parts[2] || '01';

                    // Корректируем день, если он больше максимального для нового месяца
                    const maxDays = new Date(parseInt(year), parseInt(newMonth.padStart(2, '0')), 0).getDate();
                    const dayNum = parseInt(day);
                    if (dayNum > maxDays) {
                      day = String(maxDays).padStart(2, '0');
                    }

                    setFormData(prev => ({ ...prev, deadline: `${year}-${newMonth.padStart(2, '0')}-${day}` }));
                    setDeadlineFieldsFilled(prev => ({ ...prev, month: true }));
                  } else if (e.key === 'Backspace') {
                    e.preventDefault();
                    const parts = formData.deadline ? formData.deadline.split('-') : ['', '', ''];
                    if (parts[1]) {
                      const newMonth = parts[1].slice(0, -1);
                      if (newMonth && parts[0] && parts[2]) {
                        setFormData(prev => ({ ...prev, deadline: `${parts[0]}-${newMonth.padStart(2, '0')}-${parts[2]}` }));
                      } else {
                        setDeadlineFieldsFilled(prev => ({ ...prev, month: false }));
                      }
                    }
                  }
                }}
                onChange={() => {}}
                className="w-14 bg-sidebar-bg border border-border-primary rounded-button px-2 py-2 text-sm text-center focus:outline-none focus:border-accent"
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
                value={formData.deadline ? formData.deadline.split('-')[0].slice(-2) : ''}
                onKeyDown={(e) => {
                  if (e.key >= '0' && e.key <= '9') {
                    e.preventDefault();
                    const parts = formData.deadline ? formData.deadline.split('-') : ['', '', ''];
                    const currentYear = parts[0] ? parts[0].slice(-2) : '';

                    let newYear;
                    if (currentYear.length >= 2) {
                      // Shift: берем последнюю цифру и добавляем новую
                      newYear = currentYear.slice(-1) + e.key;
                    } else {
                      // Просто добавляем
                      newYear = currentYear + e.key;
                    }

                    const now = new Date();
                    const currentYearFull = now.getFullYear();
                    const maxYearFull = currentYearFull + 1;
                    const maxYearShort = String(maxYearFull).slice(-2);

                    let fullYear = '20' + newYear.padStart(2, '0');
                    let fullYearNum = parseInt(fullYear);

                    // Если год больше чем на 1 год позже текущего, ставим максимальный
                    if (fullYearNum > maxYearFull) {
                      fullYear = String(maxYearFull);
                      newYear = maxYearShort;
                    }

                    const month = parts[1] || String(now.getMonth() + 1).padStart(2, '0');
                    let day = parts[2] || '01';

                    // Корректируем день, если он больше максимального для выбранного месяца и года
                    const maxDays = new Date(parseInt(fullYear), parseInt(month), 0).getDate();
                    const dayNum = parseInt(day);
                    if (dayNum > maxDays) {
                      day = String(maxDays).padStart(2, '0');
                    }

                    setFormData(prev => ({ ...prev, deadline: `${fullYear}-${month}-${day}` }));
                    setDeadlineFieldsFilled(prev => ({ ...prev, year: true }));
                  } else if (e.key === 'Backspace') {
                    e.preventDefault();
                    const parts = formData.deadline ? formData.deadline.split('-') : ['', '', ''];
                    if (parts[0]) {
                      const currentYear = parts[0].slice(-2);
                      const newYear = currentYear.slice(0, -1);
                      if (newYear && parts[1] && parts[2]) {
                        const fullYear = '20' + newYear.padStart(2, '0');
                        setFormData(prev => ({ ...prev, deadline: `${fullYear}-${parts[1]}-${parts[2]}` }));
                      } else {
                        setDeadlineFieldsFilled(prev => ({ ...prev, year: false }));
                      }
                    }
                  }
                }}
                onChange={() => {}}
                className="w-14 bg-sidebar-bg border border-border-primary rounded-button px-2 py-2 text-sm text-center focus:outline-none focus:border-accent"
              />
              </div>
              <div className="relative w-8 h-8 flex items-center justify-center calendar-icon-wrapper">
                <style>{`
                  .calendar-icon-wrapper {
                    cursor: pointer !important;
                  }
                  .calendar-icon-wrapper input[type="date"] {
                    cursor: pointer !important;
                  }
                  .calendar-icon-wrapper input[type="date"]::-webkit-calendar-picker-indicator {
                    cursor: pointer !important;
                  }
                `}</style>
                <input
                  type="date"
                  value={formData.deadline || ''}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, deadline: e.target.value }));
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
                  className="w-5 h-5 text-text-secondary"
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
                  value={formData.cost}
                  onChange={(e) => setFormData(prev => ({ ...prev, cost: e.target.value }))}
                  placeholder="0"
                  className="flex-1 bg-sidebar-bg border border-border-primary rounded-button px-3 py-2 text-sm focus:outline-none focus:border-accent"
                />
                <CustomSelect
                  value={formData.currency}
                  onChange={(val) => setFormData(prev => ({ ...prev, currency: val as 'USD' | 'RUB' | 'EUR' }))}
                  options={[
                    { value: 'USD', label: 'USD' },
                    { value: 'RUB', label: 'RUB' },
                    { value: 'EUR', label: 'EUR' },
                  ]}
                  className="w-24"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-border-primary pt-2"></div>

          <div>
            <label className="block text-sm font-medium mb-2">Software Tools</label>
            <div className="grid grid-cols-4 gap-2">
              {SOFTWARE_OPTIONS.map(sw => {
                const locked = isComposeOnlySoftware(normalizeSoftwareName(sw), formData.shotBased);
                return (
                  <button
                    key={sw}
                    onClick={() => toggleSoftware(sw)}
                    disabled={locked}
                    title={locked ? `Shot-based projects use ${sw} in Compose` : undefined}
                    className={`px-3 py-2 rounded-lg border transition-colors text-sm flex items-center gap-2 ${
                      locked
                        ? 'bg-sidebar-bg border-border-primary opacity-40 cursor-not-allowed'
                        : formData.software.includes(sw)
                          ? 'bg-accent border-accent'
                          : 'bg-sidebar-bg border-border-primary hover:border-border-secondary'
                    }`}
                  >
                    <SoftwareIcon name={sw} />
                    <span className="truncate">{sw}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-border-primary pt-2"></div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Project Path</label>
            <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.path}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, path: e.target.value }));
                    setUseDefaultPath(false);
                  }}
                  disabled={useDefaultPath}
                  placeholder="/home/user/projects/my-project"
                  className="flex-1 bg-sidebar-bg border border-border-primary rounded-button px-3 py-2 text-sm focus:outline-none focus:border-accent disabled:opacity-50"
                />
                <button
                  onClick={handleBrowse}
                  disabled={useDefaultPath}
                  className="px-3 py-2 bg-sidebar-bg hover:bg-hover-bg rounded-button transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Browse
                </button>
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className="text-sm whitespace-nowrap">Use default</span>
                  <button
                    type="button"
                    onClick={() => setUseDefaultPath(prev => !prev)}
                    className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${
                      useDefaultPath ? 'bg-accent' : 'bg-border-secondary'
                    }`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${
                      useDefaultPath ? 'translate-x-[18px]' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </SimpleBar>

        <div className="p-4 border-t border-border-secondary flex justify-end gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-sidebar-bg hover:bg-hover-bg rounded-button transition-colors text-sm border border-border-primary"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!formData.name.trim() || !formData.path || formData.software.length === 0}
            className="px-4 py-2 bg-gradient-to-br from-accent to-accent-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-button transition-all font-medium animate-button text-sm text-white"
          >
            Create Project
          </button>
        </div>
      </div>
    </div>
  );
}
