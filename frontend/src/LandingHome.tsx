import React, { useState, useEffect, useRef, useMemo } from "react";
import OrbitalGlobe, { REGION_COORDINATES } from "./OrbitalGlobe.jsx";
import { startAmbientAudio, stopAmbientAudio, playUiClick } from "./audioEffects.js";
import "./LandingHome.css";

// Comprehensive regions & thermal surveillance registry
const SURVEILLANCE_REGIONS = [
  {
    id: "India",
    name: "India",
    code: "in",
    category: "National Surveillance",
    subtitle: "Country / Subcontinent in South Asia",
    coords: REGION_COORDINATES.India,
    breadcrumbs: ["Overview", "World Map", "India"],
    kicker: "TERRITORY / CONTINENTAL SECTOR",
    description: "Real-time orbital thermal surveillance across all Indian states and biosphere reserves.",
    metrics: {
      hotspots: "1,428 detected",
      meanFrp: "74.2 MW",
      riskScore: "HIGH (84%)",
      satellitePass: "INSAT-3DR • 8m ago",
    },
    sectors: [
      { code: "hi", script: "हिन्दी", name: "Hindi / Central Sector" },
      { code: "gu", script: "ગુજરાતી", name: "Gujarati / Western Sector" },
      { code: "kn", script: "ಕನ್ನಡ", name: "Kannada / Bandipur Watch" },
      { code: "or", script: "ଓଡ଼ିଆ", name: "Odia / Simlipal Biosphere" },
      { code: "mr", script: "मराठी", name: "Marathi / Vidarbha Dryland" },
      { code: "te", script: "తెలుగు", name: "Telugu / Nallamala Forest" },
      { code: "ta", script: "தமிழ்", name: "Tamil / Mudumalai Reserve" },
      { code: "bn", script: "বাংলা", name: "Bengali / Sundarbans Edge" },
    ],
  },
  {
    id: "Gujarat",
    name: "Gujarat Industrial Corridor",
    code: "gj",
    category: "High Thermal Anomaly",
    subtitle: "Western Industrial Belt • Refineries & Lignite",
    coords: REGION_COORDINATES.Gujarat,
    breadcrumbs: ["Overview", "India", "Western Sector", "Gujarat"],
    kicker: "MONITORED INDUSTRIAL CORRIDOR",
    description: "Dense thermal flares, refinery stacks, and agricultural zones monitored 24/7 via VIIRS 375m.",
    metrics: {
      hotspots: "342 detected",
      meanFrp: "112.5 MW",
      riskScore: "CRITICAL (91%)",
      satellitePass: "VIIRS-SNPP • 14m ago",
    },
    sectors: [
      { code: "jam", script: "જામનગર", name: "Jamnagar Petrochemical" },
      { code: "kch", script: "કચ્છ", name: "Kutch Lignite Basin" },
      { code: "ank", script: "અંકલેશ્વર", name: "Ankleshwar Chemical" },
      { code: "dahej", script: "દહેજ", name: "Dahej SEZ Thermal Complex" },
      { code: "surat", script: "સુરત", name: "Surat Industrial Belt" },
      { code: "vdr", script: "વડોદરા", name: "Vadodara Refining Zone" },
    ],
  },
  {
    id: "Simlipal",
    name: "Simlipal Biosphere Reserve",
    code: "od",
    category: "Active Wildfire Watch",
    subtitle: "Mayurbhanj, Odisha • Dense Sal Forest",
    coords: REGION_COORDINATES.Simlipal,
    breadcrumbs: ["Overview", "India", "Eastern Ghats", "Simlipal"],
    kicker: "BIOSPHERE FIRE WATCH",
    description: "High Fire Radiative Power detections in dry deciduous core forest zone during pre-monsoon dry season.",
    metrics: {
      hotspots: "186 detected",
      meanFrp: "88.4 MW",
      riskScore: "CRITICAL (89%)",
      satellitePass: "Sentinel-3 SLSTR • 22m ago",
    },
    sectors: [
      { code: "core", script: "କୋର ଅଞ୍ଚଳ", name: "Core Biosphere Sector" },
      { code: "buf", script: "ବଫର ଜୋନ", name: "Buffer Deciduous Zone" },
      { code: "nor", script: "ଉତ୍ତର ସୀମା", name: "North Wildlife Corridor" },
      { code: "sou", script: "ଦକ୍ଷିଣ ରେଞ୍ଜ", name: "South Sal Forest Ridge" },
    ],
  },
  {
    id: "Bandipur",
    name: "Bandipur & Nagarhole Reserves",
    code: "ka",
    category: "Conservation Surveillance",
    subtitle: "Karnataka • Western Ghats Foothills",
    coords: REGION_COORDINATES.Bandipur,
    breadcrumbs: ["Overview", "India", "Southern Sector", "Bandipur"],
    kicker: "PROTECTED WILDLIFE CORRIDOR",
    description: "Critical bamboo understory dry fire danger corridor linking Nilgiris and Western Ghats ecosystems.",
    metrics: {
      hotspots: "54 detected",
      meanFrp: "42.0 MW",
      riskScore: "MODERATE (62%)",
      satellitePass: "Aqua-MODIS • 35m ago",
    },
    sectors: [
      { code: "bnp", script: "ಬಂಡೀಪುರ", name: "Bandipur Core Range" },
      { code: "nag", script: "ನಾಗರಹೊಳೆ", name: "Nagarhole National Park" },
      { code: "mys", script: "ಮೈಸೂರು", name: "Mysuru Periphery" },
      { code: "cham", script: "ಚಾಮರಾಜನಗರ", name: "Chamarajanagar Border" },
    ],
  },
  {
    id: "Himalayas",
    name: "Himalayan Pine Forest Belt",
    code: "uk",
    category: "High Altitude Fire Risk",
    subtitle: "Uttarakhand & Himachal • Chir Pine Ecosystem",
    coords: REGION_COORDINATES.Himalayas,
    breadcrumbs: ["Overview", "India", "Northern Sector", "Himalayas"],
    kicker: "HIGH-ALTITUDE CONIFER RISK",
    description: "Rapidly spreading ground fires fed by highly flammable fallen resinous chir-pine needles.",
    metrics: {
      hotspots: "210 detected",
      meanFrp: "65.3 MW",
      riskScore: "HIGH (79%)",
      satellitePass: "INSAT-3DR • 12m ago",
    },
    sectors: [
      { code: "gar", script: "गढ़वाल", name: "Garhwal Valley Forests" },
      { code: "kum", script: "कुमाऊं", name: "Kumaon Pine Slopes" },
      { code: "sim", script: "शिमला", name: "Shimla Ridge Foothills" },
      { code: "alm", script: "अल्मोड़ा", name: "Almora Oak-Pine Zone" },
    ],
  },
  {
    id: "WesternGhats",
    name: "Western Ghats Escarpment",
    code: "wg",
    category: "UNESCO Heritage Watch",
    subtitle: "Maharashtra, Goa & Kerala Ridge",
    coords: REGION_COORDINATES.WesternGhats,
    breadcrumbs: ["Overview", "India", "Western Ghats", "Escarpment"],
    kicker: "BIODIVERSITY HOTSPOT MONITOR",
    description: "Sloping terrain thermal anomaly mapping with high false-positive filtering for agricultural clearing.",
    metrics: {
      hotspots: "98 detected",
      meanFrp: "39.6 MW",
      riskScore: "MODERATE (55%)",
      satellitePass: "VIIRS-SNPP • 40m ago",
    },
    sectors: [
      { code: "sahy", script: "सह्याद्री", name: "Sahyadri Mountain Range" },
      { code: "konk", script: "कोकण", name: "Konkan Transition Foothills" },
      { code: "waya", script: "വയനാട്", name: "Wayanad Highland Slopes" },
      { code: "anan", script: "ആനമല", name: "Anamalai Plateau Edge" },
    ],
  },
  {
    id: "INSAT3D",
    name: "INSAT-3DR Geostationary Link",
    code: "sat",
    category: "Spaceborne Sensor",
    subtitle: "ISRO 36,000 km Orbit • 74°E Longitude",
    coords: REGION_COORDINATES.INSAT3D,
    breadcrumbs: ["Overview", "Satellites", "ISRO", "INSAT-3DR"],
    kicker: "SATELLITE TELEMETRY LINK",
    description: "Continuous 30-minute rapid refresh meteorological and thermal infrared sounder & imager.",
    metrics: {
      hotspots: "Full Disk Refresh",
      meanFrp: "TIR1 / TIR2 Channels",
      riskScore: "SENSOR ACTIVE (100%)",
      satellitePass: "Real-time Telemetry Stream",
    },
    sectors: [
      { code: "tir1", script: "10.8 µm", name: "Thermal IR Window 1" },
      { code: "tir2", script: "12.0 µm", name: "Split Window IR 2" },
      { code: "mir", script: "3.9 µm", name: "Middle IR Fire Sensor" },
      { code: "vis", script: "0.65 µm", name: "Visible Optical Channel" },
    ],
  },
  {
    id: "USA",
    name: "United States & California",
    code: "us",
    category: "Global Wildfire Surveillance",
    subtitle: "North America • California, Oregon & Southwest",
    coords: REGION_COORDINATES.USA,
    breadcrumbs: ["Overview", "Americas", "North America", "United States"],
    kicker: "CONTINENTAL FIRE CORRIDOR",
    description: "High-resolution thermal infrared active fire mapping across chaparral and conifer forests via GOES-18 and VIIRS.",
    metrics: {
      hotspots: "512 detected",
      meanFrp: "82.5 MW",
      riskScore: "HIGH (81%)",
      satellitePass: "GOES-East/West • Continuous",
    },
    sectors: [
      { code: "cal", script: "CAL", name: "California Sierra Foothills" },
      { code: "or", script: "PNW", name: "Pacific Northwest Cascades" },
      { code: "tx", script: "SW", name: "Texas / Southwest Brush" },
      { code: "col", script: "RM", name: "Rocky Mountain Conifer" },
    ],
  },
  {
    id: "Europe",
    name: "Mediterranean Europe",
    code: "eu",
    category: "European Thermal Network",
    subtitle: "Southern Europe • Greece, Spain, Italy & France",
    coords: REGION_COORDINATES.Europe,
    breadcrumbs: ["Overview", "Europe", "Mediterranean Basin", "Southern Sector"],
    kicker: "EFFIS COPERNICUS NETWORK",
    description: "Copernicus Emergency Management Service integration tracking drought and Mediterranean pine forest fires.",
    metrics: {
      hotspots: "284 detected",
      meanFrp: "58.2 MW",
      riskScore: "HIGH (76%)",
      satellitePass: "Sentinel-3 SLSTR • 18m ago",
    },
    sectors: [
      { code: "gr", script: "Ελλάδα", name: "Greece / Aegean Scrub" },
      { code: "es", script: "España", name: "Spain / Iberian Pine Forest" },
      { code: "it", script: "Italia", name: "Italy / Sicily & Calabria" },
      { code: "fr", script: "France", name: "France / Provence Scrub" },
    ],
  },
  {
    id: "Japan",
    name: "Japan & East Asia",
    code: "jp",
    category: "East Asia Sector",
    subtitle: "Honshu, Hokkaido & Kyushu Archipelago",
    coords: REGION_COORDINATES.Japan,
    breadcrumbs: ["Overview", "Asia", "East Asia", "Japan"],
    kicker: "HIMAWARI-9 SURVEILLANCE",
    description: "Himawari-9 geostationary 10-minute rapid refresh surveillance of industrial heat emissions and volcanic thermal activity.",
    metrics: {
      hotspots: "76 detected",
      meanFrp: "34.0 MW",
      riskScore: "LOW (28%)",
      satellitePass: "Himawari-9 • Real-time",
    },
    sectors: [
      { code: "tyo", script: "東京都", name: "Tokyo Bay Industrial Belt" },
      { code: "hsd", script: "北海道", name: "Hokkaido Forest Zone" },
      { code: "kyt", script: "京都府", name: "Kyoto Basin Foothills" },
      { code: "kys", script: "九州", name: "Kyushu Volcanic Ridge" },
    ],
  },
  {
    id: "Australia",
    name: "Australia Bushfire Zone",
    code: "au",
    category: "High FRP Biomass Risk",
    subtitle: "New South Wales, Victoria & Outback",
    coords: REGION_COORDINATES.Australia,
    breadcrumbs: ["Overview", "Oceania", "Australia", "Southeast Bush"],
    kicker: "BUSHFIRE DANGER MONITOR",
    description: "Eucalyptus forest rapid flame spread monitoring using VIIRS and Himawari split-window thermal radiometry.",
    metrics: {
      hotspots: "640 detected",
      meanFrp: "145.0 MW",
      riskScore: "CRITICAL (93%)",
      satellitePass: "Himawari-9 • 10m ago",
    },
    sectors: [
      { code: "nsw", script: "NSW", name: "Blue Mountains & Hunter" },
      { code: "vic", script: "VIC", name: "East Gippsland Forest" },
      { code: "wa", script: "WA", name: "Pilbara / Western Shrubland" },
      { code: "qld", script: "QLD", name: "Queensland Tropical Savanna" },
    ],
  },
  {
    id: "Brazil",
    name: "Amazon & Pantanal",
    code: "br",
    category: "Rainforest Deforestation Fire",
    subtitle: "South America • Legal Amazon & Mato Grosso",
    coords: REGION_COORDINATES.Brazil,
    breadcrumbs: ["Overview", "Americas", "South America", "Amazon Basin"],
    kicker: "AMAZON BIOME SURVEILLANCE",
    description: "Active slash-and-burn clearing and tropical rainforest edge fire detection via GOES and MODIS.",
    metrics: {
      hotspots: "1,890 detected",
      meanFrp: "162.4 MW",
      riskScore: "CRITICAL (96%)",
      satellitePass: "NOAA-20 / VIIRS • 28m ago",
    },
    sectors: [
      { code: "amz", script: "Amazônia", name: "Para / Central Amazon" },
      { code: "mt", script: "Cerrado", name: "Mato Grosso Agricultural" },
      { code: "pan", script: "Pantanal", name: "Pantanal Wetland Margins" },
      { code: "ron", script: "Rondônia", name: "Rondônia Forest Arc" },
    ],
  },
  {
    id: "Africa",
    name: "Sub-Saharan Savanna",
    code: "af",
    category: "Biomass Burning Belt",
    subtitle: "Central Africa, Angola, DRC & Zambia",
    coords: REGION_COORDINATES.Africa,
    breadcrumbs: ["Overview", "Africa", "Sub-Saharan Belt", "Central Region"],
    kicker: "CONTINENTAL BIOMASS BELT",
    description: "Extensive agricultural and dry savanna burn patterns across central and southern Africa.",
    metrics: {
      hotspots: "3,120 detected",
      meanFrp: "118.0 MW",
      riskScore: "CRITICAL (95%)",
      satellitePass: "Meteosat-11 • Real-time",
    },
    sectors: [
      { code: "cgo", script: "Congo", name: "Congo Basin Margin" },
      { code: "ago", script: "Angola", name: "Miombo Woodland Savanna" },
      { code: "zmb", script: "Zambia", name: "Zambezi River Basin" },
      { code: "sahel", script: "Sahel", name: "Sahel Transition Zone" },
    ],
  },
];

