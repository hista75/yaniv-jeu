import { randomBytes, createHash, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
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
const derive = promisify(scrypt);
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
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return;
    const key = hash(token),
      session = this.data.__sessions?.[key];
    if (session && session.expires > Date.now())
      return this.data[session.profile];
    const p = this.data[key];
    return p && !p.account ? p : undefined;
  }
  async register(token, username, password) {
    if (typeof username !== "string" || !/^[a-zA-Z0-9_]{3,24}$/.test(username))
      throw new Error("Identifiant : 3 à 24 lettres, chiffres ou underscores.");
    if (
      typeof password !== "string" ||
      password.length < 10 ||
      password.length > 128
    )
      throw new Error("Mot de passe : 10 à 128 caractères.");
    const p = this.get(token),
      name = username.toLowerCase();
    if (!p || p.account)
      throw new Error("Utilise un profil invité pour créer un compte.");
    this.data.__accounts ||= {};
    this.data.__sessions ||= {};
    if (this.data.__accounts[name])
      throw new Error("Cet identifiant est déjà utilisé.");
    const salt = randomBytes(16).toString("hex");
    const digest = (await derive(password, salt, 64)).toString("hex");
    if (this.data.__accounts[name] || p.account)
      throw new Error("Ce compte existe déjà.");
    p.account = { username, salt, digest };
    const key = hash(token);
    this.data.__accounts[name] = key;
    this.data.__sessions[key] = {
      profile: key,
      expires: Date.now() + 30 * 86400000,
    };
    this.save();
    return { token, ...this.view(token) };
  }
  async login(username, password) {
    if (
      typeof username !== "string" ||
      username.length > 24 ||
      typeof password !== "string" ||
      password.length > 128
    )
      throw new Error("Identifiant ou mot de passe incorrect.");
    const key = this.data.__accounts?.[username.toLowerCase()];
    const p = this.data[key],
      account = p?.account;
    const digest = await derive(
      password,
      account?.salt || "unknown-account-salt",
      64,
    );
    if (
      !account ||
      !timingSafeEqual(digest, Buffer.from(account.digest, "hex"))
    )
      throw new Error("Identifiant ou mot de passe incorrect.");
    this.data.__sessions ||= {};
    const sessions = Object.entries(this.data.__sessions);
    for (const [id, s] of sessions)
      if (s.expires <= Date.now()) delete this.data.__sessions[id];
    const own = Object.entries(this.data.__sessions)
      .filter(([, s]) => s.profile === key)
      .sort((a, b) => a[1].expires - b[1].expires);
    while (own.length >= 10) delete this.data.__sessions[own.shift()[0]];
    const token = randomBytes(32).toString("hex");
    this.data.__sessions[hash(token)] = {
      profile: key,
      expires: Date.now() + 30 * 86400000,
    };
    this.save();
    return { token, ...this.view(token) };
  }
  logout(token) {
    if (typeof token === "string") delete this.data.__sessions?.[hash(token)];
    this.save();
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
    return {
      wins: p.wins,
      equipped: p.equipped,
      rewards: REWARDS,
      username: p.account?.username || null,
    };
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
