/**
 * OrbitalGlobeEnergyOnly.jsx
 *
 * Only the existing radiation layer was tuned. The globe shader, particles,
 * ripple, rotation, camera, interactions, and all other behavior are kept
 * unchanged from the supplied component.
 */

/**
 * OrbitalGlobeReferenceFinal.jsx
 *
 * Final visual tuning against the Google Research Language Explorer globe:
 * compact geographic points, restrained bloom, subtle depth, slow continuous
 * ripple modulation, no startup glow, no external radiation overlays.
 */

/**
 * OrbitalGlobeReferenceMatch.jsx
 *
 * Reference-matched implementation: restrained geographic point cloud,
 * independent concentric sampling, compact point sprites, no startup glow,
 * no artificial radiation/orbit overlays, and a continuous ripple from frame 1.
 */

/**
 * OrbitalGlobeContinuousFinal.jsx
 *
 * No reveal state, no startup Earth glow, active ripple from frame one,
 * visibly separated independently sampled shells, and animated radiation arcs.
 */

/**
 * OrbitalGlobeContinuousRefined.jsx
 *
 * Refinements:
 * - No initial Earth-wide glow or one-shot reveal.
 * - Ripple is already active on the first frame and loops continuously.
 * - Two independently sampled concentric particle shells remain intact.
 * - Adds subtle pink, blue-violet, and orange additive radiation layers.
 */

