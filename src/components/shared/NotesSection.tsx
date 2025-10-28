import { useRef, useCallback, memo, useMemo } from 'react';
import { MDXEditor, headingsPlugin, listsPlugin, quotePlugin, thematicBreakPlugin, markdownShortcutPlugin, linkPlugin, linkDialogPlugin, codeBlockPlugin, codeMirrorPlugin, toolbarPlugin, UndoRedo, BoldItalicUnderlineToggles, BlockTypeSelect, CreateLink, InsertCodeBlock, ListsToggle } from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
import { useProjectStore } from '../../store/projectStore';

interface NotesSectionProps {
  project: any;
  context: {
    notes: Array<{ id: string; content: string }>;
    isShot?: boolean;
    shotId?: string;
  };
}

export const NotesSection = memo(function NotesSection({ project, context }: NotesSectionProps) {
  const noteContent = context.notes && context.notes.length > 0 ? context.notes[0].content : '';
  const editorRef = useRef<any>(null);

  const handleNoteChange = useCallback((markdown: string) => {
    if (context.isShot && context.shotId) {
      const { addShotNote, updateShotNote } = useProjectStore.getState();
      if (context.notes && context.notes.length > 0) {
        updateShotNote(project.id, context.shotId, context.notes[0].id, markdown);
      } else {
        addShotNote(project.id, context.shotId, markdown);
      }
    } else {
      const { addNote, updateNote } = useProjectStore.getState();
      if (context.notes && context.notes.length > 0) {
        updateNote(project.id, context.notes[0].id, markdown);
      } else {
        addNote(project.id, markdown);
      }
    }
  }, [project.id, context.isShot, context.shotId, context.notes]);

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    // Focus the editor when clicking anywhere in the container
    const target = e.target as HTMLElement;
    if (target.closest('[class*="_contentEditable"]')) {
      return; // Already clicked on the editor itself
    }

    // Find and focus the contentEditable element
    const editorElement = (e.currentTarget as HTMLElement).querySelector('[contenteditable="true"]') as HTMLElement;
    if (editorElement) {
      editorElement.focus();
    }
  }, []);

  // ✅ OPTIMIZATION: Memoize plugins array to prevent recreation on every render
  // MDXEditor is expensive - recreating plugins causes performance issues
  const plugins = useMemo(() => [
    headingsPlugin(),
    listsPlugin(),
    quotePlugin(),
    thematicBreakPlugin(),
    markdownShortcutPlugin(),
    linkPlugin(),
    linkDialogPlugin(),
    codeBlockPlugin({ defaultCodeBlockLanguage: 'js' }),
    codeMirrorPlugin({ codeBlockLanguages: { js: 'JavaScript', ts: 'TypeScript', css: 'CSS', python: 'Python', rust: 'Rust' } }),
    toolbarPlugin({
      toolbarContents: () => (
        <>
          <UndoRedo />
          <BoldItalicUnderlineToggles />
          <BlockTypeSelect />
          <CreateLink />
          <InsertCodeBlock />
          <ListsToggle />
        </>
      )
    })
  ], []); // Empty deps - plugins never change

  // Create a unique key based on project and shot to reset editor on project/shot change
  const editorKey = context.isShot && context.shotId
    ? `${project.id}-${context.shotId}`
    : project.id;

  return (
    <div>
      <h3 className="text-sm font-medium text-zinc-400 mb-3">Notes</h3>
      <div className="markdown-editor-container" onClick={handleContainerClick}>
        <MDXEditor
          key={editorKey}
          ref={editorRef}
          markdown={noteContent}
          onChange={handleNoteChange}
          placeholder="Add notes..."
          plugins={plugins}
          contentEditableClassName="prose prose-invert prose-sm max-w-none"
        />
      </div>
    </div>
  );
});
