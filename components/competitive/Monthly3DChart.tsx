"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const compactAmount = (value: number) => value >= 1e8
  ? `${(value / 1e8).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억`
  : value >= 1e4 ? `${Math.round(value / 1e4).toLocaleString("ko-KR")}만` : `${value.toLocaleString("ko-KR")}원`;

export type ChartMonth = { key: string; amount: number; count: number };

export default function Monthly3DChart({ months, selectedMonth, onMonth }: {
  months: ChartMonth[]; selectedMonth: string | null; onMonth: (month: string | null) => void;
}) {
  const mount = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = mount.current;
    if (!host || !months.length) return;
    const cell = 84;
    const width = months.length * cell;
    const height = 215;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      host.dataset.webgl = "unavailable";
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const span = months.length;
    const camera = new THREE.OrthographicCamera(-span / 2, span / 2, span / 2 * height / width, -span / 2 * height / width, .1, 60);
    camera.position.set(0, 5.6, 13);
    camera.lookAt(0, .9, 0);
    scene.add(new THREE.AmbientLight(0x9fc8ff, 1.7));
    const key = new THREE.DirectionalLight(0x9deaff, 3.2);
    key.position.set(-3, 8, 7);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x2964ff, 3);
    rim.position.set(3, 5, -5);
    scene.add(rim);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(span + 1, 2.4), new THREE.MeshStandardMaterial({ color: 0x102646, roughness: .7, metalness: .15, transparent: true, opacity: .5 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -.025;
    scene.add(floor);
    const max = Math.max(1, ...months.map(month => month.amount));
    const bars: THREE.Mesh[] = [];
    const labels = document.createElement("div");
    labels.className = "pointer-events-none absolute inset-0";
    host.appendChild(labels);
    camera.updateMatrixWorld();
    const geometry = new THREE.BoxGeometry(.5, 1, .5);
    months.forEach((month, index) => {
      if (!month.amount) return;
      const active = selectedMonth === month.key;
      const material = new THREE.MeshStandardMaterial({ color: active ? 0x38dcff : 0x3285f9, emissive: active ? 0x075474 : 0x071536, metalness: .42, roughness: .28 });
      const bar = new THREE.Mesh(geometry, material);
      const h = Math.max(.09, month.amount / max * 1.8);
      bar.position.set(index - (span - 1) / 2, h / 2, 0);
      bar.scale.y = h;
      bar.rotation.y = .3;
      bar.userData.month = month.key;
      scene.add(bar);
      bars.push(bar);
      const top = new THREE.Vector3(bar.position.x, h, 0).project(camera);
      const label = document.createElement("span");
      label.textContent = compactAmount(month.amount);
      label.title = `${month.amount.toLocaleString("ko-KR")}원`;
      label.className = "absolute -translate-x-1/2 -translate-y-full whitespace-nowrap text-[11px] font-bold tabular-nums text-cyan-100";
      label.style.left = `${(top.x + 1) * width / 2}px`;
      label.style.top = `${Math.max(16, (1 - top.y) * height / 2 - 10)}px`;
      labels.appendChild(label);
    });
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const hit = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(bars)[0]?.object.userData.month as string | undefined;
    };
    const move = (event: PointerEvent) => { renderer.domElement.style.cursor = hit(event) ? "pointer" : "default"; };
    const click = (event: PointerEvent) => { const month = hit(event); if (month) onMonth(month === selectedMonth ? null : month); };
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerup", click);
    renderer.render(scene, camera);
    return () => {
      renderer.domElement.removeEventListener("pointermove", move);
      renderer.domElement.removeEventListener("pointerup", click);
      host.removeChild(renderer.domElement);
      host.removeChild(labels);
      bars.forEach(bar => (bar.material as THREE.Material).dispose());
      geometry.dispose();
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      renderer.dispose();
    };
  }, [months, selectedMonth, onMonth]);

  return <div ref={mount} className="monthly-3d-canvas relative h-[215px]" aria-hidden="true" />;
}
