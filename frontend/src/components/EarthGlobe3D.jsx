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
  ExternalLink,
  Copy,
  Check,
  Compass,
} from 'lucide-react';
import { StatusBadge, ClassBadge, ProvenanceBadge } from './StatusBadge';

// Helper: Convert Lat/Lng in degrees to 3D Cartesian coordinates matching Three.js equirectangular UV mapping
function latLngToVector3(lat, lng, radius) {
  const radLat = (lat * Math.PI) / 180;
  const radLon = (lng * Math.PI) / 180;
  const x = radius * Math.cos(radLat) * Math.cos(radLon);
  const y = radius * Math.sin(radLat);
  const z = -radius * Math.cos(radLat) * Math.sin(radLon);
  return new THREE.Vector3(x, y, z);
}

// Fallback procedural Earth texture if texture image fails or is loading
function createFallbackEarthTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Deep space ocean
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, 512);
  oceanGrad.addColorStop(0, '#061226');
  oceanGrad.addColorStop(0.5, '#040d1a');
  oceanGrad.addColorStop(1, '#061226');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, 1024, 512);

  // Subtle coordinate grid
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
  ctx.lineWidth = 1;
  for (let x = 0; x < 1024; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }
  for (let y = 0; y < 512; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1024, y);
    ctx.stroke();
  }

  // Equator highlight
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
  ctx.beginPath();
  ctx.moveTo(0, 256);
  ctx.lineTo(1024, 256);
  ctx.stroke();

  return new THREE.CanvasTexture(canvas);
}

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
  const cameraDistanceRef = useRef(240);
  const targetCameraDistanceRef = useRef(240);

  // Animation Transition (Fly-To) Refs
  const isTransitioningRef = useRef(false);
  const transitionProgressRef = useRef(0);
  const startQuaternionRef = useRef(new THREE.Quaternion());
  const targetQuaternionRef = useRef(new THREE.Quaternion());
  const startDistanceRef = useRef(240);
  const targetDistanceRef = useRef(240);

  // UI States
  const [autoRotate, setAutoRotate] = useState(true);
  const [hoveredDetection, setHoveredDetection] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [copiedCoords, setCopiedCoords] = useState(false);

  // Sync state to ref
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
    scene.background = new THREE.Color(0x030712); // Cosmic slate black

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 1500);
    camera.position.set(0, 0, 240);
    cameraRef.current = camera;

    // 3. WebGL Renderer
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Earth Master Group (rotates on sphere)
    const earthGroup = new THREE.Group();
    scene.add(earthGroup);
    earthGroupRef.current = earthGroup;

    // 5. Starfield Background (Deep Space)
    const starGeo = new THREE.BufferGeometry();
    const starCount = 1400;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      const r = 600 + Math.random() * 400;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i + 2] = r * Math.cos(phi);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0x94a3b8,
      size: 1.2,
      transparent: true,
      opacity: 0.65,
    });
    const starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);

    // 6. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.48);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.4);
    sunLight.position.set(160, 90, 140);
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.35);
    rimLight.position.set(-140, -60, -100);
    scene.add(rimLight);

    // 7. Earth Sphere Geometry & Texture
    const earthRadius = 100;
    const earthGeo = new THREE.SphereGeometry(earthRadius, 64, 64);

    // Texture Loader with immediate procedural fallback
    const textureLoader = new THREE.TextureLoader();
    const fallbackTex = createFallbackEarthTexture();

    const earthMat = new THREE.MeshStandardMaterial({
      map: fallbackTex,
      roughness: 0.82,
      metalness: 0.1,
    });

    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    earthGroup.add(earthMesh);

    // Asynchronously load real NASA Blue Marble satellite daymap
    textureLoader.load(
      '/textures/earth_daymap.jpg',
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        earthMat.map = tex;
        earthMat.needsUpdate = true;
      },
      undefined,
      (err) => {
        console.warn('Local Earth texture unavailable, procedural texture active:', err);
      }
    );

    // 8. Atmospheric Cloud Layer
    const cloudsGeo = new THREE.SphereGeometry(earthRadius + 0.8, 48, 48);
    const cloudsMat = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 0.22,
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
        cloudsMat.map = tex;
        cloudsMat.needsUpdate = true;
      },
      undefined,
      () => {}
    );

    // 9. Atmospheric Limb Glow (Fresnel Shader Outer Sphere)
    const atmosGeo = new THREE.SphereGeometry(earthRadius + 2.5, 48, 48);
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
          float intensity = pow(0.68 - dot(vNormal, vec3(0, 0, 1.0)), 2.6);
          gl_FragColor = vec4(0.22, 0.65, 0.98, 1.0) * intensity * 0.75;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    const atmosMesh = new THREE.Mesh(atmosGeo, atmosMat);
    earthGroup.add(atmosMesh);

    // 10. Markers Container Group
    const markersGroup = new THREE.Group();
    earthGroup.add(markersGroup);
    markersGroupRef.current = markersGroup;

    // Initial position: center slightly on Indian subcontinent (approx 20N, 78E)
    const initTarget = latLngToVector3(20, 78, earthRadius).normalize();
    const initQ = new THREE.Quaternion().setFromUnitVectors(
      initTarget,
      new THREE.Vector3(0, 0, 1)
    );
    earthGroup.quaternion.copy(initQ);

    // 11. Mouse & Touch Event Handlers for Drag / Orbit / Zoom
    const onPointerDown = (e) => {
      isDraggingRef.current = true;
      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
      lastInteractionTimeRef.current = Date.now();
      isTransitioningRef.current = false; // Stop any ongoing fly-to on manual drag
    };

    const onPointerMove = (e) => {
      lastInteractionTimeRef.current = Date.now();

      if (isDraggingRef.current) {
        const deltaX = e.clientX - previousMousePositionRef.current.x;
        const deltaY = e.clientY - previousMousePositionRef.current.y;

        // Rotate Earth group directly via delta
        const rotY = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          deltaX * 0.004
        );
        const rotX = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(1, 0, 0),
          deltaY * 0.004
        );

        earthGroup.quaternion.premultiply(rotY);
        earthGroup.quaternion.premultiply(rotX);

        previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
      } else {
        // Raycast for marker hover
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
      const zoomDelta = e.deltaY * 0.15;
      targetCameraDistanceRef.current = THREE.MathUtils.clamp(
        targetCameraDistanceRef.current + zoomDelta,
        135,
        340
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
        // Find ancestor with detection data
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

    // 13. Main Render / Animation Loop using high-precision performance.now()
    let lastTime = performance.now();
    const startTime = performance.now();

    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      const currentTime = performance.now();
      const delta = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;
      const elapsedTime = (currentTime - startTime) / 1000;
      const now = Date.now();

      // Smooth camera zoom lerp
      cameraDistanceRef.current = THREE.MathUtils.lerp(
        cameraDistanceRef.current,
        targetCameraDistanceRef.current,
        0.08
      );
      camera.position.z = cameraDistanceRef.current;

      // Handle Smooth Fly-To / Slerp
      if (isTransitioningRef.current) {
        transitionProgressRef.current = Math.min(
          1,
          transitionProgressRef.current + delta * 0.95
        );
        // Smooth easeInOutCubic
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
        }
      } else {
        // Controlled Auto-Rotation
        // Only auto-rotate if enabled, user hasn't dragged in 5 seconds, and no detection actively selected
        const timeSinceInteraction = now - lastInteractionTimeRef.current;
        const canAutoRotate =
          autoRotateRef.current &&
          !isDraggingRef.current &&
          timeSinceInteraction > 5000 &&
          !selectedDetection;

        if (canAutoRotate) {
          const rotDelta = 0.0008; // Subtle, professional rotation (~80s per rev)
          const qRotate = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            rotDelta
          );
          earthGroup.quaternion.premultiply(qRotate);
        }
      }

      // Atmospheric cloud independent slow drift
      if (cloudsMeshRef.current) {
        cloudsMeshRef.current.rotation.y += 0.00015;
      }

      // Hotspot marker pulses (scale radar rings)
      if (markersGroupRef.current) {
        markersGroupRef.current.children.forEach((marker) => {
          if (marker.userData?.ringMesh) {
            const scale = 1.0 + Math.sin(elapsedTime * 3 + (marker.userData.pulsePhase || 0)) * 0.25;
            marker.userData.ringMesh.scale.set(scale, scale, scale);
          }
        });
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

  // Update Hotspot Markers when detections change
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

    // Radius of Earth is 100
    const surfaceRadius = 100.3;

    detections.forEach((d, idx) => {
      const lat = parseFloat(d.latitude);
      const lon = parseFloat(d.longitude);
      if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return;

      const pos = latLngToVector3(lat, lon, surfaceRadius);
      const normal = pos.clone().normalize();

      // Marker Container
      const markerRoot = new THREE.Group();
      markerRoot.position.copy(pos);
      // Orient group so that +Z points outward along the normal
      markerRoot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      markerRoot.userData = { detection: d, pulsePhase: idx * 0.7 };

      const pClassLower = (d.predicted_class || '').toLowerCase();
      const isIndustrial = pClassLower.includes('industrial');
      const isPersistent = pClassLower.includes('persistent') || d.is_persistent;
      const isLowConf = (parseFloat(d.prediction_confidence || 0.9) < 0.6) || d.uncertainty_flag === 'LOW_CONFIDENCE_REVIEW';

      // Colors
      let mainColor = 0x06b6d4; // Cyan (other)
      let emissiveColor = 0x0891b2;
      let beamHeight = 6.0;

      if (isIndustrial) {
        mainColor = 0xef4444; // Red (Industrial Fire)
        emissiveColor = 0xff2222;
        beamHeight = Math.min(22, 10 + (parseFloat(d.frp || 40) / 10));
      } else if (isPersistent) {
        mainColor = 0xf59e0b; // Amber (Persistent Thermal Source)
        emissiveColor = 0xd97706;
        beamHeight = Math.min(16, 7 + (parseFloat(d.frp || 25) / 12));
      }

      if (isLowConf) {
        mainColor = 0xa855f7; // Purple uncertainty
        emissiveColor = 0x9333ea;
      }

      // 1. Glowing Core Sphere
      const coreRadius = isIndustrial ? 1.4 : isPersistent ? 1.1 : 0.8;
      const coreGeo = new THREE.SphereGeometry(coreRadius, 16, 16);
      const coreMat = new THREE.MeshBasicMaterial({
        color: mainColor,
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      markerRoot.add(coreMesh);

      // 2. Vertical Light Beacon (Pillar pointing along surface normal)
      const pillarGeo = new THREE.CylinderGeometry(0.3, 0.8, beamHeight, 8);
      pillarGeo.rotateX(Math.PI / 2); // Orient along +Z
      pillarGeo.translate(0, 0, beamHeight / 2);
      const pillarMat = new THREE.MeshBasicMaterial({
        color: mainColor,
        transparent: true,
        opacity: isIndustrial ? 0.8 : 0.6,
      });
      const pillarMesh = new THREE.Mesh(pillarGeo, pillarMat);
      markerRoot.add(pillarMesh);

      // 3. Pulsing Radar Ring on surface
      const ringRadius = coreRadius * 2.6;
      const ringGeo = new THREE.RingGeometry(ringRadius * 0.7, ringRadius, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: mainColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      markerRoot.add(ringMesh);
      markerRoot.userData.ringMesh = ringMesh;

      group.add(markerRoot);
    });
  }, [detections]);

  // Smooth Fly-To / Rotate Globe when selectedDetection changes
  useEffect(() => {
    if (!selectedDetection || !earthGroupRef.current || !cameraRef.current) return;

    const lat = parseFloat(selectedDetection.latitude);
    const lon = parseFloat(selectedDetection.longitude);
    if (isNaN(lat) || isNaN(lon)) return;

    // Vector pointing from center to this lat/lon
    const targetPt = latLngToVector3(lat, lon, 100).normalize();

    // We want a rotation Q such that Q * targetPt = (0, 0, 1) (directly facing the camera on +Z)
    const targetQ = new THREE.Quaternion().setFromUnitVectors(
      targetPt,
      new THREE.Vector3(0, 0, 1)
    );

    // Initialize smooth slerp transition
    startQuaternionRef.current.copy(earthGroupRef.current.quaternion);
    targetQuaternionRef.current.copy(targetQ);

    startDistanceRef.current = cameraDistanceRef.current;
    targetDistanceRef.current = 145; // Close-up focus zoom!

    transitionProgressRef.current = 0;
    isTransitioningRef.current = true;
    lastInteractionTimeRef.current = Date.now();
  }, [selectedDetection]);

  // Handle Reset Global View
  const handleResetView = useCallback(() => {
    if (!earthGroupRef.current) return;
    onSelectDetection(null);

    // Rotate back to global view of Indian subcontinent
    const initTarget = latLngToVector3(22, 79, 100).normalize();
    const targetQ = new THREE.Quaternion().setFromUnitVectors(
      initTarget,
      new THREE.Vector3(0, 0, 1)
    );

    startQuaternionRef.current.copy(earthGroupRef.current.quaternion);
    targetQuaternionRef.current.copy(targetQ);
    startDistanceRef.current = cameraDistanceRef.current;
    targetDistanceRef.current = 240; // Global Earth view

    transitionProgressRef.current = 0;
    isTransitioningRef.current = true;
    lastInteractionTimeRef.current = Date.now();
  }, [onSelectDetection]);

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
            background: 'rgba(15, 23, 42, 0.85)',
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
              fontSize: '12.5px',
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
              fontSize: '12.5px',
              fontWeight: 500,
              color: '#94A3B8',
              background: 'transparent',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="Switch to detailed 2D Leaflet GIS map"
          >
            <span>🗺️</span>
            <span>2D Map</span>
          </button>
        </div>

        {/* Global Telemetry Card */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.82)',
            backdropFilter: 'blur(10px)',
            padding: '10px 14px',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            fontSize: '11.5px',
            color: '#94A3B8',
            maxWidth: '220px',
            lineHeight: 1.5,
          }}
        >
          <div style={{ color: '#F8FAFC', fontWeight: 700, fontSize: '12px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Compass size={14} style={{ color: 'var(--accent-cyan)' }} />
            <span>Earth Observation</span>
          </div>
          <div>Active Hotspots: <strong style={{ color: '#38BDF8' }}>{detections.length}</strong></div>
          <div>Sensor Grid: <strong style={{ color: '#F8FAFC' }}>VIIRS / MODIS</strong></div>
          <div>Model: <strong style={{ color: '#A855F7', fontFamily: 'monospace' }}>v2.0.0-prototype</strong></div>
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
            background: autoRotate ? 'rgba(56, 189, 248, 0.15)' : 'rgba(15, 23, 42, 0.8)',
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
            background: 'rgba(15, 23, 42, 0.8)',
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
          <div style={{ fontSize: '10px', color: '#38BDF8', marginTop: '2px' }}>
            Click to focus & inspect telemetry
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
            width: '350px',
            maxWidth: 'calc(100% - 32px)',
            background: 'rgba(15, 23, 42, 0.92)',
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
              <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.08em', color: '#38BDF8', textTransform: 'uppercase' }}>
                Thermal Event Intelligence
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

          {/* Critical Operational Verification Warning Banner */}
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
            AI model prediction indicates potential industrial event. Ground or optical imagery verification required before emergency dispatch.
          </div>

          {/* Telemetry Metrics Grid */}
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

          {/* Coordinates & Timestamp */}
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '10px 12px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.06)', fontSize: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ color: '#94A3B8' }}>Coordinates:</span>
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
            <div style={{ fontFamily: 'monospace', color: '#FFFFFF', fontWeight: 600 }}>
              {parseFloat(selectedDetection.latitude).toFixed(4)}° N, {parseFloat(selectedDetection.longitude).toFixed(4)}° E
            </div>
            <div style={{ color: '#94A3B8', marginTop: '6px', fontSize: '11.5px' }}>
              Acquired: <strong style={{ color: '#FFFFFF' }}>{selectedDetection.acq_date} {selectedDetection.acq_time} UTC</strong>
            </div>
            <div style={{ color: '#94A3B8', marginTop: '4px', fontSize: '11.5px' }}>
              Model Version: <strong style={{ color: '#A855F7', fontFamily: 'monospace' }}>{selectedDetection.model_version || '2.0.0-scientific-prototype'}</strong>
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
            >
              <MapPin size={14} />
              <span>Inspect on 2D GIS Map</span>
            </button>
            <button
              onClick={() => onSelectDetection(null)}
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

      {/* Bottom Hint */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(8px)',
          padding: '4px 14px',
          borderRadius: '20px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          color: '#64748B',
          fontSize: '11px',
          pointerEvents: 'none',
          zIndex: 5,
        }}
      >
        Left Click + Drag to Orbit • Scroll to Zoom • Click Hotspot to Focus
      </div>
    </div>
  );
}
