# Software Logos

This directory contains logo images for various 3D/VFX software applications.

## Required Logos

Place PNG logo files (preferably 512x512px or higher) with the following names:

- `blender.png` - Blender 3D
- `houdini.png` - SideFX Houdini
- `after-effects.png` - Adobe After Effects
- `maya.png` - Autodesk Maya
- `cinema4d.png` - Maxon Cinema 4D
- `substance.png` - Adobe Substance
- `unreal.png` - Unreal Engine
- `unity.png` - Unity
- `zbrush.png` - Pixologic ZBrush
- `marmoset.png` - Marmoset Toolbag

## Logo Guidelines

- **Format**: PNG with transparent background
- **Size**: 512x512px or higher (square)
- **Style**: Official brand logos preferred
- **Naming**: Use lowercase with hyphens (e.g., `after-effects.png`)

## Where to Find Logos

You can download official logos from:
- **Blender**: https://www.blender.org/about/logo/
- **Houdini**: https://www.sidefx.com/
- **After Effects**: Adobe Brand Resources
- **Maya**: Autodesk Media Center
- **Cinema 4D**: Maxon Brand Resources
- **Substance**: Adobe Brand Resources
- **Unreal Engine**: Epic Games Brand Guidelines
- **Unity**: Unity Brand Resources
- **ZBrush**: Pixologic Resources
- **Marmoset**: Marmoset Brand Resources

## Fallback

If a logo file is missing, the application will display a gradient icon with the first letter of the software name.

## Adding New Software

To add a new software logo:
1. Add the PNG file to this directory
2. Update the `logoMap` in `src/components/SoftwareIcon.tsx`
3. The filename should match the pattern: `software-name.png`
