# Thermal Anomalies, Radiative Physics & Metrics

## What is a Thermal Anomaly?
A thermal anomaly is a localized pixel or cluster where measured infrared radiance significantly departs from the statistical background temperature of the surrounding land cover. In satellite remote sensing, anomalous high temperatures indicate active combustion, flare venting, molten metal processing, or wildfire activity.

## Fundamental Radiative Principles

### Planck's Radiation Law
The spectral radiance $B(\lambda, T)$ of a blackbody emitter increases exponentially with temperature, and the peak of radiant emission shifts toward shorter wavelengths as temperature rises (Wien's Displacement Law):
$$\lambda_{max} \cdot T \approx 2898 \text{ }\mu\text{m}\cdot\text{K}$$

- Ambient background Earth surfaces (~300 K) emit predominantly in the Long-Wave Infrared (LWIR ~10–12 μm).
- Active flaming combustion and industrial flares (800 K – 1800 K) emit predominantly in the Mid-Wave Infrared (MWIR ~3.7–4.0 μm).
- Consequently, sub-pixel fires that occupy less than 0.1% of a 375m pixel cause massive radiance spikes in MWIR Band I4 while barely altering LWIR Band I5.

### Brightness Temperature Difference ($\Delta T$)
The temperature differential $\Delta T = T_{3.75} - T_{11}$ (or $T_{I4} - T_{I5}$) serves as a primary discriminant in SATRA:
- Non-fire ground pixels: $\Delta T \approx 0\text{ to }5 \text{ K}$.
- Mild thermal heating or solar glare: $\Delta T \approx 5\text{ to }12 \text{ K}$.
- Active flaming fire or flare stack: $\Delta T > 20 \text{ K}$, often exceeding $50\text{ to }80 \text{ K}$.

### Fire Radiative Power (FRP)
Fire Radiative Power (expressed in Megawatts, MW) quantifies the rate of radiant energy emitted by active combustion. SATRA calculates FRP based on the empirical bi-spectral formulation derived by Wooster et al.:
$$FRP \approx \frac{A_{pixel} \cdot \sigma}{a} \cdot \left(L_{MWIR} - L_{b,MWIR}\right)$$
Where:
- $A_{pixel}$ is the pixel surface ground area in square meters.
- $\sigma$ is the Stefan-Boltzmann constant ($5.6704 \times 10^{-8} \text{ W}\cdot\text{m}^{-2}\cdot\text{K}^{-4}$).
- $L_{MWIR}$ and $L_{b,MWIR}$ are the target and background spectral radiances.
- $a$ is a sensor-specific calibration coefficient.

### Diagnostic Significance of FRP in SATRA
- **Small Agricultural Burning**: 1 – 15 MW.
- **Regulated Industrial Flare Stacks**: 15 – 60 MW (consistent, localized, stationary).
- **Major Industrial Tank / Process Fire**: 60 – 250+ MW (intense, localized, rising trajectory).
- **Large Forest Wildfire Front**: 100 – 1000+ MW (spatially sprawling across dozens of connected pixels).
