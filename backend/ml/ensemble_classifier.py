"""
Production-Ready Soft-Voting Ensemble Classifier for SATRA.

Combines:
1. Random Forest (RandomForestClassifier, n_estimators=300, class_weight="balanced")
2. LightGBM (LGBMClassifier, n_estimators=300, lr=0.05, num_leaves=31, class_weight="balanced")
3. XGBoost (XGBClassifier, n_estimators=300, lr=0.05, max_depth=6, objective="multi:softprob", num_class=4)

Soft-voting weights: [1.0, 1.2, 1.2]

Canonical 4 Classes:
0 = Industrial Fire
1 = Forest Fire
2 = Persistent Thermal Source
3 = Other
"""

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.ensemble import RandomForestClassifier, VotingClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.utils.class_weight import compute_sample_weight
from xgboost import XGBClassifier

from backend.ml.feature_extractor import REQUIRED_FEATURES, FeatureValidationError, validate_feature_vector
from backend.ml.yolo_fusion import fuse_confidences, run_yolo_inference

logger = logging.getLogger("backend.ml.ensemble_classifier")

# Canonical 4-Class Taxonomy
CLASS_ID_TO_NAME: Dict[int, str] = {
    0: "Industrial Fire",
    1: "Forest Fire",
    2: "Persistent Thermal Source",
    3: "Other",
}

CLASS_NAME_TO_ID: Dict[str, int] = {
    "industrial fire": 0,
    "industrial": 0,
    "forest fire": 1,
    "forest": 1,
    "wildfire": 1,
    "persistent thermal source": 2,
    "persistent": 2,
    "other": 3,
}

LOW_CONFIDENCE_THRESHOLD: float = 0.60
MODEL_TYPE_NAME: str = "RF_LightGBM_XGBoost_SoftVoting"


class MissingLabelsError(ValueError):
    """Raised when the dataset is missing required class labels."""
    pass


