import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Avatar, loadAvatars } from "./avatar";
import { canvasTexture, cardMesh, animateCardBacks } from "./cards";
import type { State, Card } from "./types";
const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const mat = (color: T.ColorRepresentation, roughness = 0.85, metalness = 0) =>
  new T.MeshStandardMaterial({ color, roughness, metalness });
function mesh(
  geo: T.BufferGeometry,
  m: T.Material,
  parent: T.Object3D,
  x = 0,
  y = 0,
  z = 0,
) {
  const o = new T.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  parent.add(o);
  return o;
}
function box(
  parent: T.Object3D,
  m: T.Material,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  r = 0.02,
) {
  return mesh(new RoundedBoxGeometry(w, h, d, 2, r), m, parent, x, y, z);
}
function cylinder(
  parent: T.Object3D,
  m: T.Material,
  x: number,
  y: number,
  z: number,
  r: number,
  h: number,
  r2 = r,
) {
  return mesh(new T.CylinderGeometry(r, r2, h, 24), m, parent, x, y, z);
}
function tube(
  parent: T.Object3D,
  m: T.Material,
  points: T.Vector3[],
  radius = 0.015,
) {
  return mesh(
    new T.TubeGeometry(new T.CatmullRomCurve3(points), 24, radius, 8, false),
    m,
    parent,
  );
}
function plasterTexture() {
  return canvasTexture(512, 512, (c) => {
    c.fillStyle = "#e3ddcb";
    c.fillRect(0, 0, 512, 512);
    let seed = 39;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 14000; i++) {
      const a = rand() * 0.14;
      c.fillStyle = `rgba(111,91,63,${a})`;
      c.fillRect(rand() * 512, rand() * 512, rand() * 6 + 1, rand() * 4 + 1);
    }
    for (let i = 0; i < 30; i++) {
      c.strokeStyle = "rgba(102,89,70,.10)";
      c.lineWidth = rand() * 2;
      c.beginPath();
      let x = rand() * 512,
        y = rand() * 512;
      c.moveTo(x, y);
      for (let j = 0; j < 8; j++) {
        x += rand() * 13 - 6;
        y += rand() * 14;
        c.lineTo(x, y);
      }
      c.stroke();
    }
  });
}
export class CafeScene {
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(64, 1, 0.03, 50);
  renderer: T.WebGLRenderer;
  root: HTMLElement;
  avatars = new Map<string, Avatar>();
  chairs: T.Group[] = [];
  private patrons: Avatar[] = [];
  private gestures: {
    mesh: T.Group;
    avatar: Avatar;
    start: number;
    kind: string;
    from: T.Vector3;
    to: T.Vector3;
    rotation: T.Quaternion;
    finalMesh?: T.Object3D;
  }[] = [];
  labels = new Map<string, HTMLElement>();
  state: State | null = null;
  cardGroup = new T.Group();
  table = new T.Group();
  sun: T.DirectionalLight;
  private lastFrame = performance.now();
  private yaw = 0;
  private pitch = -0.17;
  private dragging = false;
  private dragX = 0;
  private dragY = 0;
  private baseYaw = 0;
  private seat = V(0, 1.26, 1.67);
  private selected = new Set<string>();
  private flies: {
    mesh: T.Group;
    from: T.Vector3;
    to: T.Vector3;
    start: number;
    duration: number;
    endRotation: T.Euler;
  }[] = [];
  private lastEvent = 0;
  private ready = false;
  private renderKey = "";
  private quality = "high";
  private nightLights: T.PointLight[] = [];
  private raf = 0;
  private frameCounter = 0;
  onError: (message: string) => void = () => {};
  onReady: () => void = () => {};
  constructor(root: HTMLElement) {
    this.root = root;
    this.renderer = new T.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    root.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Terrasse 3D du Café Djerbien",
    );
    this.scene.background = new T.Color("#bdcbd0");
    this.scene.fog = new T.Fog("#d5d2ba", 11, 30);
    this.scene.add(new T.HemisphereLight("#d5e5ee", "#998168", 2.0));
    this.sun = new T.DirectionalLight("#ffdb9b", 3.8);
    this.sun.position.set(-5, 8, 4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, {
      left: -9,
      right: 9,
      top: 9,
      bottom: -9,
      near: 1,
      far: 25,
    });
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.025;
    this.scene.add(this.sun);
    const bounce = new T.PointLight("#e5ab65", 5, 8, 2);
    bounce.position.set(0, 2, -3);
    this.scene.add(bounce);
    this.buildCourtyard();
    this.buildTable();
    this.scene.add(this.table, this.cardGroup);
    for (let i = 0; i < 8; i++) {
      const chair = this.makeChair();
      const a = (i / 8) * Math.PI * 2;
      chair.position.set(Math.sin(a) * 1.67, 0, Math.cos(a) * 1.67);
      chair.rotation.y = a + Math.PI;
      this.scene.add(chair);
      this.chairs.push(chair);
    }
    for (const [x, z] of [
      [-2, -1],
      [2, -1],
      [0, 3],
    ]) {
      const lamp = new T.PointLight("#ffbb70", 0, 9, 2);
      lamp.position.set(x, 2.6, z);
      this.scene.add(lamp);
      this.nightLights.push(lamp);
    }
    this.batchStaticDecor();
    this.setTimeOfDay(localStorage.getItem("yaniv-time") || "day");
    this.camera.position.copy(this.seat);
    this.bindCamera();
    new ResizeObserver(() => this.resize()).observe(root);
    this.resize();
    this.animate();
    loadAvatars()
      .then(() => {
        this.ready = true;
        this.buildPatrons();
        if (this.state) this.update(this.state, true);
        this.onReady();
      })
      .catch((e) => {
        console.error(e);
        this.onError(
          "Les personnages 3D n’ont pas pu être chargés. Recharge la page.",
        );
      });
  }
  batchStaticDecor() {
    this.scene.updateMatrixWorld(true);
    const batches = new Map<
      string,
      {
        material: T.MeshStandardMaterial;
        geometries: T.BufferGeometry[];
        meshes: T.Mesh[];
      }
    >();
    this.scene.traverse((o) => {
      if (
        !(o instanceof T.Mesh) ||
        o instanceof T.InstancedMesh ||
        this.chairs.some((c) => c === o.parent || c.children.includes(o))
      )
        return;
      const m = o.material;
      if (!(m instanceof T.MeshStandardMaterial) || m.transparent) return;
      const key = [
        m.color.getHex(),
        m.roughness,
        m.metalness,
        m.map?.uuid,
        m.bumpMap?.uuid,
        m.emissive.getHex(),
        m.emissiveIntensity,
        m.side,
      ].join("/");
      if (!batches.has(key))
        batches.set(key, { material: m, geometries: [], meshes: [] });
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      const flat = g.index ? g.toNonIndexed() : g;
      batches.get(key)!.geometries.push(flat);
      batches.get(key)!.meshes.push(o);
    });
    for (const b of batches.values()) {
      if (b.meshes.length < 2) continue;
      const merged = mergeGeometries(b.geometries);
      if (merged) {
        const m = new T.Mesh(merged, b.material);
        m.castShadow = true;
        m.receiveShadow = true;
        this.scene.add(m);
        for (const old of b.meshes) old.removeFromParent();
      }
    }
  }
  makeChair() {
    const g = new T.Group(),
      white = mat("#dddeda", 0.5);
    box(g, white, 0, 0.445, 0, 0.49, 0.055, 0.47, 0.035);
    // Curved single-piece plastic back with real open slots.
    const s = new T.Shape();
    s.moveTo(-0.245, 0);
    s.lineTo(-0.22, 0.39);
    s.quadraticCurveTo(0, 0.47, 0.22, 0.39);
    s.lineTo(0.245, 0);
    s.closePath();
    for (let i = 0; i < 5; i++) {
      const x = -0.17 + i * 0.085;
      const hole = new T.Path();
      hole.moveTo(x - 0.014, 0.09);
      hole.lineTo(x - 0.017, 0.33);
      hole.quadraticCurveTo(x, 0.35, x + 0.017, 0.33);
      hole.lineTo(x + 0.014, 0.09);
      hole.closePath();
      s.holes.push(hole);
    }
    const back = mesh(
      new T.ExtrudeGeometry(s, {
        depth: 0.036,
        bevelEnabled: true,
        bevelSize: 0.009,
        bevelThickness: 0.009,
        bevelSegments: 2,
        steps: 1,
      }),
      white,
      g,
      0,
      0.46,
      -0.22,
    );
    back.rotation.x = -0.09;
    for (const x of [-0.19, 0.19])
      for (const z of [-0.17, 0.17]) {
        tube(g, white, [V(x * 1.14, 0.025, z * 1.2), V(x, 0.44, z)], 0.026);
      }
    return g;
  }
  buildTable() {
    const white = mat("#d3d4c7", 0.58),
      wood = mat("#59493b");
    cylinder(this.table, white, 0, 0.728, 0, 1.23, 0.085);
    cylinder(this.table, white, 0, 0.38, 0, 0.095, 0.69);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      tube(
        this.table,
        white,
        [V(0, 0.12, 0), V(Math.cos(a) * 0.67, 0.045, Math.sin(a) * 0.67)],
        0.044,
      );
    }
    const clothTex = canvasTexture(1024, 1024, (c) => {
      c.fillStyle = "#8e3730";
      c.fillRect(0, 0, 1024, 1024);
      c.strokeStyle = "#c69b64";
      for (let inset of [32, 39, 52, 87, 93]) {
        c.lineWidth = inset === 52 ? 12 : 3;
        c.strokeRect(inset, inset, 1024 - inset * 2, 1024 - inset * 2);
      }
      for (let x = 120; x < 950; x += 92)
        for (let y = 120; y < 950; y += 92) {
          c.strokeStyle = "#b4784f";
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(x, y - 25);
          c.lineTo(x + 25, y);
          c.lineTo(x, y + 25);
          c.lineTo(x - 25, y);
          c.closePath();
          c.stroke();
          c.fillStyle = "#be986b";
          c.textAlign = "center";
          c.font = "21px Georgia";
          c.fillText(["♠", "♥", "♦", "♣"][(x + y) % 4], x, y + 7);
        }
      for (let i = 0; i < 40000; i++) {
        c.fillStyle = i % 2 ? "rgba(255,235,170,.045)" : "rgba(31,22,15,.06)";
        c.fillRect((i * 173.31) % 1024, (i * 39.17) % 1024, 1, 5);
      }
      c.strokeStyle = "rgba(62,25,14,.18)";
      c.lineWidth = 15;
      c.beginPath();
      c.ellipse(700, 740, 53, 45, 0.2, 0, 7);
      c.stroke();
    });
    const cloth = new T.PlaneGeometry(2.15, 2.15, 48, 48);
    const p = cloth.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        edge = Math.max(Math.abs(x), Math.abs(y));
      p.setZ(
        i,
        Math.sin(x * 23 + y * 9) * 0.0025 +
          Math.cos(y * 29) * 0.0015 -
          Math.max(0, edge - 0.99) * 0.85,
      );
    }
    cloth.computeVertexNormals();
    const cm = mat("white", 1);
    cm.map = clothTex;
    cm.bumpMap = clothTex;
    cm.bumpScale = 0.006;
    cm.side = T.DoubleSide;
    const surface = mesh(cloth, cm, this.table, 0, 0.779, 0);
    surface.rotation.x = -Math.PI / 2;
    surface.rotation.z = 0.12;
    this.teaSet(this.table, 0.7, 0.8, -0.43);
    const phone = box(
      this.table,
      mat("#252e2d", 0.25, 0.3),
      -0.81,
      0.795,
      0.3,
      0.085,
      0.013,
      0.17,
      0.01,
    );
    phone.rotation.y = -0.3;
    box(
      this.table,
      mat("#121e24", 0.15),
      -0.81,
      0.803,
      0.3,
      0.071,
      0.001,
      0.14,
      0.004,
    );
    cylinder(
      this.table,
      mat("#999a8e", 0.27, 0.8),
      -0.65,
      0.8,
      -0.48,
      0.087,
      0.022,
    );
    const ash = mesh(
      new T.TorusGeometry(0.081, 0.009, 8, 32),
      mat("#c0beb0", 0.2, 0.8),
      this.table,
      -0.65,
      0.82,
      -0.48,
    );
    ash.rotation.x = Math.PI / 2;
  }
  teaSet(parent: T.Object3D, x: number, y: number, z: number) {
    const g = new T.Group();
    g.position.set(x, y, z);
    parent.add(g);
    const metal = mat("#baad8e", 0.22, 0.85);
    mesh(
      new T.LatheGeometry(
        [
          [0.04, 0],
          [0.095, 0.025],
          [0.105, 0.085],
          [0.066, 0.15],
          [0.055, 0.17],
        ].map((p) => new T.Vector2(...p)),
        32,
      ),
      metal,
      g,
    );
    cylinder(g, metal, 0, 0.18, 0, 0.067, 0.018);
    mesh(new T.SphereGeometry(0.021, 16, 12), metal, g, 0, 0.208, 0);
    tube(
      g,
      metal,
      [V(0.08, 0.06), V(0.15, 0.08), V(0.16, 0.17), V(0.21, 0.2)],
      0.018,
    );
    tube(
      g,
      metal,
      [V(-0.06, 0.16), V(-0.15, 0.17), V(-0.17, 0.06), V(-0.07, 0.045)],
      0.011,
    );
    for (const offset of [V(0.2, 0, 0.2), V(-0.16, 0, 0.13)]) {
      cylinder(g, mat("#cec6ac", 0.3), offset.x, 0, offset.z, 0.065, 0.008);
      const glass = new T.MeshPhysicalMaterial({
        color: "#d3b57c",
        roughness: 0.1,
        transparent: true,
        opacity: 0.5,
        metalness: 0.05,
        side: T.DoubleSide,
      });
      mesh(
        new T.CylinderGeometry(0.03, 0.023, 0.087, 24, 1, true),
        glass,
        g,
        offset.x,
        0.047,
        offset.z,
      );
      cylinder(
        g,
        mat("#5c2f0e", 0.22),
        offset.x,
        0.033,
        offset.z,
        0.025,
        0.058,
      );
    }
  }
  buildCourtyard() {
    const s = this.scene,
      plaster = plasterTexture();
    plaster.wrapS = plaster.wrapT = T.RepeatWrapping;
    plaster.repeat.set(3, 1);
    const wall = mat("#f8f3de");
    wall.map = plaster;
    wall.bumpMap = plaster;
    wall.bumpScale = 0.035;
    const blue = mat("#286b89", 0.74),
      darkBlue = mat("#15425c", 0.8),
      stone = mat("#b6a58b"),
      wood = mat("#65513a"),
      terra = mat("#a8613f");
    const floorTex = canvasTexture(512, 512, (c) => {
      c.fillStyle = "#bdad8d";
      c.fillRect(0, 0, 512, 512);
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          c.fillStyle = ["#c2b79d", "#bcae93", "#cabb9e", "#baaa8c"][
            (x * 3 + y) % 4
          ];
          c.fillRect(x * 128 + 2, y * 128 + 2, 124, 124);
          c.strokeStyle = "#b2a184";
          c.strokeRect(x * 128 + 7, y * 128 + 7, 114, 114);
        }
    });
    floorTex.wrapS = floorTex.wrapT = T.RepeatWrapping;
    floorTex.repeat.set(9, 9);
    const floor = mat("white");
    floor.map = floorTex;
    floor.bumpMap = floorTex;
    floor.bumpScale = 0.035;
    box(s, floor, 0, -0.06, 0, 14, 0.1, 11);
    // Level terrace, low perimeter walls and an entrance onto a village square.
    const sand = mat("#d8c49d");
    sand.map = canvasTexture(512, 512, (c) => {
      c.fillStyle = "#d8c49d";
      c.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 22000; i++) {
        c.fillStyle = i % 2 ? "#cfba92" : "#e1cfae";
        c.fillRect((i * 173.17) % 512, (i * 61.73) % 512, 1, 1);
      }
    });
    sand.map.wrapS = sand.map.wrapT = T.RepeatWrapping;
    sand.map.repeat.set(16, 16);
    box(s, sand, 0, -0.14, 9, 55, 0.12, 45);
    for (const side of [-1, 1]) {
      box(s, wall, side * 6.1, 0.45, 0.2, 0.35, 0.95, 11);
      box(s, stone, side * 6.1, 0.96, 0.2, 0.46, 0.09, 11.1);
      box(s, wall, side * 3.8, 0.45, 5.5, 4.6, 0.95, 0.35);
      box(s, stone, side * 3.8, 0.96, 5.5, 4.7, 0.09, 0.46);
      box(s, wall, side * 1.5, 0.64, 5.5, 0.46, 1.33, 0.46);
      box(s, stone, side * 1.5, 1.33, 5.5, 0.56, 0.1, 0.56);
      this.plant(s, side * 1.95, 0, 4.95, 0.75, true);
    }
    box(s, floor, 0, -0.065, 6.4, 2.6, 0.1, 2.2);
    box(s, mat("#aaa99b"), 0, -0.075, 10.3, 44, 0.04, 4.2);
    for (const [i, x, z] of [
      [0, -9, 15],
      [1, -3.8, 16],
      [2, 3.5, 15.6],
      [3, 10, 16],
      [4, -13, 4],
      [5, 13, 5],
    ]) {
      const h = 2.35 + (i % 3) * 0.24,
        w = 4.2 + (i % 2) * 1.1;
      box(s, wall, x, h / 2 - 0.04, z, w, h, 3.4);
      box(s, wall, x, h + 0.12, z, w + 0.16, 0.24, 3.55);
      box(s, stone, x, h + 0.26, z, w + 0.22, 0.06, 3.61);
      box(s, darkBlue, x - 0.5, 1.04, z - 1.74, 0.95, 2.1, 0.08);
      for (let k = 0; k < 8; k++)
        box(s, blue, x - 0.91 + k * 0.116, 1.04, z - 1.8, 0.105, 2.04, 0.035);
      box(s, stone, x - 0.5, 2.14, z - 1.79, 1.18, 0.13, 0.16);
      box(s, darkBlue, x + 1.15, 1.5, z - 1.75, 0.72, 0.75, 0.05);
      for (let k = 0; k < 5; k++)
        box(s, blue, x + 1.15, 1.2 + k * 0.14, z - 1.79, 0.76, 0.07, 0.04);
      if (i % 2 === 0) {
        box(s, mat("#a18d62"), x - 0.5, 2.23, z - 2.05, 1.8, 0.08, 0.8);
        this.plant(s, x + 1.6, 0, z - 2.15, 0.9);
      }
    }
    for (const [x, z] of [
      [-8, 8],
      [8, 8],
      [-11, 18],
      [1, 20],
      [13, 19],
    ]) {
      cylinder(s, wood, x, 1.85, z, 0.12, 3.7, 0.18);
      for (let j = 0; j < 9; j++) {
        const a = (j * Math.PI * 2) / 9;
        tube(
          s,
          mat("#536742"),
          [
            V(x, 3.65, z),
            V(x + Math.sin(a) * 0.8, 4.05, z + Math.cos(a) * 0.8),
            V(x + Math.sin(a) * 1.65, 3.4, z + Math.cos(a) * 1.65),
          ],
          0.09,
        );
      }
    }
    for (const x of [-17, 17]) {
      cylinder(s, wood, x, 0.7, 12, 0.09, 1.4);
      const crown = mesh(
        new T.IcosahedronGeometry(1.2, 2),
        mat("#768365"),
        s,
        x,
        1.7,
        12,
      );
      crown.scale.set(1.4, 0.8, 1);
    }
    box(s, wall, 0, 2.1, -5.4, 14, 4.3, 0.35);

    for (const x of [-4.2, 0, 4.2]) {
      box(s, stone, x, 1.45, -5.17, 1.83, 2.95, 0.15);
      box(s, darkBlue, x, 1.39, -5.04, 1.48, 2.72, 0.1);
      for (let k = 0; k < 12; k++)
        box(
          s,
          blue,
          x - 0.665 + k * 0.121,
          1.4,
          -4.96,
          0.113,
          2.64,
          0.035,
          0.007,
        );
      const arch = new T.Mesh(
        new T.TorusGeometry(0.79, 0.1, 10, 40, Math.PI),
        wall,
      );
      arch.position.set(x, 2.8, -5.01);
      s.add(arch);
      for (const dx of [-0.73, 0.73])
        box(s, wall, x + dx, 1.32, -4.98, 0.15, 2.67, 0.2);
      for (const dx of [-0.12, 0.12]) {
        const ring = mesh(
          new T.TorusGeometry(0.045, 0.008, 8, 16),
          mat("#b6a16e", 0.3, 0.8),
          s,
          x + dx,
          1.35,
          -4.86,
        );
        ring.rotation.x = 0.1;
      }
    }
    for (const x of [-2.2, 2.2]) {
      box(s, blue, x, 2.3, -5.05, 1.12, 1.05, 0.13);
      for (let k = 0; k < 9; k++) {
        box(s, darkBlue, x, 1.87 + k * 0.103, -4.96, 1.02, 0.064, 0.045, 0.003);
      }
      box(s, stone, x, 1.71, -4.95, 1.27, 0.1, 0.27);
    }
    const signTex = canvasTexture(1024, 256, (c) => {
      c.fillStyle = "#184e64";
      c.fillRect(0, 0, 1024, 256);
      c.strokeStyle = "#b7a06e";
      c.lineWidth = 6;
      c.strokeRect(15, 15, 994, 226);
      c.textAlign = "center";
      c.fillStyle = "#efe4bd";
      c.font = "bold 83px Georgia";
      c.fillText("Café Djerbien", 512, 127);
      c.font = "27px sans-serif";
      c.fillText("قهوة جربة   •   DEPUIS 1986", 512, 195);
    });
    const signmat = mat("white");
    signmat.map = signTex;
    box(s, wood, 0, 3.49, -5.12, 3.6, 0.97, 0.18);
    mesh(new T.PlaneGeometry(3.48, 0.87), signmat, s, 0, 3.49, -5.013);
    // Pergola beams and hanging lamps, all real geometry.
    for (const x of [-3.4, 3.4])
      for (const z of [-4.2, 3.8]) cylinder(s, wood, x, 1.85, z, 0.062, 3.7);
    for (const x of [-3.4, 3.4]) box(s, wood, x, 3.65, -0.2, 0.15, 0.16, 8.2);
    for (let z = -4.2; z < 4.1; z += 0.6) box(s, wood, 0, 3.73, z, 7, 0.1, 0.1);
    for (let i = 0; i < 7; i++) {
      const x = -3 + i,
        z = -1.9,
        yy = 3.25 - Math.sin((i / 6) * Math.PI) * 0.23;
      tube(
        s,
        mat("#3c372b"),
        [V(x - 0.5, yy + 0.1, z), V(x, yy, z), V(x + 0.5, yy + 0.03, z)],
        0.004,
      );
      cylinder(s, mat("#3e4136"), x, yy - 0.025, z, 0.032, 0.035);
      const bulb = mesh(
        new T.SphereGeometry(0.045, 12, 8),
        new T.MeshStandardMaterial({
          color: "#ffdda1",
          emissive: "#ffbd56",
          emissiveIntensity: 2,
        }),
        s,
        x,
        yy - 0.07,
        z,
      );
      bulb.castShadow = false;
    }
    const rng = (i: number) => {
      const n = Math.sin(i * 127.1 + 311.7) * 43758.5453;
      return n - Math.floor(n);
    };
    const leafGeo = new T.SphereGeometry(1, 6, 4);
    leafGeo.scale(0.12, 0.027, 0.22);
    const leaves = new T.InstancedMesh(leafGeo, mat("#526b32"), 1000);
    leaves.castShadow = true;
    leaves.receiveShadow = true;
    const dummy = new T.Object3D();
    for (let i = 0; i < 1000; i++) {
      dummy.position.set(
        (rng(i) - 0.5) * 8,
        3.72 + rng(i + 300) * 0.32,
        (rng(i + 600) - 0.5) * 8.5,
      );
      dummy.rotation.set(rng(i + 1), rng(i + 2) * 6, rng(i + 3));
      dummy.scale.setScalar(0.6 + rng(i + 40));
      dummy.updateMatrix();
      leaves.setMatrixAt(i, dummy.matrix);
      leaves.setColorAt(
        i,
        new T.Color().setHSL(
          0.2 + rng(i + 5) * 0.08,
          0.28,
          0.19 + rng(i + 4) * 0.13,
        ),
      );
    }
    s.add(leaves);
    for (let i = 0; i < 15; i++) {
      const x = i < 8 ? -5.3 : 5.3,
        z = -4.4 + (i % 8) * 1.18;
      this.plant(s, x, 0, z, 0.65 + (i % 3) * 0.2);
    }
    for (const [x, z] of [
      [-3.5, -2.4],
      [3.45, -2.6],
      [-3.6, 2.3],
      [3.8, 2.0],
    ]) {
      const group = new T.Group();
      group.position.set(x, 0, z);
      s.add(group);
      cylinder(group, mat("#c9d3c8", 0.55), 0, 0.75, 0, 0.54, 0.06);
      cylinder(group, stone, 0, 0.39, 0, 0.07, 0.7);
      for (let i = 0; i < 3; i++) {
        const a = i * 2.094,
          chair = this.makeChair();
        chair.position.set(Math.sin(a) * 0.85, 0, Math.cos(a) * 0.85);
        chair.rotation.y = a + Math.PI;
        group.add(chair);
      }
      this.teaSet(group, 0.08, 0.79, 0);
    }
    // Potted bougainvillea beside the blue doors.
    for (const x of [-1.5, 1.5]) this.plant(s, x, 0, -4.55, 1.7, true);
    this.scooter(s, 4.9, 0, -0.9);
  }
  buildPatrons() {
    const tables = [
      [-3.5, -2.4],
      [3.45, -2.6],
      [-3.6, 2.3],
      [3.8, 2],
    ];
    const skins = Array.from({ length: 6 }, (_, i) => `visitor-${i}`);
    tables.forEach(([x, z], table) => {
      const seats = table < 2 ? [1, 2] : [1];
      seats.forEach((seat) => {
        const i = this.patrons.length,
          a = seat * 2.094;
        const av = new Avatar({
          id: `decor-${i}`,
          name: "Client du café",
          skin: skins[i],
          pose: i % 2 ? "focus" : "normal",
          score: 0,
          count: 0,
          eliminated: false,
          connected: true,
        });
        av.root.position.set(x + Math.sin(a) * 0.85, 0, z + Math.cos(a) * 0.85);
        av.root.rotation.y = a + Math.PI;
        av.root.userData.lookAt = V(x, 1.15, z);
        av.joined -= 4000 + i * 731;
        this.scene.add(av.root);
        this.patrons.push(av);
      });
    });
  }
  plant(
    parent: T.Object3D,
    x: number,
    y: number,
    z: number,
    size: number,
    flowers = false,
  ) {
    const g = new T.Group();
    g.position.set(x, y, z);
    parent.add(g);
    const pot = mat("#b4704a");
    cylinder(g, pot, 0, 0.17, 0, 0.19, 0.34, 0.13);
    cylinder(g, mat("#493b2b"), 0, 0.344, 0, 0.16, 0.015);
    const green = mat("#466b39");
    for (let i = 0; i < 9; i++) {
      const a = i * 2.399,
        h = 0.45 + (((i * 7) % 9) / 9) * size;
      const end = V(Math.sin(a) * 0.28, h, Math.cos(a) * 0.28);
      tube(
        g,
        mat("#73613e"),
        [V(0, 0.3, 0), V(end.x * 0.4, h * 0.7, end.z * 0.4), end],
        0.009,
      );
      for (let k = 0; k < 5; k++) {
        const yy = 0.45 + (k * (h - 0.4)) / 5;
        const leaf = mesh(
          new T.SphereGeometry(1, 6, 4),
          green,
          g,
          end.x * (yy / h) + Math.sin(a + k) * 0.09,
          yy,
          end.z * (yy / h),
        );
        leaf.scale.set(0.1, 0.022, 0.2);
        leaf.rotation.set(0.2, a + k, 0.4);
      }
      if (flowers) {
        for (let j = 0; j < 3; j++) {
          const f = mesh(
            new T.IcosahedronGeometry(0.055, 0),
            mat(j % 2 ? "#a54f72" : "#ba6885"),
            g,
            end.x + j * 0.04,
            h,
            end.z,
          );
        }
      }
    }
  }
  scooter(parent: T.Object3D, x: number, y: number, z: number) {
    const g = new T.Group();
    g.position.set(x, y, z);
    g.rotation.y = -0.4;
    parent.add(g);
    const blue = mat("#608c8b", 0.35, 0.35),
      black = mat("#272d2a", 0.7),
      chrome = mat("#bbbfb4", 0.2, 0.8);
    for (const zz of [-0.48, 0.48]) {
      const wheel = mesh(
        new T.TorusGeometry(0.19, 0.055, 10, 28),
        black,
        g,
        0,
        0.23,
        zz,
      );
      wheel.rotation.y = Math.PI / 2;
      const hub = cylinder(g, chrome, 0, 0.23, zz, 0.11, 0.1);
      hub.rotation.z = Math.PI / 2;
    }
    box(g, blue, 0, 0.31, 0, 0.34, 0.13, 1.05, 0.06);
    const body = mesh(new T.SphereGeometry(1, 24, 16), blue, g, 0, 0.48, -0.37);
    body.scale.set(0.23, 0.27, 0.4);
    box(g, black, 0, 0.74, -0.3, 0.39, 0.08, 0.57, 0.05);
    box(g, blue, 0, 0.64, 0.34, 0.45, 0.65, 0.11, 0.05);
    tube(
      g,
      chrome,
      [V(0, 0.45, 0.45), V(0, 1.05, 0.37), V(0.26, 1.05, 0.37)],
      0.026,
    );
    tube(g, chrome, [V(0, 1.05, 0.37), V(-0.26, 1.05, 0.37)], 0.025);
    const lamp = mesh(
      new T.SphereGeometry(0.083, 20, 12),
      mat("#e4d8a9", 0.15, 0.25),
      g,
      0,
      0.96,
      0.44,
    );
    lamp.scale.z = 0.6;
    tube(g, chrome, [V(0.23, 1.03, 0.37), V(0.26, 1.22, 0.32)], 0.01);
    const mirror = mesh(
      new T.SphereGeometry(0.054, 16, 10),
      chrome,
      g,
      0.26,
      1.23,
      0.32,
    );
    mirror.scale.z = 0.2;
  }
  hookah(root: T.Object3D) {
    const m = mat("#a8a897", 0.24, 0.85);
    const g = new T.Group();
    g.position.set(-0.39, 0, 0.1);
    root.add(g);
    mesh(
      new T.LatheGeometry(
        [
          [0.07, 0],
          [0.11, 0.05],
          [0.08, 0.19],
          [0.027, 0.24],
        ].map((p) => new T.Vector2(...p)),
        24,
      ),
      mat("#3f7b89", 0.15, 0.4),
      g,
    );
    cylinder(g, m, 0, 0.39, 0, 0.015, 0.3);
    cylinder(g, m, 0, 0.51, 0, 0.11, 0.012);
    cylinder(g, mat("#995e40"), 0, 0.56, 0, 0.04, 0.065);
    const hose = tube(
      g,
      mat("#382b23"),
      [
        V(0, 0.25, 0),
        V(0.25, 0.22, 0.1),
        V(0.23, 0.12, 0.35),
        V(-0.13, 0.73, 0.3),
      ],
      0.012,
    );
    root.userData.hookahHose = hose;
    root.userData.hoseAt = 0;
  }
  bindCamera() {
    const c = this.renderer.domElement;
    c.style.touchAction = "none";
    c.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      this.dragging = true;
      this.dragX = e.clientX;
      this.dragY = e.clientY;
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      this.yaw = T.MathUtils.clamp(
        this.yaw - (e.clientX - this.dragX) * 0.003,
        (-Math.PI * 50) / 180,
        (Math.PI * 50) / 180,
      );
      this.pitch = T.MathUtils.clamp(
        this.pitch - (e.clientY - this.dragY) * 0.003,
        (-28 * Math.PI) / 180,
        (20 * Math.PI) / 180,
      );
      this.dragX = e.clientX;
      this.dragY = e.clientY;
    });
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
      c.addEventListener(event, () => (this.dragging = false));
  }
  resize() {
    const { clientWidth: w, clientHeight: h } = this.root;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
  setTimeOfDay(mode: string) {
    const night = mode === "night";
    this.scene.background = new T.Color(night ? "#101d35" : "#c8dce2");
    this.scene.fog = new T.Fog(night ? "#17253c" : "#dcd6bc", 18, 48);
    this.sun.color.set(night ? "#9fbaff" : "#ffdfaa");
    this.sun.intensity = night ? 0.55 : 3.8;
    this.scene.traverse((o) => {
      if (o instanceof T.HemisphereLight) {
        o.color.set(night ? "#859fc9" : "#d5e5ee");
        o.groundColor.set(night ? "#4c4039" : "#998168");
        o.intensity = night ? 0.65 : 2;
      }
    });
    this.nightLights.forEach((l) => (l.intensity = night ? 24 : 0));
    this.renderer.toneMappingExposure = night ? 1.18 : 1.05;
  }
  setQuality(q: string) {
    this.quality = q;
    this.renderer.setPixelRatio(
      q === "low" ? 1 : Math.min(devicePixelRatio, q === "medium" ? 1.25 : 1.6),
    );
    this.renderer.shadowMap.enabled = q !== "low";
    this.sun.shadow.mapSize.setScalar(q === "high" ? 2048 : 1024);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.resize();
  }
  update(state: State, force = false) {
    const previousState = this.state;
    this.state = state;
    if (!this.ready) return;
    const n = state.players.length;
    const seatCount = Math.max(state.seatCount || n, 2);
    const myIndex =
      state.players.find((p) => p.id === state.me)?.seat ??
      Math.max(
        0,
        state.players.findIndex((p) => p.id === state.me),
      );
    const ownAngle = (myIndex / seatCount) * Math.PI * 2;
    const ownSkin = state.players.find((p) => p.id === state.me)?.skin;
    this.seat.set(
      Math.sin(ownAngle) * 1.67,
      ownSkin === "nain" ? 1.055 : ownSkin === "costaud" ? 1.34 : 1.26,
      Math.cos(ownAngle) * 1.67,
    );
    this.baseYaw = ownAngle;
    this.chairs.forEach((chair, i) => {
      chair.visible = i < seatCount;
      if (i < seatCount) {
        const a = (i / seatCount) * Math.PI * 2;
        chair.position.set(Math.sin(a) * 1.67, 0, Math.cos(a) * 1.67);
        chair.rotation.y = a + Math.PI;
      }
    });
    for (const [id, av] of this.avatars)
      if (!state.players.some((p) => p.id === id)) {
        this.scene.remove(av.root);
        av.dispose();
        this.avatars.delete(id);
        this.labels.get(id)?.remove();
        this.labels.delete(id);
      }
    state.players.forEach((p, i) => {
      let av = this.avatars.get(p.id);
      if (!av || av.player.eliminated !== p.eliminated) {
        if (av) {
          this.scene.remove(av.root);
          av.dispose();
        }
        av = new Avatar(p);
        this.avatars.set(p.id, av);
        this.scene.add(av.root);
        if (p.pose === "chicha") this.hookah(av.root);
      }
      const a = ((p.seat ?? i) / seatCount) * Math.PI * 2;
      av.root.position.set(Math.sin(a) * 1.67, 0, Math.cos(a) * 1.67);
      av.root.rotation.y = a + Math.PI;
      av.setCount(p.count, p.id === state.me ? state.hand : undefined);
      av.cards.visible = !state.result;
      av.player = p;
      // Hide only the local head; torso, forearms and legs remain in POV.
      if (p.id === state.me) av.hideHead();
      let label = this.labels.get(p.id);
      if (!label) {
        label = document.createElement("div");
        label.className = "avatar-label";
        document.getElementById("labels")!.append(label);
        this.labels.set(p.id, label);
      }
      label.replaceChildren();
      const name = document.createElement("strong");
      name.textContent = p.name;
      const detail = document.createElement("span");
      detail.textContent = p.eliminated
        ? "Éliminé"
        : `${p.count} carte${p.count > 1 ? "s" : ""} · ${p.score} pts${p.connected ? "" : " · reconnexion"}`;
      label.append(name, detail);
      label.classList.toggle(
        "active",
        state.turnId === p.id &&
          !["WAITING", "ROUND_END", "GAME_END"].includes(state.phase),
      );
      label.classList.toggle("eliminated", p.eliminated);
      label.hidden = p.id === state.me;
    });
    const event = state.lastEvent;
    const isNew = event && event.seq > this.lastEvent;
    this.lastEvent = event?.seq || 0;
    if (isNew && event?.playerId) {
      this.avatars
        .get(event.playerId)
        ?.trigger(
          event.type,
          event.type === "draw"
            ? event.source === "discard"
              ? V(0.12, 0.85, -0.12)
              : V(-0.32, 0.85, 0)
            : ["play", "bonus"].includes(event.type)
              ? V(0.12, 0.88, 0.22)
              : undefined,
        );
      if (["yaniv", "assaf"].includes(event.type))
        for (const av of this.avatars.values()) av.trigger(event.type);
    }
    const key = JSON.stringify([
      state.hand,
      state.previousDiscard,
      state.currentPlay,
      state.result,
      state.phase,
      state.deckCount,
    ]);
    if (key !== this.renderKey || force) {
      this.renderKey = key;
      this.refreshCards(!!isNew, event?.type, event?.playerId, event?.source);
    }
    if (
      isNew &&
      event?.playerId &&
      ["play", "bonus", "draw"].includes(event.type)
    ) {
      const av = this.avatars.get(event.playerId);
      if (av) {
        const drawing = event.type === "draw";
        const drawn =
          event.card ||
          (event.playerId === state.me
            ? state.hand.find(
                (c) => !previousState?.hand.some((old) => old.id === c.id),
              )
            : undefined);
        const cards = drawing ? [drawn] : event.cards || [];
        cards.forEach((c) => {
          const finalMesh = drawing
            ? event.playerId === state.me
              ? av.cards.children.find((m) => m.userData.id === c?.id)
              : av.cards.children.at(-1)
            : this.cardGroup.children.find((m) => m.userData.id === c?.id);
          if (finalMesh) finalMesh.visible = false;
          // Opponent deck draws remain face-down throughout the gesture.
          const moving = cardMesh(
            drawing && event.playerId !== state.me ? undefined : c,
            av.player.back,
            av.player.face,
          );
          this.scene.add(moving);
          const oldPile = previousState?.previousDiscard.cards || [];
          const index = oldPile.findIndex((item) => item.id === c?.id);
          const from =
            event.source === "discard"
              ? V(
                  0.12 +
                    (Math.max(0, index) - (oldPile.length - 1) / 2) * 0.145,
                  0.82,
                  -0.12,
                )
              : V(-0.32, 0.82, 0);
          this.gestures.push({
            mesh: moving,
            avatar: av,
            start: av.nextActionAt + av.actionDelay * 1000,
            kind: event.type,
            from,
            to:
              finalMesh && !drawing
                ? finalMesh.position.clone()
                : V(0.12, 0.81, 0.22),
            rotation:
              finalMesh && !drawing
                ? finalMesh.quaternion.clone()
                : new T.Quaternion().setFromEuler(
                    new T.Euler(-Math.PI / 2, 0, 0),
                  ),
            finalMesh,
          });
        });
      }
    }
  }

  refreshCards(
    animate: boolean,
    type?: string,
    actor?: string,
    source?: string,
  ) {
    const st = this.state!;
    const old = new Map<string, T.Vector3>();
    this.cardGroup.children.forEach((c) => {
      if (c.userData.id) old.set(c.userData.id, c.position.clone());
    });
    this.cardGroup.clear();
    const create = (
      card: Card | undefined,
      pos: T.Vector3,
      rot: T.Euler,
      id: string,
    ) => {
      const m = cardMesh(card);
      m.userData.id = id;
      m.position.copy(pos);
      m.rotation.copy(rot);
      this.cardGroup.add(m);
      let from = old.get(id);
      if (
        !from &&
        animate &&
        type !== "play" &&
        type !== "bonus" &&
        type !== "draw"
      ) {
        const av = actor ? this.avatars.get(actor) : null;
        if (type === "play" || type === "bonus")
          from = av ? av.root.localToWorld(V(0.1, 0.85, 0.3)) : pos.clone();
        else if (type === "draw")
          from = source === "discard" ? V(0.12, 0.81, -0.1) : V(-0.33, 0.82, 0);
        else if (type === "yaniv") {
          const owner = st.result?.rows.find((r) =>
            r.hand.some((c) => c.id === id),
          );
          from = owner
            ? this.avatars.get(owner.id)?.root.localToWorld(V(0.1, 0.85, 0.3))
            : undefined;
        } else if (type === "deal") from = V(-0.33, 0.8, 0);
      }
      if (from && from.distanceTo(pos) > 0.02) {
        m.position.copy(from);
        this.flies.push({
          mesh: m,
          from,
          to: pos.clone(),
          start: performance.now(),
          duration: 700,
          endRotation: rot.clone(),
        });
      }
      return m;
    };
    for (let i = 0; i < Math.min(9, Math.ceil(st.deckCount / 6)); i++)
      create(
        undefined,
        V(-0.32, 0.8 + i * 0.0025, 0),
        new T.Euler(-Math.PI / 2, 0, 0.08),
        "deck" + i,
      );
    const pile = (cards: Card[], z: number) =>
      cards.forEach((c, i) =>
        create(
          c,
          V(0.12 + (i - (cards.length - 1) / 2) * 0.145, 0.806 + i * 0.0008, z),
          new T.Euler(-Math.PI / 2, 0, ((i % 3) - 1) * 0.025),
          c.id,
        ),
      );
    pile(st.previousDiscard.cards, -0.12);
    pile(st.currentPlay.cards, 0.22);
    if (st.result) {
      st.result.rows.forEach((row) => {
        const index = st.players.findIndex((p) => p.id === row.id);
        if (index < 0) return;
        const a =
          ((st.players[index].seat ?? index) /
            Math.max(st.seatCount || st.players.length, 2)) *
          Math.PI *
          2;
        row.hand.forEach((c, i) => {
          const offset = (i - (row.hand.length - 1) / 2) * 0.132;
          const x = Math.sin(a) * 0.82 + Math.cos(a) * offset,
            z = Math.cos(a) * 0.82 - Math.sin(a) * offset;
          create(c, V(x, 0.815, z), new T.Euler(-Math.PI / 2, 0, -a), c.id);
        });
      });
    }
  }

  select(ids: string[]) {
    this.selected = new Set(ids);
  }
  emote(id: string, emoji: string) {
    const label = this.labels.get(id);
    if (!label) return;
    const e = document.createElement("b");
    e.className = "emote-bubble";
    e.textContent = emoji;
    label.append(e);
    setTimeout(() => e.remove(), 3000);
  }
  animate = () => {
    this.raf = requestAnimationFrame(this.animate);
    const now = performance.now(),
      dt = Math.min((now - this.lastFrame) / 1000, 0.05);
    this.lastFrame = now;
    animateCardBacks(now / 1000);
    const reveal =
      this.state?.phase === "YANIV_REVEAL" ||
      this.state?.phase === "ROUND_END" ||
      this.state?.phase === "GAME_END";
    const desired = this.seat.clone();
    if (reveal) desired.y += 0.24;
    this.camera.position.lerp(desired, 0.08);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.set(
      reveal ? -0.36 : this.pitch,
      this.baseYaw + this.yaw,
      0,
    );
    const target = this.state
      ? this.avatars.get(this.state.turnId)?.root.position
      : undefined;
    for (const av of this.avatars.values()) {
      av.update(dt, now, target);
      const hose = av.root.userData.hookahHose as T.Mesh | undefined;
      if (hose && now - av.root.userData.hoseAt > 80) {
        av.root.userData.hoseAt = now;
        const end = hose.parent!.worldToLocal(
          av.hoseHeld
            ? av.grip.getWorldPosition(V())
            : av.root.localToWorld(V(-0.31, 0.76, 0.24)),
        );
        const curve = new T.CatmullRomCurve3([
          V(0, 0.25, 0),
          V(0.25, 0.16, 0.22),
          V(end.x * 0.6, 0.28, end.z * 0.6),
          end,
        ]);
        hose.geometry.dispose();
        hose.geometry = new T.TubeGeometry(curve, 18, 0.012, 6, false);
      }
    }
    for (const patron of this.patrons) {
      if (this.quality !== "low" || this.frameCounter % 3 === 0)
        patron.update(
          dt * (this.quality === "low" ? 3 : 1),
          now,
          patron.root.userData.lookAt,
        );
    }
    this.gestures = this.gestures.filter((g) => {
      const t = (now - g.start) / 1000;
      if (t < 0) {
        g.mesh.position.copy(
          g.kind === "draw" ? g.from : g.avatar.cards.getWorldPosition(V()),
        );
        g.mesh.quaternion.copy(
          g.kind === "draw"
            ? g.rotation
            : g.avatar.cards.getWorldQuaternion(new T.Quaternion()),
        );
        return true;
      }
      const wrist = g.avatar.grip.getWorldPosition(V());
      const q = g.avatar.grip.getWorldQuaternion(new T.Quaternion());
      if (g.kind === "draw") {
        if (t < 0.48) {
          const e = T.MathUtils.smoothstep(t, 0.24, 0.48);
          g.mesh.position.lerpVectors(g.from, wrist, e);
          g.mesh.quaternion.copy(g.rotation).slerp(q, e);
        } else {
          g.mesh.position.copy(wrist);
          g.mesh.quaternion.copy(q);
          const e = T.MathUtils.smoothstep(t, 0.92, 1.25);
          g.mesh.position.lerp(g.avatar.cards.getWorldPosition(V()), e);
          g.mesh.quaternion.slerp(
            g.avatar.cards.getWorldQuaternion(new T.Quaternion()),
            e,
          );
        }
      } else if (t < 0.52) {
        g.mesh.position.copy(wrist);
        g.mesh.quaternion.copy(q);
        g.from.copy(wrist);
      } else {
        const e = T.MathUtils.smoothstep(t, 0.52, 0.95);
        g.mesh.position.lerpVectors(g.from, g.to, e);
        g.mesh.position.y += Math.sin(e * Math.PI) * 0.09;
        g.mesh.quaternion.copy(q).slerp(g.rotation, e);
      }
      if (t >= (g.kind === "draw" ? 1.25 : 0.95)) {
        this.scene.remove(g.mesh);
        if (g.finalMesh) g.finalMesh.visible = true;
        return false;
      }
      return true;
    });
    const ownCards = this.state
      ? this.avatars.get(this.state.me)?.cards
      : undefined;
    ownCards?.children.forEach((m) => {
      const base = m.userData.restY ?? 0;
      const y = base + (this.selected.has(m.userData.id) ? 0.035 : 0);
      m.position.y += (y - m.position.y) * 0.15;
    });
    this.flies = this.flies.filter((f) => {
      const t = Math.min(1, (now - f.start) / f.duration),
        e = t * t * (3 - 2 * t);
      f.mesh.position.lerpVectors(f.from, f.to, e);
      f.mesh.position.y += Math.sin(t * Math.PI) * 0.13;
      f.mesh.rotation.z = f.endRotation.z + Math.sin(t * Math.PI) * 0.13;
      return t < 1;
    });
    for (const m of this.cardGroup.children)
      if (m.userData.hand && !this.flies.some((f) => f.mesh === m)) {
        const y = 0.917 + (this.selected.has(m.userData.id) ? 0.035 : 0);
        m.position.y += (y - m.position.y) * 0.12;
      }
    if (++this.frameCounter % 2 === 0) {
      for (const [id, label] of this.labels) {
        if (id === this.state?.me) continue;
        const av = this.avatars.get(id)!;
        const p = av.root.position.clone();
        p.y = 1.56;
        p.project(this.camera);
        label.style.left = `${(p.x * 0.5 + 0.5) * this.root.clientWidth}px`;
        label.style.top = `${(-p.y * 0.5 + 0.5) * this.root.clientHeight}px`;
        label.style.display =
          Math.abs(p.x) > 1.15 || Math.abs(p.y) > 1.1 || p.z > 1 ? "none" : "";
      }
    }
    this.renderer.render(this.scene, this.camera);
  };
}
