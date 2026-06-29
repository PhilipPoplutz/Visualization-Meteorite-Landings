const THEME = {
  background: "#0F0F14",
  panel: "#16161F",
  border: "#2A2A3A",
  text: "#94A3B8",
  fell: "#FF6E00",
  found: "#00E5FF",
};

const controls = {
  showFell: document.querySelector("#show-fell"),
  showFound: document.querySelector("#show-found"),
  minYear: document.querySelector("#min-year"),
  maxYear: document.querySelector("#max-year"),
  minMass: document.querySelector("#min-mass"),
  maxMass: document.querySelector("#max-mass"),
  yearMinValue: document.querySelector("#year-min-value"),
  yearMaxValue: document.querySelector("#year-max-value"),
  massMinValue: document.querySelector("#mass-min-value"),
  massMaxValue: document.querySelector("#mass-max-value"),
  dataCount: document.querySelector("#data-count"),
  map: document.querySelector("#map"),
  tabMap: document.querySelector("#tab-map"),
  tabExplorer: document.querySelector("#tab-explorer"),
  viewMap: document.querySelector("#view-map"),
  viewExplorer: document.querySelector("#view-explorer"),
  chartDensity: document.querySelector("#chart-density"),
  chartViolin: document.querySelector("#chart-violin"),
};

const numberFormatter = new Intl.NumberFormat("en-US");
let activeRequest = null;
let mapRetryTimer = null;

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

function clampRange(minInput, maxInput) {
  const minValue = Number(minInput.value);
  const maxValue = Number(maxInput.value);

  if (minValue > maxValue) {
    const midpoint = Math.round((minValue + maxValue) / 2);
    minInput.value = midpoint;
    maxInput.value = midpoint;
  }
}

function updateFilterLabels() {
  clampRange(controls.minYear, controls.maxYear);
  clampRange(controls.minMass, controls.maxMass);

  controls.yearMinValue.textContent = controls.minYear.value;
  controls.yearMaxValue.textContent = controls.maxYear.value;
  controls.massMinValue.textContent = `${numberFormatter.format(Number(controls.minMass.value))} g`;
  controls.massMaxValue.textContent = `${numberFormatter.format(Number(controls.maxMass.value))} g`;
}

function formatMass(mass) {
  const numericMass = Number(mass);
  return Number.isFinite(numericMass) ? `${numberFormatter.format(numericMass)} g` : "Unknown";
}

function markerColor(fallStatus) {
  return fallStatus === "Fell" ? THEME.fell : THEME.found;
}

function markerSize(mass) {
  const numericMass = Number(mass);
  const safeMass = Number.isFinite(numericMass) && numericMass > 0 ? numericMass : 1;
  return Math.max(4, Math.min(22, 4 + Math.log10(safeMass + 1) * 2.7));
}

function prepareExplorerData(records) {
  const validRecords = records.filter((record) => {
    const numericYear = Number(record.year);
    const numericMass = Number(record["mass (g)"]);

    return (
      Number.isFinite(numericYear) &&
      Number.isFinite(numericMass) &&
      numericMass > 0 &&
      (record.fall === "Fell" || record.fall === "Found")
    );
  });

  return {
    mass: validRecords.map((record) => Number(record["mass (g)"])),
    logMass: validRecords.map((record) => Math.log10(Number(record["mass (g)"]))),
    year: validRecords.map((record) => Number(record.year)),
    fall: validRecords.map((record) => record.fall),
  };
}

function styleClusterLabels() {
  const mapboxMap = controls.map?._fullLayout?.mapbox?._subplot?.map;

  if (!mapboxMap?.getStyle) {
    return;
  }

  const layers = mapboxMap.getStyle().layers || [];

  layers.forEach((layer) => {
    const layoutText = JSON.stringify(layer.layout || {});
    const isClusterCountLayer =
      layer.type === "symbol" &&
      (layer.id.toLowerCase().includes("cluster") || layoutText.includes("point_count"));

    if (!isClusterCountLayer) {
      return;
    }

    try {
      mapboxMap.setPaintProperty(layer.id, "text-color", "#FFFFFF");
      mapboxMap.setPaintProperty(layer.id, "text-halo-color", "rgba(15, 15, 20, 0.9)");
      mapboxMap.setPaintProperty(layer.id, "text-halo-width", 1.2);
    } catch (error) {
      console.debug("Unable to style cluster label layer", layer.id, error);
    }
  });
}

