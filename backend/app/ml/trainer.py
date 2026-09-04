"""
Model training, cross-validation, hyperparameter management, and champion model selection
for AgniDrishti Fire Threat Classification (Phase 13).
"""

from datetime import datetime
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union
import joblib
from lightgbm import LGBMClassifier
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import accuracy_score, f1_score

from backend.app.ml.dataset import THREAT_CLASSES, THREAT_SHORT_NAMES
from backend.app.ml.evaluator import FireModelEvaluator


class FireModelTrainer:
    """
    Trains LightGBM (Primary Gradient Boosted Classifier) and Random Forest (Baseline Ensemble),
    conducts Stratified 5-Fold Cross-Validation, evaluates test performance, selects the
    champion model, and serializes the production model bundle.
    """

    def __init__(
        self,
        random_state: int = 42,
        models_dir: Optional[Union[str, Path]] = None,
        lgbm_params: Optional[Dict[str, Any]] = None,
        rf_params: Optional[Dict[str, Any]] = None,
    ):
        self.random_state = random_state

        if models_dir is not None:
            self.models_dir = Path(models_dir)
        else:
            self.models_dir = Path(__file__).resolve().parent / "models"
        self.models_dir.mkdir(parents=True, exist_ok=True)

        # Default LightGBM hyperparameters tuned for tabular multi-class spatial features
        default_lgbm = {
            "objective": "multiclass",
            "num_class": 4,
            "n_estimators": 150,
            "learning_rate": 0.05,
            "max_depth": 6,
            "num_leaves": 31,
            "subsample": 0.85,
            "colsample_bytree": 0.85,
            "class_weight": "balanced",
            "random_state": self.random_state,
            "verbose": -1,
            "n_jobs": -1,
        }
        if lgbm_params:
            default_lgbm.update(lgbm_params)
        self.lgbm_params = default_lgbm

        # Default Random Forest hyperparameters (robust ensemble baseline)
        default_rf = {
            "n_estimators": 150,
            "max_depth": 14,
            "min_samples_split": 3,
            "min_samples_leaf": 1,
            "class_weight": "balanced",
            "random_state": self.random_state,
            "n_jobs": -1,
        }
        if rf_params:
            default_rf.update(rf_params)
        self.rf_params = default_rf

        self.models: Dict[str, Any] = {}
        self.best_model: Optional[Any] = None
        self.best_model_name: Optional[str] = None
        self.cv_results: Dict[str, Any] = {}
        self.evaluation_results: Dict[str, Any] = {}
        self.feature_names: List[str] = []
        self.training_data_mode = "unknown"

    def _init_model(self, model_type: str) -> Any:
        """Instantiate a fresh model instance."""
        if model_type.lower() == "lightgbm":
            return LGBMClassifier(**self.lgbm_params)
        elif model_type.lower() in ("random_forest", "rf"):
            return RandomForestClassifier(**self.rf_params)
        else:
            raise ValueError(f"Unknown model type '{model_type}'")

    def cross_validate(
        self,
        X: Union[pd.DataFrame, np.ndarray],
        y: Union[pd.Series, np.ndarray],
        n_splits: int = 5,
        verbose: bool = True,
    ) -> Dict[str, Any]:
        """
        Conduct Stratified K-Fold Cross-Validation on both LightGBM and Random Forest.
        Returns average Accuracy and Macro F1 scores.
        """
        X_arr = np.asarray(X)
        y_arr = np.asarray(y)

        skf = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=self.random_state)
        cv_summary: Dict[str, Any] = {
            "lightgbm": {"accuracy": [], "f1_macro": [], "f1_weighted": []},
            "random_forest": {"accuracy": [], "f1_macro": [], "f1_weighted": []},
        }

        if verbose:
            print(f"\n>>> Running Stratified {n_splits}-Fold Cross-Validation...")

        for fold, (train_idx, val_idx) in enumerate(skf.split(X_arr, y_arr), start=1):
            X_tr, y_tr = X_arr[train_idx], y_arr[train_idx]
            X_val, y_val = X_arr[val_idx], y_arr[val_idx]

            # 1. LightGBM fold
            lgbm = self._init_model("lightgbm")
            lgbm.fit(X_tr, y_tr)
            y_pred_lgbm = lgbm.predict(X_val)

            acc_lgbm = accuracy_score(y_val, y_pred_lgbm)
            f1_m_lgbm = f1_score(y_val, y_pred_lgbm, average="macro", zero_division=0)
            f1_w_lgbm = f1_score(y_val, y_pred_lgbm, average="weighted", zero_division=0)

            cv_summary["lightgbm"]["accuracy"].append(acc_lgbm)
            cv_summary["lightgbm"]["f1_macro"].append(f1_m_lgbm)
            cv_summary["lightgbm"]["f1_weighted"].append(f1_w_lgbm)

            # 2. Random Forest fold
            rf = self._init_model("random_forest")
            rf.fit(X_tr, y_tr)
            y_pred_rf = rf.predict(X_val)

            acc_rf = accuracy_score(y_val, y_pred_rf)
            f1_m_rf = f1_score(y_val, y_pred_rf, average="macro", zero_division=0)
            f1_w_rf = f1_score(y_val, y_pred_rf, average="weighted", zero_division=0)

            cv_summary["random_forest"]["accuracy"].append(acc_rf)
            cv_summary["random_forest"]["f1_macro"].append(f1_m_rf)
            cv_summary["random_forest"]["f1_weighted"].append(f1_w_rf)

            if verbose:
                print(
                    f"  * Fold {fold}/{n_splits} | "
                    f"LightGBM F1-Macro: {f1_m_lgbm:.4f} | "
                    f"Random Forest F1-Macro: {f1_m_rf:.4f}"
                )

        # Aggregate metrics
        results: Dict[str, Any] = {}
        for m_name in ["lightgbm", "random_forest"]:
            acc_arr = np.array(cv_summary[m_name]["accuracy"])
            f1_m_arr = np.array(cv_summary[m_name]["f1_macro"])
            f1_w_arr = np.array(cv_summary[m_name]["f1_weighted"])

            results[m_name] = {
                "accuracy_mean": round(float(np.mean(acc_arr)), 4),
                "accuracy_std": round(float(np.std(acc_arr)), 4),
                "f1_macro_mean": round(float(np.mean(f1_m_arr)), 4),
                "f1_macro_std": round(float(np.std(f1_m_arr)), 4),
                "f1_weighted_mean": round(float(np.mean(f1_w_arr)), 4),
                "f1_weighted_std": round(float(np.std(f1_w_arr)), 4),
            }

        if verbose:
            print("\n>>> Cross-Validation Aggregate Summary:")
            for m_name, res in results.items():
                print(
                    f"  [{m_name.upper():<14}] "
                    f"Accuracy: {res['accuracy_mean']:.4f} (+/-{res['accuracy_std']:.4f}) | "
                    f"F1-Macro: {res['f1_macro_mean']:.4f} (+/-{res['f1_macro_std']:.4f})"
                )

        self.cv_results = results
        return results

    def train_and_select(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        X_test: pd.DataFrame,
        y_test: pd.Series,
        feature_names: Optional[List[str]] = None,
        verbose: bool = True,
    ) -> Dict[str, Any]:
        """
        Fit both LightGBM and Random Forest models on training data,
        evaluate on the unseen test set, select the champion model, and record metrics.
        """
        self.feature_names = (
            feature_names
            if feature_names is not None
            else list(X_train.columns)
        )

        if verbose:
            print("\n>>> Fitting Primary & Baseline Models on 80% Training Set...")

        # 1. Train LightGBM
        lgbm = self._init_model("lightgbm")
        lgbm.fit(X_train, y_train)
        self.models["lightgbm"] = lgbm

        # 2. Train Random Forest
        rf = self._init_model("random_forest")
        rf.fit(X_train, y_train)
        self.models["random_forest"] = rf

        # Evaluate both models on test set
        eval_lgbm = FireModelEvaluator.evaluate(
            lgbm,
            X_test,
            y_test,
            feature_names=self.feature_names,
            model_name="LightGBM Classifier",
        )
        eval_rf = FireModelEvaluator.evaluate(
            rf,
            X_test,
            y_test,
            feature_names=self.feature_names,
            model_name="Random Forest Classifier",
        )

        self.evaluation_results = {
            "lightgbm": eval_lgbm,
            "random_forest": eval_rf,
        }

        # Model Selection: Champion is determined by Test Set F1-Macro score
        f1_lgbm = eval_lgbm["overall"]["f1_macro"]
        f1_rf = eval_rf["overall"]["f1_macro"]

        # If F1 is equal, LightGBM is preferred as primary gradient boosted classifier
        if f1_lgbm >= f1_rf:
            self.best_model_name = "lightgbm"
            self.best_model = lgbm
            champion_eval = eval_lgbm
        else:
            self.best_model_name = "random_forest"
            self.best_model = rf
            champion_eval = eval_rf

        if verbose:
            print(f"\n========================================================")
            print(f"               CHAMPION MODEL SELECTION                 ")
            print(f"========================================================")
            print(f"  * LightGBM Test F1-Macro:      {f1_lgbm:.4f} (Acc: {eval_lgbm['overall']['accuracy']*100:.2f}%)")
            print(f"  * Random Forest Test F1-Macro: {f1_rf:.4f} (Acc: {eval_rf['overall']['accuracy']*100:.2f}%)")
            print(f"  >>> SELECTED CHAMPION: {self.best_model_name.upper()} <<<")
            print(f"========================================================")

        return {
            "best_model_name": self.best_model_name,
            "champion_eval": champion_eval,
            "all_evaluations": self.evaluation_results,
            "cv_results": self.cv_results,
        }

    def save_model(
        self,
        output_path: Optional[Union[str, Path]] = None,
        verbose: bool = True,
    ) -> Path:
        """
        Serialize the best model, feature metadata, metrics, and mappings into
        a production .pkl artifact, plus a human-readable model_metadata.json.
        """
        if self.best_model is None:
            raise ValueError("No trained model to save. Call train_and_select() first.")

        if output_path is not None:
            model_file = Path(output_path)
        else:
            model_file = self.models_dir / "fire_model.pkl"

        model_file.parent.mkdir(parents=True, exist_ok=True)

        bundle = {
            "model": self.best_model,
            "model_name": self.best_model_name,
            "feature_names": self.feature_names,
            "threat_classes": THREAT_CLASSES,
            "threat_short_names": THREAT_SHORT_NAMES,
            "cv_results": self.cv_results,
            "metrics": self.evaluation_results.get(self.best_model_name, {}),
            "trained_at": datetime.now().isoformat(),
            "version": "1.0.0",
            "training_data_mode": self.training_data_mode,
        }

        joblib.dump(bundle, model_file, compress=3)

        # Write clean JSON metadata alongside the pickle
        meta_file = model_file.parent / "model_metadata.json"
        meta_content = {
            "model_name": self.best_model_name,
            "version": "1.0.0",
            "training_data_mode": self.training_data_mode,
            "trained_at": bundle["trained_at"],
            "feature_count": len(self.feature_names),
            "feature_names": self.feature_names,
            "threat_classes": THREAT_CLASSES,
            "cv_results": self.cv_results,
            "test_metrics": self.evaluation_results.get(self.best_model_name, {}).get("overall", {}),
            "top_10_features": self.evaluation_results.get(self.best_model_name, {}).get("feature_importances", [])[:10],
        }

        with open(meta_file, "w", encoding="utf-8") as f:
            json.dump(meta_content, f, indent=2)

        if verbose:
            print(f"[SUCCESS] Champion Model successfully serialized to: {model_file}")
            print(f"[SUCCESS] Model Metadata saved to: {meta_file}")

        return model_file
