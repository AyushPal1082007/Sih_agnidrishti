"""Focused tests for the incident agent pipeline."""

from backend.app.agents import IncidentPipeline


def test_critical_record_is_validated_for_dispatch():
    result = IncidentPipeline().process_record({
        "event_id": "FIRE-1",
        "frp": 45.0,
        "confidence_score": 0.95,
        "is_night": 1,
        "is_near_industrial": 1,
        "nearest_industrial_distance_m": 120.0,
        "industrial_count": 3,
        "building_count": 8,
        "nearest_building_distance_m": 180.0,
        "settlement_count": 2,
        "nearest_settlement_distance_m": 100.0,
    })

    assert result["status"] == "VALIDATED"
    assert result["dispatch_required"] is True
    assert result["risk_score"] >= 70.0


def test_low_confidence_record_is_suppressed():
    result = IncidentPipeline().process_record({
        "event_id": "FIRE-2",
        "frp": 1.0,
        "confidence_score": 0.1,
    })

    assert result["status"] == "SUPPRESSED"
    assert result["dispatch_required"] is False
