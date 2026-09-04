"""Tests for historical FRP anomaly scoring and hotspot clustering."""

import pandas as pd

from backend.app.anomaly import AnomalyDetector


def test_rule_based_score_flags_high_hazard_hotspot():
    hotspots = pd.DataFrame([{
        "frp": 45.0,
        "brightness": 365.0,
        "confidence_score": 0.95,
        "is_night": 1,
        "is_vegetation": 0,
        "is_cropland": 0,
        "is_near_industrial": 1,
        "nearest_industrial_distance_m": 120.0,
        "industrial_count": 3,
        "building_count": 8,
        "nearest_building_distance_m": 180.0,
        "settlement_count": 2,
        "nearest_settlement_distance_m": 100.0,
    }])

    result = AnomalyDetector().score_rule_based(hotspots)

    assert bool(result.loc[0, "is_anomaly"])
    assert result.loc[0, "anomaly_score"] >= 0.70
    assert "industrial" in result.loc[0, "anomaly_reasons"].lower()


def test_baseline_flags_large_frp_deviation():
    history = pd.DataFrame({
        "facility_id": ["A"] * 5,
        "frp": [9.0, 10.0, 11.0, 10.0, 10.0],
    })
    current = pd.DataFrame({"facility_id": ["A"], "frp": [86.0]})

    result = AnomalyDetector(z_threshold=3.0).score(current, history)

    assert result.loc[0, "history_count"] == 5
    assert result.loc[0, "frp_z_score"] > 3.0
    assert bool(result.loc[0, "is_anomaly"])
    assert result.loc[0, "anomaly_score"] == 1.0


def test_unknown_group_uses_global_baseline_without_anomaly_flag():
    history = pd.DataFrame({
        "facility_id": ["A", "A", "A"],
        "frp": [10.0, 11.0, 9.0],
    })
    current = pd.DataFrame({"facility_id": ["B"], "frp": [100.0]})

    result = AnomalyDetector().score(current, history)

    assert result.loc[0, "history_count"] == 0
    assert not bool(result.loc[0, "is_anomaly"])


def test_cluster_hotspots_assigns_cluster_ids():
    hotspots = pd.DataFrame({
        "latitude": [22.4700, 22.4710, 22.8000],
        "longitude": [70.0600, 70.0610, 70.4000],
    })

    result = AnomalyDetector(cluster_eps_km=2.0, min_cluster_size=2).cluster_hotspots(hotspots)

    assert result.loc[0, "cluster_id"] >= 0
    assert result.loc[0, "cluster_id"] == result.loc[1, "cluster_id"]
    assert result.loc[2, "cluster_id"] == -1
