# Time Tracking Implementation Roadmap

## 📋 Overview

This document outlines the implementation plan for the time tracking feature in nullSpace (RayHub). The feature automatically tracks time spent in different software (Blender, Houdini, etc.) and provides analytics, manual entries, notifications, and export capabilities.

---

## ✅ Phase 1: Core Time Tracking (MVP) - **COMPLETED**

### Backend (Rust)

#### Files Created:
- `src-tauri/src/time_tracking.rs` - Main time tracking module
- Updated `src-tauri/src/main.rs` - Integration and commands

#### Features Implemented:
1. **Process Monitoring System**
   - Background task runs every 60 seconds
   - Checks if tracked processes are alive
   - Verifies if software window is in focus (Windows API)
   - Only counts minutes when window is focused
   - Automatically removes dead processes from tracking

2. **Tauri Commands**
   ```rust
   start_time_tracking(entry_id, project_id, project_path, shot_id, software, pid)
   stop_time_tracking(entry_id) -> u32  // Returns final minutes
   pause_time_tracking(entry_id)
   resume_time_tracking(entry_id)
   get_active_sessions() -> Vec<ActiveSession>
   ```

3. **Launch Software Enhancement**
   - Modified `launch_software` to return `LaunchResult { file_name, pid }`
   - PID is captured for all platforms (Windows, macOS, Linux)
   - Automatic time tracking starts after successful launch

#### Key Implementation Details:
```rust
// time_tracking.rs
- ActiveSession struct: stores PID, accumulated_minutes, is_paused, etc.
- ACTIVE_SESSIONS: Global HashMap with Mutex for thread safety
- check_active_windows(): Runs every minute, increments time if focused
- Windows API: GetForegroundWindow(), GetWindowThreadProcessId()
```

---

### Frontend (TypeScript/React)

#### Files Created:
- `src/types/project.ts` - Added TimeEntry interface and Project fields
- `src/components/time/InlineTimer.tsx` - Compact timer for Launch buttons
- `src/components/time/TimeInfoBar.tsx` - Footer info bar component
- `src/components/time/index.ts` - Barrel export

#### Files Modified:
- `src/store/projectStore.ts` - Added time tracking actions
- `src/components/project/ProjectDetails.tsx` - Integrated timer UI

#### Data Types:
```typescript
interface TimeEntry {
  id: string;
  projectId: string;
  shotId?: string;
  software: SoftwareName;  // 'blender', 'houdini', etc.
  startTime: string;        // ISO timestamp
  endTime?: string;         // ISO timestamp (undefined if active)
  durationMinutes: number;  // Only focused time
  isActive: boolean;
  isManual: boolean;        // User-added vs auto-tracked
  isPaused: boolean;
  pausedAt?: string;
  pausedMinutes?: number;   // Not counted in total
  notes?: string;           // For manual entries
}

interface Project {
  // ... existing fields
  timeEntries?: TimeEntry[];
  totalMinutesSpent?: number;
  hourlyRate?: number;           // Auto-calculated: cost / hours
  targetHourlyRate?: number;     // User-defined target
}
```

#### Store Actions:
```typescript
// projectStore.ts
startTimeTracking(projectId, software, pid, shotId?) -> Promise<string>
stopTimeTracking(projectId, entryId) -> Promise<void>
pauseTimeTracking(projectId, entryId) -> Promise<void>
resumeTimeTracking(projectId, entryId) -> Promise<void>
addManualTimeEntry(projectId, software, durationMinutes, date, shotId?, notes?)
getActiveTimeEntry(projectId) -> TimeEntry | undefined
updateTargetHourlyRate(projectId, rate)
```

#### UI Components:

**1. InlineTimer** (in Launch buttons)
```
[Icon] Blender        🟢 2h 15m [⏸][⏹]
       Running...
```
- Shows live time (syncs every 10s)
- Pause/Resume/Stop buttons
- Pulsing green/yellow indicator
- Stops propagation on button clicks

**2. TimeInfoBar** (footer)
```
Created: Oct 20, 2025  |  Time Spent: 15h 32m ●  |  Hourly: $38/h
```
- Includes active session time
- Pulsing dot when software running
- Auto-calculates hourly rate

#### Workflow:
1. User clicks **Launch** → `launchSoftware()` called
2. Software starts → PID captured
3. `startTimeTracking()` creates TimeEntry with `isActive: true`
4. Backend `start_time_tracking()` begins monitoring
5. **Every minute**: Backend checks if process alive + focused → increments time
6. **Every 10 seconds**: Frontend syncs with backend via `get_active_sessions()`
7. User closes software OR clicks Stop → `stopTimeTracking()` saves final time
8. **Every 10 seconds**: Frontend checks if session still exists, auto-stops if not

