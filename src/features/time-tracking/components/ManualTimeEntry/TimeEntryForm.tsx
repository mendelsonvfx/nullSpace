// src/features/time-tracking/components/ManualTimeEntry/TimeEntryForm.tsx
import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Project, SoftwareName } from '../../../../types/project';
import { formatSoftwareName } from '../../utils';

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
      <div className="flex items-center justify-between p-4 border-b border-zinc-800">
        <h2 className="text-lg font-bold text-white">Add Time Manually</h2>
        <button
          onClick={onCancel}
          className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-zinc-400" />
        </button>
      </div>

      {/* Form Body */}
      <div className="flex-1 p-4 space-y-3">
        {/* Software Selection */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1.5 font-medium">
            Software *
          </label>
          <select
            className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm text-white border border-zinc-700 focus:border-accent focus:outline-none transition-colors"
            value={selectedSoftware}
            onChange={(e) => setSelectedSoftware(e.target.value as SoftwareName)}
          >
            {project.software.map(sw => (
              <option key={sw.name} value={sw.name}>
                {formatSoftwareName(sw.name)}
              </option>
            ))}
          </select>
        </div>

        {/* Date Picker */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1.5 font-medium">
            Date *
          </label>
          <input
            type="date"
            className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm text-white border border-zinc-700 focus:border-accent focus:outline-none transition-colors [color-scheme:dark]"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
          />
        </div>

        {/* Duration with Checkbox */}
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-xs text-zinc-400 mb-1.5 font-medium">
              Duration *
            </label>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 flex-1">
                <input
                  type="number"
                  min="0"
                  max="23"
                  placeholder="0"
                  className="w-16 bg-zinc-800 rounded-lg px-2 py-2 text-sm text-white border border-zinc-700 focus:border-accent focus:outline-none transition-colors text-center"
                  value={hours || ''}
                  onChange={(e) => setHours(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                />
                <span className="text-zinc-500 text-xs font-medium">h</span>
              </div>
              <div className="flex items-center gap-1.5 flex-1">
                <input
                  type="number"
                  min="0"
                  max="59"
                  placeholder="0"
                  className="w-16 bg-zinc-800 rounded-lg px-2 py-2 text-sm text-white border border-zinc-700 focus:border-accent focus:outline-none transition-colors text-center"
                  value={minutes || ''}
                  onChange={(e) => setMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                />
                <span className="text-zinc-500 text-xs font-medium">m</span>
              </div>
            </div>
            <p className="text-xs text-zinc-600 mt-0.5">
              Total: {((hours * 60) + minutes) / 60} hours
            </p>
          </div>

          {/* Count in Statistics Checkbox */}
          <div className="flex flex-col justify-center items-start pt-6 pl-3">
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  id="countInStats"
                  checked={countInStats}
                  onChange={(e) => setCountInStats(e.target.checked)}
                  className="peer w-4 h-4 appearance-none bg-zinc-800 border border-zinc-700 rounded cursor-pointer checked:bg-accent checked:border-accent transition-all duration-200 hover:border-zinc-600 focus:ring-2 focus:ring-accent/30 focus:ring-offset-0"
                />
                <svg
                  className="absolute w-4 h-4 pointer-events-none hidden peer-checked:block text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <span className="text-xs text-zinc-300 select-none whitespace-nowrap group-hover:text-white transition-colors">
                Count in software statistics
              </span>
            </label>
          </div>
        </div>

        {/* Shot Selection (if project has shots) */}
        {project.hasShots && project.shots && project.shots.length > 0 && (
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5 font-medium">
              Shot (optional)
            </label>
            <select
              className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm text-white border border-zinc-700 focus:border-accent focus:outline-none transition-colors"
              value={selectedShotId}
              onChange={(e) => setSelectedShotId(e.target.value)}
            >
              <option value="">None</option>
              {project.shots.map(shot => (
                <option key={shot.id} value={shot.id}>
                  Shot {String(shot.number).padStart(3, '0')} - {shot.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex gap-2 p-4 border-t border-zinc-800">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm rounded-lg transition-colors font-medium"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={hours === 0 && minutes === 0}
          className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors font-medium shadow-sm"
        >
          Add Entry
        </button>
      </div>
    </div>
  );
};