/**
 * OrbitalGlobeContinuous.jsx
 *
 * Changes from the original component:
 * - The one-shot full-globe reveal is disabled.
 * - The globe is visible immediately from the first rendered frame.
 * - The ambient great-circle ripple loops continuously.
 * - Slow automatic orientation drift continues when the user is not dragging.
 * - Globe lighting is shifted to pale gold, blush pink, peach, and cream.
 */

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
  gradient.addColorStop(0.18, "rgba(255, 246, 244, 0.92)");
  gradient.addColorStop(0.42, "rgba(255, 218, 214, 0.38)");
  gradient.addColorStop(0.68, "rgba(255, 176, 186, 0.08)");
  gradient.addColorStop(1.0, "rgba(0, 0, 0, 0.0)");

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(64, 64, 64, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// Point Shader
// -------------
// Two independently-sampled, concentric shells: layer 0 ("outer") and
// layer 1 ("inner") are drawn from DIFFERENT points of the source data set
// (offset sampling, not duplicated), sitting at visibly different radii.
// They therefore never sit on top of each other pixel-for-pixel — each
// shell has its own scatter of points, while both still trace the same
// continents (since both are subsets of the same real-world dataset).
//
// Reveal ripple (one-shot, on mount): a ring expands outward — in angular
// (great-circle) distance — from a fixed origin point (matches the
// reference: the globe "switches on" as a filled circle growing from the
// selected region outward to the antipode, not a left-to-right wipe).
// Particles outside the current front radius are fully hidden (size 0);
// particles at the front get a bright gold glow.
//
// Ambient ripple (continuous): a second, non-hiding ripple radiates
// outward from whichever region is CURRENTLY selected, looping forever,
// with a trailing cosine "wake" behind the leading edge so several
// concentric rings are visible at once — this is the actual water-ripple
// look, replacing the old sliding-patch traveling wave.
//
// Region-selection cone: push + vibrate + rotating sunburst spokes,
// tinted warm gold (reference has no cyan/blue anywhere on the globe).
//
// Hover cone: same push/vibrate mechanic, kept warm (pale cream) rather
// than cool-toned, so the whole globe stays in one warm family.
const PointsShader = {
  vertexShader: `
    attribute float size;
    attribute vec3 color;
    attribute float isIndia;
    attribute float randSeed;
    attribute float layerId;
    varying vec3 vColor;
    varying float vIsIndia;
    varying vec3 vPointPosition;
    varying float vRandSeed;
    varying float vLayerId;
    varying float vSelFactor;
    varying float vHoverFactor;
    varying float vRippleBand;
    varying float vFresnel;
    varying float vRevealGlow;
    varying float vRevealVisible;
    uniform float uTime;
    uniform float uVibrationAmp;
    uniform vec3 uSelectedDir;
    uniform float uSelectedRadius;
    uniform float uSelectedStrength;
    uniform vec3 uHoverDir;
    uniform float uHoverRadius;
    uniform float uHoverStrength;
    uniform float uHoverActive;
    uniform float uRayCount;
    uniform float uSelectionActive;

    // One-shot reveal ripple (mount only)
    uniform vec3 uRevealOriginDir;
    uniform float uRevealFrontRadius;
    uniform float uRevealBandWidth;
    uniform float uRevealGlowGate;

    // Continuous ambient ripple (from current selection)
    uniform vec3 uRippleOriginDir;
    uniform float uRippleRadius;
    uniform float uRippleBandWidth;
    uniform float uRippleTrailFreq;
    uniform float uRippleTrailDecay;
    uniform float uRippleEnvelope;

    void main() {
      vColor = color;
      vIsIndia = isIndia;
      vPointPosition = position;
      vRandSeed = randSeed;
      vLayerId = layerId;

      vec3 normalDir = normalize(position);
      float seed = randSeed * 6.2831853;

      // ---- Ambient ripple: expanding ring (with trailing wake) from the
      // currently-selected point. This is a genuine growing-radius ripple,
      // not a patch sliding along a rotating axis.
      float rippleDist = acos(clamp(dot(normalDir, normalize(uRippleOriginDir)), -1.0, 1.0));
      float rippleEdge = rippleDist - uRippleRadius;
      float rippleFront = exp(-pow(rippleEdge / uRippleBandWidth, 2.0));
      // At rippleSpeed 0.55, these offsets launch fresh crests roughly
      // every two seconds while earlier crests are still crossing the globe.
      float secondaryRadius = mod(uRippleRadius + 1.10, 3.3);
      float secondaryEdge = rippleDist - secondaryRadius;
      float secondaryFront = exp(-pow(secondaryEdge / (uRippleBandWidth * 1.15), 2.0));
      float tertiaryRadius = mod(uRippleRadius + 2.20, 3.3);
      float tertiaryEdge = rippleDist - tertiaryRadius;
      float tertiaryFront = exp(-pow(tertiaryEdge / (uRippleBandWidth * 1.25), 2.0));
      float behindFront = max(0.0, -rippleEdge);
      float rippleWake = max(0.0, cos(behindFront * uRippleTrailFreq)) * exp(-behindFront * uRippleTrailDecay);
      float rippleBand = clamp(rippleFront + secondaryFront * 0.42 + tertiaryFront * 0.28 + rippleWake * 0.34, 0.0, 1.0) * uRippleEnvelope;
      float bandJitter = fract(sin(randSeed * 91.7) * 43758.5453);
      rippleBand *= mix(0.75, 1.0, bandJitter);
      vRippleBand = rippleBand;

      // Keep the base globe calm: only the actual ripple band may brighten
      // or enlarge particles. There is no globe-wide startup shimmer.
      float activeRipple = rippleBand;

      // ---- Region selection: displace particles along the spherical surface
      float selDot = dot(normalDir, normalize(uSelectedDir));
      float selFactor = smoothstep(cos(uSelectedRadius), 1.0, selDot);

      vec3 selDirN = normalize(uSelectedDir);
      selFactor *= uSelectionActive;
      vSelFactor = selFactor;
      vec3 selTangent = normalDir - selDirN * selDot;
      selTangent /= max(length(selTangent), 0.0001);

      // Hover interaction uses the same surface-following displacement.
      float hoverDot = dot(normalDir, normalize(uHoverDir));
      float hoverFactor = smoothstep(cos(uHoverRadius), 1.0, hoverDot) * uHoverActive;
      vHoverFactor = hoverFactor;
      vec3 hoverDirN = normalize(uHoverDir);
      vec3 hoverTangent = normalDir - hoverDirN * hoverDot;
      hoverTangent /= max(length(hoverTangent), 0.0001);

      // No reveal animation. The complete point cloud is visible immediately.
      float revealGlow = 0.0;
      float revealVisible = 1.0;
      vRevealGlow = 0.0;
      vRevealVisible = 1.0;

      vec3 crestOffset = normalDir * (0.1 + rippleBand * 0.10 + revealGlow * 0.08);
      crestOffset += selTangent * selFactor * uSelectedStrength * 0.12;
      crestOffset += hoverTangent * hoverFactor * uHoverStrength * 0.10;

      float vibeMix = 0.04 + rippleBand * 0.34 + selFactor * 0.45 + hoverFactor * 0.35 + revealGlow * 0.3;
      vec3 jitter = vec3(
        sin(uTime * (0.22 + randSeed * 4.5) + seed * 1.5),
        cos(uTime * (0.28 + randSeed * 5.8) + seed * 2.2),
        sin(uTime * (0.32 + randSeed * 6.8) + seed * 3.0)
      ) * uVibrationAmp * vibeMix * 0.22 * mix(0.85, 1.05, layerId);

      vec3 vibratedPosition = position + crestOffset + jitter;
      vec4 mvPosition = modelViewMatrix * vec4(vibratedPosition, 1.0);

      // Fresnel rim term: bright at the grazing limb, dim center-on.
      vec3 viewNormalDir = normalize(normalMatrix * normalDir);
      vec3 viewDirV = normalize(-mvPosition.xyz);
      float fresnel = pow(1.0 - clamp(dot(viewNormalDir, viewDirV), 0.0, 1.0), 2.2);
      vFresnel = fresnel;

      float pulse = mix(0.72, 1.65, activeRipple);
      float layerSizeScale = layerId < 0.5 ? 1.0 : (layerId < 1.5 ? 0.56 : 0.72);
      float selSizeBoost = 1.0 + selFactor * 0.35 + hoverFactor * 0.18 + revealGlow * 0.3 + fresnel * rippleBand * 0.12;

      gl_PointSize = size * pulse * layerSizeScale * selSizeBoost * (620.0 / -mvPosition.z);
      gl_PointSize = clamp(gl_PointSize, 0.0, 16.0);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    varying vec3 vColor;
    varying float vIsIndia;
    varying vec3 vPointPosition;
    varying float vRandSeed;
    varying float vLayerId;
    varying float vSelFactor;
    varying float vHoverFactor;
    varying float vRippleBand;
    varying float vFresnel;
    varying float vRevealGlow;
    varying float vRevealVisible;
    uniform sampler2D pointTexture;
    uniform float uTime;

    void main() {
      vec4 texColor = texture2D(pointTexture, gl_PointCoord);
      if (texColor.a < 0.06) discard;

      // The reference is a restrained white/gray geographic point cloud.
      // Keep the base surface quiet; only the moving ripple locally brightens it.
      float luminance = dot(vColor, vec3(0.299, 0.587, 0.114));
      vec3 earthColor = mix(
        vec3(0.16, 0.15, 0.17),
        vec3(0.96, 0.91, 0.90),
        smoothstep(0.12, 0.78, luminance)
      );

      // Ripple glow: warm gold, only near the expanding ring/wake.
      vec3 rippleNeon = vec3(1.0, 0.88, 0.84);
      float rippleClamped = clamp(vRippleBand, 0.0, 1.0);
      vec3 finalColor = mix(earthColor, rippleNeon, rippleClamped * 0.85);
      finalColor *= (0.78 + rippleClamped * 0.62);

      // Fresnel is only part of the active ripple; otherwise the whole limb
      // reads as a permanent glowing ring before the ripple arrives.
      vec3 rimColor = vec3(1.0, 0.72, 0.62);
      float rippleFresnel = vFresnel * rippleClamped;
      finalColor = mix(finalColor, rimColor, rippleFresnel * 0.5);
      finalColor *= (1.0 + rippleFresnel * 0.45);

      // No permanent atmospheric glow. The base remains a dim point field;
      // the ripple is the only moving brightness emphasis.

      // Selection boosts the source color instead of replacing it.
      finalColor *= 1.0 + vSelFactor * 0.35;

      // Cursor-hover region: pale warm (kept in the same warm family as
      // everything else — reference never shows blue/cyan on the globe).
      vec3 hoverNeon = vec3(1.0, 0.97, 0.9);
      finalColor = mix(finalColor, hoverNeon, vHoverFactor * 0.22);

      // Reveal leading-edge flash: bright warm gold
      vec3 revealNeon = vec3(1.0, 0.84, 0.70);
      finalColor = mix(finalColor, revealNeon, vRevealGlow * 0.8);
      finalColor *= (1.0 + vRevealGlow * 0.6);

      // Inner ("below") layer renders dimmer/softer for depth.
      float layerAlpha = vLayerId < 0.5 ? 0.78 : (vLayerId < 1.5 ? 0.30 : 0.36);
      float calmToCrestAlpha = mix(0.82, 1.0, rippleClamped);
      float extraAlpha = calmToCrestAlpha + vSelFactor * 0.6 + vHoverFactor * 0.15 + rippleClamped * 0.3 + rippleFresnel * 0.25 + vRevealGlow * 0.5;

      gl_FragColor = vec4(finalColor, texColor.a * layerAlpha * extraAlpha);
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
  selectedRegion = null,
  targetCoords = null, // Optional { lat, lon } to target directly
  zoomLevel = 0,
  isCardOpen = true,
  className = "",
  vibrationAmp = 0.4, // World-unit jitter amplitude per particle (radius ~100). Tune to taste.
  selectedPushStrength = 4.2, // How far search/label-selected-region particles push outward
  selectedAngularRadius = 0.42, // Radians — angular size of the "selected region" cone (~24deg)
  hoverPushStrength = 2.6, // How far cursor-hovered particles push outward
  hoverAngularRadius = 0.22, // Radians — angular size of the cursor hover cone (~12.6deg)
  raySpokeCount = 10, // Number of rotating sunburst spokes inside the selection cone
  pointStep = 3, // Thinning factor applied to EACH independently-sampled shell
  enableReveal = false, // Kept for API compatibility; continuous ripple starts immediately
  revealDuration = 2.6, // Seconds for the reveal ripple to cross the whole globe
  revealBandWidth = 0.16, // Angular softness/organic-ness of the reveal's leading edge
  rippleSpeed = 0.22, // Angular radians/sec the ambient ripple front expands
  rippleBandWidth = 0.065, // Angular width of the ambient ripple's leading edge
  rippleTrailFrequency = 11, // How many trailing wake-rings appear behind the front
  rippleTrailDecay = 1.85, // How fast the trailing wake fades with distance behind the front
  rippleMaxRadius = 3.3, // Angular radius (radians) at which the ambient ripple loops back to 0
  rippleGlowStrength = 1.0, // Overall intensity multiplier for the ambient ripple
}) {
  const mountRef = useRef(null);
  const globeGroupRef = useRef(null);
  const targetBeaconRef = useRef(null);
  const cameraRef = useRef(null);
  const targetRotationRef = useRef({ x: 0.37, y: -2.95 }); // Default: Centered on India
  const currentRotationRef = useRef({ x: 0.37, y: -2.95 });
  const targetZoomRef = useRef(280);
  const currentZoomRef = useRef(280);
  const targetPositionXRef = useRef(isCardOpen ? -22 : 0);
  const currentPositionXRef = useRef(isCardOpen ? -22 : 0);
  const isDraggingRef = useRef(false);
  const previousPointerRef = useRef({ x: 0, y: 0 });
  const velocityRef = useRef({ x: 0, y: 0 });
  const uniformsRef = useRef(null);
  const satellitesRef = useRef([]);
  // Smoothed direction of the currently-selected lat/lon, used both for the
  // push-and-vibrate cone AND as the origin of the continuous ambient ripple.
  const selectedDirTargetRef = useRef(new THREE.Vector3(0, 0, 1));
  const selectedDirCurrentRef = useRef(new THREE.Vector3(0, 0, 1));
  // When the current ripple origin was (re)set — resets on every new
  // selection so a fresh ripple starts from the newly-picked point.
  const rippleOriginSetAtRef = useRef(0);
  const rippleOriginDirRef = useRef(new THREE.Vector3(0, 0, 1));
  // Start partway through a ripple cycle so the first frame already has
  // an active crest; there is never a blank or bright pre-ripple state.
  const rippleStartOffsetRef = useRef(1.25);

  // Adjust globe horizontal center when side card is open/closed
  useEffect(() => {
    targetPositionXRef.current = isCardOpen ? -22 : 0;
  }, [isCardOpen]);

  // Respond to region / coordinate selection: smoothly ease rotation to target region
  useEffect(() => {
    let lat = 21.5;
    let lon = 78.9;
    let zoom = 280;

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

    // Track the selected region as a direction vector for the shader's
    // push-and-vibrate cone (radius doesn't matter, only direction).
    const dir = latLonToVector3(lat, lon, 1).normalize();
    selectedDirTargetRef.current.copy(dir);

    // A new selection = a fresh pin drop: reset the ambient ripple's origin
    // and restart its clock so a clean ring expands from this new point.
    rippleOriginDirRef.current.copy(dir);
    if (uniformsRef.current) {
      rippleOriginSetAtRef.current = uniformsRef.current.uTime.value - rippleStartOffsetRef.current;
    }

    // Position glowing 3D beacon at target coordinates on the sphere
    if (targetBeaconRef.current) {
      const pos = latLonToVector3(lat, lon, 101.5);
      targetBeaconRef.current.position.copy(pos);
      targetBeaconRef.current.visible = Boolean(selectedRegion || targetCoords);
    }
  }, [selectedRegion, targetCoords]);

  // Respond to HUD zoom buttons (+ / -)
  useEffect(() => {
    const base = 280 - zoomLevel * 25;
    targetZoomRef.current = Math.max(130, Math.min(300, base));
  }, [zoomLevel]);

  // Live-tune vibration amplitude / selection push without re-mounting the scene
  useEffect(() => {
    if (uniformsRef.current) uniformsRef.current.uVibrationAmp.value = vibrationAmp;
  }, [vibrationAmp]);

  useEffect(() => {
    if (uniformsRef.current) uniformsRef.current.uSelectedStrength.value = selectedPushStrength;
  }, [selectedPushStrength]);

  useEffect(() => {
    if (uniformsRef.current) uniformsRef.current.uSelectedRadius.value = selectedAngularRadius;
  }, [selectedAngularRadius]);

  useEffect(() => {
    if (uniformsRef.current) uniformsRef.current.uHoverStrength.value = hoverPushStrength;
  }, [hoverPushStrength]);

  useEffect(() => {
    if (uniformsRef.current) uniformsRef.current.uHoverRadius.value = hoverAngularRadius;
  }, [hoverAngularRadius]);

  useEffect(() => {
    if (uniformsRef.current) uniformsRef.current.uRayCount.value = raySpokeCount;
  }, [raySpokeCount]);

  useEffect(() => {
    if (uniformsRef.current) {
      uniformsRef.current.uSelectionActive.value = selectedRegion || targetCoords ? 1 : 0;
    }
  }, [selectedRegion, targetCoords]);

  useEffect(() => {
    if (uniformsRef.current) uniformsRef.current.uRippleBandWidth.value = rippleBandWidth;
  }, [rippleBandWidth]);

  useEffect(() => {
    if (uniformsRef.current) uniformsRef.current.uRippleTrailFreq.value = rippleTrailFrequency;
  }, [rippleTrailFrequency]);

  useEffect(() => {
    if (uniformsRef.current) uniformsRef.current.uRippleTrailDecay.value = rippleTrailDecay;
  }, [rippleTrailDecay]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 1. Scene & Camera Setup
    const scene = new THREE.Scene();
    scene.background = null;
    scene.fog = new THREE.FogExp2(0x050308, 0.0028);

    // The reference has no point-light wash or external Earth halo.

    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 1500);
    camera.position.z = 280;
    cameraRef.current = camera;

    // 2. WebGL Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setClearColor(0x000000, 0);
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

    // Check for reduced-motion preference — skip the reveal ripple if set.
    let prefersReducedMotion = false;
    try {
      prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      prefersReducedMotion = false;
    }
    // Continuous mode: do not hide or switch on the whole globe at startup.
    // The point cloud is visible immediately and the ambient ripple is already moving.
    // No startup reveal or whole-Earth glow. The point cloud is visible immediately.
    const revealEnabled = false;
    const REVEAL_MAX_RADIUS = Math.PI * 1.08; // just past the antipode, margin for band width

    // Reveal expands from wherever the globe starts centered (the initial
    // selection), so the intro ripple and the first ambient ripple share
    // the same origin and hand off seamlessly.
    const initialDir = (() => {
      let lat = 21.5, lon = 78.9;
      if (targetCoords && typeof targetCoords.lat === "number") {
        lat = targetCoords.lat; lon = targetCoords.lon;
      } else if (selectedRegion && REGION_COORDINATES[selectedRegion]) {
        lat = REGION_COORDINATES[selectedRegion].lat;
        lon = REGION_COORDINATES[selectedRegion].lon;
      }
      return latLonToVector3(lat, lon, 1).normalize();
    })();
    selectedDirCurrentRef.current.copy(initialDir);
    selectedDirTargetRef.current.copy(initialDir);
    rippleOriginDirRef.current.copy(initialDir);
    rippleOriginSetAtRef.current = -rippleStartOffsetRef.current;

    const uniforms = {
      uTime: { value: 0 },
      pointTexture: { value: particleTexture },
      uVibrationAmp: { value: vibrationAmp },
      uSelectedDir: { value: selectedDirCurrentRef.current.clone() },
      uSelectedRadius: { value: selectedAngularRadius },
      uSelectedStrength: { value: selectedPushStrength },
      uHoverDir: { value: new THREE.Vector3(0, 0, 1) },
      uHoverRadius: { value: hoverAngularRadius },
      uHoverStrength: { value: hoverPushStrength },
      uHoverActive: { value: 0 },
      uRayCount: { value: raySpokeCount },
      uSelectionActive: { value: selectedRegion || targetCoords ? 1 : 0 },

      uRevealOriginDir: { value: initialDir.clone() },
      uRevealFrontRadius: { value: revealEnabled ? 0 : REVEAL_MAX_RADIUS },
      uRevealBandWidth: { value: revealBandWidth },
      uRevealGlowGate: { value: revealEnabled ? 1 : 0 },

      uRippleOriginDir: { value: initialDir.clone() },
      uRippleRadius: { value: 0.72 },
      uRippleBandWidth: { value: rippleBandWidth },
      uRippleTrailFreq: { value: rippleTrailFrequency },
      uRippleTrailDecay: { value: rippleTrailDecay },
      // Start dark; the animation loop enables the first ripple after mount.
      uRippleEnvelope: { value: rippleGlowStrength },
    };
    uniformsRef.current = uniforms;

    const pointsMaterial = new THREE.ShaderMaterial({
      vertexShader: PointsShader.vertexShader,
      fragmentShader: PointsShader.fragmentShader,
      uniforms: uniforms,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });

    const pointsMesh = new THREE.Points(geometry, pointsMaterial);
    pointsMesh.renderOrder = 1;
    globeGroup.add(pointsMesh);

    // Populate geometry from Float32Array interleaved buffer.
    // Two CONCENTRIC shells are built from two independently-offset
    // samplings of the same source data — layer 0 ("outer") reads points
    // starting at offset 0, layer 1 ("inner") starts at a different offset
    // — so the two shells hold genuinely different points at visibly
    // different radii, not the same point duplicated twice. Per-point size
    // gets a randomized multiplier (mostly small, occasional large) to
    // match the reference's stochastic size variance.
    const applyBufferData = (buffer) => {
      const floatView = new Float32Array(buffer);
      const rawCount = floatView.length / 8;
      const step = Math.max(2, pointStep);
      const outerCount = Math.floor(rawCount / step);
      const innerStep = step; // same density, different phase -> different points
      const innerOffset = Math.floor(step / 2) || 1;
      const innerCount = Math.floor((rawCount - innerOffset) / innerStep);
      const topCount = Math.floor(outerCount * 0.45);
      const totalCount = outerCount + innerCount + topCount;

      const OUTER_SCALE = 1.035;
      const INNER_SCALE = 0.965;
      const TOP_SCALE = 1.075;

      const positions = new Float32Array(totalCount * 3);
      const colors = new Float32Array(totalCount * 3);
      const sizes = new Float32Array(totalCount);
      const isIndia = new Float32Array(totalCount);
      const randSeed = new Float32Array(totalCount);
      const layerId = new Float32Array(totalCount);

      const sizeVariance = () => 0.55 + Math.pow(Math.random(), 3.2) * 1.65;

      const createShuffledIndices = () => {
        const indices = Array.from({ length: rawCount }, (_, index) => index);
        for (let index = indices.length - 1; index > 0; index -= 1) {
          const swapIndex = Math.floor(Math.random() * (index + 1));
          [indices[index], indices[swapIndex]] = [indices[swapIndex], indices[index]];
        }
        return indices;
      };

      const outerIndices = createShuffledIndices();
      const innerIndices = createShuffledIndices();
      const topIndices = createShuffledIndices();

      const writePoint = (idx, srcIndex, scale, layer) => {
        const offset = srcIndex * 8;
        const px = floatView[offset];
        const py = floatView[offset + 1];
        const pz = floatView[offset + 2];
        const cr = floatView[offset + 3];
        const cg = floatView[offset + 4];
        const cb = floatView[offset + 5];
        const baseSize = floatView[offset + 6];
        const indiaFlag = floatView[offset + 7];

        positions[idx * 3] = px * scale;
        positions[idx * 3 + 1] = py * scale;
        positions[idx * 3 + 2] = pz * scale;

        colors[idx * 3] = cr;
        colors[idx * 3 + 1] = cg;
        colors[idx * 3 + 2] = cb;

        sizes[idx] = baseSize * sizeVariance();
        isIndia[idx] = indiaFlag;
        randSeed[idx] = Math.random();
        layerId[idx] = layer;
      };

      // Each shell samples a separate shuffled source order. This keeps the
      // geographic distribution while avoiding duplicated point rows.
      for (let i = 0; i < outerCount; i++) {
        writePoint(i, outerIndices[i * step], OUTER_SCALE, 0);
      }
      // The inner shell is independently sampled and remains outside the core.
      for (let i = 0; i < innerCount; i++) {
        writePoint(outerCount + i, innerIndices[i * innerStep], INNER_SCALE, 1);
      }
      // A lighter, sparse outer halo creates the second concentric contour
      // without making the main globe uniformly denser.
      for (let i = 0; i < topCount; i++) {
        writePoint(outerCount + innerCount + i, topIndices[i * step], TOP_SCALE, 2);
      }

      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
      geometry.setAttribute("isIndia", new THREE.BufferAttribute(isIndia, 1));
      geometry.setAttribute("randSeed", new THREE.BufferAttribute(randSeed, 1));
      geometry.setAttribute("layerId", new THREE.BufferAttribute(layerId, 1));
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
    const coreGeometry = new THREE.SphereGeometry(97.5, 48, 48);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0x020308,
    });
    const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
    coreMesh.renderOrder = 0;
    globeGroup.add(coreMesh);

    // 6b. Invisible proxy sphere used purely for cursor raycasting (matches
    // the particle shell radius so hover picks the same surface the dots sit on).
    const hoverProxyGeometry = new THREE.SphereGeometry(101, 48, 48);
    const hoverProxyMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const hoverProxyMesh = new THREE.Mesh(hoverProxyGeometry, hoverProxyMaterial);
    globeGroup.add(hoverProxyMesh);

    // Cursor hover state: raycasted each frame against hoverProxyMesh, smoothed
    // so the push/vibrate cone eases in and out rather than snapping.
    const raycaster = new THREE.Raycaster();
    const hoverNdc = new THREE.Vector2(-10, -10); // starts off-screen (no hover)
    const hoverDirTarget = new THREE.Vector3(0, 0, 1);
    const hoverDirCurrent = new THREE.Vector3(0, 0, 1);
    let hoverActiveTarget = 0;
    let hoverActiveCurrent = 0;

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
    beaconGroup.visible = Boolean(selectedRegion || targetCoords);
    targetBeaconRef.current = beaconGroup;

    // 8. Luminous Orbital Satellite Rings (INSAT-3DR, VIIRS, Sentinel-3)
    const orbitalGroup = new THREE.Group();
    globeGroup.add(orbitalGroup);

    const orbitConfigs = [];
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

      const glowTexture = new THREE.CanvasTexture((() => {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext("2d");
        if (!ctx) return canvas;

        const gradient = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
        gradient.addColorStop(0, "rgba(255,255,255,1)");
        gradient.addColorStop(0.18, "rgba(255,255,255,0.95)");
        gradient.addColorStop(0.35, "rgba(255,255,255,0.5)");
        gradient.addColorStop(0.7, "rgba(255,255,255,0.08)");
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 256, 256);

        return canvas;
      })());

      const satGlow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color: cfg.color,
          transparent: true,
          opacity: 1,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      satGlow.scale.set(11.5, 11.5, 1);

      const satCore = new THREE.Mesh(
        new THREE.SphereGeometry(1.1, 18, 18),
        new THREE.MeshBasicMaterial({
          color: cfg.color,
          transparent: true,
          opacity: 1,
          blending: THREE.AdditiveBlending,
        })
      );

      const satGroup = new THREE.Group();
      satGroup.add(satGlow);
      satGroup.add(satCore);
      orbitalGroup.add(satGroup);

      satellites.push({
        group: satGroup,
        glow: satGlow,
        core: satCore,
        radius: cfg.radius,
        tiltX: cfg.tiltX,
        tiltZ: cfg.tiltZ,
        speed: cfg.speed,
        angle: Math.random() * Math.PI * 2,
        pulsePhase: Math.random() * Math.PI * 2,
      });
    });
    satellitesRef.current = satellites;

    // Small additive radiation layers: soft colored aura lights sit around the
    // globe and remain independent from the particle ripple.
    const createAuraTexture = (innerColor, outerColor) => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      if (!ctx) return new THREE.CanvasTexture(canvas);
      const gradient = ctx.createRadialGradient(128, 128, 5, 128, 128, 128);
      gradient.addColorStop(0, innerColor);
      gradient.addColorStop(0.24, outerColor);
      gradient.addColorStop(0.68, outerColor.replace("0.42", "0.08"));
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 256, 256);
      return new THREE.CanvasTexture(canvas);
    };

    const radiationGroup = new THREE.Group();
    globeGroup.add(radiationGroup);
    const auraConfigs = [
      { color: 0xffc46b, inner: "rgba(255,255,235,0.7)", outer: "rgba(255,190,76,0.42)", position: [-78, 30, 18], scale: 50, speed: 0.24, phase: 0.2 },
      { color: 0xff8fb8, inner: "rgba(255,230,240,0.6)", outer: "rgba(255,112,172,0.42)", position: [64, 34, -20], scale: 45, speed: 0.19, phase: 1.4 },
      { color: 0x9fa7ff, inner: "rgba(230,232,255,0.54)", outer: "rgba(119,128,255,0.42)", position: [18, -66, 20], scale: 42, speed: 0.27, phase: 2.7 },
      { color: 0xffa06f, inner: "rgba(255,238,210,0.58)", outer: "rgba(255,128,76,0.42)", position: [-36, 60, -10], scale: 39, speed: 0.22, phase: 3.6 },
    ];
    const radiationSprites = auraConfigs.map((cfg) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: createAuraTexture(cfg.inner, cfg.outer),
        color: cfg.color,
        transparent: true,
        opacity: 0.045,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      sprite.position.set(...cfg.position);
      sprite.scale.set(cfg.scale, cfg.scale, 1);
      radiationGroup.add(sprite);
      return { sprite, ...cfg };
    });

    const radiationArcs = [
      { radius: 106, color: 0xffd6b1, tiltX: 0.35, tiltZ: 0.18, speed: 0.07, phase: 0.2 },
      { radius: 111, color: 0xffc8d4, tiltX: -0.52, tiltZ: -0.2, speed: -0.055, phase: 1.5 },
      { radius: 116, color: 0xc4c9e8, tiltX: 1.02, tiltZ: 0.3, speed: 0.045, phase: 2.8 },
    ].map((cfg) => {
      const points = [];
      for (let index = 0; index <= 72; index += 1) {
        const angle = -Math.PI * 0.62 + (index / 72) * Math.PI * 1.24;
        points.push(new THREE.Vector3(Math.cos(angle) * cfg.radius, 0, Math.sin(angle) * cfg.radius));
      }
      const arcGeometry = new THREE.BufferGeometry().setFromPoints(points);
      const arcMaterial = new THREE.LineBasicMaterial({
        color: cfg.color,
        transparent: true,
        opacity: 0.028,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      });
      const arc = new THREE.Line(arcGeometry, arcMaterial);
      arc.rotation.x = cfg.tiltX;
      arc.rotation.z = cfg.tiltZ;
      arc.renderOrder = 4;
      radiationGroup.add(arc);
      return { arc, arcGeometry, ...cfg };
    });

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

    // Track cursor position (in NDC space) purely for the hover raycast —
    // independent of the drag-to-rotate handler above, so hovering works
    // whether or not the user is currently dragging the globe.
    const onHoverPointerMove = (e) => {
      const rect = dom.getBoundingClientRect();
      hoverNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      hoverNdc.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    };
    const onHoverPointerLeave = () => {
      hoverActiveTarget = 0;
      hoverNdc.set(-10, -10);
    };

    const dom = renderer.domElement;
    dom.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    dom.addEventListener("wheel", onWheel, { passive: false });
    dom.addEventListener("pointermove", onHoverPointerMove);
    dom.addEventListener("pointerleave", onHoverPointerLeave);

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

        // One-shot reveal ripple: angular front radius grows 0 -> just past
        // the antipode over revealDuration seconds, then the glow gate
        // fades so the shader stops paying for it (visibility stays at 1
        // for the whole sphere once the front has fully passed).
        // Continuous ambient ripple: angular radius grows from the moment
        // the current origin was set, loops back to 0 at rippleMaxRadius,
        // with a fade envelope right at the seam so the loop is invisible.
        const sinceOrigin = elapsedTime - rippleOriginSetAtRef.current;
        const rippleRadius = ((sinceOrigin * rippleSpeed) % rippleMaxRadius + rippleMaxRadius) % rippleMaxRadius;
        uniformsRef.current.uRippleRadius.value = rippleRadius;
        uniformsRef.current.uRippleOriginDir.value.copy(rippleOriginDirRef.current);
        uniformsRef.current.uRippleEnvelope.value = rippleGlowStrength;

        // Smoothly ease the selected-region direction toward its target
        // and push it to the shader so the vibrate/push cone tracks
        // whichever region was just selected.
        selectedDirCurrentRef.current.lerp(selectedDirTargetRef.current, 0.05);
        if (selectedDirCurrentRef.current.lengthSq() > 0.0001) {
          selectedDirCurrentRef.current.normalize();
        }
        uniformsRef.current.uSelectedDir.value.copy(selectedDirCurrentRef.current);

        // Raycast the cursor against the proxy sphere each frame to find
        // the hovered point on the globe surface, then ease the push/vibrate
        // cone toward it (and fade it out smoothly when the cursor leaves).
        raycaster.setFromCamera(hoverNdc, camera);
        const hoverHits = raycaster.intersectObject(hoverProxyMesh, false);
        if (hoverHits.length > 0) {
          const localPoint = globeGroup.worldToLocal(hoverHits[0].point.clone());
          hoverDirTarget.copy(localPoint).normalize();
          hoverActiveTarget = 1.0;
        } else {
          hoverActiveTarget = 0.0;
        }
        hoverActiveCurrent += (hoverActiveTarget - hoverActiveCurrent) * 0.15;
        hoverDirCurrent.lerp(hoverDirTarget, 0.25);
        if (hoverDirCurrent.lengthSq() > 0.0001) {
          hoverDirCurrent.normalize();
        }
        uniformsRef.current.uHoverDir.value.copy(hoverDirCurrent);
        uniformsRef.current.uHoverActive.value = hoverActiveCurrent;
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
          // Slow, frame-rate-independent continuous orientation drift.
          targetRotationRef.current.y += delta * 0.045;
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

      radiationSprites.forEach((fx) => {
        const pulse = 0.5 + 0.5 * Math.sin(elapsedTime * fx.speed + fx.phase);
        fx.sprite.material.opacity = 0.11 + pulse * 0.10;
        const scale = fx.scale * (0.96 + pulse * 0.08);
        fx.sprite.scale.set(scale, scale, 1);
      });

      radiationArcs.forEach((fx) => {
        const pulse = 0.5 + 0.5 * Math.sin(elapsedTime * fx.speed + fx.phase);
        fx.arc.material.opacity = 0.12 + pulse * 0.14;
        fx.arc.rotation.y += fx.speed * delta;
      });

      satellitesRef.current.forEach((sat) => {
        sat.angle += delta * sat.speed * 0.45;
        sat.pulsePhase += delta * 2.2;

        const pos = new THREE.Vector3(
          sat.radius * Math.cos(sat.angle),
          0,
          sat.radius * Math.sin(sat.angle),
        );
        pos.applyAxisAngle(new THREE.Vector3(1, 0, 0), sat.tiltX);
        pos.applyAxisAngle(new THREE.Vector3(0, 0, 1), sat.tiltZ);
        sat.group.position.copy(pos);

        const pulse = 1 + Math.sin(sat.pulsePhase) * 0.35;
        sat.group.scale.setScalar(pulse);
        sat.glow.material.opacity = 0.42 + (Math.sin(sat.pulsePhase * 1.2) + 1) * 0.25;
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
      dom.removeEventListener("pointermove", onHoverPointerMove);
      dom.removeEventListener("pointerleave", onHoverPointerLeave);

      radiationSprites.forEach((fx) => {
        fx.sprite.material.map?.dispose();
        fx.sprite.material.dispose();
      });
      radiationArcs.forEach((fx) => {
        fx.arcGeometry.dispose();
        fx.arc.material.dispose();
      });
      geometry.dispose();
      pointsMaterial.dispose();
      coreGeometry.dispose();
      coreMaterial.dispose();
      hoverProxyGeometry.dispose();
      hoverProxyMaterial.dispose();
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
        backgroundColor: "#050308",
      }}
      aria-label="Interactive 3D Earth Globe"
    />
  );
}