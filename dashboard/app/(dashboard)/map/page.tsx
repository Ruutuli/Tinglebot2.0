"use client";

// ============================================================================
// ------------------- Imports -------------------
// ============================================================================

import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";
import Link from "next/link";

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================

const LEAFLET_CSS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const MAP_BACKGROUND = "#1a1a1a";

const MAP_PAGE_WRAPPER_STYLE: CSSProperties = {
  position: "relative",
  height: "100vh",
  minHeight: "100vh",
  width: "100%",
  overflow: "hidden",
};

const QUADRANT_LEGEND_ITEMS: ReadonlyArray<{ color: string; label: string; title: string }> = [
  { color: MAP_BACKGROUND, label: "Inaccessible", title: "Blocked; cannot be explored" },
  { color: "#b91c1c", label: "Unexplored", title: "Not yet visited; 2 stamina to enter" },
  { color: "#ca8a04", label: "Explored", title: "Visited; 1 stamina to continue" },
  { color: "#15803d", label: "Secured", title: "Secured path; 0 stamina" },
] as const;

const VILLAGE_BUTTONS: ReadonlyArray<{ grid: string; name: string; emoji: string; className: string }> = [
  { grid: "H5", name: "Rudania", emoji: "🔥", className: "fire-village" },
  { grid: "H8", name: "Inariko", emoji: "💧", className: "water-village" },
  { grid: "F10", name: "Vhintl", emoji: "🍃", className: "leaf-village" },
] as const;

const PIN_CATEGORIES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  { value: "my-pins", label: "My Pins" },
  { value: "homes", label: "Homes" },
  { value: "farms", label: "Farms" },
  { value: "shops", label: "Shops" },
  { value: "points-of-interest", label: "Points of Interest" },
] as const;

const LOADING_STEPS: ReadonlyArray<{ id: string; icon: string; iconClass?: string; label: string }> = [
  { id: "step-1", icon: "fa-cog", iconClass: "fa-spin", label: "Initializing system..." },
  { id: "step-2", icon: "fa-map", label: "Loading map data..." },
  { id: "step-3", icon: "fa-layer-group", label: "Preparing layers..." },
  { id: "step-4", icon: "fa-check", label: "Ready to explore!" },
] as const;

// ============================================================================
// ------------------- Types -------------------
// ============================================================================

interface MapWindow extends Window {
  initializeMap?: () => Promise<void>;
  mapEngine?: { cleanup?: () => void };
  toggleSection?: (sectionId: string) => void;
  zoomIn?: () => void;
  zoomOut?: () => void;
  resetZoom?: () => void;
  jumpToVillage?: (grid: string, name: string) => void;
  toggleAddPinMode?: () => void;
  toggleSidebar?: () => void;
  toggleExplorationMode?: () => void;
  setExplorationId?: () => void;
  togglePathDrawing?: () => void;
  finishPathDrawing?: () => void;
}

// ============================================================================
// ------------------- Pure helpers -------------------
// ============================================================================

// ------------------- getMapWindow ------------------
function getMapWindow(): MapWindow {
  return window as unknown as MapWindow;
}

// ------------------- cx ------------------
function cx(...parts: (string | boolean | undefined | null)[]): string {
  return parts.filter((p): p is string => typeof p === "string").join(" ");
}

// ------------------- mapOnClick ------------------
function mapOnClick(method: keyof MapWindow, ...args: unknown[]): () => void {
  return () => {
    const fn = getMapWindow()[method];
    if (typeof fn === "function") (fn as (...a: unknown[]) => void)(...args);
  };
}

// ------------------- cleanupMapEngine ------------------
function cleanupMapEngine(): void {
  getMapWindow().mapEngine?.cleanup?.();
}

// ------------------- getMapScriptUrls ------------------
function getMapScriptUrls(): string[] {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
  return [
    LEAFLET_JS_URL,
    `${base}/js/map-constants.js`,
    `${base}/js/map-metadata.js`,
    `${base}/js/map-geometry.js`,
    `${base}/js/map-manifest.js`,
    `${base}/js/map-layers.js`,
    `${base}/js/map-loader.js`,
    `${base}/js/map-toggles.js`,
    `${base}/js/map-engine.js`,
    `${base}/js/map-metrics.js`,
    `${base}/js/map.js`,
  ];
}

