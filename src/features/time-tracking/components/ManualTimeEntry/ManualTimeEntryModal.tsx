// src/features/time-tracking/components/ManualTimeEntry/ManualTimeEntryModal.tsx
import React, { useEffect, useState } from 'react';
import { Project, SoftwareName } from '../../../../types/project';
import { useModalBlur } from '../../../../hooks/useModalBlur';
import { TimeEntryForm } from './TimeEntryForm';
import { TimeEntryHistory } from './TimeEntryHistory';

interface ManualTimeEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onAddEntry: (
    software: SoftwareName,
    durationMinutes: number,
    date: string,
    shotId?: string,
    notes?: string,
    countInStats?: boolean
  ) => void;
  onRemoveEntry: (entryId: string) => void;
}

/**
 * Modal for adding and viewing manual time entries
 * Two-column layout: form on left, history on right
 */
export const ManualTimeEntryModal: React.FC<ManualTimeEntryModalProps> = ({
  isOpen,
  onClose,
  project,
  onAddEntry,
  onRemoveEntry
}) => {
  const blurClass = useModalBlur();
  const [isAnimating, setIsAnimating] = useState(false);

  // Animation effect
  useEffect(() => {
    if (isOpen) {
      // Small delay to trigger animation
      setTimeout(() => setIsAnimating(true), 10);
    } else {
      setIsAnimating(false);
    }
  }, [isOpen]);

  // Prevent clicks inside modal from closing it
  const handleModalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // Wrapper for onAddEntry that ignores the 'notes' parameter
  const handleAddEntry = (
    software: SoftwareName,
    durationMinutes: number,
    date: string,
    shotId?: string,
    countInStats?: boolean
  ) => {
    onAddEntry(software, durationMinutes, date, shotId, undefined, countInStats);
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 transition-opacity duration-200 ${blurClass} ${
        isAnimating ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={onClose}
    >
      <div
        className={`bg-zinc-900 rounded-xl border border-zinc-800 shadow-2xl w-full max-w-4xl mx-4 max-h-[85vh] overflow-hidden flex flex-col transition-all duration-200 ${
          isAnimating ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
        onClick={handleModalClick}
      >
        {/* Two columns */}
        <div className="grid grid-cols-2 divide-x divide-zinc-800 h-full">
          {/* Left: Add Entry Form */}
          <TimeEntryForm
            project={project}
            isOpen={isOpen}
            onSubmit={handleAddEntry}
            onCancel={onClose}
          />

          {/* Right: History Journal */}
          <TimeEntryHistory
            project={project}
            onRemoveEntry={onRemoveEntry}
          />
        </div>
      </div>
    </div>
  );
};
