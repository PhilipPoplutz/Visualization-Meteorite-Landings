# NASA Meteorite Landings Visualization

Interactive Information Visualization prototype for exploring the NASA Meteorite Landings dataset. The app combines a desktop-first world map with a Data Explorer for mass, time, fall-status, and class analysis.

## Main Features

- Shared left sidebar with Year Range and Mass Range filters for both Map and Data Explorer.
- Apply-only workflow: sliders, presets, and numeric inputs update pending values first; API requests and Plotly redraws happen only after **Apply filters**.
- Log-transformed mass slider for the strongly skewed mass distribution, while numeric mass inputs still use exact gram values.
- Year and mass presets for common analysis ranges.
- Map-only Fall Status control for Fell and Found records; toggles update the map immediately without Apply.
- Cluster colors follow Fall Status composition: Fell-only clusters are orange, Found-only clusters are cyan, and both-active clusters use the dominant fall status while preserving stable Plotly label positioning during zoom and pan.
- Data Explorer with KPI cards, mass histogram, temporal development by decade, top classes, approximate focus regions, mass-time-frequency bubble chart, and Fell vs. Found mass comparison.
- Approximate focus-region analysis for Antarctica and selected desert-related coordinate boxes inside the Data Explorer.
- Multidimensional bubble chart combining decade, median mass, fall status, and record count.
- Accessible meteorite class glossary for common class codes such as L6 and H5.
- Fell vs. Found comparison uses a violin plot with embedded box summaries.
- Plotly resize handling after tab switches to keep the map and charts correctly sized.
- Empty chart states for filters that return no records.

## Install Dependencies

Create and activate a virtual environment if needed, then install the Python dependencies:

```bash
pip install -r requirements.txt
```

## Run the Backend

Start the FastAPI server from the repository root:

```bash
uvicorn app.main:app --reload
```

If you use the existing project virtual environment on Windows:

```bash
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

## Open the Prototype

Open the local app in a browser:

```text
http://127.0.0.1:8000
```

The frontend is served by FastAPI from `app/static/`.

## Filter Workflow

1. Use the shared left sidebar to adjust Year Range and Mass Range.
2. Use numeric inputs for exact values, or presets for common year/mass ranges.
3. Click **Apply filters** to request filtered year/mass records from the FastAPI backend.
4. Shared Year and Mass filters update both the Map and the Data Explorer.
5. The Map tab also has a Fall Status control inside the map. Fell/Found toggles affect only the map and update immediately without Apply.
6. The Data Explorer always keeps both Fell and Found records for comparison unless the shared year/mass filters naturally remove records.
7. Click **Reset filters** to restore the full cleaned dataset range, then click **Apply filters** again.

## Project Structure

```text
app/main.py                              FastAPI app and filtering API
app/static/index.html                    Dashboard structure
app/static/style.css                     Desktop layout and visual styling
app/static/app.js                        Filter state, API calls, Plotly rendering
scripts/01_data_cleaning.py              Raw-to-cleaned data preparation
data/raw/Meteorite_Landings.csv          Original NASA dataset
data/processed/meteorites_cleaned.json   Cleaned dataset used by the app
```

## Regenerate the Cleaned Dataset

If `data/raw/Meteorite_Landings.csv` is updated or replaced, regenerate the cleaned JSON:

```bash
python scripts/01_data_cleaning.py
```

The script writes:

```text
data/processed/meteorites_cleaned.json
```

## Known Limitations

- No population-density overlay is included yet.
- No exact country, biome, desert, or Antarctica/ice-region dataset is included.
- Data Explorer focus regions are approximate latitude/longitude boxes for exploration only.
- The cleaned NASA dataset snapshot ends in 2013.
- The prototype supports visual exploration; it does not prove statistical correlations.

## Manual Test Steps

1. Start the app with `uvicorn app.main:app --reload`.
2. Open `http://127.0.0.1:8000`.
3. Confirm the Map tab loads with markers/clusters.
4. Switch Map -> Data Explorer -> Map several times; the map must not become cropped or stuck in the top-left.
5. Move sliders, type numeric values, and click presets; confirm no API update happens until **Apply filters** is clicked.
6. Confirm numeric year/mass values and sliders stay synchronized.
7. Click **Apply filters** and confirm map, record count, KPI cards, and charts update.
8. Toggle Fell/Found in the Map tab and confirm only the map dataset changes immediately, without **Apply filters**.
9. Confirm Fell-only clusters are orange, Found-only clusters are cyan, and mixed-mode clusters use the dominant fall-status color.
10. Open the Data Explorer and confirm it still compares Fell and Found.
11. Confirm Advanced analysis is visible without expanding a collapsible section.
12. Confirm the temporal development chart uses decade aggregation and updates after shared filters are applied.
13. Confirm the focus regions chart renders approximate regions and updates after shared filters are applied.
14. Confirm the mass, time and frequency bubble chart renders in Advanced analysis and updates after shared filters are applied.
15. Confirm chart tooltips stay inside chart cards.
16. Click **Reset filters**, then **Apply filters**, and confirm the full dataset range returns.
17. Use a filter combination that returns no records and confirm empty states render without errors.
18. Check the browser console for errors.
