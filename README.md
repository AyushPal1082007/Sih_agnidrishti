# 🔥 AI-Based Detection and Classification of Industrial Fires & Persistent Thermal Sources

### SIH26162

> **An AI-powered geospatial decision-support system for detecting, classifying, verifying, and prioritizing abnormal thermal activity using satellite observations and multi-source geographic intelligence.**

---

## 📌 1. Project Overview

Satellite systems such as **NASA FIRMS** can detect thermal anomalies on the Earth's surface.

However, detecting a hotspot does **not** automatically tell us what the hotspot represents.

A thermal anomaly may be:

* 🔥 Wildfire
* 🌾 Agricultural burning
* 🏭 Industrial fire
* 🔥 Gas flare
* 🏭 Routine industrial thermal activity
* ⛏️ Mining-related thermal activity
* ❌ False positive / sensor artifact

The central problem is therefore not simply:

> **"Where is something hot?"**

but:

> **"What is causing the thermal anomaly, is it behaving abnormally, can the detection be trusted, and how dangerous is it?"**

This project combines satellite thermal observations with geographic, temporal, industrial, environmental, and population data to answer these questions.

---

# 🎯 2. Problem Statement

NASA FIRMS provides active-fire / thermal-anomaly observations, but raw hotspot observations do not provide sufficient contextual information for reliable decision-making.

For example:

```text
Satellite detects:

Latitude  : 22.57
Longitude : 70.21
FRP       : 82 MW
```

This alone does not tell us whether the hotspot is:

```text
Gas flare?
Industrial furnace?
Industrial accident?
Crop burning?
Wildfire?
Mining activity?
False positive?
```

The proposed system addresses this gap through:

```text
Satellite Detection
        ↓
Geospatial Context
        ↓
Temporal Analysis
        ↓
ML Classification
        ↓
Anomaly Detection
        ↓
Adversarial Verification
        ↓
Risk Assessment
        ↓
Tiered Alert
```

---

# 💡 3. Core Idea

The system follows a simple decision-making philosophy:

| Question                                   | System Component  |
| ------------------------------------------ | ----------------- |
| **Where is the hotspot?**                  | NASA FIRMS        |
| **What is around it?**                     | OSM / Land Cover  |
| **What type of thermal source is it?**     | ML Classifier     |
| **Is its behaviour normal?**               | Anomaly Detection |
| **Can the alert be disproved?**            | Skeptic Agent     |
| **How dangerous is it?**                   | Risk Engine       |
| **Who should be notified?**                | Dispatcher Agent  |
| **Why was the alert generated?**           | Explainability    |
| **Where can the operator see everything?** | GIS Dashboard     |

---

# 🏗️ 4. High-Level Architecture

```text
                        ┌──────────────────────────┐
                        │      DATA SOURCES        │
                        └────────────┬─────────────┘
                                     │
             ┌───────────────────────┼───────────────────────┐
             │                       │                       │
             ▼                       ▼                       ▼
       NASA FIRMS              VIIRS Nightfire              OSM
       Thermal Data             Flare Data             Industrial GIS
             │                       │                       │
             └───────────────────────┼───────────────────────┘
                                     │
                       ┌─────────────▼─────────────┐
                       │    CONTEXT DATA SOURCES   │
                       │                           │
                       │ WorldCover / Dynamic World│
                       │ WorldPop                  │
                       │ Power Plant Database      │
                       └─────────────┬─────────────┘
                                     │
                                     ▼
                       ┌───────────────────────────┐
                       │     DATA ACQUISITION      │
                       │       & INGESTION         │
                       └─────────────┬─────────────┘
                                     │
                                     ▼
                       ┌───────────────────────────┐
                       │ VALIDATION & NORMALIZATION│
                       └─────────────┬─────────────┘
                                     │
                                     ▼
                       ┌───────────────────────────┐
                       │   POSTGRESQL + POSTGIS    │
                       └─────────────┬─────────────┘
                                     │
                                     ▼
                       ┌───────────────────────────┐
                       │    FEATURE ENGINEERING    │
                       │                           │
                       │ Spatial                   │
                       │ Temporal                  │
                       │ Thermal                   │
                       │ Contextual                │
                       └─────────────┬─────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │                                 │
                    ▼                                 ▼
          ┌────────────────────┐          ┌────────────────────┐
          │ ML CLASSIFICATION  │          │ ANOMALY DETECTION  │
          │                    │          │                    │
          │ XGBoost/LightGBM   │          │ Historical baseline│
          └─────────┬──────────┘          │ FRP Z-score        │
                    │                     │ Trend / persistence│
                    │                     └─────────┬──────────┘
                    └────────────────┬─────────────┘
                                     ▼
                         ┌────────────────────────┐
                         │   AGENT 1: DETECTOR    │
                         │ High-recall detection  │
                         └────────────┬───────────┘
                                      ▼
                         ┌────────────────────────┐
                         │   AGENT 2: SKEPTIC     │
                         │ False-positive checks  │
                         └────────────┬───────────┘
                                      │
                            ┌─────────┴─────────┐
                            │                   │
                         DEBUNKED            VALIDATED
                            │                   │
                            ▼                   ▼
                         SUPPRESS       ┌───────────────┐
                                        │ AGENT 3:      │
                                        │ DISPATCHER    │
                                        └───────┬───────┘
                                                ▼
                                      ┌──────────────────┐
                                      │   RISK ENGINE    │
                                      │     0 - 100      │
                                      └────────┬─────────┘
                                               ▼
                                      ┌──────────────────┐
                                      │  ALERT ENGINE    │
                                      └────────┬─────────┘
                                               ▼
                                      ┌──────────────────┐
                                      │   GIS DASHBOARD  │
                                      └──────────────────┘
```

