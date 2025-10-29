# nullSpace

<div align="center">

**Desktop Project Manager for VFX Artists & 3D Designers**

![Version](https://img.shields.io/badge/version-0.9.99--beta-purple)
![Tauri](https://img.shields.io/badge/Tauri-1.6-orange)
![React](https://img.shields.io/badge/React-19-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)

</div>

---

## 🎯 About

**nullSpace** is a powerfull desktop application designed specifically for VFX artists and 3D designers to manage their creative projects. It combines project management, financial tracking, and seamless integration with industry-standard 3D software into one intuitive interface.

## ✨ Key Features

### 📁 Project Management
- **Shot-Based Project Structure** with numbered shots (Shot_001, Shot_002, etc.)
- **Smart Project Creation** with automatic folder structure generation for different software types
- **Project Status Tracking**: Active, Paused, Completed, Archived
- **Tagging System** for easy categorization
- **Favorites & Pinning** for quick access to important projects
- **Advanced Search & Filtering** to find projects instantly
- **Version Control** integration for tracking project history
- **Shot Completion Tracking** with visual checkmark indicators

### 🎬 Render Output Management
- **Output Overview System** for browsing and managing render outputs
- **Smart Folder Grouping** with expandable/collapsible hierarchy
- **Filter by Software** (Blender, Houdini, After Effects, etc.) and output type (Preview/Final)
- **Image Sequence Detection** with automatic frame count and range display
- **Output Caching** with 5-minute TTL for instant navigation
- **Context Menus** to reveal outputs in explorer or copy paths
- **Persistent UI State** - remembers selected filters and expanded groups per project

### ⏱️ Time Tracking System
- **Project & Shot-Level Time Tracking** with manual and automatic time entry
- **Weekly Analytics** with visual timeline showing last 12 weeks of activity
- **Per-Software Time Breakdowns** to analyze where time is spent
- **Active Session Management** with pause/resume functionality
- **Hourly Rate Calculations** and productivity metrics
- **Visual Status Indicators** - projects glow green (active), yellow (paused), or blue (completed)
- **Work Session History** for detailed time analysis

### 📂 File Operations
- **Move/Copy Version Files Between Shots** via right-click context menu
- **Auto-Copy File Paths** - right-click any file/folder in TreeView to copy path
- **Folder Coloring System** for visual organization (6 colors: red, blue, green, yellow, purple, pink)
- **File Visibility Toggles** to hide/show specific files
- **Reveal in Explorer** functionality across the entire app
- **Smart Filename Parsing** - preserves version numbers while updating shot prefixes
- **3-Level Directory Tree** visualization optimized for performance

### 🎨 Software Integration
Seamlessly work with your favorite tools:
- **3D Software**: Blender, Houdini, Maya, Cinema 4D, ZBrush, Marmoset
- **Compositing**: After Effects
- **Texturing**: Substance Designer/Painter
- **Game Engines**: Unreal Engine, Unity
- **2D Software**: Photoshop

**New Features:**
- **Auto-Detect Software Paths** - one-click detection via Windows Registry scanning
- **Direct Software Launching** with file tracking
- **Pre-Configured Folder Templates** optimized for production workflows
- **Per-Software Time Tracking** integration

### 💰 Financial Management
- **Project Cost Tracking** with multi-currency support (USD, RUB, EUR)
- **"Other Project" Transactions** - manual transactions for work outside project scope
- **Payment Status**: Paid, Prepaid, Unpaid with completion date tracking
- **Client Database** with contact information and color coding
- **Financial Analytics** with interactive timeline and visual charts
- **Revenue Insights**: average project value, payment trends, client analysis
- **Configurable Revenue Thresholds** per currency for normalization
- **Date Sorting** for transaction history (default sort method)

### 📝 Productivity Tools
- **Todo Lists** for projects and individual shots
- **Markdown Notes Editor** with rich formatting support
- **Browser Tab Manager** for saving reference links
- **Deadline Tracking** with notifications
- **File Tree Visualization** with folder coloring and copy-on-right-click
- **Shot-Specific Organization** - separate todos, notes, tabs per shot

### 🖼️ Visual Organization
- **Project Thumbnails** for quick visual identification with 3-tier caching
- **Custom Colors** for clients and projects
- **Folder Coloring** in TreeView for better file organization
- **Modern UI** with dark theme optimized for creative workflows
- **Status Glow Effects** for active time-tracked projects
- **Faster Animations** (0.15s) for snappier feel
- **Enhanced Context Menus** with category submenus and auto-positioning

### ⚡ Performance & Technical Features
- **Output Caching System** - reduces redundant file system scans
- **Smart Loading States** - prevents UI flickering during navigation
- **Cross-Platform Support** (Windows/macOS/Linux via Tauri + Rust)
- **Debounced File Watcher** - monitors project changes without freezing
- **IndexedDB Caching** for thumbnails and versions
- **Optimized Re-Renders** with React.memo throughout
- **Rust Backend** for reliable file operations and software detection

### 🛠️ Advanced Features
- **Context Menu System** with multi-level submenus
- **Category Management** with "Move to..." submenu
- **Software Folder Separation** - automatically groups software-specific folders
- **Blender Project Structure** with Compositing/Plates folder for VFX workflows
- **Frame Sequence Grouping** in output scanner
- **Persistent Expanded State** for folder groups and outputs

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** (v18 or higher)
- **Rust** (latest stable version)
- **npm** or **pnpm**

### Installation

1. Clone the repository:
```bash
git clone https://github.com/mendelsonvfx/nullSpace.git
cd nullSpace
```

2. Install dependencies:
```bash
npm install
```

3. Run in development mode:
```bash
npm run tauri dev
```

4. Build for production:
```bash
npm run tauri build
```

---

## 🔧 Technology Stack

- **Frontend**: React 19, TypeScript, Vite
- **Desktop Framework**: Tauri 1.6
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Markdown Editor**: MDXEditor
- **Icons**: Lucide React

---

## 📖 Usage

### Creating a Project
1. Click the **+ New Project** button
2. Fill in project details (name, description, client)
3. Select the software you'll be using
4. Choose or customize the folder structure template
5. Set deadlines and financial information (optional)

### Managing Finances
1. Navigate to the **Finance** page
2. View paid and pending projects
3. Analyze revenue with interactive charts
4. Filter by date, currency, or client

### Organizing Work
- Use **tags** to categorize projects by type or client
- Set **deadlines** to track time-sensitive work
- Add **notes** in Markdown for project documentation
- Save **browser tabs** with reference materials

---

## 📌 Beta Status

This is a **beta release** (v0.9.6-beta). While the application is functional and ready for testing, please note:

- Some features may be refined in future updates
- Regular backups of your project data are recommended
- Bug reports and feature requests are welcome!
- **Known Limitation:** Auto-refresh for file changes is temporarily disabled (manual refresh required)

### 📚 Documentation
- [CODE_AUDIT_REPORT.md](CODE_AUDIT_REPORT.md) - Comprehensive code audit with identified issues
- [DEVELOPMENT_HISTORY.md](DEVELOPMENT_HISTORY.md) - Development timeline and major changes
- [KNOWN_ISSUES.md](KNOWN_ISSUES.md) - Current limitations and workarounds

---

## 🤝 Contributing

Contributions are welcome! If you'd like to contribute:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

This project is private and proprietary. All rights reserved.

---

## 🐛 Bug Reports & Feature Requests

Found a bug or have an idea? Please open an issue on GitHub with:
- Clear description of the issue/feature
- Steps to reproduce (for bugs)
- Screenshots if applicable

---

## 🙏 Acknowledgments

Built with passion for the VFX and 3D community.

Special thanks to:
- [Tauri](https://tauri.app/) for the amazing desktop framework
- [React](https://react.dev/) team
- All open-source contributors

---

<div align="center">

**Made with ❤️ for artists, by artist**

</div>
