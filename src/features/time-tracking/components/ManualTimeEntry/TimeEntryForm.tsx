// src/features/time-tracking/components/ManualTimeEntry/TimeEntryForm.tsx
import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Project, SoftwareName } from '../../../../types/project';
import { formatSoftwareName } from '../../utils';
import { CustomSelect } from '../../../../components/ui/CustomSelect';

interface TimeEntryFormProps {
  project: Project;
  isOpen: boolean;
  onSubmit: (
    software: SoftwareName,
    durationMinutes: number,
    date: string,
    shotId?: string,
    countInStats?: boolean
  ) => void;
  onCancel: () => void;
}

/**
 * Form for adding manual time entries
 */
export const TimeEntryForm: React.FC<TimeEntryFormProps> = ({
  project,
  isOpen,
  onSubmit,
  onCancel
}) => {
  const [selectedSoftware, setSelectedSoftware] = useState<SoftwareName>('blender');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [hours, setHours] = useState<number>(0);
  const [minutes, setMinutes] = useState<number>(0);
  const [selectedShotId, setSelectedShotId] = useState<string>('');
  const [countInStats, setCountInStats] = useState<boolean>(true);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      if (project.software.length > 0) {
        setSelectedSoftware(project.software[0].name);
      }
      setSelectedDate(new Date().toISOString().split('T')[0]);
      setHours(0);
      setMinutes(0);
      setSelectedShotId('');
      setCountInStats(true);
    }
  }, [isOpen, project.software]);

  const handleSubmit = () => {
    const totalMinutes = (hours * 60) + minutes;

    if (totalMinutes === 0) {
      alert('Please enter a duration');
      return;
    }

    onSubmit(
      selectedSoftware,
      totalMinutes,
      selectedDate,
      selectedShotId || undefined,
      countInStats
    );

    // Reset form without closing modal
    setHours(0);
    setMinutes(0);
    setSelectedShotId('');
    setCountInStats(true);
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border-secondary">
        <h2 className="text-lg font-bold text-text-primary">Add Time Manually</h2>
        <button
          onClick={onCancel}
          className="p-2 hover:bg-hover-bg rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-text-muted" />
        </button>
      </div>

      {/* Form Body */}
      <div className="flex-1 p-4 space-y-3">
        {/* Software Selection */}
        <div>
          <label className="block text-xs text-text-muted mb-1.5 font-medium">
            Software *
          </label>
          <CustomSelect
            value={selectedSoftware}
            onChange={(val) => setSelectedSoftware(val as SoftwareName)}
            options={project.software.map(sw => ({
              value: sw.name,
              label: formatSoftwareName(sw.name),
            }))}
          />
        </div>

        {/* Date Picker */}
        <div>
          <label className="block text-xs text-text-muted mb-1.5 font-medium">
            Date *
          </label>
          <input
            type="date"
            className="w-full bg-sidebar-bg rounded-button px-3 py-2 text-sm text-text-primary border border-border-primary focus:border-border-secondary focus:outline-none transition-colors [color-scheme:dark]"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
          />
        </div>

        {/* Duration with Checkbox */}
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-xs text-text-muted mb-1.5 font-medium">
              Duration *
            </label>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 flex-1">
                <input
                  type="number"
                  min="0"
                  max="23"
                  placeholder="0"
                  className="w-16 bg-sidebar-bg rounded-button px-2 py-2 text-sm text-text-primary border border-border-primary focus:border-border-secondary focus:outline-none transition-colors text-center"
                  value={hours || ''}
                  onChange={(e) => setHours(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                />
                <span className="text-text-muted text-xs font-medium">h</span>
              </div>
              <div className="flex items-center gap-1.5 flex-1">
                <input
                  type="number"
                  min="0"
                  max="59"
                  placeholder="0"
                  className="w-16 bg-sidebar-bg rounded-button px-2 py-2 text-sm text-text-primary border border-border-primary focus:border-border-secondary focus:outline-none transition-colors text-center"
                  value={minutes || ''}
                  onChange={(e) => setMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                />
                <span className="text-text-muted text-xs font-medium">m</span>
              </div>
            </div>
            <p className="text-xs text-text-dim mt-0.5">
              Total: {((hours * 60) + minutes) / 60} hours
            </p>
          </div>

          {/* Count in Statistics Toggle */}
          <div className="flex items-center gap-2 self-center mt-2">
            <button
              type="button"
              onClick={() => setCountInStats(!countInStats)}
              className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${
                countInStats ? 'bg-accent' : 'bg-border-secondary'
              }`}
            >
              <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${
                countInStats ? 'translate-x-[18px]' : 'translate-x-0.5'
              }`} />
            </button>
            <span className="text-xs text-text-muted select-none whitespace-nowrap">
              Count in software statistics
            </span>
          </div>
        </div>

        {/* Shot Selection (if project has shots) */}
        {project.hasShots && project.shots && project.shots.length > 0 && (
          <div>
            <label className="block text-xs text-text-muted mb-1.5 font-medium">
              Shot (optional)
            </label>
            <CustomSelect
              value={selectedShotId}
              onChange={setSelectedShotId}
              options={[
                { value: '', label: 'None' },
                ...project.shots.map(shot => ({
                  value: shot.id,
                  label: `Shot ${String(shot.number).padStart(3, '0')} - ${shot.name}`,
                })),
              ]}
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex gap-2 p-4 border-t border-border-secondary">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2 bg-hover-bg hover:bg-hover-bg/80 text-text-primary text-sm rounded-button transition-colors font-medium"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={hours === 0 && minutes === 0}
          className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover disabled:bg-hover-bg disabled:text-text-dim disabled:cursor-not-allowed text-white text-sm rounded-button transition-colors font-medium shadow-sm"
        >
          Add Entry
        </button>
      </div>
    </div>
  );
};
