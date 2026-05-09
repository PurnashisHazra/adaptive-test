import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type {
  StudentOverallAnalytics,
  StudentOverallAxisViewKey,
  StudentOverallDimension,
  StudentOverallDimensionKey,
} from "../api/types";

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function toPolar(cx: number, cy: number, radius: number, idx: number, n: number): [number, number] {
  const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / n;
  return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
}

function polygon(scores: number[], cx: number, cy: number, rMax: number): string {
  return scores
    .map((v, i) => {
      const [x, y] = toPolar(cx, cy, (clamp(v) / 100) * rMax, i, scores.length);
      return `${x},${y}`;
    })
    .join(" ");
}

function makeTextSprite(text: string, color = "#0f172a"): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.strokeStyle = "rgba(148,163,184,0.65)";
    ctx.lineWidth = 2;
    ctx.fillRect(4, 8, canvas.width - 8, canvas.height - 16);
    ctx.strokeRect(4, 8, canvas.width - 8, canvas.height - 16);
    ctx.font = "600 34px DM Sans, sans-serif";
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.95, 0.28, 1);
  return sprite;
}

export function StudentOverall3DSpider({ data }: { data: StudentOverallAnalytics }) {
  const [viewKey, setViewKey] = useState<StudentOverallAxisViewKey>("time_knowledge");
  const [azimuthDeg, setAzimuthDeg] = useState(0);
  const [polarDeg, setPolarDeg] = useState(56);
  const [scatterHover, setScatterHover] = useState<string | null>(null);
  const [scatterSelected, setScatterSelected] = useState<string | null>(null);
  const [scatterAzimuthDeg, setScatterAzimuthDeg] = useState(0);
  const [scatterPolarDeg, setScatterPolarDeg] = useState(58);
  const scatterHoverRef = useRef<string | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const scatterRef = useRef<HTMLDivElement | null>(null);

  const dimMap = useMemo(() => {
    const m = new Map<StudentOverallDimensionKey, StudentOverallDimension>();
    for (const d of data.dimensions) m.set(d.key, d);
    return m;
  }, [data.dimensions]);

  const active = data.axis_views.find((v) => v.key === viewKey) ?? data.axis_views[0];
  const xDim = active ? dimMap.get(active.x_dimension) : undefined;
  const yDim = active ? dimMap.get(active.y_dimension) : undefined;
  const zDim = data.dimensions.find((d) => d.key !== active?.x_dimension && d.key !== active?.y_dimension) ?? data.dimensions[0];

  const viewInference = useMemo(() => {
    const x = active?.x_strength ?? 0;
    const y = active?.y_strength ?? 0;
    const z = zDim?.overall_strength ?? 0;
    const planeLead = Math.abs(x - y) <= 8 ? "balanced" : x > y ? "x_dominant" : "y_dominant";
    const orientHint =
      Math.abs(azimuthDeg) > 25
        ? "Side-view angle emphasizes trade-offs between the two active axes."
        : polarDeg < 46
          ? "You are viewing from a steeper angle, which emphasizes depth between the active plane and Z axis."
          : "You are near a neutral angle, useful for overall balance assessment.";

    let primary = "";
    if (planeLead === "balanced") {
      primary = `Your current ${active?.label ?? "active"} plane is balanced (${x.toFixed(1)}% vs ${y.toFixed(1)}%).`;
    } else if (planeLead === "x_dominant") {
      primary = `${xDim?.label ?? "X axis"} leads ${yDim?.label ?? "Y axis"} by ${(x - y).toFixed(1)} points.`;
    } else {
      primary = `${yDim?.label ?? "Y axis"} leads ${xDim?.label ?? "X axis"} by ${(y - x).toFixed(1)} points.`;
    }
    const depth =
      z >= Math.max(x, y)
        ? `${zDim?.label ?? "Depth axis"} is your strongest hidden pillar right now (${z.toFixed(1)}%).`
        : `${zDim?.label ?? "Depth axis"} trails the active plane; improve this to stabilize overall performance.`;
    return { primary, depth, orientHint };
  }, [active, xDim, yDim, zDim, azimuthDeg, polarDeg]);

  const factors = (xDim ?? data.dimensions[0])?.factors ?? [];
  const attemptById = useMemo(
    () => new Map(data.attempt_points.map((p) => [p.attempt_id, p])),
    [data.attempt_points]
  );
  const selectedAttempt = (scatterSelected && attemptById.get(scatterSelected)) || null;
  const hoveredAttempt = (scatterHover && attemptById.get(scatterHover)) || null;

  useEffect(() => {
    const host = scatterRef.current;
    if (!host) return;
    const width = Math.max(320, host.clientWidth);
    const height = 280;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    host.innerHTML = "";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 100);
    camera.position.set(2.7, 2.4, 2.9);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 2;
    controls.maxDistance = 7;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minPolarAngle = Math.PI * 0.18;

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const dl = new THREE.DirectionalLight(0x93c5fd, 0.8);
    dl.position.set(3, 4, 2);
    scene.add(dl);

    const bounds = 2.6;
    const box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(bounds, bounds, bounds)),
      new THREE.LineBasicMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0.45 })
    );
    box.position.set(0, 0, bounds * 0.25);
    scene.add(box);

    const sprites: THREE.Sprite[] = [];
    const xLabel = makeTextSprite("TIME", "#166534");
    xLabel.position.set(bounds * 0.6, -bounds * 0.55, 0.08);
    const yLabel = makeTextSprite("DIFFICULTY", "#0369a1");
    yLabel.position.set(-bounds * 0.65, bounds * 0.5, 0.08);
    const zLabel = makeTextSprite("KNOWLEDGE", "#92400e");
    zLabel.position.set(-0.05, -0.1, bounds * 0.95);
    sprites.push(xLabel, yLabel, zLabel);
    sprites.forEach((s) => scene.add(s));

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pointMeshes: THREE.Mesh[] = [];
    const pointIdByUuid = new Map<string, string>();
    const dpGeo = new THREE.SphereGeometry(0.055, 20, 20);
    for (const p of data.attempt_points.slice(0, 25)) {
      const mesh = new THREE.Mesh(
        dpGeo,
        new THREE.MeshStandardMaterial({ color: 0x2563eb, emissive: 0x1d4ed8, emissiveIntensity: 0.28 })
      );
      mesh.position.set(
        (p.time_strength / 100) * bounds - bounds / 2,
        (p.difficulty_strength / 100) * bounds - bounds / 2,
        (p.knowledge_strength / 100) * bounds * 0.9
      );
      pointMeshes.push(mesh);
      pointIdByUuid.set(mesh.uuid, p.attempt_id);
      scene.add(mesh);
    }

    const ds = data.desired_state;
    const desiredMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 24, 24),
      new THREE.MeshStandardMaterial({ color: 0xc4b5fd, emissive: 0xa78bfa, emissiveIntensity: 0.3 })
    );
    desiredMesh.position.set(
      (ds.time_strength / 100) * bounds - bounds / 2,
      (ds.difficulty_strength / 100) * bounds - bounds / 2,
      (ds.knowledge_strength / 100) * bounds * 0.9
    );
    scene.add(desiredMesh);
    const desiredLabel = makeTextSprite("TARGET");
    desiredLabel.position.set(desiredMesh.position.x, desiredMesh.position.y, desiredMesh.position.z + 0.22);
    scene.add(desiredLabel);

    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pointMeshes, false);
      if (!hits.length) {
        setScatterHover(null);
        scatterHoverRef.current = null;
        return;
      }
      const id = pointIdByUuid.get(hits[0].object.uuid) || null;
      setScatterHover(id);
      scatterHoverRef.current = id;
    };
    const onClick = () => {
      if (scatterHoverRef.current) setScatterSelected(scatterHoverRef.current);
    };
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("click", onClick);

    let raf = 0;
    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    const updateAngles = () => {
      setScatterAzimuthDeg(Math.round(THREE.MathUtils.radToDeg(controls.getAzimuthalAngle())));
      setScatterPolarDeg(Math.round(THREE.MathUtils.radToDeg(controls.getPolarAngle())));
    };
    controls.addEventListener("change", updateAngles);
    updateAngles();

    const onResize = () => {
      if (!scatterRef.current) return;
      const w = Math.max(320, scatterRef.current.clientWidth);
      renderer.setSize(w, height);
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.removeEventListener("change", updateAngles);
      controls.dispose();
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("click", onClick);
      renderer.dispose();
      host.innerHTML = "";
    };
  }, [data.attempt_points, data.desired_state]);

  useEffect(() => {
    const host = mountRef.current;
    if (!host) return;

    const width = Math.max(320, host.clientWidth);
    const height = 320;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    host.innerHTML = "";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(2.6, 2.3, 3.1);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 2;
    controls.maxDistance = 7;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minPolarAngle = Math.PI * 0.16;

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    const dirA = new THREE.DirectionalLight(0x93c5fd, 0.9);
    dirA.position.set(3, 4, 2);
    const dirB = new THREE.DirectionalLight(0x0ea5e9, 0.35);
    dirB.position.set(-2, 2, -2);
    scene.add(ambient, dirA, dirB);

    const xS = (active?.x_strength ?? 0) / 100;
    const yS = (active?.y_strength ?? 0) / 100;
    const zS = (zDim?.overall_strength ?? 0) / 100;

    const geo = new THREE.PlaneGeometry(3.2, 3.2, 40, 40);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colorArr: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) / 1.6;
      const y = pos.getY(i) / 1.6;
      const hill =
        Math.exp(-((x - (xS * 2 - 1)) ** 2 + (y - (yS * 2 - 1)) ** 2) * 2.2) * (0.6 + zS * 0.8);
      const wave = 0.09 * Math.sin(4 * x + xS * 2) * Math.cos(4 * y + yS * 2);
      const h = hill + wave;
      pos.setZ(i, h);
      const t = Math.max(0, Math.min(1, (h + 0.15) / 1.35));
      const c = new THREE.Color().setHSL(0.62 - t * 0.2, 0.85, 0.46 + t * 0.18);
      colorArr.push(c.r, c.g, c.b);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colorArr, 3));
    geo.computeVertexNormals();
    const surf = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0.15,
        roughness: 0.38,
        transparent: true,
        opacity: 0.96,
        side: THREE.DoubleSide,
      })
    );
    scene.add(surf);
    const wire = new THREE.Mesh(
      geo.clone(),
      new THREE.MeshBasicMaterial({ color: 0x93c5fd, wireframe: true, transparent: true, opacity: 0.16 })
    );
    scene.add(wire);

    const nodeGeo = new THREE.SphereGeometry(0.075, 28, 28);
    const pTime = new THREE.Vector3(-1.2, -1.2, xS * 1.3);
    const pDiff = new THREE.Vector3(1.2, -1.2, yS * 1.3);
    const pKnow = new THREE.Vector3(0, 1.25, zS * 1.3);
    const nodes: Array<[THREE.Vector3, number, string]> = [
      [pTime, 0x22c55e, "TIME"],
      [pDiff, 0x0ea5e9, "DIFFICULTY"],
      [pKnow, 0xf59e0b, "KNOWLEDGE"],
    ];
    nodes.forEach(([p, color, label]) => {
      const m = new THREE.Mesh(nodeGeo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.22 }));
      m.position.copy(p);
      scene.add(m);
      const s = makeTextSprite(label);
      s.position.set(p.x, p.y, p.z + 0.22);
      scene.add(s);
    });
    const tri = new THREE.BufferGeometry().setFromPoints([pTime, pDiff, pKnow, pTime]);
    scene.add(new THREE.Line(tri, new THREE.LineBasicMaterial({ color: 0x334155 })));

    const axesHelper = new THREE.AxesHelper(1.8);
    axesHelper.material.transparent = true;
    axesHelper.material.opacity = 0.45;
    scene.add(axesHelper);

    const pointsGroup = new THREE.Group();
    const dpGeo = new THREE.SphereGeometry(0.038, 16, 16);
    const dpMat = new THREE.MeshStandardMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.9 });
    for (const p of data.attempt_points.slice(0, 14)) {
      const x = ((p.time_strength / 100) * 2.4) - 1.2;
      const y = ((p.difficulty_strength / 100) * 2.4) - 1.2;
      const z = (p.knowledge_strength / 100) * 1.3;
      const m = new THREE.Mesh(dpGeo, dpMat);
      m.position.set(x, y, z);
      pointsGroup.add(m);
    }
    scene.add(pointsGroup);

    const ds = data.desired_state;
    const desired = new THREE.Vector3(
      ((ds.time_strength / 100) * 2.4) - 1.2,
      ((ds.difficulty_strength / 100) * 2.4) - 1.2,
      (ds.knowledge_strength / 100) * 1.3
    );
    const desiredDots = new THREE.Group();
    const dMat = new THREE.MeshStandardMaterial({ color: 0xc7d2fe, emissive: 0xc7d2fe, emissiveIntensity: 0.25 });
    for (let i = 1; i <= 3; i++) {
      const t = i / 3;
      const cur = new THREE.Vector3().lerpVectors(new THREE.Vector3(0, 0, 0.15), desired, t);
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 16), dMat);
      d.position.copy(cur);
      desiredDots.add(d);
    }
    scene.add(desiredDots);
    const desiredLabel = makeTextSprite("DESIRED STATE", "#4338ca");
    desiredLabel.position.set(desired.x, desired.y, desired.z + 0.24);
    scene.add(desiredLabel);

    let raf = 0;
    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    const updateAngles = () => {
      setAzimuthDeg(Math.round(THREE.MathUtils.radToDeg(controls.getAzimuthalAngle())));
      setPolarDeg(Math.round(THREE.MathUtils.radToDeg(controls.getPolarAngle())));
    };
    controls.addEventListener("change", updateAngles);
    updateAngles();

    const onResize = () => {
      if (!mountRef.current) return;
      const w = Math.max(320, mountRef.current.clientWidth);
      renderer.setSize(w, height);
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.removeEventListener("change", updateAngles);
      controls.dispose();
      geo.dispose();
      renderer.dispose();
      host.innerHTML = "";
    };
  }, [active?.x_strength, active?.y_strength, zDim?.overall_strength, viewKey, data.attempt_points, data.desired_state]);

  return (
    <section
      className="card"
      style={{
        marginTop: "1rem",
        background:
          "radial-gradient(1200px 380px at 0% -20%, rgba(30,64,175,0.12), transparent 60%), linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
        border: "1px solid rgba(59,130,246,0.22)",
        boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
      }}
    >
      <h2 style={{ fontSize: "1.08rem", marginBottom: "0.25rem" }}>Overall 3D spider analytics</h2>
      <p style={{ marginTop: 0, color: "var(--muted)", fontSize: "0.9rem" }}>
        Aggregated across all your attempts ({data.attempts_considered} attempts, {data.questions_considered} questions).
      </p>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
        {data.axis_views.map((v) => (
          <button
            key={v.key}
            type="button"
            className="btn btn-ghost"
            onClick={() => setViewKey(v.key)}
            style={{
              padding: "0.35rem 0.65rem",
              background: v.key === viewKey ? "rgba(14,165,233,0.12)" : undefined,
              borderColor: v.key === viewKey ? "rgba(14,165,233,0.35)" : undefined,
            }}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div style={{ marginBottom: "1rem", display: "grid", gridTemplateColumns: "minmax(0, 360px) 1fr", gap: "1rem", alignItems: "start" }}>
        <div style={{ position: "relative" }}>
          <div
            ref={scatterRef}
            style={{
              userSelect: "none",
              borderRadius: 12,
              overflow: "hidden",
              border: "1px solid rgba(148,163,184,0.25)",
              background: "radial-gradient(120% 110% at 50% 0%, rgba(226,232,240,0.7), rgba(255,255,255,0.96))",
            }}
            aria-label="3D scatter plot attempts"
          />
          <div style={{ position: "absolute", top: 10, left: 10, fontSize: "0.74rem", color: "#334155", background: "rgba(255,255,255,0.8)", border: "1px solid rgba(148,163,184,0.25)", borderRadius: 8, padding: "0.3rem 0.45rem" }}>
            3D Scatter (Attempts)
          </div>
        </div>
        <div style={{ border: "1px solid rgba(148,163,184,0.25)", borderRadius: 12, padding: "0.8rem", background: "rgba(255,255,255,0.92)" }}>
          <div style={{ fontSize: "0.9rem", color: "#0f172a", marginBottom: "0.35rem" }}>
            <strong>Attempt datapoints</strong>
          </div>
          <div style={{ fontSize: "0.83rem", color: "#64748b" }}>
            Hover/click blue points to inspect attempts. Light violet point shows desired target state.
          </div>
          <div style={{ marginTop: "0.45rem", fontSize: "0.82rem", color: "#475569" }}>
            Camera: azimuth {scatterAzimuthDeg}deg, polar {scatterPolarDeg}deg
          </div>
          <div style={{ marginTop: "0.55rem", fontSize: "0.84rem", color: "#1e293b", lineHeight: 1.45 }}>
            {hoveredAttempt ? (
              <>
                <strong>Hover:</strong> {hoveredAttempt.label} ({hoveredAttempt.attempt_id.slice(0, 8)})
              </>
            ) : (
              <>Hover a point to preview attempt metadata.</>
            )}
          </div>
          <div style={{ marginTop: "0.35rem", fontSize: "0.84rem", color: "#1e293b", lineHeight: 1.45 }}>
            {selectedAttempt ? (
              <>
                <strong>Selected attempt:</strong> {selectedAttempt.label}
                <div style={{ color: "#475569", marginTop: "0.2rem" }}>
                  Time {selectedAttempt.time_strength.toFixed(1)}% • Difficulty {selectedAttempt.difficulty_strength.toFixed(1)}% • Knowledge {selectedAttempt.knowledge_strength.toFixed(1)}%
                </div>
              </>
            ) : (
              <>Click a point to lock one attempt.</>
            )}
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 360px) 1fr", gap: "1rem", alignItems: "start" }}>
        <div style={{ position: "relative" }}>
          <div
            ref={mountRef}
            style={{
              userSelect: "none",
              borderRadius: 12,
              overflow: "hidden",
              border: "1px solid rgba(148,163,184,0.25)",
              background:
                "radial-gradient(120% 100% at 50% 0%, rgba(224,242,254,0.55), rgba(255,255,255,0.96))",
            }}
            aria-label="3D topology chart"
          />
          <div
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              fontSize: "0.74rem",
              color: "#334155",
              background: "rgba(255,255,255,0.78)",
              border: "1px solid rgba(148,163,184,0.25)",
              borderRadius: 8,
              padding: "0.35rem 0.5rem",
              lineHeight: 1.45,
              backdropFilter: "blur(2px)",
            }}
          >
            <div>
              <strong>X:</strong> {xDim?.label ?? "—"}
            </div>
            <div>
              <strong>Y:</strong> {yDim?.label ?? "—"}
            </div>
            <div>
              <strong>Z:</strong> {zDim?.label ?? "—"}
            </div>
            <div style={{ color: "#64748b", marginTop: 2 }}>Scale: 0-100 performance</div>
          </div>
          <div
            style={{
              position: "absolute",
              right: 10,
              bottom: 10,
              fontSize: "0.72rem",
              color: "#475569",
              background: "rgba(255,255,255,0.76)",
              border: "1px solid rgba(148,163,184,0.25)",
              borderRadius: 8,
              padding: "0.3rem 0.45rem",
            }}
          >
            Drag to orbit
          </div>
          <div
            style={{
              marginTop: "0.45rem",
              display: "flex",
              flexWrap: "wrap",
              gap: "0.45rem",
              fontSize: "0.76rem",
              color: "#475569",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e" }} />
              Time node
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#0ea5e9" }} />
              Difficulty node
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b" }} />
              Knowledge node
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: "linear-gradient(90deg,#2563eb,#22c55e)" }} />
              Topology intensity = stronger combined performance
            </span>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: "0.55rem",
            border: "1px solid rgba(125,211,252,0.32)",
            borderRadius: 12,
            padding: "0.85rem",
            background: "linear-gradient(180deg, rgba(240,249,255,0.82), rgba(255,255,255,0.94))",
          }}
        >
          <div style={{ fontSize: "0.9rem", color: "#0f172a" }}>
            <strong>Live inference panel ({active?.label})</strong>
          </div>
          <div style={{ fontSize: "0.88rem", color: "var(--muted)" }}>
            X axis: <strong style={{ color: "#0f172a" }}>{xDim?.label ?? "—"}</strong> ({active?.x_strength.toFixed(1)}%)
          </div>
          <div style={{ fontSize: "0.88rem", color: "var(--muted)" }}>
            Y axis: <strong style={{ color: "#0f172a" }}>{yDim?.label ?? "—"}</strong> ({active?.y_strength.toFixed(1)}%)
          </div>
          <div style={{ fontSize: "0.88rem", color: "var(--muted)" }}>
            Z axis: <strong style={{ color: "#0f172a" }}>{zDim?.label ?? "—"}</strong> ({(zDim?.overall_strength ?? 0).toFixed(1)}%)
          </div>

          <div style={{ marginTop: "0.25rem", fontSize: "0.87rem", color: "#1e293b", lineHeight: 1.5 }}>
            <strong>Inference:</strong> {viewInference.primary}
          </div>
          <div style={{ fontSize: "0.86rem", color: "#334155", lineHeight: 1.45 }}>{viewInference.depth}</div>
          <div style={{ fontSize: "0.83rem", color: "#475569", lineHeight: 1.4 }}>{viewInference.orientHint}</div>
          <div style={{ fontSize: "0.82rem", color: "#475569", lineHeight: 1.4 }}>
            Camera: azimuth {azimuthDeg}deg, polar {polarDeg}deg (drag the chart to rotate freely).
          </div>

          <div style={{ marginTop: "0.4rem", display: "grid", gap: "0.35rem" }}>
            {factors.map((f) => (
              <div key={f.name} style={{ fontSize: "0.84rem", color: "#334155" }}>
                {f.name}: <span style={{ color: "#166534", fontWeight: 600 }}>{f.strength.toFixed(1)}%</span> strength /{" "}
                <span style={{ color: "#991b1b", fontWeight: 600 }}>{f.weakness.toFixed(1)}%</span> weakness
              </div>
            ))}
          </div>
          <div style={{ marginTop: "0.5rem", fontSize: "0.87rem", color: "#1e293b" }}>
            <strong>Strategy to reach desired state</strong>
          </div>
          <ul style={{ margin: "0.2rem 0 0", paddingLeft: "1rem", color: "#334155", fontSize: "0.84rem", lineHeight: 1.45 }}>
            {data.strategy_to_desired_state.map((s, i) => (
              <li key={`${i}-${s.slice(0, 16)}`}>{s}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
