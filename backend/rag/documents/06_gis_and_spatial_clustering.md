# GIS Investigation & Spatial Clustering

## Geospatial Framework
SATRA utilizes standard WGS84 coordinates (`EPSG:4326`) for all ingested points, polygons, and satellite footprints. The GIS Investigation Deck renders multi-layered map overlays using Leaflet and WebGL:
- Real-time thermal hotspot markers colored by severity: Critical Red (`#E63946`), High Orange (`#F59E0B`), Moderate Gold (`#EAB308`), Low Cyan (`#45C8F5`).
- OpenStreetMap and satellite imagery basemaps.
- Industrial boundary polygons representing refineries, power plants, chemical complexes, and special economic zones.

## DBSCAN Spatial Clustering
To aggregate individual 375m pixels into coherent incidents, SATRA applies DBSCAN (Density-Based Spatial Clustering of Applications with Noise):
- **Epsilon ($\epsilon$)**: $0.05^\circ$ (~5.5 km at equator).
- **Minimum Samples (`min_samples`)**: 3 detection pixels.
- **Metric**: Haversine distance.
- **Clustering Outputs**:
  - Cluster centroid $(\text{lat}_{c}, \text{lon}_{c})$.
  - Total integrated FRP: $\sum FRP_i$.
  - Spatial footprint area (convex hull).
  - Dispersion index: indicates whether the cluster is expanding linearly (forest fire front) or concentrated around a single complex (industrial plant).

## Spatial Filtering & Queries
The SATRA GIS subsystem supports spatial bounding box queries (`bbox=min_lon,min_lat,max_lon,max_lat`) and radial proximity queries around high-value facilities. Facilities within a 2km radius of an unverified detection receive instant push notification previews.