#### Key Features:
- ✅ Automatic tracking on launch
- ✅ Only counts focused time (not background)
- ✅ Pause/Resume functionality
- ✅ Auto-stops when process dies
- ✅ Real-time UI updates
- ✅ Hourly rate calculation
- ✅ Shot-based tracking support

---

## 🚧 Phase 2: Analytics & Visualization - **PLANNED**

### Goal
Add comprehensive time analytics to the Finance page with charts, graphs, and insights.

### Location
`src/components/finance/FinancePage.tsx` - Add new section at the bottom

### Components to Create

#### 1. `src/components/time/TimeAnalytics.tsx`
Main analytics dashboard for Finance page.

**Features:**
- **Total Time Tracked**: Display cumulative hours across all projects
- **Software Breakdown Bar Chart**: Horizontal bars showing time per software
  ```
  Blender    ████████████████ 122h 15m (49%)
  Houdini    ██████████       95h 40m (39%)
  After FX   ████             20h 30m (8%)
  Maya       ██                8h 58m (4%)
  ```
- **Weekly Timeline**: Bar chart of last 12 weeks
- **Statistics Cards**:
  - This Week: `42h 15m` (↑ +15% from last week)
  - Avg per Day: `6h`
  - Most Productive Day: `Monday (12h avg)`
- **Global Hourly Rate**: `$18.50/hour` (based on all paid projects)

**Implementation Notes:**
```typescript
// Calculate software breakdown
const timeBySoftware = projects.flatMap(p => p.timeEntries || [])
  .reduce((acc, entry) => {
    acc[entry.software] = (acc[entry.software] || 0) + entry.durationMinutes;
    return acc;
  }, {} as Record<SoftwareName, number>);

// Calculate weekly data (last 12 weeks)
const weeks = Array.from({ length: 12 }, (_, i) => {
  const weekStart = subWeeks(new Date(), 11 - i);
  const weekEnd = addWeeks(weekStart, 1);

  const hoursThisWeek = projects.flatMap(p => p.timeEntries || [])
    .filter(e => {
      const entryDate = new Date(e.startTime);
      return entryDate >= weekStart && entryDate < weekEnd;
    })
    .reduce((sum, e) => sum + e.durationMinutes / 60, 0);

  return {
    label: format(weekStart, 'MMM dd'),
    hours: hoursThisWeek
  };
});
```

**UI Structure:**
```tsx
<div className="mb-12">
  <h2 className="text-2xl font-medium text-zinc-400 mb-6">Time Analytics</h2>

  {/* Total Time Card */}
  <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 mb-6">
    <div className="text-6xl font-bold text-blue-400 mb-2">247h 23m</div>
    <div className="text-sm text-zinc-500">Total Time Tracked</div>
  </div>

  {/* Software Breakdown */}
  <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 mb-6">
    <h3 className="text-lg font-semibold mb-4">Software Breakdown</h3>
    {/* Horizontal bars like in FinancePage Top 3 Projects */}
  </div>

  {/* Weekly Timeline */}
  <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 mb-6">
    <h3 className="text-lg font-semibold mb-4">Weekly Timeline (Last 12 Weeks)</h3>
    {/* Bar chart similar to Monthly Revenue Breakdown */}
  </div>

  {/* Stats Grid */}
  <div className="grid grid-cols-3 gap-6">
    {/* This Week, Avg per Day, Most Productive */}
  </div>
</div>
```

---

#### 2. `src/components/time/SoftwareBreakdownList.tsx`
Reusable component for software time breakdown.

**Props:**
```typescript
interface SoftwareBreakdownListProps {
  timeEntries: TimeEntry[];
  showPercentages?: boolean;
}
```

**Example Output:**
```
• Blender:      18h 30m (57%)
• Houdini:      10h 20m (32%)
• After FX:      3h 25m (11%)
```

---

#### 3. `src/components/time/WeeklyTimeChart.tsx`
Bar chart showing hours per week.

**Reuse existing chart code** from `FinancePage` Monthly Breakdown (lines 855-1011).

**Customizations:**
- 12 weeks instead of 12 months
- Show hours instead of revenue
- Different color scheme (e.g., green for time)

---

### Integration Steps

1. **Import components** in `FinancePage.tsx`:
   ```typescript
   import { TimeAnalytics } from '../time/TimeAnalytics';
   ```

2. **Add section after Top 3 Clients** (around line 1104):
   ```tsx
   {/* Time Analytics */}
   <TimeAnalytics projects={projects} />
   ```

