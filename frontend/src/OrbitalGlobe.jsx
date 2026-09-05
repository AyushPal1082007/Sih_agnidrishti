import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

// Calculate target rotation angles (Euler rx, ry) to bring any (lat, lon) directly to center front
export function latLonToTargetRotation(lat, lon) {
  const targetY = -((lon) * (Math.PI / 180)) - Math.PI * 0.5;
  const targetX = (lat) * (Math.PI / 180);
  return { x: targetX, y: targetY };
}

// Convert Lat/Lon to 3D Cartesian coordinates on sphere of radius R
export function latLonToVector3(lat, lon, radius = 100) {
  const phi = (90.0 - lat) * (Math.PI / 180);
  const theta = (lon + 180.0) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

// Key pre-defined locations across the world & Indian sectors
export const REGION_COORDINATES = {
  India: { lat: 21.5, lon: 78.9, zoom: 190 },
  Gujarat: { lat: 22.3, lon: 72.6, zoom: 175 },
  Simlipal: { lat: 21.8, lon: 86.3, zoom: 175 },
  Bandipur: { lat: 11.6, lon: 76.6, zoom: 175 },
  WesternGhats: { lat: 13.0, lon: 75.5, zoom: 175 },
  Himalayas: { lat: 29.8, lon: 79.3, zoom: 175 },
  Satpura: { lat: 22.4, lon: 78.4, zoom: 175 },
  Kaziranga: { lat: 26.5, lon: 93.1, zoom: 175 },
  Japan: { lat: 36.2, lon: 138.2, zoom: 185 },
  Europe: { lat: 48.8, lon: 2.3, zoom: 190 },
  USA: { lat: 37.0, lon: -95.7, zoom: 195 },
  Australia: { lat: -25.2, lon: 133.7, zoom: 190 },
  Brazil: { lat: -14.2, lon: -51.9, zoom: 190 },
  Africa: { lat: 0.0, lon: 25.0, zoom: 195 },
  INSAT3D: { lat: 0.0, lon: 74.0, zoom: 210 },
  VIIRS: { lat: 28.0, lon: 82.0, zoom: 185 },
  Sentinel3: { lat: 35.0, lon: 70.0, zoom: 190 },
};

export const REGION_ROTATIONS = REGION_COORDINATES;

// Generate high-visibility, crisp circular glow particle sprite
function createParticleTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0.0, "rgba(255, 255, 255, 1.0)");
  gradient.addColorStop(0.3, "rgba(255, 255, 255, 0.95)");
  gradient.addColorStop(0.6, "rgba(255, 215, 120, 0.75)");
  gradient.addColorStop(0.85, "rgba(56, 189, 248, 0.3)");
  gradient.addColorStop(1.0, "rgba(0, 0, 0, 0.0)");

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(64, 64, 64, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// Point Shader — static earth-colored particles (no per-particle drift/twinkle),
// matching the reference video where motion comes from camera rotation/zoom only.
const PointsShader = {
  vertexShader: `
    attribute float size;
    attribute vec3 color;
    attribute float isIndia;
    varying vec3 vColor;
    varying float vIsIndia;
    varying vec3 vPointPosition;
    uniform float uTime;
    uniform float uSelectedBoost;

    void main() {
      vColor = color;
      vIsIndia = isIndia;
      vPointPosition = position;

      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

      float pulse = 1.0;
      if (isIndia > 0.5) { pulse += 0.15 * sin(uTime * 2.0); }

      gl_PointSize = size * pulse * (620.0 / -mvPosition.z);
      gl_PointSize = clamp(gl_PointSize, 1.0, 6.0);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    varying vec3 vColor;
    varying float vIsIndia;
    varying vec3 vPointPosition;
    uniform sampler2D pointTexture;
    uniform float uSelectedBoost;
    uniform float uTime;

    void main() {
      vec4 texColor = texture2D(pointTexture, gl_PointCoord);
      if (texColor.a < 0.06) discard;

      vec3 deepOcean = vec3(0.02, 0.14, 0.32);
      vec3 brightOcean = vec3(0.07, 0.5, 0.78);
      vec3 oceanColor = mix(deepOcean, brightOcean, smoothstep(0.2, 1.0, vColor.b));

      float landFactor = smoothstep(0.5, 0.85, max(vColor.r, vColor.g));
      vec3 earthColor = mix(oceanColor, vColor, landFactor);

      float latitude = abs(normalize(vPointPosition).y);
      float iceFactor = smoothstep(0.82, 0.95, latitude) * landFactor;
      earthColor = mix(earthColor, vec3(0.9, 0.95, 1.0), iceFactor);

      float shimmer = 0.85 + 0.15 * sin(uTime * 1.5 + vPointPosition.x * 0.3 + vPointPosition.y * 0.2);
      vec3 finalColor = earthColor * shimmer;
      if (vIsIndia > 0.5) {
        finalColor = mix(finalColor, vec3(1.0, 0.78, 0.35), 0.35);
      }

      gl_FragColor = vec4(finalColor, texColor.a);
    }
  `,
};

// Atmospheric Rim Glow Shader
const AtmosphereShader = {
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
      vec3 viewDir = normalize(-vPosition);
      float rim = 1.0 - max(0.0, dot(vNormal, viewDir));
      float intensity = pow(rim, 3.8) * 0.65;
      vec3 glow = vec3(0.24, 0.76, 0.98);
      gl_FragColor = vec4(glow, intensity);
    }
  `,
};

// Radial Streak Shader — post-processing pass that streaks pixels outward from
// screen center during fast zoom transitions, matching the reference video.
const RadialStreakShader = {
  uniforms: {
    tDiffuse: { value: null },
    uStrength: { value: 0.0 },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    uniform vec2 uCenter;
    varying vec2 vUv;

    void main() {
      if (uStrength <= 0.001) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }
      vec2 dir = vUv - uCenter;
      vec4 color = vec4(0.0);
      const int SAMPLES = 8;
      for (int i = 0; i < SAMPLES; i++) {
        float t = float(i) / float(SAMPLES - 1);
        vec2 sampleUv = vUv - dir * uStrength * t;
        color += texture2D(tDiffuse, sampleUv);
      }
      color /= float(SAMPLES);
      gl_FragColor = color;
    }
  `,
};

