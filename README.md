# NASA Meteorite Landings Visualization

Interactive Information Visualization prototype for exploring NASA meteorite landing records. The app combines a FastAPI backend with a vanilla HTML/CSS/JavaScript frontend and Plotly visualizations.

The prototype has two main views:

- **Map**: spatial exploration of meteorite records with clustered markers, mass-based marker size, and map-only Fell/Found toggles.
- **Data Explorer**: analytical charts for mass distribution, temporal development, meteorite classes, approximate focus regions, mass-time-frequency patterns, and Fell vs. Found comparison.

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/PhilipPoplutz/Visualization-Meteorite-Landings.git
cd Visualization-Meteorite-Landings
```

### 2. Create a virtual environment

Windows PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
```

macOS/Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install dependencies

```bash
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

### 4. Start the app

```bash
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 5. Open the prototype

Open this URL in a browser:

```text
http://127.0.0.1:8000/
```

To verify that the backend loaded the data, open:

```text
http://127.0.0.1:8000/api/health
```

Expected response:

```json
{"status":"ok","records_loaded":32037}
```

## Requirements

- Python 3.10 or newer recommended.
- Internet access is recommended because Plotly is loaded in the browser from a CDN.
- No Node.js build step is required.

Python dependencies are listed in `requirements.txt`:

- `fastapi`
- `uvicorn`
- `pandas`
- `numpy`

## Project Structure

```text
app/main.py                              FastAPI app and filtering API
app/static/index.html                    Frontend HTML
app/static/style.css                     Layout and visual styling
app/static/app.js                        Filter state, API calls, Plotly rendering
scripts/01_data_cleaning.py              Raw-to-cleaned data preparation
data/raw/Meteorite_Landings.csv          Original NASA dataset
data/processed/meteorites_cleaned.json   Cleaned dataset used by the app
requirements.txt                         Python dependencies
README.md                                Setup and usage guide
```

## How to Use the Prototype

1. Start the server and open `http://127.0.0.1:8000/`.
2. The **Map** tab opens first and shows meteorite records on a dark world map.
3. Use **Year Range** and **Mass Range** in the left sidebar to prepare shared filters.
4. Click **Apply filters** to update both the Map and the Data Explorer.
5. Use **Reset filters** to restore the full cleaned dataset range.
6. Use **Fall Status** inside the Map view to toggle Fell and Found records immediately.
7. Switch to **Data Explorer** to inspect KPI cards and charts.

The shared Year and Mass filters use an Apply workflow so that the charts do not redraw while sliders are still being changed. Fall Status is map-specific and updates immediately because it only changes the map layer.

## Main Features

- Shared Year Range and Mass Range filters for Map and Data Explorer.
- Map-only Fall Status toggles for Fell and Found records.
- Clustered map markers for readability.
- Marker color distinguishes Fell and Found records.
- Marker size represents mass.
- KPI cards for total records, Fell records, Found records, median mass, maximum mass, and year range.
- Mass distribution histogram with logarithmic mass scale.
- Temporal development chart aggregated by decade.
- Top meteorite classes chart with a short class glossary.
- Approximate focus regions by fall status.
- Mass, time and frequency bubble chart.
- Fell vs. Found mass comparison.
- Empty states for filter combinations with no matching records.

## Regenerate the Cleaned Dataset

The app reads:

```text
data/processed/meteorites_cleaned.json
```

If the raw CSV is replaced or updated, regenerate the cleaned JSON from the repository root:

```bash
python scripts/01_data_cleaning.py
```

The cleaning script reads:

```text
data/raw/Meteorite_Landings.csv
```

and writes:

```text
data/processed/meteorites_cleaned.json
```

## Troubleshooting

### Port 8000 is already in use

Start the server on another port:

```bash
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

Then open:

```text
http://127.0.0.1:8001/
```

### PowerShell blocks virtual environment activation

For the current PowerShell session, run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

### The map or charts do not appear

- Check that the server is running without errors.
- Open `http://127.0.0.1:8000/api/health` and confirm that records are loaded.
- Check the browser console for JavaScript errors.
- Make sure the browser can load Plotly from the CDN.

### The app opens but shows no records

Confirm that this file exists:

```text
data/processed/meteorites_cleaned.json
```

If it is missing, regenerate it:

```bash
python scripts/01_data_cleaning.py
```

## Quick Manual Check

After setup, a reviewer can quickly verify the prototype with this flow:

1. Open the Map tab and confirm markers or clusters are visible.
2. Toggle Fell and Found in the Map view and confirm the map updates immediately.
3. Change Year Range or Mass Range, then click **Apply filters**.
4. Switch to Data Explorer and confirm KPI cards and charts are visible.
5. Switch back to Map and confirm the map still fills the available space.
6. Click **Reset filters**, then **Apply filters**, and confirm the full dataset returns.

## Known Limitations

- The prototype uses the cleaned NASA dataset snapshot included in this repository.
- The dataset ends in 2013.
- Focus regions are approximate coordinate-based regions, not exact biome, country, desert, or ice-region classifications.
- No population-density overlay is included.
- The prototype supports visual exploration; it does not prove statistical correlations.