3. **Update Statistics section** (line 690) to include Revenue per Hour:
   ```tsx
   {/* Revenue per Hour */}
   <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
     <p className="text-sm text-zinc-500 mb-2">Revenue per Hour</p>
     <p className="text-5xl font-bold text-accent">
       {globalHourlyRate.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}
       <span className="text-accent"> {currencySymbols[baseCurrency]}/h</span>
     </p>
     <p className="text-xs text-zinc-500 mt-2">
       Based on {totalTrackedHours}h tracked
     </p>
   </div>
   ```

---

### Calculations Reference

**Global Hourly Rate:**
```typescript
const totalRevenue = Object.values(totalRevenue).reduce((sum, val) => sum + val, 0);
const totalTrackedMinutes = projects
  .flatMap(p => p.timeEntries || [])
  .reduce((sum, e) => sum + e.durationMinutes, 0);
const totalTrackedHours = totalTrackedMinutes / 60;
const globalHourlyRate = totalTrackedHours > 0 ? totalRevenue / totalTrackedHours : 0;
```

**Week-over-week Change:**
```typescript
const thisWeekHours = getHoursForWeek(currentWeek);
const lastWeekHours = getHoursForWeek(lastWeek);
const percentChange = lastWeekHours > 0
  ? ((thisWeekHours - lastWeekHours) / lastWeekHours) * 100
  : 0;
```

---

## 🚧 Phase 3: Manual Entry & Notifications - **PLANNED**

### Part A: Manual Time Entry

#### Goal
Allow users to manually add time entries for work done outside of nullSpace or to correct tracking.

#### Component: `src/components/time/ManualTimeEntryModal.tsx`

**Trigger:**
Add button in **ProjectDetails** Quick Actions:
```tsx
<button
  onClick={() => setShowManualTimeModal(true)}
  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg flex items-center gap-2"
>
  <Clock className="w-4 h-4" />
  Add Time Manually
</button>
```

**Modal UI:**
```tsx
<Modal isOpen={showManualTimeModal} onClose={() => setShowManualTimeModal(false)}>
  <div className="p-6">
    <h2 className="text-2xl font-bold mb-6">Add Time Manually</h2>

    {/* Software Selection */}
    <div className="mb-4">
      <label className="block text-sm text-zinc-400 mb-2">Software</label>
      <select className="w-full bg-zinc-800 rounded-lg px-3 py-2">
        <option value="blender">Blender</option>
        <option value="houdini">Houdini</option>
        {/* ... */}
      </select>
    </div>

    {/* Date Picker */}
    <div className="mb-4">
      <label className="block text-sm text-zinc-400 mb-2">Date</label>
      <input
        type="date"
        className="w-full bg-zinc-800 rounded-lg px-3 py-2"
        value={selectedDate}
        onChange={(e) => setSelectedDate(e.target.value)}
      />
    </div>

    {/* Duration */}
    <div className="mb-4">
      <label className="block text-sm text-zinc-400 mb-2">Duration</label>
      <div className="flex gap-2">
        <input
          type="number"
          min="0"
          placeholder="Hours"
          className="w-20 bg-zinc-800 rounded-lg px-3 py-2"
          value={hours}
          onChange={(e) => setHours(parseInt(e.target.value) || 0)}
        />
        <span className="self-center text-zinc-500">hours</span>
        <input
          type="number"
          min="0"
          max="59"
          placeholder="Minutes"
          className="w-20 bg-zinc-800 rounded-lg px-3 py-2"
          value={minutes}
          onChange={(e) => setMinutes(parseInt(e.target.value) || 0)}
        />
        <span className="self-center text-zinc-500">minutes</span>
      </div>
    </div>

    {/* Shot Selection (if project has shots) */}
    {project.hasShots && (
      <div className="mb-4">
        <label className="block text-sm text-zinc-400 mb-2">Shot (optional)</label>
        <select className="w-full bg-zinc-800 rounded-lg px-3 py-2">
          <option value="">None</option>
          {project.shots?.map(shot => (
            <option key={shot.id} value={shot.id}>
              Shot {String(shot.number).padStart(3, '0')} - {shot.name}
            </option>
          ))}
        </select>
      </div>
    )}

    {/* Notes */}
    <div className="mb-6">
      <label className="block text-sm text-zinc-400 mb-2">Notes (optional)</label>
      <textarea
        className="w-full bg-zinc-800 rounded-lg px-3 py-2 h-24 resize-none"
        placeholder="E.g., Worked on materials..."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
    </div>

    {/* Actions */}
    <div className="flex gap-3">
      <button
        onClick={() => setShowManualTimeModal(false)}
        className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg"
      >
        Cancel
      </button>
      <button
        onClick={handleAddManualEntry}
        className="flex-1 px-4 py-2 bg-accent hover:bg-accent/90 rounded-lg"
      >
        Add Entry
      </button>
    </div>
  </div>
</Modal>
```

