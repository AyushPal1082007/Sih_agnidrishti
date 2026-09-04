"""
Production real-time inference engine for AgniDrishti Fire Threat Classification (Phase 13).
Loads serialized model bundle (.pkl) and executes single and batch inference with probabilities
and continuous severity probability score (0.0 ... 1.0).
"""

from pathlib import Path
from typing import Any, Dict, List, Optional, Union
import joblib
import numpy as np
import pandas as pd

from backend.app.features.schema import DEFAULT_MAX_DISTANCE_M, FEATURE_COLUMNS
from backend.app.ml.dataset import THREAT_CLASSES, THREAT_SHORT_NAMES


class FirePredictor:
    """
    Production-ready real-time inference engine.
    Loads the trained model artifact, aligns feature vectors against the 33-dimensional schema,
    and returns multi-class threat classifications, calibrated probabilities, and continuous severity scores.
    """

    # Severity weights per threat class to compute continuous expected threat severity [0.0 - 1.0]
    SEVERITY_WEIGHTS = {
        0: 0.05,  # Controlled / Low Risk
        1: 0.45,  # Agricultural / Stubble Burning
        2: 0.75,  # Wildfire / Vegetation Fuel
        3: 1.00,  # Critical Industrial Hazard Fire
    }

    def __init__(self, model_path: Optional[Union[str, Path]] = None):
        if model_path is not None:
            self.model_path = Path(model_path)
        else:
            self.model_path = Path(__file__).resolve().parent / "models" / "fire_model.pkl"

        if not self.model_path.exists():
            raise FileNotFoundError(
                f"Trained fire model artifact not found at: {self.model_path}. "
                f"Please run the training pipeline first (python -m backend.app.ml.train_pipeline)."
            )

        self._load_bundle()

    def _load_bundle(self):
        """Load and unpack serialized model bundle."""
        bundle = joblib.load(self.model_path)
        self.model = bundle["model"]
        self.model_name = bundle.get("model_name", "FireModel")
        self.feature_names = bundle.get("feature_names", FEATURE_COLUMNS)
        self.threat_classes = bundle.get("threat_classes", THREAT_CLASSES)
        self.threat_short_names = bundle.get("threat_short_names", THREAT_SHORT_NAMES)
        self.metadata = {
            "trained_at": bundle.get("trained_at"),
            "version": bundle.get("version", "1.0.0"),
            "training_data_mode": bundle.get("training_data_mode", "unknown"),
            "cv_results": bundle.get("cv_results", {}),
            "test_metrics": bundle.get("metrics", {}).get("overall", {}),
        }

    def _prepare_vector(self, record: Dict[str, Any]) -> np.ndarray:
        """
        Extract and align values matching self.feature_names, imputing missing features.
        """
        distance_cols = {
            "nearest_road_distance_m",
            "nearest_building_distance_m",
            "nearest_settlement_distance_m",
            "nearest_industrial_distance_m",
            "nearest_water_distance_m",
        }

        values = []
        for col in self.feature_names:
            if col in record and record[col] is not None and not pd.isna(record[col]):
                try:
                    values.append(float(record[col]))
                except (ValueError, TypeError):
                    values.append(0.0)
            else:
                default_val = DEFAULT_MAX_DISTANCE_M if col in distance_cols else 0.0
                values.append(default_val)

        return np.array(values, dtype=float).reshape(1, -1)

    def _compute_severity(self, probas: np.ndarray) -> float:
        """
        Compute continuous expected severity probability score (0.0 ... 1.0):
        severity = sum(probas[c] * SEVERITY_WEIGHTS[c])
        """
        sev = 0.0
        for cls_id, weight in self.SEVERITY_WEIGHTS.items():
            if cls_id < len(probas):
                sev += float(probas[cls_id]) * weight
        return float(np.clip(sev, 0.0, 1.0))

    def predict_record(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """
        Run real-time inference on a single feature record or raw event dict.
        """
        X = pd.DataFrame(self._prepare_vector(record), columns=self.feature_names)
        pred_cls = int(self.model.predict(X)[0])

        if hasattr(self.model, "predict_proba"):
            probas = self.model.predict_proba(X)[0]
        else:
            probas = np.zeros(4)
            probas[pred_cls] = 1.0

        confidence = float(np.max(probas))
        severity_score = self._compute_severity(probas)

        # Categorize severity tier
        if severity_score >= 0.70:
            severity_tier = "CRITICAL" if pred_cls == 3 else "HIGH"
        elif severity_score >= 0.35:
            severity_tier = "MEDIUM"
        else:
            severity_tier = "LOW"

        prob_dict = {}
        for c in range(len(probas)):
            s_name = self.threat_short_names.get(c, f"class_{c}")
            prob_dict[s_name] = round(float(probas[c]), 4)

        return {
            "predicted_class": pred_cls,
            "threat_name": self.threat_classes.get(pred_cls, f"Class {pred_cls}"),
            "threat_short_name": self.threat_short_names.get(pred_cls, f"class_{pred_cls}"),
            "confidence": round(confidence, 4),
            "severity_score": round(severity_score, 4),
            "severity_tier": severity_tier,
            "class_probabilities": prob_dict,
        }

    def predict_batch(
        self,
        records: Union[List[Dict[str, Any]], pd.DataFrame],
    ) -> List[Dict[str, Any]]:
        """
        Run vectorized inference on a batch of feature records or DataFrame.
        """
        if isinstance(records, pd.DataFrame):
            df = records.copy()
            # Ensure all feature columns exist
            for col in self.feature_names:
                if col not in df.columns:
                    default = DEFAULT_MAX_DISTANCE_M if "distance" in col else 0.0
                    df[col] = default
                else:
                    default = DEFAULT_MAX_DISTANCE_M if "distance" in col else 0.0
                    df[col] = df[col].fillna(default)

            X = df[self.feature_names].astype(float)
        else:
            raw_matrix = np.vstack([self._prepare_vector(r) for r in records])
            X = pd.DataFrame(raw_matrix, columns=self.feature_names)

        preds = self.model.predict(X).astype(int)

        if hasattr(self.model, "predict_proba"):
            all_probas = self.model.predict_proba(X)
        else:
            all_probas = np.zeros((len(preds), 4))
            for i, p in enumerate(preds):
                all_probas[i, p] = 1.0

        results = []
        for i in range(len(preds)):
            cls_id = int(preds[i])
            probas = all_probas[i]
            conf = float(np.max(probas))
            sev = self._compute_severity(probas)

            if sev >= 0.70:
                s_tier = "CRITICAL" if cls_id == 3 else "HIGH"
            elif sev >= 0.35:
                s_tier = "MEDIUM"
            else:
                s_tier = "LOW"

            prob_dict = {
                self.threat_short_names.get(c, f"class_{c}"): round(float(probas[c]), 4)
                for c in range(len(probas))
            }

            results.append({
                "predicted_class": cls_id,
                "threat_name": self.threat_classes.get(cls_id, f"Class {cls_id}"),
                "threat_short_name": self.threat_short_names.get(cls_id, f"class_{cls_id}"),
                "confidence": round(conf, 4),
                "severity_score": round(sev, 4),
                "severity_tier": s_tier,
                "class_probabilities": prob_dict,
            })

        return results

    def predict_dataframe(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Append model predictions, probabilities, and severity scores directly to a DataFrame.
        """
        batch_results = self.predict_batch(df)

        result_df = df.copy()
        result_df["predicted_threat_class"] = [r["predicted_class"] for r in batch_results]
        result_df["threat_name"] = [r["threat_name"] for r in batch_results]
        result_df["threat_short_name"] = [r["threat_short_name"] for r in batch_results]
        result_df["severity_score"] = [r["severity_score"] for r in batch_results]
        result_df["severity_tier"] = [r["severity_tier"] for r in batch_results]
        result_df["model_confidence"] = [r["confidence"] for r in batch_results]

        for s_name in THREAT_SHORT_NAMES.values():
            result_df[f"prob_{s_name}"] = [r["class_probabilities"][s_name] for r in batch_results]

        return result_df
