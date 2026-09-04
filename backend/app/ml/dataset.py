"""
Dataset preparation, loading, feature matrix extraction, and stratified splitting
for AgniDrishti Fire Threat Machine Learning (Phase 13).
"""

from datetime import datetime, date
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

from backend.app.features.schema import (
    DEFAULT_MAX_DISTANCE_M,
    FEATURE_COLUMNS,
)

# -------------------------------------------------------------------------
# Multi-Class Fire Threat Definitions
# -------------------------------------------------------------------------
THREAT_CLASSES: Dict[int, str] = {
    0: "Controlled / Low Risk Thermal Activity",
    1: "Agricultural / Stubble Burning (Cropland)",
    2: "Wildfire / Vegetation Fuel Fire",
    3: "Critical Industrial Hazard Fire (Refineries / Chemical Zones)",
}

THREAT_NAMES: Dict[int, str] = THREAT_CLASSES

THREAT_SHORT_NAMES: Dict[int, str] = {
    0: "controlled",
    1: "agricultural",
    2: "wildfire",
    3: "industrial",
}

SHORT_NAME_TO_CLASS: Dict[str, int] = {v: k for k, v in THREAT_SHORT_NAMES.items()}


def derive_threat_class(row: Union[pd.Series, Dict[str, Any]]) -> int:
    """
    Deterministically derive ground-truth threat class (0, 1, 2, 3) from
    spatial, landcover, and industrial risk features.

    Priority hierarchy:
    1. Critical Industrial Hazard (Class 3): Near refinery / chemical / industrial zones.
    2. Agricultural Stubble Burning (Class 1): Cropland / agricultural burning.
    3. Wildfire / Vegetation Fuel Fire (Class 2): Dense forest, shrubland, or grasslands.
    4. Controlled / Low Risk (Class 0): Baseline low-intensity or cleared thermal anomaly.
    """
    if isinstance(row, dict):
        get_val = lambda k, d=0.0: row.get(k, d)
    else:
        get_val = lambda k, d=0.0: row[k] if k in row and pd.notna(row[k]) else d

    # 1. Industrial Hazard Proximity (Refinery, Chemical plant, Industrial zone)
    is_near_industrial = int(get_val("is_near_industrial", 0))
    industrial_dist = float(get_val("nearest_industrial_distance_m", DEFAULT_MAX_DISTANCE_M))
    industrial_count = int(get_val("industrial_count", 0))

    if is_near_industrial == 1 or industrial_count > 0 or industrial_dist <= 1000.0:
        return 3

    # 2. Agricultural Stubble Burning (Cropland LandCover)
    is_cropland = int(get_val("is_cropland", 0))
    landcover_code = int(get_val("landcover_code", 0))

    if is_cropland == 1 or landcover_code == 40:
        return 1

    # 3. Wildfire / Vegetation Fuel Fire (Forest, Shrubland, Grassland, Wetlands)
    is_vegetation = int(get_val("is_vegetation", 0))
    if is_vegetation == 1 or landcover_code in {10, 20, 30, 90, 95}:
        return 2

    # 4. Controlled / Low Risk Thermal Activity
    return 0


