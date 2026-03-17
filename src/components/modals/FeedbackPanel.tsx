import { useState, useEffect } from 'react';
import { X, Save, Copy, Check } from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';
import { useModalBlur } from '../../hooks/useModalBlur';
import SimpleBar from 'simplebar-react';

interface FeedbackPanelProps {
  onClose: () => void;
}

export function FeedbackPanel({ onClose }: FeedbackPanelProps) {
  const [feedback, setFeedback] = useState('');
  const [allFeedback, setAllFeedback] = useState('');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const blurClass = useModalBlur();

  // Load all feedback on mount
  useEffect(() => {
    loadAllFeedback();
  }, []);

  const loadAllFeedback = async () => {
    try {
      const content = await invoke<string>('read_feedback');
      setAllFeedback(content);
    } catch (error) {
      console.error('Failed to load feedback:', error);
    }
  };

  const handleSave = async () => {
    if (!feedback.trim()) return;

    setSaving(true);
    try {
      await invoke('save_feedback', { feedback: feedback.trim() });
      await loadAllFeedback();
      setFeedback('');
    } catch (error) {
      console.error('Failed to save feedback:', error);
      alert('Failed to save feedback');
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    try {
      // Get full feedback with metadata for copying
      const fullFeedback = await invoke<string>('read_feedback_full');
      const wrappedFeedback = '```\n' + fullFeedback + '\n```';
      await navigator.clipboard.writeText(wrappedFeedback);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy feedback:', error);
      alert('Failed to copy to clipboard');
    }
  };

  const handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      (e.currentTarget as HTMLDivElement).dataset.mousedownTarget = 'backdrop';
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && (e.currentTarget as HTMLDivElement).dataset.mousedownTarget === 'backdrop') {
      onClose();
    }
    delete (e.currentTarget as HTMLDivElement).dataset.mousedownTarget;
  };

  return (
    <div
      className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 rounded-lg ${blurClass}`}
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div
        className="bg-card-bg border border-border-secondary rounded-card w-full max-w-2xl max-h-[80vh] min-h-[400px] flex flex-col shadow-xl animate-modal"
        data-feedback-panel
        data-modal-window
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-secondary">
          <h2 className="text-xl font-semibold">Feedback</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center hover:bg-hover-bg rounded-badge transition-colors"
          >
            <X className="w-5 h-5 close-button-red" />
          </button>
        </div>

        {/* Content */}
        <SimpleBar className="flex-1 custom-scrollbar" autoHide={false} style={{ maxHeight: '100%' }}>
          <div className="p-4 space-y-4">
          {/* New Feedback Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-muted">
              Add New Feedback
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Enter your feedback here..."
              className="w-full h-32 bg-sidebar-bg border border-border-primary rounded-button p-3 text-sm resize-none focus:outline-none focus:border-accent"
            />
            <button
              onClick={handleSave}
              disabled={!feedback.trim() || saving}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-br from-accent to-accent-hover disabled:opacity-40 rounded-button transition-colors text-white animate-button"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>

          {/* All Feedback Display */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-text-muted">
                All Feedback
              </label>
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 px-3 py-1.5 bg-sidebar-bg hover:bg-hover-bg border border-border-primary rounded-button transition-colors text-sm animate-button"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-green-500" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy All
                  </>
                )}
              </button>
            </div>
            <SimpleBar className="bg-sidebar-bg border border-border-primary rounded-button min-h-[200px] max-h-[300px] custom-scrollbar-fixed" autoHide={false}>
              <div className="p-3">
                {allFeedback ? (
                  <pre className="text-sm whitespace-pre-wrap break-words text-text-primary">
                    {allFeedback}
                  </pre>
                ) : (
                  <p className="text-sm text-text-muted">No feedback yet</p>
                )}
              </div>
            </SimpleBar>
          </div>
          </div>
        </SimpleBar>
      </div>
    </div>
  );
}