The proposed architecture follows the project's ingestion → feature engineering → classification/anomaly → multi-agent → API → GIS dashboard pipeline.

---

# 📦 5. Data Sources

The project uses multiple complementary sources.

## 5.1 NASA FIRMS

### Purpose

Primary source for satellite thermal anomalies.

### Provides

* Latitude
* Longitude
* Acquisition date/time
* Brightness temperature
* Fire Radiative Power (FRP)
* Confidence
* Satellite / sensor information

VIIRS observations provide approximately 375 m spatial resolution, while MODIS observations are approximately 1 km.

### Role

```text
NASA FIRMS
    ↓
"Something thermally anomalous was detected here."
```

---

## 5.2 VIIRS Nightfire

### Purpose

Identify and analyse persistent nighttime thermal sources and gas flares.

Relevant information includes:

* Temperature
* Radiant heat
* Estimated flare-related information
* Persistence

It is particularly useful for distinguishing routine gas flaring from other industrial thermal activity.

---

## 5.3 OpenStreetMap

### Purpose

Provide geographic context around a hotspot.

Potential objects include:

* Refineries
* Chemical plants
* Industrial areas
* Power plants
* Mines
* Quarries
* Fuel facilities
* Residential areas

OSM industrial and facility information is important because the same thermal signal has different meanings depending on its surroundings.

---

## 5.4 Land Cover

Potential sources:

* ESA WorldCover
* Dynamic World

### Purpose

Determine whether the hotspot lies in:

```text
Forest
Cropland
Built-up area
Bare land
Water
Industrial area
...
```

This helps distinguish wildfire, agricultural burning, and industrial activity.

---

## 5.5 Global Power Plant Database

Used as an additional facility/context source and as a cross-check when OSM information is incomplete.

---

## 5.6 WorldPop

Provides population-density information around detected incidents.

This is primarily used later by the risk engine to estimate potential human exposure.

---

# 🔌 6. APIs vs Datasets

Not every source needs to be a live API.

### Core live interfaces

```text
NASA FIRMS API
OpenStreetMap / Overpass API
```

### Cached / downloaded data

```text
VIIRS Nightfire
WorldCover / Dynamic World
WorldPop
Global Power Plant Database
```

For the hackathon, the recommended strategy is:

```text
LIVE DATA
+
PRE-DOWNLOADED / CACHED DATA
```

This prevents the entire demo from failing if an external service becomes temporarily unavailable.

The project specification also recommends pre-downloading/caching data for the demo region.

---

# 🔄 7. Complete System Workflow

## Step 1 — Satellite Detection

NASA FIRMS provides a thermal observation.

```text
Hotspot
  ↓
Latitude
Longitude
Time
FRP
Temperature
Confidence
```

---

## Step 2 — Data Enrichment

The hotspot is enriched with:

```text
OSM
+
Nightfire
+
Land Cover
+
Power Plants
+
Population
```

Example:

```text
Hotspot
│
├── 180 m from refinery
├── Industrial land cover
├── Nightfire match
├── Population density = ...
└── Historical observations = ...
```

---

## Step 3 — Feature Engineering

Raw data is converted into ML-ready features.

### Thermal

```text
FRP
Brightness Temperature
Temperature
Confidence
```

### Spatial

```text
Distance to industrial facility
Distance to residential area
Inside industrial polygon?
Land-cover type
Distance to flare location
```

### Temporal

```text
Persistence
Detection frequency
FRP mean
FRP standard deviation
FRP trend
Historical baseline
FRP Z-score
```

The proposed feature set includes spatial, temporal, thermal and contextual variables.

