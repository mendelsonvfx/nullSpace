"""
Blender Project Setup Script for nullSpace
This script ONLY configures relative paths - all other settings remain user's defaults
"""

import bpy
import sys
import os

def setup_blender_project(blend_file_path, project_root):
    """
    Configure Blender project with relative paths ONLY

    Args:
        blend_file_path: Full path to the .blend file to create
        project_root: Root directory of the nullSpace project
    """

    print(f"Setting up Blender project: {blend_file_path}")
    print(f"Project root: {project_root}")

    # Get the Blender folder relative to project root
    blender_folder = os.path.dirname(blend_file_path)

    # === RENDER OUTPUT PATH ONLY ===
    # Set render output to relative path: //Render/Preview/v001/
    bpy.context.scene.render.filepath = "//Render/Preview/v001/"
    print("✓ Render output path set to: //Render/Preview/v001/")

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
    print("Configured paths:")
    print(f"  - Render:     //Render/Preview/v001/")
    print(f"  - Cache:      //Cache/")
    print("All other settings (render format, fps, units, etc.) remain default")
    print("=====================================\n")


def main():
    """Main entry point for the script"""
    # Parse command line arguments
    # Blender passes args after '--'
    argv = sys.argv

    if "--" not in argv:
        print("ERROR: No arguments provided")
        print("Usage: blender --background --python blender_setup.py -- <blend_file_path> <project_root>")
        sys.exit(1)

    # Get arguments after '--'
    args = argv[argv.index("--") + 1:]

    if len(args) < 2:
        print("ERROR: Missing required arguments")
        print("Usage: blender --background --python blender_setup.py -- <blend_file_path> <project_root>")
        sys.exit(1)

    blend_file_path = args[0]
    project_root = args[1]

    # Setup the project
    setup_blender_project(blend_file_path, project_root)

    print("Blender setup script completed successfully")
    print("Process will be terminated by nullSpace after save")

    # Note: We don't call quit - the parent process will kill us
    # This avoids the hang issue with bpy.ops.wm.quit_blender()


if __name__ == "__main__":
    main()
