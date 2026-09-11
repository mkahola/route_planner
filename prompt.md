# Consolidated build prompt — Route Planner SPA

This is the original spec merged with every correction made during review, written as
if it were the one prompt given from the start. Sections marked **[Correction]** are
requirements that weren't in the original request but were needed to avoid the bugs
we found — the original prompt was underspecified in exactly these spots.

---

Act as a senior Full Stack / Web developer. Build a modern, production-ready
HTML5/CSS3/Vanilla JS SPA (Single Page Application) for route planning, using
Leaflet.js and the OpenRouteService (ORS) API. No external CSS frameworks
(no Tailwind/Bootstrap). Use modern CSS variables for theming, and choose a
distinctive visual identity (e.g. a cartography/trail theme) rather than a
generic default palette.

## 1. File structure

Split the code into exactly these files, each complete and directly usable
(no placeholder comments like `// ... rest of code ...`):

- `index.html` — pure HTML structure + Leaflet script tags. Must be
  **completely language-free**: no hardcoded UI strings anywhere.
- `css/style.css` — all styles, CSS variables, media queries.
- `js/app.js` — app init, centralized state, top-level event listeners.
- `js/api.js` — API calls (Cloudflare Worker / OpenRouteService, Nominatim).
- `js/map.js` — Leaflet map management, markers, drawing logic.
- `js/utils.js` — math helpers (Douglas-Peucker, distance calculations).
- `js/gpx.js` — GPX import/export logic.
- `js/i18n.js` — localization dictionary and translation functions.
- `setup.sh` — Linux install/run script (checks for python3, serves the app
  with `python3 -m http.server`, since ES modules require `http://` — they
  won't load over `file://` due to CORS).

## 2. Technical constraints

- Use ES modules (`import`/`export`) throughout.
- `index.html` loads the app as `<script type="module" src="js/app.js"></script>`.
- No global/`window` state pollution. Pass `map`, route data, etc. as
  function arguments, or hold it in one centralized state object in `app.js`.
- Every file must be free of syntax errors, console errors, and duplicate
  function definitions — in particular, any event-binding helper for markers
  (e.g. a `bindDynamicMarkerEvents`-style function) must be defined **exactly
  once** in the file that owns it.

## 3. Architecture & backend connection

- Worker URL: `WORKER_URL = 'https://ors-proxy.mika-kahola.workers.dev/'`
  (holds the ORS API key server-side).
- Routing requests use the ORS `driving-car` profile with no extra options.
- On startup, `GET` the worker URL to check backend health. If it fails,
  switch the app to **read-only mode** and show a banner: "View-only mode
  active". Hide the banner if the check succeeds.

## 4. Localization (i18n)

- `js/i18n.js` exports a translation dictionary object and a `t(key, vars)`
  function, plus the currently active language — held in **module-level
  state**, never on `window`. Import it explicitly wherever needed
  (`app.js`, `map.js`).
- Detect language via `navigator.language`. If it starts with `fi`, use
  Finnish; otherwise fall back to English.
- `index.html` must stay entirely language-free — every label, button,
  placeholder, modal string, and dynamically generated name is translated
  programmatically via `t()`.

## 5. Address search & routing

- Sidebar address input, live-searched against OpenStreetMap Nominatim as
  the user types (debounced). Selecting a result pans the map to that point
  **without changing the current zoom level** and adds it as the next
  waypoint.
- Clicking the map adds a waypoint. Route the gap to the previous waypoint
  on the fly via the ORS proxy.
- Model each route as an ordered list of waypoints **plus one routed
  segment per consecutive pair** (not just one big polyline) — this makes
  point edits local instead of requiring a full re-route:
  - Deleting an **endpoint** waypoint just drops that point and its one
    adjacent segment — never re-route the whole track.
  - Deleting an **interior** waypoint re-routes only the single new gap
    between its former neighbors.
  - Dragging a waypoint re-routes only the one or two segments touching it.
- Show the total distance of active routes in kilometers, computed from the
  actual routed geometry.

## 6. GPX import/export

- Support importing multiple GPX files at once. Convert each imported track
  into an editable, reduced set of waypoints (Douglas-Peucker simplification,
  capped at a sane max like 30 points) so the map doesn't get flooded with
  hundreds of drag handles.
- **[Correction] Preserve the exact original track shape.** Don't connect
  the reduced waypoints with straight lines — that visibly cuts corners and
  no longer resembles the recorded track. Instead, when simplifying, keep
  track of which **index in the original point array** each retained
  waypoint corresponds to, and build each segment's displayed geometry by
  slicing the *original, full-resolution* track between those two indices.
  Only if a waypoint is later dragged or deleted should that specific
  segment be re-routed (via ORS, or a straight-line fallback) — the rest of
  the imported track keeps its original recorded shape untouched.
- **Special rule 1:** deleting the first/last point of a route trims that
  end without re-routing the rest.
- **Special rule 2:** after importing a GPX track, treat the next map click
  as the start of a brand-new, independent route — don't silently extend
  the imported track.
- **Special rule 3:** the same applies after using "Merge routes" — the
  next map click starts a new route, until merged again explicitly.
- Add a "Merge routes" action that stitches all independent routes on the
  map into one continuous route, auto-routing the gaps between them.
- Add a GPX download button that opens a naming dialog first, saves that
  name into the GPX `<name>` tag, and downloads the file to the device.

## 7. Dynamic waypoint culling

- Don't render every waypoint at once — filter which markers are shown
  based on the map's current bounds and zoom level (on `moveend`/`zoomend`).
- Zoomed far out: show ~6–10 points max. Zoomed in close (e.g. zoom ≥ 16):
  allow up to ~40 points, for precise editing.
- Always keep at least one point visible just outside the current viewport,
  before the route's start and after its end, so continuity is visible.
- Waypoints must be draggable; dragging recalculates the touched segment(s).

## 8. Geolocation

- If the device's GPS/WiFi location is available, center the map on it and
  draw a pulsing blue location dot.
- **[Correction] Don't rely solely on an automatic request on page load.**
  Many browsers silently refuse to even show the permission prompt for a
  geolocation request that isn't tied to a direct user action (especially
  off `localhost` or inside an embedded view), and a bare
  `getCurrentPosition` error callback that does nothing gives the user zero
  feedback that anything went wrong. So:
  - Attempt an automatic `getCurrentPosition` call on load as a
    best-effort convenience.
  - **Also** add a visible, always-available "Locate me" button (e.g. a
    round button near the zoom controls) that calls the same locate
    function from a real click — guaranteeing the permission prompt can
    actually appear.
  - Use `watchPosition` (not just a one-shot call) so the dot keeps
    updating and effectively retries if permission is granted slightly
    late.
  - Log geolocation errors to the console (`console.warn`) instead of
    swallowing them, so failures are diagnosable.