---

# 🤖 8. ML Classification

The classifier determines the probable source type.

## Seven target classes

```text
1. Gas Flare
2. Industrial Thermal Source
3. Industrial Fire
4. Agricultural Burning
5. Wildfire
6. Mining Thermal Activity
7. False Positive
```

This seven-class taxonomy is the project's proposed classification framework.

---

# 🏷️ 9. Training Data Strategy

A major challenge is that a ready-made dataset with all seven classes and reliable labels is not available.

Therefore, the system uses **weak supervision / rule-based bootstrapping** to generate initial labels.

Example:

### Gas Flare

```text
Nightfire match
+
High persistence
+
Stable thermal behaviour
```

→ likely Gas Flare

### Wildfire

```text
Forest
+
Spreading hotspot cluster
+
No nearby industrial facility
```

→ likely Wildfire

### Agricultural Burning

```text
Cropland
+
Seasonal burning period
+
Short persistence
```

→ likely Agricultural Burning

### Routine Industrial Source

```text
Industrial polygon
+
Long persistence
+
Stable FRP
```

→ likely Routine Industrial Thermal Source

These rules create an initial training dataset.

---

# 🧠 10. Classification Model

Recommended models:

```text
LightGBM
or
XGBoost
```

The reason is that most input variables are structured/tabular rather than raw images, and the labels are expected to contain noise because they originate partly from weak supervision.

### Example output

```text
Gas Flare             0.08
Industrial Thermal    0.05
Industrial Fire       0.81
Agricultural Burning  0.02
Wildfire              0.01
Mining                0.02
False Positive        0.01
```

Final prediction:

```text
Industrial Fire
Confidence: 81%
```

---

# 🚨 11. Anomaly Detection

Classification alone is not enough.

Suppose a refinery normally produces:

```text
8 MW
10 MW
11 MW
9 MW
12 MW
10 MW
```

and suddenly:

```text
86 MW
```

The system should determine that the behaviour is abnormal.

---

## Facility-Level Baseline

For each facility:

```text
Historical observations
        ↓
Calculate baseline
        ↓
Compare current observation
        ↓
Calculate deviation
```

### Example

```text
Historical mean = 11 MW
Historical std  = 5 MW
Current FRP     = 76 MW

Z-score = (76 - 11) / 5
        = 13
```

The exact implementation can use rolling baselines and robust statistical methods.

The project specification proposes per-facility baselines, rolling statistics and FRP deviation analysis.

---

# 🤝 12. Multi-Agent Verification

The project uses three conceptual agents.

```text
Detector
   ↓
Skeptic
   ↓
Dispatcher
```

---

## Agent 1 — Detector

### Objective

High-recall detection.

It should flag potentially important events rather than prematurely suppressing them.

```text
Satellite Observation
       ↓
Potential anomaly?
       ↓
YES → Flag
```

---

## Agent 2 — Skeptic

### Objective

Challenge the detection.

It asks:

```text
Is this a known gas flare?

Is this a routine industrial source?

Is the hotspot historically normal?

Is there an industrial facility here?

Could this be a sensor / environmental artifact?

Is the current FRP significantly above baseline?
```

If evidence strongly indicates normal behaviour:

```text
FALSE / ROUTINE
       ↓
SUPPRESS ALERT
```

If the anomaly survives the checks:

```text
VALIDATED
       ↓
Agent 3
```

The project specification explicitly defines spatial, temporal, historical-baseline and environmental checks for the Skeptic layer.

---

# 📊 13. Agent 3 — Dispatcher

The Dispatcher determines:

> **What should happen next?**

It combines:

```text
Classification
+
Anomaly Score
+
Population
+
Hazardous Infrastructure
+
Residential Proximity
+
Wind / Environmental Context
+
Confidence
```

and produces a structured incident record.

---

# ⚠️ 14. Risk Engine

Risk is represented as a score:

```text
0 ─────────────────────────────── 100
LOW      MODERATE      HIGH      CRITICAL
```

Suggested levels:

```text
0–25     LOW
26–50    MODERATE
51–75    HIGH
76–100   CRITICAL
```

Potential factors:

```text
Fire intensity
FRP deviation
Persistence
Hazard proximity
Population exposure
Wind direction
Classification confidence
```

The proposed system uses a 0–100 severity scale and four severity categories.

---

# 📢 15. Alert System

The alert system should not treat every hotspot equally.

## Tier 1 — Facility

Used for localized facility-level events.

## Tier 2 — District

Used when the incident presents broader local risk.

## Tier 3 — State / Public

Used for significant incidents requiring wider awareness.

## Tier 4 — National

Reserved for severe and sustained incidents.

