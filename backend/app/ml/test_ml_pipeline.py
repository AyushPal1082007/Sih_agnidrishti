"""
Automated Test Suite for AgniDrishti Machine Learning Pipeline (Phase 13).
Verifies:
- Data loading, 33-dimensional schema validation, 0 NaNs
- Label derivation logic across 4 threat classes
- Stratified 80/20 train/test splitting
- 5-Fold Stratified Cross-Validation on LightGBM and Random Forest
- Model evaluation metrics, confusion matrix, and feature importances
- Serialization of .pkl artifact and model_metadata.json
- Production real-time inference with FirePredictor (single and batch)
"""

from pathlib import Path
import tempfile
import numpy as np
import pandas as pd

from backend.app.features.schema import FEATURE_COLUMNS
from backend.app.ml.dataset import (
    FireDatasetLoader,
    THREAT_CLASSES,
    derive_threat_class,
)
from backend.app.ml.evaluator import FireModelEvaluator
from backend.app.ml.predictor import FirePredictor
from backend.app.ml.trainer import FireModelTrainer


def benchmark_loader():
    return FireDatasetLoader(
        data_dir=Path(__file__).resolve().parent / "benchmark_input"
    )


def test_label_derivation_logic():
    print("\n--- [Test 1] Testing Deterministic Threat Class Derivation ---")

    # 1. Industrial hazard record -> Class 3
    ind_sample = {
        "is_near_industrial": 1,
        "nearest_industrial_distance_m": 250.0,
        "industrial_count": 2,
        "is_cropland": 1,  # Industrial takes priority
    }
    assert derive_threat_class(ind_sample) == 3, "Failed: Expected Class 3 (Industrial)"

    # 2. Cropland record -> Class 1
    crop_sample = {
        "is_near_industrial": 0,
        "nearest_industrial_distance_m": 4500.0,
        "industrial_count": 0,
        "is_cropland": 1,
        "landcover_code": 40,
    }
    assert derive_threat_class(crop_sample) == 1, "Failed: Expected Class 1 (Agricultural)"

    # 3. Forest / Vegetation record -> Class 2
    veg_sample = {
        "is_near_industrial": 0,
        "nearest_industrial_distance_m": 5000.0,
        "industrial_count": 0,
        "is_cropland": 0,
        "is_vegetation": 1,
        "landcover_code": 10,
    }
    assert derive_threat_class(veg_sample) == 2, "Failed: Expected Class 2 (Wildfire)"

    # 4. Controlled / Low-risk thermal activity -> Class 0
    ctrl_sample = {
        "is_near_industrial": 0,
        "nearest_industrial_distance_m": 5000.0,
        "industrial_count": 0,
        "is_cropland": 0,
        "is_vegetation": 0,
        "landcover_code": 60,
    }
    assert derive_threat_class(ctrl_sample) == 0, "Failed: Expected Class 0 (Controlled)"

    print("[PASS] Threat class derivation correctly resolves all 4 classes with priority hierarchy.")


def test_dataset_loader_and_schema():
    print("\n--- [Test 2] Testing Dataset Loader & 33-Dimensional Feature Matrix ---")
    loader = benchmark_loader()
    raw_df = loader.load_data(augment_if_needed=True, min_samples=200)

    assert len(raw_df) >= 200, f"Expected at least 200 samples, got {len(raw_df)}"

    X, y = loader.prepare_features(raw_df)

    # Dimensionality checks
    assert X.shape[1] == 33, f"Expected exactly 33 features, got {X.shape[1]}"
    assert list(X.columns) == FEATURE_COLUMNS, "Feature column ordering does not match FEATURE_COLUMNS schema!"

    # Invariant: ZERO NaNs
    nan_count = int(X.isna().sum().sum())
    assert nan_count == 0, f"Invariant violated: {nan_count} NaNs detected in feature matrix!"

    # Class labels check
    unique_classes = sorted(y.unique())
    assert unique_classes == [0, 1, 2, 3], f"Expected classes [0, 1, 2, 3], got {unique_classes}"

    # Summary report check
    summary = loader.get_dataset_summary(X, y)
    assert summary["feature_count"] == 33
    assert len(summary["class_distribution"]) == 4

    print(f"[PASS] 33-dimensional feature matrix extracted cleanly. Shape: {X.shape}, NaNs: 0")


