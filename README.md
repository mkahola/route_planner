# Modular Web Route Planner

A lightweight, modular, and privacy-friendly web application for route planning, track building, and GPX management.
This tool allows users to map points manually, automatically calculate routes following road networks, import
existing GPX tracks, and merge or export them seamlessly.

Built using **Vanilla JS (ES Modules)**, **Leaflet.js**, and an **OpenRouteService (ORS)** backend proxy.

---

## 🚀 Features

* **Interactive Mapping:** Built on Leaflet.js utilizing OpenStreetMap data.
* **Smart Routing:** Automatically snaps to roads using an OpenRouteService proxy.
* **Avoid Motorways Toggle:** Allows routing customization to avoid major highways/motorways.
* **Dual-Language Support:** Fully localizable structure (supports English and Finnish out of the box based on browser preferences).
* **GPX Utilities:**
    * Import multiple `.gpx` files simultaneously.
    * Intelligent map marker pruning (Douglas-Peucker simplification) to prevent browser lag with high-density tracks.
    * Merge disconnected tracks seamlessly into a unified route.
    * Export planned tracks back into a standard `.gpx` file.
* **Clean Floating UI:** Maximized map space with a sleek, floating hamburger menu and retractable sidebar.
* **Geolocation:** Centers on your current location automatically if permission is granted.

---

## 📂 Project Structure

The project relies completely on native browser ES Modules, eliminating the need for complex build tools like Webpack or Vite.

```text
├── css/
│   └── style.css       # Unified responsive design and UI variable system
├── js/
│   ├── api.js          # Handles Geocoding (Nominatim) and Routing (ORS Proxy)
│   ├── app.js          # App core, DOM interactions, and state manager
│   ├── gpx.js          # GPX XML parser and exporter engines
│   ├── i18n.js         # Fault-tolerant internationalization dictionary
│   ├── map.js          # Leaflet map configuration, marker logic, and overlays
│   └── utils.js        # Mathematical helper algorithms (Haversine & Douglas-Peucker)
├── index.html          # Clean entry point document
└── setup.sh            # Automatic Unix environment initializer

🗺️ How to Use
Plan a Route: Left-click anywhere on the map to place your first waypoint. Keep clicking to add more points;
the application will automatically calculate the best path along the road network between them.

Modify Points: Drag any waypoint marker to dynamically recalculate the path. Click on a marker to delete it
permanently after a confirmation prompt.

Avoid Motorways: Check the "Avoid highways" box in the settings sidebar to alter the route calculation parameters instantly.

Import Tracks: Open the sidebar using the floating hamburger button, click "Import GPX files", and select one or
multiple .gpx tracks. They will overlay on the map in distinct colors.

Merge Tracks: If you have multiple disconnected imported or drawn tracks, click "Merge map tracks" in the sidebar to
chronologically stitch them together using smart routing between gaps.

Export Track: Click "Download GPX Track" to save your route as a standardized .gpx file ready for navigation devices or
smartwatches.

🔧 Core Algorithms & Dependencies
Leaflet.js (v1.9.4): Handles interactive tiles and marker layers.

Haversine Formula: Used in js/utils.js to calculate true great-circle distances between coordinate pairs on a sphere (Earth)
in kilometers.

Douglas-Peucker Simplification: Used to reduce the number of redundant points in raw GPX tracks, optimization vital for
rendering smooth UI maps on mobile hardware.

📝 License
This project is open-source and available under the MIT License. Feel free to modify, distribute, and enhance it.
