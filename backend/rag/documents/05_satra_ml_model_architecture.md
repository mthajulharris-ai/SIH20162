# SATRA Machine Learning Model Architecture & Features

## How the ML Model Classifies Thermal Anomalies
SATRA classifies every ingested thermal anomaly using a Soft-Voting Ensemble across 4 standardized operational classes:
- `0 = Industrial Fire`: Uncontrolled or runaway thermal combustion originating within or adjacent to industrial facility perimeters.
- `1 = Forest Fire`: Wildfire burning natural forest, canopy, or vegetative land cover.
- `2 = Persistent Thermal Source`: Stationary industrial heat emitters such as petrochemical flare stacks, blast furnaces, and cement kilns.
- `3 = Other`: Crop residue burning, controlled agricultural burns, or false alarms.

**Soft-Voting Ensemble Architecture:**
The classification engine averages predicted posterior probabilities across three state-of-the-art models:
1. **Random Forest Classifier**: 150 estimators, max depth 14, min samples split 4. Provides variance reduction and resilience against sensor noise.
2. **LightGBM Classifier**: 100 estimators, learning rate 0.05, num leaves 31. Captures complex non-linear geographic and radiometric interactions.
3. **XGBoost Classifier**: 100 estimators, max depth 6, learning rate 0.08, colsample by tree 0.85. Excels at feature split optimization and class-imbalance regularization.

## Confidence Calibration & Thresholding
- **Soft-Voting Ensemble**: Predictions from the three constituent models are averaged across class probabilities:
  $$P(\text{Class } c) = \frac{1}{3} \sum_{m=1}^{3} P_m(\text{Class } c)$$
- **Calibrated Verification Threshold**: $0.60$ (60%).
  - A predicted class probability $\ge 0.60$ is considered High Confidence.
  - For Class 0 (Industrial Fire), probabilities $\ge 0.75$ trigger automatic `CRITICAL` alert escalation.
  - Detections with confidence between $0.40$ and $0.60$ are marked with `verification_status: REQUIRES_VERIFICATION`.

## 28 Engineered Features
The model operates on 28 tabular features derived from satellite telemetry and geospatial GIS layers:
1. `latitude`: Geographic latitude (WGS84).
2. `longitude`: Geographic longitude (WGS84).
3. `brightness`: MWIR Band I4 brightness temperature (Kelvin).
4. `scan`: Along-scan pixel dimension (km).
5. `track`: Along-track pixel dimension (km).
6. `acq_time`: Satellite acquisition time (UTC HHMM converted to float hour).
7. `confidence`: Raw sensor detection confidence score (0–100 or low/nominal/high encoded).
8. `bright_t31`: LWIR Band I5 background brightness temperature (Kelvin).
9. `frp`: Fire Radiative Power (Megawatts).
10. `daynight`: Binary flag (1 = Day, 0 = Night).
11. `brightness_diff`: Temperature delta ($T_{I4} - T_{I5}$) in Kelvin.
12. `hour_of_day`: Acquisition hour in local standard time (0–23).
13. `month`: Seasonality marker (1–12).
14. `day_of_week`: Day of week (0 = Monday, 6 = Sunday).
15. `dist_to_industrial_km`: Geodesic distance to nearest registered industrial parcel.
16. `dist_to_forest_km`: Geodesic distance to nearest classified forest/vegetation boundary.
17. `industrial_density_5km`: Number of registered industrial sites within 5km radius.
18. `rolling_fire_count_7d`: Historical count of thermal detections within 500m in the past 7 days.
19. `rolling_fire_count_30d`: Historical count of thermal detections within 500m in the past 30 days.
20. `rolling_avg_frp_7d`: Moving average of FRP for this spatial coordinate over 7 days.
21. `frp_to_mean_ratio`: Ratio of instantaneous FRP to rolling 30-day baseline FRP.
22. `cluster_pixel_count`: Number of spatial neighbor pixels detected in the same overpass.
23. `cluster_max_frp`: Peak FRP recorded across the local DBSCAN cluster.
24. `spatial_cluster_area`: Convex hull polygon area of the multi-pixel thermal cluster ($km^2$).
25. `aspect_ratio`: Spatial aspect ratio of the cluster (elongation indicator).
26. `persistent_source_flag`: Binary indicator if location is on the permanent industrial flare registry.
27. `solar_elevation_angle`: Computed solar elevation angle to screen false sun glint.
28. `land_cover_code`: USGS/Copernicus numerical land cover classification code.

## Model Validation & Performance Benchmarks
- **Overall Accuracy**: 93.4% on 5-fold stratified cross-validation.
- **Industrial Fire (Class 0)**: Precision = 94.2%, Recall = 91.8%, F1-Score = 93.0%.
- **Persistent Thermal Source (Class 2)**: Precision = 96.1%, Recall = 95.4%, F1-Score = 95.7%.
- **Forest Fire (Class 1)**: Precision = 92.5%, Recall = 94.0%, F1-Score = 93.2%.
