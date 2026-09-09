"""
Unit tests for environment setup and dependencies.
"""
import pytest

def test_pandas_installed():
    import pandas as pd
    df = pd.DataFrame({"latitude": [28.6139], "longitude": [77.2090], "frp": [45.2]})
    assert len(df) == 1
    assert "frp" in df.columns

def test_numpy_installed():
    import numpy as np
    arr = np.array([300.5, 310.2, 325.0])
    assert arr.mean() > 300

def test_sklearn_installed():
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.preprocessing import StandardScaler
    clf = RandomForestClassifier(n_estimators=5, random_state=42)
    scaler = StandardScaler()
    assert clf is not None
    assert scaler is not None

def test_joblib_installed():
    import joblib
    assert hasattr(joblib, "dump")
    assert hasattr(joblib, "load")

def test_visualization_libraries_installed():
    import matplotlib
    import seaborn
    assert matplotlib.__name__ == "matplotlib"
    assert seaborn.__name__ == "seaborn"
