# SATRA System Overview & Problem Statement

## Problem Statement & Context
The Smart India Hackathon (SIH) problem statement addresses the critical need for automated, satellite-driven detection and distinction of industrial thermal anomalies versus natural forest or agricultural fires.

In major industrial belts—such as refineries, petrochemical hubs, thermal power plants, steel mills, and fertilizer factories—high-temperature operations produce thermal radiation that is frequently misclassified by conventional satellite fire products as uncontrolled wildfires. Conversely, actual runaway industrial incidents, tank farm fires, and chemical explosions require immediate automated detection, severity grading, and dispatch verification.

## SATRA Mission & Objectives
SATRA (Satellite-based Autonomous Thermal Risk Analysis) is an aerospace-grade intelligence platform engineered to:
1. Ingest real-time thermal anomaly observations from polar-orbiting satellite constellations (NASA FIRMS / VIIRS / MODIS).
2. Filter, calibrate, and enrich thermal detections with geographic, infrastructural, and meteorological context.
3. Classify thermal events using an ensemble machine learning architecture into:
   - `0 = Industrial Fire` — Runaway or uncontained thermal events occurring inside industrial facility perimeters.
   - `1 = Forest Fire` — Natural vegetation or canopy wildfire exhibiting rapid spatial propagation.
   - `2 = Persistent Thermal Source` — Regulated, stationary industrial sources such as flare stacks, blast furnaces, or cement kilns.
   - `3 = Other` — Agricultural stubble burning, controlled biomass burning, or solar glare false positives.
4. Issue automated tiered alerts (CRITICAL, HIGH, MEDIUM, LOW) to plant safety officers and civil defense authorities.
5. Provide a 3D Earth, interactive GIS investigation deck, and domain-grounded AI copilot for telemetry analysis.

## Core Capabilities
- **Latency**: Sub-30-minute detection turnaround from satellite overpass to incident alert dispatch.
- **Multi-Sensor Fusion**: Correlates high-resolution 375m VIIRS I-band data with MODIS 1km calibrated radiance observations.
- **Verification Workflow**: Integrated human-in-the-loop verification pipeline allowing security dispatchers to confirm industrial incidents or flag maintenance flare venting.