Escalation should depend on continued severity rather than a single detection.

---

# 🗺️ 16. GIS Dashboard

The main interface is a GIS-based command center.

### Main screen

```text
┌─────────────────────────────────────────────────────────────┐
│ 🔥 THERMAL INTELLIGENCE COMMAND CENTER                     │
├────────────────────────┬────────────────────────────────────┤
│ FILTERS                │                                    │
│                        │              INDIA MAP             │
│ ☑ Wildfire             │                                    │
│ ☑ Industrial Fire      │       🔴 Critical                  │
│ ☑ Gas Flare            │       🟠 High                      │
│ ☑ Mining               │       🟡 Moderate                  │
│                        │       🟢 Normal                    │
│ Risk Filter            │                                    │
│ 0 ─────────────── 100  │                                    │
├────────────────────────┴────────────────────────────────────┤
│ ALERT FEED                                                  │
│ 🔴 Industrial anomaly — Risk 91                             │
│ 🟠 Mining anomaly — Risk 68                                 │
│ 🟢 Routine flare — Risk 12                                  │
└─────────────────────────────────────────────────────────────┘
```

---

# 🔍 17. Facility Drill-Down

Clicking a facility should open detailed information.

```text
FACILITY: Example Refinery

Classification:
Industrial Fire

Confidence:
91%

Current FRP:
76 MW

Historical Baseline:
11 MW

Deviation:
High

Persistence:
2 days

Risk:
89 / 100

Nearby:
Chemical Storage
Residential Area

WHY THIS ALERT?

✓ FRP significantly above historical baseline
✓ New abnormal persistence
✓ Located inside industrial boundary
✓ High-risk infrastructure nearby
```

Explainability is important because the operator should understand **why** the system generated an alert rather than receiving an unexplained AI prediction.

---

# 🧩 18. Major Modules

## Module 1 — Data Acquisition

Collect:

```text
FIRMS
Nightfire
OSM
Land Cover
WorldPop
Power Plants
```

Output:

```text
Clean standardized observations
```

---

## Module 2 — Data Processing & Feature Engineering

Convert raw observations into:

```text
Spatial features
Temporal features
Thermal features
Contextual features
```

---

## Module 3 — ML Classification

Input:

```text
Engineered features
```

Output:

```text
Source class
+
Probability
```

---

## Module 4 — Anomaly Detection

Input:

```text
Current observation
+
Historical facility behaviour
```

Output:

```text
Normal / Abnormal
+
Anomaly score
```

---

## Module 5 — Multi-Agent Verification

```text
Detector
   ↓
Skeptic
   ↓
Dispatcher
```

---

## Module 6 — Risk & Alert Engine

Output:

```text
Risk score
Severity
Alert tier
Recommended action
```

---

## Module 7 — GIS Dashboard

Displays:

```text
Hotspots
Facilities
Risk
Alerts
Historical trends
Classification
Explanations
```

---

# 🗄️ 19. Database Design

Recommended database:

```text
PostgreSQL
+
PostGIS
```

---

## `thermal_observations`

```text
id
source
sensor
latitude
longitude
timestamp
frp
brightness_temperature
confidence
day_night
geometry
ingested_at
```

---

## `industrial_facilities`

```text
facility_id
name
type
source
geometry
latitude
longitude
hazard_level
```

---

## `nightfire_observations`

```text
id
latitude
longitude
timestamp
temperature
radiant_heat
flare_volume
persistence
geometry
```

---

## `features`

```text
hotspot_id
industrial_distance
residential_distance
facility_id
land_cover
persistence
frp_mean
frp_std
frp_zscore
frp_trend
night_ratio
cluster_id
```

---

## `predictions`

```text
hotspot_id
predicted_class
confidence
model_version
created_at
```

---

## `anomalies`

```text
hotspot_id
baseline_frp
current_frp
deviation
anomaly_score
status
```

---

## `alerts`

```text
alert_id
hotspot_id
risk_score
severity
tier
status
created_at
updated_at
```

---

# 🔌 20. Backend Architecture

Recommended backend:

```text
FastAPI
```

Suggested endpoints:

```text
GET  /hotspots
GET  /hotspots/{id}

GET  /facilities
GET  /facilities/{id}

POST /classify
GET  /predictions/{id}

GET  /anomalies
GET  /anomalies/{id}

GET  /risk/{id}

GET  /alerts
GET  /alerts/{id}

GET  /health
```

---

# 🖥️ 21. Frontend Architecture

Recommended:

```text
React
```

Possible libraries:

```text
Leaflet / Mapbox
deck.gl
Recharts
```

Main pages:

