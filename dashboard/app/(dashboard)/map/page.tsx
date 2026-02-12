"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

export default function MapPage() {
  const scriptsLoadedRef = useRef(false);

  useEffect(() => {
    document.body.classList.add("map-page");
    return () => {
      document.body.classList.remove("map-page");
    };
  }, []);

  useEffect(() => {
    if (scriptsLoadedRef.current) return;
    scriptsLoadedRef.current = true;

    const base = process.env.NEXT_PUBLIC_BASE_PATH || "";

    const linkLeaflet = document.createElement("link");
    linkLeaflet.rel = "stylesheet";
    linkLeaflet.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(linkLeaflet);

    const linkMapCss = document.createElement("link");
    linkMapCss.rel = "stylesheet";
    linkMapCss.href = `${base}/css/map.css`;
    document.head.appendChild(linkMapCss);

    const scriptOrder = [
      "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
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

    let index = 0;

    function loadNext() {
      if (index >= scriptOrder.length) {
        if (typeof (window as unknown as { initializeMap?: () => Promise<void> }).initializeMap === "function") {
          (window as unknown as { initializeMap: () => Promise<void> }).initializeMap();
        }
        return;
      }

      const src = scriptOrder[index++];
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.onload = loadNext;
      script.onerror = () => {
        console.error("[map] Failed to load script:", src);
        loadNext();
      };
      document.body.appendChild(script);
    }

    loadNext();

    return () => {
      if (typeof (window as unknown as { mapEngine?: { cleanup?: () => void } }).mapEngine?.cleanup === "function") {
        (window as unknown as { mapEngine: { cleanup: () => void } }).mapEngine.cleanup();
      }
    };
  }, []);

  return (
    <div
      className="map-page-wrapper"
      style={{
        position: "relative",
        height: "100vh",
        minHeight: "100vh",
        width: "100%",
        overflow: "hidden",
      }}
    >
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
              <div className="loading-step active" id="step-1">
                <i className="fas fa-cog fa-spin" />
                <span>Initializing system...</span>
              </div>
              <div className="loading-step" id="step-2">
                <i className="fas fa-map" />
                <span>Loading map data...</span>
              </div>
              <div className="loading-step" id="step-3">
                <i className="fas fa-layer-group" />
                <span>Preparing layers...</span>
              </div>
              <div className="loading-step" id="step-4">
                <i className="fas fa-check" />
                <span>Ready to explore!</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div id="map" style={{ width: "100%", height: "100%", background: "#1a1a1a" }} />

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

          <div className="zoom-section collapsible-section">
            <h3 className="section-header" onClick={() => (window as unknown as { toggleSection?: (s: string) => void }).toggleSection?.("zoom-section")}>
              <i className="fas fa-search-plus" /> Zoom Controls
              <i className="fas fa-chevron-down section-arrow" />
            </h3>
            <div className="section-content">
              <div className="zoom-buttons">
                <button type="button" className="zoom-btn zoom-in" onClick={() => (window as unknown as { zoomIn?: () => void }).zoomIn?.()} title="Zoom In">
                  <i className="fas fa-plus" />
                </button>
                <button type="button" className="zoom-btn zoom-out" onClick={() => (window as unknown as { zoomOut?: () => void }).zoomOut?.()} title="Zoom Out">
                  <i className="fas fa-minus" />
                </button>
                <button type="button" className="zoom-btn zoom-reset" onClick={() => (window as unknown as { resetZoom?: () => void }).resetZoom?.()} title="Reset Zoom">
                  <i className="fas fa-home" />
                </button>
              </div>
              <div className="village-nav">
                <h4><i className="fas fa-map-marker-alt" /> Quick Village Access</h4>
                <div className="village-buttons-horizontal">
                  <button type="button" className="village-btn-compact fire-village" onClick={() => (window as unknown as { jumpToVillage?: (s: string, n: string) => void }).jumpToVillage?.("H5", "Rudania")} title="Jump to Rudania (H5)">
                    <span className="village-emoji">🔥</span>
                  </button>
                  <button type="button" className="village-btn-compact water-village" onClick={() => (window as unknown as { jumpToVillage?: (s: string, n: string) => void }).jumpToVillage?.("H8", "Inariko")} title="Jump to Inariko (H8)">
                    <span className="village-emoji">💧</span>
                  </button>
                  <button type="button" className="village-btn-compact leaf-village" onClick={() => (window as unknown as { jumpToVillage?: (s: string, n: string) => void }).jumpToVillage?.("F10", "Vhintl")} title="Jump to Vhintl (F10)">
                    <span className="village-emoji">🍃</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="layer-controls-section collapsible-section">
            <h3 className="section-header" onClick={() => (window as unknown as { toggleSection?: (s: string) => void }).toggleSection?.("layer-controls-section")}>
              <i className="fas fa-layer-group" /> Map Layers
              <i className="fas fa-chevron-down section-arrow" />
            </h3>
            <div className="section-content">
              <div id="map-layer-toggles" />
            </div>
          </div>

          <div className="pins-section collapsible-section">
            <h3 className="section-header" onClick={() => (window as unknown as { toggleSection?: (s: string) => void }).toggleSection?.("pins-section")}>
              <i className="fas fa-map-pin" /> Pins
              <i className="fas fa-chevron-down section-arrow" />
            </h3>
            <div className="section-content">
              <div className="pins-controls">
                <div className="pin-actions">
                  <button type="button" className="pin-btn add-pin-btn" onClick={() => (window as unknown as { toggleAddPinMode?: () => void }).toggleAddPinMode?.()} title="Add New Pin">
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
                    <button type="button" className="category-filter active" data-category="all">All</button>
                    <button type="button" className="category-filter" data-category="my-pins">My Pins</button>
                    <button type="button" className="category-filter" data-category="homes">Homes</button>
                    <button type="button" className="category-filter" data-category="farms">Farms</button>
                    <button type="button" className="category-filter" data-category="shops">Shops</button>
                    <button type="button" className="category-filter" data-category="points-of-interest">Points of Interest</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button type="button" className="ui-toggle" onClick={() => (window as unknown as { toggleSidebar?: () => void }).toggleSidebar?.()}>
        <i className="fas fa-chevron-right" />
      </button>
    </div>
  );
}
