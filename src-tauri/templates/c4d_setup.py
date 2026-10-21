"""
Cinema 4D Project Setup Script for nullSpace
Run with c4dpy: c4dpy c4d_setup.py <c4d_file_path> [shot_code]
Only configures the render output path and frame range - all other settings remain the user's defaults
"""

import os
import sys

import c4d


def main():
    if len(sys.argv) < 2:
        print("ERROR: Usage: c4dpy c4d_setup.py <c4d_file_path> [shot_code]")
        sys.exit(1)

    path = sys.argv[1]
    shot = sys.argv[2] if len(sys.argv) > 2 else None
    doc_dir = os.path.dirname(path)

    print(f"Setting up Cinema 4D project: {path} (shot: {shot})")

    doc = c4d.documents.BaseDocument()

    # === FRAME RANGE (same as Blender: 1001-1250) ===
    fps = doc.GetFps()
    start = c4d.BaseTime(1001, fps)
    end = c4d.BaseTime(1250, fps)
    # Max first: the default range ends at frame 90, and a min above the current max may get clamped
    doc.SetMaxTime(end)
    doc.SetMinTime(start)
    doc.SetLoopMaxTime(end)
    doc.SetLoopMinTime(start)
    doc.SetTime(start)

    # === RENDER OUTPUT PATH ===
    # Relative to the document folder (Cinema4D/SCENE/), like Blender's //Render/Preview/<shot>/
    render_dir = f"Render/Preview/{shot}" if shot else "Render/Preview"
    rd = doc.GetActiveRenderData()
    rd[c4d.RDATA_PATH] = f"{render_dir}/$prj"
    rd[c4d.RDATA_FRAMESEQUENCE] = c4d.RDATA_FRAMESEQUENCE_ALLFRAMES
    rd[c4d.RDATA_FRAMEFROM] = start
    rd[c4d.RDATA_FRAMETO] = end
    # Shot folders already exist (create_shot_folders); Asset/Compose contexts have no Render/ yet
    os.makedirs(os.path.join(doc_dir, render_dir), exist_ok=True)
    print(f"Render output path set to: {render_dir}/$prj")

    # === SAVE ===
    os.makedirs(doc_dir, exist_ok=True)
    doc.SetDocumentPath(doc_dir)
    doc.SetDocumentName(os.path.basename(path))
    ok = c4d.documents.SaveDocument(
        doc, path, c4d.SAVEDOCUMENTFLAGS_DONTADDTORECENTLIST, c4d.FORMAT_C4DEXPORT
    )
    if not ok:
        print(f"ERROR: Failed to save {path}")
        sys.exit(1)

    print(f"Project saved: {path}")
    sys.exit(0)


if __name__ == "__main__":
    main()
