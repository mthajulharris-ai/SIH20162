"""
Environment and Dependency Verification Script for SIH 20162.
Run this script to verify that all required data science and ML packages are installed correctly.
"""
import sys

def verify():
    packages = [
        ("pandas", "Pandas (Data manipulation & tabular datasets)"),
        ("numpy", "NumPy (Array computing & linear algebra)"),
        ("sklearn", "Scikit-Learn (Machine learning classification & pipelines)"),
        ("joblib", "Joblib (Model serialization & saving)"),
        ("matplotlib", "Matplotlib (Evaluation plotting)"),
        ("seaborn", "Seaborn (Confusion matrix & statistical visualization)"),
        ("requests", "Requests (NASA FIRMS API integration)"),
        ("scipy", "SciPy (Spatial distance & clustering computations)"),
        ("geopy", "GeoPy (Geographic coordinate calculations)"),
    ]

    print("=" * 65)
    print("  SIH 20162: SATELLITE DATA & ML ENVIRONMENT VERIFICATION")
    print("=" * 65)
    print(f"Python Version: {sys.version.split()[0]} ({sys.executable})\n")

    all_passed = True

    for mod_name, description in packages:
        try:
            mod = __import__(mod_name)
            ver = getattr(mod, "__version__", "installed")
            print(f"  [OK] {description}")
            print(f"       Package: {mod_name} (v{ver})\n")
        except ImportError as e:
            print(f"  [FAIL] {description}")
            print(f"         Error: {e}\n")
            all_passed = False

    print("=" * 65)
    if all_passed:
        print("  STATUS: ALL REQUIRED ML & DATA PACKAGES ARE OPERATIONAL!")
    else:
        print("  STATUS: SOME PACKAGES ARE MISSING. Run: pip install -r requirements.txt")
    print("=" * 65)

    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(verify())