```text
Dashboard
│
├── Live Map
├── Alerts
├── Hotspot Details
├── Facility Details
├── Historical Analysis
├── Risk Analysis
└── System Status
```

---

# 🧠 22. Explainability

The system should not only output:

```text
Industrial Fire — 91%
```

It should also show:

```text
WHY?

• FRP is 6.9σ above baseline
• Hotspot lies within industrial boundary
• Persistent for 2 days
• Not matched with known routine flare
• High-risk facility nearby
```

Possible implementation:

```text
SHAP
+
Rule-based explanation
```

---

# 💾 23. Caching Strategy

External services should not become a single point of failure.

```text
                 External Source
                       ↓
                  Data Collector
                       ↓
                 Local Cache
                       ↓
                  PostgreSQL
                       ↓
                   Pipeline
```

If an API fails:

```text
API unavailable
      ↓
Retry
      ↓
Still unavailable?
      ↓
Use cached data
      ↓
Continue processing
```

This is particularly important during the hackathon demonstration.

---

# ⏱️ 24. Data Scheduling

Recommended orchestration:

```text
APScheduler / Cron
```

Example:

```text
FIRMS
→ periodic ingestion

Nightfire
→ periodic / catalogue update

OSM
→ daily or cached

WorldCover
→ cached

WorldPop
→ cached

Power Plant Database
→ cached / periodic update
```

The proposed stack identifies APScheduler as a suitable lightweight scheduling option.

---

# 🧪 25. Example End-to-End Incident

Consider:

```text
Location:
Industrial region

Current FRP:
82 MW

Historical FRP:
10 MW
```

### Stage 1

FIRMS detects hotspot.

```text
DETECTED
```

### Stage 2

OSM:

```text
Refinery nearby
Industrial polygon = YES
```

### Stage 3

Nightfire:

```text
Known flare match = NO
```

### Stage 4

Historical analysis:

```text
Normal FRP ≈ 10 MW
Current FRP = 82 MW

Large deviation
```

### Stage 5

Classifier:

```text
Industrial Fire = 91%
```

### Stage 6

Skeptic:

```text
Routine flare?
NO

Historical normal?
NO

Environmental artifact?
Low probability

Industrial fire?
VALIDATED
```

### Stage 7

Dispatcher:

```text
Hazardous infrastructure nearby
+
Population exposure
+
High thermal intensity
```

### Stage 8

Risk:

```text
89 / 100
CRITICAL
```

### Stage 9

Alert:

```text
TIER 2 / TIER 3
```

### Stage 10

Dashboard:

```text
🔴 CRITICAL INDUSTRIAL FIRE
```

---

# 🎬 26. Recommended SIH Demonstration

Do not attempt to demonstrate the entire world.

Use **one industrially significant region** and demonstrate the complete pipeline deeply.

Potential regions include:

```text
Gujarat
    ├── Jamnagar
    └── Vadodara

Odisha
    ├── Angul
    └── Jharsuguda

Visakhapatnam region
```

The project specification recommends choosing a high-industrial-density region for a deep demonstration rather than attempting shallow global coverage.

---

# 🎥 27. Ideal Demo Story

### Scene 1 — Normal activity

Show several routine hotspots.

```text
🟢 Normal
🟢 Normal
🟢 Normal
```

---

### Scene 2 — New hotspot

A new high-FRP observation appears.

```text
🟠 Potential anomaly
```

---

### Scene 3 — ML Classification

```text
Industrial Fire
Confidence: 91%
```

---

### Scene 4 — Anomaly Detection

```text
Historical baseline: 10 MW
Current FRP: 82 MW

ANOMALY DETECTED
```

---

### Scene 5 — Skeptic

Show the system challenging the alert:

```text
Known flare?
NO

Routine historical behaviour?
NO

Industrial location?
YES

Significant FRP deviation?
YES

VERDICT:
VALIDATED
```

---

### Scene 6 — Risk

```text
Population exposure
+
Hazard proximity
+
Thermal intensity
+
Wind
=
89 / 100
```

---

### Scene 7 — Final Alert

```text
🚨 CRITICAL INDUSTRIAL FIRE

Risk: 89/100
Confidence: 91%
Tier: 3

WHY:
FRP significantly above baseline
+
Industrial location
+
No routine flare match
```

---

# 👥 28. Team Structure

For a six-member team:

| Member                | Responsibility                                                  |
| --------------------- | --------------------------------------------------------------- |
| ML Engineer 1         | FIRMS ingestion + feature engineering + classification          |
| ML Engineer 2         | Anomaly detection + clustering + temporal analysis              |
| Full Stack 1          | GIS map + visualization                                         |
| Full Stack 2          | Dashboard + alerts + UI                                         |
| Backend / Integration | FastAPI + PostgreSQL/PostGIS + integration                      |
| Research / Product    | Dataset preparation + validation + documentation + presentation |

