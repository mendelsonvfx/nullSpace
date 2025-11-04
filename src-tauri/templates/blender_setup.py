"""
Blender Project Setup Script for nullSpace
This script ONLY configures relative paths - all other settings remain user's defaults
"""

import bpy
import sys
import os

def setup_blender_project(blend_file_path, project_root, scene_code=None, shot_code=None):
    """
    Configure Blender project with relative paths ONLY

    Args:
        blend_file_path: Full path to the .blend file to create
        project_root: Root directory of the nullSpace project
        scene_code: Scene code (e.g., "SC_001", "SC_RIVER")
        shot_code: Shot code (e.g., "SH001", "SH000")
    """

    print(f"Setting up Blender project: {blend_file_path}")
    print(f"Project root: {project_root}")
    print(f"Scene: {scene_code}, Shot: {shot_code}")

    # Get the Blender folder relative to project root
    blender_folder = os.path.dirname(blend_file_path)

    # === RENDER OUTPUT PATH ONLY ===
    # Build render path with scene and shot hierarchy if provided
    if scene_code and shot_code:
        # Path: //Render/Preview/SC_XXX/SH###/
        render_path = f"//Render/Preview/{scene_code}/{shot_code}/"
        print(f"✓ Render output path set to: {render_path}")
    elif scene_code:
        # Path: //Render/Preview/SC_XXX/
        render_path = f"//Render/Preview/{scene_code}/"
        print(f"✓ Render output path set to: {render_path}")
    else:
        render_path = "//Render/Preview/"
        print("✓ Render output path set to: //Render/Preview/")

    bpy.context.scene.render.filepath = render_path

    # === FRAME RANGE ===
    # Set frame range to 1001-1250
    bpy.context.scene.frame_start = 1001
    bpy.context.scene.frame_end = 1250
    bpy.context.scene.frame_current = 1001
    print("✓ Frame range set to: 1001-1250")

    # === FILE OUTPUT SETTINGS ===
    # Enable relative paths by default
    bpy.context.preferences.filepaths.use_relative_paths = True
    print("✓ Relative paths enabled")

    # Set auto-save location to Cache/Temp
    bpy.context.preferences.filepaths.temporary_directory = os.path.join(blender_folder, "Cache", "Temp")
    print("✓ Temporary directory: Cache/Temp")

    # === SAVE THE FILE ===
    # Ensure directory exists
    os.makedirs(os.path.dirname(blend_file_path), exist_ok=True)

    # Save with relative paths
    bpy.ops.wm.save_as_mainfile(filepath=blend_file_path, relative_remap=True)
    print(f"✓ Project saved: {blend_file_path}")

    print("\n=== Blender Project Setup Complete ===")
    print("Configured settings:")
    print(f"  - Render:       //Render/Preview/v001/")
    print(f"  - Cache:        //Cache/")
    print(f"  - Frame Range:  1001-1250")
    print("All other settings (render format, fps, units, etc.) remain default")
    print("=====================================\n")


def main():
    """Main entry point for the script"""
    # Parse command line arguments
    # Blender passes args after '--'
    argv = sys.argv

    if "--" not in argv:
        print("ERROR: No arguments provided")
        print("Usage: blender --background --python blender_setup.py -- <blend_file_path> <project_root> [scene_code] [shot_code]")
        sys.exit(1)

    # Get arguments after '--'
    args = argv[argv.index("--") + 1:]

    if len(args) < 2:
        print("ERROR: Missing required arguments")
        print("Usage: blender --background --python blender_setup.py -- <blend_file_path> <project_root> [scene_code] [shot_code]")
        sys.exit(1)

    blend_file_path = args[0]
    project_root = args[1]
    scene_code = args[2] if len(args) > 2 else None
    shot_code = args[3] if len(args) > 3 else None

    # Setup the project
    setup_blender_project(blend_file_path, project_root, scene_code, shot_code)

    print("Blender setup script completed successfully")
    print("Process will be terminated by nullSpace after save")

    # Note: We don't call quit - the parent process will kill us
    # This avoids the hang issue with bpy.ops.wm.quit_blender()


if __name__ == "__main__":
    main()
