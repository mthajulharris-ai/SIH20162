# Satellite Sensors & NASA FIRMS Integration

## NASA FIRMS Overview
NASA FIRMS (Fire Information for Resource Management System) delivers global active fire and thermal anomaly data within 3 hours of satellite observation, with Ultra Real-Time (URT) feeds available within minutes. FIRMS ingests data from two primary sensor suites: VIIRS and MODIS.

## Sensor Specifications

### VIIRS (Visible Infrared Imaging Radiometer Suite)
- **Platforms**: Suomi-NPP (SNPP), NOAA-20 (JPSS-1), and NOAA-21 (JPSS-2).
- **Spatial Resolution**: 375 meters at nadir in Imagery (I) bands.
- **Key Channels for Thermal Analysis**:
  - **Band I4 (3.55 - 3.93 μm)**: Mid-wave infrared (MWIR) channel with extreme radiometric sensitivity to high-temperature sub-pixel thermal emitters. Saturates around 367 K.
  - **Band I5 (10.50 - 12.40 μm)**: Thermal infrared (TIR / LWIR) channel used as the baseline background reference temperature.
- **Key Advantage**: 375m pixel resolution detects sub-pixel industrial fires and small flare emissions that are completely invisible to 1km sensors. Minimal pixel distortion across wide swaths (3,060 km) due to pixel aggregation techniques.

### MODIS (Moderate Resolution Imaging Spectroradiometer)
- **Platforms**: Terra (morning equator crossing ~10:30 AM/PM) and Aqua (afternoon equator crossing ~01:30 AM/PM).
- **Spatial Resolution**: 1,000 meters (1 km) at nadir.
- **Key Channels**:
  - **Band 21/22 (3.96 μm)**: High-range MWIR channel designed not to saturate up to 500 K.
  - **Band 31 (11.0 μm)** & **Band 32 (12.0 μm)**: Long-wave infrared background reference channels.
- **Role in SATRA**: Provides long-term multi-decadal baseline calibration and cross-sensor validation for extreme thermal emission events.

## Data Acquisition & Geometry
- **Scan & Track**: Geometric dimensions of the projected satellite footprint on Earth. At swath edges, scan width expands due to panoramic distortion. SATRA normalizes scan and track values to evaluate true radiant spatial density.
- **Day/Night Flag (`daynight`)**: Distinguishes solar-illuminated daytime overpasses (`D`) from nighttime overpasses (`N`). Nighttime observations are especially reliable for industrial thermal analysis because solar reflection and soil heating false positives are eliminated.
