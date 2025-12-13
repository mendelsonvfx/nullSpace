import { useThumbnail } from '../../hooks/useThumbnail';
import { useProjectStore } from '../../store/projectStore';
import { IconCircleCheckFilled, IconCircleDotted, IconCircle } from '@tabler/icons-react';
import ReactMarkdown from 'react-markdown';

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt?: string;
}

interface Note {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface Shot {
  id: string;
  name: string;
  number: number;
  preview?: string;
  wip?: boolean;
  completed?: boolean;
  sceneId: string;
  todos?: TodoItem[];
  notes?: Note[];
}

interface ShotsOverviewTableProps {
  projectId: string;
  projectPath: string;
  currentScene: any;
  shots: Shot[];
}

export function ShotsOverviewTable({ projectId, projectPath, currentScene: _currentScene, shots }: ShotsOverviewTableProps) {
  const { setCurrentShot } = useProjectStore();

  // Sort shots by number
  const sortedShots = [...shots].sort((a, b) => a.number - b.number);

  const handleShotClick = (shotId: string) => {
    setCurrentShot(projectId, shotId);
  };

  return (
    <div className="mb-7">
      <h3 className="text-sm font-medium text-text-secondary mb-3.5">
        Shots overview
      </h3>

      <div className="bg-card-bg border border-border-primary rounded-med overflow-hidden">
        {/* Table Header */}
        <div className="bg-zinc-800/50 px-4 py-2.5 border-b border-zinc-700/50 grid grid-cols-[140px_120px_150px_1fr_120px] gap-4 text-xs font-medium text-text-secondary">
          <div className="text-center">Preview</div>
          <div className="text-left">Number</div>
          <div className="text-left">Tasks</div>
          <div className="text-left">Notes</div>
          <div className="text-center">Status</div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-zinc-800/50">
          {sortedShots.length === 0 ? (
            <div className="px-4 py-8 text-center text-text-muted text-sm">
              No shots in this scene
            </div>
          ) : (
            sortedShots.map((shot) => (
              <ShotRow
                key={shot.id}
                shot={shot}
                projectId={projectId}
                projectPath={projectPath}
                onClick={() => handleShotClick(shot.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

interface ShotRowProps {
  shot: Shot;
  projectId: string;
  projectPath: string;
  onClick: () => void;
}

function ShotRow({ shot, projectId: _projectId, projectPath, onClick }: ShotRowProps) {
  // Use useThumbnail hook with projectPath and preview
  const previewSrc = useThumbnail(projectPath, shot.preview);

  // Get status info
  const getStatusInfo = () => {
    if (shot.completed) {
      return {
        icon: <IconCircleCheckFilled size={16} className="text-green-500" />,
        text: 'Completed',
        color: 'text-green-500'
      };
    }
    if (shot.wip) {
      return {
        icon: <IconCircleDotted size={16} className="text-yellow-500" />,
        text: 'In Progress',
        color: 'text-yellow-500'
      };
    }
    return {
      icon: <IconCircleDotted size={16} className="text-zinc-600" />,
      text: 'Not Started',
      color: 'text-zinc-600'
    };
  };

  const status = getStatusInfo();

  // Get last 3 incomplete todos (safe check)
  const incompleteTodos = (shot.todos && Array.isArray(shot.todos))
    ? shot.todos
        .filter(todo => !todo.completed)
        .slice(-3)
        .reverse()
    : [];

  // Combine all notes into one text (safe check)
  const allNotesText = (shot.notes && Array.isArray(shot.notes) && shot.notes.length > 0)
    ? shot.notes.map(note => note.content).join('\n\n')
    : '';

  return (
    <div className="grid grid-cols-[140px_120px_150px_1fr_120px] gap-4 px-4 py-3 hover:bg-hover-bg transition-colors">
      {/* Preview - more horizontal, centered */}
      <div className="flex items-center justify-center">
        <div className="w-32 h-20 rounded-button overflow-hidden bg-zinc-900 flex items-center justify-center border border-zinc-800">
          {previewSrc ? (
            <img
              src={previewSrc}
              alt={shot.name}
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            <span className="text-[10px] text-zinc-600">No preview</span>
          )}
        </div>
      </div>

      {/* Number - Clickable, left aligned */}
      <div className="flex items-center justify-start">
        <button
          onClick={onClick}
          className="text-sm font-medium text-text-primary hover:text-accent transition-colors"
        >
          {shot.name}
        </button>
      </div>

      {/* Tasks - left aligned */}
      <div className="flex flex-col justify-center gap-1">
        {incompleteTodos.length > 0 ? (
          incompleteTodos.map((todo) => (
            <div key={todo.id} className="flex items-center gap-1.5">
              <IconCircle size={10} className="text-text-muted flex-shrink-0" />
              <span className="text-xs text-text-secondary truncate">
                {todo.text}
              </span>
            </div>
          ))
        ) : (
          <span className="text-xs text-text-muted">No tasks</span>
        )}
      </div>

      {/* Notes - left aligned, full height and width */}
      <div className="flex items-start justify-start h-full">
        <div className="w-full h-full px-3 py-2 bg-zinc-900/50 rounded-button border border-zinc-800 text-xs text-text-secondary overflow-auto cursor-default">
          {allNotesText ? (
            <div className="prose prose-invert prose-xs max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p className="mb-1 last:mb-0 text-xs">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc list-inside mb-1 last:mb-0 text-xs">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-inside mb-1 last:mb-0 text-xs">{children}</ol>,
                  li: ({ children }) => <li className="mb-0.5 text-xs">{children}</li>,
                  h1: ({ children }) => <h1 className="text-sm font-bold mb-1">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-sm font-semibold mb-1">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-xs font-semibold mb-1">{children}</h3>,
                  code: ({ children }) => <code className="bg-zinc-800 px-1 rounded text-xs">{children}</code>,
                  pre: ({ children }) => <pre className="bg-zinc-800 p-2 rounded mb-1 text-xs overflow-x-auto">{children}</pre>,
                }}
              >
                {allNotesText}
              </ReactMarkdown>
            </div>
          ) : (
            <span className="text-xs text-text-muted">No notes</span>
          )}
        </div>
      </div>

      {/* Status - centered */}
      <div className="flex items-center justify-center gap-2">
        {status.icon}
        <span className={`text-xs ${status.color}`}>
          {status.text}
        </span>
      </div>
    </div>
  );
}