// Mini particle constellation thumbnail renderer for the region card header
function MiniConstellation({ regionId }) {
  // Deterministic seed points for mini region constellation thumbnail
  const points = useMemo(() => {
    const list = [];
    const count = 38;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      // create country-like organic outline
      const r = 16 + Math.sin(i * 3) * 6 + Math.cos(i * 5) * 4;
      list.push({
        x: 32 + r * Math.cos(angle),
        y: 32 + r * Math.sin(angle) * 1.15,
        size: 1.4 + (i % 3) * 0.6,
      });
    }
    return list;
  }, [regionId]);

  return (
    <svg className="mini-constellation-map" viewBox="0 0 64 64" aria-hidden="true">
      {points.map((pt, idx) => (
        <circle
          key={idx}
          cx={pt.x}
          cy={pt.y}
          r={pt.size}
          className="constellation-dot"
        />
      ))}
    </svg>
  );
}

// World Overview stat bar + drag hint — shown over the globe on the default,
// nothing-selected view (mirrors the Google Language Explorer's bottom
// "World Overview" stat strip + "Drag to explore..." caption).
function WorldOverviewPanel({ stats }) {
  const items = [
    { label: "Sectors Monitored", value: stats.sectors },
    { label: "Active Hotspots", value: stats.hotspots },
    { label: "Satellites Active", value: stats.satellites },
    { label: "Countries / Regions", value: stats.sectors },
  ];

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: 28,
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        pointerEvents: "none",
        zIndex: 5,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 28,
          padding: "14px 28px",
          borderRadius: 16,
          background: "rgba(6, 10, 20, 0.55)",
          border: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
        }}
      >
        {items.map((stat) => (
          <div key={stat.label} style={{ textAlign: "center", minWidth: 92 }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: "#fff", letterSpacing: 0.3 }}>
              {stat.value}
            </div>
            <div
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.55)",
                textTransform: "uppercase",
                letterSpacing: 0.6,
                marginTop: 2,
              }}
            >
              {stat.label}
            </div>
          </div>
        ))}
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.45)", letterSpacing: 0.2 }}>
        Drag to explore, or use the navigation buttons in the bottom-left corner
      </p>
    </div>
  );
}