// ------------------- setupMapScripts ------------------
// Loads map scripts in order, then initializes the map. Returns cleanup fn.
function setupMapScripts(onScriptError: (src: string) => void): () => void {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || "";

  const linkLeaflet = document.createElement("link");
  linkLeaflet.rel = "stylesheet";
  linkLeaflet.href = LEAFLET_CSS_URL;
  document.head.appendChild(linkLeaflet);

  const linkMapCss = document.createElement("link");
  linkMapCss.rel = "stylesheet";
  linkMapCss.href = `${base}/css/map.css`;
  document.head.appendChild(linkMapCss);

  const scriptUrls = getMapScriptUrls();
  let index = 0;

  function loadNext(): void {
    if (index >= scriptUrls.length) {
      getMapWindow().initializeMap?.();
      return;
    }

    const src = scriptUrls[index++];
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = loadNext;
    script.onerror = () => {
      onScriptError(src);
      loadNext();
    };
    document.body.appendChild(script);
  }

  loadNext();

  return cleanupMapEngine;
}

// ============================================================================
// ------------------- Components -------------------
// ============================================================================

interface CollapsibleSectionProps {
  sectionId: string;
  icon: string;
  title: string;
  children: React.ReactNode;
}

function CollapsibleSection({ sectionId, icon, title, children }: CollapsibleSectionProps) {
  return (
    <div className={cx(sectionId, "collapsible-section")}>
      <h3 className="section-header" onClick={mapOnClick("toggleSection", sectionId)}>
        <i className={cx("fas", icon)} />
        {title}
        <i className="fas fa-chevron-down section-arrow" />
      </h3>
      <div className="section-content">{children}</div>
    </div>
  );
}

// ============================================================================
// ------------------- Page -------------------
// ============================================================================

