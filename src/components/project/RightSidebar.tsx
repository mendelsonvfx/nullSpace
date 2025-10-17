import { useState } from 'react';
import { FolderTree, Eye } from 'lucide-react';
import { TreeView } from './TreeView';

interface RightSidebarProps {
  project: any;
}

export function RightSidebar({ project }: RightSidebarProps) {
  const [showHidden, setShowHidden] = useState(false);

  return (
    <div className="w-80 border-l border-zinc-800 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <FolderTree className="w-4 h-4" />
            <h3 className="text-sm font-medium">Project Structure</h3>
          </div>
          <button
            onClick={() => setShowHidden(!showHidden)}
            className="p-1 hover:bg-zinc-800 rounded transition-colors"
            title={showHidden ? "Hide hidden items" : "Show hidden items"}
          >
            <Eye className={`w-4 h-4 ${showHidden ? 'text-accent' : 'text-zinc-400'}`} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden p-4">
        <TreeView project={project} showHidden={showHidden} />
      </div>
    </div>
  );
}
