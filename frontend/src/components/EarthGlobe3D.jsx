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
  Target,
  Globe,
  Plus,
  Minus,
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
 * Compute the geographically upright globe quaternion for a given lat/lon.
 * Centers (lat, lon) directly facing the camera (+Z) with North pointing strictly UP (+Y).
 * Eliminates oblique tilt and sideways roll.
 */
function getUprightOrientationForLatLng(lat, lon) {
  const qY = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    -((lon + 90) * Math.PI) / 180
  );
  const qX = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    (lat * Math.PI) / 180
  );
  return qX.multiply(qY);
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

/**
 * Procedural Fallback Blue Digital Earth Texture with tactical graticules.
 * Used for THERMAL mode when assets load or offline.
 */
function createFallbackBlueDigitalEarthTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // Deep space midnight navy ocean
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, 1024);
  oceanGrad.addColorStop(0, '#020b18');
  oceanGrad.addColorStop(0.5, '#031428');
  oceanGrad.addColorStop(1, '#020b18');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, 2048, 1024);

  // Digital coordinate grid
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
  ctx.lineWidth = 1;
  for (let x = 0; x < 2048; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 1024);
    ctx.stroke();
  }
  for (let y = 0; y < 1024; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(2048, y);
    ctx.stroke();
  }

  // Major parallels & meridians
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.38)';
  ctx.lineWidth = 2;
  // Equator
  ctx.beginPath();
  ctx.moveTo(0, 512);
  ctx.lineTo(2048, 512);
  ctx.stroke();
  // Prime Meridian
  ctx.beginPath();
  ctx.moveTo(1024, 0);
  ctx.lineTo(1024, 1024);
  ctx.stroke();

  return new THREE.CanvasTexture(canvas);
}

/**
 * Generate pure deep blue digital Earth texture from NASA Blue Marble daymap.
 * Converts landmasses to electric cobalt/blue contours and oceans to deep space navy,
 * fulfilling the axiom: BLUE = EARTH, RED = THERMAL ANOMALIES.
 */
function createBlueDigitalTextureFromImage(image, renderer) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(image, 0, 0, 2048, 1024);
    const imgData = ctx.getImageData(0, 0, 2048, 1024);
    const d = imgData.data;

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      // In NASA Blue Marble, open water has low red/green, dominant blue, or lum < 38
      const isWater = (b > r + 6 && b > g + 4) || lum < 38;

      if (isWater) {
        // Pure deep cosmic navy ocean
        d[i] = 2;       // R
        d[i + 1] = 11;   // G
        d[i + 2] = 28;   // B
      } else {
        // Continent / Land: Pure Digital Deep Blue / Vibrant Cyan
        // Land appears purely blue without green/brown dominant visuals
        const norm = Math.min(1.0, Math.max(0.0, (lum - 36) / 135));
        d[i] = Math.round(2 + norm * 20);       // R (2 - 22, near zero)
        d[i + 1] = Math.round(62 + norm * 110);  // G (62 - 172, cyan undertone)
        d[i + 2] = Math.round(125 + norm * 130); // B (125 - 255, pure electric blue)
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // Overlay subtle tactical graticule lines
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
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

    // Equator & Prime Meridian
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.38)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 512);
    ctx.lineTo(2048, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(1024, 0);
    ctx.lineTo(1024, 1024);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer?.capabilities?.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  } catch (err) {
    console.warn('Could not generate dynamic blue digital texture:', err);
    return null;
  }
}

// Camera Distance Presets (Smooth, wide zoom range without clipping into Earth radius 100)
const CAMERA_DIST_GLOBAL = 245;    // State 1: Global full Earth overview
const CAMERA_DIST_REGIONAL = 190;  // State 2: Regional view
const CAMERA_DIST_DETECTION = 150; // State 3: Controlled close observation (Altitude ~50)
const CAMERA_DIST_MIN = 118;       // Smooth close zoom without clipping Earth surface
const CAMERA_DIST_MAX = 520;       // Spacious distant orbit view

