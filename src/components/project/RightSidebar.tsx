import { useState } from 'react';
import { TreeView } from './TreeView';
import ShotsBrowser from './ShotsBrowser';

interface RightSidebarProps {
  project: any;
  shotsBrowserDocked?: boolean;
  onToggleDock?: () => void;
}

export function RightSidebar({ project, shotsBrowserDocked = false, onToggleDock }: RightSidebarProps) {
  const [showHidden, setShowHidden] = useState(false);

  return (
    <div className="w-80 bg-sidebar-bg border-l border-t border-border-primary flex flex-col">
      {shotsBrowserDocked && (
        <div className="flex-1 min-h-0 flex flex-col">
          <ShotsBrowser
            projectId={project.id}
            className="h-full"
            docked={true}
            onToggleDock={onToggleDock}
          />
        </div>
      )}
      <div className={`${shotsBrowserDocked ? 'flex-1 min-h-0' : 'flex-1'} p-4 h-full`}>
        <TreeView project={project} showHidden={showHidden} onToggleHidden={() => setShowHidden(!showHidden)} />
      </div>
    </div>
  );
}