## 9. Waypoint popup & deletion flow

- Clicking a waypoint opens a Leaflet popup containing:
  1. A translated title (e.g. "Waypoint").
  2. A Street View button linking to
     `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=<lat>,<lng>`
     — build this URL with safe string concatenation (`+`), not template
     literals, to avoid any templating syntax issues.
  3. A delete button.
- Dragging a marker (`dragend`) updates its popup's Street View link to the
  new coordinates.
- Clicking the popup's delete button opens a separate confirmation modal
  ("Delete this point?"). Only on explicit "Yes":
  1. Remove the marker from the map.
  2. Recalculate the route per the endpoint-trim / interior-reroute rules
     above.
  - **[Correction] Do not use right-click / context-menu to delete a
    waypoint** — deletion is a left-click → popup → delete button →
    confirm flow only.
  - **[Correction — ordering bug to avoid]** When wiring the confirm
    modal's "Yes" button, make sure the function that reads the pending
    delete's `routeId`/`pointId` runs **before** the function that closes
    the modal, if closing the modal also clears that pending-delete state.
    Closing the modal first and then trying to act on state it just wiped
    means the click does nothing. Sequence: act on the pending delete
    first, then close the modal.

## 10. Marker/polyline lifecycle management

- **[Correction]** Register every route's markers and polylines with a
  single dedicated Leaflet layer group as soon as they're created (in
  addition to whatever direct map add/remove you do for the dynamic
  zoom/bounds culling in section 7). This makes a "Clear all" action
  trivially reliable: clearing that one layer group removes every route
  layer from the map in one call, regardless of which markers happened to
  be hidden by the culling logic or any other per-route bookkeeping at that
  moment. Don't rely purely on manually tracking and removing each
  marker/polyline object per route for bulk-clear correctness.

## 11. Mobile "bottom sheet" widget & Leaflet integration

- Fixed bottom sheet using a `#info-widget` container.
- Header is an `<h3>` acting as a clickable handle, with a CSS `::before`
  pseudo-element rendering a grey horizontal "pill" drag indicator.
- Desktop (>768px): freely positioned box, bottom-left.
- Mobile (≤768px): forced to `position: fixed !important` spanning the
  full width at the bottom.
- Collapsed height exactly `65px !important`, with `.route-list-container`
  hidden (`display: none`) so the header text is vertically centered in
  that 65px band.
- Adding class `.expanded` grows it to `50vh !important` with
  `overflow-y: auto` content. Tapping the header on mobile toggles this
  class.
- `z-index` at least `9999`.
- Block all base map events (drag, double-click, scroll-zoom) from
  triggering when interacting with the widget or the sidebar, using
  Leaflet's `L.DomEvent.disableClickPropagation` /
  `disableScrollPropagation`.

## 12. UI layout & branding

- Page title: "Route planner" (localized "Reittisuunnittelu" in Finnish).
- Sidebar heading: "Plan a route" ("Reitin suunnittelu" in Finnish).
- Hamburger button (top-left) opens a sidebar containing: address search,
  GPX import button, "Merge routes" (visible only when ≥2 routes exist),
  "Download GPX" (visible only when ≥1 route exists), and "Clear all".
  Keep the sidebar compact, max roughly half the viewport height's worth
  of content.
- Zoom controls (+/-) in the top-right corner.
- Add an Instagram brand link (`@kaffe_racer`) with true Instagram-gradient
  colors (SVG `linearGradient`) in two places: the Leaflet attribution
  control, and a "Contact" section below the sidebar's action buttons.
  Force it to stay visible on mobile even though Leaflet's default
  attribution styling tends to hide/clip things
  (`.leaflet-control-attribution { display: inline-flex !important; }`),
  and use `text-overflow: ellipsis` so long license text truncates while
  the Instagram link itself always stays fully visible.
- Mobile-optimize the whole layout.

## 13. Deliverable quality bar

The codebase must compile and run without a single console error. The map
and sidebar must load immediately. Instagram links must render cleanly on
both desktop and mobile. Waypoint popups must translate on the fly when the
active language changes.
