# Industrial Fire Classification Methodology & Taxonomy

## Four-Class Taxonomy
SATRA categorizes every thermal detection into one of four distinct operational classes:

### Class 0: Industrial Fire
- **Definition**: Acute, uncontrolled thermal combustion or runaway chemical event originating within or immediately adjacent to industrial facility boundaries.
- **Physical Characteristics**:
  - Very high localized FRP (typically > 50 MW).
  - Spatial radius typically under 500 meters (compact emitter, point source).
  - Proximity to registered industrial polygons (refineries, petrochemical complexes, chemical storage, pipeline depots, tank farms).
  - High confidence score (> 80%).
  - Acute onset with no historical signature in preceding weeks or dramatic deviation from baseline flare intensity.

### Class 1: Forest Fire
- **Definition**: Uncontained wildfire burning biomass in forested, scrubland, or protected conservation zones.
- **Physical Characteristics**:
  - Spatially dispersed multi-pixel cluster (DBSCAN cluster count > 5).
  - High directional velocity and expansion between sequential satellite overpasses.
  - Proximity to high vegetation density / forest land use land cover (LULC).
  - Greater distance (> 5 km) from heavy industrial perimeters.

### Class 2: Persistent Thermal Source
- **Definition**: Routine, stationary, industrial thermal activity resulting from normal operational processes.
- **Examples**:
  - Petrochemical safety flare stacks.
  - Blast furnace exhausts in steel manufacturing.
  - Rotary kilns in cement factories.
  - Coke oven battery degassing.
- **Physical Characteristics**:
  - High temporal recurrence: Detected at identical geographic coordinates ($< 300\text{ m}$ deviation) across multiple passes over 30+ days.
  - Steady or bounded FRP variance without rapid perimeter spread.
  - Stationary spatial cluster size (single pixel or fixed twin-pixel cluster).

### Class 3: Other
- **Definition**: Non-critical thermal events including agricultural crop residue burning, controlled sugarcane field clearing, hot soil solar reflections, or low-temperature biomass burnings located outside industrial perimeters.

## Differentiation Heuristics & Decision Logic
1. **Spatial Proximity**: Distance to nearest industrial facility (OpenStreetMap / industrial database tags). Detections $< 1.0\text{ km}$ from heavy industrial infrastructure have high prior probability for Class 0 or Class 2.
2. **Persistence Index**: Historical detection frequency within a 500m radius over the previous 7, 30, and 90 days. A stationary point with high history is classified as Class 2 unless its instantaneous FRP exceeds 3× standard deviations above baseline.
3. **Cluster Morphology**: Aspect ratio and perimeter-to-area ratio of thermal cluster. Point-like clusters indicate industrial origins; linear fronts indicate advancing wildfires.
