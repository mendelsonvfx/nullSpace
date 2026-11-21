import { invoke } from '@tauri-apps/api/tauri';

/**
 * Deleting user files moves them to the Recycle Bin (src-tauri/src/trash.rs). Commands reject with
 * exactly "cancelled" when the user declined a Windows prompt (e.g. "delete permanently?" on a drive
 * without a Recycle Bin) — callers must then leave their data unchanged.
 */
export const TRASH_CANCELLED = 'cancelled';

export function isTrashCancelled(error: unknown): boolean {
  return String(error) === TRASH_CANCELLED;
}

/** Task attachments to the Recycle Bin; the backend refuses paths outside `<project>/_attachments`. */
export function trashAttachments(projectPath: string, paths: string[]): Promise<number> {
  return invoke<number>('trash_attachments', { projectPath, paths });
}
