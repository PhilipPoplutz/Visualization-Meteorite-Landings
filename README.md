# NASA Meteorite Landings Visualization

## Project Overview

Meteorite Explorer Dashboard is an interactive web dashboard for exploring more than 32,000 historical meteorite landings and finds. It lets users filter events by year, mass, and fall status, then renders the filtered results on a dark Robinson-projection world map.

## Architecture

The project uses a small client-server architecture:

- **Backend:** FastAPI loads the cleaned NASA meteorite dataset with Pandas and owns all filtering logic.
- **Frontend:** Vanilla HTML, CSS, and JavaScript render the dashboard and call the API with `fetch()`.
- **Visualization:** Plotly.js is loaded via CDN and renders the `scattergeo` meteorite map in the browser.

## Setup & Run

```bash
pip install fastapi uvicorn pandas
uvicorn app.main:app --reload
```

Then open:

```text
http://127.0.0.1:8000
```

## Project Structure

```text
/
|-- app/
|   |-- main.py
|   `-- static/
|       |-- index.html
|       |-- style.css
|       `-- app.js
|-- data/
|   `-- processed/
|-- README.md
`-- agent.md
```
