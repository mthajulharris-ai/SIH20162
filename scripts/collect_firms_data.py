"""
Automated NASA FIRMS Satellite Data Collection and AI Inference Update Command.

Phase 2E - Scheduler-Ready Satellite Ingestion & Classification Service.

Usage:
    # 1. Collect real VIIRS data for India and update pipeline:
    python scripts/collect_firms_data.py --country IND --days 1 --source VIIRS_SNPP_NRT

    # 2. Collect for an Indian Industrial Cluster preset:
    python scripts/collect_firms_data.py --preset JHARKHAND_STEEL_BELT --days 1

    # 3. Dry-run / Fallback mode using sample dataset:
    python scripts/collect_firms_data.py --fallback-sample

    # 4. Check collector status & archive catalog:
    python scripts/collect_firms_data.py --status
"""

import argparse
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# Ensure project root is in sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from src.config import (
    RAW_DATA_DIR,
    PROCESSED_DATA_DIR,
    SAMPLES_DATA_DIR,
    SUPPORTED_SOURCES,
    PROVENANCE_REAL_FIRMS,
    PROVENANCE_SAMPLE
)
from src.data_pipeline.collector import (
    FirmsDataCollector,
    FirmsAPIError,
    INDUSTRIAL_REGION_BOUNDS
)
from src.pipeline_runner import SatelliteMLPipeline, PipelineExecutionError


def setup_logging(verbose: bool = False):
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )


def print_status(collector: FirmsDataCollector):
    has_key = collector.is_api_key_configured()
    print("=" * 68)
    print("      SIH PS 26162: NASA FIRMS SATELLITE UPDATE SERVICE STATUS")
    print("=" * 68)
    print(f"NASA FIRMS API Key: {'[CONFIGURED]' if has_key else '[NOT CONFIGURED]'}")
    if not has_key:
        print("\n  -> To configure NASA FIRMS credentials:")
        print("     1. Request a free API MAP_KEY: https://firms.modaps.eosdis.nasa.gov/api/map_key/")
        print("     2. Set environment variable: export NASA_FIRMS_MAP_KEY='your_key'")
        print("        or add to your .env file: NASA_FIRMS_MAP_KEY=your_key")
        print("        or pass directly: python scripts/collect_firms_data.py --key your_key")

    print("\nSupported Sensors:")
    for code, desc in SUPPORTED_SOURCES.items():
        print(f"  - {code:<18} : {desc}")

    print("\nPre-configured Industrial Regions (India):")
    for name, bbox in INDUSTRIAL_REGION_BOUNDS.items():
        print(f"  - {name:<26} : [{bbox}]")

    raw_files = collector.list_existing_raw_files()
    print(f"\nRaw Satellite Archives in {RAW_DATA_DIR.name}/: {len(raw_files)} files")
    for rf in raw_files[-5:]:
        print(f"  - {rf.name} ({rf.stat().st_size / 1024:.1f} KB)")
    if len(raw_files) > 5:
        print(f"  ... and {len(raw_files) - 5} older archives")

    processed_files = list(PROCESSED_DATA_DIR.glob("*.csv")) if PROCESSED_DATA_DIR.exists() else []
    print(f"\nProcessed Hotspot Catalogs in {PROCESSED_DATA_DIR.name}/: {len(processed_files)} files")
    for pf in processed_files[-5:]:
        print(f"  - {pf.name}")
    print("=" * 68)


