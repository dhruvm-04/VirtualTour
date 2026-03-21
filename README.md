# PES University EC Campus Virtual Tour

Interactive 3D walkthrough of the Engineering Block built with Three.js.

## Features

- First-person walkthrough of the main block and interior spaces
- Teleport hotspots for Lift, Lab, and Classroom
- Desktop controls with pointer lock + WASD movement
- Mobile controls with swipe look + virtual joystick movement
- Environment lighting with EXR map support
- Guided mode and fullscreen toggle

## Project Structure

- index.html: main page and UI shell
- style.css: UI styling and responsive layout
- main.js: Three.js scene, model loading, controls, interactions
- assets/: GLB models and EXR lighting maps

## Requirements

- Modern browser with WebGL support
- Internet access for CDN imports used by Three.js and loaders

## Run Locally

You can run this project with any static server.

Option 1: VS Code Live Server

1. Open the project folder in VS Code
2. Start Live Server on index.html
3. Open the served URL in your browser

Option 2: Python static server

1. Open terminal in this folder
2. Run: python -m http.server 8000
3. Open: http://localhost:8000

## Controls

Desktop:

- Move: W A S D
- Look: Mouse
- Unlock pointer: Esc
- Hotspots: Click

Mobile:

- Move: Left joystick
- Look: Swipe
- Hotspots: Tap

## Assets

Expected files inside assets/:

- mainblock.glb
- classroom.glb
- lift.glb
- grasslands_sunset_2k.exr
- the_sky_is_on_fire_2k.exr

## Deployment Notes

- On Vercel-hosted domains, assets are resolved from the GitHub media URL configured in main.js.
- On local/self-hosted runs, assets load from the local assets/ folder.
- 
## Credits

Developed as a Digital Twin mini project for PES University EC Campus.