# Incident Alerts & Verification Workflow

## Alert Grading & Severity Rules
Every detection is evaluated by SATRA's alert rule engine to calculate alert severity:

1. **CRITICAL**:
   - Classification: `Industrial Fire` (Class 0) with confidence $\ge 0.75$.
   - OR any industrial detection with $\text{FRP} \ge 100 \text{ MW}$.
   - Response Protocol: Immediate automated visual alert, siren banner in Command Center, automated dispatch trigger.
2. **HIGH**:
   - Classification: `Industrial Fire` with confidence between $0.60$ and $0.74$.
   - OR `Forest Fire` within 3km of an industrial boundary.
3. **MEDIUM**:
   - Persistent thermal source exhibiting an unusual spike ($\text{FRP} > 2.5\times$ rolling average).
   - OR unverified anomalous hotspot with confidence between $0.40$ and $0.60$.
4. **LOW**:
   - Standard persistent thermal source conforming to baseline flare operations.
   - Minor agricultural burns outside protected zones.

## Verification Status Lifecycle
Incident alerts follow a formal operational lifecycle:
- `REQUIRES_VERIFICATION`: Initial status assigned to high-risk detections awaiting human dispatcher confirmation.
- `VERIFIED_INDUSTRIAL`: Dispatcher has confirmed with on-site CCTV, thermal sensors, or plant telemetry that a real industrial incident is occurring.
- `FALSE_POSITIVE`: Confirmed as non-hazardous flare stack venting, solar reflection, or permitted controlled maintenance.
- `RESOLVED`: Incident containment complete; thermal signature extinguished in subsequent satellite passes.
