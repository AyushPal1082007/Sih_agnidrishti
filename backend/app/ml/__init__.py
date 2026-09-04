"""
AgniDrishti Machine Learning Package (Phase 13).
Provides dataset preparation, model training (LightGBM & Random Forest),
cross-validation, performance evaluation, and real-time fire threat inference.
"""

from backend.app.ml.dataset import (
    FireDatasetLoader,
    THREAT_CLASSES,
    THREAT_NAMES,
    THREAT_SHORT_NAMES,
)
from backend.app.ml.trainer import FireModelTrainer
from backend.app.ml.evaluator import FireModelEvaluator
from backend.app.ml.predictor import FirePredictor

__all__ = [
    "FireDatasetLoader",
    "FireModelTrainer",
    "FireModelEvaluator",
    "FirePredictor",
    "THREAT_CLASSES",
    "THREAT_NAMES",
    "THREAT_SHORT_NAMES",
]