The project specification proposes a six-member division around ML, GIS/full-stack, integration and research/product responsibilities.

---

# 📁 29. Recommended Repository Structure

```text
SIH26162/
│
├── README.md
├── LICENSE
├── .gitignore
├── docker-compose.yml
├── .env.example
│
├── backend/
│   │
│   ├── app/
│   │   ├── main.py
│   │   │
│   │   ├── api/
│   │   │   ├── hotspots.py
│   │   │   ├── facilities.py
│   │   │   ├── predictions.py
│   │   │   ├── anomalies.py
│   │   │   └── alerts.py
│   │   │
│   │   ├── ingestion/
│   │   │   ├── firms/
│   │   │   ├── nightfire/
│   │   │   ├── osm/
│   │   │   ├── landcover/
│   │   │   ├── worldpop/
│   │   │   └── powerplants/
│   │   │
│   │   ├── features/
│   │   │   ├── spatial.py
│   │   │   ├── temporal.py
│   │   │   └── thermal.py
│   │   │
│   │   ├── ml/
│   │   │   ├── classifier.py
│   │   │   ├── anomaly.py
│   │   │   └── model_loader.py
│   │   │
│   │   ├── agents/
│   │   │   ├── detector.py
│   │   │   ├── skeptic.py
│   │   │   └── dispatcher.py
│   │   │
│   │   ├── risk/
│   │   │   └── risk_engine.py
│   │   │
│   │   ├── database/
│   │   │   ├── models.py
│   │   │   ├── connection.py
│   │   │   └── repositories.py
│   │   │
│   │   └── scheduler/
│   │       └── jobs.py
│   │
│   ├── models/
│   ├── notebooks/
│   ├── tests/
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── map/
│   │   ├── services/
│   │   └── utils/
│   └── package.json
│
├── data/
│   ├── raw/
│   ├── processed/
│   └── cache/
│
├── models/
│   ├── classifier/
│   └── anomaly/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   └── diagrams/
│
└── scripts/
    ├── ingest_firms.py
    ├── ingest_osm.py
    └── build_features.py
```

---

# 🔐 30. Environment Variables

Create:

```text
.env
```

Example:

```env
FIRMS_API_KEY=your_key

DATABASE_URL=postgresql://user:password@localhost:5432/sih26162

OSM_ENDPOINT=your_endpoint

MODEL_PATH=models/

CACHE_DIR=data/cache/
```

Never commit real API keys.

Commit only:

```text
.env.example
```

---

# 🚀 31. Local Setup

## Clone repository

```bash
git clone <repository-url>
cd SIH26162
```

## Backend environment

```bash
python -m venv venv
```

Activate:

### Windows

```bash
venv\Scripts\activate
```

### Linux / macOS

```bash
source venv/bin/activate
```

Install dependencies:

```bash
pip install -r backend/requirements.txt
```

Generate the complete FIRMS-backed unified dataset quickly when spatial lookups
are not required:

```bash
python -m backend.app.dataset.run_dataset --all --fast
```

The fast output is suitable for pipeline and schema testing only. It skips OSM
and LandCover enrichment and must not be used for production ML training.

When historical facility observations are unavailable, the anomaly module uses
the explainable risk rules as a rule-based anomaly score. This is suitable for
initial alerts, but should be replaced or calibrated with historical baselines
when repeated observations become available.

---

# 🐘 32. Database

Start PostgreSQL + PostGIS.

Using Docker:

```bash
docker compose up -d postgres
```

Then configure:

```env
DATABASE_URL=postgresql://...
```

Run migrations / initialization:

```bash
python scripts/init_db.py
```

---

# ▶️ 33. Start Backend

```bash
uvicorn backend.app.main:app --reload
```

Backend should expose:

```text
http://localhost:8000
```

API documentation:

```text
/docs
```

---

# ▶️ 34. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

---

# 🔄 35. Running the Complete Pipeline

The intended flow is:

```text
1. Ingest satellite data
        ↓
2. Ingest contextual data
        ↓
3. Validate / normalize
        ↓
4. Store in PostGIS
        ↓
5. Generate features
        ↓
6. Run classifier
        ↓
7. Run anomaly detector
        ↓
8. Run Detector Agent
        ↓
9. Run Skeptic Agent
        ↓
10. Run Dispatcher Agent
        ↓
11. Calculate risk
        ↓
12. Generate alert
        ↓
13. Display on GIS dashboard
```

---

# 🧪 36. Testing Strategy

Testing should cover each layer independently.

## Data ingestion

