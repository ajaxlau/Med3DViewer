# NTEC 3D Printing Office — Medical 3D Viewer

An interactive, high-performance web-based 3D Medical Model Viewer, Virtual Surgical Planning (miniVSP) suite, and Virtual Endoscopy platform developed for the **Medical 3D Printing Service**.

---

## 📖 Introduction

**Medical 3D Viewer** (formerly 3D Viewer Plus) is a client-side, hardware-accelerated 3D anatomical visualization and virtual surgical planning platform. Engineered for clinicians, orthopedic and maxillofacial surgeons, radiologists, and biomedical engineers, the platform enables rapid 3D anatomical model inspection, virtual osteotomy and resection planning, trajectory/implant alignment, precision metrology, spline-based virtual endoscopy fly-throughs, and cross-platform medical data exchange directly within any modern web browser without requiring software installation or plugins.

---

## 🌟 Key Platform Features

### 1. 🧊 High-Performance 3D Medical Visualization
* **Universal 3D Format Support**: Seamlessly render and inspect STL (Binary & ASCII), OBJ (+MTL), 3DM (Rhino), glTF/GLB, STEP/STP, PLY, 3DS, FBX, DAE, IGES, OFF, and DXF models.
* **Hierarchical Mesh Inspector**: Interactive tree view listing all sub-meshes with individual visibility toggles, opacity controls, custom color assignment, and selection highlighting.
* **Global Opacity & Model Explosion**: Smoothly explode complex multi-part anatomical assemblies or adjust global transparency for internal structure inspection.
* **3-Axis Dynamic Cross-Section Clipping**: Real-time orthogonal clipping planes along X, Y, and Z axes with direction flipping to examine internal cavities, canals, and bone structures.
* **Dynamic Measurement Rulers**: Calibrated horizontal and vertical viewport overlay rulers providing real-time millimeter scale referencing synchronized with camera movement.
* **Radiological Image Underlay**: Overlay 2D reference images (X-rays, CT/MRI slices, surgical sketches) with adjustable transparency behind the 3D anatomical model.

### 2. 🩺 Virtual Surgical Planning (miniVSP) Suite
* **Resection & Osteotomy Planes**: Define custom cutting and osteotomy planes by picking 3 surface anatomical landmarks with configurable margin extensions and slab thickness.
* **Implant Canal & Screw Trajectory Cylinders**: Plan drill trajectories, guide pins, and pedicle screw pathways with customizable diameter and bidirectional extension.
* **Anatomical Contours & Spline Curves**: Trace complex osteotomy lines, nerve pathways, or resection margins using smooth multi-point 3D splines with customizable tube thickness.
* **Cephalometric & Anatomical Point Landmarks**: Snap precise 3D fiducial markers to anatomical surfaces with custom sphere diameters.
* **Custom Model Overlay**: Directly import custom STL implants, fixation plates, or surgical guides into the active planning session.

### 3. 🔬 Virtual Endoscopy & Spline Resection Analytics
* **Curved Anatomical Fly-Through (Virtual Endoscopy)**:
  * Spline-guided endoscopic camera navigation through hollow viscera, vascular trees, airways, and surgical tracts.
  * Real-time Head-Up Display (HUD) with 0.6mm stepping intervals (forward/reverse), percentage progress slider, and live distance readouts in millimeters.
  * Endoscopic reticle overlay with anatomical quadrant indicators (Superior, Inferior, Left, Right).
  * Advanced scope tuning: customizable Scope Field of View (FOV: 50°–110°), Wall Look Trim (Pan/Tilt yaw & pitch offsets), and 2D Path Offsets (Lateral & Elevation displacement in mm).
* **Spline Cross-Sectional Resection (Spline Clipping)**:
  * Dynamic cross-sectional slicing along any 3D spline curve with 0.6mm slice resolution.
  * Orthogonal plane slicing with Camera Lock (`Lock Clip View`) and slice direction inversion (`Flip View`, Key: `I`).

### 4. 📐 Precision Metrology & Interactive 3D Gizmos
* **Linear & Angular Measurement**:
  * Accurate point-to-point Euclidean 3D distance calculation with floating screen-projected distance badges.
  * 3-point angle measurement with dynamic degrees readout for deformity and joint angle assessment.
* **3D Transform Controls (Gizmos)**:
  * Intuitive Translate, Rotate, and Scale manipulators for planning planes, cylinders, custom models, and guides.
  * Real-time visual rotation angle arcs, translation trajectory delta lines, and HUD badges indicating exact displacements.
  * Full matrix world synchronization and coordinate inheritance across duplications.

