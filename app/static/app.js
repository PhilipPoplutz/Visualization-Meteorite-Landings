const THEME = {
  background: "#0F0F14",
  panel: "#16161F",
  border: "#2A2A3A",
  text: "#94A3B8",
  fell: "#FF6E00",
  found: "#00E5FF",
  mixedCluster: "#94A3B8",
};

const FILTER_BOUNDS = {
  minYear: 860,
  maxYear: 2013,
  minMass: 0,
  maxMass: 60000000,
};

const MASS_SLIDER_SCALE = 1000;
const MASS_SLIDER_MAX = Math.round(Math.log10(FILTER_BOUNDS.maxMass + 1) * MASS_SLIDER_SCALE);

const DEFAULT_FILTERS = {
  minYear: FILTER_BOUNDS.minYear,
  maxYear: FILTER_BOUNDS.maxYear,
  minMass: FILTER_BOUNDS.minMass,
  maxMass: FILTER_BOUNDS.maxMass,
  showFell: true,
  showFound: true,
};

const controls = {
  showFell: document.querySelector("#show-fell"),
  showFound: document.querySelector("#show-found"),
  applyFilters: document.querySelector("#apply-filters"),
  resetFilters: document.querySelector("#reset-filters"),
  filterStatus: document.querySelector("#filter-status"),
  mapFallStatus: document.querySelector("#map-fall-status"),
  loadingIndicator: document.querySelector("#loading-indicator"),
  recordCountLabel: document.querySelector("#record-count-label"),
  dataCount: document.querySelector("#data-count"),
  map: document.querySelector("#map"),
  tabMap: document.querySelector("#tab-map"),
  tabExplorer: document.querySelector("#tab-explorer"),
  viewMap: document.querySelector("#view-map"),
  viewExplorer: document.querySelector("#view-explorer"),
  kpiTotal: document.querySelector("#kpi-total"),
  kpiFell: document.querySelector("#kpi-fell"),
  kpiFound: document.querySelector("#kpi-found"),
  kpiMedianMass: document.querySelector("#kpi-median-mass"),
  kpiMaxMass: document.querySelector("#kpi-max-mass"),
  kpiYearRange: document.querySelector("#kpi-year-range"),
  chartMassHistogram: document.querySelector("#chart-mass-histogram"),
  chartTimeline: document.querySelector("#chart-timeline"),
  chartFocusRegions: document.querySelector("#chart-focus-regions"),
  chartMassTimeFrequency: document.querySelector("#chart-mass-time-frequency"),
  chartFallStatus: document.querySelector("#chart-fall-status"),
  chartClasses: document.querySelector("#chart-classes"),
};

const numberFormatter = new Intl.NumberFormat("en-US");
const percentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});
const FILTER_HELPER_TEXT = "Change filters, then click Apply filters.";

let activeRequest = null;
let activeView = "map";
let latestRequestId = 0;
let isLoading = false;
let listenersBound = false;
let mapRetryTimer = null;
let clusterMajorityRefreshTimers = [];
let clusterMajorityEventSource = null;
let clusterMajorityPaintRefreshTimer = null;
let clusterMajorityAppliedSource = null;
let clusterMajorityAppliedLayerId = null;
let activeMapOnlyRequest = null;
let latestMapOnlyRequestId = 0;
let pendingFilters = { ...DEFAULT_FILTERS };
let appliedMapRecords = [];
let appliedExplorerRecords = [];
let appliedSharedFilters = null;
let appliedMapFallFilters = null;

const PLOT_THEME = {
  paper_bgcolor: THEME.panel,
  plot_bgcolor: THEME.panel,
  font: {
    color: THEME.text,
    family: "Inter, Arial, sans-serif",
  },
};

const PLOT_CONFIG = {
  displayModeBar: false,
  responsive: true,
};

const LOG_TICK_VALUES = [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8];
const LOG_TICK_TEXT = ["0.001", "0.01", "0.1", "1", "10", "100", "1k", "10k", "100k", "1M", "10M", "100M"];
const LOG_MASS_TICK_VALUES = LOG_TICK_VALUES.map((value) => 10 ** value);
const EARLY_DECADE_VALUE = 1790;
const EARLY_DECADE_LABEL = "Before 1800";
const FOCUS_REGION_LABELS = [
  "Antarctica",
  "Sahara / North Africa",
  "Arabian Peninsula",
  "Australian dry regions",
  "Atacama region",
  "Other",
];
const FOCUS_REGION_BOUNDS = [
  { label: "Sahara / North Africa", minLat: 15, maxLat: 33, minLon: -17, maxLon: 35 },
  { label: "Arabian Peninsula", minLat: 12, maxLat: 32, minLon: 34, maxLon: 60 },
  { label: "Australian dry regions", minLat: -35, maxLat: -18, minLon: 113, maxLon: 145 },
  { label: "Atacama region", minLat: -30, maxLat: -18, minLon: -75, maxLon: -66 },
];
const EXPLORER_PLOTS = [
  controls.chartMassHistogram,
  controls.chartTimeline,
  controls.chartClasses,
  controls.chartFocusRegions,
  controls.chartMassTimeFrequency,
  controls.chartFallStatus,
];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function roundYear(value) {
  return Math.round(value);
}

function parseControlNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function massToSliderValue(mass) {
  const safeMass = clamp(parseControlNumber(mass, 0), FILTER_BOUNDS.minMass, FILTER_BOUNDS.maxMass);
  return Math.round(Math.log10(safeMass + 1) * MASS_SLIDER_SCALE);
}

function sliderValueToMass(value) {
  const sliderValue = clamp(parseControlNumber(value, 0), 0, MASS_SLIDER_MAX);
  const mass = Math.round(10 ** (sliderValue / MASS_SLIDER_SCALE) - 1);
  return clamp(mass, FILTER_BOUNDS.minMass, FILTER_BOUNDS.maxMass);
}

function normalizeFilters(filters, changedField = null) {
  const next = { ...filters };

  next.minYear = roundYear(clamp(parseControlNumber(next.minYear, DEFAULT_FILTERS.minYear), FILTER_BOUNDS.minYear, FILTER_BOUNDS.maxYear));
  next.maxYear = roundYear(clamp(parseControlNumber(next.maxYear, DEFAULT_FILTERS.maxYear), FILTER_BOUNDS.minYear, FILTER_BOUNDS.maxYear));
  next.minMass = Math.round(clamp(parseControlNumber(next.minMass, DEFAULT_FILTERS.minMass), FILTER_BOUNDS.minMass, FILTER_BOUNDS.maxMass));
  next.maxMass = Math.round(clamp(parseControlNumber(next.maxMass, DEFAULT_FILTERS.maxMass), FILTER_BOUNDS.minMass, FILTER_BOUNDS.maxMass));
  next.showFell = Boolean(next.showFell);
  next.showFound = Boolean(next.showFound);

  if (next.minYear > next.maxYear) {
    if (changedField === "minYear") {
      next.maxYear = next.minYear;
    } else {
      next.minYear = next.maxYear;
    }
  }

  if (next.minMass > next.maxMass) {
    if (changedField === "minMass") {
      next.maxMass = next.minMass;
    } else {
      next.minMass = next.maxMass;
    }
  }

  return next;
}

