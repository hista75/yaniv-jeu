import * as T from "three";
import type { Card } from "./types";
let faceTheme = "classic";
export function setCardTheme(theme: string) {
  faceTheme = theme;
}
const cache = new Map<string, T.CanvasTexture>();
export function canvasTexture(
  w: number,
  h: number,
  paint: (c: CanvasRenderingContext2D) => void,
) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext("2d")!);
  const t = new T.CanvasTexture(canvas);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
export function cardTexture(card?: Card, theme = faceTheme) {
  const key = card ? theme + card.rank + card.suit : "back";
  if (cache.has(key)) return cache.get(key)!;
  const t = canvasTexture(512, 720, (c) => {
    c.scale(2, 2);
    c.fillStyle = "#eee7d5";
    c.fillRect(0, 0, 256, 360);
    c.fillStyle = card
      ? theme === "ivory"
        ? "#edf7ff"
        : theme === "gold"
          ? "#fff1ca"
          : "#fffdf3"
      : "#153d66";
    c.beginPath();
    c.roundRect(8, 8, 240, 344, 14);
    c.fill();
    c.strokeStyle = card
      ? theme === "gold"
        ? "#b48329"
        : theme === "ivory"
          ? "#4376a0"
          : "#d5c7a5"
      : "#c8b27a";
    c.lineWidth = 0.8;
    c.beginPath();
    c.roundRect(13, 13, 230, 334, 11);
    c.stroke();
    if (!card) {
      c.strokeStyle = "#96b8c8";
      c.lineWidth = 1.6;
      for (let y = 20; y < 345; y += 24)
        for (let x = 18; x < 246; x += 24) {
          c.beginPath();
          c.moveTo(x, y - 8);
          c.lineTo(x + 8, y);
          c.lineTo(x, y + 8);
          c.lineTo(x - 8, y);
          c.closePath();
          c.stroke();
        }
      c.fillStyle = "#153d66";
      c.beginPath();
      c.arc(128, 180, 49, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "#d9bc7e";
      c.lineWidth = 3;
      c.stroke();
      c.fillStyle = "#eee2bf";
      c.textAlign = "center";
      c.font = "bold 22px Georgia";
      c.fillText("YANIV", 128, 179);
      c.font = "11px sans-serif";
      c.fillText("CAFÉ DJERBIEN", 128, 199);
      return;
    }
    const red = card.suit === "♥" || card.suit === "♦";
    c.fillStyle = red ? "#ac3033" : "#203b49";
    c.font = "bold 34px Georgia";
    c.fillText(card.rank === "JOKER" ? "✦" : card.rank, 21, 44);
    c.font = "30px Georgia";
    c.fillText(card.suit, 20, 79);
    c.save();
    c.translate(256, 360);
    c.rotate(Math.PI);
    c.font = "bold 34px Georgia";
    c.fillText(card.rank === "JOKER" ? "✦" : card.rank, 21, 44);
    c.font = "30px Georgia";
    c.fillText(card.suit, 20, 79);
    c.restore();
    c.textAlign = "center";
    if (card.rank === "JOKER") {
      c.font = "84px Georgia";
      c.fillStyle = "#bd8a3d";
      c.fillText("☀", 128, 192);
      c.font = "bold 19px Georgia";
      c.fillStyle = "#203b49";
      c.fillText("LE MALIN", 128, 230);
      c.font = "13px sans-serif";
      c.fillText("J O K E R", 128, 255);
    } else if (["V", "D", "R"].includes(card.rank)) {
      c.fillStyle = "#eee2c4";
      c.fillRect(59, 76, 138, 208);
      c.strokeStyle = "#b5995b";
      c.lineWidth = 1.4;
      c.strokeRect(59, 76, 138, 208);
      // Engraved, mirrored court figures, with individual headwear and robes.
      for (let half = 0; half < 2; half++) {
        c.save();
        if (half) {
          c.translate(256, 360);
          c.rotate(Math.PI);
        }
        const ink = red ? "#a52e37" : "#214c70";
        c.fillStyle = ink;
        c.beginPath();
        c.moveTo(67, 180);
        c.lineTo(78, 151);
        c.quadraticCurveTo(104, 135, 128, 145);
        c.quadraticCurveTo(162, 133, 182, 156);
        c.lineTo(189, 180);
        c.fill();
        c.strokeStyle = "#caa24f";
        for (let j = 0; j < 8; j++) {
          c.beginPath();
          c.moveTo(73 + j * 14, 152);
          c.lineTo(87 + j * 14, 180);
          c.stroke();
        }
        c.fillStyle = "#dfba87";
        c.beginPath();
        c.ellipse(127, 121, 22, 29, 0, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = "#704d38";
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(129, 116);
        c.lineTo(133, 128);
        c.lineTo(126, 130);
        c.stroke();
        c.beginPath();
        c.moveTo(118, 138);
        c.quadraticCurveTo(126, 141, 135, 137);
        c.stroke();
        c.fillStyle = "#332d32";
        c.fillRect(113, 117, 6, 2);
        c.fillRect(133, 117, 6, 2);
        if (card.rank === "R") {
          c.beginPath();
          c.moveTo(108, 131);
          c.quadraticCurveTo(127, 153, 147, 129);
          c.lineTo(143, 147);
          c.lineTo(127, 155);
          c.lineTo(111, 146);
          c.fill();
        }
        c.fillStyle = card.rank === "V" ? ink : "#c7a050";
        c.beginPath();
        c.moveTo(103, 103);
        c.lineTo(101, 84);
        c.lineTo(114, 94);
        c.lineTo(126, 79);
        c.lineTo(139, 94);
        c.lineTo(153, 84);
        c.lineTo(151, 103);
        c.closePath();
        c.fill();
        c.fillStyle = "#f4e9c8";
        for (let j = 0; j < 3; j++) {
          c.beginPath();
          c.arc(113 + j * 14, 98, 2, 0, 7);
          c.fill();
        }
        c.strokeStyle = "#c7a050";
        c.lineWidth = 4;
        c.beginPath();
        c.moveTo(173, 174);
        c.lineTo(166, 112);
        c.stroke();
        c.font = "24px Georgia";
        c.fillStyle = ink;
        c.fillText(card.suit, 168, 109);
        c.restore();
      }
    } else {
      const n = card.rank === "A" ? 1 : Number(card.rank);
      c.font = n === 1 ? "100px Georgia" : "44px Georgia";
      if (n === 1) c.fillText(card.suit, 128, 215);
      else {
        for (let i = 0; i < n; i++) {
          const cols = n <= 3 ? 1 : 2;
          const rows = Math.ceil(n / cols);
          c.fillText(
            card.suit,
            cols === 1 ? 128 : 91 + (i % 2) * 74,
            112 + Math.floor(i / cols) * (144 / Math.max(rows - 1, 1)),
          );
        }
      }
    }
  });
  cache.set(key, t);
  return t;
}
const shape = new T.Shape();
const w = 0.064,
  h = 0.09,
  r = 0.007;
shape.moveTo(-w + r, -h);
shape.lineTo(w - r, -h);
shape.quadraticCurveTo(w, -h, w, -h + r);
shape.lineTo(w, h - r);
shape.quadraticCurveTo(w, h, w - r, h);
shape.lineTo(-w + r, h);
shape.quadraticCurveTo(-w, h, -w, h - r);
shape.lineTo(-w, -h + r);
shape.quadraticCurveTo(-w, -h, -w + r, -h);
const geo = new T.ShapeGeometry(shape, 5);
const uv = geo.getAttribute("uv");
const pos = geo.getAttribute("position");
for (let i = 0; i < uv.count; i++)
  uv.setXY(i, (pos.getX(i) + w) / (2 * w), (pos.getY(i) + h) / (2 * h));
const backMaterials = new Map<string, T.MeshStandardMaterial>();
const clockUniform = { value: 0 };
export function animateCardBacks(time: number) {
  clockUniform.value = time;
}
export function backTexture(style = "classic") {
  if (style === "classic") return cardTexture();
  const key = "back-" + style;
  if (cache.has(key)) return cache.get(key)!;
  const texture = canvasTexture(512, 720, (c) => {
    c.scale(2, 2);
    c.fillStyle = "#eee4c9";
    c.fillRect(0, 0, 256, 360);
    const gold = style === "solar";
    c.fillStyle = gold ? "#352211" : style === "aurora" ? "#142849" : "#075b70";
    c.fillRect(9, 9, 238, 342);
    c.strokeStyle = gold ? "#eac86d" : "#8eddd7";
    c.lineWidth = 1.5;
    c.strokeRect(16, 16, 224, 328);
    for (let y = 35; y < 340; y += 32)
      for (let x = 32; x < 236; x += 32) {
        c.save();
        c.translate(x, y);
        c.rotate(Math.PI / 4);
        c.strokeRect(-10, -10, 20, 20);
        c.rotate(Math.PI / 4);
        c.strokeRect(-9, -9, 18, 18);
        c.restore();
      }
    c.fillStyle = gold ? "#352211" : "#123749";
    c.beginPath();
    c.ellipse(128, 180, 57, 72, 0, 0, 7);
    c.fill();
    c.stroke();
    c.fillStyle = gold ? "#f8d979" : "#d6f0e3";
    c.textAlign = "center";
    c.font = "52px Georgia";
    c.fillText(gold ? "☀" : "✦", 128, 187);
    c.font = "bold 16px Georgia";
    c.fillText("DJERBA", 128, 213);
    c.font = "10px Georgia";
    c.fillText("YANIV · CAFÉ", 128, 233);
  });
  cache.set(key, texture);
  return texture;
}
function backMaterialFor(style: string) {
  if (backMaterials.has(style)) return backMaterials.get(style)!;
  const m = new T.MeshStandardMaterial({
    map: backTexture(style),
    roughness: 0.7,
  });
  if (["aurora", "solar"].includes(style)) {
    m.onBeforeCompile = (shader) => {
      shader.uniforms.backTime = clockUniform;
      shader.fragmentShader =
        "uniform float backTime;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
    float glow=pow(max(0.0,sin(vMapUv.y*15.0+vMapUv.x*8.0-backTime*1.4)),8.0);
    diffuseColor.rgb += vec3(${style === "solar" ? ".36,.22,.055" : ".08,.22,.32"})*glow;`,
      );
    };
    m.customProgramCacheKey = () => "animated-back-" + style;
  }
  backMaterials.set(style, m);
  return m;
}
const faceMaterials = new Map<string, T.MeshStandardMaterial>();
export function cardMesh(
  card?: Card,
  backStyle = "classic",
  theme = faceTheme,
) {
  const backMaterial = backMaterialFor(backStyle);
  const group = new T.Group();
  let mat = backMaterial;
  if (card) {
    const key = theme + card.rank + card.suit;
    if (!faceMaterials.has(key))
      faceMaterials.set(
        key,
        new T.MeshStandardMaterial({
          map: cardTexture(card, theme),
          roughness: 0.8,
        }),
      );
    mat = faceMaterials.get(key)!;
  }
  const front = new T.Mesh(geo, mat);
  const back = new T.Mesh(geo, backMaterial);
  back.rotation.y = Math.PI;
  back.position.z = -0.001;
  front.castShadow = true;
  back.castShadow = true;
  group.add(front, back);
  return group;
}
