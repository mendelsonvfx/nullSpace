<div align="center">

<img src="src-tauri/icons/128x128.png" width="96" alt="nullSpace icon">

# nullSpace

**Desktop project manager for 3D & VFX artists**

Shots, versions, renders, time and money — in one place, wired into the tools you already use.

![Version](https://img.shields.io/badge/version-1.9.45-7c3aed?style=flat-square)
![Platform](https://img.shields.io/badge/platform-Windows-0078d4?style=flat-square&logo=windows&logoColor=white)
![Tauri](https://img.shields.io/badge/Tauri-1-24c8db?style=flat-square&logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6?style=flat-square&logo=typescript&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-stable-dea584?style=flat-square&logo=rust&logoColor=black)
![License](https://img.shields.io/badge/license-proprietary-555?style=flat-square)

</div>

---

## About

nullSpace keeps a freelance or small-studio VFX project organized from first file to final payment. It builds the folder structure, names and versions your scene files, launches the right software for the right shot, tracks how long you spend in it, and turns it into clear financial reports.

<p align="center">
  <img src="docs/screenshots/project.png" alt="Project view: shots browser, tasks, versions and software launcher">
</p>
<p align="center">
  <img src="docs/screenshots/finance.png" width="49%" alt="Finance: revenue, pending payments and statistics">
  <img src="docs/screenshots/time.png" width="49%" alt="Time analytics: software breakdown and weekly timeline">
</p>

## Features

<table>
<tr>
<td width="50%" valign="top">

**📁 Projects & shots**
- Scene / shot structure with auto-generated folders per software
- Statuses, categories, favorites and search
- Shot rename that propagates to every file on disk
- Shared `_GlobalAssets` and `_GlobalCompose` folders

</td>
<td width="50%" valign="top">

**🎞️ Versions & renders**
- Launching a shot creates the next versioned scene file
- Render browser with image-sequence detection and frame ranges
- Preview / Final and per-software filters
- File watcher refreshes versions and outputs live

</td>
</tr>
<tr>
<td valign="top">

**⏱️ Time tracking**
- Automatic tracking by the running software process
- Manual entries and per-shot history
- Weekly timeline and per-software breakdown
- Break reminders

</td>
<td valign="top">

**💰 Finance**
- Clients and multi-currency with live exchange rates
- Paid / prepaid / unpaid with prepayment amounts
- Hourly and daily rate calculations
- Project reports in PDF, CSV, JSON or Markdown

</td>
</tr>
<tr>
<td valign="top">

**✅ Tasks & notes**
- Tasks per project and shot with priority, deadline and attachments
- Markdown notes and reference links
- Deadline notifications
- File tree with folder colors and F2 rename

</td>
<td valign="top">

**🧰 Workflow**
- Tool Launcher for any extra app or script
- NullConverter actions in the render context menu
- Built-in auto-updater
- Full data export / import

</td>
</tr>
</table>

## Supported software

Every app below gets launch-from-shot, versioned file naming and automatic time tracking. On top of that:

| | Software | Extra integration |
|:-:|---|---|
| <img src="public/logos/blender.png" width="20"> | **Blender** | Relative paths set up on file creation · `.blend` thumbnails |
| <img src="public/logos/houdini.png" width="20"> | **Houdini** | `.hip` / `.hiplc` / `.hipnc` picked by edition (FX / Indie / Apprentice) |
| <img src="public/logos/cinema4d.png" width="20"> | **Cinema 4D** | Render path and frame range set up on file creation · `.c4d` thumbnails |
| <img src="public/logos/substance.png" width="20"> | **Substance Painter** | New projects auto-saved under the version name |
| <img src="public/logos/unreal.png" width="20"> | **Unreal Engine** | `.uproject` created on first launch |
| <img src="public/logos/after-effects.png" width="20"> | **After Effects** | Starts from a clean template · Global Compose |
| <img src="public/logos/davinci.png" width="20"> | **DaVinci Resolve** | Open Project / Save Version scripts, `.drp` versions · Global Compose |
| <img src="public/logos/photoshop.png" width="20"> | **Photoshop** | `.psd` / `.psb` thumbnails |

## Build from source

**Requirements:** Windows 10/11 · Node.js 20+ · Rust stable

```bash
npm ci
npm run tauri dev      # run in development
npm run tauri build    # MSI / NSIS installers in src-tauri/target/release/bundle
```

> The auto-updater reads `UPDATE_TOKEN` at compile time. Without it the app builds and runs normally, only update checks are disabled.
> Release builds are produced by [`.github/workflows/release.yml`](.github/workflows/release.yml) on every `v*.*.*` tag.

## License

Proprietary. All rights reserved.