```text
✓ API response parsing
✓ Invalid coordinates
✓ Missing FRP
✓ Invalid timestamp
✓ Duplicate records
```

## Feature engineering

```text
✓ Distance calculations
✓ Persistence
✓ FRP baseline
✓ Z-score
```

## ML

```text
✓ Classification output
✓ Probability range
✓ Model loading
```

## Anomaly detection

```text
✓ Normal activity
✓ Sudden FRP spike
✓ Persistent anomaly
```

## Agents

```text
✓ Detector flags anomaly
✓ Skeptic suppresses routine flare
✓ Skeptic validates abnormal event
✓ Dispatcher generates risk
```

## API

```text
✓ Endpoint availability
✓ Correct response schema
✓ Error handling
```

---

# 📈 37. Evaluation Metrics

## Classification

```text
Accuracy
Precision
Recall
F1-score
Confusion Matrix
```

Because missing a true industrial fire can be more serious than producing a few extra candidates, recall is especially important for the detection stage.

---

## Anomaly Detection

Evaluate:

```text
True anomalies detected
False alarms
Detection latency
Persistence detection
```

---

## Alert System

Measure:

```text
False-alert reduction
Alert confidence
Risk-ranking quality
Time from detection → alert
```

---

# 🛡️ 38. Reliability Principles

The system should follow these rules:

### Rule 1

Never depend on one external API.

### Rule 2

Always keep cached data for the demo.

### Rule 3

Keep raw and processed data separate.

### Rule 4

Every prediction should have an explanation.

### Rule 5

The LLM should not directly decide whether a satellite event is real.

The structured ML/rule-based pipeline should make the core decision.

### Rule 6

LLM should be used mainly for:

```text
Explanation
Report generation
Natural-language summaries
```

---

# 🤖 39. Role of LLM

LLM is **not the primary fire detector**.

Correct architecture:

```text
Satellite Data
     ↓
ML / Statistical Analysis
     ↓
Structured Incident JSON
     ↓
LLM
     ↓
Human-readable report
```

Example structured output:

```json
{
  "classification": "Industrial Fire",
  "confidence": 0.91,
  "anomaly_score": 0.94,
  "risk_score": 89,
  "severity": "CRITICAL",
  "reasons": [
    "FRP significantly above baseline",
    "Industrial facility nearby",
    "No routine flare match"
  ]
}
```

The LLM converts this into a readable incident report.

---

# 🧠 40. Why This Is More Than a Fire Map

A conventional system:

```text
Satellite
   ↓
Hotspot
   ↓
Map
```

Our system:

```text
Satellite
   ↓
Hotspot
   ↓
Context
   ↓
Classification
   ↓
Historical Behaviour
   ↓
Anomaly Detection
   ↓
Adversarial Verification
   ↓
Risk
   ↓
Alert
   ↓
Explainable Decision
```

This distinction is the core value proposition.

The project specification specifically positions the combination of **source classification + persistent-source analysis + adversarial verification + explainability** as the differentiation layer.

---

# 🏆 41. MVP — What Must Actually Work

For the first working version, prioritize:

```text
☐ NASA FIRMS ingestion
☐ OSM industrial data
☐ Data normalization
☐ PostgreSQL/PostGIS
☐ Spatial features
☐ Temporal features
☐ Weak-supervision labels
☐ XGBoost / LightGBM classifier
☐ Historical FRP baseline
☐ Anomaly score
☐ Detector Agent
☐ Skeptic Agent
☐ Risk score
☐ GIS dashboard
☐ Explainability
```

---

# ⭐ 42. Advanced Features

After MVP:

```text
☐ VIIRS Nightfire integration
☐ DBSCAN hotspot clustering
☐ WorldPop integration
☐ Wind-vector analysis
☐ Dispatcher Agent
☐ Alert escalation
☐ LLM incident reports
☐ Historical incident replay
☐ Sentinel-2 computer vision
```

Sentinel-2 based computer vision is best treated as a stretch goal after the core pipeline works end-to-end.

---

# 🚧 43. Known Challenges

## Challenge 1 — Lack of labelled data

Solution:

```text
Weak supervision
+
Rule-based bootstrapping
+
Manual validation
```

---

## Challenge 2 — False positives

Solution:

```text
Historical baseline
+
Nightfire
+
Spatial context
+
Skeptic Agent
```

---

## Challenge 3 — OSM incompleteness

Solution:

```text
OSM
+
Global Power Plant Database
+
Cached facility datasets
```

The project specification explicitly identifies incomplete geospatial facility data as a risk and recommends cross-checking sources.

---

## Challenge 4 — API failure

Solution:

```text
Retry
+
Cache
+
Pre-downloaded demo dataset
```