**Logic:**
```typescript
const handleAddManualEntry = () => {
  const totalMinutes = (hours * 60) + minutes;

  if (totalMinutes === 0) {
    alert('Please enter a duration');
    return;
  }

  addManualTimeEntry(
    project.id,
    selectedSoftware as SoftwareName,
    totalMinutes,
    selectedDate,
    selectedShotId || undefined,
    notes || undefined
  );

  setShowManualTimeModal(false);
  // Reset form
};
```

**Store Action** (already implemented in Phase 1):
```typescript
addManualTimeEntry: (projectId, software, durationMinutes, date, shotId?, notes?) => {
  const newEntry: TimeEntry = {
    id: crypto.randomUUID(),
    projectId,
    shotId,
    software,
    startTime: new Date(date).toISOString(),
    endTime: new Date(date).toISOString(),
    durationMinutes,
    isActive: false,
    isManual: true,  // ✓ Marked as manual
    isPaused: false,
    pausedMinutes: 0,
    notes
  };

  // Update project with new entry
  // Recalculate totalMinutesSpent and hourlyRate
}
```

---

### Part B: Break Notifications

#### Goal
Notify users to take breaks after extended work sessions (2h, 4h, 6h).

#### Component: `src/components/time/BreakReminderNotification.tsx`

**Position:** Top-right corner (like DeadlineNotification in App.tsx line 709)

**UI:**
```tsx
<div className="fixed top-12 right-4 z-50 flex flex-col gap-3">
  {/* Deadline notifications */}
  {deadlineNotifications.map(...)}

  {/* Break reminders */}
  {breakReminders.map((reminder) => (
    <div
      key={reminder.id}
      className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 shadow-xl animate-slide-in-right w-80"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
          <Clock className="w-5 h-5 text-yellow-400" />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-white mb-1">
            ⏰ Time to take a break!
          </div>
          <div className="text-sm text-zinc-400 mb-3">
            You've been working for {formatTime(reminder.duration)}
          </div>
          <button
            onClick={() => handleTakeBreak(reminder.sessionId, reminder.breakDuration)}
            className="w-full px-3 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-sm font-medium"
          >
            Take {reminder.breakDuration} min break ☕
          </button>
        </div>
      </div>
    </div>
  ))}
</div>
```

**Auto-dismiss:** After 10 seconds
```typescript
useEffect(() => {
  const timer = setTimeout(() => {
    onDismiss(reminder.id);
  }, 10000);
  return () => clearTimeout(timer);
}, []);
```

**Trigger Logic** (in ProjectDetails or App.tsx):
```typescript
const [breakReminders, setBreakReminders] = useState<BreakReminder[]>([]);

useEffect(() => {
  const checkBreakReminders = async () => {
    const sessions = await invoke<any[]>('get_active_sessions');

    sessions.forEach(session => {
      const minutesWorked = session.accumulated_minutes;

      // Trigger at 2h, 4h, 6h
      const thresholds = [
        { minutes: 120, breakDuration: 5 },
        { minutes: 240, breakDuration: 15 },
        { minutes: 360, breakDuration: 30 }
      ];

      thresholds.forEach(({ minutes, breakDuration }) => {
        // Only trigger once per threshold
        if (minutesWorked === minutes && !hasShownReminder(session.entry_id, minutes)) {
          setBreakReminders(prev => [...prev, {
            id: crypto.randomUUID(),
            sessionId: session.entry_id,
            duration: minutesWorked,
            breakDuration
          }]);
          markReminderShown(session.entry_id, minutes);
        }
      });
    });
  };

  const interval = setInterval(checkBreakReminders, 60000); // Check every minute
  return () => clearInterval(interval);
}, []);
```

**Take Break Action:**
```typescript
const handleTakeBreak = async (sessionId: string, breakMinutes: number) => {
  const activeEntry = getActiveTimeEntry(project.id);
  if (!activeEntry) return;

  // Pause tracking
  await pauseTimeTracking(project.id, sessionId);

  // Auto-resume after break
  setTimeout(async () => {
    await resumeTimeTracking(project.id, sessionId);

    // Show "Break over" notification
    setBreakReminders(prev => [...prev, {
      id: crypto.randomUUID(),
      message: '✓ Break over! Back to work.',
      type: 'success'
    }]);
  }, breakMinutes * 60 * 1000);

  // Dismiss reminder
  setBreakReminders(prev => prev.filter(r => r.sessionId !== sessionId));
};
```