export function EarthGlobe3D({
  detections = [],
  selectedDetection = null,
  onSelectDetection = () => {},
  onSwitchTo2D = () => {},
  initialMode = 'normal',
  onModeChange = null,
  hideSidePanel = false,
  isOverview = false,
  isEarthIntelligence = false,
  hideModeSelector = false,
  hideFloatingFeed = false,
  focusTrigger = null,
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const earthGroupRef = useRef(null);
  const markersGroupRef = useRef(null);
  const cloudsMeshRef = useRef(null);
  const nightMeshRef = useRef(null);
  const earthMatRef = useRef(null);
  const daymapTexRef = useRef(null);
  const blueDigitalTexRef = useRef(null);
  const fallbackTexRef = useRef(null);
  const fallbackBlueTexRef = useRef(null);
  const animFrameIdRef = useRef(null);

  // Visualization Mode: 'normal' | 'thermal' | 'hybrid'
  const [earthMode, setEarthMode] = useState(isOverview ? 'normal' : (initialMode || 'normal'));
  const earthModeRef = useRef(earthMode);
  useEffect(() => {
    earthModeRef.current = isOverview ? 'normal' : earthMode;
  }, [earthMode, isOverview]);

  // Sync external mode changes smoothly
  useEffect(() => {
    if (initialMode && !isOverview) {
      setEarthMode(initialMode);
    }
  }, [initialMode, isOverview]);

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
    fallbackTexRef.current = fallbackTex;
    const fallbackBlueTex = createFallbackBlueDigitalEarthTexture();
    fallbackBlueTexRef.current = fallbackBlueTex;

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4;

    const initialIsBlueStyle = isEarthIntelligence || earthModeRef.current === 'thermal';
    const earthMat = new THREE.MeshStandardMaterial({
      map: initialIsBlueStyle ? fallbackBlueTex : fallbackTex,
      roughness: initialIsBlueStyle ? 0.48 : 0.78,
      metalness: initialIsBlueStyle ? 0.28 : 0.12,
      color: initialIsBlueStyle ? new THREE.Color(0x38bdf8) : new THREE.Color(0xffffff),
      emissive: initialIsBlueStyle ? new THREE.Color(0x021f3f) : new THREE.Color(0x000000),
    });
    earthMatRef.current = earthMat;

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
        daymapTexRef.current = tex;

        // Generate high-resolution pure blue digital Earth texture
        if (tex.image) {
          const blueTex = createBlueDigitalTextureFromImage(tex.image, renderer);
          if (blueTex) {
            blueDigitalTexRef.current = blueTex;
          }
        }

        // Apply active mode texture immediately
        if (isEarthIntelligence || earthModeRef.current === 'thermal') {
          earthMat.map = blueDigitalTexRef.current || fallbackBlueTex;
          earthMat.color.setHex(0x38bdf8);
          earthMat.emissive.setHex(0x021f3f);
          earthMat.roughness = 0.48;
          earthMat.metalness = 0.28;
        } else {
          earthMat.map = tex;
          earthMat.color.setHex(0xffffff);
          earthMat.emissive.setHex(0x000000);
          earthMat.roughness = 0.78;
          earthMat.metalness = 0.12;
        }
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
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
    cloudsMesh.visible = !isEarthIntelligence && earthModeRef.current !== 'thermal';
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

    // 8b. Night City Lights Layer (NASA Black Marble illumination)
    textureLoader.load(
      '/textures/earth_lights.png',
      (lightsTex) => {
        lightsTex.colorSpace = THREE.SRGBColorSpace;
        lightsTex.anisotropy = maxAnisotropy;
        const nightMat = new THREE.MeshBasicMaterial({
          map: lightsTex,
          blending: THREE.AdditiveBlending,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
        });
        const nightMesh = new THREE.Mesh(new THREE.SphereGeometry(earthRadius + 0.15, 64, 64), nightMat);
        nightMesh.visible = !isEarthIntelligence && earthModeRef.current !== 'thermal';
        earthGroup.add(nightMesh);
        nightMeshRef.current = nightMesh;
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
          float intensity = pow(0.66 - dot(vNormal, vec3(0, 0, 1.0)), 2.6);
          gl_FragColor = vec4(0.24, 0.72, 1.0, 1.0) * intensity * 1.05;
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

    // Initial position: center comfortably on Indian subcontinent (~21N, 78E) with North UP
    const initQ = getUprightOrientationForLatLng(21, 78);
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

        // Controlled drag rotation:
        // 1. Horizontal drag: spin around Earth polar axis (local Y), keeping North UP
        const rotSpin = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          deltaX * 0.0035
        );
        earthGroup.quaternion.multiply(rotSpin);

        // 2. Vertical drag: pitch around screen horizontal axis (world X)
        const rotX = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(1, 0, 0),
          deltaY * 0.0035
        );
        const currentPole = new THREE.Vector3(0, 1, 0).applyQuaternion(earthGroup.quaternion);
        const testPole = currentPole.clone().applyQuaternion(rotX);
        if (testPole.y >= 0.05) {
          earthGroup.quaternion.premultiply(rotX);
        }

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
        0.11
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
          const rotDelta = 0.00075; // Subtle, elegant rotation (~85s/rev) around polar axis
          const qRotate = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            rotDelta
          );
          earthGroup.quaternion.multiply(qRotate);
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

  // Handle Instant Earth Visualization Mode Switching in Three.js
  useEffect(() => {
    if (!earthMatRef.current) return;
    const earthMat = earthMatRef.current;

    if (isEarthIntelligence) {
      // In Earth Intelligence, Earth remains blue holographic across all visualization modes
      earthMat.map = blueDigitalTexRef.current || fallbackBlueTexRef.current;
      earthMat.color.setHex(0x38bdf8);
      earthMat.emissive.setHex(0x021f3f);
      earthMat.roughness = 0.48;
      earthMat.metalness = 0.28;
      earthMat.needsUpdate = true;
      if (cloudsMeshRef.current) cloudsMeshRef.current.visible = false;
      if (nightMeshRef.current) nightMeshRef.current.visible = false;
      return;
    }

    if (earthMode === 'normal') {
      earthMat.map = daymapTexRef.current || fallbackTexRef.current;
      earthMat.color.setHex(0xffffff);
      earthMat.emissive.setHex(0x000000);
      earthMat.roughness = 0.78;
      earthMat.metalness = 0.12;
      earthMat.needsUpdate = true;
      if (cloudsMeshRef.current) cloudsMeshRef.current.visible = true;
      if (nightMeshRef.current) nightMeshRef.current.visible = true;
    } else if (earthMode === 'thermal') {
      earthMat.map = blueDigitalTexRef.current || fallbackBlueTexRef.current;
      earthMat.color.setHex(0x38bdf8);
      earthMat.emissive.setHex(0x021f3f);
      earthMat.roughness = 0.48;
      earthMat.metalness = 0.28;
      earthMat.needsUpdate = true;
      if (cloudsMeshRef.current) cloudsMeshRef.current.visible = false;
      if (nightMeshRef.current) nightMeshRef.current.visible = false;
    } else if (earthMode === 'hybrid') {
      earthMat.map = daymapTexRef.current || fallbackTexRef.current;
      earthMat.color.setHex(0xffffff);
      earthMat.emissive.setHex(0x000000);
      earthMat.roughness = 0.78;
      earthMat.metalness = 0.12;
      earthMat.needsUpdate = true;
      if (cloudsMeshRef.current) cloudsMeshRef.current.visible = true;
      if (nightMeshRef.current) nightMeshRef.current.visible = true;
    }
  }, [earthMode, isEarthIntelligence]);

  // Update Hotspot Markers when detections, selection, or earthMode change
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

      const frpVal = parseFloat(d.frp || 0);
      const isCritical = d.alert_level === 'CRITICAL' || frpVal >= 80;
      const isHighFRP = frpVal >= 50;
      const isMediumFRP = frpVal >= 20;

      let mainColor = 0xef4444; // Standard thermal red
      let coreColor = 0xffffff;
      let coreRadius = 0.95;
      let beamHeight = 8.0;
      let showOuterWave = false;
      let beamOpacity = 0.75;

      if (earthMode === 'thermal') {
        // ========================================================
        // MODE 2: THERMAL EARTH (BLUE = EARTH, RED = THERMAL HOTSPOT)
        // FRP-driven visual hierarchy:
        // - Low (<20 MW): small red point
        // - Medium (20-50 MW): brighter/larger red point
        // - High (>=50 MW): strong bright red glow + tall beam
        // - Critical / Selected: bright red center + pulsing ring + expanding wave
        // ========================================================
        if (isSelected) {
          mainColor = 0xff1e1e; // Vivid scarlet red
          coreColor = 0xffffff;
          coreRadius = 1.85;
          beamHeight = 26.0;
          beamOpacity = 0.98;
          showOuterWave = true;
        } else if (isCritical) {
          mainColor = 0xff1e1e;
          coreColor = 0xffe4e6;
          coreRadius = 1.6;
          beamHeight = 22.0;
          beamOpacity = 0.92;
          showOuterWave = true;
        } else if (isHighFRP) {
          mainColor = 0xff2222;
          coreColor = 0xff4545;
          coreRadius = 1.35;
          beamHeight = 16.0;
          beamOpacity = 0.85;
          showOuterWave = true;
        } else if (isMediumFRP) {
          mainColor = 0xef4444;
          coreColor = 0xef4444;
          coreRadius = 1.05;
          beamHeight = 11.0;
          beamOpacity = 0.75;
          showOuterWave = false;
        } else {
          // Low FRP (< 20 MW)
          mainColor = 0xdc2626;
          coreColor = 0xdc2626;
          coreRadius = 0.8;
          beamHeight = 6.5;
          beamOpacity = 0.65;
          showOuterWave = false;
        }
      } else if (earthMode === 'hybrid') {
        // ========================================================
        // MODE 3: HYBRID EARTH (REALISTIC EARTH + RED THERMAL INTELLIGENCE)
        // High-contrast red thermal anomaly overlay on natural textures
        // ========================================================
        if (isSelected) {
          mainColor = 0xff1e1e;
          coreColor = 0xffffff;
          coreRadius = 1.8;
          beamHeight = 25.0;
          beamOpacity = 0.95;
          showOuterWave = true;
        } else if (isCritical || isHighFRP) {
          mainColor = 0xef4444;
          coreColor = 0xff4545;
          coreRadius = 1.4;
          beamHeight = 18.0;
          beamOpacity = 0.88;
          showOuterWave = true;
        } else {
          mainColor = 0xef4444;
          coreColor = 0xef4444;
          coreRadius = 1.0;
          beamHeight = 10.0;
          beamOpacity = 0.7;
          showOuterWave = false;
        }
      } else {
        // ========================================================
        // MODE 1: NORMAL EARTH (REALISTIC EARTH OBSERVATION)
        // Subtle markers that preserve the natural Earth visual
        // ========================================================
        const pClassLower = (d.predicted_class || '').toLowerCase();
        const isIndustrial = pClassLower.includes('industrial');
        const isPersistent = pClassLower.includes('persistent');

        if (isSelected) {
          mainColor = 0xff1e1e;
          coreColor = 0xffffff;
          coreRadius = 1.5;
          beamHeight = 22.0;
          beamOpacity = 0.9;
          showOuterWave = true;
        } else if (isIndustrial) {
          mainColor = 0xef4444;
          coreColor = 0xef4444;
          coreRadius = 1.1;
          beamHeight = 10.0;
          beamOpacity = 0.75;
          showOuterWave = false;
        } else if (isPersistent) {
          mainColor = 0xf59e0b;
          coreColor = 0xf59e0b;
          coreRadius = 0.95;
          beamHeight = 8.0;
          beamOpacity = 0.65;
          showOuterWave = false;
        } else {
          mainColor = 0x38bdf8;
          coreColor = 0x38bdf8;
          coreRadius = 0.8;
          beamHeight = 6.0;
          beamOpacity = 0.6;
          showOuterWave = false;
        }
      }

      // 1. Glowing Center Point (Sphere)
      const coreGeo = new THREE.SphereGeometry(coreRadius, 16, 16);
      const coreMat = new THREE.MeshBasicMaterial({
        color: coreColor,
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      markerRoot.add(coreMesh);

      // 2. Vertical Light Beacon (Pillar pointing along surface normal)
      const pillarGeo = new THREE.CylinderGeometry(0.2, isSelected ? 0.9 : 0.6, beamHeight, 8);
      pillarGeo.rotateX(Math.PI / 2); // Orient along +Z
      pillarGeo.translate(0, 0, beamHeight / 2);
      const pillarMat = new THREE.MeshBasicMaterial({
        color: mainColor,
        transparent: true,
        opacity: beamOpacity,
      });
      const pillarMesh = new THREE.Mesh(pillarGeo, pillarMat);
      markerRoot.add(pillarMesh);

      // 3. Pulsing Base Radar Ring on surface
      const ringRadius = coreRadius * (isSelected ? 3.2 : 2.5);
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

      // 4. Expanding Radar Wave Ring (Especially for Selected / Critical / High-FRP Hotspot)
      if (showOuterWave) {
        const outerRadarGeo = new THREE.RingGeometry(ringRadius * 0.9, ringRadius * 1.1, 24);
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
  }, [detections, selectedDetection, earthMode]);

  // Smooth Globe Rotation & Controlled Zoom on Selected Detection
  useEffect(() => {
    if (!selectedDetection || !earthGroupRef.current || !cameraRef.current) return;

    const lat = parseFloat(selectedDetection.latitude);
    const lon = parseFloat(selectedDetection.longitude);
    if (isNaN(lat) || isNaN(lon)) return;

    // Upright geographic orientation: target lat/lon centered, North strictly UP
    const targetQ = getUprightOrientationForLatLng(lat, lon);

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

  // Dedicated Focus Trigger (for Focus on Location button)
  useEffect(() => {
    if (!focusTrigger || !earthGroupRef.current || !cameraRef.current) return;
    const targetDet = selectedDetection || (detections.length > 0 ? detections[0] : null);
    if (!targetDet) return;

    const lat = parseFloat(targetDet.latitude);
    const lon = parseFloat(targetDet.longitude);
    if (isNaN(lat) || isNaN(lon)) return;

    const targetQ = getUprightOrientationForLatLng(lat, lon);

    startQuaternionRef.current.copy(earthGroupRef.current.quaternion);
    targetQuaternionRef.current.copy(targetQ);
    startDistanceRef.current = cameraDistanceRef.current;
    targetDistanceRef.current = CAMERA_DIST_DETECTION;
    transitionProgressRef.current = 0;
    isTransitioningRef.current = true;
    lastInteractionTimeRef.current = Date.now();
    setCameraState('TRANSITION');
  }, [focusTrigger]);

  // Handle Reset Global View
  const handleResetView = useCallback(() => {
    if (!earthGroupRef.current) return;
    onSelectDetection(null);

    // Rotate back to canonical upright view of Indian subcontinent (~21N, 78E)
    const targetQ = getUprightOrientationForLatLng(21, 78);

    startQuaternionRef.current.copy(earthGroupRef.current.quaternion);
    targetQuaternionRef.current.copy(targetQ);
    startDistanceRef.current = cameraDistanceRef.current;
    targetDistanceRef.current = CAMERA_DIST_GLOBAL; // Return to comfortable global view

    transitionProgressRef.current = 0;
    isTransitioningRef.current = true;
    lastInteractionTimeRef.current = Date.now();
    setCameraState('TRANSITION');
  }, [onSelectDetection]);

  // Handle Zoom In / Zoom Out Buttons (Operational and responsive)
  const handleZoomIn = () => {
    isTransitioningRef.current = false;
    lastInteractionTimeRef.current = Date.now();
    targetCameraDistanceRef.current = THREE.MathUtils.clamp(
      targetCameraDistanceRef.current - 32,
      CAMERA_DIST_MIN,
      CAMERA_DIST_MAX
    );
  };
  const handleZoomOut = () => {
    isTransitioningRef.current = false;
    lastInteractionTimeRef.current = Date.now();
    targetCameraDistanceRef.current = THREE.MathUtils.clamp(
      targetCameraDistanceRef.current + 32,
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

  // Switch Earth Visualization Mode smoothly without page reload or camera jump
  const handleModeSwitch = (newMode) => {
    setEarthMode(newMode);
    if (onModeChange) onModeChange(newMode);
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: isOverview ? '100%' : 'calc(100vh - 120px)',
        minHeight: isOverview ? '100%' : '620px',
        overflow: 'hidden',
        background: '#030712',
        borderRadius: isOverview ? '0px' : '12px',
        border: isOverview ? 'none' : '1px solid #1e293b',
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

      {/* 
        ============================================================
        TOP SELECTABLE EARTH VIEWPORT SWITCHER
        [ 🌍 NORMAL ] [ 🔥 THERMAL ] [ ✦ HYBRID ]
        Hidden in Overview and Earth Intelligence to keep a clean single visual
        ============================================================
      */}
      {!isOverview && !hideModeSelector && !isEarthIntelligence && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 25,
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(11, 23, 38, 0.92)',
            backdropFilter: 'blur(14px)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '8px',
            padding: '3px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.65)',
            gap: '4px',
            pointerEvents: 'auto',
          }}
        >
          {/* MODE 1: NORMAL */}
          <button
            onClick={() => handleModeSwitch('normal')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              fontSize: '11.5px',
              fontWeight: earthMode === 'normal' ? 700 : 500,
              color: earthMode === 'normal' ? '#FFFFFF' : '#94A3B8',
              background: earthMode === 'normal' ? 'rgba(56, 189, 248, 0.22)' : 'transparent',
              border: earthMode === 'normal' ? '1px solid #38BDF8' : '1px solid transparent',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.18s ease',
              boxShadow: earthMode === 'normal' ? '0 0 14px rgba(56, 189, 248, 0.3)' : 'none',
            }}
            title="Normal Mode: High-quality realistic Earth with natural land, oceans, clouds, and lighting"
          >
            <span>🌍</span>
            <span>NORMAL</span>
          </button>

          {/* MODE 2: THERMAL */}
          <button
            onClick={() => handleModeSwitch('thermal')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              fontSize: '11.5px',
              fontWeight: earthMode === 'thermal' ? 700 : 500,
              color: earthMode === 'thermal' ? '#FFFFFF' : '#94A3B8',
              background: earthMode === 'thermal' ? 'rgba(56, 189, 248, 0.22)' : 'transparent',
              border: earthMode === 'thermal' ? '1px solid #38BDF8' : '1px solid transparent',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.18s ease',
              boxShadow: earthMode === 'thermal' ? '0 0 14px rgba(56, 189, 248, 0.3)' : 'none',
            }}
            title="Thermal Mode: Pure Blue Digital Earth with Red FIRMS Thermal Anomaly Hotspots"
          >
            <span style={{ color: '#EF4444' }}>🔥</span>
            <span>THERMAL</span>
          </button>

          {/* MODE 3: HYBRID */}
          <button
            onClick={() => handleModeSwitch('hybrid')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              fontSize: '11.5px',
              fontWeight: earthMode === 'hybrid' ? 700 : 500,
              color: earthMode === 'hybrid' ? '#FFFFFF' : '#94A3B8',
              background: earthMode === 'hybrid' ? 'rgba(56, 189, 248, 0.22)' : 'transparent',
              border: earthMode === 'hybrid' ? '1px solid #38BDF8' : '1px solid transparent',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.18s ease',
              boxShadow: earthMode === 'hybrid' ? '0 0 14px rgba(56, 189, 248, 0.3)' : 'none',
            }}
            title="Hybrid Mode: Realistic Earth surface combined with vivid Red Thermal Anomaly overlay"
          >
            <span style={{ color: '#38BDF8' }}>✦</span>
            <span>HYBRID</span>
          </button>
        </div>
      )}

      {/* 
        ============================================================
        THERMAL INTELLIGENCE LEGEND
        Visible when THERMAL or HYBRID mode is active (suppressed in Earth Intelligence to prevent duplicate)
        ============================================================
      */}
      {!isOverview && !isEarthIntelligence && (earthMode === 'thermal' || earthMode === 'hybrid') && (
        <div
          style={{
            position: 'absolute',
            bottom: 20,
            left: 16,
            zIndex: 20,
            background: 'rgba(11, 23, 38, 0.9)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: '8px',
            padding: '8px 12px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.55)',
            display: 'flex',
            flexDirection: 'column',
            gap: '5px',
            fontSize: '11px',
            color: '#94A3B8',
            minWidth: '180px',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#38BDF8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Thermal Intelligence Legend
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#0284C7', border: '1px solid #38BDF8', flexShrink: 0 }} />
            <span><strong style={{ color: '#38BDF8' }}>BLUE</strong> &mdash; Earth Surface</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444', flexShrink: 0 }} />
            <span><strong style={{ color: '#EF4444' }}>RED</strong> &mdash; Thermal Detection</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF1E1E', boxShadow: '0 0 6px #FF1E1E', flexShrink: 0 }} />
            <span><strong style={{ color: '#FF1E1E' }}>BRIGHT RED</strong> &mdash; High Thermal FRP</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FFFFFF', border: '2px solid #FF1E1E', boxShadow: '0 0 8px #FF1E1E', flexShrink: 0 }} />
            <span><strong style={{ color: '#FF4545' }}>PULSING RED</strong> &mdash; Selected / Critical</span>
          </div>
        </div>
      )}

      {/* Floating HUD: Top Left Status & Mode Switcher (Suppressed in Earth Intelligence to ensure NO 2D MAP exists) */}
      {!isOverview && !isEarthIntelligence && (
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
      )}

      {/* Floating HUD: Top Right Camera & Orbit Controls */}
      {!isOverview && !isEarthIntelligence && (
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
      )}

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
      {!isOverview && reticleState && reticleState.visible && (
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9.5px', fontWeight: 700, color: '#EF4444', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              <Flame size={12} style={{ color: '#EF4444' }} />
              <span>Fire Detected • Exact Target</span>
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 700, color: '#FFFFFF', marginTop: '2px' }}>
              LAT: {reticleState.lat.toFixed(6)}°<br />LON: {reticleState.lon.toFixed(6)}°
            </div>
            <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '1px' }}>
              {reticleState.cls} {reticleState.frp ? `• ${parseFloat(reticleState.frp).toFixed(1)} MW` : ''}
            </div>
          </div>
        </div>
      )}

      {/* 
        ============================================================
        REFERENCE DESIGN OVERLAYS:
        - Right-side Vertical Controls Pill (+, -, Target, Globe)
        - Bottom-left Compass Rose & Compact Legend
        - Bottom-right Exact Coordinate Telemetry Readout
        - Top-left Tagline & Live Satellite Feed Box
        ============================================================
      */}

      {/* Right-side Vertical Controls Pill */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          right: 16,
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(11, 23, 38, 0.92)',
          backdropFilter: 'blur(14px)',
          borderRadius: '10px',
          border: '1px solid rgba(56, 189, 248, 0.28)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.65)',
          padding: '4px',
          gap: '4px',
          zIndex: 20,
        }}
      >
        {/* 1. Zoom In (+) */}
        <button
          onClick={handleZoomIn}
          style={{
            background: 'transparent',
            border: 'none',
            borderRadius: '6px',
            color: '#FFFFFF',
            padding: '5px 7px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            fontWeight: 700,
            lineHeight: 1,
            width: '32px',
            height: '32px',
          }}
          title="Zoom In (Smooth Camera Altitude)"
        >
          +
        </button>

        {/* 2. Zoom Out (−) */}
        <button
          onClick={handleZoomOut}
          style={{
            background: 'transparent',
            border: 'none',
            borderRadius: '6px',
            color: '#FFFFFF',
            padding: '5px 7px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            fontWeight: 700,
            lineHeight: 1,
            width: '32px',
            height: '32px',
          }}
          title="Zoom Out"
        >
          &minus;
        </button>

        {/* 3. Focus / Target Hotspot */}
        <button
          onClick={() => {
            const targetDet = selectedDetection || (detections.length > 0 ? detections[0] : null);
            if (targetDet) {
              const lat = parseFloat(targetDet.latitude);
              const lon = parseFloat(targetDet.longitude);
              if (!isNaN(lat) && !isNaN(lon) && earthGroupRef.current) {
                if (!selectedDetection) {
                  onSelectDetection(targetDet);
                }
                const targetQ = getUprightOrientationForLatLng(lat, lon);
                startQuaternionRef.current.copy(earthGroupRef.current.quaternion);
                targetQuaternionRef.current.copy(targetQ);
                startDistanceRef.current = cameraDistanceRef.current;
                targetDistanceRef.current = CAMERA_DIST_DETECTION;
                transitionProgressRef.current = 0;
                isTransitioningRef.current = true;
                lastInteractionTimeRef.current = Date.now();
                setCameraState('TRANSITION');
              }
            }
          }}
          style={{
            background: 'transparent',
            border: 'none',
            borderRadius: '6px',
            color: '#38BDF8',
            padding: '7px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
          }}
          title="Focus / Target Active Hotspot"
        >
          <Target size={16} />
        </button>

        {/* 4. Globe / Reset View */}
        <button
          onClick={handleResetView}
          style={{
            background: 'transparent',
            border: 'none',
            borderRadius: '6px',
            color: '#94A3B8',
            padding: '7px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
          }}
          title="Globe / Reset to Global Orbit View"
        >
          <Globe size={15} />
        </button>
      </div>

      {/* Bottom-right Coordinate Telemetry (Reference Match) */}
      {!isOverview && !isEarthIntelligence && (
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            right: 16,
            zIndex: 15,
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#94A3B8',
            lineHeight: 1.5,
            textAlign: 'right',
            pointerEvents: 'none',
            background: 'rgba(11, 23, 38, 0.75)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(56, 189, 248, 0.18)',
            borderRadius: '6px',
            padding: '6px 10px',
          }}
        >
          <div>
            Lat: <span style={{ color: '#FFFFFF', fontWeight: 700 }}>
              {selectedDetection
                ? `${Math.abs(parseFloat(selectedDetection.latitude)).toFixed(4)}° ${parseFloat(selectedDetection.latitude) >= 0 ? 'N' : 'S'}`
                : detections.length > 0
                ? `${Math.abs(parseFloat(detections[0].latitude)).toFixed(4)}° ${parseFloat(detections[0].latitude) >= 0 ? 'N' : 'S'}`
                : '22.8046° N'}
            </span>
          </div>
          <div>
            Lon: <span style={{ color: '#FFFFFF', fontWeight: 700 }}>
              {selectedDetection
                ? `${Math.abs(parseFloat(selectedDetection.longitude)).toFixed(4)}° ${parseFloat(selectedDetection.longitude) >= 0 ? 'E' : 'W'}`
                : detections.length > 0
                ? `${Math.abs(parseFloat(detections[0].longitude)).toFixed(4)}° ${parseFloat(detections[0].longitude) >= 0 ? 'E' : 'W'}`
                : '86.2029° E'}
            </span>
          </div>
          <div style={{ color: '#38BDF8', fontSize: '10px' }}>
            Alt: 36,000 km
          </div>
        </div>
      )}

      {/* Bottom-left Compass Rose & Compact Legend (Reference Match) */}
      {!isOverview && !isEarthIntelligence && (
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            zIndex: 15,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            pointerEvents: 'none',
          }}
        >
          {/* Compass Rose */}
          <div
            style={{
              width: 44,
              height: 44,
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
              <circle cx="22" cy="22" r="19" stroke="rgba(56, 189, 248, 0.35)" strokeWidth="1" strokeDasharray="2 3" />
              <circle cx="22" cy="22" r="9" stroke="rgba(56, 189, 248, 0.6)" strokeWidth="1" />
              <line x1="22" y1="3" x2="22" y2="41" stroke="rgba(56, 189, 248, 0.4)" strokeWidth="1" />
              <line x1="3" y1="22" x2="41" y2="22" stroke="rgba(56, 189, 248, 0.4)" strokeWidth="1" />
              <circle cx="22" cy="22" r="2.5" fill="#38BDF8" />
            </svg>
            <span style={{ position: 'absolute', top: -3, left: '50%', transform: 'translateX(-50%)', fontSize: '9px', fontWeight: 800, color: '#38BDF8' }}>N</span>
            <span style={{ position: 'absolute', bottom: -3, left: '50%', transform: 'translateX(-50%)', fontSize: '9px', fontWeight: 800, color: '#64748B' }}>S</span>
            <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', fontSize: '9px', fontWeight: 800, color: '#64748B' }}>W</span>
            <span style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', fontSize: '9px', fontWeight: 800, color: '#64748B' }}>E</span>
          </div>

          {/* Compact Legend */}
          <div
            style={{
              background: 'rgba(11, 23, 38, 0.88)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              borderRadius: '8px',
              padding: '6px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '11px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#EF4444', boxShadow: '0 0 6px #EF4444' }} />
              <span style={{ color: '#F8FAFC', fontWeight: 500 }}>High</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#F59E0B', boxShadow: '0 0 6px #F59E0B' }} />
              <span style={{ color: '#F8FAFC', fontWeight: 500 }}>Medium</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#EAB308' }} />
              <span style={{ color: '#F8FAFC', fontWeight: 500 }}>Low</span>
            </div>
          </div>
        </div>
      )}

      {/* Top-left Tagline & Live Satellite Feed Box (Reference Match) */}
      {!isOverview && !hideFloatingFeed && !isEarthIntelligence && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            zIndex: 15,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.12em', color: 'var(--primary-cyan)', textTransform: 'uppercase' }}>
            OUR PLANET<br />
            <span style={{ color: '#FFFFFF' }}>OUR RESPONSIBILITY</span>
          </div>

          <div
            style={{
              background: 'rgba(11, 23, 38, 0.88)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: '8px',
              padding: '8px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '3px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              minWidth: '150px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', fontWeight: 800, color: '#38BDF8', letterSpacing: '0.06em' }}>
              <Radio size={12} style={{ color: '#38BDF8' }} />
              <span>LIVE SATELLITE FEED</span>
            </div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#FFFFFF' }}>
              VIIRS (S-NPP)
            </div>
            <div style={{ fontSize: '9.5px', color: '#94A3B8', fontFamily: 'monospace' }}>
              {new Date().toISOString().slice(0, 10)} UTC
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '9.5px', color: '#10B981', marginTop: '2px' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 6px #10B981' }} />
              <span>Global Monitoring</span>
            </div>
          </div>
        </div>
      )}

      {/* Right Intelligence Panel (Slide-out HUD when Hotspot is Selected) */}
      {!isOverview && !hideSidePanel && selectedDetection && (
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
      {!isOverview && !isEarthIntelligence && (
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
      )}
    </div>
  );
}
