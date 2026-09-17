import { randomBytes, createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
export const REWARDS = [
  { id: "classic", type: "back", name: "Bleu du café", wins: 0 },
  { id: "mosaic", type: "back", name: "Mosaïque de Djerba", wins: 1 },
  { id: "gold", type: "face", name: "Figures dorées", wins: 2 },
  { id: "confident", type: "pose", name: "Le Patron", wins: 3 },
  { id: "aurora", type: "back", name: "Nuit vivante · animé", wins: 5 },
  { id: "azur", type: "skin", name: "Lin azur · broderies argent", wins: 7 },
  { id: "ivory", type: "face", name: "Porcelaine bleue", wins: 10 },
  { id: "zen", type: "pose", name: "Tranquille", wins: 12 },
  { id: "sultan", type: "skin", name: "Tenue prestige ivoire et or", wins: 15 },
  { id: "solar", type: "back", name: "Soleil d’or · animé", wins: 20 },
];
const hash = (token) => createHash("sha256").update(token).digest("hex");
export class Profiles {
  constructor(file = null) {
    this.file = file;
    this.data = {};
    if (file)
      try {
        this.data = JSON.parse(readFileSync(file, "utf8"));
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
  }
  save() {
    if (!this.file) return;
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(this.file + ".tmp", JSON.stringify(this.data), {
      mode: 0o600,
    });
    renameSync(this.file + ".tmp", this.file);
  }
  get(token) {
    return typeof token === "string" && /^[a-f0-9]{64}$/.test(token)
      ? this.data[hash(token)]
      : undefined;
  }
  create() {
    if (Object.keys(this.data).length >= 10000)
      throw new Error("Le registre des profils est complet.");
    const token = randomBytes(32).toString("hex");
    this.data[hash(token)] = {
      wins: 0,
      equipped: {
        back: "classic",
        face: "classic",
        skin: "default",
        pose: "default",
      },
      lastAward: null,
    };
    this.save();
    return { token, ...this.view(token) };
  }
  view(token) {
    const p = this.get(token);
    if (!p) throw new Error("Profil introuvable.");
    return { wins: p.wins, equipped: p.equipped, rewards: REWARDS };
  }
  equip(token, type, id) {
    const p = this.get(token);
    if (!p) throw new Error("Profil introuvable.");
    if (!["back", "face", "skin", "pose"].includes(type))
      throw new Error("Catégorie inconnue.");
    const base =
      id === (type === "back" || type === "face" ? "classic" : "default");
    if (
      !base &&
      !REWARDS.some((r) => r.type === type && r.id === id && r.wins <= p.wins)
    )
      throw new Error("Récompense encore verrouillée.");
    p.equipped[type] = id;
    this.save();
    return this.view(token);
  }
  award(token, gameId) {
    const p = this.get(token);
    if (!p || p.lastAward === gameId) return false;
    p.wins++;
    p.lastAward = gameId;
    this.save();
    return true;
  }
}
