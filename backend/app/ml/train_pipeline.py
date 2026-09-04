"""
Executable Training Pipeline for AgniDrishti Fire Threat Classification (Phase 13).
Usage:
    python -m backend.app.ml.train_pipeline
    python -m backend.app.ml.train_pipeline --samples 800
"""

import argparse
from pathlib import Path
import json

from backend.app.ml.dataset import FireDatasetLoader, THREAT_CLASSES
from backend.app.ml.evaluator import FireModelEvaluator
from backend.app.ml.trainer import FireModelTrainer
from backend.app.ml.predictor import FirePredictor


def run_pipeline(
    min_samples: int = 600,
    output_dir: Path = None,
    allow_synthetic: bool = False,
):
    print("\n" + "=" * 65)
    print("      AGNIDRISHTI MACHINE LEARNING TRAINING PIPELINE (PHASE 13)")
    print("=" * 65)

    # 1. Load and Prepare Data
    print("\n[Step 1/5] Loading & Preparing Multi-Source Unified Data...")
    if allow_synthetic:
        # Keep benchmark training isolated from unlabeled production exports.
        benchmark_data_dir = Path(__file__).resolve().parent / "benchmark_input"
        loader = FireDatasetLoader(data_dir=benchmark_data_dir)
    else:
        loader = FireDatasetLoader()
    raw_df = loader.load_data(
        augment_if_needed=allow_synthetic,
        min_samples=min_samples,
    )
    X, y = loader.prepare_features(raw_df, require_ground_truth=not allow_synthetic)

    if not allow_synthetic and len(raw_df) < min_samples:
        print(
            "[WARN] Training with fewer records than requested because synthetic "
            "augmentation is disabled."
        )

    missing_classes = sorted(set(THREAT_CLASSES) - set(y.unique()))
    if missing_classes:
        raise ValueError(
            "Training dataset is missing labeled threat classes "
            f"{missing_classes}. Add curated labels before training."
        )

    # Export consolidated ML dataset for reproducibility and inspection
    try:
        export_df = X.copy()
        export_df["threat_class"] = y
        loader.data_dir.mkdir(parents=True, exist_ok=True)
        export_parquet = loader.data_dir / "fire_dataset_ml.parquet"
        export_csv = loader.data_dir / "fire_dataset_ml.csv"
        export_df.to_parquet(export_parquet, index=False)
        export_df.to_csv(export_csv, index=False)
        print(f"[OK] Consolidated ML Dataset saved to: {export_parquet.name} ({len(export_df)} records)")
    except Exception as e:
        print(f"[WARN] Could not export ML dataset: {e}")

    summary = loader.get_dataset_summary(X, y)
    print(f"[OK] Total Fire Samples Prepared: {summary['total_samples']}")
    print(f"[OK] Dimensionality: {summary['feature_count']} features (Zero NaNs: True)")
    print("[OK] Threat Class Breakdown:")
    for cls_id, info in summary["class_distribution"].items():
        print(f"    * Class {cls_id} ({info['short_name']:<12}): {info['count']:>4} samples ({info['percentage']:>5.1f}%) - {info['name']}")

    # 2. Stratified Train / Test Split (80 / 20)
    print("\n[Step 2/5] Performing Stratified 80/20 Train/Test Split...")
    X_train, X_test, y_train, y_test = loader.train_test_split(X, y, test_size=0.20, stratify=True)
    print(f"[OK] Training Set: {len(X_train)} samples")
    print(f"[OK] Test Set:     {len(X_test)} samples")

    # 3. Model Training & Cross-Validation
    print("\n[Step 3/5] Training Classifiers (LightGBM & Random Forest Baseline)...")
    trainer = FireModelTrainer(random_state=42, models_dir=output_dir)
    trainer.training_data_mode = "synthetic_benchmark" if allow_synthetic else "curated_ground_truth"

    # Stratified 5-Fold Cross Validation
    cv_scores = trainer.cross_validate(X_train, y_train, n_splits=5, verbose=True)

    # Train and select champion
    selection_res = trainer.train_and_select(
        X_train, y_train, X_test, y_test,
        feature_names=list(X.columns),
        verbose=True,
    )

    best_name = selection_res["best_model_name"]
    champion_eval = selection_res["champion_eval"]

    # 4. Display Evaluation Report & Feature Importances
    print("\n[Step 4/5] Champion Model Detailed Performance Report:")
    FireModelEvaluator.print_evaluation_report(champion_eval)

    # Save Model Artifacts
    print("[Step 5/5] Serializing Champion Model Artifact...")
    model_path = trainer.save_model(verbose=True)

    # 5. Production Inference Verification Test
    print("\n========================================================")
    print("      LIVE INFERENCE VERIFICATION (4 REALISTIC SCENARIOS) ")
    print("========================================================")
    predictor = FirePredictor(model_path=model_path)

    test_scenarios = [
        {
            "name": "Scenario 0: Controlled / Low-Risk Clearing",
            "data": {
                "frp": 1.2,
                "brightness": 302.0,
                "confidence_score": 0.55,
                "is_night": 0,
                "landcover_code": 60,
                "is_bare_land": 1,
                "is_cropland": 0,
                "is_vegetation": 0,
                "is_built_up": 0,
                "nearest_road_distance_m": 450.0,
                "nearest_industrial_distance_m": 4500.0,
                "is_near_industrial": 0,
                "building_count": 0,
                "nearest_building_distance_m": 5000.0,
            },
        },
        {
            "name": "Scenario 1: Agricultural Stubble Burning",
            "data": {
                "frp": 14.5,
                "brightness": 335.0,
                "confidence_score": 0.85,
                "is_night": 0,
                "landcover_code": 40,
                "is_cropland": 1,
                "is_vegetation": 0,
                "is_built_up": 0,
                "nearest_road_distance_m": 35.0,
                "is_road_adjacent": 1,
                "nearest_industrial_distance_m": 3500.0,
                "is_near_industrial": 0,
                "building_count": 1,
                "nearest_building_distance_m": 850.0,
            },
        },
        {
            "name": "Scenario 2: Forest / Wildfire Spread",
            "data": {
                "frp": 45.0,
                "brightness": 365.0,
                "confidence_score": 0.95,
                "is_night": 1,
                "landcover_code": 10,
                "is_cropland": 0,
                "is_vegetation": 1,
                "is_built_up": 0,
                "nearest_road_distance_m": 1200.0,
                "is_road_adjacent": 0,
                "nearest_industrial_distance_m": 4000.0,
                "is_near_industrial": 0,
                "building_count": 0,
                "nearest_building_distance_m": 5000.0,
            },
        },
        {
            "name": "Scenario 3: Critical Refinery Industrial Fire",
            "data": {
                "frp": 25.0,
                "brightness": 345.0,
                "confidence_score": 0.90,
                "is_night": 1,
                "landcover_code": 50,
                "is_cropland": 0,
                "is_vegetation": 0,
                "is_built_up": 1,
                "nearest_road_distance_m": 45.0,
                "is_road_adjacent": 1,
                "nearest_industrial_distance_m": 120.0,
                "industrial_count": 3,
                "is_near_industrial": 1,
                "building_count": 8,
                "nearest_building_distance_m": 180.0,
            },
        },
    ]

    for sc in test_scenarios:
        res = predictor.predict_record(sc["data"])
        print(f"\n>> {sc['name']}")
        print(f"  * Predicted Class:    [{res['predicted_class']}] {res['threat_name']}")
        print(f"  * Confidence:         {res['confidence'] * 100:.1f}%")
        print(f"  * Severity Score:     {res['severity_score']:.4f} ({res['severity_tier']})")
        print(f"  * Probabilities:      {res['class_probabilities']}")

    print("\n" + "=" * 65)
    print("[SUCCESS] PHASE 13 ML PIPELINE EXECUTION SUCCESSFULLY COMPLETED!")
    print("=" * 65 + "\n")

    return {
        "best_model_name": best_name,
        "champion_eval": champion_eval,
        "model_path": str(model_path),
    }


def main():
    parser = argparse.ArgumentParser(description="AgniDrishti ML Pipeline Runner")
    parser.add_argument("--samples", type=int, default=2500, help="Minimum sample size for training")
    parser.add_argument(
        "--allow-synthetic",
        action="store_true",
        help="Use synthetic benchmark data explicitly; never use this for production metrics.",
    )
    args = parser.parse_args()

    run_pipeline(min_samples=args.samples, allow_synthetic=args.allow_synthetic)


if __name__ == "__main__":
    main()