function formatShortDecimal(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 10 ? 0 : 1,
  }).format(value);
}

function formatMassForUi(mass) {
  const numericMass = Number(mass);

  if (!Number.isFinite(numericMass)) {
    return "n/a";
  }

  if (Math.abs(numericMass) >= 1000000) {
    return `${formatShortDecimal(numericMass / 1000000)} t`;
  }

  if (Math.abs(numericMass) >= 1000) {
    return `${formatShortDecimal(numericMass / 1000)} kg`;
  }

  return `${numberFormatter.format(Math.round(numericMass))} g`;
}

function fieldControls(field) {
  return document.querySelectorAll(`[data-filter-field="${field}"]`);
}

function logFieldControls(field) {
  return document.querySelectorAll(`[data-log-filter-field="${field}"]`);
}

function sharedFilterSnapshot(filters) {
  return {
    minYear: filters.minYear,
    maxYear: filters.maxYear,
    minMass: filters.minMass,
    maxMass: filters.maxMass,
  };
}

function sameSharedFilters(filters, snapshot) {
  return Boolean(
    snapshot &&
      filters.minYear === snapshot.minYear &&
      filters.maxYear === snapshot.maxYear &&
      filters.minMass === snapshot.minMass &&
      filters.maxMass === snapshot.maxMass,
  );
}

function sameFallFilters(filters, snapshot) {
  return Boolean(snapshot && filters.showFell === snapshot.showFell && filters.showFound === snapshot.showFound);
}

function setPresetActiveState(filters = pendingFilters) {
  document.querySelectorAll("[data-preset-kind='year']").forEach((button) => {
    const isActive =
      filters.minYear === Number(button.dataset.minYear) &&
      filters.maxYear === Number(button.dataset.maxYear);
    button.classList.toggle("active", isActive);
  });

  document.querySelectorAll("[data-preset-kind='mass']").forEach((button) => {
    const isActive =
      filters.minMass === Number(button.dataset.minMass) &&
      filters.maxMass === Number(button.dataset.maxMass);
    button.classList.toggle("active", isActive);
  });
}

function syncFilterControls(filters = pendingFilters) {
  const normalized = normalizeFilters(filters);
  pendingFilters = normalized;

  fieldControls("minYear").forEach((control) => {
    control.value = normalized.minYear;
  });
  fieldControls("maxYear").forEach((control) => {
    control.value = normalized.maxYear;
  });
  fieldControls("minMass").forEach((control) => {
    control.value = normalized.minMass;
  });
  fieldControls("maxMass").forEach((control) => {
    control.value = normalized.maxMass;
  });

  logFieldControls("minMass").forEach((control) => {
    control.value = massToSliderValue(normalized.minMass);
    control.setAttribute("aria-valuetext", formatMassForUi(normalized.minMass));
  });
  logFieldControls("maxMass").forEach((control) => {
    control.value = massToSliderValue(normalized.maxMass);
    control.setAttribute("aria-valuetext", formatMassForUi(normalized.maxMass));
  });

  controls.showFell.checked = normalized.showFell;
  controls.showFound.checked = normalized.showFound;
  setPresetActiveState(normalized);
}

function fallStatusText(filters = pendingFilters) {
  if (filters.showFell && filters.showFound) {
    return "Map uses Fell and Found.";
  }

  if (filters.showFell) {
    return "Map uses Fell only.";
  }

  if (filters.showFound) {
    return "Map uses Found only.";
  }

  return "Map hides both fall statuses.";
}

function setSharedStatus(message) {
  controls.filterStatus.textContent = message || FILTER_HELPER_TEXT;
}

function setMapFallStatus(message = fallStatusText()) {
  controls.mapFallStatus.textContent = message;
}

function setLoading(loading) {
  isLoading = loading;
  [controls.applyFilters, controls.resetFilters].forEach((button) => {
    button.disabled = loading;
  });
  controls.loadingIndicator.hidden = !loading;
  controls.applyFilters.textContent = loading ? "Applying..." : "Apply filters";
}

function markFiltersDirty(changedField) {
  const sharedChanged = ["minYear", "maxYear", "minMass", "maxMass", "yearPreset", "massPreset"].includes(changedField);

  if (sharedChanged) {
    setSharedStatus(FILTER_HELPER_TEXT);
    return;
  }

  setSharedStatus(FILTER_HELPER_TEXT);
  setMapFallStatus("Map-only fall status changed. Explorer keeps both groups.");
}

function updatePendingFromField(field, rawValue) {
  const next = { ...pendingFilters };
  next[field] = parseControlNumber(rawValue, next[field]);
  pendingFilters = normalizeFilters(next, field);
  syncFilterControls(pendingFilters);
  markFiltersDirty(field);
}

function updatePendingFromLogField(field, rawValue) {
  const next = { ...pendingFilters };
  next[field] = sliderValueToMass(rawValue);
  pendingFilters = normalizeFilters(next, field);
  syncFilterControls(pendingFilters);
  markFiltersDirty(field);
}

function updatePendingFromFallStatus() {
  pendingFilters = normalizeFilters({
    ...pendingFilters,
    showFell: controls.showFell.checked,
    showFound: controls.showFound.checked,
  });
  syncFilterControls(pendingFilters);
  updateMapFallStatusImmediately();
}

function applyPreset(button) {
  const next = { ...pendingFilters };

  if (button.dataset.presetKind === "year") {
    next.minYear = Number(button.dataset.minYear);
    next.maxYear = Number(button.dataset.maxYear);
    pendingFilters = normalizeFilters(next);
    syncFilterControls(pendingFilters);
    markFiltersDirty("yearPreset");
    return;
  }

  next.minMass = Number(button.dataset.minMass);
  next.maxMass = Number(button.dataset.maxMass);
  pendingFilters = normalizeFilters(next);
  syncFilterControls(pendingFilters);
  markFiltersDirty("massPreset");
}