**Settings** (in SettingsPanel):
```tsx
<div className="mb-6">
  <h3 className="text-lg font-semibold mb-3">Break Reminders</h3>

  <label className="flex items-center gap-2 mb-3">
    <input
      type="checkbox"
      checked={breakRemindersEnabled}
      onChange={(e) => setBreakRemindersEnabled(e.target.checked)}
    />
    <span>Enable break reminders</span>
  </label>

  {breakRemindersEnabled && (
    <>
      <div className="mb-2">
        <label className="text-sm text-zinc-400">Remind after (minutes):</label>
        <div className="flex gap-2 mt-1">
          <input
            type="number"
            value={breakIntervals[0]}
            onChange={(e) => updateBreakInterval(0, parseInt(e.target.value))}
            className="w-20 bg-zinc-800 rounded px-2 py-1"
          />
          <input type="number" value={breakIntervals[1]} ... />
          <input type="number" value={breakIntervals[2]} ... />
        </div>
      </div>
    </>
  )}
</div>
```

Store settings in localStorage:
```typescript
localStorage.setItem('breakRemindersEnabled', JSON.stringify(enabled));
localStorage.setItem('breakIntervals', JSON.stringify([120, 240, 360]));
```

---

## 🚧 Phase 4: Export Functionality - **PLANNED**

### Goal
Export time tracking data in multiple formats (CSV, Excel, PDF) for clients or personal records.

### Location
`src/components/time/ExportButton.tsx` - Used in **FinanceProjectDetails**

---

### Component: ExportButton.tsx

**UI - Dropdown Menu:**
```tsx
<div className="relative">
  <button
    onClick={() => setShowMenu(!showMenu)}
    className="px-4 py-2 bg-accent hover:bg-accent/90 rounded-lg flex items-center gap-2"
  >
    <Download className="w-4 h-4" />
    Export Time Report
  </button>

  {showMenu && (
    <div className="absolute top-full mt-2 right-0 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 z-50 min-w-[200px]">
      <button
        onClick={() => handleExport('csv')}
        className="w-full px-4 py-2 text-left hover:bg-zinc-700 flex items-center gap-2"
      >
        <FileSpreadsheet className="w-4 h-4" />
        Export as CSV
      </button>
      <button
        onClick={() => handleExport('xlsx')}
        className="w-full px-4 py-2 text-left hover:bg-zinc-700 flex items-center gap-2"
      >
        <FileSpreadsheet className="w-4 h-4" />
        Export as Excel
      </button>
      <button
        onClick={() => handleExport('pdf')}
        className="w-full px-4 py-2 text-left hover:bg-zinc-700 flex items-center gap-2"
      >
        <FileText className="w-4 h-4" />
        Generate PDF Report
      </button>
    </div>
  )}
</div>
```

---

### Format 1: CSV Export

**Implementation:**
```typescript
const exportCSV = (project: Project) => {
  const entries = project.timeEntries || [];

  // Header
  let csv = 'Time Report: ' + project.name + '\n';
  csv += 'Generated: ' + new Date().toLocaleDateString() + '\n\n';

  // Column headers
  csv += 'Date,Software,Duration (hours),Shot,Notes\n';

  // Data rows
  entries
    .filter(e => !e.isActive) // Only completed entries
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .forEach(entry => {
      const date = new Date(entry.startTime).toLocaleDateString();
      const hours = (entry.durationMinutes / 60).toFixed(2);
      const shot = entry.shotId
        ? `Shot ${project.shots?.find(s => s.id === entry.shotId)?.number || ''}`
        : '';
      const notes = entry.notes || '';

      csv += `${date},${entry.software},${hours},${shot},"${notes}"\n`;
    });

  // Summary
  csv += '\n';
  csv += 'SUMMARY\n';
  csv += `Total Hours,${(project.totalMinutesSpent || 0) / 60}\n`;
  csv += `Hourly Rate (Actual),${project.hourlyRate?.toFixed(2) || 'N/A'}\n`;
  csv += `Hourly Rate (Target),${project.targetHourlyRate?.toFixed(2) || 'N/A'}\n`;
  csv += `Total Cost,${project.cost || 0}\n`;

  if (project.targetHourlyRate && project.totalMinutesSpent) {
    const targetRevenue = project.targetHourlyRate * (project.totalMinutesSpent / 60);
    const difference = targetRevenue - (project.cost || 0);
    csv += `Target Revenue,${targetRevenue.toFixed(2)}\n`;
    csv += `Difference,${difference.toFixed(2)}\n`;
  }

  // Download
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name}_time_report.csv`;
  a.click();
  URL.revokeObjectURL(url);
};
```

---

### Format 2: Excel Export

**Dependencies:**
```bash
npm install xlsx
```

**Implementation:**
```typescript
import * as XLSX from 'xlsx';

