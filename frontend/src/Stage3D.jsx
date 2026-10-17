import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// Slide 0: big chrome sculpture on the right. Slide 1: it leaves and three solids
// sit on the module cards. Slide 2/3: it comes back smaller.
const HERO = [{ x: 0.42, s: 1 }, { x: 0.42, s: 0 }, { x: 0.58, s: 0.55 }, { x: 0.45, s: 0.8 }];
const lerp = (a, b, t) => a + (b - a) * t;
const chrome = (color, roughness) =>
  new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.7 });

export default function Stage3D({ index }) {
  const mountRef = useRef(null);
  const indexRef = useRef(index);
  useEffect(() => { indexRef.current = index; }, [index]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch (err) { return undefined; }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.setAttribute("aria-hidden", "true");
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    camera.position.z = 5.2;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.6;
    [[0x8c7bff, 2.2, -3, 2, 3], [0x64d9db, 1.6, 3, -1, 2], [0xffc887, 1.8, 0, 3, -3]].forEach(([c, i, x, y, z]) => {
      const l = new THREE.DirectionalLight(c, i);
      l.position.set(x, y, z);
      scene.add(l);
    });

    const disposables = [];
    const mesh = (geo, color, rough) => { const m = new THREE.Mesh(geo, chrome(color, rough)); disposables.push(geo, m.material); return m; };
    const hero = new THREE.Group();
    const knot = mesh(new THREE.TorusKnotGeometry(1, 0.34, 260, 40, 2, 3), 0xa79bff, 0.18);
    hero.add(knot);
    hero.scale.setScalar(0);
    scene.add(hero);
    const trio = [
      mesh(new THREE.IcosahedronGeometry(1, 0), 0xa79bff, 0.22),
      mesh(new THREE.OctahedronGeometry(1.15, 0), 0x64d9db, 0.22),
      mesh(new THREE.TorusGeometry(0.9, 0.3, 32, 80), 0xf0c27a, 0.22),
    ];
    trio.forEach((m) => { m.scale.setScalar(0); m.visible = false; scene.add(m); });
    const anchors = [...mount.parentElement.querySelectorAll("[data-anchor]")].sort((a, b) => Number(a.dataset.anchor) - Number(b.dataset.anchor));

    let halfW = 2, halfH = 2;
    const resize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
      halfW = halfH * camera.aspect;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const target = { x: 0, y: 0 }, ptr = { x: 0, y: 0 };
    const onMove = (e) => {
      target.x = (e.clientX / window.innerWidth) * 2 - 1;
      target.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove);

    const clock = new THREE.Clock();
    let time = 0, raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      if (!reduced) time += dt;
      const cr = mount.getBoundingClientRect();
      const upp = (2 * halfH) / Math.max(1, cr.height);
      const i = indexRef.current;
      ptr.x = lerp(ptr.x, target.x, 0.06);
      ptr.y = lerp(ptr.y, target.y, 0.06);

      const narrow = cr.width / Math.max(1, cr.height) < 1.1;
      const h = HERO[Math.min(i, HERO.length - 1)];
      const base = narrow ? 0.38 * halfH : Math.min(0.57 * halfH, 0.34 * halfW);
      hero.position.x = lerp(hero.position.x, (narrow ? 0 : h.x) * halfW, 0.07);
      hero.position.y = lerp(hero.position.y, (narrow ? 0.45 : 0) * halfH, 0.07);
      const hs = lerp(hero.scale.x, base * h.s, 0.07);
      hero.scale.setScalar(hs);
      hero.visible = hs > 0.01;
      hero.rotation.y = lerp(hero.rotation.y, ptr.x * 0.5, 0.06);
      hero.rotation.x = lerp(hero.rotation.x, -ptr.y * 0.4, 0.06);
      knot.position.y = Math.sin(time * 1.1) * 0.06;
      if (!reduced) knot.rotation.y += dt * 0.3;

      trio.forEach((m, k) => {
        const a = anchors[k];
        let ts = 0;
        if (a) {
          const r = a.getBoundingClientRect();
          m.position.set((r.left + r.width / 2 - cr.left - cr.width / 2) * upp, -(r.top + r.height / 2 - cr.top - cr.height / 2) * upp, 0);
          if (i === 1) ts = r.height * upp * 0.4;
        }
        const s = lerp(m.scale.x, ts, 0.1);
        m.scale.setScalar(s);
        m.visible = s > 0.01;
        if (!reduced) m.rotation.y += dt * (0.5 + k * 0.15);
        m.rotation.x = lerp(m.rotation.x, 0.3 - ptr.y * 0.3, 0.06);
      });
      renderer.render(scene, camera);
    };
    const start = () => { if (!raf && !document.hidden) { clock.getDelta(); raf = requestAnimationFrame(tick); } };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVis);
    start();

    return () => {
      stop();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onMove);
      disposables.forEach((d) => d.dispose());
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div className="stage3d" ref={mountRef} />;
}