def test_production_training_requires_ground_truth():
    print("\n--- [Test 3] Testing Production Ground-Truth Guard ---")
    loader = FireDatasetLoader()
    raw_df = loader.load_data(augment_if_needed=False)

    try:
        loader.prepare_features(raw_df, require_ground_truth=True)
    except ValueError as exc:
        assert "explicit 'threat_class'" in str(exc)
    else:
        raise AssertionError("Production preparation accepted rule-derived labels")

    print("[PASS] Production training rejects datasets without curated threat_class labels.")


def test_stratified_train_test_split():
    print("\n--- [Test 4] Testing Stratified 80/20 Train/Test Split ---")
    loader = benchmark_loader()
    raw_df = loader.load_data(augment_if_needed=True, min_samples=200)
    X, y = loader.prepare_features(raw_df)

    X_train, X_test, y_train, y_test = loader.train_test_split(X, y, test_size=0.20, stratify=True)

    total_samples = len(X)
    expected_test = int(round(total_samples * 0.20))

    assert abs(len(X_test) - expected_test) <= 2, f"Expected ~{expected_test} test samples, got {len(X_test)}"
    assert len(X_train) + len(X_test) == total_samples

    # Check that all 4 classes exist in both splits
    train_classes = set(y_train.unique())
    test_classes = set(y_test.unique())
    assert train_classes == {0, 1, 2, 3}, f"Train split missing classes: {train_classes}"
    assert test_classes == {0, 1, 2, 3}, f"Test split missing classes: {test_classes}"

    print(f"[PASS] Stratified split verified: Train={len(X_train)}, Test={len(X_test)}, 4/4 classes preserved.")


def test_model_training_and_cross_validation():
    print("\n--- [Test 5] Testing Model Trainer & Cross-Validation ---")
    with tempfile.TemporaryDirectory() as tmp_dir:
        loader = benchmark_loader()
        raw_df = loader.load_data(augment_if_needed=True, min_samples=200)
        X, y = loader.prepare_features(raw_df)
        X_train, X_test, y_train, y_test = loader.train_test_split(X, y, test_size=0.20)

        trainer = FireModelTrainer(random_state=42, models_dir=tmp_dir)

        # Cross validation
        cv_res = trainer.cross_validate(X_train, y_train, n_splits=3, verbose=False)
        assert "lightgbm" in cv_res and "random_forest" in cv_res
        assert cv_res["lightgbm"]["f1_macro_mean"] > 0.70
        assert cv_res["random_forest"]["f1_macro_mean"] > 0.70

        # Fit and select champion
        sel = trainer.train_and_select(X_train, y_train, X_test, y_test, verbose=False)
        assert sel["best_model_name"] in ("lightgbm", "random_forest")
        assert trainer.best_model is not None

        # Check serialization
        saved_path = trainer.save_model(verbose=False)
        assert saved_path.exists(), "Model pickle was not created!"
        assert (saved_path.parent / "model_metadata.json").exists(), "Model metadata JSON was not created!"

        print(f"[PASS] Trainer successfully trained both models, ran CV, and saved champion '{sel['best_model_name']}'.")


