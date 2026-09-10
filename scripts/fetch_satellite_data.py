"""
CLI Script to fetch real-world NASA FIRMS satellite thermal anomaly data.

Usage:
    # 1. Fetch live data for India (requires NASA_FIRMS_MAP_KEY):
    python scripts/fetch_satellite_data.py --country IND --days 1 --source VIIRS_SNPP_NRT

    # 2. Fetch live data for a major Indian industrial cluster:
    python scripts/fetch_satellite_data.py --preset JHARKHAND_STEEL_BELT --days 1

    # 3. Check configuration and list existing raw archives:
    python scripts/fetch_satellite_data.py --status
"""

import argparse
import logging
import sys
from pathlib import Path

# Add project root to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from src.data_pipeline.collector import (
    FirmsDataCollector,
    FirmsAPIError,
    INDUSTRIAL_REGION_BOUNDS
)
from src.config import RAW_DATA_DIR, SAMPLES_DATA_DIR


def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )


def main():
    parser = argparse.ArgumentParser(
        description="Fetch Real-Time NASA FIRMS Satellite Thermal Observations (PS 26162)"
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
        help="Preset industrial cluster region in India (e.g. JHARKHAND_STEEL_BELT, CHHATTISGARH_METALLURGY)."
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
        help="Satellite product ('VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'MODIS_NRT')."
    )
    parser.add_argument(
        "--key", "-k",
        type=str,
        default=None,
        help="NASA FIRMS Map Key (optional, defaults to NASA_FIRMS_MAP_KEY env variable)."
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Check collector status and list downloaded files in data/raw/."
    )

    args = parser.parse_args()
    setup_logging()

    print("=" * 68)
    print("   SIH PS 26162: NASA FIRMS SATELLITE DATA COLLECTOR")
    print("=" * 68)

    collector = FirmsDataCollector(map_key=args.key)
    has_key = collector.is_api_key_configured()

    if args.status or (not args.country and not args.preset):
        print(f"NASA FIRMS API Key Configured: {'[YES]' if has_key else '[NO]'}")
        if not has_key:
            print("  -> To obtain a free NASA FIRMS MAP_KEY:")
            print("     1. Visit https://firms.modaps.eosdis.nasa.gov/api/map_key/")
            print("     2. Enter your email to receive an instant free API Map Key")
            print("     3. Export it: set NASA_FIRMS_MAP_KEY='your_key' or add to .env")

        raw_files = collector.list_existing_raw_files()
        print(f"\nRaw Satellite Archives in data/raw/ ({len(raw_files)} files):")
        if raw_files:
            for f in raw_files:
                print(f"  - {f.name} ({f.stat().st_size / 1024:.1f} KB)")
        else:
            print("  - (No raw downloaded files present in data/raw/)")

        sample_files = list(SAMPLES_DATA_DIR.glob("*.csv"))
        print(f"\nDevelopment Samples in data/samples/ ({len(sample_files)} files):")
        for sf in sample_files:
            print(f"  - {sf.name} [DEMO DATA ONLY]")
        print("=" * 68)
        return

    # Execute fetch
    try:
        if args.preset:
            print(f"[INFO] Fetching satellite observations for industrial preset: {args.preset}...")
            df, saved_path = collector.fetch_area_data(
                bbox=args.preset,
                source=args.source,
                day_range=args.days,
                save_to_raw=True
            )
        else:
            print(f"[INFO] Fetching satellite observations for country: {args.country}...")
            df, saved_path = collector.fetch_country_data(
                country_code=args.country,
                source=args.source,
                day_range=args.days,
                save_to_raw=True
            )

        print(f"\n[SUCCESS] Retrieved {len(df)} real satellite thermal observations.")
        if saved_path:
            print(f"Stored raw, unaltered CSV to: {saved_path}")
        print("=" * 68)

    except FirmsAPIError as err:
        print(f"\n[NASA FIRMS ERROR] {err}", file=sys.stderr)
        sys.exit(1)
    except Exception as err:
        print(f"\n[UNEXPECTED ERROR] {err}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