export default function LandingHome({ onSignOut, onAccess, onLogin, workspaceMode = false, onWorkspaceNavigate, landingEntrance = false }) {
  const [activeTab, setActiveTab] = useState(workspaceMode ? "map" : "Overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(0);
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const searchInputRef = useRef(null);
  const searchDropdownRef = useRef(null);

  const selectedRegion = useMemo(() => {
    if (!selectedRegionId) return null;
    return SURVEILLANCE_REGIONS.find((r) => r.id === selectedRegionId) || null;
  }, [selectedRegionId]);

  // Filtered search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return SURVEILLANCE_REGIONS;
    const q = searchQuery.toLowerCase().trim();
    return SURVEILLANCE_REGIONS.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.subtitle.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // World-level rollup stats for the default overview panel (mirrors the
  // reference site's "World Overview" strip: Languages / Population / etc.)
  const worldStats = useMemo(() => {
    const totalHotspots = SURVEILLANCE_REGIONS.reduce((sum, r) => {
      const n = parseInt(String(r.metrics.hotspots).replace(/[^0-9]/g, ""), 10);
      return sum + (isNaN(n) ? 0 : n);
    }, 0);
    const satellites = new Set();
    SURVEILLANCE_REGIONS.forEach((r) => {
      const name = String(r.metrics.satellitePass).split("•")[0].trim();
      if (name) satellites.add(name);
    });
    return {
      sectors: SURVEILLANCE_REGIONS.length,
      hotspots: totalHotspots.toLocaleString(),
      satellites: satellites.size,
    };
  }, []);

  // Audio toggle
  const toggleSound = () => {
    playUiClick();
    if (!soundOn) {
      startAmbientAudio();
      setSoundOn(true);
    } else {
      stopAmbientAudio();
      setSoundOn(false);
    }
  };

  const handleSelectRegion = (regionId) => {
    playUiClick();
    setSelectedRegionId(regionId);
    setCardOpen(true);
    setSearchFocused(false);
    setSearchQuery("");
  };

  const handleZoomIn = () => {
    playUiClick();
    setZoomLevel((z) => Math.min(z + 1, 3));
  };

  const handleZoomOut = () => {
    playUiClick();
    setZoomLevel((z) => Math.max(z - 1, -2));
  };

  // Close search dropdown on outside click
  useEffect(() => {
    const handleGlobalClick = (e) => {
      if (
        searchDropdownRef.current &&
        !searchDropdownRef.current.contains(e.target) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(e.target)
      ) {
        setSearchFocused(false);
      }
    };
    window.addEventListener("mousedown", handleGlobalClick);
    return () => window.removeEventListener("mousedown", handleGlobalClick);
  }, []);

  return (
    <div className="landing-google-explorer">
      {/* 3D WebGL Particle Earth Globe */}
      <OrbitalGlobe
        selectedRegion={selectedRegionId || undefined}
        targetCoords={selectedRegion?.coords}
        zoomLevel={zoomLevel}
        isCardOpen={cardOpen}
        className={landingEntrance ? "globe-entry-active" : ""}
      />

      <section className={`landing-hero-copy ${landingEntrance ? "hero-entry" : ""}`} aria-label="Orbital thermal intelligence">
        <h1>Explore the planet&apos;s thermal signals</h1>
        <p>Real-time wildfire and industrial heat intelligence from orbit.</p>
      </section>

      {/* ── Top Header Bar (Google Research Language Explorer Style) ── */}
      <header className="explorer-header" role="banner">
        <div className="header-left">
          <div className="explorer-brand" onClick={() => handleSelectRegion("India")}>
            <span className="brand-google">Agni</span>
            <span className="brand-research">Drishti</span>
            <span className="brand-sep">|</span>
            <span className="brand-project">Satellite Thermal Explorer</span>
          </div>

          <nav className="explorer-breadcrumbs" aria-label="Breadcrumbs">
            {(selectedRegion?.breadcrumbs || ["Overview", "World Map"]).map((crumb, idx) => (
              <React.Fragment key={crumb}>
                {idx > 0 && <span className="breadcrumb-arrow">&gt;</span>}
                <span className={`breadcrumb-item ${idx === (selectedRegion?.breadcrumbs || ["Overview", "World Map"]).length - 1 ? "active" : ""}`}>
                  {crumb}
                </span>
              </React.Fragment>
            ))}
          </nav>
        </div>

        {/* Workspace navigation */}
        <nav className="header-center-tabs" aria-label={workspaceMode ? "Mission modules" : "Explorer Tabs"}>
          {(workspaceMode
            ? [{ id: "map", label: "Live Map" }, { id: "dashboard", label: "Dashboard" }, { id: "incidents", label: "Incidents" }]
            : [{ id: "overview", label: "Overview" }, { id: "orbit", label: "Thermal Orbit" }, { id: "satellites", label: "Satellites" }, { id: "faq", label: "FAQ" }]
          ).map((tab) => (
            <button
              key={tab.id}
              className={`nav-tab-btn ${(workspaceMode ? activeTab === tab.id : activeTab === tab.label) ? "is-active" : ""}`}
              onClick={() => {
                playUiClick();
                if (workspaceMode && onWorkspaceNavigate) {
                  onWorkspaceNavigate(tab.id);
                } else {
                  setActiveTab(tab.label);
                  if (tab.label !== "Overview") setInfoModalOpen(true);
                }
              }}
            >
              {tab.label}
              {((workspaceMode ? activeTab === tab.id : activeTab === tab.label)) && <span className="active-indicator-bar" />}
            </button>
          ))}
        </nav>

        {/* Right Actions */}
        <div className="header-right">
          <button
            className={`sound-toggle-btn ${soundOn ? "is-on" : ""}`}
            onClick={toggleSound}
            aria-label={soundOn ? "Mute ambient sound" : "Unmute ambient sound"}
            title={soundOn ? undefined : "Best experienced with sound on"}
          >
            <span className="sound-bars" aria-hidden="true">
              <span className="bar" />
              <span className="bar" />
              <span className="bar" />
            </span>
            <span>{soundOn ? "Sound on" : "Sound off"}</span>
          </button>

          <button
            className="app-grid-icon-btn"
            title="AgniDrishti Mission Modules"
            onClick={() => setInfoModalOpen(true)}
            aria-label="Mission options"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="5" r="2" />
              <circle cx="12" cy="5" r="2" />
              <circle cx="19" cy="5" r="2" />
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
              <circle cx="5" cy="19" r="2" />
              <circle cx="12" cy="19" r="2" />
              <circle cx="19" cy="19" r="2" />
            </svg>
          </button>

          {onAccess && (
            <button
              className="header-cta-btn"
              onClick={() => {
                playUiClick();
                onAccess();
              }}
            >
              <span>Mission Control</span>
              <span className="cta-arrow">↗</span>
            </button>
          )}

          {onSignOut && (
            <button
              className="header-logout-btn"
              onClick={() => {
                playUiClick();
                onSignOut();
              }}
              title="Sign Out"
            >
              Sign Out
            </button>
          )}
        </div>
      </header>

      {/* ── Center-Top Glassmorphic Search Bar ── */}
      <div className={`search-bar-container ${landingEntrance ? "staged-entrance search-stage" : ""}`}>
        <div className={`search-pill ${searchFocused ? "is-focused" : ""}`}>
          <svg className="search-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
            <line x1="16" y1="16" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>

          <input
            ref={searchInputRef}
            type="text"
            className="search-input"
            placeholder="Search for a country, region or thermal sector"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            aria-label="Search region or thermal zone"
          />

          {searchQuery && (
            <button
              className="clear-search-btn"
              onClick={() => {
                setSearchQuery("");
                searchInputRef.current?.focus();
              }}
              aria-label="Clear search"
            >
              ×
            </button>
          )}

          <div className="filter-icon-btn" title="Thermal anomaly filter">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
          </div>
        </div>

        {/* Autocomplete Dropdown Modal (Matching main.mp4) */}
        {searchFocused && (
          <div className="search-dropdown-modal" ref={searchDropdownRef}>
            <div className="search-modal-header">
              <span>{searchResults.length}+ results</span>
            </div>

            <div className="search-results-list" role="listbox">
              {searchResults.length === 0 ? (
                <div className="search-no-results">No monitored thermal sectors match your query</div>
              ) : (
                searchResults.map((item) => (
                  <div
                    key={item.id}
                    className={`search-result-row ${item.id === selectedRegionId ? "is-selected" : ""}`}
                    onClick={() => handleSelectRegion(item.id)}
                    role="option"
                    aria-selected={item.id === selectedRegionId}
                  >
                    <div className="result-text-col">
                      <div className="result-name-row">
                        <span className="result-title">{item.name}</span>
                        <span className="result-badge">{item.code}</span>
                      </div>
                      <span className="result-sub">{item.subtitle}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {workspaceMode && (
        <div className={`globe-filter-row ${landingEntrance ? "staged-entrance filter-stage" : ""}`} aria-label="Live map filters">
          <label>Country<select defaultValue="all"><option value="all">All countries</option><option>India</option><option>United States</option><option>Australia</option></select></label>
          <label>Region<select defaultValue="all"><option value="all">All regions</option><option>Gujarat</option><option>Simlipal</option><option>Bandipur</option></select></label>
          <label>Continent<select defaultValue="all"><option value="all">All continents</option><option>Asia</option><option>Europe</option><option>Africa</option><option>Americas</option></select></label>
          <label>Classification<select defaultValue="all"><option value="all">All classes</option><option>Wildfire / Forest Fire</option><option>Industrial Fire / Accident</option><option>Gas Flare</option><option>Agricultural Burning</option></select></label>
          <label>Satellite<select defaultValue="all"><option value="all">All satellites</option><option>VIIRS</option><option>INSAT-3DR</option><option>Sentinel-3</option></select></label>
        </div>
      )}

      {/* ── World Overview stat strip + drag hint (default, nothing-selected view) ── */}
      {!cardOpen && !searchFocused && <WorldOverviewPanel stats={worldStats} />}

      {/* ── Right-Side Floating Glassmorphic Details Card (Matching main.mp4) ── */}
      {cardOpen && selectedRegion && (
        <aside className="region-explorer-card" aria-label="Surveillance Region Details">
          {/* Close button */}
          <button
            className="card-close-x-btn"
            onClick={() => {
              playUiClick();
              setCardOpen(false);
            }}
            aria-label="Close region panel"
          >
            ×
          </button>

          {/* Top section: Category, Title & Mini Constellation Map */}
          <div className="card-top-section">
            <div className="card-heading-left">
              <span className="card-kicker-label">{selectedRegion.kicker}</span>
              <h2 className="card-region-title">{selectedRegion.name}</h2>
              <p className="card-region-desc">{selectedRegion.description}</p>
            </div>

            <div className="card-heading-right" aria-hidden="true">
              <MiniConstellation regionId={selectedRegion.id} />
            </div>
          </div>

          {/* Monitoring zones for the selected region */}
          <div className="card-sectors-section">
            <h3 className="sectors-title">Monitoring Zones</h3>
            <div className="sectors-grid">
              {selectedRegion.sectors.map((sec) => (
                <div key={sec.code} className="sector-tile" title={sec.name}>
                  <div className="tile-badge-row">
                    <span className="tile-code">{sec.code}</span>
                  </div>
                  <span className="tile-name">{sec.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Live Telemetry Metrics */}
          <div className="card-telemetry-section">
            <div className="telemetry-stat">
              <span className="telemetry-label">Active Hotspots</span>
              <span className="telemetry-val val-hot">{selectedRegion.metrics.hotspots}</span>
            </div>
            <div className="telemetry-stat">
              <span className="telemetry-label">Mean FRP</span>
              <span className="telemetry-val">{selectedRegion.metrics.meanFrp}</span>
            </div>
            <div className="telemetry-stat">
              <span className="telemetry-label">Threat Priority</span>
              <span className="telemetry-val val-risk">{selectedRegion.metrics.riskScore}</span>
            </div>
            <div className="telemetry-stat">
              <span className="telemetry-label">Latest Satellite Pass</span>
              <span className="telemetry-val val-sat">{selectedRegion.metrics.satellitePass}</span>
            </div>
          </div>

          {/* Card Action: Launch Live Tactical Map */}
          {onAccess && (
            <div className="card-action-row">
              <button
                className="card-launch-btn"
                onClick={() => {
                  playUiClick();
                  onAccess();
                }}
              >
                <span>Launch Tactical Dashboard</span>
                <span className="action-arrow">↗</span>
              </button>
            </div>
          )}

          {/* Scroll to explore hint */}
          <div className="card-scroll-indicator" aria-hidden="true">
            <span>Scroll to explore</span>
            <span className="scroll-arrow">▼</span>
          </div>
        </aside>
      )}

      {/* ── Bottom-Left Floating HUD Viewport Controls ── */}
      <div className="viewport-hud-controls" aria-label="Camera and information controls">
        <div className="zoom-pill">
          <button
            className="zoom-btn"
            onClick={handleZoomIn}
            title="Zoom In"
            aria-label="Zoom In"
          >
            +
          </button>
          <div className="zoom-divider" />
          <button
            className="zoom-btn"
            onClick={handleZoomOut}
            title="Zoom Out"
            aria-label="Zoom Out"
          >
            −
          </button>
        </div>

        <button
          className="info-circle-btn"
          onClick={() => {
            playUiClick();
            setInfoModalOpen(true);
          }}
          title="Mission Information & Methodology"
          aria-label="Mission Information"
        >
          i
        </button>
      </div>

      {/* ── Mission Briefing & Info Modal ── */}
      {infoModalOpen && (
        <div className="info-modal-backdrop" onClick={() => setInfoModalOpen(false)}>
          <div className="info-modal-card" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close-btn"
              onClick={() => setInfoModalOpen(false)}
              aria-label="Close modal"
            >
              ×
            </button>
            <div className="modal-header">
              <span className="modal-badge">ISRO • DRDO • SIH SPECIFICATION</span>
              <h2>AgniDrishti: Planetary Thermal Intelligence</h2>
            </div>
            <div className="modal-body">
              <p>
                <strong>AgniDrishti</strong> fuses multispectral spaceborne sensors (INSAT-3DR TIR,
                Suomi-NPP VIIRS 375m, Sentinel-3 SLSTR, and Aqua/Terra MODIS) into an automated real-time
                pipeline for detection, false-positive debunking, and incident triage of wildfires and industrial thermal anomalies across India.
              </p>
              <div className="modal-feature-grid">
                <div className="feature-box">
                  <h4>🛰️ Orbital Sounders</h4>
                  <p>Sub-hourly thermal infrared radiometry combined with high-resolution polar passes.</p>
                </div>
                <div className="feature-box">
                  <h4>🧠 Multi-Agent ML Validation</h4>
                  <p>Tri-agent pipeline eliminates industrial false alarms and flags genuine wildfire expansions.</p>
                </div>
                <div className="feature-box">
                  <h4>⚡ NRT Alerting</h4>
                  <p>Automated SMS and encrypted telemetry dispatch to forest rangers and disaster authorities within 90 seconds of overpass.</p>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="modal-cta-btn"
                onClick={() => {
                  setInfoModalOpen(false);
                  if (onAccess) onAccess();
                }}
              >
                Open Tactical Dashboard ↗
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}