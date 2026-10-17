import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

// A shell of "records" around a glowing core. The slider adds noise: points drift
// away from their true position. The cursor pushes nearby points aside.
const COUNT = 9000;

const VERT = /* glsl */ `
uniform float uTime;
uniform float uScatter;
uniform float uScale;
uniform vec3 uPointer;
uniform float uPointerForce;
attribute vec4 aSeed;
attribute float aWarm;
varying float vWarm;
varying float vSeed;
varying float vFade;
void main() {
  vec3 p = position;
  vec3 wobble = vec3(
    sin(uTime * 0.6 + aSeed.x * 6.2831),
    cos(uTime * 0.5 + aSeed.y * 6.2831),
    sin(uTime * 0.7 + aSeed.z * 6.2831)
  );
  p += wobble * uScatter * (0.25 + aSeed.w) * 0.9;
  p += normalize(position) * uScatter * aSeed.w * 0.8;
  p += wobble * 0.012;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vec3 away = world.xyz - uPointer;
  float push = smoothstep(1.1, 0.0, length(away.xy)) * uPointerForce;
  world.xyz += normalize(vec3(away.xy, 0.35)) * push * (0.35 + aSeed.w * 0.6);
  vec4 mv = viewMatrix * world;
  gl_Position = projectionMatrix * mv;
  float size = mix(0.007, 0.022, aSeed.w) * (1.0 + aWarm * 1.6);
  gl_PointSize = max(1.0, 2.0 * size * uScale / -mv.z);
  vWarm = aWarm;
  vSeed = aSeed.x;
  vFade = 0.55 + 0.45 * aSeed.y;
}`;

const FRAG = /* glsl */ `
precision mediump float;
varying float vWarm;
varying float vSeed;
varying float vFade;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = pow(smoothstep(0.5, 0.0, d), 1.7);
  vec3 cool = mix(vec3(0.55, 0.5, 1.0), vec3(0.4, 0.85, 0.9), vSeed);
  vec3 warm = vec3(1.0, 0.72, 0.4);
  vec3 col = mix(cool, warm, vWarm);
  gl_FragColor = vec4(col * (0.9 + vWarm * 1.4), a * vFade);
}`;

function buildGeometry() {
  const pos = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT * 4);
  const warm = new Float32Array(COUNT);
  let i = 0;
  let guard = 0;
  while (i < COUNT && guard < COUNT * 20) {
    guard += 1;
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const dx = s * Math.cos(th), dy = u, dz = s * Math.sin(th);
    // carve fractures into the shell so it reads as shattered
    const f = Math.sin(dx * 5.1 + 1.3) * Math.sin(dy * 4.7 + 0.4) * Math.sin(dz * 5.3 + 2.1);
    if (f > 0.5 && Math.random() < 0.92) continue;
    const ember = Math.random() < 0.04;
    const r = ember ? 0.55 + Math.random() * 0.5 : 1.0 + Math.pow(Math.random(), 2.2) * 0.5;
    pos.set([dx * r, dy * r * 0.92, dz * r], i * 3);
    seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    warm[i] = ember ? 1 : 0;
    i += 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
  geo.setAttribute("aWarm", new THREE.BufferAttribute(warm, 1));
  geo.setDrawRange(0, i);
  return geo;
}

function makeGlowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// Shown only if WebGL is unavailable.
function CssOrb() {
  return (
    <div className="hero-visual" aria-hidden="true">
      <div className="orb orb-back" />
      <div className="orb orb-front">
        <div className="orb-core" />
        <div className="orb-ring ring-one" />
        <div className="orb-ring ring-two" />
        <span className="orb-node node-one" />
        <span className="orb-node node-two" />
        <span className="orb-node node-three" />
      </div>
    </div>
  );
}

export default function HeroScene() {
  const mountRef = useRef(null);
  const noiseRef = useRef(0.18);
  const [noise, setNoise] = useState(0.18);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch (err) {
      setFallback(true);
      return undefined;
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute("aria-hidden", "true");
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    camera.position.z = 5.2;
    const group = new THREE.Group();
    scene.add(group);

    const geo = buildGeometry();
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uScatter: { value: 0 },
        uScale: { value: 800 },
        uPointer: { value: new THREE.Vector3(9, 9, 0) },
        uPointerForce: { value: 0 },
      },
    });
    group.add(new THREE.Points(geo, mat));

    const glowTex = makeGlowTexture();
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc887, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(2.4);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x8c7bff, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(5.4);
    scene.add(halo, glow);

    let halfW = 2;
    let halfH = 2;
    function resize() {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      mat.uniforms.uScale.value = (h * dpr * 0.5) / tanHalf;
      halfH = tanHalf * camera.position.z;
      halfW = halfH * camera.aspect;
      group.scale.setScalar(Math.min(1, halfW / 1.75));
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const target = { x: 0, y: 0 };
    const ptr = { x: 0, y: 0 };
    let hover = false;
    const host = mount.closest(".hero-panel") || mount;
    const onMove = (e) => {
      if (e.pointerType === "touch") return;
      const r = mount.getBoundingClientRect();
      target.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      target.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
      hover = true;
    };
    const onLeave = () => { hover = false; target.x = 0; target.y = 0; };
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);

    const u = mat.uniforms;
    const clock = new THREE.Clock();
    let time = 0;
    let raf = 0;
    let inView = true;

    function tick() {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      if (!reduced) time += dt;
      ptr.x += (target.x - ptr.x) * 0.08;
      ptr.y += (target.y - ptr.y) * 0.08;
      u.uTime.value = time;
      u.uScatter.value += (noiseRef.current * 1.6 + (hover ? 0.05 : 0) - u.uScatter.value) * 0.07;
      u.uPointerForce.value += ((hover ? 0.55 : 0) - u.uPointerForce.value) * 0.08;
      u.uPointer.value.set(ptr.x * halfW, ptr.y * halfH, 0);
      if (!reduced) group.rotation.y += dt * 0.14;
      group.rotation.x += (0.35 - ptr.y * 0.25 - group.rotation.x) * 0.05;
      glow.material.opacity = 0.8 + 0.12 * Math.sin(time * 1.8);
      renderer.render(scene, camera);
    }
    const start = () => { if (!raf && inView && !document.hidden) { clock.getDelta(); raf = requestAnimationFrame(tick); } };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    const io = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; if (inView) start(); else stop(); });
    io.observe(mount);
    const onVisibility = () => { if (document.hidden) stop(); else start(); };
    document.addEventListener("visibilitychange", onVisibility);
    start();

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      geo.dispose();
      mat.dispose();
      glow.material.dispose();
      halo.material.dispose();
      glowTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  if (fallback) return <CssOrb />;

  const pct = Math.round(noise * 100);
  return (
    <>
      <div className="hero-3d" ref={mountRef} />
      <label className="noise-control">
        <span>Noise added</span>
        <input
          type="range"
          min="0"
          max="100"
          value={pct}
          aria-label="Noise added to the data cloud"
          onChange={(e) => { const v = Number(e.target.value) / 100; noiseRef.current = v; setNoise(v); }}
        />
        <output>{pct}%</output>
      </label>
    </>
  );
}