export default function OrbitalGlobe({
  selectedRegion = "India",
  targetCoords = null, // Optional { lat, lon } to target directly
  zoomLevel = 0,
  isCardOpen = true,
  className = "",
}) {
  const mountRef = useRef(null);
  const globeGroupRef = useRef(null);
  const targetBeaconRef = useRef(null);
  const cameraRef = useRef(null);
  const targetRotationRef = useRef({ x: 0.37, y: -2.95 }); // Default: Centered on India
  const currentRotationRef = useRef({ x: 0.37, y: -2.95 });
  const targetZoomRef = useRef(190);
  const currentZoomRef = useRef(190);
  const targetPositionXRef = useRef(isCardOpen ? -22 : 0);
  const currentPositionXRef = useRef(isCardOpen ? -22 : 0);
  const isDraggingRef = useRef(false);
  const previousPointerRef = useRef({ x: 0, y: 0 });
  const velocityRef = useRef({ x: 0, y: 0 });
  const uniformsRef = useRef(null);
  const satellitesRef = useRef([]);

  // Adjust globe horizontal center when side card is open/closed
  useEffect(() => {
    targetPositionXRef.current = isCardOpen ? -22 : 0;
  }, [isCardOpen]);

  // Respond to region / coordinate selection: smoothly ease rotation to target region
  useEffect(() => {
    let lat = 21.5;
    let lon = 78.9;
    let zoom = 190;

    if (targetCoords && typeof targetCoords.lat === "number") {
      lat = targetCoords.lat;
      lon = targetCoords.lon;
      zoom = targetCoords.zoom || 180;
    } else if (selectedRegion && REGION_COORDINATES[selectedRegion]) {
      const cfg = REGION_COORDINATES[selectedRegion];
      lat = cfg.lat;
      lon = cfg.lon;
      zoom = cfg.zoom || 185;
    }

    const rot = latLonToTargetRotation(lat, lon);
    targetRotationRef.current = { x: rot.x, y: rot.y };
    targetZoomRef.current = zoom;

    // Position glowing 3D beacon at target coordinates on the sphere
    if (targetBeaconRef.current) {
      const pos = latLonToVector3(lat, lon, 101.5);
      targetBeaconRef.current.position.copy(pos);
      targetBeaconRef.current.visible = true;
    }
  }, [selectedRegion, targetCoords]);

  // Respond to HUD zoom buttons (+ / -)
  useEffect(() => {
    const base = 190 - zoomLevel * 25;
    targetZoomRef.current = Math.max(130, Math.min(300, base));
  }, [zoomLevel]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 1. Scene & Camera Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020307);

    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 1500);
    camera.position.z = 190;
    cameraRef.current = camera;

    // 2. WebGL Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // 2b. Post-processing composer with radial streak pass (drives the
    // zoom-triggered light-trail look from the reference video)
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const streakPass = new ShaderPass(RadialStreakShader);
    composer.addPass(streakPass);

    // 3. Master Globe Group
    const globeGroup = new THREE.Group();
    globeGroupRef.current = globeGroup;
    globeGroup.position.x = currentPositionXRef.current;
    globeGroup.rotation.x = currentRotationRef.current.x;
    globeGroup.rotation.y = currentRotationRef.current.y;
    scene.add(globeGroup);

    // 4. Particle Points Geometry & Material
    const particleTexture = createParticleTexture();
    const geometry = new THREE.BufferGeometry();

    const uniforms = {
      uTime: { value: 0 },
      pointTexture: { value: particleTexture },
      uSelectedBoost: { value: 1.15 },
    };
    uniformsRef.current = uniforms;

    const pointsMaterial = new THREE.ShaderMaterial({
      vertexShader: PointsShader.vertexShader,
      fragmentShader: PointsShader.fragmentShader,
      uniforms: uniforms,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const pointsMesh = new THREE.Points(geometry, pointsMaterial);
    pointsMesh.renderOrder = 1;
    globeGroup.add(pointsMesh);

    // Populate geometry from Float32Array interleaved buffer
    const applyBufferData = (buffer) => {
      const floatView = new Float32Array(buffer);
      const vertexCount = floatView.length / 8;

      const positions = new Float32Array(vertexCount * 3);
      const colors = new Float32Array(vertexCount * 3);
      const sizes = new Float32Array(vertexCount);
      const isIndia = new Float32Array(vertexCount);

      for (let i = 0; i < vertexCount; i++) {
        const offset = i * 8;
        positions[i * 3] = floatView[offset];
        positions[i * 3 + 1] = floatView[offset + 1];
        positions[i * 3 + 2] = floatView[offset + 2];

        colors[i * 3] = floatView[offset + 3];
        colors[i * 3 + 1] = floatView[offset + 4];
        colors[i * 3 + 2] = floatView[offset + 5];

        sizes[i] = floatView[offset + 6];
        isIndia[i] = floatView[offset + 7];
      }

      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
      geometry.setAttribute("isIndia", new THREE.BufferAttribute(isIndia, 1));
      geometry.computeBoundingSphere();
    };

    // Load authentic, full-world points binary
    fetch("/assets/globe_points.bin")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch globe_points.bin");
        return res.arrayBuffer();
      })
      .then((buffer) => {
        applyBufferData(buffer);
      })
      .catch((err) => {
        console.warn("Using fallback:", err);
      });

    // 5. Dark Inner Core (Occludes back particles for true 3D globe)
    const coreGeometry = new THREE.SphereGeometry(98.8, 48, 48);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0x020308,
    });
    const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
    coreMesh.renderOrder = 0;
    globeGroup.add(coreMesh);

    // 6. Atmospheric Rim Glow
    const atmosGeometry = new THREE.SphereGeometry(102.5, 64, 64);
    const atmosMaterial = new THREE.ShaderMaterial({
      vertexShader: AtmosphereShader.vertexShader,
      fragmentShader: AtmosphereShader.fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const atmosMesh = new THREE.Mesh(atmosGeometry, atmosMaterial);
    globeGroup.add(atmosMesh);

    // 7. Glowing 3D Target Beacon Marker on Selected Region
    const beaconGroup = new THREE.Group();
    const beaconGeom = new THREE.SphereGeometry(1.8, 16, 16);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
    const beaconMesh = new THREE.Mesh(beaconGeom, beaconMat);

    // Pulsating halo around the beacon
    const ringCurve = new THREE.EllipseCurve(0, 0, 4.5, 4.5, 0, 2 * Math.PI, false, 0);
    const ringGeom = new THREE.BufferGeometry().setFromPoints(ringCurve.getPoints(32).map(p => new THREE.Vector3(p.x, p.y, 0)));
    const ringMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.85 });
    const ringLine = new THREE.LineLoop(ringGeom, ringMat);

    beaconGroup.add(beaconMesh);
    beaconGroup.add(ringLine);
    const initialPos = latLonToVector3(21.5, 78.9, 101.5);
    beaconGroup.position.copy(initialPos);
    globeGroup.add(beaconGroup);
    targetBeaconRef.current = beaconGroup;

    // 8. Luminous Orbital Satellite Rings (INSAT-3DR, VIIRS, Sentinel-3)
    const orbitalGroup = new THREE.Group();
    globeGroup.add(orbitalGroup);

    const orbitConfigs = [
      { radius: 122, tiltX: 0.32, tiltZ: 0.12, speed: 0.75, name: "INSAT-3DR", color: 0xf59e0b },
      { radius: 130, tiltX: -0.54, tiltZ: 0.40, speed: 1.05, name: "VIIRS-SNPP", color: 0x38bdf8 },
      { radius: 116, tiltX: 1.18, tiltZ: -0.22, speed: 0.88, name: "Sentinel-3", color: 0x10b981 },
    ];

    const satellites = [];

    orbitConfigs.forEach((cfg) => {
      const curve = new THREE.EllipseCurve(0, 0, cfg.radius, cfg.radius, 0, 2 * Math.PI, false, 0);
      const pts = curve.getPoints(128);
      const rGeom = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, 0, p.y)));

      const rMat = new THREE.LineBasicMaterial({
        color: cfg.color,
        transparent: true,
        opacity: 0.32,
      });

      const ring = new THREE.LineLoop(rGeom, rMat);
      ring.rotation.x = cfg.tiltX;
      ring.rotation.z = cfg.tiltZ;
      orbitalGroup.add(ring);

      const satGeom = new THREE.SphereGeometry(2.2, 16, 16);
      const satMat = new THREE.MeshBasicMaterial({ color: cfg.color });
      const satMesh = new THREE.Mesh(satGeom, satMat);

      const haloGeom = new THREE.SphereGeometry(4.5, 16, 16);
      const haloMat = new THREE.MeshBasicMaterial({
        color: cfg.color,
        transparent: true,
        opacity: 0.5,
      });
      satMesh.add(new THREE.Mesh(haloGeom, haloMat));

      orbitalGroup.add(satMesh);

      satellites.push({
        mesh: satMesh,
        radius: cfg.radius,
        tiltX: cfg.tiltX,
        tiltZ: cfg.tiltZ,
        speed: cfg.speed,
        angle: Math.random() * Math.PI * 2,
      });
    });
    satellitesRef.current = satellites;

    // 9. Distant Ambient Starfield
    const starCount = 500;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const dist = 320 + Math.random() * 250;
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      starPositions[i * 3] = dist * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = dist * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = dist * Math.cos(phi);
    }
    const starGeom = new THREE.BufferGeometry();
    starGeom.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xa5b4fc,
      size: 1.4,
      transparent: true,
      opacity: 0.45,
    });
    scene.add(new THREE.Points(starGeom, starMat));

    // Pointer Drag & 360-Degree Inertia Controls
    const onPointerDown = (e) => {
      isDraggingRef.current = true;
      previousPointerRef.current = { x: e.clientX, y: e.clientY };
      velocityRef.current = { x: 0, y: 0 };
    };

    const onPointerMove = (e) => {
      if (!isDraggingRef.current) return;
      const deltaX = e.clientX - previousPointerRef.current.x;
      const deltaY = e.clientY - previousPointerRef.current.y;

      velocityRef.current = {
        x: deltaX * 0.0055,
        y: deltaY * 0.0055,
      };

      currentRotationRef.current.y += velocityRef.current.x;
      currentRotationRef.current.x += velocityRef.current.y;
      currentRotationRef.current.x = Math.max(-Math.PI * 0.45, Math.min(Math.PI * 0.45, currentRotationRef.current.x));

      targetRotationRef.current.x = currentRotationRef.current.x;
      targetRotationRef.current.y = currentRotationRef.current.y;

      previousPointerRef.current = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = () => {
      isDraggingRef.current = false;
    };

    const onWheel = (e) => {
      e.preventDefault();
      targetZoomRef.current = Math.max(130, Math.min(320, targetZoomRef.current + e.deltaY * 0.18));
    };

    const dom = renderer.domElement;
    dom.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    dom.addEventListener("wheel", onWheel, { passive: false });

    // Handle Window Resize
    const handleResize = () => {
      if (!container) return;
      const newW = container.clientWidth || window.innerWidth;
      const newH = container.clientHeight || window.innerHeight;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
      composer.setSize(newW, newH);
    };
    window.addEventListener("resize", handleResize);

    // Animation Loop
    let animationFrameId;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsedTime = clock.getElapsedTime();

      if (uniformsRef.current) {
        uniformsRef.current.uTime.value = elapsedTime;
      }

      // Animate beacon pulse
      if (beaconGroup) {
        const s = 1.0 + 0.3 * Math.sin(elapsedTime * 6.0);
        ringLine.scale.set(s, s, s);
      }

      // Smooth horizontal framing lerp
      currentPositionXRef.current += (targetPositionXRef.current - currentPositionXRef.current) * 0.06;
      if (globeGroupRef.current) {
        globeGroupRef.current.position.x = currentPositionXRef.current;
      }

      if (!isDraggingRef.current) {
        velocityRef.current.x *= 0.94;
        velocityRef.current.y *= 0.94;

        currentRotationRef.current.y += velocityRef.current.x;
        currentRotationRef.current.x += velocityRef.current.y;

        const lerpFactor = 0.055;
        currentRotationRef.current.x += (targetRotationRef.current.x - currentRotationRef.current.x) * lerpFactor;

        let dy = targetRotationRef.current.y - currentRotationRef.current.y;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        currentRotationRef.current.y += dy * lerpFactor;

        // Ambient rotation when settled
        if (Math.abs(dy) < 0.005 && Math.abs(velocityRef.current.x) < 0.001) {
          targetRotationRef.current.y += 0.0025;
          currentRotationRef.current.y += 0.0025;
        }
      }

      // Zoom lerp + radial streak strength driven by zoom speed
      const prevZoom = currentZoomRef.current;
      currentZoomRef.current += (targetZoomRef.current - currentZoomRef.current) * 0.08;
      camera.position.z = currentZoomRef.current;

      const zoomDelta = Math.abs(currentZoomRef.current - prevZoom);
      const targetStrength = Math.min(zoomDelta * 0.015, 0.12);
      streakPass.uniforms.uStrength.value += (targetStrength - streakPass.uniforms.uStrength.value) * 0.3;

      if (globeGroupRef.current) {
        globeGroupRef.current.rotation.x = currentRotationRef.current.x;
        globeGroupRef.current.rotation.y = currentRotationRef.current.y;
      }

      satellitesRef.current.forEach((sat) => {
        sat.angle += delta * sat.speed * 0.45;
        const x = sat.radius * Math.cos(sat.angle);
        const z = sat.radius * Math.sin(sat.angle);

        const pos = new THREE.Vector3(x, 0, z);
        pos.applyAxisAngle(new THREE.Vector3(1, 0, 0), sat.tiltX);
        pos.applyAxisAngle(new THREE.Vector3(0, 0, 1), sat.tiltZ);
        sat.mesh.position.copy(pos);
      });

      composer.render();
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      dom.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      dom.removeEventListener("wheel", onWheel);

      geometry.dispose();
      pointsMaterial.dispose();
      atmosGeometry.dispose();
      atmosMaterial.dispose();
      coreGeometry.dispose();
      coreMaterial.dispose();
      starGeom.dispose();
      starMat.dispose();
      if (particleTexture) particleTexture.dispose();
      composer.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className={`orbital-globe-container ${className}`}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        cursor: "grab",
        userSelect: "none",
        touchAction: "none",
      }}
      aria-label="Interactive 3D Earth Globe"
    />
  );
}