---

## Challenge 5 — False confidence

Solution:

Never present:

```text
"100% FIRE"
```

Instead:

```text
Industrial Fire
Confidence: 91%
Evidence:
...
```

---

# 🗺️ 44. Development Roadmap

## Phase 1 — Foundation

```text
Repository
Database
FastAPI
React
Docker
```

## Phase 2 — Data

```text
FIRMS
OSM
Nightfire
Land Cover
```

## Phase 3 — Intelligence

```text
Feature engineering
Weak labels
Classification
```

## Phase 4 — Anomaly

```text
Historical baseline
FRP deviation
Persistence
Clustering
```

## Phase 5 — Agents

```text
Detector
Skeptic
Dispatcher
```

## Phase 6 — Risk

```text
Risk score
Severity
Alert tiers
```

## Phase 7 — Dashboard

```text
GIS map
Alerts
Facility drill-down
Historical graphs
Explainability
```

## Phase 8 — Demo

```text
One industrial region
Historical replay
Live/cached ingestion
Complete incident story
```

---

# 📌 45. Important Development Rule

Do **not** start by building the dashboard.

Correct order:

```text
DATA
 ↓
DATABASE
 ↓
FEATURES
 ↓
ML
 ↓
ANOMALY
 ↓
AGENTS
 ↓
RISK
 ↓
API
 ↓
DASHBOARD
```

If the dashboard is built first, the team may end up with a beautiful map but no reliable intelligence behind it.

---

# 👨‍💻 46. Contribution Rules

Before pushing code:

```text
git pull
```

Create a branch:

```bash
git checkout -b feature/firms-ingestion
```

Commit:

```bash
git add .
git commit -m "Add FIRMS ingestion pipeline"
```

Push:

```bash
git push origin feature/firms-ingestion
```

Create a Pull Request.

### Do not directly push unfinished work to `main`.

---

# 📋 47. Current Project Checklist

## Data

* [x] FIRMS collector
* [x] Nightfire collector
* [ ] OSM collector
* [ ] Land-cover data
* [ ] WorldPop data
* [ ] Power plant data
* [ ] Raw-data storage
* [ ] Data validation
* [ ] Normalization
* [ ] Caching

## ML

* [ ] Weak-supervision rules
* [ ] Training dataset
* [ ] Feature engineering
* [ ] Classifier
* [ ] Model evaluation
* [ ] Anomaly detection
* [ ] Historical baseline
* [ ] Clustering

## Agents

* [ ] Detector
* [ ] Skeptic
* [ ] Dispatcher
* [ ] Structured incident output

## Risk

* [ ] Risk score
* [ ] Severity
* [ ] Alert tiers
* [ ] Escalation logic

## Backend

* [ ] FastAPI
* [ ] PostgreSQL
* [ ] PostGIS
* [ ] API endpoints
* [ ] Scheduler
* [ ] Logging
* [ ] Error handling

## Frontend

* [ ] GIS map
* [ ] Hotspot markers
* [ ] Facility polygons
* [ ] Risk visualization
* [ ] Alert feed
* [ ] Facility drill-down
* [ ] Historical FRP chart
* [ ] Explainability panel

## Demo

* [ ] Selected region
* [ ] Cached dataset
* [ ] Normal event
* [ ] Abnormal event
* [ ] Classification
* [ ] Skeptic verification
* [ ] Risk score
* [ ] Alert
* [ ] Explainable report

---

# 🏁 48. Final Vision

The final system should behave like an **AI-powered thermal intelligence command center**.

```text
                   SATELLITE
                       │
                       ▼
                "Something is hot"
                       │
                       ▼
                  CLASSIFIER
                       │
                 "What is it?"
                       │
                       ▼
               ANOMALY ENGINE
                       │
              "Is it abnormal?"
                       │
                       ▼
                 SKEPTIC AI
                       │
              "Can we disprove it?"
                       │
                       ▼
                 RISK ENGINE
                       │
             "How dangerous is it?"
                       │
                       ▼
               DISPATCHER AI
                       │
               "Who needs to know?"
                       │
                       ▼
               GIS COMMAND CENTER
                       │
                       ▼
               EXPLAINABLE ALERT
```

### The project's core philosophy:

> **Detect broadly → classify intelligently → challenge aggressively → prioritize by risk → explain clearly.**

---

## 📚 Project Reference

This README is based on the SIH26162 project specification, including its proposed data sources, seven-class taxonomy, feature-engineering approach, weak-supervision strategy, XGBoost/LightGBM recommendation, anomaly-detection layer, three-agent architecture, risk model, alert tiers, GIS dashboard, and implementation roadmap.

