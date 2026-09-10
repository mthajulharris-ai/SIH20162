import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import {
  RotateCcw,
  Play,
  Pause,
  Maximize2,
  MapPin,
  Flame,
  Activity,
  Radio,
  ShieldAlert,
  AlertTriangle,
  X,
  Copy,
  Check,
  Compass,
  Crosshair,
  Layers,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { StatusBadge, ClassBadge, ProvenanceBadge } from './StatusBadge';

/**
 * Convert Latitude/Longitude (degrees) to 3D Cartesian coordinates
 * matching Three.js standard SphereGeometry equirectangular UV mapping.
 *
 * Mathematically:
 *   u = (lon + 180) / 360  -> psi = pi + lon_rad
 *   v = (lat + 90) / 180   -> theta = pi/2 - lat_rad
 *   x = radius * cos(lat_rad) * cos(lon_rad)
 *   y = radius * sin(lat_rad)
 *   z = -radius * cos(lat_rad) * sin(lon_rad)
 */
function latLngToVector3(lat, lng, radius) {
  const radLat = (lat * Math.PI) / 180;
  const radLon = (lng * Math.PI) / 180;
  const x = radius * Math.cos(radLat) * Math.cos(radLon);
  const y = radius * Math.sin(radLat);
  const z = -radius * Math.cos(radLat) * Math.sin(radLon);
  return new THREE.Vector3(x, y, z);
}

/**
 * High-quality fallback procedural Earth texture with graticule lines
 * used during asset load or offline states.
 */
function createFallbackEarthTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // Deep space ocean gradient
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, 1024);
  oceanGrad.addColorStop(0, '#040d1a');
  oceanGrad.addColorStop(0.5, '#020712');
  oceanGrad.addColorStop(1, '#040d1a');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, 2048, 1024);

  // Tactical coordinate grid
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.1)';
  ctx.lineWidth = 1;
  for (let x = 0; x < 2048; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 1024);
    ctx.stroke();
  }
  for (let y = 0; y < 1024; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(2048, y);
    ctx.stroke();
  }

  // Major parallels & meridians
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
  ctx.lineWidth = 1.5;
  // Equator
  ctx.beginPath();
  ctx.moveTo(0, 512);
  ctx.lineTo(2048, 512);
  ctx.stroke();
  // Prime Meridian (center at 1024)
  ctx.beginPath();
  ctx.moveTo(1024, 0);
  ctx.lineTo(1024, 1024);
  ctx.stroke();

  return new THREE.CanvasTexture(canvas);
}

// Camera Distance Presets (Sensible limits to prevent Earth texture pixelation)
const CAMERA_DIST_GLOBAL = 240;    // State 1: Global full Earth overview
const CAMERA_DIST_REGIONAL = 200;  // State 2: Regional view
const CAMERA_DIST_DETECTION = 168; // State 3: Controlled close observation (Altitude ~68)
const CAMERA_DIST_MIN = 152;       // Strict minimum: prevents texture magnification blur
const CAMERA_DIST_MAX = 310;       // Maximum zoom out limit