export default function MapPage() {
  const scriptsLoadedRef = useRef(false);

  useEffect(() => {
    document.body.classList.add("map-page");
    return () => {
      document.body.classList.remove("map-page");
    };
  }, []);

  useEffect(() => {
    const w = getMapWindow();

    if (scriptsLoadedRef.current) {
      w.initializeMap?.();
      return cleanupMapEngine;
    }
    scriptsLoadedRef.current = true;

    const cleanup = setupMapScripts((src) => {
      console.error("[map.tsx] ❌ Failed to load script:", src);
    });

    return cleanup;
  }, []);

  return (
    <div className="map-page-wrapper" style={MAP_PAGE_WRAPPER_STYLE}>
      <div className="map-loading-overlay" id="map-loading-overlay">
        <div className="loading-container">
          <div className="loading-content">
            <div className="map-loading-spinner" />
            <div className="map-loading-text">Loading ROTW Map</div>
            <div className="map-loading-subtitle" id="loading-subtitle">
              Initializing map system...
            </div>
            <div className="loading-progress-container">
              <div className="loading-progress-bar">
                <div className="loading-progress-fill" id="loading-progress-fill" />
              </div>
              <div className="loading-progress-text" id="loading-progress-text">
                0%
              </div>
            </div>
            <div className="loading-steps" id="loading-steps">
              {LOADING_STEPS.map((step, i) => (
                <div key={step.id} className={cx("loading-step", i === 0 && "active")} id={step.id}>
                  <i className={cx("fas", step.icon, step.iconClass)} />
                  <span>{step.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div id="map" style={{ width: "100%", height: "100%", background: MAP_BACKGROUND }} />

      <div className="side-ui">
        <div className="ui-content">
          <div className="ui-header ui-header-compact">
            <div className="header-content">
              <div className="header-title">
                <div className="title-main">
                  <i className="fas fa-seedling" />
                  <h2>ROTW Map</h2>
                </div>
              </div>
              <div className="header-actions">
                <Link href="/" className="action-btn dashboard-btn action-btn-compact" title="Back to Dashboard">
                  <i className="fas fa-home" />
                  <span>Dashboard</span>
                </Link>
              </div>
            </div>
          </div>

          <CollapsibleSection sectionId="zoom-section" icon="fa-search-plus" title="Zoom Controls">
            <div className="zoom-buttons">
              <button type="button" className="zoom-btn zoom-in" onClick={mapOnClick("zoomIn")} title="Zoom In">
                <i className="fas fa-plus" />
              </button>
              <button type="button" className="zoom-btn zoom-out" onClick={mapOnClick("zoomOut")} title="Zoom Out">
                <i className="fas fa-minus" />
              </button>
              <button type="button" className="zoom-btn zoom-reset" onClick={mapOnClick("resetZoom")} title="Reset Zoom">
                <i className="fas fa-home" />
              </button>
            </div>
            <p className="zoom-hint" title="Keyboard navigation">
              Arrow keys pan · Scroll to zoom
            </p>
            <div className="village-nav">
              <h4><i className="fas fa-map-marker-alt" /> Quick Village Access</h4>
              <div className="village-buttons-horizontal">
                {VILLAGE_BUTTONS.map((v) => (
                  <button key={v.grid} type="button" className={cx("village-btn-compact", v.className)} onClick={mapOnClick("jumpToVillage", v.grid, v.name)} title={`Jump to ${v.name} (${v.grid})`}>
                    <span className="village-emoji">{v.emoji}</span>
                  </button>
                ))}
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection sectionId="layer-controls-section" icon="fa-layer-group" title="Map Layers">
            <div id="map-layer-toggles" />
          </CollapsibleSection>

          <CollapsibleSection sectionId="quadrant-legend-section" icon="fa-palette" title="Quadrant status">
              <div className="quadrant-legend">
                {QUADRANT_LEGEND_ITEMS.map((item) => (
                  <div key={item.label} className="quadrant-legend-item" title={item.title}>
                    <span className="quadrant-legend-swatch" style={{ backgroundColor: item.color }} />
                    <span className="quadrant-legend-label">{item.label}</span>
                  </div>
                ))}
              </div>
              <p className="quadrant-legend-note">Q1–Q4 label color on the map shows each quadrant’s status.</p>
          </CollapsibleSection>

          <CollapsibleSection sectionId="pins-section" icon="fa-map-pin" title="Pins">
            <div className="pins-controls">
                <div className="pin-actions">
                  <button type="button" className="pin-btn add-pin-btn" onClick={mapOnClick("toggleAddPinMode")} title="Add New Pin">
                    <i className="fas fa-plus" />
                    <span>Add Pin</span>
                  </button>
                </div>
                <div className="pin-search">
                  <h4><i className="fas fa-search" /> Search Pins</h4>
                  <div className="search-container">
                    <input type="text" id="pin-search-input" placeholder="Search pins by name or description..." className="search-input" />
                    <button type="button" id="clear-search-btn" className="clear-search-btn" title="Clear search">
                      <i className="fas fa-times" />
                    </button>
                  </div>
                </div>
                <div className="pins-list" id="pins-list" />
                <div className="pin-categories">
                  <h4><i className="fas fa-tags" /> Pin Categories</h4>
                  <div className="category-filters">
                    {PIN_CATEGORIES.map((cat) => (
                      <button key={cat.value} type="button" className={cx("category-filter", cat.value === "all" && "active")} data-category={cat.value}>
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
          </CollapsibleSection>
        </div>
      </div>

      <button type="button" className="ui-toggle" onClick={mapOnClick("toggleSidebar")}>
        <i className="fas fa-chevron-right" />
      </button>

      {/* Exploration panel: expedition ID, place markers, draw path (secured paths) */}
      <div id="exploration-panel" className="exploration-panel" style={{ display: "none" }}>
        <div className="exploration-header">
          <h3>Draw secured path</h3>
          <button type="button" className="close-btn" onClick={mapOnClick("toggleExplorationMode")} title="Close" aria-label="Close">
            <i className="fas fa-times" />
          </button>
        </div>
        <div className="exploration-content">
          <div className="exploration-section">
            <h4>Expedition ID</h4>
            <label htmlFor="exploration-id">Enter expedition ID (e.g. E123456) to draw a path for that expedition</label>
            <input type="text" id="exploration-id" placeholder="E123456" />
            <button type="button" className="action-btn" onClick={mapOnClick("setExplorationId")}>
              Set ID
            </button>
            <p id="current-id-display" className="exploration-status" style={{ marginTop: 8 }} />
          </div>
          <div className="exploration-section">
            <h4>Draw path</h4>
            <p className="exploration-status" id="exploration-mode-status">Set an expedition ID, then click &quot;Draw path&quot;. Click on the map to add points, then &quot;Finish path&quot; to save.</p>
            <div className="marker-buttons" style={{ marginTop: 8 }}>
              <button type="button" className="marker-btn path-btn" onClick={mapOnClick("togglePathDrawing")} title="Draw a path (secured path)">
                <i className="fas fa-route" />
                <span>Draw path</span>
              </button>
              <button type="button" className="marker-btn finish-path-btn" onClick={mapOnClick("finishPathDrawing")} title="Save the path you drew">
                <i className="fas fa-check" />
                <span>Finish path</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
