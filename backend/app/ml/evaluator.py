"""
Evaluation metrics, classification report, confusion matrix, and feature importance
utilities for AgniDrishti Fire Threat Models (Phase 13).
"""

from typing import Any, Dict, List, Optional, Union
import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)

from backend.app.ml.dataset import THREAT_CLASSES, THREAT_SHORT_NAMES


class FireModelEvaluator:
    """
    Computes rigorous evaluation metrics for multi-class fire threat models:
    - Overall: Accuracy, Macro Precision/Recall/F1, Weighted Precision/Recall/F1
    - Per-Class: Precision, Recall, F1, Support
    - Confusion Matrix: Numerical counts and normalized rates
    - Feature Importance: Split/Gain for LightGBM, Gini for Random Forest
    """

    @staticmethod
    def evaluate(
        model: Any,
        X_test: Union[pd.DataFrame, np.ndarray],
        y_test: Union[pd.Series, np.ndarray],
        feature_names: Optional[List[str]] = None,
        model_name: str = "Model",
    ) -> Dict[str, Any]:
        """
        Evaluate model predictions against ground truth test labels.
        """
        y_true = np.asarray(y_test).astype(int)
        y_pred = model.predict(X_test)
        y_pred = np.asarray(y_pred).astype(int)

        y_proba = None
        if hasattr(model, "predict_proba"):
            try:
                y_proba = model.predict_proba(X_test)
            except Exception:
                y_proba = None

        # Calculate metrics
        acc = float(accuracy_score(y_true, y_pred))
        p_macro = float(precision_score(y_true, y_pred, average="macro", zero_division=0))
        r_macro = float(recall_score(y_true, y_pred, average="macro", zero_division=0))
        f1_macro = float(f1_score(y_true, y_pred, average="macro", zero_division=0))

        p_weighted = float(precision_score(y_true, y_pred, average="weighted", zero_division=0))
        r_weighted = float(recall_score(y_true, y_pred, average="weighted", zero_division=0))
        f1_weighted = float(f1_score(y_true, y_pred, average="weighted", zero_division=0))

        # Per-class classification report
        cls_rep = classification_report(
            y_true,
            y_pred,
            labels=[0, 1, 2, 3],
            target_names=[THREAT_CLASSES[i] for i in range(4)],
            output_dict=True,
            zero_division=0,
        )

        per_class_metrics = {}
        for i in range(4):
            c_name = THREAT_CLASSES[i]
            if c_name in cls_rep:
                per_class_metrics[i] = {
                    "class_id": i,
                    "threat_name": c_name,
                    "short_name": THREAT_SHORT_NAMES[i],
                    "precision": round(float(cls_rep[c_name]["precision"]), 4),
                    "recall": round(float(cls_rep[c_name]["recall"]), 4),
                    "f1_score": round(float(cls_rep[c_name]["f1-score"]), 4),
                    "support": int(cls_rep[c_name]["support"]),
                }

        # Confusion Matrix
        cm = confusion_matrix(y_true, y_pred, labels=[0, 1, 2, 3])
        cm_normalized = cm.astype("float") / cm.sum(axis=1)[:, np.newaxis]
        cm_normalized = np.nan_to_num(cm_normalized)

        # Feature importances
        f_names = (
            feature_names
            if feature_names is not None
            else (list(X_test.columns) if isinstance(X_test, pd.DataFrame) else None)
        )
        importances = FireModelEvaluator.extract_feature_importances(model, f_names)

        results = {
            "model_name": model_name,
            "overall": {
                "accuracy": round(acc, 4),
                "precision_macro": round(p_macro, 4),
                "recall_macro": round(r_macro, 4),
                "f1_macro": round(f1_macro, 4),
                "precision_weighted": round(p_weighted, 4),
                "recall_weighted": round(r_weighted, 4),
                "f1_weighted": round(f1_weighted, 4),
            },
            "per_class": per_class_metrics,
            "confusion_matrix": cm.tolist(),
            "confusion_matrix_normalized": np.round(cm_normalized, 4).tolist(),
            "feature_importances": importances,
        }

        return results

    @staticmethod
    def extract_feature_importances(
        model: Any,
        feature_names: Optional[List[str]] = None,
        top_n: int = 15,
    ) -> List[Dict[str, Any]]:
        """
        Extract ranked feature importances from LightGBM or Random Forest models.
        """
        if not hasattr(model, "feature_importances_"):
            return []

        raw_imp = model.feature_importances_
        if len(raw_imp) == 0:
            return []

        total_imp = float(np.sum(raw_imp))
        if total_imp > 0:
            norm_imp = raw_imp / total_imp
        else:
            norm_imp = raw_imp

        if feature_names is None or len(feature_names) != len(raw_imp):
            f_labels = [f"feature_{i}" for i in range(len(raw_imp))]
        else:
            f_labels = list(feature_names)

        ranked_indices = np.argsort(norm_imp)[::-1]

        rankings = []
        for rank, idx in enumerate(ranked_indices[:top_n], start=1):
            rankings.append({
                "rank": rank,
                "feature": f_labels[idx],
                "importance": round(float(norm_imp[idx]), 4),
                "percentage": round(float(norm_imp[idx]) * 100.0, 2),
                "raw_score": round(float(raw_imp[idx]), 2),
            })

        return rankings

    @staticmethod
    def print_evaluation_report(results: Dict[str, Any]):
        """
        Print a user-friendly, structured ASCII report of model evaluation results.
        """
        name = results.get("model_name", "Model")
        overall = results.get("overall", {})
        per_class = results.get("per_class", {})
        cm = results.get("confusion_matrix", [])
        importances = results.get("feature_importances", [])

        print(f"\n========================================================")
        print(f"       MODEL EVALUATION REPORT: {name.upper()}")
        print(f"========================================================")

        # 1. Overall Metrics
        print("\n--- [1] Overall Performance Metrics ---")
        print(f"  * Accuracy:           {overall.get('accuracy', 0.0) * 100:.2f}%")
        print(f"  * Macro F1-Score:     {overall.get('f1_macro', 0.0):.4f}")
        print(f"  * Weighted F1-Score:  {overall.get('f1_weighted', 0.0):.4f}")
        print(f"  * Macro Precision:    {overall.get('precision_macro', 0.0):.4f}")
        print(f"  * Macro Recall:       {overall.get('recall_macro', 0.0):.4f}")

        # 2. Per-Class Breakdown
        print("\n--- [2] Threat Class Performance ---")
        print(f"  {'Class':<4} {'Threat Category':<35} {'Prec':<8} {'Rec':<8} {'F1':<8} {'Support':<8}")
        print("  " + "-" * 75)
        for cls_id in range(4):
            info = per_class.get(cls_id, per_class.get(str(cls_id), {}))
            if info:
                tname = info.get("threat_name", f"Class {cls_id}")[:33]
                prec = f"{info.get('precision', 0.0):.3f}"
                rec = f"{info.get('recall', 0.0):.3f}"
                f1 = f"{info.get('f1_score', 0.0):.3f}"
                supp = str(info.get("support", 0))
                print(f"  {cls_id:<4} {tname:<35} {prec:<8} {rec:<8} {f1:<8} {supp:<8}")

        # 3. Confusion Matrix
        if cm and len(cm) == 4:
            print("\n--- [3] Confusion Matrix (Predicted -> 0: Controlled, 1: Ag, 2: Wildfire, 3: Ind) ---")
            print("                 Pred 0    Pred 1    Pred 2    Pred 3")
            for idx, row in enumerate(cm):
                cls_short = THREAT_SHORT_NAMES.get(idx, f"C{idx}").capitalize()
                row_str = "    ".join(f"{val:>6}" for val in row)
                print(f"  True {idx} ({cls_short:<10}): {row_str}")

        # 4. Feature Importance
        if importances:
            print("\n--- [4] Top 10 Feature Importances ---")
            print(f"  {'Rank':<6} {'Feature Name':<32} {'Weight':<10} {'Percentage':<10}")
            print("  " + "-" * 60)
            for item in importances[:10]:
                feat = item["feature"][:30]
                pct = f"{item['percentage']:.2f}%"
                wt = f"{item['importance']:.4f}"
                print(f"  #{item['rank']:<5} {feat:<32} {wt:<10} {pct:<10}")

        print("========================================================\n")
