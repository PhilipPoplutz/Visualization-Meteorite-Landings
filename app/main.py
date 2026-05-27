from contextlib import asynccontextmanager
import json
from pathlib import Path

import pandas as pd
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles


BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "app" / "static"
DATA_PATH = BASE_DIR / "data" / "processed" / "meteorites_cleaned.json"

DATA_COLUMNS = [
    "name",
    "id",
    "nametype",
    "recclass",
    "mass (g)",
    "fall",
    "year",
    "reclat",
    "reclong",
    "GeoLocation",
]

meteorites_df = pd.DataFrame(columns=DATA_COLUMNS)


def load_meteorites() -> pd.DataFrame:
    """Load and normalize the cleaned meteorite dataset."""
    if not DATA_PATH.exists():
        # Expected JSON structure:
        # [
        #   {
        #     "name": "Aachen",
        #     "id": 1,
        #     "nametype": "Valid",
        #     "recclass": "L5",
        #     "mass (g)": 21,
        #     "fall": "Fell",
        #     "year": 1880,
        #     "reclat": 50.775,
        #     "reclong": 6.08333,
        #     "GeoLocation": "(50.775, 6.08333)"
        #   }
        # ]
        return pd.DataFrame(columns=DATA_COLUMNS)

    df = pd.read_json(DATA_PATH)

    for column in DATA_COLUMNS:
        if column not in df.columns:
            df[column] = None

    df["year"] = pd.to_numeric(df["year"], errors="coerce")
    df["mass (g)"] = pd.to_numeric(df["mass (g)"], errors="coerce")
    df["reclat"] = pd.to_numeric(df["reclat"], errors="coerce")
    df["reclong"] = pd.to_numeric(df["reclong"], errors="coerce")
    df["fall"] = df["fall"].fillna("").astype(str)

    return df


@asynccontextmanager
async def lifespan(app: FastAPI):
    global meteorites_df
    meteorites_df = load_meteorites()
    yield


app = FastAPI(
    title="Meteorite Explorer Dashboard API",
    description="Server-side filtering API for NASA meteorite landing records.",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/api/meteorites")
def get_meteorites(
    min_year: int = 860,
    max_year: int = 2013,
    min_mass: float = 0,
    max_mass: float = 60000000,
    show_fell: bool = True,
    show_found: bool = True,
):
    filtered = meteorites_df.copy()

    if filtered.empty:
        return []

    mass_for_filtering = filtered["mass (g)"].fillna(0)

    filtered = filtered[
        filtered["year"].between(min_year, max_year, inclusive="both")
        & mass_for_filtering.between(min_mass, max_mass, inclusive="both")
        & filtered["reclat"].notna()
        & filtered["reclong"].notna()
    ]

    fall_statuses = []
    if show_fell:
        fall_statuses.append("Fell")
    if show_found:
        fall_statuses.append("Found")

    if fall_statuses:
        filtered = filtered[filtered["fall"].isin(fall_statuses)]
    else:
        filtered = filtered.iloc[0:0]

    return json.loads(filtered.to_json(orient="records"))


@app.get("/api/health")
def health_check():
    return {"status": "ok", "records_loaded": int(len(meteorites_df))}


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
