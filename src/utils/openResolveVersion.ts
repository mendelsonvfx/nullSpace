import { invoke } from '@tauri-apps/api/tauri';
import { useTimeTrackingStore } from '../features/time-tracking/stores/timeTrackingStore';
import { useProjectStore } from '../store/projectStore';
import { davinciProjectName, type NamedProject } from './davinciProjectName';

/**
 * Open a DaVinci Resolve .drp version: the nullSpace "Open Project" menu script in Resolve imports it as a
 * separate project. Never falls back to the system file association — it would import the snapshot
 * under the project name stored inside the .drp, outside the nullSpace Project Manager folder.
 */
export async function openResolveVersion(
  project: NamedProject & { path: string },
  drpPath: string,
  shotId?: string
): Promise<void> {
  const notify = (window as any).showNotification as
    | ((type: string, message: string, title?: string, duration?: number) => void)
    | undefined;

  // Same priority as the Launch button: per-project path → global path
  const projectPaths: Record<string, string> = JSON.parse(
    localStorage.getItem(`projectSoftwarePaths_${project.id}`) || '{}'
  );
  const globalPaths: Record<string, string> = JSON.parse(localStorage.getItem('softwarePaths') || '{}');
  const executablePath = projectPaths.davinci || globalPaths.davinci;
  if (!executablePath) {
    notify?.('warning', 'Path not set for DaVinci Resolve. Please configure it in Settings.');
    return;
  }

  let result: { file_name: string; pid: number; hint: string | null };
  try {
    result = await invoke('open_resolve_version', {
      executablePath,
      drpPath,
      projectPath: project.path,
      resolveProjectName: davinciProjectName(project, useProjectStore.getState().projects),
    });
  } catch (error) {
    notify?.('error', String(error), 'DaVinci Resolve');
    return;
  }
  if (result.hint) notify?.('info', result.hint, 'DaVinci Resolve', 10000);

  await useTimeTrackingStore.getState().startSession({
    projectId: project.id,
    projectPath: project.path,
    software: 'davinci',
    pid: result.pid,
    shotId,
  });
}
