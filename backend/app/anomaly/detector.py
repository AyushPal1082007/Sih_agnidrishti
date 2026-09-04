"""FRP baseline anomaly detection and spatial hotspot clustering."""

from typing import Any, Dict, Optional

import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN

from backend.app.risk.engine import RiskEngine


class AnomalyDetector:
    """Detect unusual FRP values against historical group baselines."""

    def __init__(
        self,
        z_threshold: float = 3.0,
        min_history: int = 3,
        cluster_eps_km: float = 2.0,
        min_cluster_size: int = 2,
    ):
        if z_threshold <= 0 or min_history < 1 or cluster_eps_km <= 0:
            raise ValueError("Anomaly thresholds must be positive")
        self.z_threshold = z_threshold
        self.min_history = min_history
        self.cluster_eps_km = cluster_eps_km
        self.min_cluster_size = min_cluster_size
        self.risk_engine = RiskEngine()

    def score_rule_based(
        self,
        hotspots: pd.DataFrame,
        anomaly_threshold: float = 70.0,
    ) -> pd.DataFrame:
        """Score hotspots without history using the explainable risk rules."""
        if not 0.0 <= anomaly_threshold <= 100.0:
            raise ValueError("anomaly_threshold must be between 0 and 100")

        result = hotspots.copy()
        evaluations = [
            self.risk_engine.evaluate(record)
            for record in result.to_dict(orient="records")
        ]
        result["anomaly_score"] = [round(item["risk_score"] / 100.0, 4) for item in evaluations]
        result["anomaly_rule_score"] = [item["risk_score"] for item in evaluations]
        result["anomaly_level"] = [item["risk_level"] for item in evaluations]
        result["is_anomaly"] = [
            item["risk_score"] >= anomaly_threshold for item in evaluations
        ]
        result["anomaly_reasons"] = [
            "; ".join(item["reasons"]) for item in evaluations
        ]
        return result

    def build_baseline(
        self,
        history: pd.DataFrame,
        group_col: str = "facility_id",
        value_col: str = "frp",
    ) -> pd.DataFrame:
        """Build mean, standard deviation, and observation count per group."""
        self._require_columns(history, [group_col, value_col])
        values = history[[group_col, value_col]].copy()
        values[value_col] = pd.to_numeric(values[value_col], errors="coerce")
        values = values.dropna(subset=[value_col])
        baseline = values.groupby(group_col)[value_col].agg(
            baseline_mean="mean",
            baseline_std="std",
            history_count="count",
        ).reset_index()
        baseline["baseline_std"] = baseline["baseline_std"].fillna(0.0)
        return baseline

    def score(
        self,
        current: pd.DataFrame,
        history: pd.DataFrame,
        group_col: str = "facility_id",
        value_col: str = "frp",
    ) -> pd.DataFrame:
        """Return current observations with z-scores and anomaly decisions."""
        self._require_columns(current, [group_col, value_col])
        baseline = self.build_baseline(history, group_col, value_col)
        result = current.copy()
        result[value_col] = pd.to_numeric(result[value_col], errors="coerce")
        result = result.merge(baseline, on=group_col, how="left")

        global_mean = float(pd.to_numeric(history[value_col], errors="coerce").mean())
        global_std = float(pd.to_numeric(history[value_col], errors="coerce").std())
        if not np.isfinite(global_std) or global_std == 0:
            global_std = 1.0

        result["baseline_mean"] = result["baseline_mean"].fillna(global_mean)
        result["baseline_std"] = result["baseline_std"].replace(0, np.nan).fillna(global_std)
        result["history_count"] = result["history_count"].fillna(0).astype(int)
        result["frp_z_score"] = (
            (result[value_col] - result["baseline_mean"]) / result["baseline_std"]
        ).replace([np.inf, -np.inf], 0.0).fillna(0.0)
        result["anomaly_score"] = np.clip(
            result["frp_z_score"].abs() / self.z_threshold, 0.0, 1.0
        )
        result["is_anomaly"] = (
            (result["history_count"] >= self.min_history)
            & (result["frp_z_score"].abs() >= self.z_threshold)
        )
        return result

    def cluster_hotspots(
        self,
        hotspots: pd.DataFrame,
        latitude_col: str = "latitude",
        longitude_col: str = "longitude",
    ) -> pd.DataFrame:
        """Assign DBSCAN cluster IDs using latitude/longitude coordinates."""
        self._require_columns(hotspots, [latitude_col, longitude_col])
        result = hotspots.copy()
        coordinates = result[[latitude_col, longitude_col]].apply(pd.to_numeric, errors="coerce")
        valid = coordinates.notna().all(axis=1)
        result["cluster_id"] = -1
        if valid.sum() < self.min_cluster_size:
            return result

        # Haversine distance in radians; eps is converted from kilometers.
        radians = np.radians(coordinates.loc[valid].to_numpy())
        model = DBSCAN(
            eps=self.cluster_eps_km / 6371.0088,
            min_samples=self.min_cluster_size,
            metric="haversine",
        )
        result.loc[valid, "cluster_id"] = model.fit_predict(radians)
        return result

    @staticmethod
    def _require_columns(frame: pd.DataFrame, columns: list[str]) -> None:
        missing = [column for column in columns if column not in frame.columns]
        if missing:
            raise ValueError(f"Missing required columns: {missing}")