def test_evaluator_metrics():
    print("\n--- [Test 6] Testing Evaluator Metrics & Feature Importances ---")
    loader = benchmark_loader()
    raw_df = loader.load_data(augment_if_needed=True, min_samples=200)
    X, y = loader.prepare_features(raw_df)
    X_train, X_test, y_train, y_test = loader.train_test_split(X, y, test_size=0.20)

    trainer = FireModelTrainer(random_state=42)
    trainer.train_and_select(X_train, y_train, X_test, y_test, verbose=False)

    eval_res = FireModelEvaluator.evaluate(
        trainer.best_model,
        X_test,
        y_test,
        feature_names=list(X.columns),
        model_name="Champion",
    )

    overall = eval_res["overall"]
    assert 0.0 <= overall["accuracy"] <= 1.0
    assert 0.0 <= overall["f1_macro"] <= 1.0
    assert 0.0 <= overall["precision_macro"] <= 1.0
    assert 0.0 <= overall["recall_macro"] <= 1.0

    # Check 4 classes in per_class
    assert len(eval_res["per_class"]) == 4

    # Check confusion matrix shape 4x4
    cm = eval_res["confusion_matrix"]
    assert len(cm) == 4 and all(len(row) == 4 for row in cm)

    # Check feature importances
    fi = eval_res["feature_importances"]
    assert len(fi) > 0
    assert fi[0]["rank"] == 1
    # Check descending order
    scores = [item["importance"] for item in fi]
    assert scores == sorted(scores, reverse=True)

    print(f"[PASS] Evaluator verified. Test Accuracy: {overall['accuracy']*100:.2f}%, F1-Macro: {overall['f1_macro']:.4f}")


def test_real_time_predictor():
    print("\n--- [Test 7] Testing Production Predictor (Single & Batch Inference) ---")
    with tempfile.TemporaryDirectory() as tmp_dir:
        loader = benchmark_loader()
        raw_df = loader.load_data(augment_if_needed=True, min_samples=200)
        X, y = loader.prepare_features(raw_df)
        X_train, X_test, y_train, y_test = loader.train_test_split(X, y, test_size=0.20)

        trainer = FireModelTrainer(random_state=42, models_dir=tmp_dir)
        trainer.train_and_select(X_train, y_train, X_test, y_test, verbose=False)
        model_path = trainer.save_model(verbose=False)

        predictor = FirePredictor(model_path=model_path)

        # 1. Single record prediction (Industrial sample)
        ind_rec = {
            "nearest_industrial_distance_m": 50.0,
            "industrial_count": 3,
            "is_near_industrial": 1,
            "building_count": 6,
            "is_built_up": 1,
            "frp": 22.0,
        }
        res_ind = predictor.predict_record(ind_rec)
        assert res_ind["predicted_class"] == 3, f"Expected industrial class 3, got {res_ind['predicted_class']}"
        assert res_ind["threat_name"] == THREAT_CLASSES[3]
        assert 0.0 <= res_ind["severity_score"] <= 1.0
        assert res_ind["severity_score"] >= 0.70, f"Industrial severity should be high, got {res_ind['severity_score']}"

        # Probabilities sum to 1.0
        p_sum = sum(res_ind["class_probabilities"].values())
        assert abs(p_sum - 1.0) < 0.02, f"Probabilities do not sum to 1.0: {p_sum}"

        # 2. Batch inference on DataFrame
        batch_df = pd.DataFrame([
            {"frp": 1.0, "is_bare_land": 1, "nearest_industrial_distance_m": 5000.0},
            {"frp": 15.0, "is_cropland": 1, "landcover_code": 40, "nearest_industrial_distance_m": 4500.0},
            {"frp": 50.0, "is_vegetation": 1, "landcover_code": 10, "nearest_industrial_distance_m": 5000.0},
            {"frp": 30.0, "is_near_industrial": 1, "nearest_industrial_distance_m": 100.0, "industrial_count": 2},
        ])
        pred_df = predictor.predict_dataframe(batch_df)

        assert "predicted_threat_class" in pred_df.columns
        assert "severity_score" in pred_df.columns
        assert "model_confidence" in pred_df.columns
        assert len(pred_df) == 4

        print("[PASS] Production Predictor verified on single records and batch DataFrames.")


def main():
    print("==========================================================")
    print("      AGNIDRISHTI ML PIPELINE AUTOMATED TEST SUITE        ")
    print("==========================================================")

    test_label_derivation_logic()
    test_dataset_loader_and_schema()
    test_production_training_requires_ground_truth()
    test_stratified_train_test_split()
    test_model_training_and_cross_validation()
    test_evaluator_metrics()
    test_real_time_predictor()

    print("\n==========================================================")
    print("[SUCCESS] ALL ML PIPELINE UNIT & INTEGRATION TESTS PASSED (7/7)!")
    print("==========================================================\n")


if __name__ == "__main__":
    main()