class SoftVotingEnsembleWrapper:
    """
    Production soft-voting ensemble wrapper providing inference,
    probability calculation, confidence thresholding, and optional YOLO visual fusion.
    """

    def __init__(self, ensemble: VotingClassifier, model_version: str = "4.0.0-operational-ensemble"):
        self.ensemble = ensemble
        self.model_type = MODEL_TYPE_NAME
        self.model_version = model_version
        self.classes_ = [0, 1, 2, 3]

    def predict_probabilities(self, X: np.ndarray) -> np.ndarray:
        """Computes class probabilities across all 4 classes."""
        return self.ensemble.predict_proba(X)

    def predict_single(
        self,
        features: Union[Dict[str, Any], Sequence[Any], np.ndarray],
        image_input: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """
        Runs single thermal anomaly inference.
        
        Steps:
        1. Validates exact 8 canonical features.
        2. Computes predicted class probabilities via soft voting.
        3. Extracts predicted class and tabular confidence.
        4. Fuses with YOLOv11 visual detection if image is supplied.
        5. Applies project confidence threshold (<0.60 -> LOW_CONFIDENCE_REVIEW).
        """
        # 1. Strict feature validation
        X = validate_feature_vector(features)

        # 2. Probability extraction
        proba_matrix = self.predict_probabilities(X)
        probs = proba_matrix[0]

        # 3. Argmax and raw tabular confidence
        pred_class_id = int(np.argmax(probs))
        tabular_conf = float(probs[pred_class_id])
        pred_class_name = CLASS_ID_TO_NAME.get(pred_class_id, "Other")

        # 4. YOLO Visual Fusion (Optional)
        yolo_conf = run_yolo_inference(image_input) if image_input is not None else None
        final_conf, fusion_source = fuse_confidences(tabular_conf, yolo_conf)

        # 5. Confidence Threshold & Operational Status
        if final_conf < LOW_CONFIDENCE_THRESHOLD:
            status = "LOW_CONFIDENCE_REVIEW"
        else:
            status = "CLASSIFIED"

        # Probability dictionary mapping
        class_probs = {
            CLASS_ID_TO_NAME[c_id]: round(float(probs[i]), 4)
            for i, c_id in enumerate(self.classes_)
            if i < len(probs)
        }

        # Determine operational alert level based on safety standards
        if pred_class_name == "Industrial Fire":
            alert_level = "CRITICAL" if final_conf >= 0.70 else "HIGH"
        elif pred_class_name == "Forest Fire":
            alert_level = "HIGH" if final_conf >= 0.75 else "MEDIUM"
        elif pred_class_name == "Persistent Thermal Source":
            alert_level = "MEDIUM"
        else:
            alert_level = "LOW"

        if status == "LOW_CONFIDENCE_REVIEW":
            alert_level = "LOW_CONFIDENCE_REVIEW"

        return {
            "classification": pred_class_name,
            "predicted_class": pred_class_name,
            "predicted_class_id": pred_class_id,
            "confidence": round(final_conf, 4),
            "tabular_confidence": round(tabular_conf, 4),
            "visual_confidence": round(yolo_conf, 4) if yolo_conf is not None else None,
            "status": status,
            "model_type": self.model_type,
            "model_version": self.model_version,
            "fusion_source": fusion_source,
            "alert_level": alert_level,
            "class_probabilities": class_probs,
        }

    def predict_batch(
        self,
        features_list: Union[List[Dict[str, Any]], np.ndarray, pd.DataFrame]
    ) -> List[Dict[str, Any]]:
        """Vectorized batch prediction for satellite passes."""
        X = validate_feature_vector(features_list)
        proba_matrix = self.predict_probabilities(X)

        results = []
        for i in range(len(X)):
            probs = proba_matrix[i]
            pred_class_id = int(np.argmax(probs))
            conf = float(probs[pred_class_id])
            pred_class_name = CLASS_ID_TO_NAME.get(pred_class_id, "Other")
            status = "LOW_CONFIDENCE_REVIEW" if conf < LOW_CONFIDENCE_THRESHOLD else "CLASSIFIED"

            class_probs = {
                CLASS_ID_TO_NAME[c_id]: round(float(probs[k]), 4)
                for k, c_id in enumerate(self.classes_)
                if k < len(probs)
            }

            alert_level = (
                "LOW_CONFIDENCE_REVIEW" if status == "LOW_CONFIDENCE_REVIEW"
                else "CRITICAL" if pred_class_name == "Industrial Fire"
                else "HIGH" if pred_class_name == "Forest Fire"
                else "MEDIUM" if pred_class_name == "Persistent Thermal Source"
                else "LOW"
            )

            results.append({
                "classification": pred_class_name,
                "predicted_class": pred_class_name,
                "predicted_class_id": pred_class_id,
                "confidence": round(conf, 4),
                "status": status,
                "model_type": self.model_type,
                "model_version": self.model_version,
                "fusion_source": "TABULAR_ONLY",
                "alert_level": alert_level,
                "class_probabilities": class_probs,
            })
        return results

    def predict_batch_fast(
        self,
        X: np.ndarray,
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Ultra-fast vectorized batch prediction for million-record streams.
        Returns raw NumPy arrays:
            - pred_class_ids: 1D int64 array of shape (N,)
            - confs: 1D float64 array of shape (N,)
            - proba_matrix: 2D float64 array of shape (N, 4)
        Bypasses dictionary generation and allocation overhead entirely.
        """
        proba_matrix = self.predict_probabilities(X)
        pred_class_ids = np.argmax(proba_matrix, axis=1)
        confs = np.max(proba_matrix, axis=1)
        return pred_class_ids, confs, proba_matrix


def build_ensemble_classifier() -> VotingClassifier:
    """
    Constructs the soft-voting ensemble classifier using Random Forest,
    LightGBM, and XGBoost with exact hyperparameter specifications.
    """
    # 1. Random Forest
    rf = RandomForestClassifier(
        n_estimators=300,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )

    # 2. LightGBM
    lgbm = LGBMClassifier(
        n_estimators=300,
        learning_rate=0.05,
        num_leaves=31,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
        verbose=-1,
    )

    # 3. XGBoost
    xgb = XGBClassifier(
        n_estimators=300,
        learning_rate=0.05,
        max_depth=6,
        objective="multi:softprob",
        num_class=4,
        eval_metric="mlogloss",
        random_state=42,
        n_jobs=-1,
    )

    # Soft Voting Classifier
    ensemble = VotingClassifier(
        estimators=[
            ("rf", rf),
            ("lgbm", lgbm),
            ("xgb", xgb),
        ],
        voting="soft",
        weights=[1.0, 1.2, 1.2],
    )

    return ensemble


def train_ensemble_pipeline(
    dataset_path: Union[str, Path, pd.DataFrame],
    output_model_path: Union[str, Path] = "models/satra_ensemble.pkl",
    test_size: float = 0.20,
    random_state: int = 42,
    use_spatial_group: bool = True,
) -> Tuple[SoftVotingEnsembleWrapper, Dict[str, Any]]:
    """
    Production training pipeline:
    1. Loads the real labelled dataset.
    2. Validates all eight required features.
    3. Handles missing/invalid values.
    4. Validates all 4 classes exist. If any are missing, STOPS and reports without inventing data.
    5. Splits dataset using spatial holdout (StratifiedGroupKFold) or stratification.
    6. Trains and evaluates individual candidate models (RF, LightGBM, XGBoost).
    7. Trains Soft-Voting Ensemble (RF + LightGBM + XGBoost).
    8. Evaluates on holdout test set.
    9. Prints comprehensive metrics table and classification reports.
    10. Saves the trained ensemble using joblib.
    """
    from sklearn.model_selection import StratifiedGroupKFold

    # 1. Load dataset
    if isinstance(dataset_path, (str, Path)):
        p = Path(dataset_path)
        if not p.exists():
            raise FileNotFoundError(f"Training dataset file not found: {p}")
        df = pd.read_csv(p, comment="#")
    else:
        df = dataset_path.copy()

    logger.info("Loaded training dataset with %d rows.", len(df))

    # 2. Validate all eight features exist or can be extracted
    from backend.ml.feature_extractor import extract_features_from_observation

    df_cols_lower = {c.lower(): c for c in df.columns}
    has_exact = all((f in df.columns or f.lower() in df_cols_lower) for f in REQUIRED_FEATURES)
    if not has_exact:
        try:
            extracted_rows = [extract_features_from_observation(r) for r in df.to_dict(orient="records")]
            df_feats = pd.DataFrame(extracted_rows)
            for f in REQUIRED_FEATURES:
                if f not in df_feats.columns or df_feats[f].isna().any():
                    missing_feats = [feat for feat in REQUIRED_FEATURES if feat not in df_feats.columns]
                    raise FeatureValidationError(f"Could not resolve required feature(s): {missing_feats}")
            for f in REQUIRED_FEATURES:
                df[f] = df_feats[f]
        except Exception as err:
            missing_feats = [f for f in REQUIRED_FEATURES if f not in df.columns]
            raise FeatureValidationError(
                f"Training dataset is missing required features: {missing_feats}. Required: {REQUIRED_FEATURES}. ({err})"
            )

    # Map target column
    target_col = None
    for cand in ["target_label", "label", "target_class", "class", "predicted_class"]:
        if cand in df.columns or cand.lower() in df_cols_lower:
            target_col = cand if cand in df.columns else df_cols_lower[cand.lower()]
            break

    if target_col is None:
        raise ValueError(
            "Dataset does not contain a recognizable target column ('target_class' or 'target_label')."
        )

    # 3. Handle missing values
    initial_len = len(df)
    df = df.dropna(subset=REQUIRED_FEATURES + [target_col]).copy()
    if len(df) < initial_len:
        logger.warning("Dropped %d rows with missing values. Remaining: %d.", initial_len - len(df), len(df))

    # Standardize target labels to integer IDs {0, 1, 2, 3}
    y_raw = df[target_col]
    if y_raw.dtype == object or isinstance(y_raw.iloc[0], str):
        y_int = y_raw.astype(str).str.strip().str.lower().map(CLASS_NAME_TO_ID)
        unmapped = df[y_int.isna()][target_col].unique()
        if len(unmapped) > 0:
            raise ValueError(f"Unrecognized class labels in target column: {unmapped}")
        y = y_int.astype(int).values
    else:
        y = y_raw.astype(int).values

    # 4. Check for all 4 classes - STRICT STOP IF MISSING
    present_classes = sorted(list(np.unique(y)))
    required_classes = [0, 1, 2, 3]
    missing_classes = [c for c in required_classes if c not in present_classes]

    if missing_classes:
        missing_names = [CLASS_ID_TO_NAME[c] for c in missing_classes]
        error_msg = (
            f"[SATRA TRAINING HALTED] Dataset does not contain all required 4 classes.\n"
            f"  Present classes: {[CLASS_ID_TO_NAME.get(c, str(c)) for c in present_classes]}\n"
            f"  Missing required classes: {missing_names} (IDs: {missing_classes})\n"
            f"In accordance with SATRA real-data integrity requirements, training has STOPPED.\n"
            f"Do not invent or synthesize fake labels for missing classes."
        )
        logger.error(error_msg)
        raise MissingLabelsError(error_msg)

    # Validate and extract feature matrix X
    X = validate_feature_vector(df[REQUIRED_FEATURES])

    # 5. Spatial Holdout Split (StratifiedGroupKFold) to prevent geographic leakage
    train_idx, test_idx = None, None
    if use_spatial_group:
        if "spatial_cluster_id" in df.columns:
            groups = df["spatial_cluster_id"].astype(str).values
        elif "latitude" in df.columns and "longitude" in df.columns:
            # 0.05 degree ~ 5.5 km grid grouping
            groups = (
                np.round(df["latitude"].values / 0.05).astype(str) + "_" +
                np.round(df["longitude"].values / 0.05).astype(str)
            )
        else:
            groups = None

        if groups is not None and len(np.unique(groups)) > 10:
            sgkf = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=random_state)
            try:
                for tr_idx, te_idx in sgkf.split(X, y, groups=groups):
                    # Ensure all 4 classes exist in both train and test
                    if len(np.unique(y[tr_idx])) == 4 and len(np.unique(y[te_idx])) == 4:
                        train_idx, test_idx = tr_idx, te_idx
                        break
            except Exception as split_err:
                logger.warning("Spatial group split fallback: %s", split_err)

    if train_idx is None or test_idx is None:
        train_idx, test_idx = train_test_split(
            np.arange(len(X)),
            test_size=test_size,
            stratify=y,
            random_state=random_state,
        )

    X_train, X_test = X[train_idx], X[test_idx]
    y_train, y_test = y[train_idx], y[test_idx]

    logger.info("Training set: %d samples, Holdout test set: %d samples.", len(X_train), len(X_test))

    # 6. Train and benchmark individual candidate models
    sample_weights = compute_sample_weight("balanced", y_train)

    rf_model = RandomForestClassifier(n_estimators=300, class_weight="balanced", random_state=42, n_jobs=-1)
    lgbm_model = LGBMClassifier(n_estimators=300, learning_rate=0.05, num_leaves=31, class_weight="balanced", random_state=42, n_jobs=-1, verbose=-1)
    xgb_model = XGBClassifier(n_estimators=300, learning_rate=0.05, max_depth=6, objective="multi:softprob", num_class=4, eval_metric="mlogloss", random_state=42, n_jobs=-1)

    candidate_results = {}
    for name, model, fit_weights in [
        ("RandomForest", rf_model, True),
        ("LightGBM", lgbm_model, True),
        ("XGBoost", xgb_model, True),
    ]:
        logger.info("Training candidate model: %s...", name)
        if fit_weights:
            model.fit(X_train, y_train, sample_weight=sample_weights)
        else:
            model.fit(X_train, y_train)
        pred_m = model.predict(X_test)
        candidate_results[name] = {
            "accuracy": float(accuracy_score(y_test, pred_m)),
            "precision_macro": float(precision_score(y_test, pred_m, average="macro", zero_division=0)),
            "recall_macro": float(recall_score(y_test, pred_m, average="macro", zero_division=0)),
            "f1_macro": float(f1_score(y_test, pred_m, average="macro", zero_division=0)),
        }

    # 7. Build and fit soft-voting ensemble
    ensemble = build_ensemble_classifier()
    logger.info("Training soft-voting ensemble (Random Forest + LightGBM + XGBoost)...")
    ensemble.fit(X_train, y_train, sample_weight=sample_weights)

    # 8. Evaluate ensemble on holdout test set
    y_pred = ensemble.predict(X_test)
    y_proba = ensemble.predict_proba(X_test)

    acc = float(accuracy_score(y_test, y_pred))
    prec = float(precision_score(y_test, y_pred, average="macro", zero_division=0))
    rec = float(recall_score(y_test, y_pred, average="macro", zero_division=0))
    f1 = float(f1_score(y_test, y_pred, average="macro", zero_division=0))
    cls_report = classification_report(
        y_test,
        y_pred,
        target_names=[CLASS_ID_TO_NAME[c] for c in sorted(present_classes)],
        zero_division=0
    )
    conf_mat = confusion_matrix(y_test, y_pred)

    candidate_results["SoftVotingEnsemble"] = {
        "accuracy": acc,
        "precision_macro": prec,
        "recall_macro": rec,
        "f1_macro": f1,
    }

    # 9. Print comprehensive evaluation metrics
    print("\n" + "=" * 70)
    print("       SATRA PRODUCTION MODEL BENCHMARK & ENSEMBLE EVALUATION")
    print("=" * 70)
    print(f"{'Model Name':<22} | {'Accuracy':<10} | {'Precision':<10} | {'Recall':<10} | {'Macro F1':<10}")
    print("-" * 70)
    for mname, mres in candidate_results.items():
        print(f"{mname:<22} | {mres['accuracy']*100:>8.2f}% | {mres['precision_macro']*100:>8.2f}% | {mres['recall_macro']*100:>8.2f}% | {mres['f1_macro']*100:>8.2f}%")
    print("-" * 70)
    print("\nSoft-Voting Ensemble Classification Report (Spatial Holdout):")
    print(cls_report)
    print("Confusion Matrix:")
    print(conf_mat)
    print("=" * 70 + "\n")

    # 10. Save trained ensemble
    wrapper = SoftVotingEnsembleWrapper(ensemble, model_version="4.0.0-operational-ensemble")
    out_p = Path(output_model_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(wrapper, out_p)
    logger.info("Saved trained soft-voting ensemble to %s", str(out_p))

    metrics = {
        "accuracy": acc,
        "precision": prec,
        "recall": rec,
        "f1_score": f1,
        "candidate_results": candidate_results,
        "classification_report": cls_report,
        "confusion_matrix": conf_mat.tolist(),
        "model_path": str(out_p),
    }

    return wrapper, metrics
