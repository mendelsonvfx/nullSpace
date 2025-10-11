# nullSpace

<div align="center">

**Desktop Project Manager for VFX Artists & 3D Designers**

![Version](https://img.shields.io/badge/version-0.9.6--beta-purple)
![Tauri](https://img.shields.io/badge/Tauri-1.6-orange)
![React](https://img.shields.io/badge/React-19-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)

</div>

---

## 🎯 About

**nullSpace** is a simple desktop application designed specifically for VFX artists and 3D designers to manage their creative projects. It combines project management, financial tracking, and seamless integration with industry-standard 3D software into one intuitive interface.

## ✨ Key Features

### 📁 Project Management
- **Smart Project Creation** with automatic folder structure generation for different software types
- **Project Status Tracking**: Active, Paused, Completed, Archived
- **Tagging System** for easy categorization
- **Favorites & Pinning** for quick access to important projects
- **Advanced Search & Filtering** to find projects instantly
- **Version Control** integration for tracking project history

### 🎨 Software Integration
Seamlessly work with your favorite tools:
- **3D Software**: Blender, Houdini, (Maya, Cinema 4D, ZBrush, Marmoset in progress)
- **Compositing**: After Effects
- **Texturing**: Substance Designer/Painter

Each software comes with pre-configured folder templates optimized for production workflows.

### 💰 Financial Management
- **Project Cost Tracking** with multi-currency support (USD, RUB, EUR)
- **Payment Status**: Paid, Prepaid, Unpaid
- **Client Database** with contact information and color coding
- **Financial Analytics** with visual charts and breakdowns
- **Revenue Insights**: average project value, payment trends, client analysis

### 📝 Productivity Tools
- **Todo Lists** for each project
- **Markdown Notes Editor** with rich formatting support
- **Browser Tab Manager** for saving reference links
- **Deadline Tracking** with notifications
- **File Tree Visualization** of project structure

### 🖼️ Visual Organization
- **Project Thumbnails** for quick visual identification
- **Custom Colors** for clients and projects
- **Modern UI** with dark theme optimized for creative workflows

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

This is a **beta release** (v0.9.0-beta). While the application is functional and ready for testing, please note:

- Some features may be refined in future updates
- Regular backups of your project data are recommended
- Bug reports and feature requests are welcome!

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