const exportExcel = (project: Project) => {
  const entries = project.timeEntries || [];

  // Sheet 1: Time Entries
  const entriesData = entries
    .filter(e => !e.isActive)
    .map(entry => ({
      'Date': new Date(entry.startTime).toLocaleDateString(),
      'Software': entry.software,
      'Duration (hours)': (entry.durationMinutes / 60).toFixed(2),
      'Shot': entry.shotId
        ? `Shot ${project.shots?.find(s => s.id === entry.shotId)?.number || ''}`
        : '',
      'Type': entry.isManual ? 'Manual' : 'Auto',
      'Notes': entry.notes || ''
    }));

  const entriesSheet = XLSX.utils.json_to_sheet(entriesData);

  // Sheet 2: Summary
  const totalHours = (project.totalMinutesSpent || 0) / 60;
  const summaryData = [
    { 'Metric': 'Total Hours', 'Value': totalHours.toFixed(2) },
    { 'Metric': 'Hourly Rate (Actual)', 'Value': project.hourlyRate?.toFixed(2) || 'N/A' },
    { 'Metric': 'Hourly Rate (Target)', 'Value': project.targetHourlyRate?.toFixed(2) || 'N/A' },
    { 'Metric': 'Total Cost', 'Value': project.cost || 0 },
  ];

  const summarySheet = XLSX.utils.json_to_sheet(summaryData);

  // Sheet 3: Software Breakdown
  const timeBySoftware: Record<string, number> = {};
  entries.forEach(e => {
    timeBySoftware[e.software] = (timeBySoftware[e.software] || 0) + e.durationMinutes;
  });

  const softwareData = Object.entries(timeBySoftware).map(([software, minutes]) => ({
    'Software': software,
    'Hours': (minutes / 60).toFixed(2),
    'Percentage': totalHours > 0 ? ((minutes / 60 / totalHours) * 100).toFixed(1) + '%' : '0%'
  }));

  const softwareSheet = XLSX.utils.json_to_sheet(softwareData);

  // Create workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, entriesSheet, 'Time Entries');
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
  XLSX.utils.book_append_sheet(wb, softwareSheet, 'Software Breakdown');

  // Download
  XLSX.writeFile(wb, `${project.name}_time_report.xlsx`);
};
```

---

### Format 3: PDF Report (Professional)

**Dependencies:**
```bash
npm install jspdf jspdf-autotable
```

**Implementation:**
```typescript
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const exportPDF = (project: Project, client?: Client) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('TIME REPORT', pageWidth / 2, 20, { align: 'center' });

  // Project Info
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  let y = 35;
  doc.text(`Project: ${project.name}`, 20, y);
  y += 7;

  if (client) {
    doc.text(`Client: ${client.name}`, 20, y);
    y += 7;
  }

  const startDate = project.timeEntries?.[0]?.startTime
    ? new Date(project.timeEntries[0].startTime).toLocaleDateString()
    : 'N/A';
  const endDate = project.completedAt
    ? new Date(project.completedAt).toLocaleDateString()
    : 'Ongoing';

  doc.text(`Period: ${startDate} - ${endDate}`, 20, y);
  y += 7;
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 20, y);
  y += 15;

  // Summary Box
  doc.setFillColor(240, 240, 240);
  doc.rect(20, y, pageWidth - 40, 40, 'F');
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('SUMMARY', 25, y + 10);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  const totalHours = (project.totalMinutesSpent || 0) / 60;
  const hourlyRate = project.targetHourlyRate || project.hourlyRate || 0;
  const totalCost = project.cost || (totalHours * hourlyRate);

  doc.text(`Total Hours: ${totalHours.toFixed(1)}h`, 25, y + 20);
  doc.text(`Hourly Rate: $${hourlyRate.toFixed(2)}/h`, 25, y + 27);
  doc.text(`Total Cost: $${totalCost.toFixed(2)}`, 25, y + 34);

  y += 50;

  // Software Breakdown Table
  const timeBySoftware: Record<string, number> = {};
  (project.timeEntries || []).forEach(e => {
    timeBySoftware[e.software] = (timeBySoftware[e.software] || 0) + e.durationMinutes;
  });

  const softwareRows = Object.entries(timeBySoftware).map(([software, minutes]) => [
    software.charAt(0).toUpperCase() + software.slice(1),
    `${(minutes / 60).toFixed(1)}h`,
    `$${((minutes / 60) * hourlyRate).toFixed(2)}`
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Software', 'Duration', 'Cost']],
    body: softwareRows,
    theme: 'grid',
    headStyles: { fillColor: [66, 66, 66] }
  });

  y = (doc as any).lastAutoTable.finalY + 15;

  // Detailed Log
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('DETAILED LOG', 20, y);
  y += 10;

  const entries = (project.timeEntries || [])
    .filter(e => !e.isActive)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .map(entry => [
      new Date(entry.startTime).toLocaleDateString(),
      entry.software,
      `${(entry.durationMinutes / 60).toFixed(1)}h`,
      entry.notes || '-'
    ]);

  autoTable(doc, {
    startY: y,
    head: [['Date', 'Software', 'Duration', 'Notes']],
    body: entries,
    theme: 'striped',
    headStyles: { fillColor: [66, 66, 66] },
    styles: { fontSize: 10 }
  });

  // Footer
  const pageCount = doc.internal.pages.length - 1;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.text(
      'Generated with nullSpace',
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }

  // Save
  doc.save(`${project.name}_time_report.pdf`);
};
```

---

### Integration in FinanceProjectDetails

**Add Export Button** (after Time Investment Card, line 209):
```tsx
{/* Time Investment */}
<TimeInvestmentCard project={project} />