def main():
    parser = argparse.ArgumentParser(
        description="NASA FIRMS Live Satellite Collection & AI Inference Update (PS 26162)"
    )
    parser.add_argument(
        "--country", "-c",
        type=str,
        default=None,
        help="Country ISO alpha-3 code (e.g. 'IND' for India)."
    )
    parser.add_argument(
        "--preset", "-p",
        type=str,
        choices=list(INDUSTRIAL_REGION_BOUNDS.keys()),
        default=None,
        help="Predefined Indian industrial belt."
    )
    parser.add_argument(
        "--bbox", "-b",
        type=str,
        default=None,
        help="Custom bounding box: min_lon,min_lat,max_lon,max_lat."
    )
    parser.add_argument(
        "--days", "-d",
        type=int,
        default=1,
        help="Number of days to retrieve (1 to 10, default: 1)."
    )
    parser.add_argument(
        "--source", "-s",
        type=str,
        default="VIIRS_SNPP_NRT",
        choices=list(SUPPORTED_SOURCES.keys()),
        help="Satellite sensor product (default: VIIRS_SNPP_NRT)."
    )
    parser.add_argument(
        "--date",
        type=str,
        default=None,
        help="Specific acquisition date in YYYY-MM-DD format (defaults to latest)."
    )
    parser.add_argument(
        "--key", "-k",
        type=str,
        default=None,
        help="NASA FIRMS Map Key (defaults to NASA_FIRMS_MAP_KEY environment variable)."
    )
    parser.add_argument(
        "--output", "-o",
        type=str,
        default="firms_live_classified.csv",
        help="Filename for the classified output catalog in data/processed/."
    )
    parser.add_argument(
        "--fallback-sample",
        action="store_true",
        help="If no API key is present or fetch fails, fall back to sample dataset for dry-run testing."
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Display NASA FIRMS API key status, presets, and stored datasets."
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable detailed debug logging."
    )

    args = parser.parse_args()
    setup_logging(args.verbose)

    collector = FirmsDataCollector(map_key=args.key)

    if args.status:
        print_status(collector)
        return

    # Default to India if neither country nor preset nor bbox specified
    country = args.country
    preset = args.preset
    bbox = args.bbox
    if not country and not preset and not bbox and not args.fallback_sample:
        country = "IND"

    print("=" * 68)
    print("   SIH PS 26162: NASA FIRMS LIVE SATELLITE UPDATE WORKFLOW")
    print("=" * 68)

    start_time = time.time()
    df_raw = None
    raw_saved_path = None
    provenance = PROVENANCE_REAL_FIRMS

    # 1. Fetch data
    if args.fallback_sample and not collector.is_api_key_configured():
        sample_file = SAMPLES_DATA_DIR / "sample_firms_data.csv"
        print(f"[INFO] Running in FALLBACK DEMO mode using: {sample_file.name}")
        from src.data_pipeline.loader import load_csv
        df_raw = load_csv(sample_file)
        provenance = PROVENANCE_SAMPLE
        raw_saved_path = sample_file
    else:
        try:
            if preset:
                print(f"[FETCH] Querying NASA FIRMS for Industrial Belt: {preset} (Sensor: {args.source}, Days: {args.days})...")
                df_raw, raw_saved_path = collector.fetch_area_data(
                    bbox=preset,
                    source=args.source,
                    day_range=args.days,
                    date_str=args.date,
                    save_to_raw=True
                )
            elif bbox:
                print(f"[FETCH] Querying NASA FIRMS for Bounding Box: {bbox} (Sensor: {args.source}, Days: {args.days})...")
                df_raw, raw_saved_path = collector.fetch_area_data(
                    bbox=bbox,
                    source=args.source,
                    day_range=args.days,
                    date_str=args.date,
                    save_to_raw=True
                )
            else:
                print(f"[FETCH] Querying NASA FIRMS for Country: {country} (Sensor: {args.source}, Days: {args.days})...")
                df_raw, raw_saved_path = collector.fetch_country_data(
                    country_code=country,
                    source=args.source,
                    day_range=args.days,
                    date_str=args.date,
                    save_to_raw=True
                )

        except FirmsAPIError as err:
            if args.fallback_sample:
                print(f"[WARNING] Live FIRMS query failed: {err}")
                sample_file = SAMPLES_DATA_DIR / "sample_firms_data.csv"
                print(f"[INFO] Falling back to sample dataset: {sample_file.name}")
                from src.data_pipeline.loader import load_csv
                df_raw = load_csv(sample_file)
                provenance = PROVENANCE_SAMPLE
                raw_saved_path = sample_file
            else:
                print(f"\n[NASA FIRMS ERROR] {err}", file=sys.stderr)
                sys.exit(1)

    if df_raw is None or df_raw.empty:
        print("\n[INFO] Zero thermal anomaly hotspots detected for the requested parameters.")
        print(f"Duration: {time.time() - start_time:.2f} seconds.")
        print("=" * 68)
        return

    print(f"[INGEST] Ingested {len(df_raw)} observations. Provenance: {provenance}")
    if raw_saved_path:
        print(f"[RAW ARCHIVE] Untouched raw data persisted at: {raw_saved_path}")

    # 2. Run existing inference pipeline
    print("\n[AI PIPELINE] Executing validation, cleaning, feature engineering, and ML classification...")
    pipeline = SatelliteMLPipeline()
    try:
        df_classified, summary = pipeline.run(
            raw_dataframe=df_raw,
            output_filename=args.output,
            save_results=True,
            data_provenance=provenance
        )

        duration = time.time() - start_time
        print("\n" + "=" * 68)
        print("        SIH PS 26162: UPDATE EXECUTION SUMMARY")
        print("=" * 68)
        print(f"Status:                      SUCCESS")
        print(f"Data Provenance:             {provenance}")
        print(f"Raw Hotspots Ingested:       {summary.total_raw_records}")
        print(f"Valid Retained Hotspots:     {summary.cleaned_valid_records} ({summary.data_retention_rate_pct:.2f}% retention)")
        print(f"Model Version:               {summary.model_version}")
        print(f"Classified Hotspots:         {summary.classified_records}")
        print(f"  - Industrial Fires:        {summary.industrial_fires_count:>4}  [CRITICAL ALERTS: {summary.critical_alerts_count}]")
        print(f"  - Persistent Heat Sources: {summary.persistent_sources_count:>4}  [MEDIUM]")
        print(f"  - Other Sources:           {summary.other_sources_count:>4}  [LOW]")
        print("-" * 68)
        print(f"Raw Satellite Backup:        {raw_saved_path or 'N/A'}")
        print(f"Classified Catalog Output:   {summary.output_csv_path}")
        print(f"Total Execution Duration:    {duration:.2f} seconds")
        print(f"Timestamp (UTC):             {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
        print("=" * 68)

    except PipelineExecutionError as err:
        print(f"\n[PIPELINE ERROR] Pipeline execution halted: {err}", file=sys.stderr)
        sys.exit(2)
    except Exception as err:
        print(f"\n[UNEXPECTED ERROR] {err}", file=sys.stderr)
        sys.exit(3)


if __name__ == "__main__":
    main()
