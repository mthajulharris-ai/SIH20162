import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  Sparkles,
  Info,
  RotateCw,
  Compass,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';

/**
 * Procedural Astronomical Planetary Texture Generators
 * Creates realistic, high-resolution scientific surface maps for Solar System bodies.
 */
function createMercuryTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // Barren, heavily cratered grey-brown regolith
  ctx.fillStyle = '#423F3D';
  ctx.fillRect(0, 0, 2048, 1024);

  // Surface variegation & highlands/lowlands
  for (let i = 0; i < 400; i++) {
    const x = Math.random() * 2048;
    const y = Math.random() * 1024;
    const r = 20 + Math.random() * 120;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, Math.random() > 0.5 ? 'rgba(90, 85, 80, 0.4)' : 'rgba(35, 33, 30, 0.4)');
    grad.addColorStop(1, 'rgba(66, 63, 61, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Impact craters with rims and central peaks
  for (let i = 0; i < 150; i++) {
    const cx = Math.random() * 2048;
    const cy = Math.random() * 1024;
    const cr = 4 + Math.random() * 24;

    // Outer crater rim
    ctx.strokeStyle = 'rgba(160, 155, 150, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.stroke();

    // Shadowed floor
    ctx.fillStyle = 'rgba(20, 18, 16, 0.7)';
    ctx.beginPath();
    ctx.arc(cx - 1, cy - 1, cr * 0.8, 0, Math.PI * 2);
    ctx.fill();

    // Central peak for large craters
    if (cr > 14) {
      ctx.fillStyle = 'rgba(180, 175, 170, 0.8)';
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return new THREE.CanvasTexture(canvas);
}

function createVenusTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // Dense sulfuric acid cloud deck: yellowish-cream base
  ctx.fillStyle = '#E8D5A3';
  ctx.fillRect(0, 0, 2048, 1024);

  // Atmospheric super-rotation chevron streaks
  for (let y = 0; y < 1024; y += 4) {
    const lat = ((y - 512) / 512) * Math.PI;
    const factor = Math.cos(lat);
    const grad = ctx.createLinearGradient(0, y, 2048, y);
    grad.addColorStop(0, `rgba(200, 170, 110, ${0.15 * factor})`);
    grad.addColorStop(0.3, `rgba(240, 225, 180, ${0.25 * factor})`);
    grad.addColorStop(0.7, `rgba(180, 150, 90, ${0.2 * factor})`);
    grad.addColorStop(1, `rgba(200, 170, 110, ${0.15 * factor})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, 2048, 4);
  }

  // Swirling convective cloud bands
  for (let i = 0; i < 60; i++) {
    const sx = Math.random() * 2048;
    const sy = 200 + Math.random() * 624;
    ctx.fillStyle = 'rgba(215, 185, 130, 0.22)';
    ctx.beginPath();
    ctx.ellipse(sx, sy, 80 + Math.random() * 200, 15 + Math.random() * 40, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  return new THREE.CanvasTexture(canvas);
}

function createMarsTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // Iron oxide rust-red terrain base
  ctx.fillStyle = '#C85A27';
  ctx.fillRect(0, 0, 2048, 1024);

  // Dark volcanic basalt plains (Syrtis Major, Acidalia Planitia)
  const darkRegions = [
    { x: 900, y: 560, rx: 280, ry: 160 },
    { x: 450, y: 480, rx: 220, ry: 120 },
    { x: 1550, y: 620, rx: 250, ry: 140 },
    { x: 750, y: 380, rx: 180, ry: 90 },
  ];

  darkRegions.forEach((reg) => {
    const grad = ctx.createRadialGradient(reg.x, reg.y, 0, reg.x, reg.y, reg.rx);
    grad.addColorStop(0, 'rgba(65, 30, 15, 0.75)');
    grad.addColorStop(0.6, 'rgba(95, 45, 20, 0.5)');
    grad.addColorStop(1, 'rgba(200, 90, 39, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(reg.x, reg.y, reg.rx, reg.ry, 0.1, 0, Math.PI * 2);
    ctx.fill();
  });

  // Valles Marineris canyon rift system
  ctx.strokeStyle = 'rgba(40, 18, 10, 0.8)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(700, 520);
  ctx.bezierCurveTo(850, 530, 1050, 510, 1200, 535);
  ctx.stroke();

  // Olympus Mons shield caldera
  ctx.fillStyle = 'rgba(150, 60, 25, 0.85)';
  ctx.beginPath();
  ctx.arc(420, 430, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(40, 15, 8, 0.9)';
  ctx.beginPath();
  ctx.arc(420, 430, 8, 0, Math.PI * 2);
  ctx.fill();

  // Brilliant North & South Polar Ice Caps (CO2 + Water Ice)
  // North Pole
  const northCap = ctx.createLinearGradient(0, 0, 0, 110);
  northCap.addColorStop(0, '#FFFFFF');
  northCap.addColorStop(0.7, '#F0F4F8');
  northCap.addColorStop(1, 'rgba(240, 244, 248, 0)');
  ctx.fillStyle = northCap;
  ctx.fillRect(0, 0, 2048, 110);

  // South Pole
  const southCap = ctx.createLinearGradient(0, 1024, 0, 920);
  southCap.addColorStop(0, '#FFFFFF');
  southCap.addColorStop(0.7, '#F0F4F8');
  southCap.addColorStop(1, 'rgba(240, 244, 248, 0)');
  ctx.fillStyle = southCap;
  ctx.fillRect(0, 920, 2048, 104);

  return new THREE.CanvasTexture(canvas);
}

function createJupiterTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // Alternating ammonia & ammonium hydrosulfide atmospheric bands
  const bands = [
    { y1: 0, y2: 120, col: '#7B5C3D' },
    { y1: 120, y2: 210, col: '#C8A982' },
    { y1: 210, y2: 320, col: '#9E623E' },
    { y1: 320, y2: 440, col: '#D9C2A5' },
    { y1: 440, y2: 560, col: '#8B4828' }, // Equatorial Belt
    { y1: 560, y2: 660, col: '#E2D1B8' },
    { y1: 660, y2: 780, col: '#A65E36' },
    { y1: 780, y2: 890, col: '#C2A37B' },
    { y1: 890, y2: 1024, col: '#6E4D31' },
  ];

  bands.forEach((b) => {
    ctx.fillStyle = b.col;
    ctx.fillRect(0, b.y1, 2048, b.y2 - b.y1);
  });

  // Turbulent storm ripples along band boundaries
  for (let y = 50; y < 980; y += 35) {
    ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(240, 230, 215, 0.3)' : 'rgba(80, 40, 20, 0.3)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 2048; x += 64) {
      const cy = y + Math.sin(x * 0.03) * 6 + Math.cos(x * 0.015) * 4;
      ctx.lineTo(x, cy);
    }
    ctx.stroke();
  }

  // The Great Red Spot anticyclonic storm (Southern Hemisphere)
  const grsX = 1350;
  const grsY = 640;
  const grs = ctx.createRadialGradient(grsX, grsY, 0, grsX, grsY, 110);
  grs.addColorStop(0, '#B3381B');
  grs.addColorStop(0.6, '#C44E28');
  grs.addColorStop(0.85, '#D97A52');
  grs.addColorStop(1, 'rgba(226, 209, 184, 0)');
  ctx.fillStyle = grs;
  ctx.beginPath();
  ctx.ellipse(grsX, grsY, 110, 65, 0, 0, Math.PI * 2);
  ctx.fill();

  // White core swirl in Great Red Spot
  ctx.strokeStyle = 'rgba(255, 235, 220, 0.5)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(grsX, grsY, 50, 25, 0, 0, Math.PI * 2);
  ctx.stroke();

  return new THREE.CanvasTexture(canvas);
}

function createSaturnTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // Golden-yellow and butterscotch banded atmosphere
  const saturnBands = [
    { y1: 0, y2: 180, col: '#A39169' },
    { y1: 180, y2: 360, col: '#C9B58B' },
    { y1: 360, y2: 500, col: '#DDC9A1' },
    { y1: 500, y2: 640, col: '#EADCB9' },
    { y1: 640, y2: 800, col: '#CBB78D' },
    { y1: 800, y2: 1024, col: '#9F8D66' },
  ];

  saturnBands.forEach((b) => {
    ctx.fillStyle = b.col;
    ctx.fillRect(0, b.y1, 2048, b.y2 - b.y1);
  });

  // Soft latitudinal blending
  for (let y = 0; y < 1024; y += 8) {
    ctx.fillStyle = `rgba(255, 245, 220, ${0.08 * Math.sin(y * 0.02)})`;
    ctx.fillRect(0, y, 2048, 8);
  }

  return new THREE.CanvasTexture(canvas);
}

function createSaturnRingTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  // Concentric ring density variations: C Ring (inner, faint), B Ring (bright, dense), Cassini Division (dark gap), A Ring (medium), Encke Gap
  const grad = ctx.createLinearGradient(0, 0, 1024, 0);
  grad.addColorStop(0.0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.12, 'rgba(120, 105, 80, 0.25)'); // C Ring (Crepe Ring)
  grad.addColorStop(0.28, 'rgba(160, 140, 105, 0.45)');
  grad.addColorStop(0.30, 'rgba(215, 195, 150, 0.95)'); // B Ring (Bright & Opaque)
  grad.addColorStop(0.60, 'rgba(195, 175, 135, 0.90)');
  grad.addColorStop(0.62, 'rgba(20, 15, 10, 0.08)');   // Cassini Division (4,800 km gap)
  grad.addColorStop(0.65, 'rgba(20, 15, 10, 0.08)');
  grad.addColorStop(0.66, 'rgba(175, 155, 120, 0.75)'); // A Ring
  grad.addColorStop(0.85, 'rgba(150, 135, 105, 0.65)');
  grad.addColorStop(0.87, 'rgba(30, 25, 20, 0.15)');   // Encke Gap
  grad.addColorStop(0.89, 'rgba(140, 125, 95, 0.55)');
  grad.addColorStop(0.96, 'rgba(100, 85, 65, 0.20)');
  grad.addColorStop(1.0, 'rgba(0,0,0,0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 64);

  return new THREE.CanvasTexture(canvas);
}

function createUranusTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // Pale cyan-aquamarine methane ice giant atmosphere
  const grad = ctx.createLinearGradient(0, 0, 0, 1024);
  grad.addColorStop(0, '#58B9BC');
  grad.addColorStop(0.3, '#75D8DB');
  grad.addColorStop(0.5, '#87E5E8');
  grad.addColorStop(0.7, '#75D8DB');
  grad.addColorStop(1, '#58B9BC');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2048, 1024);

  // Subtle polar haze
  ctx.fillStyle = 'rgba(235, 255, 255, 0.18)';
  ctx.fillRect(0, 0, 2048, 180);
  ctx.fillRect(0, 844, 2048, 180);

  return new THREE.CanvasTexture(canvas);
}

function createNeptuneTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // Deep azure-blue dynamic atmosphere
  const grad = ctx.createLinearGradient(0, 0, 0, 1024);
  grad.addColorStop(0, '#1B3573');
  grad.addColorStop(0.25, '#2654B3');
  grad.addColorStop(0.5, '#356CE6');
  grad.addColorStop(0.75, '#2654B3');
  grad.addColorStop(1, '#1B3573');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2048, 1024);

  // High-altitude white methane cirrus cloud streaks ("Scooter")
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  for (let i = 0; i < 18; i++) {
    const sx = Math.random() * 2048;
    const sy = 400 + Math.random() * 260;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 50 + Math.random() * 80, 4 + Math.random() * 6, 0.05, 0, Math.PI * 2);
    ctx.fill();
  }

  // Great Dark Spot (anticyclone)
  const gdsX = 720;
  const gdsY = 480;
  const gds = ctx.createRadialGradient(gdsX, gdsY, 0, gdsX, gdsY, 80);
  gds.addColorStop(0, '#10224C');
  gds.addColorStop(0.7, '#16326E');
  gds.addColorStop(1, 'rgba(53, 108, 230, 0)');
  ctx.fillStyle = gds;
  ctx.beginPath();
  ctx.ellipse(gdsX, gdsY, 80, 45, -0.1, 0, Math.PI * 2);
  ctx.fill();

  return new THREE.CanvasTexture(canvas);
}

const PLANETS = [
  {
    id: 'mercury',
    name: 'Mercury',
    radiusKm: 2440,
    distance: '0.39 AU (57.9M km)',
    period: '88 Earth Days',
    temp: '-180°C to +430°C',
    atmosphere: 'Minimal exosphere (Oxygen, Sodium, Hydrogen)',
    desc: 'The smallest and innermost terrestrial planet in the Solar System. Heavily cratered with Caloris Basin and extreme day/night thermal variance.',
    textureFactory: createMercuryTexture,
    roughness: 0.92,
    metalness: 0.15,
    atmosphereColor: null,
  },
  {
    id: 'venus',
    name: 'Venus',
    radiusKm: 6052,
    distance: '0.72 AU (108.2M km)',
    period: '225 Earth Days',
    temp: '465°C (Runaway Greenhouse)',
    atmosphere: '96.5% Carbon Dioxide, 3.5% Nitrogen, Sulfuric Acid clouds',
    desc: 'Dense greenhouse world with opaque yellowish-cream cloud layers. Surface pressure reaches 92 atmospheres, hot enough to melt lead.',
    textureFactory: createVenusTexture,
    roughness: 0.65,
    metalness: 0.05,
    atmosphereColor: 0xE8D5A3,
  },
  {
    id: 'earth',
    name: 'Earth',
    radiusKm: 6371,
    distance: '1.00 AU (149.6M km)',
    period: '365.25 Days',
    temp: '15°C Average (-89°C to +58°C)',
    atmosphere: '78% Nitrogen, 21% Oxygen, 0.9% Argon',
    desc: 'The primary target of SATRA’s orbital thermal observation mission. Real NASA Blue Marble satellite imagery with atmospheric limb scattering.',
    isPrimaryMission: true,
    roughness: 0.72,
    metalness: 0.12,
    atmosphereColor: 0x38BDF8,
  },
  {
    id: 'mars',
    name: 'Mars',
    radiusKm: 3390,
    distance: '1.52 AU (227.9M km)',
    period: '687 Earth Days',
    temp: '-63°C Average (-140°C to +20°C)',
    atmosphere: '95% Carbon Dioxide, 2.6% Nitrogen, 1.9% Argon',
    desc: 'The Red Planet, featuring iron oxide rust terrain, Olympus Mons volcano, Valles Marineris rift canyon, and dual frozen polar ice caps.',
    textureFactory: createMarsTexture,
    roughness: 0.85,
    metalness: 0.08,
    atmosphereColor: 0xD47545,
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    radiusKm: 69911,
    distance: '5.20 AU (778.5M km)',
    period: '11.86 Earth Years',
    temp: '-110°C Cloud Top',
    atmosphere: '90% Hydrogen, 10% Helium, traces of Methane',
    desc: 'The dominant gas giant with turbulent ammonia cloud belts, equatorial jet streams, and the ancient swirling Great Red Spot anticyclone.',
    textureFactory: createJupiterTexture,
    roughness: 0.55,
    metalness: 0.05,
    atmosphereColor: 0xC49A6C,
  },
  {
    id: 'saturn',
    name: 'Saturn',
    radiusKm: 58232,
    distance: '9.58 AU (1.43B km)',
    period: '29.45 Earth Years',
    temp: '-140°C Cloud Top',
    atmosphere: '96% Hydrogen, 3% Helium',
    desc: 'Banded golden gas giant adorned with a dazzling, complex ring system composed of water ice and rock particles spanning 282,000 km.',
    textureFactory: createSaturnTexture,
    hasRings: true,
    roughness: 0.58,
    metalness: 0.05,
    atmosphereColor: 0xD6C498,
  },
  {
    id: 'uranus',
    name: 'Uranus',
    radiusKm: 25362,
    distance: '19.22 AU (2.87B km)',
    period: '84 Earth Years',
    temp: '-195°C Cloud Top',
    atmosphere: '83% Hydrogen, 15% Helium, 2% Methane',
    desc: 'Aquamarine ice giant with an extreme axial tilt of 98°, effectively rolling along its orbital plane around the Sun.',
    textureFactory: createUranusTexture,
    roughness: 0.45,
    metalness: 0.02,
    atmosphereColor: 0x75D8DB,
  },
  {
    id: 'neptune',
    name: 'Neptune',
    radiusKm: 24622,
    distance: '30.05 AU (4.50B km)',
    period: '164.8 Earth Years',
    temp: '-200°C Cloud Top',
    atmosphere: '80% Hydrogen, 19% Helium, 1.5% Methane',
    desc: 'The outermost solar planet, exhibiting vivid royal-blue methane absorption, supersonic wind bands over 2,100 km/h, and high-altitude cirrus clouds.',
    textureFactory: createNeptuneTexture,
    roughness: 0.45,
    metalness: 0.02,
    atmosphereColor: 0x356CE6,
  },
];

export function SpaceExplorerView() {
  const [selectedPlanet, setSelectedPlanet] = useState(PLANETS[2]); // Default Earth
  const [isRotating, setIsRotating] = useState(true);
  const containerRef = useRef(null);
  const rendererRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 560;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030712);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    camera.position.set(0, 0, 240);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Deep Space Starfield Background
    const starGeo = new THREE.BufferGeometry();
    const starCount = 1800;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      starPos[i] = (Math.random() - 0.5) * 1200;
      starPos[i + 1] = (Math.random() - 0.5) * 1200;
      starPos[i + 2] = (Math.random() - 0.5) * 1200;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0x8DE7FF, size: 1.25, transparent: true, opacity: 0.75 });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // Astronomical Lighting: Ambient + Key Directional Sun
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.48);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.8);
    sunLight.position.set(160, 80, 130);
    scene.add(sunLight);

    // Planet Group
    const planetGroup = new THREE.Group();
    scene.add(planetGroup);

    // Sphere Geometry (96x96 for smooth round silhouette)
    const sphereGeo = new THREE.SphereGeometry(65, 96, 96);
    const textureLoader = new THREE.TextureLoader();

    let sphereMat;
    let cloudsMesh = null;
    let ringsMesh = null;
    let atmosMesh = null;

    if (selectedPlanet.id === 'earth') {
      // Use real NASA Blue Marble daymap & cloud layer
      sphereMat = new THREE.MeshStandardMaterial({
        map: textureLoader.load('/textures/earth_daymap.jpg'),
        roughness: 0.72,
        metalness: 0.12,
      });

      // Earth Cloud Sphere
      const cloudsGeo = new THREE.SphereGeometry(65.6, 64, 64);
      const cloudsMat = new THREE.MeshStandardMaterial({
        map: textureLoader.load('/textures/earth_clouds.png'),
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
      planetGroup.add(cloudsMesh);
    } else {
      // Use scientific procedural astronomical texture
      const planetTex = selectedPlanet.textureFactory();
      sphereMat = new THREE.MeshStandardMaterial({
        map: planetTex,
        roughness: selectedPlanet.roughness,
        metalness: selectedPlanet.metalness,
      });
    }

    const planetMesh = new THREE.Mesh(sphereGeo, sphereMat);
    planetGroup.add(planetMesh);

    // Saturn Ring System with realistic Cassini division texture & tilt
    if (selectedPlanet.hasRings) {
      const ringGeo = new THREE.RingGeometry(82, 148, 96);
      // Align ring UV mapping across radial distance
      const pos = ringGeo.attributes.position;
      const uvs = ringGeo.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const dist = Math.sqrt(x * x + y * y);
        const u = (dist - 82) / (148 - 82);
        uvs.setXY(i, u, 0.5);
      }
      uvs.needsUpdate = true;

      const ringMat = new THREE.MeshStandardMaterial({
        map: createSaturnRingTexture(),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.92,
        roughness: 0.7,
      });
      ringsMesh = new THREE.Mesh(ringGeo, ringMat);
      ringsMesh.rotation.x = Math.PI / 2.35;
      planetGroup.add(ringsMesh);
    }

    // Atmospheric Limb Glow Shader (Fresnel outer halo)
    if (selectedPlanet.atmosphereColor) {
      const atmosGeo = new THREE.SphereGeometry(67.5, 64, 64);
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
          uniform vec3 color;
          void main() {
            float intensity = pow(0.65 - dot(vNormal, vec3(0, 0, 1.0)), 2.8);
            gl_FragColor = vec4(color, 1.0) * intensity * 0.95;
          }
        `,
        uniforms: {
          color: { value: new THREE.Color(selectedPlanet.atmosphereColor) },
        },
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
      });
      atmosMesh = new THREE.Mesh(atmosGeo, atmosMat);
      planetGroup.add(atmosMesh);
    }

    // Interactive Drag Orbit
    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };

    const onMouseDown = (e) => {
      isDragging = true;
      prevMouse = { x: e.clientX, y: e.clientY };
    };
    const onMouseMove = (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - prevMouse.x;
      const deltaY = e.clientY - prevMouse.y;
      planetGroup.rotation.y += deltaX * 0.005;
      planetGroup.rotation.x += deltaY * 0.005;
      prevMouse = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => {
      isDragging = false;
    };
    const onWheel = (e) => {
      e.preventDefault();
      camera.position.z = Math.max(120, Math.min(380, camera.position.z + e.deltaY * 0.15));
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('wheel', onWheel, { passive: false });

    // Animation Loop
    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (isRotating && !isDragging) {
        planetMesh.rotation.y += 0.0025;
        if (cloudsMesh) cloudsMesh.rotation.y += 0.0035;
        if (ringsMesh) ringsMesh.rotation.z += 0.0008;
      }
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('wheel', onWheel);
      cancelAnimationFrame(animId);
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [selectedPlanet, isRotating]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Educational Scope Notice Banner */}
      <div
        style={{
          background: 'rgba(15, 32, 50, 0.7)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          fontSize: '12.5px',
          color: 'var(--text-secondary)',
        }}
      >
        <Sparkles size={20} style={{ color: 'var(--ice-blue)', flexShrink: 0 }} />
        <div>
          <strong style={{ color: '#FFFFFF' }}>Astronomical Planetary Reference Deck:</strong> Space Explorer renders
          high-resolution scientific surface maps, atmospheric dynamics, and ring systems. SATRA’s operational FIRMS
          thermal monitoring and AI fire classification pipeline is strictly <strong>Earth-observation based</strong>.
        </div>
      </div>

      {/* Planet Selector Bar with Active Highlights */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          paddingBottom: '4px',
        }}
      >
        {PLANETS.map((planet) => {
          const isSelected = selectedPlanet.id === planet.id;
          return (
            <button
              key={planet.id}
              onClick={() => setSelectedPlanet(planet)}
              style={{
                background: isSelected ? 'var(--panel-elevated)' : 'var(--panel-bg)',
                color: isSelected ? '#FFFFFF' : 'var(--text-secondary)',
                border: isSelected ? '1px solid var(--primary-cyan)' : '1px solid var(--border-color)',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                boxShadow: isSelected ? '0 0 14px rgba(69, 200, 245, 0.2)' : 'none',
              }}
            >
              <span>{planet.name}</span>
              {planet.isPrimaryMission && (
                <span
                  style={{
                    fontSize: '9px',
                    padding: '1px 5px',
                    borderRadius: '3px',
                    background: 'rgba(69, 200, 245, 0.2)',
                    color: 'var(--ice-blue)',
                    fontWeight: 700,
                  }}
                >
                  SATRA Core
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Main Viewport + Planetary Information Deck */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '20px' }}>
        {/* 3D Planetary Canvas Viewport */}
        <div
          className="card-panel"
          style={{
            padding: 0,
            overflow: 'hidden',
            position: 'relative',
            height: '560px',
            marginBottom: 0,
            background: 'radial-gradient(circle at center, #0B1726 0%, #030712 100%)',
            border: '1px solid var(--border-color)',
          }}
        >
          <div ref={containerRef} style={{ width: '100%', height: '100%', cursor: 'grab' }} />

          {/* Quick HUD Controls */}
          <div
            style={{
              position: 'absolute',
              bottom: 16,
              right: 16,
              display: 'flex',
              gap: '8px',
              zIndex: 10,
            }}
          >
            <button
              onClick={() => setIsRotating(!isRotating)}
              className="btn-secondary"
              style={{ padding: '6px 12px', fontSize: '11.5px', gap: '6px' }}
            >
              <RotateCw size={13} />
              <span>{isRotating ? 'Pause Rotation' : 'Rotate'}</span>
            </button>
          </div>

          <div
            style={{
              position: 'absolute',
              top: 16,
              left: 16,
              padding: '6px 12px',
              borderRadius: '6px',
              background: 'rgba(11, 23, 38, 0.85)',
              border: '1px solid var(--border-color)',
              fontSize: '11px',
              color: 'var(--ice-blue)',
              fontWeight: 700,
              letterSpacing: '0.04em',
            }}
          >
            SOLAR SYSTEM &bull; {selectedPlanet.name.toUpperCase()} (SCIENTIFIC ASTRONOMICAL RENDER)
          </div>

          <div
            style={{
              position: 'absolute',
              bottom: 16,
              left: 16,
              fontSize: '10.5px',
              color: 'var(--text-muted)',
              background: 'rgba(11, 23, 38, 0.65)',
              padding: '4px 8px',
              borderRadius: '4px',
            }}
          >
            Drag to orbit &bull; Scroll to zoom
          </div>
        </div>

        {/* Planet Fact Sheet Card */}
        <div
          className="card-panel"
          style={{
            marginBottom: 0,
            background: 'var(--panel-bg)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
                  {selectedPlanet.name}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--ice-blue)', fontWeight: 500 }}>
                  {selectedPlanet.isPrimaryMission ? 'SATRA Primary Mission Host' : 'Planetary Astronomical Body'}
                </div>
              </div>
              {selectedPlanet.isPrimaryMission && (
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    background: 'rgba(69, 212, 131, 0.15)',
                    color: 'var(--success)',
                    border: '1px solid rgba(69, 212, 131, 0.3)',
                  }}
                >
                  FIRMS Observation Zone
                </span>
              )}
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '20px' }}>
              {selectedPlanet.desc}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '12.5px' }}>
              <div style={{ padding: '10px 14px', background: 'rgba(15, 32, 50, 0.5)', borderRadius: '6px' }}>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10.5px', textTransform: 'uppercase' }}>
                  Mean Volumetric Radius
                </span>
                <strong className="mono-cell" style={{ color: '#FFFFFF', fontSize: '13.5px' }}>
                  {selectedPlanet.radiusKm.toLocaleString()} km
                </strong>
              </div>

              <div style={{ padding: '10px 14px', background: 'rgba(15, 32, 50, 0.5)', borderRadius: '6px' }}>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10.5px', textTransform: 'uppercase' }}>
                  Semi-Major Axis (Distance from Sun)
                </span>
                <span className="mono-cell" style={{ color: 'var(--primary-cyan)', fontSize: '13.5px' }}>
                  {selectedPlanet.distance}
                </span>
              </div>

              <div style={{ padding: '10px 14px', background: 'rgba(15, 32, 50, 0.5)', borderRadius: '6px' }}>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10.5px', textTransform: 'uppercase' }}>
                  Sidereal Orbital Period
                </span>
                <span className="mono-cell" style={{ fontSize: '13.5px' }}>{selectedPlanet.period}</span>
              </div>

              <div style={{ padding: '10px 14px', background: 'rgba(15, 32, 50, 0.5)', borderRadius: '6px' }}>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10.5px', textTransform: 'uppercase' }}>
                  Mean Surface / Cloud Temperature
                </span>
                <strong className="mono-cell" style={{ color: 'var(--warning)', fontSize: '13.5px' }}>
                  {selectedPlanet.temp}
                </strong>
              </div>

              <div style={{ padding: '10px 14px', background: 'rgba(15, 32, 50, 0.5)', borderRadius: '6px' }}>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10.5px', textTransform: 'uppercase' }}>
                  Atmospheric Chemistry
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>{selectedPlanet.atmosphere}</span>
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: '20px',
              paddingTop: '12px',
              borderTop: '1px solid var(--border-subtle)',
              fontSize: '11px',
              color: 'var(--text-muted)',
            }}
          >
            * Ephemeris parameters cross-referenced with NASA JPL Planetary Physical Data Tables.
          </div>
        </div>
      </div>
    </div>
  );
}
