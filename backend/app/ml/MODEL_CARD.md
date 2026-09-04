# AgniDrishti Fire Model

## Current artifact

- Model: LightGBM multiclass classifier
- Classes: controlled, agricultural, wildfire, industrial
- Features: 33
- Training mode: `synthetic_benchmark`
- Samples: 1,000
- Test accuracy: 0.9500
- Test macro F1: 0.9501
- 5-fold cross-validation macro F1: 0.9614

## Intended use

This artifact is for pipeline integration, inference demonstrations, and benchmark testing. It is not a production accuracy claim.

## Limitations

The labels in the benchmark dataset are generated from deterministic domain rules. Several input features are also used by those rules, so the evaluation is optimistic and affected by label leakage. The fast 5,588-record FIRMS export has no curated `threat_class` labels and must not be used to train this artifact.

## Production retraining

Collect curated labels from domain review, preserve all 33 spatial and satellite features, split validation by city or time, and train with `allow_synthetic=False`. The production pipeline intentionally rejects datasets without an explicit `threat_class` column.
