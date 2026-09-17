import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { cardMesh, canvasTexture } from "./cards";
import type { Player, Card } from "./types";
const loader = new GLTFLoader();
let template: T.Group;
const hairs = new Map<string, T.Group>();
export async function loadAvatars() {
  const [body, ...hair] = await Promise.all([
    loader.loadAsync("/assets/models/cafe-humanoid.glb"),
    ...["Hair_Buzzed", "Hair_SimpleParted", "Hair_Beard"].map((n) =>
      loader.loadAsync("/assets/models/" + n + ".glb"),
    ),
  ]);
  template = body.scene;
  ["Hair_Buzzed", "Hair_SimpleParted", "Hair_Beard"].forEach((n, i) =>
    hairs.set(n, hair[i].scene),
  );
}
function direction(bone: T.Object3D, child: T.Object3D, target: T.Vector3) {
  bone.updateWorldMatrix(true, true);
  const current = child
    .getWorldPosition(new T.Vector3())
    .sub(bone.getWorldPosition(new T.Vector3()))
    .normalize();
  const q = new T.Quaternion()
    .setFromUnitVectors(current, target.clone().normalize())
    .multiply(bone.getWorldQuaternion(new T.Quaternion()));
  bone.quaternion.copy(
    bone.parent!.getWorldQuaternion(new T.Quaternion()).invert().multiply(q),
  );
  bone.updateWorldMatrix(false, true);
}
function material(color: T.ColorRepresentation, metal = 0) {
  return new T.MeshStandardMaterial({
    color,
    roughness: metal ? 0.3 : 0.9,
    metalness: metal,
  });
}
export function skinPortraits(): Map<string, string> {
  const portraits = new Map<string, string>();
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(160, 180);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  const scene = new T.Scene();
  scene.add(new T.HemisphereLight("#fff0d0", "#729487", 3));
  const light = new T.DirectionalLight("#ffe2b9", 3);
  light.position.set(-2, 3, 4);
  scene.add(light);
  const camera = new T.PerspectiveCamera(30, 160 / 180, 0.02, 10);
  camera.position.set(0.03, 1.25, 1.22);
  camera.lookAt(0, 1.09, 0);
  for (const skin of ["jeune", "classique", "costaud", "nain", "vieux", "bg"]) {
    const avatar = new Avatar({
      id: "portrait",
      name: skin,
      skin,
      pose: "normal",
      score: 0,
      count: 0,
      eliminated: false,
      connected: true,
    });
    scene.add(avatar.root);
    renderer.render(scene, camera);
    portraits.set(skin, renderer.domElement.toDataURL("image/png"));
    scene.remove(avatar.root);
    avatar.dispose();
  }
  camera.position.set(0.65, 1.45, 2.5);
  camera.lookAt(0, 0.83, 0.1);
  for (const pose of ["normal", "focus", "chicha"]) {
    const av = new Avatar({
      id: "pose-preview",
      name: pose,
      skin: "jeune",
      pose,
      score: 0,
      count: 5,
      eliminated: false,
      connected: true,
    });
    av.joined = performance.now() - 4000;
    av.update(0, performance.now());
    scene.add(av.root);
    renderer.render(scene, camera);
    portraits.set("pose-" + pose, renderer.domElement.toDataURL("image/png"));
    scene.remove(av.root);
    av.dispose();
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return portraits;
}
export class Avatar {
  root = new T.Group();
  body: T.Group;
  head: T.Object3D;
  right: T.Object3D;
  left: T.Object3D;
  mixer: T.AnimationMixer;
  cards = new T.Group();
  grip = new T.Group();
  actionTarget?: T.Vector3;
  nextActionAt = 0;
  hoseHeld = true;
  private actions: {
    type: string;
    target?: T.Vector3;
    at: number;
    end: number;
  }[] = [];
  get actionDelay() {
    return this.player.pose === "chicha" ? 0.6 : 0.16;
  }
  private wristHome = new Map<string, T.Quaternion>();
  private handKey = "";
  base = new Map<string, T.Quaternion>();
  joined = performance.now();
  actionAt = -99999;
  action = "";
  headHome: T.Quaternion;
  player: Player;
  eyes: T.SkinnedMesh[] = [];
  constructor(player: Player) {
    this.player = player;
    const visitor = player.skin.startsWith("visitor-")
      ? Number(player.skin.slice(8))
      : -1;
    const visitorColors = [
      "#c39552",
      "#58627c",
      "#687a51",
      "#975e71",
      "#366d74",
      "#806e9a",
    ];
    this.body = clone(template) as T.Group;
    this.root.add(this.body);
    const b = (name: string) => this.body.getObjectByName(name)!;
    this.head = b("Head");
    this.right = b("upperarm_r");
    this.left = b("upperarm_l");
    // Aim real humanoid joints in world coordinates; preserves the imported bind pose.
    for (const side of ["l", "r"]) {
      direction(
        b("thigh_" + side),
        b("calf_" + side),
        new T.Vector3(side === "l" ? 0.045 : -0.045, -0.06, 1),
      );
      direction(
        b("calf_" + side),
        b("foot_" + side),
        new T.Vector3(0, -1, 0.04),
      );
      direction(
        b("foot_" + side),
        b("ball_" + side),
        new T.Vector3(0, -0.08, 1),
      );
      direction(
        b("upperarm_" + side),
        b("lowerarm_" + side),
        new T.Vector3(side === "l" ? 0.16 : -0.16, -1, 0.18),
      );
      direction(
        b("lowerarm_" + side),
        b("hand_" + side),
        new T.Vector3(side === "l" ? -0.1 : 0.1, 0.05, 1),
      );
      for (const finger of ["index", "middle", "ring", "pinky"])
        for (const joint of ["01", "02", "03"]) {
          const f = b(`${finger}_${joint}_${side}`);
          if (f) f.rotateX(0.35);
        }
    }
    this.body.position.y = -0.415;
    const fabric = canvasTexture(256, 256, (c) => {
      c.fillStyle = "#eee9de";
      c.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 3) {
        c.fillStyle = y % 2 ? "rgba(45,35,25,.08)" : "rgba(255,255,255,.22)";
        c.fillRect(0, y, 256, 1);
      }
      for (let x = 0; x < 256; x += 3) {
        c.fillStyle = "rgba(35,30,20,.05)";
        c.fillRect(x, 0, 1, 256);
      }
    });
    fabric.wrapS = fabric.wrapT = T.RepeatWrapping;
    fabric.repeat.set(4, 4);
    let skinMaterial: T.MeshStandardMaterial | undefined;
    this.body.traverse((o) => {
      if (
        o instanceof T.Mesh &&
        !Array.isArray(o.material) &&
        o.material.name === "MI_Superhero_Male"
      )
        skinMaterial = o.material as T.MeshStandardMaterial;
    });
    this.body.traverse((o) => {
      if (o instanceof T.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        const orig = o.material as T.MeshStandardMaterial;
        const mat = orig.clone();
        const name = orig.name;
        if (name === "Shirt") {
          // Loosen the actual skinned garment geometry instead of only painting skin.
          o.geometry = o.geometry.clone();
          const positions = o.geometry.getAttribute("position");
          const normals = o.geometry.getAttribute("normal");
          const used = new Set<number>(Array.from(o.geometry.index!.array));
          for (const i of used) {
            const x = positions.getX(i),
              y = positions.getY(i),
              z = positions.getZ(i);
            const hem = T.MathUtils.smoothstep(y, 0.99, 1.045);
            const neck = 1 - T.MathUtils.smoothstep(y, 1.44, 1.57);
            const torso = 1 - T.MathUtils.smoothstep(Math.abs(x), 0.2, 0.33);
            const loose =
              (player.skin === "costaud" ? 0.024 : 0.044) * hem * neck;
            const fold = Math.sin(x * 82 + y * 12) * 0.004 * hem * neck;
            positions.setXYZ(
              i,
              x + normals.getX(i) * (loose * 0.7 + fold),
              y,
              z +
                normals.getZ(i) * (loose + fold) +
                Math.sign(z) * torso * loose * 0.4,
            );
          }
          positions.needsUpdate = true;
          o.geometry.computeVertexNormals();
          mat.map = fabric;
          mat.roughness = 0.96;
          mat.color.set(
            (
              {
                jeune: "#a82429",
                classique: "#2a6d69",
                costaud: "#ded3b5",
                nain: "#8e3530",
                vieux: "#826b52",
                bg: "#eee9da",
                azur: "#75afb8",
                sultan: "#dcc491",
              } as Record<string, string>
            )[player.skin] ||
              visitorColors[visitor] ||
              "#888888",
          );
          if (visitor >= 0) {
            const stripes = canvasTexture(256, 256, (c) => {
              c.fillStyle = visitorColors[visitor];
              c.fillRect(0, 0, 256, 256);
              c.strokeStyle = "#e7dcc3";
              c.lineWidth = visitor % 2 ? 2 : 6;
              for (let y = 8; y < 256; y += 24) {
                c.beginPath();
                c.moveTo(0, y);
                c.lineTo(256, y);
                c.stroke();
              }
              if (visitor % 2)
                for (let x = 8; x < 256; x += 32) {
                  c.beginPath();
                  c.moveTo(x, 0);
                  c.lineTo(x, 256);
                  c.stroke();
                }
            });
            mat.map = stripes;
            mat.color.set("white");
          }
          if (player.skin === "classique") {
            mat.map = canvasTexture(256, 256, (c) => {
              c.fillStyle = "#426f65";
              c.fillRect(0, 0, 256, 256);
              for (let i = 0; i < 35; i++) {
                const x = (i * 89) % 256,
                  y = (i * 53) % 256;
                c.fillStyle = "#d9c697";
                for (let j = 0; j < 5; j++) {
                  c.beginPath();
                  c.ellipse(
                    x + Math.cos(j * 1.26) * 7,
                    y + Math.sin(j * 1.26) * 7,
                    7,
                    4,
                    j * 1.26,
                    0,
                    7,
                  );
                  c.fill();
                }
              }
            });
            mat.color.set("white");
          }
          if (player.skin === "costaud") {
            // Bind-space mask stays aligned with the skinned shoulders and chest.
            mat.onBeforeCompile = (shader) => {
              shader.vertexShader =
                "varying vec3 garmentPosition;\n" + shader.vertexShader;
              shader.vertexShader = shader.vertexShader.replace(
                "#include <begin_vertex>",
                "#include <begin_vertex>\ngarmentPosition = position;",
              );
              shader.fragmentShader =
                "varying vec3 garmentPosition;\n" + shader.fragmentShader;
              shader.fragmentShader = shader.fragmentShader.replace(
                "#include <color_fragment>",
                `
                #include <color_fragment>
                float neck = (1.0-smoothstep(.073,.085,abs(garmentPosition.x))) * smoothstep(1.345,1.365,garmentPosition.y);
                float arms = smoothstep(.17,.185,abs(garmentPosition.x));
                float bare = max(neck, arms);
                vec3 cotton = vec3(.82,.79,.67);
                float ribs = .025*sin(garmentPosition.x*650.0);
                float stain = exp(-length((garmentPosition.xy-vec2(.09,1.20))*vec2(75.,90.)))
                  + .7*exp(-length((garmentPosition.xy-vec2(-.065,1.10))*vec2(90.,65.)))
                  + .45*exp(-length((garmentPosition.xy-vec2(.04,1.25))*vec2(120.,100.)));
                cotton = mix(cotton+vec3(ribs),vec3(.29,.18,.08),clamp(stain,0.,.65));
                diffuseColor.rgb = mix(cotton,vec3(.51,.30,.145),bare);
              `,
              );
            };
            mat.customProgramCacheKey = () => "costaud-ribbed-tank-v1";
          }
        }
        if (player.eliminated) {
          mat.color.lerp(new T.Color("#888b85"), 0.65);
        }
        o.material = mat;
        if (
          name === "Trousers" &&
          skinMaterial &&
          ["jeune", "costaud", "bg"].includes(player.skin)
        ) {
          o.geometry = o.geometry.clone();
          const p = o.geometry.getAttribute("position"),
            normal = o.geometry.getAttribute("normal");
          const index = o.geometry.index!,
            cloth: number[] = [],
            skin: number[] = [];
          for (let i = 0; i < index.count; i += 3) {
            const tri = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
            (tri.reduce((sum, j) => sum + p.getY(j), 0) / 3 < 0.58
              ? skin
              : cloth
            ).push(...tri);
          }
          for (const i of new Set(cloth)) {
            const loosen =
              0.025 * T.MathUtils.smoothstep(p.getY(i), 0.58, 0.67);
            p.setXYZ(
              i,
              p.getX(i) + normal.getX(i) * loosen,
              p.getY(i),
              p.getZ(i) + normal.getZ(i) * loosen,
            );
          }
          o.geometry.setIndex([...cloth, ...skin]);
          o.geometry.clearGroups();
          o.geometry.addGroup(0, cloth.length, 0);
          o.geometry.addGroup(cloth.length, skin.length, 1);
          o.material = [mat, skinMaterial.clone()];
          mat.color.set(
            player.skin === "bg"
              ? "#b5a17c"
              : player.skin === "jeune"
                ? "#526575"
                : "#79775c",
          );
          o.geometry.computeVertexNormals();
        }
        if (o instanceof T.SkinnedMesh && /Eyes/.test(o.name)) {
          o.geometry = o.geometry.clone();
          const pos = o.geometry.getAttribute("position");
          o.geometry.computeBoundingBox();
          const middle =
            (o.geometry.boundingBox!.min.y + o.geometry.boundingBox!.max.y) / 2;
          const closed = new Float32Array(pos.count * 3);
          for (let i = 0; i < pos.count; i++) {
            closed[i * 3] = pos.getX(i);
            closed[i * 3 + 1] = middle + (pos.getY(i) - middle) * 0.08;
            closed[i * 3 + 2] = pos.getZ(i);
          }
          o.geometry.morphAttributes.position = [
            new T.BufferAttribute(closed, 3),
          ];
          o.updateMorphTargets();
          this.eyes.push(o);
        }
      }
    });
    // Original sculpted hairstyles, attached in head-local space.
    this.body.updateMatrixWorld(true);
    const hairName =
      player.skin === "classique" || player.skin === "bg" || visitor % 2 === 0
        ? "Hair_SimpleParted"
        : "Hair_Buzzed";
    for (const n of [
      hairName,
      ...(player.skin === "vieux" ? ["Hair_Beard"] : []),
    ]) {
      const hair = hairs.get(n)!.clone(true);
      this.body.add(hair);
      this.body.updateMatrixWorld(true);
      this.head.attach(hair);
      hair.traverse((o) => {
        if (o instanceof T.Mesh) {
          o.castShadow = true;
          const m = (o.material as T.MeshStandardMaterial).clone();
          m.color.set(
            player.skin === "vieux"
              ? "#adaba6"
              : visitor >= 0
                ? [
                    "#473729",
                    "#807363",
                    "#211f20",
                    "#503529",
                    "#b1aaa0",
                    "#383332",
                  ][visitor]
                : "#33241c",
          );
          o.material = m;
          if (player.skin === "vieux") {
            m.map = null;
          }
          if (player.skin === "jeune") {
            o.geometry = o.geometry.clone();
            const p = o.geometry.getAttribute("position"),
              normal = o.geometry.getAttribute("normal");
            for (let i = 0; i < p.count; i++) {
              const curl =
                0.0035 *
                (1 + Math.sin(p.getX(i) * 210) * Math.sin(p.getZ(i) * 240));
              p.setXYZ(
                i,
                p.getX(i) + normal.getX(i) * curl,
                p.getY(i) + normal.getY(i) * curl,
                p.getZ(i) + normal.getZ(i) * curl,
              );
            }
            o.geometry.computeVertexNormals();
          }
        }
      });
    }
    this.body.updateMatrixWorld(true);
    const accessories = new T.Group();
    accessories.position.set(0, 1.72, 0);
    this.body.add(accessories);
    this.body.updateMatrixWorld(true);
    this.head.attach(accessories);
    const fez = () => {
      const hat = new T.Mesh(
        new T.CylinderGeometry(0.081, 0.092, 0.125, 32),
        material("#9a2625"),
      );
      hat.position.set(0, 0.09, -0.015);
      accessories.add(hat);
      const tassel = new T.Mesh(
        new T.CylinderGeometry(0.003, 0.003, 0.13, 8),
        material("#25201b"),
      );
      tassel.position.set(0.076, 0.09, 0.006);
      tassel.rotation.z = -0.3;
      accessories.add(tassel);
    };
    if (["nain", "bg", "vieux", "sultan"].includes(player.skin)) fez();
    if (player.skin === "classique") {
      const hat = new T.Mesh(
        new T.CylinderGeometry(0.092, 0.11, 0.11, 32),
        material("#c8aa70"),
      );
      hat.position.y = 0.075;
      accessories.add(hat);
      const brim = new T.Mesh(
        new T.CylinderGeometry(0.17, 0.17, 0.014, 40),
        material("#d4b878"),
      );
      brim.position.y = 0.027;
      accessories.add(brim);
    }
    if (["costaud", "nain", "bg", "sultan"].includes(player.skin)) {
      for (const x of [-0.043, 0.043]) {
        const glass = new T.Mesh(
          new T.SphereGeometry(0.037, 16, 12),
          new T.MeshStandardMaterial({
            color: "#293c3c",
            metalness: 0.6,
            roughness: 0.2,
          }),
        );
        glass.scale.set(1, 0.65, 0.15);
        glass.position.set(x, -0.033, 0.089);
        accessories.add(glass);
      }
      const bridge = new T.Mesh(
        new T.BoxGeometry(0.025, 0.007, 0.006),
        material("#b29c63", 0.8),
      );
      bridge.position.set(0, -0.03, 0.095);
      accessories.add(bridge);
    }
    if (["classique", "nain"].includes(player.skin)) {
      const m = new T.Mesh(
        new T.TorusGeometry(0.027, 0.008, 8, 16, Math.PI),
        material("#35271e"),
      );
      m.rotation.z = Math.PI;
      m.scale.set(1.6, 0.6, 1);
      m.position.set(0, -0.085, 0.095);
      accessories.add(m);
    }
    if (player.skin === "costaud") {
      const chain = new T.Mesh(
        new T.TorusGeometry(0.11, 0.006, 8, 40),
        material("#c6a64b", 0.8),
      );
      chain.rotation.x = 0.4;
      chain.position.set(0, 1.37, 0.12);
      this.body.add(chain);
    }
    if (player.skin === "jeune") {
      const logo = new T.Mesh(
        new T.PlaneGeometry(0.23, 0.09),
        new T.MeshStandardMaterial({
          map: canvasTexture(256, 96, (c) => {
            c.fillStyle = "#a82429";
            c.fillRect(0, 0, 256, 96);
            c.fillStyle = "#eee1c2";
            c.textAlign = "center";
            c.font = "bold 38px sans-serif";
            c.fillText("TUNISIA", 128, 62);
          }),
          side: T.DoubleSide,
          roughness: 1,
        }),
      );
      logo.position.set(0, 1.29, 0.192);
      this.body.add(logo);
    }
    // Garment details are attached to the chest rig, so they follow breathing.
    const tailoring = new T.Group();
    this.body.add(tailoring);
    const trim = material(
      player.skin === "bg"
        ? "#b99a50"
        : player.skin === "jeune"
          ? "#e7d5b8"
          : "#d0b98b",
    );
    const seam = (points: T.Vector3[], radius = 0.002) => {
      const line = new T.Mesh(
        new T.TubeGeometry(
          new T.CatmullRomCurve3(points),
          24,
          radius,
          6,
          false,
        ),
        trim,
      );
      tailoring.add(line);
    };
    if (
      ["bg", "classique", "vieux", "nain", "azur", "sultan"].includes(
        player.skin,
      )
    ) {
      seam(
        [
          new T.Vector3(0, 1.04, 0.145),
          new T.Vector3(0, 1.25, 0.151),
          new T.Vector3(0, 1.42, 0.11),
        ],
        0.004,
      );
      for (let i = 0; i < 5; i++) {
        const button = new T.Mesh(new T.SphereGeometry(0.008, 10, 8), trim);
        button.position.set(0.012, 1.09 + i * 0.066, 0.155 - i * 0.006);
        button.scale.z = 0.4;
        tailoring.add(button);
      }
      for (const side of [-1, 1]) {
        seam(
          [
            new T.Vector3(side * 0.035, 1.48, 0.065),
            new T.Vector3(side * 0.095, 1.4, 0.125),
            new T.Vector3(side * 0.035, 1.36, 0.145),
          ],
          0.007,
        );
      }
      seam(
        [
          new T.Vector3(0.075, 1.28, 0.147),
          new T.Vector3(0.075, 1.19, 0.15),
          new T.Vector3(0.15, 1.19, 0.13),
          new T.Vector3(0.15, 1.28, 0.13),
        ],
        0.003,
      );
    } else if (player.skin === "jeune") {
      for (const side of [-1, 1])
        seam(
          [
            new T.Vector3(side * 0.038, 1.43, 0.12),
            new T.Vector3(side * 0.042, 1.34, 0.15),
            new T.Vector3(side * 0.049, 1.29, 0.154),
          ],
          0.004,
        );
      seam(
        [
          new T.Vector3(-0.12, 1.12, 0.137),
          new T.Vector3(-0.085, 1.05, 0.145),
          new T.Vector3(0.085, 1.05, 0.145),
          new T.Vector3(0.12, 1.12, 0.137),
        ],
        0.003,
      );
    } else {
      seam(
        [
          new T.Vector3(-0.1, 1.43, 0.1),
          new T.Vector3(0, 1.37, 0.147),
          new T.Vector3(0.1, 1.43, 0.1),
        ],
        0.006,
      );
    }
    if (["bg", "vieux", "nain", "azur", "sultan"].includes(player.skin)) {
      // Embroidered geometric placket inspired by Tunisian jebba detailing.
      for (const side of [-1, 1]) {
        for (let i = 0; i < 8; i++) {
          const x = side * 0.043,
            y = 1.12 + i * 0.028;
          seam(
            [
              new T.Vector3(x, y, 0.156),
              new T.Vector3(x + side * 0.011, y + 0.011, 0.157),
              new T.Vector3(x, y + 0.022, 0.156),
              new T.Vector3(x - side * 0.011, y + 0.011, 0.157),
              new T.Vector3(x, y, 0.156),
            ],
            0.0018,
          );
        }
        seam(
          [
            new T.Vector3(side * 0.063, 1.09, 0.15),
            new T.Vector3(side * 0.063, 1.28, 0.15),
            new T.Vector3(side * 0.053, 1.38, 0.13),
          ],
          0.0025,
        );
      }
    }
    this.body.updateMatrixWorld(true);
    tailoring.position.z = 0.048;
    b("spine_02").attach(tailoring);
    const scale =
      visitor >= 0
        ? [0.91, 0.97, 0.88, 0.94, 1.01, 0.92][visitor]
        : player.skin === "nain"
          ? 0.68
          : player.skin === "costaud"
            ? 1.05
            : 0.96;
    this.body.scale.set(
      player.skin === "costaud"
        ? scale * 1.19
        : player.skin === "nain"
          ? scale * 1.08
          : scale,
      scale,
      player.skin === "costaud" ? scale * 1.13 : scale,
    );
    this.body.position.y = 0.53 - 0.9491 * scale;
    if (["focus", "confident"].includes(player.pose)) {
      b("spine_01").rotateX(player.pose === "confident" ? -0.06 : 0.3);
    }
    if (["chicha", "zen"].includes(player.pose)) {
      b("spine_01").rotateX(player.pose === "zen" ? -0.27 : -0.18);
    }
    this.headHome = this.head.quaternion.clone();
    for (const name of [
      "upperarm_r",
      "upperarm_l",
      "lowerarm_r",
      "lowerarm_l",
      "spine_01",
      "Head",
    ])
      this.base.set(name, b(name).quaternion.clone());
    // AnimationMixer drives the actual skinned torso, with subtle breathing.
    this.mixer = new T.AnimationMixer(this.body);
    const spine = b("spine_02"),
      q = spine.quaternion.clone(),
      q2 = q
        .clone()
        .multiply(
          new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), 0.012),
        );
    const clip = new T.AnimationClip("Seated breathing", 4, [
      new T.QuaternionKeyframeTrack(
        "spine_02.quaternion",
        [0, 2, 4],
        [...q.toArray(), ...q2.toArray(), ...q.toArray()],
      ),
    ]);
    this.mixer.clipAction(clip).play();
    // Calibrate sockets in model space, then parent them to the real wrist bones.
    this.root.updateMatrixWorld(true);
    // Pin the bottom of the fan at the index/thumb pinch, not above the wrist.
    const pinch = b("index_01_l").getWorldPosition(new T.Vector3());
    this.cards.position.copy(pinch).add(new T.Vector3(0, 0.018, 0.008));
    this.cards.rotation.set(-0.38, Math.PI, 0);
    this.root.add(this.cards);
    b("hand_l").attach(this.cards);
    for (const finger of ["index", "middle", "ring", "pinky"]) {
      const first = b(`${finger}_01_l`),
        second = b(`${finger}_02_l`),
        third = b(`${finger}_03_l`);
      direction(first, second, new T.Vector3(-0.8, 0.32, -0.12));
      direction(second, third, new T.Vector3(-0.45, 0.2, -0.5));
    }
    direction(
      b("thumb_01_l"),
      b("thumb_02_l"),
      new T.Vector3(-0.65, 0.65, 0.1),
    );
    direction(
      b("thumb_02_l"),
      b("thumb_03_l"),
      new T.Vector3(-0.75, 0.4, 0.05),
    );
    this.grip.position
      .copy(b("hand_r").getWorldPosition(new T.Vector3()))
      .add(new T.Vector3(0, 0.025, 0.055));
    this.grip.rotation.set(-Math.PI / 2, 0, 0);
    this.root.add(this.grip);
    b("hand_r").attach(this.grip);
    for (const side of ["l", "r"])
      this.wristHome.set(
        side,
        b("hand_" + side).getWorldQuaternion(new T.Quaternion()),
      );
    this.setCount(player.count);
  }
  hideHead() {
    if (this.root.userData.headHidden) return;
    this.root.userData.headHidden = true;
    this.head.visible = false;
    this.body.traverse((o) => {
      if (o instanceof T.SkinnedMesh) {
        if (/Eyes|Eyebrows/.test(o.name)) {
          o.visible = false;
          return;
        }
        const geo = o.geometry.clone(),
          pos = geo.getAttribute("position"),
          index = geo.getIndex();
        if (index) {
          const keep: number[] = [];
          for (let i = 0; i < index.count; i += 3) {
            const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
            if (ids.every((j) => pos.getY(j) < 1.5)) keep.push(...ids);
          }
          geo.setIndex(keep);
          o.geometry = geo;
        }
      }
    });
  }
  setCount(n: number, hand?: Card[]) {
    const key = hand ? hand.map((c) => c.id).join(",") : `backs:${n}`;
    if (this.handKey === key) return;
    this.handKey = key;
    this.cards.clear();
    for (let i = 0; i < n; i++) {
      const c = cardMesh(hand?.[i], this.player.back, this.player.face);
      c.userData.id = hand?.[i]?.id;
      const angle = (i - (n - 1) / 2) * -0.13;
      // Every card rotates around the same lower grip point.
      c.position.set(
        -Math.sin(angle) * 0.073,
        Math.cos(angle) * 0.073,
        i * 0.0007,
      );
      c.userData.restY = c.position.y;
      c.rotation.z = angle;
      this.cards.add(c);
    }
  }
  trigger(type: string, target?: T.Vector3) {
    const now = performance.now();
    if (!target) {
      this.actions = [];
      this.action = type;
      this.actionTarget = undefined;
      this.actionAt = now;
      return;
    }
    const at = Math.max(now, this.actions.at(-1)?.end || now);
    const end = at + (this.player.pose === "chicha" ? 2.55 : 1.48) * 1000;
    this.actions.push({ type, target: target.clone(), at, end });
    this.nextActionAt = at;
  }
  update(dt: number, now: number, target?: T.Vector3) {
    while (this.actions.length && now >= this.actions[0].end)
      this.actions.shift();
    const current = this.actions[0];
    if (current && now >= current.at) {
      this.action = current.type;
      this.actionTarget = current.target;
      this.actionAt = current.at;
    } else if (this.actionTarget) this.actionTarget = undefined;
    this.mixer.update(dt);
    const blinkTime = ((now + this.joined) % 4700) / 1000;
    const blink = blinkTime < 0.18 ? Math.sin((blinkTime / 0.18) * Math.PI) : 0;
    for (const eye of this.eyes)
      if (eye.morphTargetInfluences) eye.morphTargetInfluences[0] = blink;
    const elapsed = (now - this.joined) / 1000;
    this.root.scale.setScalar(Math.min(1, 0.85 + elapsed * 0.2));
    const t = (now - this.actionAt) / 1000,
      reach = t < 1.1 ? Math.sin(Math.min(1, t / 1.1) * Math.PI) : 0;
    for (const name of [
      "upperarm_r",
      "lowerarm_r",
      "upperarm_l",
      "lowerarm_l",
    ]) {
      const b = this.body.getObjectByName(name)!;
      b.quaternion.copy(this.base.get(name)!);
      if (name === "upperarm_r" && !this.actionTarget)
        b.rotateX(reach * (this.action === "yaniv" ? -0.8 : -0.6));
      if (name === "lowerarm_r" && !this.actionTarget) b.rotateX(reach * 0.4);
      if (this.action === "yaniv" && name === "upperarm_l")
        b.rotateX(-reach * 0.6);
      if (this.action === "assaf" && name === "upperarm_l")
        b.rotateZ(reach * 0.5);
    }
    const hasCards = this.cards.children.length > 0;
    if (hasCards || this.player.pose === "chicha") {
      const pose = this.player.pose;
      const height =
        this.player.skin === "nain"
          ? 0.77
          : pose === "confident"
            ? 1.04
            : pose === "zen"
              ? 0.81
              : pose === "focus"
                ? 0.97
                : pose === "chicha"
                  ? 0.82
                  : 0.89;
      const hold = this.root.localToWorld(
        new T.Vector3(0.045, height, pose === "focus" ? 0.43 : 0.34),
      );
      this.aimSocket("l", this.cards, hold);
      const support = this.cards
        .getWorldPosition(new T.Vector3())
        .add(
          new T.Vector3(-0.075, -0.012, 0.012).applyQuaternion(
            this.root.getWorldQuaternion(new T.Quaternion()),
          ),
        );
      const puff =
        pose === "chicha"
          ? Math.pow(Math.max(0, Math.sin(now * 0.00055 + this.joined)), 4)
          : 0;
      if (puff > 0)
        support.lerp(
          this.root.localToWorld(new T.Vector3(-0.1, height + 0.25, 0.18)),
          puff,
        );
      this.hoseHeld = true;
      if (pose === "chicha" && this.actionTarget) {
        const dock = this.root.localToWorld(new T.Vector3(-0.31, 0.76, 0.24));
        if (t < 0.32) support.lerp(dock, T.MathUtils.smoothstep(t, 0, 0.32));
        else if (t < 0.6)
          support
            .copy(dock)
            .lerp(
              this.cards.getWorldPosition(new T.Vector3()),
              T.MathUtils.smoothstep(t, 0.32, 0.6),
            );
        else if (t < 1.9)
          support.copy(this.cards.getWorldPosition(new T.Vector3()));
        else if (t < 2.2)
          support
            .copy(this.cards.getWorldPosition(new T.Vector3()))
            .lerp(dock, T.MathUtils.smoothstep(t, 1.9, 2.2));
        else
          support
            .copy(dock)
            .lerp(
              this.root.localToWorld(new T.Vector3(-0.1, height + 0.17, 0.2)),
              T.MathUtils.smoothstep(t, 2.2, 2.55),
            );
        this.hoseHeld = t < 0.32 || t >= 2.2;
      }
      this.aimSocket("r", this.grip, support);
    }
    const actionTime = t - this.actionDelay;
    if (this.actionTarget && actionTime >= 0 && actionTime < 1.25) {
      const weight =
        actionTime < 0.48
          ? T.MathUtils.smoothstep(actionTime, 0, 0.48)
          : 1 - T.MathUtils.smoothstep(actionTime, 0.64, 1.25);
      const goal = this.grip
        .getWorldPosition(new T.Vector3())
        .lerp(this.actionTarget, weight);
      this.aimSocket("r", this.grip, goal);
    }
    this.head.quaternion.copy(this.headHome);
    this.head.rotateY(Math.sin(now * 0.00045 + this.joined) * 0.055);
    if (target) {
      const local = this.root.worldToLocal(target.clone());
      this.head.rotateY(
        T.MathUtils.clamp(Math.atan2(local.x, local.z), -0.36, 0.36) * 0.5,
      );
    }
  }
  private aimSocket(side: string, socket: T.Object3D, goal: T.Vector3) {
    const upper = this.body.getObjectByName("upperarm_" + side)!;
    const lower = this.body.getObjectByName("lowerarm_" + side)!;
    const hand = this.body.getObjectByName("hand_" + side)!;
    const orientation = this.root
      .getWorldQuaternion(new T.Quaternion())
      .multiply(this.wristHome.get(side)!);
    const orient = () =>
      hand.quaternion.copy(
        hand
          .parent!.getWorldQuaternion(new T.Quaternion())
          .invert()
          .multiply(orientation),
      );
    orient();
    hand.updateWorldMatrix(true, true);
    const shoulder = upper.getWorldPosition(new T.Vector3()),
      elbow = lower.getWorldPosition(new T.Vector3()),
      wrist = hand.getWorldPosition(new T.Vector3());
    const offset = socket.getWorldPosition(new T.Vector3()).sub(wrist);
    const axis = goal.clone().sub(offset).sub(shoulder);
    const a = shoulder.distanceTo(elbow),
      b = elbow.distanceTo(wrist);
    const d = T.MathUtils.clamp(
      axis.length(),
      Math.abs(a - b) + 0.001,
      a + b - 0.006,
    );
    axis.normalize();
    const bend = new T.Vector3(
      side === "l" ? 0.6 : -0.6,
      -1,
      -0.1,
    ).transformDirection(this.root.matrixWorld);
    bend.addScaledVector(axis, -bend.dot(axis)).normalize();
    const along = (a * a + d * d - b * b) / (2 * d);
    const joint = axis
      .clone()
      .multiplyScalar(along)
      .addScaledVector(bend, Math.sqrt(Math.max(0, a * a - along * along)));
    direction(upper, lower, joint);
    direction(
      lower,
      hand,
      shoulder
        .clone()
        .addScaledVector(axis, d)
        .sub(lower.getWorldPosition(new T.Vector3())),
    );
    orient();
    hand.updateWorldMatrix(true, true);
  }
  dispose() {
    this.mixer.stopAllAction();
    this.body.traverse((o) => {
      if (o instanceof T.Mesh) {
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        materials.forEach((m) => m.dispose());
      }
    });
  }
}