function filtersToParams(filters, fallMode) {
  return new URLSearchParams({
    min_year: String(filters.minYear),
    max_year: String(filters.maxYear),
    min_mass: String(filters.minMass),
    max_mass: String(filters.maxMass),
    show_fell: String(fallMode.showFell),
    show_found: String(fallMode.showFound),
  });
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveMass(record) {
  const mass = toFiniteNumber(record?.["mass (g)"]);
  return mass !== null && mass > 0 ? mass : null;
}

function validYear(record) {
  const year = toFiniteNumber(record?.year);
  return year !== null ? Math.trunc(year) : null;
}

function decadeBucket(year) {
  if (year < 1800) {
    return {
      label: EARLY_DECADE_LABEL,
      value: EARLY_DECADE_VALUE,
    };
  }

  const decade = Math.floor(year / 10) * 10;
  return {
    label: `${decade}s`,
    value: decade,
  };
}

function decadeTickLabel(value) {
  return value === EARLY_DECADE_VALUE ? EARLY_DECADE_LABEL : `${value}s`;
}

function decadeTickValues(values) {
  const numericValues = [...new Set(values.filter((value) => Number.isFinite(value)))].sort((a, b) => a - b);
  const modernValues = numericValues.filter((value) => value >= 1800);
  const ticks = numericValues.includes(EARLY_DECADE_VALUE) ? [EARLY_DECADE_VALUE] : [];

  if (modernValues.length) {
    const start = Math.floor(Math.min(...modernValues) / 20) * 20;
    const end = Math.ceil(Math.max(...modernValues) / 20) * 20;

    for (let tick = start; tick <= end; tick += 20) {
      ticks.push(tick);
    }
  }

  return [...new Set(ticks)].sort((a, b) => a - b);
}

function decadeAxis(values, title = "Decade") {
  const numericValues = values.filter((value) => Number.isFinite(value));
  const minValue = numericValues.length ? Math.min(...numericValues) : 1800;
  const maxValue = numericValues.length ? Math.max(...numericValues) : 2010;
  const range = minValue === maxValue ? [minValue - 8, maxValue + 8] : [minValue - 8, maxValue + 8];
  const tickValues = decadeTickValues(numericValues);

  return {
    title,
    range,
    tickmode: "array",
    tickvals: tickValues,
    ticktext: tickValues.map(decadeTickLabel),
    gridcolor: THEME.border,
    zerolinecolor: THEME.border,
    color: THEME.text,
  };
}

function isInsideBounds(lat, lon, bounds) {
  return lat >= bounds.minLat && lat <= bounds.maxLat && lon >= bounds.minLon && lon <= bounds.maxLon;
}

function approximateFocusRegion(record) {
  const lat = toFiniteNumber(record?.reclat);
  const lon = toFiniteNumber(record?.reclong);

  if (lat === null || lon === null) {
    return "Other";
  }

  if (lat <= -60) {
    return "Antarctica";
  }

  const match = FOCUS_REGION_BOUNDS.find((bounds) => isInsideBounds(lat, lon, bounds));
  return match?.label || "Other";
}

function formatKpiMass(mass) {
  return mass !== null ? formatMassForUi(mass) : "n/a";
}

function median(values) {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function summarizeRecords(records) {
  const masses = records.map(positiveMass).filter((mass) => mass !== null);
  const years = records.map(validYear).filter((year) => year !== null);
  const fell = records.filter((record) => record.fall === "Fell").length;
  const found = records.filter((record) => record.fall === "Found").length;
  const minYear = years.length ? Math.min(...years) : null;
  const maxYear = years.length ? Math.max(...years) : null;

  return {
    total: records.length,
    fell,
    found,
    medianMass: median(masses),
    maxMass: masses.length ? Math.max(...masses) : null,
    yearRange: minYear !== null && maxYear !== null ? `${minYear} - ${maxYear}` : "n/a",
  };
}

function updateKpis(records) {
  const summary = summarizeRecords(records);

  controls.kpiTotal.textContent = numberFormatter.format(summary.total);
  controls.kpiFell.textContent = numberFormatter.format(summary.fell);
  controls.kpiFound.textContent = numberFormatter.format(summary.found);
  controls.kpiMedianMass.textContent = formatKpiMass(summary.medianMass);
  controls.kpiMaxMass.textContent = formatKpiMass(summary.maxMass);
  controls.kpiYearRange.textContent = summary.yearRange;
}

function markerColor(fallStatus) {
  return fallStatus === "Fell" ? THEME.fell : THEME.found;
}

function markerSize(mass) {
  const numericMass = Number(mass);
  const safeMass = Number.isFinite(numericMass) && numericMass > 0 ? numericMass : 1;
  return Math.max(4, Math.min(22, 4 + Math.log10(safeMass + 1) * 2.7));
}

function mapRecordIsVisibleForFallFilters(record, fallFilters) {
  return (
    (record.fall === "Fell" && fallFilters.showFell) ||
    (record.fall === "Found" && fallFilters.showFound)
  );
}

function mapClusterColors(fallFilters = pendingFilters) {
  if (fallFilters.showFell && !fallFilters.showFound) {
    return [
      "rgba(255, 110, 0, 0.58)",
      "rgba(255, 110, 0, 0.68)",
      "rgba(230, 85, 0, 0.78)",
      "rgba(204, 68, 0, 0.88)",
    ];
  }

  if (fallFilters.showFound && !fallFilters.showFell) {
    return [
      "rgba(0, 229, 255, 0.46)",
      "rgba(0, 205, 230, 0.58)",
      "rgba(0, 180, 212, 0.72)",
      "rgba(0, 148, 184, 0.86)",
    ];
  }

  return [
    "rgba(148, 163, 184, 0.58)",
    "rgba(125, 138, 158, 0.68)",
    "rgba(104, 116, 137, 0.78)",
    "rgba(82, 93, 114, 0.88)",
  ];
}

function clusterMajorityProperties() {
  return {
    fell_count: ["+", ["case", ["==", ["get", "mcc"], THEME.fell], 1, 0]],
    found_count: ["+", ["case", ["==", ["get", "mcc"], THEME.found], 1, 0]],
  };
}

function clusterMajorityColorExpression() {
  return [
    "case",
    [">", ["get", "fell_count"], ["get", "found_count"]],
    THEME.fell,
    [">", ["get", "found_count"], ["get", "fell_count"]],
    THEME.found,
    THEME.mixedCluster,
  ];
}

function cloneMapboxLayer(layer) {
  return JSON.parse(JSON.stringify(layer));
}

function replaceClusterSourceWithMajorityProperties(mapboxMap, source, sourceId, clusterLayerId, glTrace, trace) {
  const sourceData = source?._data || source?._options?.data;

  if (!sourceData || !mapboxMap?.getStyle || !mapboxMap?.removeLayer || !mapboxMap?.removeSource || !mapboxMap?.addSource) {
    return false;
  }

  const layerIds = [glTrace?.layerIds?.circle, glTrace?.layerIds?.cluster, glTrace?.layerIds?.clusterCount].filter(
    (layerId) => layerId && mapboxMap.getLayer(layerId),
  );
  const styleLayers = mapboxMap.getStyle()?.layers || [];
  const layerIdSet = new Set(layerIds);
  const clonedLayers = styleLayers.filter((layer) => layerIdSet.has(layer.id)).map(cloneMapboxLayer);

  if (!clonedLayers.length) {
    return false;
  }

  const firstLayerIndex = styleLayers.findIndex((layer) => layerIdSet.has(layer.id));
  const beforeLayerId = styleLayers.slice(firstLayerIndex).find((layer) => !layerIdSet.has(layer.id))?.id;

  try {
    [...layerIds].reverse().forEach((layerId) => mapboxMap.removeLayer(layerId));
    mapboxMap.removeSource(sourceId);
    mapboxMap.addSource(sourceId, {
      type: "geojson",
      data: sourceData,
      cluster: true,
      clusterMaxZoom: trace?.cluster?.maxzoom ?? 6,
      clusterProperties: clusterMajorityProperties(),
    });

    clonedLayers.forEach((layer) => {
      if (layer.id === clusterLayerId) {
        layer.paint = {
          ...(layer.paint || {}),
          "circle-color": clusterMajorityColorExpression(),
        };
      }

      mapboxMap.addLayer(layer, beforeLayerId);
    });

    clusterMajorityAppliedSource = mapboxMap.getSource(sourceId) || null;
    clusterMajorityAppliedLayerId = clusterLayerId;
    mapboxMap.triggerRepaint?.();
    return true;
  } catch (error) {
    console.debug("Unable to rebuild map cluster source with fall-status counts", error);
    return false;
  }
}

function buildMeteoriteTrace(records, fallFilters = pendingFilters) {
  const visibleRecords = records.filter((record) => mapRecordIsVisibleForFallFilters(record, fallFilters));

  return {
    type: "scattermapbox",
    mode: "markers",
    name: "Meteorites",
    lat: visibleRecords.map((record) => record.reclat),
    lon: visibleRecords.map((record) => record.reclong),
    customdata: visibleRecords.map((record) => [
      record.name || "Unknown",
      record.year || "Unknown",
      formatMassForUi(record["mass (g)"]),
      record.fall || "Unknown",
    ]),
    hovertemplate:
      "<b>%{customdata[0]}</b><br>" +
      "Year: %{customdata[1]}<br>" +
      "Mass: %{customdata[2]}<br>" +
      "Fall Status: %{customdata[3]}" +
      "<extra></extra>",
    marker: {
      color: visibleRecords.map((record) => markerColor(record.fall)),
      size: visibleRecords.map((record) => markerSize(record["mass (g)"])),
      opacity: 0.65,
      line: {
        width: 0,
      },
    },
    textfont: {
      color: "#FFFFFF",
    },
    cluster: {
      enabled: true,
      maxzoom: 6,
      color: mapClusterColors(fallFilters),
      size: [16, 24, 32, 42],
      step: [0, 50, 500, 2500],
      opacity: 0.68,
    },
  };
}

function resizePlot(plot) {
  if (!plot || !window.Plotly || !plot.classList.contains("js-plotly-plot")) {
    return;
  }

  plot.style.width = "100%";
  plot.style.height = "100%";

  try {
    Plotly.Plots.resize(plot);
    const mapboxMap = plot?._fullLayout?.mapbox?._subplot?.map;
    if (mapboxMap?.resize) {
      mapboxMap.resize();
    }
  } catch (error) {
    console.debug("Unable to resize Plotly plot", error);
  }
}

function schedulePlotResize(plots) {
  if (!window.Plotly) {
    return;
  }

  const resizePlots = () => plots.forEach(resizePlot);

  requestAnimationFrame(() => {
    resizePlots();
    window.setTimeout(resizePlots, 80);
    window.setTimeout(resizePlots, 240);
    window.setTimeout(resizePlots, 520);
  });
}

function scheduleMapResize() {
  schedulePlotResize([controls.map]);
  scheduleClusterMajorityRefresh();
}

function scheduleExplorerResize() {
  schedulePlotResize(EXPLORER_PLOTS);
}

function styleClusterLabels() {
  const mapboxMap = mapboxMapInstance();

  if (!mapboxMap?.getStyle || !mapboxMap?.setPaintProperty) {
    return;
  }

  const layers = mapboxMap.getStyle()?.layers || [];

  layers
    .filter((layer) => layer.type === "symbol" && String(layer.id).toLowerCase().includes("cluster"))
    .forEach((layer) => {
      try {
        mapboxMap.setPaintProperty(layer.id, "text-color", "#FFFFFF");
        mapboxMap.setPaintProperty(layer.id, "text-halo-color", "rgba(15, 15, 20, 0.86)");
        mapboxMap.setPaintProperty(layer.id, "text-halo-width", 1.4);
      } catch (error) {
        console.debug("Unable to style map cluster labels", error);
      }
    });
}

function mapboxMapInstance() {
  return (
    controls.map?._fullData?.[0]?._glTrace?.subplot?.map ||
    controls.map?._fullLayout?.mapbox?._subplot?.map ||
    null
  );
}

function applyClusterMajorityColors({ allowSourceRebuild = true } = {}) {
  const trace = controls.map?._fullData?.[0] || controls.map?.data?.[0];
  const glTrace = trace?._glTrace;
  const mapboxMap = glTrace?.subplot?.map || controls.map?._fullLayout?.mapbox?._subplot?.map;
  const sourceId = glTrace?.sourceIds?.circle;
  const clusterLayerId = glTrace?.layerIds?.cluster;

  if (!mapboxMap?.getSource || !mapboxMap?.getLayer || !sourceId || !clusterLayerId) {
    return false;
  }

  const source = mapboxMap.getSource(sourceId);

  if (!source || !mapboxMap.getLayer(clusterLayerId)) {
    return false;
  }

  if (source === clusterMajorityAppliedSource && clusterLayerId === clusterMajorityAppliedLayerId) {
    try {
      mapboxMap.setPaintProperty(clusterLayerId, "circle-color", clusterMajorityColorExpression());
      mapboxMap.triggerRepaint?.();
      return true;
    } catch (error) {
      console.debug("Unable to refresh fall-status majority cluster paint", error);
      return false;
    }
  }

  if (source.setClusterOptions) {
    try {
      source.setClusterOptions({
        cluster: true,
        clusterMaxZoom: trace?.cluster?.maxzoom ?? 6,
        clusterProperties: clusterMajorityProperties(),
      });
      mapboxMap.setPaintProperty(clusterLayerId, "circle-color", clusterMajorityColorExpression());
      clusterMajorityAppliedSource = source;
      clusterMajorityAppliedLayerId = clusterLayerId;
      mapboxMap.triggerRepaint?.();
      return true;
    } catch (error) {
      console.debug("Unable to apply fall-status majority cluster colors", error);
    }
  }

  if (!allowSourceRebuild) {
    return false;
  }

  return replaceClusterSourceWithMajorityProperties(mapboxMap, source, sourceId, clusterLayerId, glTrace, trace);
}

function refreshClusterMajorityColors(options) {
  styleClusterLabels();
  return applyClusterMajorityColors(options);
}

function clearClusterMajorityRefreshTimers() {
  clusterMajorityRefreshTimers.forEach((timerId) => window.clearTimeout(timerId));
  clusterMajorityRefreshTimers = [];
}

function bindClusterMajorityMapEvents() {
  const mapboxMap = mapboxMapInstance();

  if (!mapboxMap || clusterMajorityEventSource === mapboxMap) {
    return;
  }

  if (clusterMajorityEventSource?.off) {
    clusterMajorityEventSource.off("moveend", scheduleClusterMajorityPaintRefresh);
    clusterMajorityEventSource.off("zoomend", scheduleClusterMajorityPaintRefresh);
  }

  clusterMajorityEventSource = mapboxMap;

  if (mapboxMap.on) {
    mapboxMap.on("moveend", scheduleClusterMajorityPaintRefresh);
    mapboxMap.on("zoomend", scheduleClusterMajorityPaintRefresh);
  }
}

function scheduleClusterMajorityPaintRefresh() {
  window.clearTimeout(clusterMajorityPaintRefreshTimer);

  clusterMajorityPaintRefreshTimer = window.setTimeout(() => {
    refreshClusterMajorityColors({ allowSourceRebuild: false });
  }, 160);
}

function scheduleClusterMajorityRefresh() {
  if (!window.Plotly) {
    return;
  }

  clearClusterMajorityRefreshTimers();

  const refresh = () => {
    refreshClusterMajorityColors();
    bindClusterMajorityMapEvents();
  };

  requestAnimationFrame(refresh);
  [40, 120, 260, 520].forEach((delay) => {
    clusterMajorityRefreshTimers.push(window.setTimeout(refresh, delay));
  });

  const mapboxMap = mapboxMapInstance();
  if (mapboxMap?.once) {
    try {
      mapboxMap.once("idle", refresh);
    } catch (error) {
      console.debug("Unable to schedule map cluster color refresh on idle", error);
    }
  }
}

function renderMap(records, fallFilters = appliedMapFallFilters || pendingFilters) {
  window.clearTimeout(mapRetryTimer);

  if (!window.Plotly) {
    return;
  }

  const traces = [buildMeteoriteTrace(records, fallFilters)];

  const layout = {
    paper_bgcolor: THEME.panel,
    plot_bgcolor: THEME.panel,
    margin: { t: 0, b: 0, l: 0, r: 0 },
    showlegend: false,
    uirevision: "meteorite-mapbox",
    mapbox: {
      style: "carto-darkmatter",
      center: { lat: 20, lon: 0 },
      zoom: 1,
    },
  };

  const render = (attempt = 0) => {
    try {
      Plotly.react(controls.map, traces, layout, {
        ...PLOT_CONFIG,
        scrollZoom: true,
      })
        .then(() => {
          scheduleClusterMajorityRefresh();
          scheduleMapResize();
        })
        .catch((error) => {
          const isStyleLoading = String(error?.message || error).includes("Style is not done loading");

          if (isStyleLoading && attempt < 4) {
            mapRetryTimer = window.setTimeout(() => render(attempt + 1), 220 * (attempt + 1));
            return;
          }

          console.error("Failed to render map", error);
        });
    } catch (error) {
      console.error("Failed to render map", error);
    }
  };

  render();
}

function safePlot(element, traces, layout, label, config = PLOT_CONFIG) {
  if (!element || !window.Plotly) {
    return;
  }

  try {
    Plotly.react(element, traces, layout, config).catch((error) =>
      console.error(`Failed to render ${label}`, error),
    );
  } catch (error) {
    console.error(`Failed to render ${label}`, error);
  }
}

function baseChartLayout(extra = {}) {
  return {
    ...PLOT_THEME,
    autosize: true,
    margin: { t: 18, r: 28, b: 62, l: 72 },
    hovermode: "closest",
    ...extra,
  };
}

function renderEmptyPlot(element, message) {
  const layout = baseChartLayout({
    margin: { t: 20, r: 20, b: 20, l: 20 },
    xaxis: { visible: false },
    yaxis: { visible: false },
    annotations: [
      {
        text: message,
        x: 0.5,
        y: 0.5,
        xref: "paper",
        yref: "paper",
        showarrow: false,
        align: "center",
        font: {
          color: THEME.text,
          size: 14,
        },
      },
    ],
  });

  safePlot(element, [], layout, "empty chart");
}

function logAxisRange(logValues) {
  if (!logValues.length) {
    return [-3, 8];
  }

  let min = Math.floor(Math.min(...logValues));
  let max = Math.ceil(Math.max(...logValues));

  if (min === max) {
    min -= 0.5;
    max += 0.5;
  }

  return [Math.max(-3, min - 0.15), Math.min(8, max + 0.15)];
}

function logAxis(title = "Mass (g, log10 scale)") {
  return {
    title,
    tickmode: "array",
    tickvals: LOG_TICK_VALUES,
    ticktext: LOG_TICK_TEXT,
    gridcolor: THEME.border,
    zerolinecolor: THEME.border,
    color: THEME.text,
  };
}

function logMassAxis(title = "Median mass (g, log scale)", range = null) {
  const axis = {
    type: "log",
    title,
    tickmode: "array",
    tickvals: LOG_MASS_TICK_VALUES,
    ticktext: LOG_TICK_TEXT,
    gridcolor: THEME.border,
    zerolinecolor: THEME.border,
    color: THEME.text,
  };

  if (range) {
    axis.range = range;
  }

  return axis;
}

function massLogValues(records) {
  return records
    .map(positiveMass)
    .filter((mass) => mass !== null)
    .map((mass) => Math.log10(mass));
}

function renderMassHistogram(records) {
  const logMass = massLogValues(records);

  if (!logMass.length) {
    renderEmptyPlot(controls.chartMassHistogram, "No valid positive mass values for the selected filters.");
    return;
  }

  const xRange = logAxisRange(logMass);
  const trace = {
    type: "histogram",
    x: logMass,
    marker: {
      color: "rgba(0, 229, 255, 0.72)",
      line: {
        color: "rgba(248, 250, 252, 0.18)",
        width: 1,
      },
    },
    xbins: {
      start: xRange[0],
      end: xRange[1],
      size: Math.max(0.15, (xRange[1] - xRange[0]) / 42),
    },
    hovertemplate: "log10(Mass g): %{x:.2f}<br>Records: %{y}<extra></extra>",
  };

  const layout = baseChartLayout({
    bargap: 0.03,
    xaxis: {
      ...logAxis(),
      range: xRange,
    },
    yaxis: {
      title: "Records",
      gridcolor: THEME.border,
      zerolinecolor: THEME.border,
      color: THEME.text,
    },
  });

  safePlot(controls.chartMassHistogram, [trace], layout, "mass histogram");
}

function countByDecadeAndFall(records) {
  const counts = new Map();

  records.forEach((record) => {
    const year = validYear(record);

    if (year === null) {
      return;
    }

    const bucket = decadeBucket(year);

    if (!counts.has(bucket.value)) {
      counts.set(bucket.value, {
        ...bucket,
        fell: 0,
        found: 0,
        total: 0,
      });
    }

    const entry = counts.get(bucket.value);

    if (record.fall === "Fell") {
      entry.fell += 1;
    } else if (record.fall === "Found") {
      entry.found += 1;
    }

    entry.total += 1;
  });

  return [...counts.values()].sort((entryA, entryB) => entryA.value - entryB.value);
}

function renderTimelineChart(records) {
  const decadeCounts = countByDecadeAndFall(records);

  if (!decadeCounts.length) {
    renderEmptyPlot(controls.chartTimeline, "No valid years for the selected filters.");
    return;
  }

  const traces = [
    {
      status: "Fell",
      field: "fell",
      color: THEME.fell,
    },
    {
      status: "Found",
      field: "found",
      color: THEME.found,
    },
  ].map((traceConfig) => ({
    type: "bar",
    name: traceConfig.status,
    x: decadeCounts.map((entry) => entry.value),
    y: decadeCounts.map((entry) => entry[traceConfig.field]),
    width: decadeCounts.map(() => 8.5),
    customdata: decadeCounts.map((entry) => [
      entry.label,
      numberFormatter.format(entry.fell),
      numberFormatter.format(entry.found),
      numberFormatter.format(entry.total),
    ]),
    marker: {
      color: traceConfig.color,
      opacity: 0.82,
      line: {
        color: "rgba(248, 250, 252, 0.16)",
        width: 1,
      },
    },
    hovertemplate:
      "Decade: %{customdata[0]}<br>" +
      "Fell count: %{customdata[1]}<br>" +
      "Found count: %{customdata[2]}<br>" +
      "Total count: %{customdata[3]}<extra></extra>",
  }));

  const layout = baseChartLayout({
    barmode: "stack",
    bargap: 0.1,
    showlegend: true,
    legend: {
      orientation: "h",
      traceorder: "normal",
      x: 0,
      y: 1.12,
      font: { color: THEME.text },
    },
    xaxis: decadeAxis(decadeCounts.map((entry) => entry.value)),
    yaxis: {
      title: "Records",
      rangemode: "tozero",
      gridcolor: THEME.border,
      zerolinecolor: THEME.border,
      color: THEME.text,
    },
  });

  safePlot(controls.chartTimeline, traces, layout, "temporal development chart");
}

function focusRegionCounts(records) {
  const counts = new Map(
    FOCUS_REGION_LABELS.map((region) => [
      region,
      {
        region,
        Fell: 0,
        Found: 0,
      },
    ]),
  );

  records.forEach((record) => {
    const region = approximateFocusRegion(record);
    const entry = counts.get(region) || counts.get("Other");

    if (record.fall === "Fell" || record.fall === "Found") {
      entry[record.fall] += 1;
    }
  });

  return FOCUS_REGION_LABELS.map((region) => counts.get(region));
}

function renderFocusRegionsChart(records) {
  if (!records.length) {
    renderEmptyPlot(controls.chartFocusRegions, "No records for the selected filters.");
    return;
  }

  const counts = focusRegionCounts(records);
  const traces = ["Fell", "Found"].map((status) => ({
    type: "bar",
    name: status,
    x: counts.map((entry) => entry.region),
    y: counts.map((entry) => entry[status]),
    customdata: counts.map((entry) => [
      entry.region,
      status,
      numberFormatter.format(entry[status]),
      `${percentFormatter.format((entry[status] / records.length) * 100)}%`,
    ]),
    marker: {
      color: markerColor(status),
      opacity: 0.82,
      line: {
        color: "rgba(248, 250, 252, 0.16)",
        width: 1,
      },
    },
    hovertemplate:
      "<b>%{customdata[0]}</b><br>" +
      "Fall status: %{customdata[1]}<br>" +
      "Records: %{customdata[2]}<br>" +
      "Share of filtered records: %{customdata[3]}<extra></extra>",
  }));

  const layout = baseChartLayout({
    barmode: "stack",
    showlegend: true,
    legend: {
      orientation: "h",
      traceorder: "normal",
      x: 0,
      y: 1.12,
      font: { color: THEME.text },
    },
    xaxis: {
      title: "Approximate focus region",
      categoryorder: "array",
      categoryarray: FOCUS_REGION_LABELS,
      tickangle: -18,
      automargin: true,
      color: THEME.text,
    },
    yaxis: {
      title: "Records",
      rangemode: "tozero",
      gridcolor: THEME.border,
      zerolinecolor: THEME.border,
      color: THEME.text,
    },
  });

  safePlot(controls.chartFocusRegions, traces, layout, "focus regions chart");
}

function massTimeFrequencyPoints(records) {
  const groups = new Map();

  records.forEach((record) => {
    const year = validYear(record);
    const mass = positiveMass(record);

    if (year === null || mass === null || (record.fall !== "Fell" && record.fall !== "Found")) {
      return;
    }

    const bucket = decadeBucket(year);
    const key = `${record.fall}-${bucket.value}`;

    if (!groups.has(key)) {
      groups.set(key, {
        ...bucket,
        status: record.fall,
        masses: [],
      });
    }

    groups.get(key).masses.push(mass);
  });

  return [...groups.values()]
    .map((group) => ({
      decade: group.label,
      value: group.value,
      status: group.status,
      count: group.masses.length,
      medianMass: median(group.masses),
    }))
    .filter((point) => point.count > 0 && point.medianMass !== null)
    .sort((pointA, pointB) => pointA.value - pointB.value || pointA.status.localeCompare(pointB.status));
}

function renderMassTimeFrequencyChart(records) {
  const points = massTimeFrequencyPoints(records);

  if (!points.length) {
    renderEmptyPlot(controls.chartMassTimeFrequency, "No valid mass-year records for the selected filters.");
    return;
  }

  const maxCount = Math.max(...points.map((point) => point.count));
  const sizeRef = maxCount > 0 ? (2 * maxCount) / 44 ** 2 : 1;
  const logMedianValues = points.map((point) => Math.log10(point.medianMass));
  const traces = ["Fell", "Found"]
    .map((status) => {
      const statusPoints = points.filter((point) => point.status === status);

      if (!statusPoints.length) {
        return null;
      }

      return {
        type: "scatter",
        mode: "markers",
        name: status,
        x: statusPoints.map((point) => point.value),
        y: statusPoints.map((point) => point.medianMass),
        customdata: statusPoints.map((point) => [
          point.decade,
          point.status,
          numberFormatter.format(point.count),
          formatMassForUi(point.medianMass),
        ]),
        marker: {
          color: markerColor(status),
          opacity: 0.72,
          size: statusPoints.map((point) => point.count),
          sizemode: "area",
          sizeref: sizeRef,
          sizemin: 7,
          line: {
            color: "rgba(248, 250, 252, 0.34)",
            width: 1,
          },
        },
        hovertemplate:
          "Decade: %{customdata[0]}<br>" +
          "Fall status: %{customdata[1]}<br>" +
          "Records: %{customdata[2]}<br>" +
          "Median mass: %{customdata[3]}<extra></extra>",
      };
    })
    .filter(Boolean);

  const layout = baseChartLayout({
    showlegend: true,
    legend: {
      orientation: "h",
      traceorder: "normal",
      x: 0,
      y: 1.12,
      font: { color: THEME.text },
    },
    xaxis: decadeAxis(points.map((point) => point.value)),
    yaxis: logMassAxis("Median mass (g, log scale)", logAxisRange(logMedianValues)),
  });

  safePlot(controls.chartMassTimeFrequency, traces, layout, "mass time frequency chart");
}

function valuesForFallStatus(records, status) {
  return records
    .filter((record) => record.fall === status)
    .map(positiveMass)
    .filter((mass) => mass !== null);
}

function renderFallStatusChart(records) {
  const allLogMass = massLogValues(records);
  const traces = ["Fell", "Found"]
    .map((status) => {
      const values = valuesForFallStatus(records, status);
      const color = markerColor(status);

      if (!values.length) {
        return null;
      }

      return {
        type: "violin",
        name: status,
        y: values.map((mass) => Math.log10(mass)),
        customdata: values.map(formatMassForUi),
        points: false,
        box: {
          visible: true,
          width: 0.22,
        },
        meanline: {
          visible: true,
        },
        scalemode: "count",
        spanmode: "hard",
        marker: {
          color,
          opacity: 0.22,
        },
        line: {
          color,
          width: 2,
        },
        fillcolor: status === "Fell" ? "rgba(255, 110, 0, 0.35)" : "rgba(0, 229, 255, 0.32)",
        hovertemplate: `${status}<br>Mass: %{customdata}<br>log10(Mass g): %{y:.2f}<extra></extra>`,
      };
    })
    .filter(Boolean);

  if (!traces.length) {
    renderEmptyPlot(controls.chartFallStatus, "No valid positive mass values for Fell or Found records.");
    return;
  }

  const yRange = logAxisRange(allLogMass);
  const layout = baseChartLayout({
    showlegend: false,
    violinmode: "group",
    xaxis: {
      title: "Fall status",
      gridcolor: THEME.border,
      zerolinecolor: THEME.border,
      color: THEME.text,
    },
    yaxis: {
      ...logAxis(),
      range: yRange,
    },
  });

  safePlot(controls.chartFallStatus, traces, layout, "fall status chart");
}

function topClasses(records, limit = 10) {
  const counts = new Map();

  records.forEach((record) => {
    const recclass = String(record.recclass || "").trim();

    if (!recclass) {
      return;
    }

    counts.set(recclass, (counts.get(recclass) || 0) + 1);
  });

  return [...counts.entries()]
    .sort(([, countA], [, countB]) => countB - countA)
    .slice(0, limit)
    .map(([recclass, count]) => ({
      recclass,
      count,
      percentage: records.length ? (count / records.length) * 100 : 0,
    }));
}

function renderClassChart(records) {
  const classes = topClasses(records);

  if (!classes.length) {
    renderEmptyPlot(controls.chartClasses, "No meteorite class values for the selected filters.");
    return;
  }

  const sortedForBars = [...classes].reverse();
  const trace = {
    type: "bar",
    orientation: "h",
    x: sortedForBars.map((entry) => entry.count),
    y: sortedForBars.map((entry) => entry.recclass),
    customdata: sortedForBars.map((entry) => percentFormatter.format(entry.percentage)),
    marker: {
      color: "rgba(0, 229, 255, 0.68)",
      line: {
        color: "rgba(248, 250, 252, 0.16)",
        width: 1,
      },
    },
    hovertemplate:
      "<b>%{y}</b><br>" +
      "Records: %{x:,}<br>" +
      "Share of current records: %{customdata}%<extra></extra>",
  };

  const layout = baseChartLayout({
    margin: { t: 18, r: 32, b: 56, l: 110 },
    xaxis: {
      title: "Records",
      rangemode: "tozero",
      gridcolor: THEME.border,
      zerolinecolor: THEME.border,
      color: THEME.text,
    },
    yaxis: {
      title: "",
      automargin: true,
      color: THEME.text,
    },
  });

  safePlot(controls.chartClasses, [trace], layout, "class chart");
}

function renderExplorerCharts(records) {
  updateKpis(records);
  renderMassHistogram(records);
  renderTimelineChart(records);
  renderClassChart(records);
  renderFocusRegionsChart(records);
  renderMassTimeFrequencyChart(records);
  renderFallStatusChart(records);

  if (activeView === "explorer") {
    scheduleExplorerResize();
  }
}

function renderCurrentRecordCount() {
  const records = activeView === "map" ? appliedMapRecords : appliedExplorerRecords;
  controls.recordCountLabel.textContent = activeView === "map" ? "Map records:" : "Explorer records:";
  controls.dataCount.textContent = numberFormatter.format(records.length);
}

function renderAll() {
  renderCurrentRecordCount();
  renderMap(appliedMapRecords);
  renderExplorerCharts(appliedExplorerRecords);
}

function resizeActivePlots() {
  if (activeView === "map") {
    scheduleMapResize();
    return;
  }

  scheduleExplorerResize();
}

function showView(viewName) {
  activeView = viewName;
  const showMap = viewName === "map";

  controls.viewMap.hidden = !showMap;
  controls.viewExplorer.hidden = showMap;
  controls.tabMap.classList.toggle("active", showMap);
  controls.tabExplorer.classList.toggle("active", !showMap);
  controls.tabMap.setAttribute("aria-selected", String(showMap));
  controls.tabExplorer.setAttribute("aria-selected", String(!showMap));

  renderCurrentRecordCount();
  resizeActivePlots();
}

async function fetchRecords(params, signal) {
  const response = await fetch(`/api/meteorites?${params.toString()}`, { signal });

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  return response.json();
}

function appliedSharedFilterSet() {
  const shared = appliedSharedFilters || sharedFilterSnapshot(DEFAULT_FILTERS);
  return {
    ...shared,
    showFell: pendingFilters.showFell,
    showFound: pendingFilters.showFound,
  };
}

function hasPendingSharedChanges() {
  return !sameSharedFilters(pendingFilters, appliedSharedFilters || sharedFilterSnapshot(DEFAULT_FILTERS));
}

function appliedStatusText(mapRecords, explorerRecords) {
  return FILTER_HELPER_TEXT;
}

async function applyFilters() {
  const filters = normalizeFilters(pendingFilters);
  pendingFilters = filters;
  syncFilterControls(filters);

  const sharedChanged = !sameSharedFilters(filters, appliedSharedFilters);
  const fallChanged = !sameFallFilters(filters, appliedMapFallFilters);
  const shouldFetchExplorer = sharedChanged;
  const shouldFetchMap = sharedChanged || fallChanged;

  if (!shouldFetchMap && !shouldFetchExplorer) {
    setSharedStatus(appliedStatusText(appliedMapRecords, appliedExplorerRecords));
    setMapFallStatus(fallStatusText(filters));
    scheduleClusterMajorityRefresh();
    return;
  }

  const requestId = latestRequestId + 1;
  latestRequestId = requestId;

  if (activeRequest) {
    activeRequest.abort();
  }

  if (activeMapOnlyRequest) {
    activeMapOnlyRequest.abort();
    latestMapOnlyRequestId += 1;
  }

  activeRequest = new AbortController();
  setLoading(true);
  setSharedStatus(FILTER_HELPER_TEXT);

  try {
    const explorerParams = filtersToParams(filters, {
      showFell: true,
      showFound: true,
    });
    const mapParams = filtersToParams(filters, {
      showFell: filters.showFell,
      showFound: filters.showFound,
    });

    const explorerPromise = shouldFetchExplorer
      ? fetchRecords(explorerParams, activeRequest.signal)
      : Promise.resolve(appliedExplorerRecords);
    const mapPromise = shouldFetchMap
      ? shouldFetchExplorer && filters.showFell && filters.showFound
        ? explorerPromise
        : fetchRecords(mapParams, activeRequest.signal)
      : Promise.resolve(appliedMapRecords);

    const [mapRecords, explorerRecords] = await Promise.all([mapPromise, explorerPromise]);

    if (requestId !== latestRequestId) {
      return;
    }

    if (shouldFetchMap) {
      appliedMapRecords = mapRecords;
      renderMap(appliedMapRecords, filters);
    }

    if (shouldFetchExplorer) {
      appliedExplorerRecords = explorerRecords;
      renderExplorerCharts(appliedExplorerRecords);
      appliedSharedFilters = sharedFilterSnapshot(filters);
    }

    appliedMapFallFilters = {
      showFell: filters.showFell,
      showFound: filters.showFound,
    };

    renderCurrentRecordCount();
    setSharedStatus(appliedStatusText(appliedMapRecords, appliedExplorerRecords));
    setMapFallStatus(fallStatusText(filters));
  } catch (error) {
    if (error.name === "AbortError" || requestId !== latestRequestId) {
      return;
    }

    console.error(error);

    if (shouldFetchMap) {
      appliedMapRecords = [];
      renderMap(appliedMapRecords);
    }

    if (shouldFetchExplorer) {
      appliedExplorerRecords = [];
      renderExplorerCharts(appliedExplorerRecords);
    }

    renderCurrentRecordCount();
    setSharedStatus("Could not load data. Check the server and try again.");
  } finally {
    if (requestId === latestRequestId) {
      setLoading(false);
    }
  }
}

async function updateMapFallStatusImmediately() {
  const filters = appliedSharedFilterSet();
  const requestId = latestMapOnlyRequestId + 1;
  latestMapOnlyRequestId = requestId;

  if (activeMapOnlyRequest) {
    activeMapOnlyRequest.abort();
  }

  activeMapOnlyRequest = new AbortController();
  setMapFallStatus("Updating map fall status...");

  try {
    const mapParams = filtersToParams(filters, {
      showFell: filters.showFell,
      showFound: filters.showFound,
    });
    const mapRecords = await fetchRecords(mapParams, activeMapOnlyRequest.signal);

    if (requestId !== latestMapOnlyRequestId) {
      return;
    }

    appliedMapRecords = mapRecords;
    appliedMapFallFilters = {
      showFell: filters.showFell,
      showFound: filters.showFound,
    };
    renderMap(appliedMapRecords, filters);
    renderCurrentRecordCount();
    setMapFallStatus(fallStatusText(filters));

    if (hasPendingSharedChanges()) {
      setSharedStatus(FILTER_HELPER_TEXT);
    } else {
      setSharedStatus(appliedStatusText(appliedMapRecords, appliedExplorerRecords));
    }
  } catch (error) {
    if (error.name === "AbortError" || requestId !== latestMapOnlyRequestId) {
      return;
    }

    console.error(error);
    appliedMapRecords = [];
    renderMap(appliedMapRecords, filters);
    renderCurrentRecordCount();
    setMapFallStatus("Could not update map fall status.");
  } finally {
    if (requestId === latestMapOnlyRequestId) {
      activeMapOnlyRequest = null;
    }
  }
}

function resetFilterControls() {
  pendingFilters = { ...DEFAULT_FILTERS };
  syncFilterControls(pendingFilters);
  setSharedStatus(FILTER_HELPER_TEXT);
  setMapFallStatus(fallStatusText(pendingFilters));
  scheduleClusterMajorityRefresh();
}

function bindEvents() {
  if (listenersBound) {
    return;
  }

  document.querySelectorAll("[data-filter-field]").forEach((control) => {
    control.addEventListener("input", (event) => {
      updatePendingFromField(event.target.dataset.filterField, event.target.value);
    });
    control.addEventListener("change", (event) => {
      updatePendingFromField(event.target.dataset.filterField, event.target.value);
    });
  });

  document.querySelectorAll("[data-log-filter-field]").forEach((control) => {
    control.addEventListener("input", (event) => {
      updatePendingFromLogField(event.target.dataset.logFilterField, event.target.value);
    });
    control.addEventListener("change", (event) => {
      updatePendingFromLogField(event.target.dataset.logFilterField, event.target.value);
    });
  });

  document.querySelectorAll("[data-preset-kind]").forEach((button) => {
    button.addEventListener("click", () => applyPreset(button));
  });

  controls.showFell.addEventListener("change", updatePendingFromFallStatus);
  controls.showFound.addEventListener("change", updatePendingFromFallStatus);
  controls.applyFilters.addEventListener("click", applyFilters);
  controls.resetFilters.addEventListener("click", resetFilterControls);
  window.addEventListener("resize", resizeActivePlots);

  controls.tabMap.addEventListener("click", () => showView("map"));
  controls.tabExplorer.addEventListener("click", () => showView("explorer"));

  listenersBound = true;
}

function init() {
  syncFilterControls(DEFAULT_FILTERS);
  setMapFallStatus(fallStatusText(DEFAULT_FILTERS));
  bindEvents();
  showView("map");
  renderCurrentRecordCount();
  applyFilters();
}

init();