### 5. ⚡ WebGPU / WebGL2 Hardware Acceleration & Resilience
* **Multi-Tier Graphics Pipeline**: Automatically detects and leverages WebGPU when supported, with seamless fallback to WebGL 2.0 or legacy hardware compatibility mode.
* **Context Loss Protection**: Built-in WebGL context loss listeners (`webglcontextlost` / `webglcontextrestored`) that gracefully suspend operations and automatically reconstruct scenes upon GPU driver recovery.
* **Adaptive Fill-Rate Optimization**: Automatically tunes device pixel ratio and procedural geometry complexity to match GPU capabilities, maintaining high frame rates.
* **GPU Diagnostic Inspector**: Interactive hardware diagnostic modal detailing GPU vendor, renderer, shader architecture, and real-time status.

### 6. 🗂️ Planning Object & Group Hierarchy Management
* **Group Management**: Organize planning elements into custom named folders and collapsible groups with bulk visibility controls.
* **Intelligent Duplication**: Clone individual planning objects or entire groups while preserving world matrices, orientations, scale, and styling.
* **Color & Opacity Customization**: Color-code planning objects for distinct surgical stages, anatomical boundaries, or hardware types.
* **Automatic Local Persistence**: Automatic browser storage of planning objects, group hierarchies, and spatial transforms indexed by model filename.

### 7. 🔄 Interoperability & Medical Data Exchange
* **Model Space Aligned STL Export**: Export individual planning objects, osteotomy planes, resection cylinders, or custom models as binary/ASCII STL files aligned to the loaded anatomical model's LPS/Cartesian coordinate system.
* **Full Planning Bundle (ZIP) Export/Import**: Export and restore entire planning workspaces including all 3D geometries, custom models, and comprehensive JSON metadata (`appMetaData`).
* **3D Slicer Markups JSON Compatibility**: Seamlessly import and export 3D Slicer markups (`.mrk.json`) for cross-application research and clinical review.

### 8. 📸 Snapshot Studio & Collaboration
* **High-Resolution Snapshot Studio**: Capture clean viewport snapshots with watermarking, timestamps, custom dimensions, and transparent or solid backgrounds.
* **Automated 360° Orbit Capture**: Generate 6-view 360° orbit snapshots at 60° increments with in-memory preview, single-click ZIP archive packaging, and direct WhatsApp sharing.
* **Deep-Linking & URL Auto-Load**: Load remote models automatically using `#model=<URL>$camera=...` or `?url=<URL>`.
* **QR Code Sharing**: Generate instant QR codes containing model references and 3D camera viewpoints for mobile and tablet consultation.
* **Progressive Web App (PWA)**: Built with full offline PWA caching support for reliable performance in hospital networks and offline surgical suites.

---

## ⌨️ User Controls & Keyboard Shortcuts

| Shortcut / Action | Function |
| :--- | :--- |
| **Left Click + Drag** | Orbit / Rotate Camera around model |
| **Right Click + Drag / Two-Finger Drag** | Pan Camera across viewport |
| **Scroll Wheel / Pinch** | Zoom in / Zoom out |
| **Key `1`** | Front View |
| **Key `2`** | Back View |
| **Key `3`** | Left View |
| **Key `4`** | Right View |
| **Key `5`** | Top View |
| **Key `6`** | Bottom View |
| **Key `R`** | Reset Camera to default model framing |
| **Key `F`** | Toggle Fullscreen Mode |
| **Key `I`** | Flip/Invert Spline Clipping direction (when Spline Clipping is active) |
| **Arrow Left / Right** | Step -0.6mm / +0.6mm along spline in Endoscopy & Spline Clipping modes |
| **Key `Escape`** | Exit active Endoscopy, Spline Clipping, or modal dialog |
| **Drag & Drop** | Drop 3D model files, Slicer markups (`.mrk.json`), or ZIP bundles directly into viewport |

---

## 🛠️ Technology Stack

* **Core Framework**: React 19, TypeScript
* **Build Tooling & Bundling**: Vite, Tailwind CSS v4, ESBuild
* **3D Rendering & Geometry Engine**: Three.js, Online 3D Viewer (OV Core v0.18.0), WebGPU / WebGL2
* **Archive & Data Parsing**: JSZip, Slicer Markups JSON Parser, STLLoader
* **Animation & UI Components**: Motion (Framer Motion), Lucide React Icons
* **Sharing & Connectivity**: QRCode.react, Service Worker / Vite PWA

---

## 🏥 Clinical & Educational Disclaimer

This software is developed as an interactive visualization and research planning aid. It is not certified as a standalone medical device. Users should exercise independent clinical judgment and validation when utilizing generated planning models for actual surgical interventions.

---

## 📄 License

This project is licensed under the open-source **MIT License** with an Educational & Research Use Notice — see the [LICENSE](LICENSE) file for details.

---

*Developed for NTEC 3D Printing Office (3DPO) — Advancing Personalized Medicine through 3D Innovation.*

<a href="https://info.flagcounter.com/6ewu"><img src="https://s01.flagcounter.com/count2/6ewu/bg_FFFFFF/txt_000000/border_CCCCCC/columns_2/maxflags_10/viewers_0/labels_0/pageviews_0/flags_0/percent_0/" alt="Free counters!" border="0"></a>