{/* Export Options */}
<div className="mt-4">
  <ExportButton project={project} client={client} />
</div>
```

---

## 📚 Additional Utilities

### File: `src/utils/timeTracking.ts`

**Helper functions for time calculations:**
```typescript
export const formatTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
};

export const formatTimeDetailed = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours} hour${hours !== 1 ? 's' : ''} ${mins} minute${mins !== 1 ? 's' : ''}`;
};

export const getWeekStart = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  return new Date(d.setDate(diff));
};

export const getWeeksInRange = (startDate: Date, endDate: Date): Date[] => {
  const weeks: Date[] = [];
  let current = getWeekStart(startDate);

  while (current <= endDate) {
    weeks.push(new Date(current));
    current = new Date(current.setDate(current.getDate() + 7));
  }

  return weeks;
};

export const groupTimeEntriesByWeek = (entries: TimeEntry[]): Record<string, number> => {
  const byWeek: Record<string, number> = {};

  entries.forEach(entry => {
    const weekStart = getWeekStart(new Date(entry.startTime));
    const weekKey = weekStart.toISOString().split('T')[0];
    byWeek[weekKey] = (byWeek[weekKey] || 0) + entry.durationMinutes;
  });

  return byWeek;
};

export const calculateHourlyRate = (cost: number, minutes: number): number => {
  return minutes > 0 ? cost / (minutes / 60) : 0;
};

export const calculateProjectedRevenue = (
  targetRate: number,
  actualMinutes: number
): number => {
  return targetRate * (actualMinutes / 60);
};
```

---

## 🧪 Testing Checklist

### Phase 1 (Core Tracking)
- [ ] Launch Blender → Timer appears in button
- [ ] Timer increments every minute
- [ ] Pause → Timer stops, shows paused state
- [ ] Resume → Timer continues
- [ ] Stop → Timer disappears, time saved
- [ ] Close Blender → Timer auto-stops within 10 seconds
- [ ] TimeInfoBar shows correct time + hourly rate
- [ ] Multiple software tracking (Blender + Houdini simultaneously)
- [ ] Shot-based tracking works correctly

### Phase 2 (Analytics)
- [ ] TimeAnalytics section appears on FinancePage
- [ ] Software breakdown shows correct percentages
- [ ] Weekly chart displays last 12 weeks
- [ ] Statistics cards show accurate data
- [ ] Global hourly rate calculates correctly
- [ ] Charts update when projects change

### Phase 3 (Manual Entry & Notifications)
- [ ] Manual entry modal opens/closes correctly
- [ ] Date picker works
- [ ] Duration inputs validate (max 59 minutes)
- [ ] Shot selection works (when applicable)
- [ ] Manual entry saves to project
- [ ] Break reminder appears at 2h/4h/6h
- [ ] "Take break" pauses tracking
- [ ] Auto-resume after break duration
- [ ] Settings to enable/disable reminders work

### Phase 4 (Export)
- [ ] CSV export downloads correctly
- [ ] Excel export has 3 sheets with correct data
- [ ] PDF report generates with proper formatting
- [ ] Export includes all time entries
- [ ] Summary calculations are accurate
- [ ] Software breakdown in reports is correct

---

## 🐛 Known Issues & Edge Cases