class FireDatasetLoader:
    """
    Loads unified multi-city fire hotspot datasets (.parquet and .csv),
    extracts the exact 33-dimensional feature matrix, derives target threat classes,
    handles temporal parsing, checks for zero NaNs, and provides stratified train/test splits.
    """

    def __init__(
        self,
        data_dir: Optional[Union[str, Path]] = None,
        random_state: int = 42,
    ):
        if data_dir is not None:
            self.data_dir = Path(data_dir)
        else:
            project_root = Path(__file__).resolve().parents[3]
            self.data_dir = project_root / "data" / "processed" / "unified"

        self.random_state = random_state
        self.feature_columns = FEATURE_COLUMNS

    def load_data(
        self,
        file_paths: Optional[List[Union[str, Path]]] = None,
        augment_if_needed: bool = True,
        min_samples: int = 400,
    ) -> pd.DataFrame:
        """
        Load fire datasets from Parquet and CSV files.
        If file_paths is None, searches self.data_dir for all unified files.
        If available records are fewer than min_samples and augment_if_needed is True,
        generates physically sound benchmark variations to ensure robust multi-class training.
        """
        dfs: List[pd.DataFrame] = []

        if file_paths:
            candidate_files = [Path(p) for p in file_paths]
        else:
            candidate_files = []
            if self.data_dir.exists():
                # Prefer parquet over csv to avoid duplicates if both exist with same stem
                parquets = list(self.data_dir.glob("*_unified.parquet"))
                csvs = list(self.data_dir.glob("*_unified.csv"))

                parquet_stems = {p.stem for p in parquets}
                candidate_files.extend(parquets)
                for c in csvs:
                    if c.stem not in parquet_stems:
                        candidate_files.append(c)

        for fpath in candidate_files:
            if not fpath.exists():
                continue
            try:
                if fpath.suffix.lower() == ".parquet":
                    df = pd.read_parquet(fpath)
                    dfs.append(df)
                elif fpath.suffix.lower() == ".csv":
                    df = pd.read_csv(fpath)
                    dfs.append(df)
            except Exception as e:
                print(f"[WARN] Failed reading {fpath.name}: {e}")

        if dfs:
            combined_df = pd.concat(dfs, ignore_index=True)
            # Deduplicate by event_id or coordinates if present
            if "event_id" in combined_df.columns:
                combined_df = combined_df.drop_duplicates(subset=["event_id"])
            elif "latitude" in combined_df.columns and "longitude" in combined_df.columns:
                combined_df = combined_df.drop_duplicates(subset=["latitude", "longitude"])
        else:
            combined_df = pd.DataFrame()

        # If data is sparse, generate realistic synthetic benchmark data
        # adhering strictly to Gujarat industrial/agricultural/wildfire geography
        if len(combined_df) < min_samples and augment_if_needed:
            synthetic_df = self.create_synthetic_benchmark_dataset(
                num_samples=min_samples,
                seed_df=combined_df if len(combined_df) > 0 else None,
            )
            if len(combined_df) > 0:
                combined_df = pd.concat([combined_df, synthetic_df], ignore_index=True)
            else:
                combined_df = synthetic_df

        return combined_df

    def prepare_features(
        self,
        df: pd.DataFrame,
        require_ground_truth: bool = False,
    ) -> Tuple[pd.DataFrame, pd.Series]:
        """
        Extract the exact 33 numerical features, resolve missing values (0 NaNs),
        and return (X, y). Derived labels are available for benchmark tests only;
        production training must provide an explicit ground-truth threat_class.
        """
        data = df.copy()

        # 1. Parse temporal features if not directly available
        if "acquisition_hour" not in data.columns:
            if "acquisition_time" in data.columns:
                def _parse_hour(t):
                    try:
                        s = str(t).strip()
                        if ":" in s:
                            return int(s.split(":")[0])
                        return int(s.zfill(4)[:2])
                    except Exception:
                        return 0
                data["acquisition_hour"] = data["acquisition_time"].apply(_parse_hour)
            else:
                data["acquisition_hour"] = 12

        if "acquisition_month" not in data.columns:
            if "acquisition_date" in data.columns:
                def _parse_month(d):
                    try:
                        if isinstance(d, (date, datetime)):
                            return d.month
                        return datetime.strptime(str(d)[:10], "%Y-%m-%d").month
                    except Exception:
                        return 1
                data["acquisition_month"] = data["acquisition_date"].apply(_parse_month)
            else:
                data["acquisition_month"] = 1

        # 2. Require human/curated labels for production training.
        if require_ground_truth and "threat_class" not in data.columns:
            raise ValueError(
                "Production ML training requires an explicit 'threat_class' "
                "ground-truth column; rule-derived labels are benchmark-only."
            )

        # 3. Derive target labels only for benchmark/test datasets.
        if "threat_class" not in data.columns:
            data["threat_class"] = data.apply(derive_threat_class, axis=1)
        else:
            nan_mask = data["threat_class"].isna()
            if require_ground_truth and nan_mask.any():
                raise ValueError("Production ML training does not allow missing threat_class labels.")
            if nan_mask.any():
                data.loc[nan_mask, "threat_class"] = data[nan_mask].apply(derive_threat_class, axis=1)

        data["threat_class"] = data["threat_class"].fillna(0).astype(int)
        invalid_labels = ~data["threat_class"].isin(set(THREAT_CLASSES))
        if invalid_labels.any():
            raise ValueError("threat_class must contain only class IDs 0, 1, 2, or 3.")

        # 3. Ensure all 33 features are present and imputed
        distance_cols = {
            "nearest_road_distance_m",
            "nearest_building_distance_m",
            "nearest_settlement_distance_m",
            "nearest_industrial_distance_m",
            "nearest_water_distance_m",
        }

        for col in self.feature_columns:
            if col not in data.columns:
                if col in distance_cols:
                    data[col] = DEFAULT_MAX_DISTANCE_M
                else:
                    data[col] = 0.0
            else:
                # Handle NaNs
                if col in distance_cols:
                    data[col] = data[col].fillna(DEFAULT_MAX_DISTANCE_M)
                else:
                    data[col] = data[col].fillna(0.0)

        # Convert to float64
        X = data[self.feature_columns].astype(float)
        y = data["threat_class"].astype(int)

        # Invariant check: zero NaNs
        nan_count = int(X.isna().sum().sum())
        if nan_count > 0:
            raise ValueError(f"Feature matrix contains {nan_count} NaNs after imputation!")

        return X, y

    def train_test_split(
        self,
        X: pd.DataFrame,
        y: pd.Series,
        test_size: float = 0.20,
        stratify: bool = True,
    ) -> Tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series]:
        """
        Perform stratified 80/20 train/test split.
        """
        strat = y if stratify else None
        return train_test_split(
            X,
            y,
            test_size=test_size,
            random_state=self.random_state,
            stratify=strat,
        )

    def create_synthetic_benchmark_dataset(
        self,
        num_samples: int = 600,
        seed_df: Optional[pd.DataFrame] = None,
    ) -> pd.DataFrame:
        """
        Generates realistic, physically consistent fire threat hotspot records
        across the 4 target classes to complement sparse seed records.

        Classes:
        - 0: Controlled / Low Risk (bare land, urban clearing, low FRP, distant from hazards)
        - 1: Agricultural / Stubble Burning (cropland, moderate FRP, close to roads/fields)
        - 2: Wildfire / Vegetation Fuel Fire (forest, shrubland, high FRP, high fuel load)
        - 3: Critical Industrial Hazard (near refineries / chemical hubs, high vulnerability)
        """
        rng = np.random.RandomState(self.random_state)
        samples_per_class = num_samples // 4

        records: List[Dict[str, Any]] = []

        # Reference Gujarat coordinates center (Jamnagar / Surat / Bharuch / Vadodara)
        centers = [
            (22.47, 70.06),  # Jamnagar
            (21.17, 72.83),  # Surat
            (21.70, 72.99),  # Bharuch
            (22.30, 73.18),  # Vadodara
        ]

        for threat_cls in range(4):
            for i in range(samples_per_class):
                # Pick a random center and add geographic jitter
                base_lat, base_lon = centers[rng.choice(len(centers))]
                lat = base_lat + rng.uniform(-0.35, 0.35)
                lon = base_lon + rng.uniform(-0.35, 0.35)

                acq_hour = int(rng.choice([1, 2, 7, 8, 13, 14, 20, 21]))
                acq_month = int(rng.choice([1, 2, 3, 4, 10, 11, 12]))
                is_night = 1 if acq_hour in [1, 2, 20, 21] else 0

                scan = round(float(rng.uniform(0.32, 0.65)), 2)
                track = round(float(rng.uniform(0.32, 0.55)), 2)
                conf = round(float(rng.uniform(0.50, 1.0)), 2)

                if threat_cls == 0:
                    # Controlled / Low Risk Thermal Activity
                    frp = round(float(rng.uniform(0.2, 3.5)), 2)
                    brightness = round(float(rng.uniform(295.0, 315.0)), 2)
                    landcover_code = int(rng.choice([50, 60]))  # Built-up or Bare
                    is_cropland = 0
                    is_vegetation = 0
                    is_built_up = 1 if landcover_code == 50 else 0
                    is_water = 0
                    is_bare_land = 1 if landcover_code == 60 else 0

                    road_dist = round(float(rng.uniform(150.0, 3500.0)), 1)
                    road_count = int(rng.poisson(2))
                    is_road_adj = 1 if road_dist < 100.0 else 0

                    building_count = int(rng.choice([0, 1]))
                    building_dist = round(float(rng.uniform(600.0, 5000.0)), 1)
                    settlement_count = 0
                    settlement_dist = round(float(rng.uniform(1200.0, 5000.0)), 1)

                    industrial_count = 0
                    industrial_dist = round(float(rng.uniform(2500.0, 5000.0)), 1)
                    is_near_ind = 0

                    water_count = int(rng.choice([0, 1]))
                    water_dist = round(float(rng.uniform(800.0, 5000.0)), 1)

                elif threat_cls == 1:
                    # Agricultural / Stubble Burning (Cropland)
                    frp = round(float(rng.uniform(4.0, 30.0)), 2)
                    brightness = round(float(rng.uniform(315.0, 350.0)), 2)
                    landcover_code = 40  # Cropland
                    is_cropland = 1
                    is_vegetation = 0
                    is_built_up = 0
                    is_water = 0
                    is_bare_land = 0

                    road_dist = round(float(rng.uniform(20.0, 400.0)), 1)
                    road_count = int(rng.poisson(5))
                    is_road_adj = 1 if road_dist < 100.0 else 0

                    building_count = int(rng.poisson(1))
                    building_dist = round(float(rng.uniform(400.0, 4000.0)), 1)
                    settlement_count = int(rng.poisson(1))
                    settlement_dist = round(float(rng.uniform(500.0, 3500.0)), 1)

                    industrial_count = 0
                    industrial_dist = round(float(rng.uniform(1500.0, 5000.0)), 1)
                    is_near_ind = 0

                    water_count = int(rng.choice([0, 1, 2]))
                    water_dist = round(float(rng.uniform(400.0, 3000.0)), 1)

                elif threat_cls == 2:
                    # Wildfire / Vegetation Fuel Fire
                    frp = round(float(rng.uniform(12.0, 75.0)), 2)
                    brightness = round(float(rng.uniform(330.0, 380.0)), 2)
                    landcover_code = int(rng.choice([10, 20, 30, 90]))  # Tree, Shrub, Grass
                    is_cropland = 0
                    is_vegetation = 1
                    is_built_up = 0
                    is_water = 0
                    is_bare_land = 0

                    road_dist = round(float(rng.uniform(200.0, 4500.0)), 1)
                    road_count = int(rng.poisson(2))
                    is_road_adj = 1 if road_dist < 100.0 else 0

                    building_count = int(rng.choice([0, 1]))
                    building_dist = round(float(rng.uniform(1000.0, 5000.0)), 1)
                    settlement_count = int(rng.choice([0, 1]))
                    settlement_dist = round(float(rng.uniform(1000.0, 5000.0)), 1)

                    industrial_count = 0
                    industrial_dist = round(float(rng.uniform(2000.0, 5000.0)), 1)
                    is_near_ind = 0

                    water_count = int(rng.choice([0, 1]))
                    water_dist = round(float(rng.uniform(600.0, 4000.0)), 1)

                else:
                    # Critical Industrial Hazard Fire (Refineries / Chemical Zones)
                    frp = round(float(rng.uniform(3.0, 65.0)), 2)
                    brightness = round(float(rng.uniform(310.0, 375.0)), 2)
                    landcover_code = int(rng.choice([50, 60]))  # Built-up / Industrial
                    is_cropland = 0
                    is_vegetation = 0
                    is_built_up = 1
                    is_water = 0
                    is_bare_land = 0

                    road_dist = round(float(rng.uniform(10.0, 250.0)), 1)
                    road_count = int(rng.poisson(8))
                    is_road_adj = 1 if road_dist < 100.0 else 0

                    building_count = int(rng.poisson(6))
                    building_dist = round(float(rng.uniform(50.0, 600.0)), 1)
                    settlement_count = int(rng.poisson(2))
                    settlement_dist = round(float(rng.uniform(200.0, 1200.0)), 1)

                    industrial_count = int(rng.choice([1, 2, 3, 4]))
                    industrial_dist = round(float(rng.uniform(0.0, 450.0)), 1)
                    is_near_ind = 1

                    water_count = int(rng.choice([0, 1]))
                    water_dist = round(float(rng.uniform(400.0, 5000.0)), 1)

                record = {
                    "event_id": f"SYN_{THREAT_SHORT_NAMES[threat_cls].upper()}_{i+1:04d}",
                    "latitude": lat,
                    "longitude": lon,
                    "acquisition_hour": acq_hour,
                    "acquisition_month": acq_month,
                    "is_night": is_night,
                    "frp": frp,
                    "brightness": brightness,
                    "confidence_score": conf,
                    "scan": scan,
                    "track": track,
                    "landcover_code": landcover_code,
                    "is_cropland": is_cropland,
                    "is_vegetation": is_vegetation,
                    "is_built_up": is_built_up,
                    "is_water": is_water,
                    "is_bare_land": is_bare_land,
                    "nearest_road_distance_m": road_dist,
                    "nearby_road_count": road_count,
                    "is_road_adjacent": is_road_adj,
                    "building_count": building_count,
                    "nearest_building_distance_m": building_dist,
                    "has_nearby_buildings": 1 if building_count > 0 or building_dist <= 500 else 0,
                    "settlement_count": settlement_count,
                    "nearest_settlement_distance_m": settlement_dist,
                    "is_near_settlement": 1 if settlement_count > 0 or settlement_dist <= 500 else 0,
                    "industrial_count": industrial_count,
                    "nearest_industrial_distance_m": industrial_dist,
                    "is_near_industrial": is_near_ind,
                    "water_body_count": water_count,
                    "nearest_water_distance_m": water_dist,
                    "has_nearby_water": 1 if water_count > 0 or water_dist <= 500 else 0,
                    "poi_count": int(rng.poisson(15 if threat_cls == 3 else 3)),
                    "landuse_count": int(rng.poisson(25 if threat_cls == 3 else 5)),
                    "threat_class": threat_cls,
                }
                records.append(record)

        # Introduce realistic satellite mixed-pixel boundaries and thermal sensor noise
        for r in records:
            # 1. Mixed pixel landcover on boundaries (e.g. cropland bordering shrub/tree line)
            if r["is_cropland"] == 1 and rng.rand() < 0.10:
                r["is_vegetation"] = 1
            elif r["is_vegetation"] == 1 and rng.rand() < 0.08:
                r["is_cropland"] = 1

            # 2. VIIRS sensor thermal measurement jitter
            r["frp"] = max(0.1, round(r["frp"] * float(rng.normal(1.0, 0.04)), 2))
            r["brightness"] = round(r["brightness"] * float(rng.normal(1.0, 0.01)), 2)

        # 3. Realistic edge-case label ambiguity on ~4% of borderline samples
        # (e.g. low-intensity cropland burns vs domestic clearing, buffer-zone fires)
        noisy_count = max(1, int(0.04 * len(records)))
        noise_indices = rng.choice(len(records), size=noisy_count, replace=False)
        for idx in noise_indices:
            curr_c = records[idx]["threat_class"]
            if curr_c == 0:
                records[idx]["threat_class"] = 1
            elif curr_c == 1:
                records[idx]["threat_class"] = 0 if rng.rand() < 0.5 else 2
            elif curr_c == 2:
                records[idx]["threat_class"] = 1
            elif curr_c == 3:
                records[idx]["threat_class"] = 0

        df = pd.DataFrame(records)
        return df

    def get_dataset_summary(
        self,
        X: pd.DataFrame,
        y: pd.Series,
    ) -> Dict[str, Any]:
        """
        Generate statistical summary of dataset dimensions and class distributions.
        """
        counts = y.value_counts().to_dict()
        total = len(y)
        distribution = {}
        for cls_id, count in sorted(counts.items()):
            distribution[cls_id] = {
                "name": THREAT_CLASSES.get(cls_id, f"Class {cls_id}"),
                "short_name": THREAT_SHORT_NAMES.get(cls_id, f"class_{cls_id}"),
                "count": int(count),
                "percentage": round(float(count) / total * 100.0, 2),
            }

        return {
            "total_samples": total,
            "feature_count": X.shape[1],
            "feature_names": list(X.columns),
            "class_distribution": distribution,
        }
