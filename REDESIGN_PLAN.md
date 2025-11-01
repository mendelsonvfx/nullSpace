# RayHub Redesign Plan

**Based on:** nullspace_project_page.html design reference
**Target Pages:** Project Details & Project List
**Date:** 2025-11-01

---

## Table of Contents

1. [Design Analysis](#design-analysis)
2. [Current State Assessment](#current-state-assessment)
3. [Design System Updates](#design-system-updates)
4. [Project List Redesign](#project-list-redesign)
5. [Project Details Redesign](#project-details-redesign)
6. [Implementation Roadmap](#implementation-roadmap)
7. [Component Breakdown](#component-breakdown)

---

## Design Analysis

### nullSpace Design Language

After analyzing the reference HTML file, here are the key design characteristics:

#### Color Palette
- **Primary Background:** `#0a0a0a` (Very dark, almost black)
- **Secondary Background:** `#0f0f0f` (Sidebar, panels)
- **Card Background:** `#141414` (Interactive elements)
- **Borders:** `#1a1a1a` and `#262626` (Multi-level hierarchy)
- **Text Primary:** `#e4e4e7` (White text)
- **Text Secondary:** `#71717a` (Muted labels)
- **Accent Purple:** `#8b5cf6` → `#6366f1` (Gradient)
- **Status Colors:**
  - Active/Completed: `#10b981` (Green)
  - AE/Purple: `#9333ea` → `#c084fc`
  - Blender/Orange: `#f97316` → `#fb923c`
  - Client/Blue: `#3b82f6` → `#60a5fa`
  - Payment/Yellow: `#f59e0b` → `#fbbf24`
  - Prepaid/Orange: `#fb923c`

#### Typography
- **Font Family:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- **Project Title:** `28px`, `font-weight: 700`
- **Section Titles:** `14px`, `font-weight: 600`
- **Card Titles:** `15px`, `font-weight: 600`
- **Body Text:** `12px-14px`
- **Badges:** `11px-12px`, `font-weight: 500`

#### Spacing & Layout
- **3-Column Layout:** Sidebar (280px) + Main Content (1fr) + Right Panel (320px)
- **Border Radius:**
  - Cards: `10px-14px`
  - Buttons: `8px-10px`
  - Badges: `6px`
- **Padding:**
  - Cards: `12px-20px`
  - Sections: `28px` margin bottom
  - Content: `28px-32px` padding

#### Interactive Elements
- **Hover Effects:**
  - `transform: translateY(-2px)` for cards
  - Brightness increase
  - Border color transitions
- **Transitions:** `all 0.2s ease` (standard)
- **Glow Effects:** Box-shadow with color alpha
- **Scrollbars:** Custom 6px-8px width, `#262626` color

#### Key UI Patterns

1. **Cards with Gradients**
   - Background gradient overlays for software cards
   - Radial gradients from bottom-left corner
   - Hover state increases opacity/coverage

2. **Status Indicators**
   - Small circular badges (8px) with glow effect
   - Checkmarks for completed items
   - Color-coded states

3. **Badge System**
   - Rounded pill badges with semi-transparent backgrounds
   - `rgba(color, 0.15)` background + solid text color
   - Icons optional inside badges

4. **Software Launch Cards**
   - Large icons (64px) with gradient backgrounds
   - Hover reveals gradient overlay across entire card
   - Centered layout with subtitle

5. **Versions Grid**
   - Auto-fill minmax(110px, 1fr) grid
   - Centered icon + version number
   - Compact square cards

6. **Links & Input**
   - Icon on left (32px container)
   - Dashed border for input states
   - Add button with accent color background

7. **File Tree**
   - Nested items with 20px margin-left
   - Expandable folders with chevrons
   - Icon + text layout

---

## Current State Assessment

### Current RayHub Design (Problems to Address)

#### Project List (App.tsx lines 1299-1441)
**Current Issues:**
- ✗ Cards use thumbnail backgrounds with overlays (hard to read text)
- ✗ Inconsistent badge sizing and colors
- ✗ Status indicator is tiny (3px)
- ✗ Software icons are very small (no emphasis)
- ✗ Limited visual hierarchy
- ✗ Deadline/payment badges blend together
- ✗ No hover animations or lift effects

**Current Good Parts:**
- ✓ Using Tailwind CSS
- ✓ Proper state management with Zustand
- ✓ Memoized components for performance
- ✓ Context menu support

#### Project Details (ProjectDetails.tsx)
**Current Issues:**
- ✗ Header is compact but lacks visual interest
- ✗ Quick Actions buttons are simple (no icons/gradients)
- ✗ Software cards lack visual punch
- ✗ No right sidebar for project structure
- ✗ Sections are plain, lack polish
- ✗ Missing versions overview grid
- ✗ Output section is basic placeholder
- ✗ No file tree visualization

**Current Good Parts:**
- ✓ Shot management UI is functional
- ✓ Tag system works well
- ✓ Inline timer integration
- ✓ Comprehensive settings modal

---

## Design System Updates

### 1. Color Tokens (Update `tailwind.config.js`)

```javascript
colors: {
  // Background hierarchy
  'app-bg': '#0a0a0a',          // Main app background
  'sidebar-bg': '#0f0f0f',      // Sidebar/panels
  'card-bg': '#141414',         // Cards and buttons
  'hover-bg': '#1a1a1a',        // Hover states

  // Borders
  'border-primary': '#1a1a1a',
  'border-secondary': '#262626',
  'border-hover': '#3f3f46',

  // Text
  'text-primary': '#e4e4e7',
  'text-secondary': '#a1a1aa',
  'text-muted': '#71717a',
  'text-dim': '#52525b',

  // Accent (keep existing variable-based system, add defaults)
  'accent-default': '#8b5cf6',
  'accent-default-hover': '#7c3aed',

  // Status colors
  'status': {
    'active': '#10b981',
    'paused': '#f59e0b',
    'completed': '#3b82f6',
    'archived': '#71717a'
  },

  // Software colors
  'software': {
    'blender': '#f97316',
    'ae': '#9333ea',
    'houdini': '#ff4713',
    'maya': '#0faded',
    'cinema4d': '#0099d8',
    // ... etc
  }
}
```

### 2. Border Radius Scale

```javascript
borderRadius: {
  'card': '12px',      // Project cards, major elements
  'button': '8px',     // Buttons, inputs
  'badge': '6px',      // Small badges
  'software': '14px'   // Software launch cards
}
```

### 3. Shadow System

```javascript
boxShadow: {
  'glow-green': '0 0 8px rgba(16, 185, 129, 0.5)',
  'glow-yellow': '0 0 8px rgba(245, 158, 11, 0.5)',
  'glow-blue': '0 0 8px rgba(59, 130, 246, 0.5)',
  'glow-accent': '0 0 8px rgba(139, 92, 246, 0.5)',
  'card-hover': '0 4px 12px rgba(0, 0, 0, 0.3)'
}
```

### 4. Typography Scale

```javascript
fontSize: {
  'project-title': '28px',
  'section-title': '14px',
  'card-title': '15px',
  'badge': '11px'
}
```

---

## Project List Redesign

### New Layout Structure

```
┌─────────────────────────────────────────┐
│ [Icon] Project Name          [Pin] [⭐] │  ← Header
│                                    [●]   │  ← Status
├─────────────────────────────────────────┤
│ Description text here...                │  ← Description
├─────────────────────────────────────────┤
│ [Bl] [Ae] [Ho]                          │  ← Software icons (larger)
├─────────────────────────────────────────┤
│ [Client Badge]  [Tag1] [Tag2]           │  ← Badges row
│                  [Paid] [15d left]      │  ← Payment/Deadline
└─────────────────────────────────────────┘
```

### Key Changes

1. **Remove Thumbnail Backgrounds**
   - Use solid `#141414` background
   - Optional: subtle gradient from left `rgba(accent, 0.05)`
   - Keep accent color bottom gradient on hover

2. **Larger Software Icons**
   - Increase from current size to `20px` (w-5 h-5)
   - Add background circles with software-specific colors
   - Arrange in prominent row below description

3. **Enhanced Status Indicator**
   - Increase from `3px` to `8px` (w-2 h-2)
   - Add glow effect when timer active: `shadow-glow-{color}`
   - Position: top-right corner

4. **Better Badge System**
   - Client badge: semi-transparent background with client color
   - Tags: `bg-zinc-800/80` with proper padding
   - Payment status: color-coded (green for paid, yellow for prepaid)
   - Deadline: red/yellow/gray based on urgency

5. **Hover Effects**
   - Add `transform: translateY(-2px)` on hover
   - Border color transition to accent
   - Gradient overlay fade-in at bottom
   - Subtle scale animation

6. **Card Spacing**
   - Padding: `p-4` (16px) instead of `p-3`
   - Gap between cards: `gap-3` instead of `gap-1`
   - Rounded corners: `rounded-xl` (12px)

### Component Updates

**File:** `src/components/ProjectCard.tsx`

Changes needed:
1. Remove background image system
2. Add solid background with optional gradient
3. Restructure children layout (move from App.tsx to ProjectCard component)
4. Add hover transform and shadow effects
5. Implement new badge component structure

**File:** `src/App.tsx` (lines 1299-1441)

Changes needed:
1. Restructure project card content layout
2. Larger software icons with backgrounds
3. Improved badge hierarchy
4. Better deadline/payment display
5. Status indicator with glow effects

---

## Project Details Redesign

### New 3-Column Layout

```
┌─────────┬─────────────────────────────────┬──────────────┐
│         │  HEADER                         │              │
│ LEFT    │  [Title] [Completed] [+tag]    │    RIGHT     │
│ SIDEBAR │  [⭐] [⚙] [✕]                   │   SIDEBAR    │
│         ├─────────────────────────────────┤              │
│ (New)   │  SHOT TABS (if applicable)     │  PROJECT     │
│         │  [Shot 050] [Shot 080+] ...    │  STRUCTURE   │
│         ├─────────────────────────────────┤              │
│ Search  │  QUICK ACTIONS                 │  File Tree   │
│ Filter  │  [📁 Open] [💳 Pay] [🕐 Time]  │  - Ae/       │
│ Project │                                 │    - Assets  │
│ List    │  LAUNCH SOFTWARE               │    - Footage │
│         │  ┌──────────┬──────────┐       │  - Blender/  │
│         │  │ Blender  │    Ae    │       │    - Models  │
│         │  │   [icon] │  [icon]  │       │              │
│         │  └──────────┴──────────┘       │  METADATA    │
│         │                                 │  Created:    │
│         │  VERSIONS OVERVIEW             │  Size:       │
│         │  [v010] [v005] [v004] ...      │  Time:       │
│         │                                 │              │
│         │  OUTPUT OVERVIEW               │              │
│         │  [No outputs found]            │              │
│         │                                 │              │
│         │  LINKS                          │              │
│         │  [🔗 Link name]                │              │
│         │                                 │              │
│         │  TASKS                          │              │
│         │  [☑] Task one                  │              │
│         │  [ ] Task two                  │              │
│         │                                 │              │
│         │  NOTES                          │              │
│         │  [Rich text editor]            │              │
└─────────┴─────────────────────────────────┴──────────────┘
```

### Major Changes

#### 1. Add Left Sidebar (New Component)

**File:** `src/components/project/LeftSidebar.tsx` (NEW)

Features:
- Search box for projects (same as nullspace)
- Filter tabs: All / Fav / Archive
- Mini project list (shows all projects, allows quick switching)
- Each mini card shows: name, status dot, software icons
- Active project highlighted with accent border
- New Project button at bottom

Layout:
- Width: `280px`
- Background: `#0f0f0f`
- Border right: `1px solid #1a1a1a`

#### 2. Add Right Sidebar (New Component)

**File:** `src/components/project/RightSidebar.tsx` (EXISTS but needs redesign)

Current file seems basic. Redesign to match nullspace:

Features:
- **Project Structure (File Tree)**
  - Expandable folder tree
  - Show actual project folders (AfterEffects/, Blender/, Output/, etc.)
  - Nested items with 20px indent
  - Folder icons with chevrons
  - File icons for files

- **Metadata Section**
  - Created date
  - Completed date (if applicable)
  - Time spent (total from time tracking)
  - Project size (calculated from folder)
  - Payment info
  - Client info

Layout:
- Width: `320px`
- Background: `#0f0f0f`
- Border left: `1px solid #1a1a1a`
- Custom scrollbar (6px)

#### 3. Redesign Main Content Area

**File:** `src/components/project/ProjectDetails.tsx`

##### Header Section
- Project title: `text-2xl` → `text-[28px]`, `font-bold`
- Status badge: completed/active with green background
- Tags: improved styling with better spacing
- Action icons: Star, Settings, Edit, Close with hover effects

##### Quick Actions
Current:
```tsx
<button className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700">
  <FolderOpen className="w-4 h-4" />
  <span>Open Folder</span>
</button>
```

New (nullspace style):
```tsx
<div className="action-card">
  <div className="action-icon folder">
    <FolderOpen className="w-5 h-5" />
  </div>
  <div className="action-text">Open Folder</div>
</div>
```

Styling:
- Card: `p-3 bg-[#141414] border border-[#1a1a1a] rounded-lg`
- Icon container: `w-9 h-9 rounded-lg` with gradient background
  - Folder: Blue gradient
  - Payment: Green gradient
  - Time: Yellow gradient
- Hover: `transform: translateY(-2px)`, accent border

##### Launch Software Cards
Current:
- Simple rectangular cards
- Small icons on left
- Plain background

New (nullspace style):
- Larger cards (2-column grid)
- Centered 64px icon with gradient background
- Software name + "Click to launch" subtitle
- Radial gradient background from corner:
  ```css
  background: radial-gradient(
    circle at 0% 120%,
    ${softwareColor}15 0%,
    transparent 80%
  ), rgb(24, 24, 27)
  ```
- Hover: gradient intensifies to 40% opacity
- Active timer shows inline widget

Design:
```
┌─────────────────────────┐
│                         │
│       [64px Icon]       │
│         Blender         │
│    Click to launch      │
│                         │
└─────────────────────────┘
```

##### Versions Overview (NEW)

**File:** `src/components/project/VersionsOverview.tsx` (EXISTS, needs upgrade)

New design:
- Header with filters: "All | Other | Ae | Blender"
- Grid layout: `grid-cols-[repeat(auto-fill,minmax(110px,1fr))]`
- Each version card:
  - 44px icon (software logo or "Ae" text)
  - Version number below
  - Centered layout
  - `bg-[#141414]` with hover effects

##### Output Overview

**File:** `src/components/project/OutputOverview.tsx` (EXISTS, needs redesign)

Current: Basic empty state
New:
- Large empty state box with icon and text
- When outputs exist: thumbnail grid of renders
- Scan `Render/Preview` and `Render/Final` folders
- Show video/image previews

##### Links Section
Current: Basic list
New (nullspace style):
- Each link: icon (32px container) + link text + external icon
- Add link input: dashed border, icon + input + add button
- Hover: accent border

##### Tasks Section
- Date separators between task groups
- Checkbox styling: `w-5 h-5`, accent color when checked
- Checkmark icon when completed
- Grouped by creation date with dividers

##### Notes Section
Keep existing MDX editor but improve container styling

---

## Implementation Roadmap

### Phase 1: Design System Foundation (Day 1)
1. Update `tailwind.config.js` with new color tokens
2. Add new border radius, shadow, and typography utilities
3. Create new CSS variables in `App.css`
4. Test that existing components still work

**Files to modify:**
- `tailwind.config.js`
- `src/App.css`

### Phase 2: Project List Redesign (Day 2)
1. Remove thumbnail background system from `ProjectCard.tsx`
2. Implement new card layout structure
3. Add hover animations and transitions
4. Redesign badge components
5. Enlarge software icons with colored backgrounds
6. Update status indicator with glow effects

**Files to modify:**
- `src/components/ProjectCard.tsx`
- `src/App.tsx` (lines 1299-1441)

### Phase 3: Project Details - Quick Actions & Software (Day 3)
1. Redesign Quick Actions cards with icon containers
2. Implement new Software Launch card design
3. Add radial gradient backgrounds
4. Update hover effects and transitions
5. Ensure timer integration still works

**Files to modify:**
- `src/components/project/ProjectDetails.tsx` (lines 467-623)

### Phase 4: Versions & Output (Day 4)
1. Upgrade `VersionsOverview.tsx` with filter tabs
2. Implement grid layout with centered icons
3. Redesign `OutputOverview.tsx` with better empty state
4. Add render thumbnail grid when files exist

**Files to modify:**
- `src/components/project/VersionsOverview.tsx`
- `src/components/project/OutputOverview.tsx`

### Phase 5: Left Sidebar (Day 5)
1. Create new `LeftSidebar.tsx` component
2. Implement search functionality
3. Add filter tabs (All/Fav/Archive)
4. Create mini project card component
5. Add "New Project" button
6. Integrate into ProjectDetails layout

**Files to create:**
- `src/components/project/LeftSidebar.tsx`
- `src/components/project/MiniProjectCard.tsx`

**Files to modify:**
- `src/components/project/ProjectDetails.tsx` (wrap in 3-column layout)

### Phase 6: Right Sidebar Redesign (Day 6)
1. Upgrade existing `RightSidebar.tsx`
2. Implement TreeView with proper icons and nesting
3. Add metadata section
4. Calculate and display project size
5. Show time tracking totals
6. Style with custom scrollbar

**Files to modify:**
- `src/components/project/RightSidebar.tsx`
- `src/components/project/TreeView.tsx`

### Phase 7: Polish & Refinement (Day 7)
1. Fine-tune animations and transitions
2. Test all interactive elements
3. Verify responsive behavior
4. Ensure theme switching works
5. Performance optimization (memoization check)
6. Accessibility improvements (keyboard navigation)

### Phase 8: Testing & Bug Fixes (Day 8)
1. Full regression testing
2. Test with different project types
3. Test with/without shots
4. Test with/without time tracking
5. Fix any visual bugs
6. Cross-check with nullspace reference

---

## Component Breakdown

### New/Modified Components

#### 1. `LeftSidebar.tsx` (NEW)
```tsx
interface LeftSidebarProps {
  projects: Project[];
  selectedProjectId: string;
  onSelectProject: (project: Project) => void;
  onCreateProject: () => void;
}

export function LeftSidebar({ ... }: LeftSidebarProps) {
  // Search state
  // Filter state (all/fav/archive)
  // Filtered projects list

  return (
    <div className="w-[280px] bg-[#0f0f0f] border-r border-[#1a1a1a]">
      {/* Logo */}
      {/* Search box */}
      {/* Filter tabs */}
      {/* Projects list (scrollable) */}
      {/* New project button */}
    </div>
  );
}
```

#### 2. `MiniProjectCard.tsx` (NEW)
```tsx
interface MiniProjectCardProps {
  project: Project;
  isActive: boolean;
  onClick: () => void;
}

export function MiniProjectCard({ ... }: MiniProjectCardProps) {
  return (
    <div className={`mini-project-card ${isActive ? 'active' : ''}`}>
      {/* Project name */}
      {/* Status indicator */}
      {/* Description (truncated) */}
      {/* Software icons + badges */}
    </div>
  );
}
```

#### 3. `ProjectCard.tsx` (MAJOR REDESIGN)
Remove:
- Thumbnail background image system
- Current gradient overlay

Add:
- Solid background `#141414`
- Optional left-edge accent gradient
- Bottom hover gradient (keep)
- Hover lift animation
- Improved shadow on hover

#### 4. `QuickActionCard.tsx` (NEW)
```tsx
interface QuickActionCardProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  variant: 'folder' | 'payment' | 'time';
}

export function QuickActionCard({ ... }: QuickActionCardProps) {
  const gradients = {
    folder: 'from-blue-500/20 to-blue-700/10',
    payment: 'from-green-500/20 to-green-700/10',
    time: 'from-yellow-500/20 to-yellow-700/10'
  };

  return (
    <div className="action-card">
      <div className={`action-icon bg-gradient-to-br ${gradients[variant]}`}>
        {icon}
      </div>
      <div className="action-text">{label}</div>
    </div>
  );
}
```

#### 5. `SoftwareLaunchCard.tsx` (NEW)
```tsx
interface SoftwareLaunchCardProps {
  software: Software;
  onLaunch: () => void;
  isLaunching: boolean;
  activeTimer?: TimeEntry;
}

export function SoftwareLaunchCard({ ... }: SoftwareLaunchCardProps) {
  return (
    <div
      className="software-card"
      style={{
        background: `
          radial-gradient(circle at 0% 120%, ${color}15 0%, transparent 80%),
          rgb(24, 24, 27)
        `
      }}
    >
      <div className="software-icon">{/* 64px icon */}</div>
      <div className="software-name">{software.name}</div>
      <div className="software-subtitle">Click to launch</div>
      {activeTimer && <InlineTimer entry={activeTimer} />}
    </div>
  );
}
```

#### 6. `VersionCard.tsx` (NEW)
```tsx
interface VersionCardProps {
  version: Version;
  onClick: () => void;
}

export function VersionCard({ version }: VersionCardProps) {
  return (
    <div className="version-card">
      <div className="version-icon">
        {/* Software icon or "Ae" text */}
      </div>
      <div className="version-number">{version.name}</div>
    </div>
  );
}
```

#### 7. `FileTreeItem.tsx` (NEW)
```tsx
interface FileTreeItemProps {
  name: string;
  type: 'file' | 'folder';
  depth: number;
  isExpanded?: boolean;
  onToggle?: () => void;
  children?: ReactNode;
}

export function FileTreeItem({ ... }: FileTreeItemProps) {
  return (
    <div
      className="tree-item"
      style={{ marginLeft: `${depth * 20}px` }}
    >
      <div className="tree-icon">{/* Folder or file icon */}</div>
      <span>{name}</span>
      {type === 'folder' && (
        <span className="chevron">{isExpanded ? '▼' : '▶'}</span>
      )}
    </div>
  );
}
```

---

## Styling Reference

### Key CSS Classes to Add

```css
/* Action Cards */
.action-card {
  @apply p-3 bg-[#141414] border border-[#1a1a1a] rounded-lg
         flex items-center gap-3 cursor-pointer transition-all;
}

.action-card:hover {
  @apply border-accent-default transform -translate-y-0.5;
}

.action-icon {
  @apply w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0;
}

.action-icon.folder {
  @apply bg-gradient-to-br from-blue-500/20 to-blue-700/10;
}

.action-icon svg {
  @apply w-5 h-5 text-blue-400;
}

/* Software Cards */
.software-card {
  @apply p-5 border border-[#1a1a1a] rounded-[14px]
         flex flex-col items-center gap-3 cursor-pointer
         transition-all duration-300 relative overflow-hidden;
}

.software-card:hover {
  @apply border-border-secondary transform -translate-y-1;
}

.software-icon {
  @apply w-16 h-16 rounded-[14px] flex items-center justify-center
         text-4xl font-bold mb-1;
}

.software-icon.blender {
  @apply bg-gradient-to-br from-[#f97316] to-[#ea580c];
}

.software-icon.ae {
  @apply bg-gradient-to-br from-[#9333ea] to-[#7c3aed] text-[28px];
}

.software-name {
  @apply text-base font-semibold text-text-primary;
}

.software-subtitle {
  @apply text-xs text-text-muted;
}

/* Version Cards */
.version-card {
  @apply p-3.5 bg-[#141414] border border-[#1a1a1a] rounded-lg
         text-center cursor-pointer transition-all;
}

.version-card:hover {
  @apply bg-[#1a1a1a] border-accent-default/30 transform -translate-y-0.5;
}

.version-icon {
  @apply w-11 h-11 mx-auto mb-2 rounded-lg
         flex items-center justify-center text-lg font-semibold;
}

.version-icon.ae-icon {
  @apply bg-[#9333ea]/20 text-[#c084fc];
}

.version-icon.blender-icon {
  @apply bg-[#f97316]/20 text-[#fb923c];
}

.version-number {
  @apply text-sm font-semibold text-text-primary;
}

/* File Tree */
.tree-item {
  @apply p-2 bg-[#141414] border border-[#1a1a1a] rounded-md
         flex items-center gap-2 cursor-pointer transition-all text-xs;
}

.tree-item:hover {
  @apply bg-[#1a1a1a] border-border-secondary;
}

.tree-item.folder {
  @apply font-medium;
}

.tree-item.expanded {
  @apply bg-[#1a1a1a];
}

.tree-icon {
  @apply w-[18px] flex items-center justify-center flex-shrink-0;
}

.tree-icon svg {
  @apply w-4 h-4 text-text-secondary;
}

.chevron {
  @apply ml-auto text-text-dim text-[10px];
}

/* Mini Project Cards (for left sidebar) */
.mini-project-card {
  @apply bg-[#141414] border border-[#1a1a1a] rounded-xl p-4
         cursor-pointer transition-all relative;
}

.mini-project-card:hover {
  @apply border-border-secondary bg-[#171717];
}

.mini-project-card.active {
  @apply bg-gradient-to-br from-accent-default/10 to-accent-default/5
         border-accent-default/30;
}

.mini-project-card-header {
  @apply flex justify-between items-start mb-2;
}

.mini-project-name {
  @apply text-[15px] font-semibold text-text-primary;
}

.mini-project-status {
  @apply w-2 h-2 rounded-full;
}

.mini-project-desc {
  @apply text-xs text-text-muted mb-3 line-clamp-2;
}

.mini-project-meta {
  @apply flex items-center gap-2 flex-wrap;
}
```

---

## Technical Considerations

### 1. Performance
- Use `memo()` for all new card components (MiniProjectCard, VersionCard, etc.)
- Use `useMemo()` for filtered/computed lists
- Use `useCallback()` for event handlers passed to children
- Lazy load images in file tree and output overview
- Virtual scrolling for large project lists (optional, if >100 projects)

### 2. Accessibility
- Proper ARIA labels for all interactive elements
- Keyboard navigation support (Tab, Enter, Arrows)
- Focus indicators (outline with accent color)
- Screen reader announcements for status changes
- Color contrast ratios meet WCAG AA standards

### 3. Responsive Behavior
- Three-column layout works down to ~1280px width
- Below 1280px: hide left sidebar (toggle with button)
- Below 1024px: hide right sidebar (toggle with button)
- Mobile view (<768px): stack layout, full-width panels

### 4. Animation Performance
- Use `transform` and `opacity` for animations (GPU accelerated)
- Avoid animating `width`, `height`, `top`, `left`
- Use `will-change` sparingly on hover targets
- Disable animations on low-power devices (prefers-reduced-motion)

### 5. Theme System Integration
- Ensure all new colors use CSS variables where possible
- Accent color should work with new gradient system
- Support for custom accent color from settings
- Dark mode only (no light mode needed based on current design)

---

## Testing Checklist

### Visual Testing
- [ ] Project cards display correctly without thumbnails
- [ ] Software icons have proper colored backgrounds
- [ ] Status indicators glow when timer active
- [ ] Badges are properly sized and colored
- [ ] Hover effects work smoothly
- [ ] Quick action cards have gradient icons
- [ ] Software launch cards have radial gradients
- [ ] Versions grid lays out correctly
- [ ] File tree expands/collapses properly
- [ ] Left sidebar filters projects correctly
- [ ] Right sidebar shows metadata accurately

### Functional Testing
- [ ] Project selection works from mini cards
- [ ] Software launch still works
- [ ] Timer integration displays correctly
- [ ] Version filtering works (All/Ae/Blender/etc)
- [ ] File tree loads actual project structure
- [ ] Search in left sidebar filters correctly
- [ ] Favorite/Archive filters work
- [ ] All modals still function
- [ ] Settings persist correctly
- [ ] Context menus work

### Performance Testing
- [ ] No lag when scrolling project list
- [ ] Smooth animations on all interactions
- [ ] Fast project switching
- [ ] File tree loads without delay
- [ ] No memory leaks after extended use

### Cross-Browser Testing
- [ ] Chrome/Edge
- [ ] Firefox
- [ ] Safari (if available)

---

## Design Assets Needed

### Icons
- Using existing Lucide React icons (already in project)
- Software icons: existing SoftwareIcon component

### Colors
- All defined in design system section
- No custom assets needed

### Fonts
- System fonts (already configured)
- No custom fonts needed

---

## Migration Notes

### Breaking Changes
- `ProjectCard` component API will change (children structure)
- `ProjectDetails` will require new props for sidebar data
- `RightSidebar` component structure will change

### Backwards Compatibility
- All Zustand stores remain unchanged
- Project data structure unchanged
- Time tracking integration unchanged
- No breaking changes to user data

### Rollback Plan
If redesign causes issues:
1. Git branch for redesign work
2. Keep old components in `components/legacy/`
3. Feature flag to toggle between old/new UI
4. Can revert commit if critical bugs found

---

## Future Enhancements (Post-Redesign)

1. **Drag & Drop**
   - Reorder shots
   - Drag projects between categories
   - Drag files to add links

2. **Customization**
   - User-configurable layouts
   - Show/hide sections
   - Custom badge colors

3. **Advanced Features**
   - Project templates
   - Bulk operations
   - Advanced filtering

4. **Collaboration**
   - Shared projects
   - Comments/annotations
   - Activity feed

---

## Conclusion

This redesign brings RayHub's visual design in line with modern project management tools while maintaining its unique focus on creative software workflows. The nullSpace-inspired design provides:

- **Better Visual Hierarchy:** Clear separation of content areas
- **Improved Usability:** Larger touch targets, better contrast
- **Professional Polish:** Smooth animations, consistent spacing
- **Enhanced Workflow:** Quick project switching, better file navigation
- **Scalability:** Structure supports future features

The implementation roadmap spreads work over 8 days, allowing for iterative development and testing at each phase.

**Estimated Total Time:** 8 days (40-50 hours)

**Priority:** High (improves core user experience)

**Risk:** Medium (extensive UI changes, needs thorough testing)

---

**Document Version:** 1.0
**Created:** 2025-11-01
**Author:** Claude Code Assistant
