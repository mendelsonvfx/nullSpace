import type React from 'react';
import { ChevronDown, Eye, Film } from 'lucide-react';
import type { OutputFile } from '../../utils/outputsCache';
import { OutputRow, outputRowId, previewFramesSignature } from './OutputRow';

export interface OutputGroup {
  path: string;
  files: OutputFile[];
}

interface OutputColumnProps {
  renderType: 'preview' | 'final';
  total: number;
  grouped: OutputGroup[];
  ungrouped: OutputFile[];
  /** Keys `${renderType}:${groupPath}` */
  expandedGroups: Set<string>;
  previewsEnabled: boolean;
  /** Muted path shown before the name: inside a group relative to it, otherwise the folder path */
  prefixOf: (output: OutputFile, groupPath?: string) => string;
  onToggleGroup: (groupPath: string, renderType: 'preview' | 'final') => void;
  onGroupContextMenu: (e: React.MouseEvent, groupPath: string, renderType: 'preview' | 'final') => void;
  onOpen: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onDragStart: (e: React.MouseEvent<HTMLElement>, id: string) => void;
}

/** One column (Preview or Final) of Output Overview: folder groups first, then loose outputs */
export function OutputColumn({
  renderType, total, grouped, ungrouped, expandedGroups, previewsEnabled, prefixOf,
  onToggleGroup, onGroupContextMenu, onOpen, onContextMenu, onDragStart,
}: OutputColumnProps) {
  const label = renderType === 'preview' ? 'Preview' : 'Final';
  const HeaderIcon = renderType === 'preview' ? Eye : Film;

  const renderRow = (output: OutputFile, active: boolean, groupPath?: string) => (
    <OutputRow
      key={outputRowId(output)}
      id={outputRowId(output)}
      name={output.name}
      path={output.path}
      isSequence={output.is_sequence}
      size={output.size}
      modified={output.modified}
      createdAt={output.created_at}
      frameCount={output.frame_count}
      missingFrames={output.missing_frames}
      previewFrames={output.preview_frames}
      framesSig={previewFramesSignature(output.preview_frames)}
      prefix={prefixOf(output, groupPath)}
      active={active}
      previewsEnabled={previewsEnabled}
      onOpen={onOpen}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
    />
  );

  return (
    <div className="flex flex-col">
      {/* Column header */}
      <div className="flex items-center gap-2 px-5 pt-3 pb-2">
        <HeaderIcon className="w-3.5 h-3.5 text-text-secondary" />
        <span className="text-xs font-medium text-text-secondary">{label} ({total})</span>
      </div>
      {/* Column content - scrollable */}
      <div className="px-3 pb-3 space-y-2 max-h-[350px] overflow-y-auto custom-scrollbar">
        <div className="space-y-2">
          {/* Grouped files */}
          {grouped.map(group => {
            const isExpanded = expandedGroups.has(`${renderType}:${group.path}`);
            return (
              <div key={group.path}>
                {/* Group header */}
                <button
                  onClick={() => onToggleGroup(group.path, renderType)}
                  onContextMenu={(e) => onGroupContextMenu(e, group.path, renderType)}
                  className="w-full text-left px-3 py-2 rounded bg-[#181818] hover:bg-[#1e1e1e] transition-colors flex items-center gap-2"
                >
                  <ChevronDown
                    className={`w-4 h-4 text-text-secondary transition-transform ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
                  />
                  <span className="text-sm text-text-secondary">{group.path} /</span>
                  <span className="text-xs text-text-muted ml-auto">({group.files.length})</span>
                </button>

                {/* Group files: grid rows 0fr → 1fr animate to the real height, however many rows */}
                <div
                  className={`grid grid-cols-[minmax(0,1fr)] transition-[grid-template-rows] duration-200 ease-in-out motion-reduce:transition-none ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div className="pl-6 space-y-2 pt-2">
                      {group.files.map(output => renderRow(output, isExpanded, group.path))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Ungrouped files */}
          {ungrouped.map(output => renderRow(output, true))}
        </div>
        {total === 0 && (
          <div className="p-4 text-center text-xs text-text-muted">No {renderType} outputs</div>
        )}
      </div>
    </div>
  );
}