export function EarthGlobe3D({
  detections = [],
  selectedDetection = null,
  onSelectDetection = () => {},
  onSwitchTo2D = () => {},
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const earthGroupRef = useRef(null);
  const markersGroupRef = useRef(null);
  const cloudsMeshRef = useRef(null);
  const animFrameIdRef = useRef(null);

  // Interaction State Refs
  const isDraggingRef = useRef(false);
  const previousMousePositionRef = useRef({ x: 0, y: 0 });
  const autoRotateRef = useRef(true);
  const lastInteractionTimeRef = useRef(Date.now());
  const cameraDistanceRef = useRef(CAMERA_DIST_GLOBAL);
  const targetCameraDistanceRef = useRef(CAMERA_DIST_GLOBAL);

  // Camera State Transitions (Slerp)
  const isTransitioningRef = useRef(false);
  const transitionProgressRef = useRef(0);
  const startQuaternionRef = useRef(new THREE.Quaternion());
  const targetQuaternionRef = useRef(new THREE.Quaternion());
  const startDistanceRef = useRef(CAMERA_DIST_GLOBAL);
  const targetDistanceRef = useRef(CAMERA_DIST_GLOBAL);

  // Selected Target Tracking (Screen-space 2D position for SVG reticle)
  const [reticleState, setReticleState] = useState(null); // { x, y, visible, lat, lon, cls, conf }
  const selectedDetectionRef = useRef(selectedDetection);
  useEffect(() => {
    selectedDetectionRef.current = selectedDetection;
  }, [selectedDetection]);

  // UI States
  const [autoRotate, setAutoRotate] = useState(true);
  const [hoveredDetection, setHoveredDetection] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [cameraState, setCameraState] = useState('GLOBAL'); // 'GLOBAL', 'TRANSITION', 'DETECTION', 'MANUAL'

  // Sync autoRotate state to ref
  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  // Main Three.js Scene Setup
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x030712); // Cosmic midnight slate

    // 2. Camera (Perspective with controlled FOV)
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 2000);
    camera.position.set(0, 0, CAMERA_DIST_GLOBAL);
    cameraRef.current = camera;

    // 3. WebGL Renderer with High-DPI Anti-Aliasing
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch (e) {
      console.error('WebGL initialization failed, falling back to 2D map:', e);
      onSwitchTo2D();
      return;
    }

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Earth Master Group (rotates on sphere)
    const earthGroup = new THREE.Group();
    scene.add(earthGroup);
    earthGroupRef.current = earthGroup;

    // 5. Deep Space Starfield Background
    const starGeo = new THREE.BufferGeometry();
    const starCount = 1800;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      const r = 700 + Math.random() * 500;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i + 2] = r * Math.cos(phi);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0x94a3b8,
      size: 1.25,
      transparent: true,
      opacity: 0.65,
    });
    const starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);

    // 6. Professional Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.52);
    scene.add(ambientLight);

    // Key Sun Light (Simulates solar illumination)
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.45);
    sunLight.position.set(180, 100, 150);
    scene.add(sunLight);

    // Subtle Cyan Rim Light (Atmospheric limb fill)
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.4);
    rimLight.position.set(-160, -70, -120);
    scene.add(rimLight);

    // 7. Earth Sphere Geometry & Material
    const earthRadius = 100;
    // High tessellation (96x96) prevents faceted polygon silhouettes
    const earthGeo = new THREE.SphereGeometry(earthRadius, 96, 96);

    // Texture Loader with Anisotropic Filtering
    const textureLoader = new THREE.TextureLoader();
    const fallbackTex = createFallbackEarthTexture();

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4;

    const earthMat = new THREE.MeshStandardMaterial({
      map: fallbackTex,
      roughness: 0.78,
      metalness: 0.12,
    });

    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    earthGroup.add(earthMesh);

    // Asynchronously load real NASA Blue Marble satellite daymap with max sharpness
    textureLoader.load(
      '/textures/earth_daymap.jpg',
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = maxAnisotropy;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        earthMat.map = tex;
        earthMat.needsUpdate = true;
      },
      undefined,
      (err) => {
        console.warn('Local Earth texture unavailable, procedural tactical texture active:', err);
      }
    );

    // 8. Atmospheric Cloud Layer (Drifts independently)
    const cloudsGeo = new THREE.SphereGeometry(earthRadius + 0.85, 64, 64);
    const cloudsMat = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 0.24,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
    earthGroup.add(cloudsMesh);
    cloudsMeshRef.current = cloudsMesh;

    textureLoader.load(
      '/textures/earth_clouds.png',
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = maxAnisotropy;
        cloudsMat.map = tex;
        cloudsMat.needsUpdate = true;
      },
      undefined,
      () => {}
    );

    // 9. Atmospheric Limb Glow (Fresnel Shader Outer Glow)
    const atmosGeo = new THREE.SphereGeometry(earthRadius + 2.8, 64, 64);
    const atmosMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.68 - dot(vNormal, vec3(0, 0, 1.0)), 2.8);
          gl_FragColor = vec4(0.22, 0.68, 0.98, 1.0) * intensity * 0.85;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    const atmosMesh = new THREE.Mesh(atmosGeo, atmosMat);
    earthGroup.add(atmosMesh);

    // 10. Markers Container Group (Mounted directly to EarthGroup so it rotates synchronously)
    const markersGroup = new THREE.Group();
    earthGroup.add(markersGroup);
    markersGroupRef.current = markersGroup;

    // Initial position: center comfortably on Indian subcontinent (~21N, 78E)
    const initTarget = latLngToVector3(21, 78, earthRadius).normalize();
    const initQ = new THREE.Quaternion().setFromUnitVectors(
      initTarget,
      new THREE.Vector3(0, 0, 1)
    );
    earthGroup.quaternion.copy(initQ);

    // 11. Mouse & Touch Event Handlers
    const onPointerDown = (e) => {
      isDraggingRef.current = true;
      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
      lastInteractionTimeRef.current = Date.now();
      isTransitioningRef.current = false; // Stop active transition on manual drag
      setCameraState('MANUAL');
    };

    const onPointerMove = (e) => {
      lastInteractionTimeRef.current = Date.now();

      if (isDraggingRef.current) {
        const deltaX = e.clientX - previousMousePositionRef.current.x;
        const deltaY = e.clientY - previousMousePositionRef.current.y;

        // Controlled drag rotation
        const rotY = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          deltaX * 0.0035
        );
        const rotX = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(1, 0, 0),
          deltaY * 0.0035
        );

        earthGroup.quaternion.premultiply(rotY);
        earthGroup.quaternion.premultiply(rotX);

        previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
      } else {
        checkMarkerHover(e);
      }
    };

    const onPointerUp = () => {
      isDraggingRef.current = false;
      lastInteractionTimeRef.current = Date.now();
    };

    const onWheel = (e) => {
      e.preventDefault();
      lastInteractionTimeRef.current = Date.now();
      const zoomDelta = e.deltaY * 0.14;
      // Clamped strictly to prevent texture magnification blur
      targetCameraDistanceRef.current = THREE.MathUtils.clamp(
        targetCameraDistanceRef.current + zoomDelta,
        CAMERA_DIST_MIN,
        CAMERA_DIST_MAX
      );
    };

    const checkMarkerHover = (e) => {
      if (!markersGroupRef.current || !cameraRef.current) return;
      const rect = container.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cameraRef.current);

      const intersects = raycaster.intersectObjects(markersGroupRef.current.children, true);
      if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj && !obj.userData?.detection && obj.parent) {
          obj = obj.parent;
        }
        if (obj?.userData?.detection) {
          container.style.cursor = 'pointer';
          setHoveredDetection(obj.userData.detection);
          setTooltipPos({ x: e.clientX, y: e.clientY });
          return;
        }
      }
      container.style.cursor = isDraggingRef.current ? 'grabbing' : 'grab';
      setHoveredDetection(null);
    };

    const onClick = (e) => {
      if (!markersGroupRef.current || !cameraRef.current) return;
      const rect = container.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cameraRef.current);

      const intersects = raycaster.intersectObjects(markersGroupRef.current.children, true);
      if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj && !obj.userData?.detection && obj.parent) {
          obj = obj.parent;
        }
        if (obj?.userData?.detection) {
          onSelectDetection(obj.userData.detection);
        }
      }
    };

    container.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('click', onClick);

    // 12. Resize Observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w && h && rendererRef.current && cameraRef.current) {
          cameraRef.current.aspect = w / h;
          cameraRef.current.updateProjectionMatrix();
          rendererRef.current.setSize(w, h);
        }
      }
    });
    resizeObserver.observe(container);

    // 13. Animation Loop
    let lastTime = performance.now();
    const startTime = performance.now();

    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      const currentTime = performance.now();
      const delta = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;
      const elapsedTime = (currentTime - startTime) / 1000;
      const now = Date.now();

      // Smooth camera distance lerp
      cameraDistanceRef.current = THREE.MathUtils.lerp(
        cameraDistanceRef.current,
        targetCameraDistanceRef.current,
        0.085
      );
      camera.position.z = cameraDistanceRef.current;

      // Handle Smooth Fly-To / Slerp Animation (State 2 -> State 3)
      if (isTransitioningRef.current) {
        transitionProgressRef.current = Math.min(
          1,
          transitionProgressRef.current + delta * 0.9
        );
        // easeInOutCubic curve for aerospace-grade smooth camera travel
        const t = transitionProgressRef.current;
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        earthGroup.quaternion.slerpQuaternions(
          startQuaternionRef.current,
          targetQuaternionRef.current,
          ease
        );

        targetCameraDistanceRef.current = THREE.MathUtils.lerp(
          startDistanceRef.current,
          targetDistanceRef.current,
          ease
        );

        if (transitionProgressRef.current >= 1) {
          isTransitioningRef.current = false;
          setCameraState(selectedDetectionRef.current ? 'DETECTION' : 'GLOBAL');
        }
      } else {
        // Controlled Auto-Rotation (State 1: Global View)
        const timeSinceInteraction = now - lastInteractionTimeRef.current;
        const canAutoRotate =
          autoRotateRef.current &&
          !isDraggingRef.current &&
          timeSinceInteraction > 4000 &&
          !selectedDetectionRef.current;

        if (canAutoRotate) {
          const rotDelta = 0.00075; // Subtle, elegant rotation (~85s/rev)
          const qRotate = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            rotDelta
          );
          earthGroup.quaternion.premultiply(qRotate);
        }
      }

      // Atmospheric cloud slow drift
      if (cloudsMeshRef.current) {
        cloudsMeshRef.current.rotation.y += 0.00018;
      }

      // Hotspot Markers Animated Radar Pulses
      if (markersGroupRef.current) {
        markersGroupRef.current.children.forEach((marker) => {
          if (marker.userData?.ringMesh) {
            const isSel = marker.userData.isSelected;
            const pulseSpeed = isSel ? 4.5 : 2.5;
            const baseScale = isSel ? 1.4 : 1.0;
            const scale = baseScale + Math.sin(elapsedTime * pulseSpeed + (marker.userData.pulsePhase || 0)) * (isSel ? 0.45 : 0.22);
            marker.userData.ringMesh.scale.set(scale, scale, scale);
          }
          if (marker.userData?.outerRadarMesh) {
            // Continuously expanding radar wave
            const wavePhase = (elapsedTime * 1.5 + (marker.userData.pulsePhase || 0)) % 1.0;
            const waveScale = 1.0 + wavePhase * 2.8;
            marker.userData.outerRadarMesh.scale.set(waveScale, waveScale, waveScale);
            if (marker.userData.outerRadarMesh.material) {
              marker.userData.outerRadarMesh.material.opacity = Math.max(0, 0.7 * (1.0 - wavePhase));
            }
          }
        });
      }

      // Compute Exact Screen-Space Coordinates for Vector Target Reticle HUD
      const activeDet = selectedDetectionRef.current;
      if (activeDet && container) {
        const lat = parseFloat(activeDet.latitude);
        const lon = parseFloat(activeDet.longitude);
        if (!isNaN(lat) && !isNaN(lon)) {
          // Compute world position on globe surface
          const localPt = latLngToVector3(lat, lon, 100.2);
          const worldPt = localPt.clone().applyQuaternion(earthGroup.quaternion);

          // Visible only when facing camera (front hemisphere: z > 0)
          const isFront = worldPt.z > -15;

          if (isFront) {
            const projected = worldPt.clone().project(camera);
            const rect = container.getBoundingClientRect();
            const sx = ((projected.x + 1) / 2) * rect.width;
            const sy = ((-projected.y + 1) / 2) * rect.height;

            setReticleState({
              x: sx,
              y: sy,
              visible: true,
              lat: lat,
              lon: lon,
              cls: activeDet.predicted_class || 'Thermal Anomaly',
              conf: activeDet.prediction_confidence,
              frp: activeDet.frp,
            });
          } else {
            setReticleState((prev) => (prev ? { ...prev, visible: false } : null));
          }
        }
      } else {
        setReticleState(null);
      }

      renderer.render(scene, camera);
    };

    animate();

    // Cleanup on unmount
    return () => {
      cancelAnimationFrame(animFrameIdRef.current);
      container.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('click', onClick);
      resizeObserver.disconnect();

      if (rendererRef.current && rendererRef.current.domElement) {
        container.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
      earthGeo.dispose();
      earthMat.dispose();
      cloudsGeo.dispose();
      cloudsMat.dispose();
      atmosGeo.dispose();
      atmosMat.dispose();
      starGeo.dispose();
      starMat.dispose();
    };
  }, []);

  // Update Hotspot Markers when detections or selection change
  useEffect(() => {
    if (!markersGroupRef.current) return;
    const group = markersGroupRef.current;

    // Clear existing markers
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    }

    const surfaceRadius = 100.25;

    detections.forEach((d, idx) => {
      const lat = parseFloat(d.latitude);
      const lon = parseFloat(d.longitude);
      if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return;

      const pos = latLngToVector3(lat, lon, surfaceRadius);
      const normal = pos.clone().normalize();

      const isSelected =
        selectedDetection &&
        Math.abs(parseFloat(selectedDetection.latitude) - lat) < 0.0001 &&
        Math.abs(parseFloat(selectedDetection.longitude) - lon) < 0.0001;

      // Marker Container positioned at exact lat/lon
      const markerRoot = new THREE.Group();
      markerRoot.position.copy(pos);
      // Orient so that +Z points outward along the surface normal vector
      markerRoot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      markerRoot.userData = {
        detection: d,
        pulsePhase: idx * 0.75,
        isSelected: !!isSelected,
      };

      const pClassLower = (d.predicted_class || '').toLowerCase();
      const isIndustrial = pClassLower.includes('industrial');
      const isPersistent = pClassLower.includes('persistent') || d.is_persistent;
      const isLowConf =
        parseFloat(d.prediction_confidence || 0.9) < 0.6 ||
        d.uncertainty_flag === 'LOW_CONFIDENCE_REVIEW';

      // Colors
      let mainColor = 0x06b6d4; // Cyan (other)
      let beamHeight = 7.0;

      if (isIndustrial) {
        mainColor = 0xef4444; // Red (Industrial Fire)
        beamHeight = Math.min(22, 11 + parseFloat(d.frp || 40) / 9);
      } else if (isPersistent) {
        mainColor = 0xf59e0b; // Amber (Persistent Thermal Source)
        beamHeight = Math.min(17, 8 + parseFloat(d.frp || 25) / 11);
      }

      if (isLowConf) {
        mainColor = 0xa855f7; // Purple uncertainty
      }

      if (isSelected) {
        beamHeight += 6.0; // Taller beacon for selected target
      }

      // 1. Glowing Center Point (Sphere)
      const coreRadius = isSelected ? 1.6 : isIndustrial ? 1.25 : isPersistent ? 1.05 : 0.85;
      const coreGeo = new THREE.SphereGeometry(coreRadius, 16, 16);
      const coreMat = new THREE.MeshBasicMaterial({
        color: isSelected ? 0xffffff : mainColor,
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      markerRoot.add(coreMesh);

      // 2. Vertical Light Beacon (Pillar pointing along surface normal)
      const pillarGeo = new THREE.CylinderGeometry(0.2, isSelected ? 0.9 : 0.7, beamHeight, 8);
      pillarGeo.rotateX(Math.PI / 2); // Orient along +Z
      pillarGeo.translate(0, 0, beamHeight / 2);
      const pillarMat = new THREE.MeshBasicMaterial({
        color: mainColor,
        transparent: true,
        opacity: isSelected ? 0.95 : isIndustrial ? 0.8 : 0.6,
      });
      const pillarMesh = new THREE.Mesh(pillarGeo, pillarMat);
      markerRoot.add(pillarMesh);

      // 3. Pulsing Base Radar Ring on surface
      const ringRadius = coreRadius * (isSelected ? 3.0 : 2.5);
      const ringGeo = new THREE.RingGeometry(ringRadius * 0.72, ringRadius, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: mainColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: isSelected ? 0.9 : 0.6,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      markerRoot.add(ringMesh);
      markerRoot.userData.ringMesh = ringMesh;

      // 4. Expanding Radar Wave Ring (Especially for Selected Target)
      if (isSelected || isIndustrial) {
        const outerRadarGeo = new THREE.RingGeometry(ringRadius * 0.9, ringRadius * 1.08, 24);
        const outerRadarMat = new THREE.MeshBasicMaterial({
          color: isSelected ? 0xffffff : mainColor,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.6,
        });
        const outerRadarMesh = new THREE.Mesh(outerRadarGeo, outerRadarMat);
        markerRoot.add(outerRadarMesh);
        markerRoot.userData.outerRadarMesh = outerRadarMesh;
      }

      group.add(markerRoot);
    });
  }, [detections, selectedDetection]);

  // Smooth Globe Rotation & Controlled Zoom on Selected Detection
  useEffect(() => {
    if (!selectedDetection || !earthGroupRef.current || !cameraRef.current) return;

    const lat = parseFloat(selectedDetection.latitude);
    const lon = parseFloat(selectedDetection.longitude);
    if (isNaN(lat) || isNaN(lon)) return;

    // 1. Vector pointing from center to this exact lat/lon on the sphere
    const targetPt = latLngToVector3(lat, lon, 100).normalize();

    // 2. Compute quaternion Q such that Q * targetPt = (0, 0, 1) (faces camera directly)
    const targetQ = new THREE.Quaternion().setFromUnitVectors(
      targetPt,
      new THREE.Vector3(0, 0, 1)
    );

    // 3. Setup smooth transition to controlled observation distance (NO OVER-ZOOM)
    startQuaternionRef.current.copy(earthGroupRef.current.quaternion);
    targetQuaternionRef.current.copy(targetQ);

    startDistanceRef.current = cameraDistanceRef.current;
    targetDistanceRef.current = CAMERA_DIST_DETECTION; // Altitude ~68: keeps Earth texture sharp & crisp

    transitionProgressRef.current = 0;
    isTransitioningRef.current = true;
    lastInteractionTimeRef.current = Date.now();
    setCameraState('TRANSITION');
  }, [selectedDetection]);

  // Handle Reset Global View
  const handleResetView = useCallback(() => {
    if (!earthGroupRef.current) return;
    onSelectDetection(null);

    // Rotate back to canonical view of Indian subcontinent (~21N, 78E)
    const initTarget = latLngToVector3(21, 78, 100).normalize();
    const targetQ = new THREE.Quaternion().setFromUnitVectors(
      initTarget,
      new THREE.Vector3(0, 0, 1)
    );

    startQuaternionRef.current.copy(earthGroupRef.current.quaternion);
    targetQuaternionRef.current.copy(targetQ);
    startDistanceRef.current = cameraDistanceRef.current;
    targetDistanceRef.current = CAMERA_DIST_GLOBAL; // Return to comfortable global view

    transitionProgressRef.current = 0;
    isTransitioningRef.current = true;
    lastInteractionTimeRef.current = Date.now();
    setCameraState('TRANSITION');
  }, [onSelectDetection]);

  // Handle Zoom In / Zoom Out Buttons
  const handleZoomIn = () => {
    targetCameraDistanceRef.current = THREE.MathUtils.clamp(
      targetCameraDistanceRef.current - 20,
      CAMERA_DIST_MIN,
      CAMERA_DIST_MAX
    );
  };
  const handleZoomOut = () => {
    targetCameraDistanceRef.current = THREE.MathUtils.clamp(
      targetCameraDistanceRef.current + 20,
      CAMERA_DIST_MIN,
      CAMERA_DIST_MAX
    );
  };

  // Copy coordinates helper
  const handleCopyCoords = (lat, lon) => {
    navigator.clipboard.writeText(`${lat}, ${lon}`);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: 'calc(100vh - 120px)',
        minHeight: '620px',
        overflow: 'hidden',
        background: '#030712',
        borderRadius: '12px',
        border: '1px solid #1e293b',
      }}
    >
      {/* 3D WebGL Canvas Container */}
      <div
        ref={mountRef}
        style={{
          width: '100%',
          height: '100%',
          cursor: 'grab',
        }}
      />

      {/* Floating HUD: Top Left Status & Mode Switcher */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          zIndex: 10,
          pointerEvents: 'auto',
        }}
      >
        {/* Mode Switcher Segmented Control */}
        <div
          style={{
            display: 'flex',
            background: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(12px)',
            padding: '4px',
            borderRadius: '8px',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
          }}
        >
          <button
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#38BDF8',
              background: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              borderRadius: '6px',
              cursor: 'default',
            }}
          >
            <span>🌍</span>
            <span>3D Earth</span>
          </button>

          <button
            onClick={onSwitchTo2D}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 500,
              color: '#94A3B8',
              background: 'transparent',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="Switch to 2D Leaflet GIS map with exact synchronized coordinates"
          >
            <span>🗺️</span>
            <span>2D Map</span>
          </button>
        </div>

        {/* Global Telemetry Card */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.84)',
            backdropFilter: 'blur(10px)',
            padding: '10px 14px',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            fontSize: '11.5px',
            color: '#94A3B8',
            maxWidth: '230px',
            lineHeight: 1.5,
          }}
        >
          <div style={{ color: '#F8FAFC', fontWeight: 700, fontSize: '12px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Compass size={14} style={{ color: 'var(--accent-cyan)' }} />
            <span>Earth Observation</span>
          </div>
          <div>Active Hotspots: <strong style={{ color: '#38BDF8' }}>{detections.length}</strong></div>
          <div>Sensors: <strong style={{ color: '#F8FAFC' }}>VIIRS (375m) / MODIS</strong></div>
          <div>Camera Mode: <strong style={{ color: selectedDetection ? '#34D399' : '#38BDF8' }}>
            {selectedDetection ? 'TARGET LOCKED' : autoRotate ? 'ORBITAL PATROL' : 'MANUAL'}
          </strong></div>
        </div>
      </div>

      {/* Floating HUD: Top Right Camera & Orbit Controls */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: selectedDetection ? 380 : 16,
          display: 'flex',
          gap: '8px',
          zIndex: 10,
          transition: 'right 0.3s ease',
        }}
      >
        <button
          onClick={() => setAutoRotate((prev) => !prev)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 12px',
            fontSize: '12px',
            fontWeight: 500,
            background: autoRotate ? 'rgba(56, 189, 248, 0.15)' : 'rgba(15, 23, 42, 0.85)',
            color: autoRotate ? '#38BDF8' : '#94A3B8',
            border: `1px solid ${autoRotate ? 'rgba(56, 189, 248, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
            borderRadius: '6px',
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
          }}
          title={autoRotate ? 'Pause automatic Earth rotation' : 'Resume automatic Earth rotation'}
        >
          {autoRotate ? <Pause size={13} /> : <Play size={13} />}
          <span>{autoRotate ? 'Rotation ON' : 'Rotation OFF'}</span>
        </button>

        <button
          onClick={handleResetView}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 12px',
            fontSize: '12px',
            fontWeight: 500,
            background: 'rgba(15, 23, 42, 0.85)',
            color: '#F8FAFC',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '6px',
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
          }}
          title="Reset to global full Earth view"
        >
          <RotateCcw size={13} />
          <span>Reset View</span>
        </button>

        {/* Zoom Controls */}
        <div style={{ display: 'flex', background: 'rgba(15, 23, 42, 0.85)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <button
            onClick={handleZoomIn}
            style={{
              padding: '7px 9px',
              background: 'transparent',
              border: 'none',
              color: '#F8FAFC',
              cursor: 'pointer',
            }}
            title="Zoom In (Clamped to prevent texture blur)"
          >
            <ZoomIn size={13} />
          </button>
          <button
            onClick={handleZoomOut}
            style={{
              padding: '7px 9px',
              background: 'transparent',
              border: 'none',
              color: '#F8FAFC',
              cursor: 'pointer',
              borderLeft: '1px solid rgba(255,255,255,0.1)',
            }}
            title="Zoom Out"
          >
            <ZoomOut size={13} />
          </button>
        </div>
      </div>

      {/* Micro Hover Tooltip */}
      {hoveredDetection && !selectedDetection && (
        <div
          style={{
            position: 'fixed',
            left: tooltipPos.x + 14,
            top: tooltipPos.y - 12,
            background: 'rgba(15, 23, 42, 0.94)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            borderRadius: '6px',
            padding: '8px 12px',
            color: '#F8FAFC',
            fontSize: '12px',
            pointerEvents: 'none',
            zIndex: 100,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
          }}
        >
          <div style={{ fontWeight: 700, color: hoveredDetection.predicted_class?.includes('Industrial') ? '#EF4444' : '#F59E0B' }}>
            {hoveredDetection.predicted_class || 'Thermal Hotspot'}
          </div>
          <div style={{ fontSize: '11px', color: '#94A3B8' }}>
            FRP: {hoveredDetection.frp ? `${parseFloat(hoveredDetection.frp).toFixed(1)} MW` : 'N/A'} | Temp: {hoveredDetection.brightness ? `${parseFloat(hoveredDetection.brightness).toFixed(1)} K` : 'N/A'}
          </div>
          <div style={{ fontSize: '10.5px', fontFamily: 'monospace', color: '#38BDF8', marginTop: '2px' }}>
            {parseFloat(hoveredDetection.latitude).toFixed(4)}°, {parseFloat(hoveredDetection.longitude).toFixed(4)}°
          </div>
          <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '2px' }}>
            Click to target coordinate
          </div>
        </div>
      )}

      {/* RESOLUTION-INDEPENDENT VECTOR TARGET RETICLE (Section 8) */}
      {/* Positioned dynamically over the exact 3D projected screen coordinate */}
      {reticleState && reticleState.visible && (
        <div
          style={{
            position: 'absolute',
            left: reticleState.x,
            top: reticleState.y,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 15,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Outer Rotating Tactical Bracket */}
          <div
            style={{
              position: 'absolute',
              width: '84px',
              height: '84px',
              border: '1px dashed rgba(56, 189, 248, 0.45)',
              borderRadius: '50%',
              animation: 'spinSlow 18s linear infinite',
            }}
          />

          {/* Tactical Corner Reticle Frame */}
          <svg
            width="68"
            height="68"
            viewBox="0 0 68 68"
            fill="none"
            style={{ overflow: 'visible' }}
          >
            {/* Corner brackets */}
            <path d="M 6 18 L 6 6 L 18 6" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" />
            <path d="M 50 6 L 62 6 L 62 18" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" />
            <path d="M 6 50 L 6 62 L 18 62" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" />
            <path d="M 50 62 L 62 62 L 62 50" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" />

            {/* Crosshair lines with central gap */}
            <line x1="34" y1="4" x2="34" y2="20" stroke="#EF4444" strokeWidth="1.5" />
            <line x1="34" y1="48" x2="34" y2="64" stroke="#EF4444" strokeWidth="1.5" />
            <line x1="4" y1="34" x2="20" y2="34" stroke="#EF4444" strokeWidth="1.5" />
            <line x1="48" y1="34" x2="64" y2="34" stroke="#EF4444" strokeWidth="1.5" />

            {/* Diagonal tactical ticks */}
            <line x1="16" y1="16" x2="23" y2="23" stroke="#38BDF8" strokeWidth="1" />
            <line x1="52" y1="16" x2="45" y2="23" stroke="#38BDF8" strokeWidth="1" />
            <line x1="16" y1="52" x2="23" y2="45" stroke="#38BDF8" strokeWidth="1" />
            <line x1="52" y1="52" x2="45" y2="45" stroke="#38BDF8" strokeWidth="1" />

            {/* Central Target Ring & Dot */}
            <circle cx="34" cy="34" r="7" stroke="#EF4444" strokeWidth="1.5" fill="none" />
            <circle cx="34" cy="34" r="2.5" fill="#EF4444" />
          </svg>

          {/* Coordinate Readout HUD Label (Pinned to reticle) */}
          <div
            style={{
              position: 'absolute',
              left: '46px',
              top: '-34px',
              background: 'rgba(15, 23, 42, 0.92)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              borderLeft: '3px solid #EF4444',
              borderRadius: '4px',
              padding: '6px 10px',
              minWidth: '160px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              pointerEvents: 'none',
              lineHeight: 1.35,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9.5px', fontWeight: 700, color: '#38BDF8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              <Crosshair size={11} style={{ color: '#EF4444' }} />
              <span>Exact Detection</span>
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 700, color: '#FFFFFF', marginTop: '2px' }}>
              {reticleState.lat.toFixed(6)}°, {reticleState.lon.toFixed(6)}°
            </div>
            <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '1px' }}>
              {reticleState.cls} {reticleState.frp ? `• ${parseFloat(reticleState.frp).toFixed(1)} MW` : ''}
            </div>
          </div>
        </div>
      )}

      {/* Right Intelligence Panel (Slide-out HUD when Hotspot is Selected) */}
      {selectedDetection && (
        <aside
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            bottom: 16,
            width: '360px',
            maxWidth: 'calc(100% - 32px)',
            background: 'rgba(15, 23, 42, 0.94)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            color: '#F8FAFC',
            zIndex: 20,
            overflowY: 'auto',
            boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.6)',
            animation: 'fadeIn 0.25s ease-out',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.08em', color: '#38BDF8', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Crosshair size={13} style={{ color: '#EF4444' }} />
                <span>Target Coordinate Locked</span>
              </div>
              <h2 style={{ fontSize: '17px', fontWeight: 700, margin: '2px 0 0 0', color: '#FFFFFF' }}>
                {selectedDetection.predicted_class || 'Thermal Hotspot'}
              </h2>
            </div>
            <button
              onClick={() => onSelectDetection(null)}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: 'none',
                borderRadius: '6px',
                color: '#94A3B8',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Close inspection panel"
            >
              <X size={16} />
            </button>
          </div>

          {/* Badges Row */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <ClassBadge className={selectedDetection.predicted_class} />
            <ProvenanceBadge provenance={selectedDetection.data_provenance} />
          </div>

          {/* Exact Latitude & Longitude Source of Truth Display (Section 6) */}
          <div
            style={{
              background: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '8px',
              padding: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: '#38BDF8', textTransform: 'uppercase' }}>
                Exact Canonical Coordinates
              </span>
              <button
                onClick={() => handleCopyCoords(selectedDetection.latitude, selectedDetection.longitude)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'none',
                  border: 'none',
                  color: copiedCoords ? '#34D399' : '#38BDF8',
                  fontSize: '11px',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {copiedCoords ? <Check size={12} /> : <Copy size={12} />}
                <span>{copiedCoords ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
              <div>
                <div style={{ fontSize: '10px', color: '#94A3B8' }}>LATITUDE</div>
                <div style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: 700, color: '#FFFFFF' }}>
                  {parseFloat(selectedDetection.latitude).toFixed(6)}°
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#94A3B8' }}>LONGITUDE</div>
                <div style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: 700, color: '#FFFFFF' }}>
                  {parseFloat(selectedDetection.longitude).toFixed(6)}°
                </div>
              </div>
            </div>
          </div>

          {/* Operational Verification Warning Banner */}
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '11.5px',
              color: '#FCA5A5',
              lineHeight: 1.45,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#EF4444', marginBottom: '2px' }}>
              <AlertTriangle size={14} />
              <span>REQUIRES VERIFICATION</span>
            </div>
            Probabilistic AI model prediction. Cross-reference ground SCADA or high-resolution optical imagery before emergency dispatch.
          </div>

          {/* Telemetry Metrics Grid (Section 6) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px',
            }}
          >
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ fontSize: '11px', color: '#94A3B8' }}>AI Confidence</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#38BDF8', marginTop: '2px' }}>
                {(parseFloat(selectedDetection.prediction_confidence || 0) * 100).toFixed(1)}%
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ fontSize: '11px', color: '#94A3B8' }}>Radiative Power</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#F59E0B', marginTop: '2px' }}>
                {selectedDetection.frp ? `${parseFloat(selectedDetection.frp).toFixed(1)} MW` : 'N/A'}
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ fontSize: '11px', color: '#94A3B8' }}>Brightness Temp</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF', marginTop: '2px' }}>
                {selectedDetection.brightness ? `${parseFloat(selectedDetection.brightness).toFixed(1)} K` : 'N/A'}
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ fontSize: '11px', color: '#94A3B8' }}>Satellite Sensor</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF', marginTop: '2px' }}>
                {selectedDetection.source || 'VIIRS'}
              </div>
            </div>
          </div>

          {/* Acquisition Details & AI Model Governance */}
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '10px 12px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.06)', fontSize: '11.5px', lineHeight: 1.55 }}>
            <div>
              Acquisition: <strong style={{ color: '#FFFFFF' }}>{selectedDetection.acq_date} {selectedDetection.acq_time} UTC</strong>
            </div>
            <div>
              Provenance: <strong style={{ color: '#34D399' }}>{selectedDetection.data_provenance || 'REAL_FIRMS'}</strong>
            </div>
            <div>
              Model Version: <strong style={{ color: '#A855F7', fontFamily: 'monospace' }}>{selectedDetection.model_version || '2.0.0-scientific-prototype'}</strong>
            </div>
            <div>
              Status: <strong style={{ color: '#C084FC' }}>Requires Verification</strong>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              onClick={onSwitchTo2D}
              className="btn-primary"
              style={{
                width: '100%',
                justifyContent: 'center',
                padding: '10px',
                fontSize: '12.5px',
              }}
              title="Switch to 2D Leaflet GIS map with exact canonical coordinates"
            >
              <MapPin size={14} />
              <span>Inspect on 2D GIS Map</span>
            </button>
            <button
              onClick={handleResetView}
              className="btn-secondary"
              style={{
                width: '100%',
                justifyContent: 'center',
                padding: '8px',
                fontSize: '12px',
              }}
            >
              <span>Back to Global Orbit</span>
            </button>
          </div>
        </aside>
      )}

      {/* Bottom Tactical Hint */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(8px)',
          padding: '4px 16px',
          borderRadius: '20px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          color: '#64748B',
          fontSize: '11px',
          pointerEvents: 'none',
          zIndex: 5,
        }}
      >
        Left Click + Drag to Orbit • Scroll to Zoom (Controlled Altitude) • Click Hotspot to Target
      </div>
    </div>
  );
}