function buildMeteoriteTrace(records) {
  return {
    type: "scattermapbox",
    mode: "markers",
    name: "Meteorites",
    lat: records.map((record) => record.reclat),
    lon: records.map((record) => record.reclong),
    customdata: records.map((record) => [
      record.name || "Unknown",
      record.year || "Unknown",
      formatMass(record["mass (g)"]),
      record.fall || "Unknown",
    ]),
    hovertemplate:
      "<b>%{customdata[0]}</b><br>" +
      "Year: %{customdata[1]}<br>" +
      "Mass: %{customdata[2]}<br>" +
      "Fall Status: %{customdata[3]}" +
      "<extra></extra>",
    marker: {
      color: records.map((record) => markerColor(record.fall)),
      size: records.map((record) => markerSize(record["mass (g)"])),
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
      color: [
        "rgba(0, 229, 255, 0.65)",
        "rgba(0, 229, 255, 0.70)",
        "rgba(92, 175, 205, 0.72)",
        "rgba(255, 110, 0, 0.76)",
      ],
      size: [16, 24, 32, 42],
      step: [0, 50, 500, 2500],
      opacity: 0.65,
    },
  };
}

function renderMap(records) {
  window.clearTimeout(mapRetryTimer);

  const traces = [buildMeteoriteTrace(records)];

  const layout = {
    paper_bgcolor: THEME.panel,
    plot_bgcolor: THEME.panel,
    margin: { t: 0, b: 0, l: 0, r: 0 },
    showlegend: false,
    uirevision: "meteorite-mapbox",
    mapbox: {
      style: "carto-darkmatter",
      center: {
        lat: 20,
        lon: 0,
      },
      zoom: 1,
    },
  };

  const render = (attempt = 0) => {
    try {
      Plotly.react(controls.map, traces, layout, {
        ...PLOT_CONFIG,
        scrollZoom: true,
      })
        .then(styleClusterLabels)
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

function renderDensityChart(chartData) {
  const trace = {
    type: "histogram2dcontour",
    x: chartData.logMass,
    y: chartData.year,
    colorscale: [
      [0, "rgba(15, 15, 20, 0)"],
      [0.22, "rgba(42, 42, 58, 0.72)"],
      [0.55, "rgba(0, 229, 255, 0.58)"],
      [0.78, "rgba(0, 229, 255, 0.86)"],
      [1, "rgba(255, 110, 0, 0.95)"],
    ],
    contours: {
      coloring: "heatmap",
      showlines: false,
    },
    line: {
      width: 0,
    },
    ncontours: 18,
    showscale: false,
    xbins: {
      start: -1,
      end: 8,
      size: 0.15,
    },
    ybins: {
      start: 1800,
      end: 2015,
      size: 4,
    },
    hovertemplate: "log10(Mass g): %{x:.2f}<br>Year bin: %{y}<br>Density: %{z}<extra></extra>",
  };

  const layout = {
    ...PLOT_THEME,
    autosize: true,
    title: {
      text: "Density of Discoveries (Mass vs. Year)",
      font: { color: "#F8FAFC", size: 17 },
      x: 0.03,
      xanchor: "left",
    },
    margin: { t: 58, r: 28, b: 64, l: 68 },
    xaxis: {
      title: "Mass (g, log scale)",
      tickmode: "array",
      tickvals: [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8],
      ticktext: ["0.1", "1", "10", "100", "1k", "10k", "100k", "1M", "10M", "100M"],
      range: [-1, 8],
      gridcolor: THEME.border,
      zerolinecolor: THEME.border,
      color: THEME.text,
    },
    yaxis: {
      title: "Year",
      range: [1800, 2015],
      gridcolor: THEME.border,
      zerolinecolor: THEME.border,
      color: THEME.text,
    },
  };

  try {
    Plotly.react(controls.chartDensity, [trace], layout, PLOT_CONFIG).catch((error) =>
      console.error("Failed to render density chart", error),
    );
  } catch (error) {
    console.error("Failed to render density chart", error);
  }
}

function valuesForFallStatus(chartData, status) {
  return chartData.fall
    .map((fallStatus, index) => (fallStatus === status ? chartData.mass[index] : null))
    .filter((mass) => Number.isFinite(mass) && mass > 0);
}

function renderViolinChart(chartData) {
  const traces = ["Fell", "Found"].map((status) => {
    const color = markerColor(status);

    return {
      type: "violin",
      name: status,
      y: valuesForFallStatus(chartData, status),
      box: {
        visible: true,
      },
      meanline: {
        visible: true,
      },
      points: false,
      spanmode: "hard",
      fillcolor: status === "Fell" ? "rgba(255, 110, 0, 0.42)" : "rgba(0, 229, 255, 0.36)",
      line: {
        color,
        width: 2,
      },
      marker: {
        color,
        opacity: 0.35,
      },
      hovertemplate: `${status}<br>Mass: %{y:,.0f} g<extra></extra>`,
    };
  });

  const layout = {
    ...PLOT_THEME,
    autosize: true,
    title: {
      text: "Mass Distribution Comparison (Fell vs. Found)",
      font: { color: "#F8FAFC", size: 17 },
      x: 0.03,
      xanchor: "left",
    },
    margin: { t: 58, r: 28, b: 62, l: 76 },
    showlegend: false,
    violinmode: "group",
    xaxis: {
      title: "Fall Status",
      gridcolor: THEME.border,
      zerolinecolor: THEME.border,
      color: THEME.text,
    },
    yaxis: {
      title: "Mass (g, log scale)",
      type: "log",
      range: [-1, 8],
      gridcolor: THEME.border,
      zerolinecolor: THEME.border,
      color: THEME.text,
    },
  };

  try {
    Plotly.react(controls.chartViolin, traces, layout, PLOT_CONFIG).catch((error) =>
      console.error("Failed to render violin chart", error),
    );
  } catch (error) {
    console.error("Failed to render violin chart", error);
  }
}

function renderExplorerCharts(records) {
  const chartData = prepareExplorerData(records);

  renderDensityChart(chartData);
  renderViolinChart(chartData);
}

function resizeActivePlots() {
  const resizePlots = () => {
    [controls.map, controls.chartDensity, controls.chartViolin].forEach((plot) => {
      if (!plot) {
        return;
      }

      plot.style.width = "100%";
      plot.style.height = "100%";
      Plotly.Plots.resize(plot);
    });
  };

  requestAnimationFrame(() => {
    resizePlots();
    window.setTimeout(resizePlots, 120);
  });
}

function showView(viewName) {
  const showMap = viewName === "map";

  controls.viewMap.hidden = !showMap;
  controls.viewExplorer.hidden = showMap;
  controls.tabMap.classList.toggle("active", showMap);
  controls.tabExplorer.classList.toggle("active", !showMap);
  controls.tabMap.setAttribute("aria-selected", String(showMap));
  controls.tabExplorer.setAttribute("aria-selected", String(!showMap));

  resizeActivePlots();
}

async function fetchData() {
  updateFilterLabels();

  const params = new URLSearchParams({
    min_year: controls.minYear.value,
    max_year: controls.maxYear.value,
    min_mass: controls.minMass.value,
    max_mass: controls.maxMass.value,
    show_fell: controls.showFell.checked,
    show_found: controls.showFound.checked,
  });

  if (activeRequest) {
    activeRequest.abort();
  }

  activeRequest = new AbortController();

  try {
    const response = await fetch(`/api/meteorites?${params.toString()}`, {
      signal: activeRequest.signal,
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const records = await response.json();
    controls.dataCount.textContent = numberFormatter.format(records.length);

    renderMap(records);
    renderExplorerCharts(records);
  } catch (error) {
    if (error.name !== "AbortError") {
      console.error(error);
      controls.dataCount.textContent = "0";
      renderMap([]);
      renderExplorerCharts([]);
    }
  }
}

[
  controls.showFell,
  controls.showFound,
  controls.minYear,
  controls.maxYear,
  controls.minMass,
  controls.maxMass,
].forEach((control) => {
  control.addEventListener("input", fetchData);
  control.addEventListener("change", fetchData);
});

window.addEventListener("resize", () => {
  resizeActivePlots();
});

controls.tabMap.addEventListener("click", () => showView("map"));
controls.tabExplorer.addEventListener("click", () => showView("explorer"));

fetchData();
