import { useState } from 'react';
import { FolderTree, Eye } from 'lucide-react';
import { TreeView } from './TreeView';

interface RightSidebarProps {
  project: any;
}

export function RightSidebar({ project }: RightSidebarProps) {
  const [showHidden, setShowHidden] = useState(false);

  return (
    <div className="w-80 bg-sidebar-bg border-l border-border-primary border-t border-border-primary flex flex-col p-4">
      <TreeView project={project} showHidden={showHidden} onToggleHidden={() => setShowHidden(!showHidden)} />
    </div>
  );
}