### Issue 1: Software Name Mismatch
**Problem:** Old time entries may have software name with capital letters (`"Blender"`) instead of lowercase (`"blender"`).

**Solution:** Add migration in `loadProjects`:
```typescript
projects.forEach(project => {
  if (project.timeEntries) {
    project.timeEntries = project.timeEntries.map(entry => ({
      ...entry,
      software: entry.software.toLowerCase().replace(/\s+/g, '-') as SoftwareName
    }));
  }
});
```

### Issue 2: Timer Not Disappearing
**Cause:** Process died but frontend doesn't know yet.

**Solution:**
- Check every **3 seconds** instead of 10 seconds (implemented in Phase 1)
- Also check immediately when window gains focus
- This ensures timer disappears within 3 seconds maximum after software closes

**Code** (ProjectDetails.tsx:51-86):
```typescript
useEffect(() => {
  if (!activeEntry) return;

  const checkSession = async () => {
    const sessions = await invoke<any[]>('get_active_sessions');
    const session = sessions.find(s => s.entry_id === activeEntry.id);
    if (!session) {
      await stopTimeTracking(project.id, activeEntry.id);
    }
  };

  checkSession(); // Immediate check
  const checkInterval = setInterval(checkSession, 3000); // Every 3 seconds
  window.addEventListener('focus', checkSession); // On focus

  return () => {
    clearInterval(checkInterval);
    window.removeEventListener('focus', checkSession);
  };
}, [activeEntry]);
```

### Issue 3: Multiple Active Sessions for Same Software
**Prevention:** In `launchSoftware`, check if software already has active session:
```typescript
const existingSession = getActiveTimeEntry(project.id);
if (existingSession && existingSession.software === softwareKey) {
  alert('This software is already being tracked!');
  return;
}
```

### Issue 4: Timezone Issues with Manual Entries
**Solution:** Always use ISO timestamps, display in user's local timezone:
```typescript
const displayDate = new Date(entry.startTime).toLocaleDateString(
  undefined, // User's locale
  { year: 'numeric', month: 'short', day: 'numeric' }
);
```

---

## 📊 Performance Considerations

### Backend Optimization
- **Batch Updates:** Instead of saving to disk every minute, batch updates every 5 minutes
- **Memory Management:** Clean up dead sessions immediately to prevent memory leaks
- **Process Checks:** Use `sysinfo` crate efficiently (already refreshes only necessary data)

### Frontend Optimization
- **Memoization:** Use `React.memo` for TimeAnalytics components
- **Debouncing:** Debounce chart re-renders when data changes
- **Virtual Lists:** If time entries list grows large (>100 items), use virtualization
- **Lazy Loading:** Load charts only when Finance tab is visible

---

## 🚀 Future Enhancements (Post Phase 4)

### 1. Time Budgets
Set time budgets per project and get warnings when approaching limit.

### 2. Team Collaboration
Track multiple users' time on same project (requires backend user system).

### 3. Invoice Generation
Auto-generate invoices based on tracked time and hourly rates.

### 4. Calendar View
View time entries in a calendar format (like Google Calendar).

### 5. Integrations
- Export to Toggl/Harvest
- Sync with Google Calendar
- Slack notifications for break reminders

### 6. AI Insights
- Predict project completion time based on current pace
- Suggest optimal work hours based on productivity patterns
- Detect procrastination (low focused time despite long sessions)

---

## 📝 Notes

- All times stored in **minutes** (not seconds) for simplicity
- Only **focused time** counted (window must be active)
- **Paused time** not included in totals
- **Manual entries** marked with `isManual: true` flag
- **Hourly rate priority:** Target > Calculated from cost/time
- **Currency handling:** Uses project's currency, converts when needed

---

## 🔗 Related Files

### Core Implementation
- `src-tauri/src/time_tracking.rs`
- `src-tauri/src/main.rs` (launch_software, Project struct)
- `src/types/project.ts` (TimeEntry interface)
- `src/store/projectStore.ts` (time tracking actions)

### Components
- `src/components/time/InlineTimer.tsx`
- `src/components/time/TimeInfoBar.tsx`
- `src/components/project/ProjectDetails.tsx`

### To Be Created (Phase 2-4)
- `src/components/time/TimeAnalytics.tsx`
- `src/components/time/SoftwareBreakdownList.tsx`
- `src/components/time/WeeklyTimeChart.tsx`
- `src/components/time/ManualTimeEntryModal.tsx`
- `src/components/time/BreakReminderNotification.tsx`
- `src/components/time/ExportButton.tsx`
- `src/utils/timeTracking.ts`

---

**Last Updated:** October 20, 2025
**Version:** 1.0 (Phase 1 Complete)
