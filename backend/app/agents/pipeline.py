"""Detector, skeptic, and dispatcher pipeline for fire incidents."""

from typing import Any, Dict

import pandas as pd

from backend.app.anomaly import AnomalyDetector
from backend.app.risk.engine import RiskEngine


class IncidentPipeline:
    """Create explainable incident records from feature dictionaries."""

    def __init__(self, anomaly_threshold: float = 70.0):
        self.anomaly_threshold = anomaly_threshold
        self.anomaly_detector = AnomalyDetector()
        self.risk_engine = RiskEngine()

    def process_record(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """Run detector, skeptic, and dispatcher for one hotspot."""
        risk = self.risk_engine.evaluate(record)
        is_candidate = risk["risk_score"] >= self.anomaly_threshold
        reasons = list(risk["reasons"])

        # The skeptic suppresses low-confidence thermal noise.
        confidence = float(record.get("confidence_score", 0.0))
        suppressed = confidence < 0.3 and risk["risk_score"] < 85.0
        if suppressed:
            status = "SUPPRESSED"
            reasons.append("Low satellite confidence and no critical risk evidence.")
        elif is_candidate:
            status = "VALIDATED"
        else:
            status = "MONITORED"

        return {
            "event_id": record.get("event_id"),
            "status": status,
            "detected": True,
            "risk_score": risk["risk_score"],
            "risk_level": risk["risk_level"],
            "confidence": round(confidence, 4),
            "dispatch_required": status == "VALIDATED",
            "reasons": reasons,
        }

    def process_dataframe(self, frame: pd.DataFrame) -> pd.DataFrame:
        """Append structured incident decisions to every input row."""
        results = [self.process_record(row) for row in frame.to_dict(orient="records")]
        output = frame.copy()
        for key in ("status", "detected", "risk_score", "risk_level", "confidence", "dispatch_required"):
            output[key] = [result[key] for result in results]
        output["incident_reasons"] = ["; ".join(result["reasons"]) for result in results]
        return output
