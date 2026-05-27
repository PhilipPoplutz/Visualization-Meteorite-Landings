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
};

const numberFormatter = new Intl.NumberFormat("en-US");
let activeRequest = null;

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

function markerSize(mass) {
  const numericMass = Number(mass);
  const safeMass = Number.isFinite(numericMass) && numericMass > 0 ? numericMass : 1;
  return Math.max(5, Math.min(30, 4 + Math.log10(safeMass + 1) * 3.4));
}

function buildTrace(records, status, color) {
  const statusRecords = records.filter((record) => record.fall === status);

  return {
    type: "scattergeo",
    mode: "markers",
    name: status,
    lat: statusRecords.map((record) => record.reclat),
    lon: statusRecords.map((record) => record.reclong),
    text: statusRecords.map((record) => {
      const mass = record["mass (g)"] == null ? "Unknown" : `${numberFormatter.format(record["mass (g)"])} g`;
      return `${record.name}<br>Class: ${record.recclass || "Unknown"}<br>Year: ${record.year}<br>Mass: ${mass}`;
    }),
    hovertemplate: "%{text}<extra></extra>",
    marker: {
      color,
      size: statusRecords.map((record) => markerSize(record["mass (g)"])),
      opacity: 0.82,
      line: {
        color: "rgba(255,255,255,0.28)",
        width: 0.5,
      },
    },
  };
}

function renderMap(records) {
  const traces = [
    buildTrace(records, "Fell", THEME.fell),
    buildTrace(records, "Found", THEME.found),
  ].filter((trace) => trace.lat.length > 0);

  const layout = {
    paper_bgcolor: THEME.background,
    plot_bgcolor: THEME.background,
    margin: { t: 12, r: 18, b: 12, l: 18 },
    showlegend: true,
    legend: {
      x: 0.985,
      y: 0.03,
      xanchor: "right",
      yanchor: "bottom",
      bgcolor: "rgba(22, 22, 31, 0.88)",
      bordercolor: THEME.border,
      borderwidth: 1,
      font: { color: "#F8FAFC", size: 12 },
    },
    geo: {
      projection: { type: "robinson" },
      bgcolor: THEME.background,
      showframe: false,
      showland: true,
      landcolor: "#111827",
      showocean: true,
      oceancolor: "#1F2A37",
      showcountries: true,
      countrycolor: "#334155",
      countrywidth: 0.5,
      showcoastlines: true,
      coastlinecolor: "#475569",
      coastlinewidth: 0.6,
      lataxis: { showgrid: true, gridcolor: "rgba(148, 163, 184, 0.08)" },
      lonaxis: { showgrid: true, gridcolor: "rgba(148, 163, 184, 0.08)" },
    },
  };

  const config = {
    displayModeBar: false,
    responsive: true,
  };

  Plotly.react(controls.map, traces, layout, config);
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
  } catch (error) {
    if (error.name !== "AbortError") {
      console.error(error);
      controls.dataCount.textContent = "0";
      renderMap([]);
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
  Plotly.Plots.resize(controls.map);
});

fetchData();
