import pandas as pd
import numpy as np
import json
import os

def clean_meteorite_data():
    print("Starte detaillierte Bereinigung...")
    
    # --- KUGELSICHERE PFADE ---
    # Holt den absoluten Pfad des Ordners, in dem DIESES Skript liegt ('scripts')
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Baut die Pfade relativ zum Skript-Ordner zusammen
    raw_path = os.path.join(script_dir, '../data/raw/Meteorite_Landings.csv')
    processed_dir = os.path.join(script_dir, '../data/processed')
    processed_path = os.path.join(processed_dir, 'meteorites_cleaned.json')

    # 1. Daten laden
    df = pd.read_csv(raw_path)
    initial_count = len(df)

    # --- FILTER 1: Fehlende Koordinaten (NaN) ---
    mask_missing_coords = df['reclat'].isna() | df['reclong'].isna()
    dropped_missing_coords = mask_missing_coords.sum()
    df = df[~mask_missing_coords]

    # --- FILTER 2: Fehlendes Jahr (NaN) ---
    mask_missing_year = df['year'].isna()
    dropped_missing_year = mask_missing_year.sum()
    df = df[~mask_missing_year]

    # --- FILTER 3: Ungültige Koordinaten (0.0 / 0.0) ---
    mask_zero_coords = (df['reclat'] == 0.0) & (df['reclong'] == 0.0)
    dropped_zero_coords = mask_zero_coords.sum()
    df = df[~mask_zero_coords]

    # --- FILTER 4: Ungültige/Zukünftige Jahre ---
    df['year'] = pd.to_numeric(df['year'], errors='coerce')
    
    mask_bad_year_format = df['year'].isna()
    dropped_missing_year += mask_bad_year_format.sum() 
    df = df[~mask_bad_year_format]

    df['year'] = df['year'].astype(int)
    mask_future_year = df['year'] > 2013
    dropped_future_year = mask_future_year.sum()
    df = df[~mask_future_year]

    # --- "RETTUNGSAKTION": Fehlende Masse (NaN) behandeln ---
    missing_mass_count = df['mass (g)'].isna().sum()
    df['mass (g)'] = df['mass (g)'].astype(object).where(pd.notnull(df['mass (g)']), None)

    final_count = len(df)
    
    # --- AUSGABE FÜRS TERMINAL ---
    print(f"\n--- DETAILLIERTER BEREINIGUNGS-REPORT ---")
    print(f"Ursprüngliche Datensätze: {initial_count}")
    print(f"Entfernt wegen fehlender Koordinaten (NaN): {dropped_missing_coords}")
    print(f"Entfernt wegen fehlendem/ungültigem Jahr: {dropped_missing_year}")
    print(f"Entfernt wegen ungültiger Koordinaten (0.0/0.0): {dropped_zero_coords}")
    print(f"Entfernt wegen Jahr in der Zukunft (>2013): {dropped_future_year}")
    print(f"--------------------------------------------------")
    print(f"Gesamt entfernt: {initial_count - final_count}")
    print(f"Verbleibende saubere Datensätze: {final_count}")
    print(f"-> Davon 'gerettete' Datensätze ohne Masse: {missing_mass_count} (Wurden auf 'null' gesetzt)")

    # --- SPEICHERN ALS JSON ---
    cleaned_data = df.to_dict(orient='records')
    
    # Nutzt jetzt auch den dynamischen Pfad
    os.makedirs(processed_dir, exist_ok=True)
    with open(processed_path, 'w') as f:
        json.dump(cleaned_data, f, indent=4)
        
    print(f"\nJSON Datei erfolgreich in {processed_dir} erstellt.")

if __name__ == "__main__":
    clean_meteorite_data()