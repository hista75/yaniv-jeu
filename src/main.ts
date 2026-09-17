import { io } from "socket.io-client";
import { CafeScene } from "./scene";
import { CafeAudio } from "./audio";
import { skinPortraits } from "./avatar";
import { cardTexture, backTexture, setCardTheme } from "./cards";
import { sum, rankValue, type State, type Card } from "./types";
import "./style.css";
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id)! as T;
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const socket = io({ autoConnect: false });
const audio = new CafeAudio();
type Reward = { id: string; type: string; name: string; wins: number };
type Profile = {
  username?: string | null;
  wins: number;
  equipped: Record<string, string>;
  rewards: Reward[];
};
let profile: Profile | null = null;
let profileRequest: Promise<void> | null = null;
async function ensureProfile() {
  if (profileRequest) return profileRequest;
  profileRequest = (async () => {
    const token = localStorage.getItem("yaniv-profile");
    let r = await socket.timeout(6000).emitWithAck("profile", { token });
    if (!r.ok && token) {
      toast(
        "Ancien profil indisponible sur ce serveur : un nouveau profil est créé.",
      );
      r = await socket.timeout(6000).emitWithAck("profile", {});
    }
    if (!r.ok) throw new Error(r.error);
    if (r.token) localStorage.setItem("yaniv-profile", r.token);
    applyProfile(r);
  })()
    .catch((e) => {
      toast(e.message);
    })
    .finally(() => {
      profileRequest = null;
    });
  return profileRequest;
}
function applyProfile(p: Profile) {
  const before = profile?.wins;
  profile = p;
  setCardTheme(p.equipped.face);
  if (before !== undefined && p.wins > before)
    toast(`Victoire ! ${p.wins} victoire(s) — découvre tes récompenses.`);
  renderWardrobe();
}

let scene: CafeScene;
let state: State | null = null,
  selected: string[] = [],
  skin = "jeune",
  pose = "normal",
  busy = false,
  sorted = false,
  lastEvent = 0;
const skinInfo = [
  ["jeune", "Le Jeune", "Sweat rouge, esprit de la terrasse.", "#a63d36", "♜"],
  ["classique", "Le Classique", "Fleurs et chapeau de paille.", "#548575", "♟"],
  ["costaud", "Le Costaud", "Carrure solide, chaîne dorée.", "#bc9b62", "♝"],
  ["nain", "Le Nain", "Petit gabarit, grand joueur.", "#93483e", "♙"],
  ["vieux", "Le Vieux", "Barbe grise, regard malicieux.", "#89857a", "♚"],
  ["bg", "Le BG", "Chemise blanche, détails dorés.", "#d5ceb1", "♞"],
];
function toast(text: string) {
  $("toast").textContent = text;
  $("toast").hidden = false;
  window.setTimeout(() => ($("toast").hidden = true), 4300);
}
try {
  scene = new CafeScene($("scene"));
  scene.onError = toast;
  scene.onReady = () => {
    $("asset-status").textContent = "● LA TERRASSE EST PRÊTE";
    for (const [skin, url] of skinPortraits()) {
      if (skin.startsWith("pose-")) {
        const button = document.querySelector(`[data-pose="${skin.slice(5)}"]`);
        if (button) {
          const img = document.createElement("img");
          img.src = url;
          img.alt = "";
          img.className = "pose-preview";
          button.prepend(img);
        }
        continue;
      }
      const portrait = document.querySelector(
        `[data-skin="${skin}"] .skin-symbol`,
      );
      if (portrait) {
        const image = document.createElement("img");
        image.src = url;
        image.alt = "";
        portrait.replaceChildren(image);
      }
    }
  };
  const q =
    localStorage.getItem("yaniv-quality") ||
    ((navigator.hardwareConcurrency || 4) <= 4 ? "medium" : "high");
  scene.setQuality(q);
  $<HTMLSelectElement>("quality").value = q;
} catch (e) {
  console.error(e);
  $("asset-status").textContent =
    "WebGL indisponible. Active l’accélération graphique de ton navigateur.";
  toast("La scène 3D nécessite WebGL.");
}
$("skins").innerHTML = skinInfo
  .map(
    ([id, name, , color, icon]) =>
      `<button type="button" data-skin="${id}" class="skin ${id === "jeune" ? "chosen" : ""}" style="--skin:${color}" aria-pressed="${id === "jeune"}"><span class="skin-symbol">${icon}</span><span>${name}</span><i>✓</i></button>`,
  )
  .join("");
$("skins").addEventListener("click", (e) => {
  const button = (e.target as HTMLElement).closest<HTMLElement>("[data-skin]");
  if (!button) return;
  skin = button.dataset.skin!;
  document.querySelectorAll<HTMLElement>("[data-skin]").forEach((el) => {
    el.classList.toggle("chosen", el.dataset.skin === skin);
    el.setAttribute("aria-pressed", String(el.dataset.skin === skin));
  });
  $("skin-description").textContent = skinInfo.find((s) => s[0] === skin)![2];
});
$("poses").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-pose]");
  if (!b) return;
  pose = b.dataset.pose!;
  document
    .querySelectorAll<HTMLElement>("[data-pose]")
    .forEach((el) => el.classList.toggle("chosen", el.dataset.pose === pose));
});
$<HTMLInputElement>("nickname").value =
  localStorage.getItem("yaniv-name") || "";
const codeParam = new URLSearchParams(location.search).get("room");
if (codeParam)
  $<HTMLInputElement>("room-code").value = codeParam.slice(0, 4).toUpperCase();
async function send(event: string, data: Record<string, unknown> = {}) {
  if (busy) return null;
  if (!socket.connected) {
    toast("Connexion perdue. Reconnexion en cours…");
    return null;
  }
  busy = true;
  try {
    const res = await socket
      .timeout(6000)
      .emitWithAck(event, { ...data, revision: state?.revision });
    if (!res.ok) {
      toast(res.error);
      return null;
    }
    return res;
  } catch {
    toast("Le serveur ne répond pas. Vérifie ta connexion.");
    return null;
  } finally {
    busy = false;
    if (state) renderControls();
  }
}
async function enter(create: boolean) {
  const name = $<HTMLInputElement>("nickname").value.trim();
  if (!name) {
    $<HTMLInputElement>("nickname").reportValidity();
    return;
  }
  await ensureProfile();
  await audio.start();
  localStorage.setItem("yaniv-name", name);
  const result = await send("enter", {
    create,
    profileToken: localStorage.getItem("yaniv-profile"),
    name,
    skin,
    pose,
    code: $<HTMLInputElement>("room-code").value.trim().toUpperCase(),
  });
  if (result) {
    sessionStorage.setItem("yaniv-session", result.token);
    history.replaceState({}, "", `?room=${result.code}`);
  }
}
$("entry-form").addEventListener("submit", (e) => {
  e.preventDefault();
  enter(true);
});
$("join").onclick = () => enter(false);
socket.on("profile", applyProfile);
socket.on("connect", async () => {
  await ensureProfile();
  $("connection").textContent = "EN LIGNE";
  $("connection").classList.add("online");
  const token = sessionStorage.getItem("yaniv-session");
  if (token) {
    try {
      const r = await socket.timeout(6000).emitWithAck("resume", { token });
      if (!r.ok) {
        sessionStorage.removeItem("yaniv-session");
        reset();
        toast("Ta place a expiré. Tu peux rejoindre une nouvelle table.");
      }
    } catch {
      toast("Reconnexion impossible pour le moment.");
    }
  }
});
socket.on("disconnect", () => {
  $("connection").textContent = "RECONNEXION…";
  $("connection").classList.remove("online");
  renderControls();
});
socket.on("connect_error", () => {
  $("connection").textContent = "HORS LIGNE";
});
socket.on("state", (next: State) => {
  state = next;
  selected = selected.filter((id) => next.hand.some((c) => c.id === id));
  $("menu").hidden = true;
  $("game-ui").hidden = false;
  $("leave-btn").hidden = false;
  document.body.classList.add("playing");
  scene?.update(next);
  if (next.lastEvent && next.lastEvent.seq > lastEvent) {
    lastEvent = next.lastEvent.seq;
    audio.event(next.lastEvent.type);
  }
  render();
});
socket.on("notice", toast);
socket.on("emote", ({ playerId, emoji }) => {
  scene?.emote(playerId, emoji);
  if (playerId === state?.me) toast(emoji);
});
socket.connect();
function reset() {
  state = null;
  selected = [];
  lastEvent = 0;
  $("menu").hidden = false;
  $("game-ui").hidden = true;
  $("leave-btn").hidden = true;
  document.body.classList.remove("playing");
  $("room-info").textContent = "DJERBA, TUNISIE / LA TERRASSE";
  history.replaceState({}, "", "/");
  if (scene) {
    scene.update(
      {
        code: "",
        me: "",
        hostId: "",
        revision: 0,
        phase: "WAITING",
        round: 0,
        turnId: "",
        players: [],
        hand: [],
        previousDiscard: { cards: [], kind: "single" },
        currentPlay: { cards: [], kind: "single" },
        pickupIds: [],
        deckCount: 0,
        bonusId: null,
        deadline: null,
        result: null,
        winnerId: null,
        chat: [],
        lastEvent: null,
      },
      true,
    );
  }
}
$("leave-btn").onclick = async () => {
  const result = await send("leave");
  if (result) {
    sessionStorage.removeItem("yaniv-session");
    reset();
  }
};
async function copy() {
  if (!state) return;
  try {
    await navigator.clipboard.writeText(state.code);
    toast(`Code ${state.code} copié !`);
  } catch {
    toast(`Code du salon : ${state.code} — sélectionne-le pour le copier.`);
  }
}
$("copy-lobby").onclick = copy;
$("start").onclick = () => send("start");
$("play").onclick = async () => {
  if (await send("play", { ids: selected })) {
    selected = [];
    scene?.select([]);
    render();
  }
};
$("draw-deck").onclick = () => send("draw", { source: "deck" });
$("bonus-add").onclick = () => send("bonus", { add: true });
$("bonus-keep").onclick = () => send("bonus", { add: false });
$("yaniv").onclick = () => send("yaniv");
$("sort").onclick = () => {
  sorted = !sorted;
  renderHand();
};
$("clear-selection").onclick = () => {
  selected = [];
  scene?.select([]);
  renderHand();
  renderControls();
};
function cardButton(c: Card, small = false) {
  const b = document.createElement("button");
  b.className = small ? "small-card" : "playing-card";
  b.dataset.cardId = c.id;
  b.setAttribute(
    "aria-label",
    c.rank === "JOKER" ? "Joker" : `${c.rank} ${c.suit}`,
  );
  const img = document.createElement("img");
  img.src = (cardTexture(c).image as HTMLCanvasElement).toDataURL();
  img.alt = "";
  img.draggable = false;
  b.append(img);
  return b;
}
function renderHand() {
  if (!state) return;
  const cards = [...state.hand];
  if (sorted)
    cards.sort(
      (a, b) => rankValue(a) - rankValue(b) || a.suit.localeCompare(b.suit),
    );
  $("hand").replaceChildren();
  cards.forEach((c, i) => {
    const b = cardButton(c);
    b.classList.toggle("selected", selected.includes(c.id));
    b.setAttribute("aria-pressed", String(selected.includes(c.id)));
    b.style.setProperty("--rotation", `${(i - (cards.length - 1) / 2) * 3}deg`);
    b.style.setProperty(
      "--lift",
      `${Math.abs(i - (cards.length - 1) / 2) * 3}px`,
    );
    if (selected.includes(c.id)) {
      const badge = document.createElement("span");
      badge.className = "selection-number";
      badge.textContent = String(selected.indexOf(c.id) + 1);
      b.append(badge);
    }
    b.onclick = () => {
      if (!state || state.phase !== "PLAY" || state.turnId !== state.me) return;
      selected = selected.includes(c.id)
        ? selected.filter((id) => id !== c.id)
        : [...selected, c.id];
      scene?.select(selected);
      renderHand();
      renderControls();
    };
    $("hand").append(b);
  });
  $("hand-total").textContent = `${sum(state.hand)} pts`;
  $("selection-order").textContent = selected.length
    ? `Ordre de pose : ${selected
        .map((id) => {
          const c = state!.hand.find((c) => c.id === id)!;
          return c.rank === "JOKER" ? "Joker" : c.rank + c.suit;
        })
        .join(" → ")}`
    : "";
}
function renderControls() {
  if (!state) return;
  const mine = state.turnId === state.me,
    enabled = socket.connected && !busy,
    playable = mine && state.phase === "PLAY" && enabled;
  for (const [id, allow] of [
    ["play", playable && selected.length > 0],
    ["yaniv", playable && sum(state.hand) <= 7],
    ["draw-deck", mine && state.phase === "DRAW" && enabled],
    [
      "start",
      state.hostId === state.me &&
        state.players.length >= 2 &&
        state.players.every((p) => p.connected) &&
        enabled,
    ],
    ["bonus-add", mine && state.phase === "BONUS" && enabled],
    ["bonus-keep", mine && state.phase === "BONUS" && enabled],
  ] as [string, boolean][]) {
    $<HTMLButtonElement>(id).disabled = !allow;
  }
  const current = state.players.find((p) => p.id === state!.turnId);
  const title =
    state.phase === "WAITING"
      ? "Installez-vous, la partie va commencer."
      : state.phase === "PLAY"
        ? mine
          ? "À toi de jouer. Pose tes cartes."
          : `${current?.name || "Le joueur actif"} réfléchit…`
        : state.phase === "DRAW"
          ? mine
            ? "À toi de piocher. Paquet ou ancienne défausse ?"
            : `${current?.name} choisit sa pioche…`
          : state.phase === "BONUS"
            ? mine
              ? "Un petit bonus ? À toi de choisir."
              : `${current?.name} peut rajouter sa carte…`
            : state.phase === "YANIV_REVEAL"
              ? "YANIV ! On pose les cartes sur la table."
              : state.phase === "ROUND_END"
                ? "Les comptes sont faits."
                : "La partie est terminée.";
  $("turn-banner").textContent = title;
  $("turn-banner").classList.toggle("my-turn", mine);
  $("selection-hint").textContent = playable
    ? "Clique les cartes dans l’ordre de pose"
    : mine && state.phase === "DRAW"
      ? "Ta pose est faite : choisis ta pioche."
      : "Observe la table, ton tour arrive.";
}
function render() {
  if (!state) return;
  $("room-info").innerHTML =
    `<span class="dot"></span> SALON <button class="code-top" id="copy-top">${state.code} ⧉</button><span class="sep">/</span>${state.players.length} JOUEURS${state.round ? `<span class="sep">/</span>MANCHE ${state.round}` : ""}`;
  $("copy-top").onclick = copy;
  $("lobby").hidden = state.phase !== "WAITING";
  $("copy-lobby").textContent = state.code + " ⧉";
  $("lobby-members").innerHTML = state.players
    .map(
      (p) =>
        `<span class="member"><i style="background:${skinInfo.find((s) => s[0] === p.skin)?.[3]}"></i>${escape(p.name)}${p.id === state!.hostId ? " <small>HÔTE</small>" : ""}</span>`,
    )
    .join("");
  $("lobby-hint").textContent =
    state.players.length < 2
      ? "Il faut au moins 2 joueurs pour lancer."
      : state.hostId === state.me
        ? "Tout le monde est prêt ?"
        : "L’hôte lancera la partie.";
  $("roster").innerHTML = state.players
    .map(
      (p) =>
        `<div class="roster-player ${p.id === state!.turnId ? "active" : ""} ${p.eliminated ? "eliminated" : ""}"><i style="background:${skinInfo.find((s) => s[0] === p.skin)?.[3]}"></i><span>${escape(p.name)}${p.id === state!.me ? " <small>TOI</small>" : ""}<small>${p.eliminated ? "Éliminé" : `${p.count} cartes${p.connected ? "" : " · absent"}`}</small></span><strong>${p.score}<small>PTS</small></strong></div>`,
    )
    .join("");
  const inRound = ["PLAY", "DRAW", "BONUS"].includes(state.phase);
  $("hand-panel").hidden =
    !inRound || !!state.players.find((p) => p.id === state!.me)?.eliminated;
  $("table-actions").hidden = !inRound;
  $("bonus-panel").hidden =
    state.phase !== "BONUS" || state.turnId !== state.me;
  $("deck-count").textContent = `${state.deckCount} cartes`;
  $("discard-label").textContent =
    state.phase === "DRAW"
      ? "ANCIENNE DÉFAUSSE · RÉCUPÉRABLE"
      : "DERNIÈRE POSE";
  $("discard-cards").replaceChildren();
  state.previousDiscard.cards.forEach((c) => {
    const b = cardButton(c, true);
    const allowed = state!.pickupIds.includes(c.id);
    b.classList.toggle("pickup", allowed);
    b.disabled =
      state!.phase !== "DRAW" ||
      state!.turnId !== state!.me ||
      !allowed ||
      !socket.connected;
    b.title = allowed
      ? "Récupérer cette carte"
      : "Milieu de suite : non récupérable";
    b.onclick = () => send("draw", { source: "discard", cardId: c.id });
    $("discard-cards").append(b);
  });
  renderHand();
  renderControls();
  renderResult();
  const messages = $("chat-messages");
  messages.innerHTML = state.chat
    .map(
      (m) => `<div><strong>${escape(m.name)}</strong> ${escape(m.text)}</div>`,
    )
    .join("");
  messages.scrollTop = messages.scrollHeight;
}
function renderResult() {
  if (!state) return;
  const s = state,
    r = s.result;
  const show = ["YANIV_REVEAL", "ROUND_END", "GAME_END"].includes(s.phase);
  $("result").hidden = !show;
  $("result").classList.toggle("revealing", s.phase === "YANIV_REVEAL");
  if (!show) return;
  const winner = s.players.find((p) => p.id === s.winnerId);
  const title =
    s.phase === "GAME_END"
      ? `${escape(winner?.name || "La table")} remporte la partie !`
      : r?.assaf
        ? "💥 ASSAF !"
        : "YANIV !";
  $("result").classList.toggle("assaf", !!r?.assaf);
  $("result").innerHTML =
    `<div class="eyebrow">${s.phase === "GAME_END" ? "LE DERNIER SURVIVANT" : `MANCHE ${s.round} · LES MAINS SONT RÉVÉLÉES`}</div><h2>${title}</h2>${r ? `<p>${escape(s.players.find((p) => p.id === r.callerId)?.name || "Le joueur")} annonce ${r.callerTotal} points.${r.assaf ? " Une main inférieure ou égale : main avec Jokers à 10, puis +30 de pénalité." : " Yaniv réussi : zéro point !"}</p><div class="score-rows">${r.rows.map((row) => `<div class="score-row"><strong>${escape(row.name)}</strong><span>${row.hand.map((c) => (c.rank === "JOKER" ? "Joker" : c.rank + c.suit)).join(" + ")} <b>= ${row.comparison}</b></span><em>+${row.points}${row.reduction ? `<small>Palier exact : ${row.subtotal} → ${row.total}</small>` : ""}</em><strong>${row.total}<small>${row.eliminated ? "ÉLIMINÉ" : "TOTAL"}</small></strong></div>`).join("")}</div>` : ""}${s.phase === "YANIV_REVEAL" ? '<p class="muted">Les cartes se posent…</p>' : s.phase === "ROUND_END" ? `<button id="next-round" class="primary" ${s.hostId !== s.me ? "disabled" : ""}>Manche suivante →</button>${s.hostId !== s.me ? "<small>L’hôte lance la prochaine manche.</small>" : ""}` : '<p class="final-star">✦ ♠ ✦</p><button id="back-menu" class="primary">Retour à l’accueil</button>'}`;
  if (r && (r.assaf ? r.assafIds.includes(s.me) : r.callerId === s.me)) {
    const button = document.createElement("button");
    const target = r.assaf
      ? r.rows.find((row) => row.id === r.callerId)
      : [...r.rows]
          .filter((row) => row.id !== r.callerId)
          .sort((a, b) => b.points - a.points)[0];
    button.textContent = `😏 Chambrer ${target?.name || "la plus grosse main"}`;
    button.className = "secondary";
    button.onclick = () => $<HTMLDialogElement>("taunt-dialog").showModal();
    $("result").append(button);
  }
  const next = document.getElementById("next-round");
  if (next) next.onclick = () => send("next");
  const back = document.getElementById("back-menu");
  if (back) back.onclick = () => $("leave-btn").click();
}
$("emotes").innerHTML = ["👋", "😂", "👍", "😮", "😴", "🔥", "☕"]
  .map((e) => `<button data-emote="${e}" title="Envoyer ${e}">${e}</button>`)
  .join("");
$("emotes").onclick = (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-emote]");
  if (b) send("emote", { emoji: b.dataset.emote });
};
$("chat-form").onsubmit = (e) => {
  e.preventDefault();
  const input = $<HTMLInputElement>("chat-input");
  if (input.value.trim()) {
    send("chat", { text: input.value });
    input.value = "";
  }
};
$("chat-toggle").onclick = () => $("chat").classList.toggle("collapsed");
for (const [button, dialog] of [
  ["rules-btn", "rules-dialog"],
  ["settings-btn", "settings-dialog"],
])
  $(button).onclick = () => {
    $<HTMLDialogElement>(dialog).showModal();
    audio.start();
  };
document
  .querySelectorAll<HTMLButtonElement>(".close-dialog")
  .forEach((b) => (b.onclick = () => b.closest("dialog")!.close()));
document.querySelectorAll("dialog").forEach((d) =>
  d.addEventListener("click", (e) => {
    if (e.target === d) {
      const r = d.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        d.close();
    }
  }),
);
const volumeLabels: Record<string, string> = {
  master: "Volume général",
  cafe: "Ambiance café",
  street: "Rue",
  birds: "Oiseaux",
  cards: "Cartes",
  announcements: "Effets Yaniv / Assaf",
  taunts: "Voix IA des vannes",
};
$("volume-settings").innerHTML = Object.entries(volumeLabels)
  .map(
    ([id, label]) =>
      `<label class="setting-row">${label}<input type="range" min="0" max="1" step="0.01" data-volume="${id}" value="${audio.volumes[id]}" aria-label="${label}"></label>`,
  )
  .join("");
document
  .querySelectorAll<HTMLInputElement>("[data-volume]")
  .forEach(
    (input) =>
      (input.oninput = () =>
        audio.set(input.dataset.volume!, Number(input.value))),
  );
$("quality").onchange = () => {
  const q = $<HTMLSelectElement>("quality").value;
  localStorage.setItem("yaniv-quality", q);
  scene?.setQuality(q);
};
setInterval(() => {
  if (state?.phase === "BONUS" && state.deadline)
    $("bonus-timer").textContent =
      `${Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000))} s avant de garder automatiquement`;
}, 200);

$<HTMLSelectElement>("time-of-day").value =
  localStorage.getItem("yaniv-time") || "day";
$("time-of-day").onchange = () => {
  const mode = $<HTMLSelectElement>("time-of-day").value;
  localStorage.setItem("yaniv-time", mode);
  scene.setTimeOfDay(mode);
};

// Optional AI writes a draft only; the player explicitly sends the edited message.
document.body.insertAdjacentHTML(
  "beforeend",
  `
<dialog id="wardrobe-dialog"><button class="close-dialog" id="close-wardrobe" aria-label="Fermer le vestiaire">×</button><div class="eyebrow">LES HABITUÉS DU CAFÉ</div><h2>Ton vestiaire.</h2><p id="wins-count"></p><p class="muted">Les victoires de parties complètes débloquent les récompenses. Équipe-les avant de rejoindre une table.</p><div id="rewards-grid"></div><p class="muted">Crée un compte avec le bouton Compte pour retrouver tes récompenses sur un autre appareil.</p></dialog>
<dialog id="taunt-dialog"><button class="close-dialog" id="close-taunt" aria-label="Fermer la vanne">×</button><div class="eyebrow">BIEN ESSAYÉ !</div><h2>La vanne de la manche.</h2><label>Une idée pour l’IA ?<input id="taunt-idea" maxlength="120" placeholder="Ex. son bluff, le café, les +30…"></label><button id="generate-taunt" class="secondary">Proposer une vanne avec l’IA</button><p id="taunt-status" role="status"></p><label>Ton message, modifiable<textarea id="taunt-draft" maxlength="180" rows="3" placeholder="Écris ta vanne ici…"></textarea></label><label><input type="checkbox" id="taunt-voice" checked> Lire à la table avec une voix générée par IA</label><button id="send-taunt" class="primary">Envoyer à la table</button></dialog>`,
);
const wardrobeButton = document.createElement("button");
wardrobeButton.id = "wardrobe-button";
wardrobeButton.className = "icon-btn";
wardrobeButton.textContent = "✦ Vestiaire";
$("settings-btn").after(wardrobeButton);
wardrobeButton.onclick = () => {
  renderWardrobe();
  $<HTMLDialogElement>("wardrobe-dialog").showModal();
};
$("close-wardrobe").onclick = () =>
  $<HTMLDialogElement>("wardrobe-dialog").close();
$("close-taunt").onclick = () => $<HTMLDialogElement>("taunt-dialog").close();
function renderWardrobe() {
  if (!document.getElementById("rewards-grid")) return;
  $("wins-count").textContent = profile
    ? `${profile.wins} victoire${profile.wins > 1 ? "s" : ""}`
    : "Connexion au profil…";
  if (!profile) return;
  const defaults = [
    { id: "classic", type: "face", name: "Figures classiques", wins: 0 },
    { id: "default", type: "skin", name: "Skin choisi au menu", wins: 0 },
    { id: "default", type: "pose", name: "Pose choisie au menu", wins: 0 },
  ];
  $("rewards-grid").replaceChildren();
  for (const r of [...defaults, ...profile.rewards]) {
    const b = document.createElement("button");
    b.className = "reward";
    const unlocked = profile.wins >= r.wins,
      equipped = profile.equipped[r.type] === r.id;
    b.disabled = !unlocked || !!state;
    b.classList.toggle("equipped", equipped);
    if (r.type === "back" || r.type === "face") {
      const img = document.createElement("img");
      img.alt = "";
      const tex =
        r.type === "back"
          ? backTexture(r.id)
          : cardTexture({ id: "preview", rank: "R", suit: "♥", pack: 0 }, r.id);
      img.src = (tex.image as HTMLCanvasElement).toDataURL();
      b.append(img);
      if (["aurora", "solar"].includes(r.id))
        b.classList.add("animated-reward");
    }
    const label = document.createElement("strong");
    label.textContent = r.name;
    const detail = document.createElement("small");
    detail.textContent = equipped
      ? "✓ Équipé"
      : unlocked
        ? "Équiper"
        : `🔒 ${r.wins} victoires`;
    b.append(label, detail);
    $("rewards-grid").append(b);
    b.onclick = async () => {
      b.disabled = true;
      try {
        const res = await socket.timeout(6000).emitWithAck("equip", {
          token: localStorage.getItem("yaniv-profile"),
          type: r.type,
          id: r.id,
        });
        if (!res.ok) throw new Error(res.error);
        applyProfile(res);
      } catch (e) {
        toast((e as Error).message);
        renderWardrobe();
      }
    };
  }
}
$("generate-taunt").onclick = async () => {
  const button = $<HTMLButtonElement>("generate-taunt");
  button.disabled = true;
  $("taunt-status").textContent = "La vanne se prépare…";
  try {
    const r = await socket
      .timeout(16000)
      .emitWithAck("taunt", { idea: $<HTMLInputElement>("taunt-idea").value });
    if (!r.ok) throw new Error(r.error);
    $<HTMLTextAreaElement>("taunt-draft").value = r.text;
    $("taunt-status").textContent =
      "Proposition IA : relis, modifie et envoie si elle te plaît.";
  } catch (e) {
    $("taunt-status").textContent = (e as Error).message;
  } finally {
    button.disabled = false;
  }
};
$("send-taunt").onclick = async () => {
  const text = $<HTMLTextAreaElement>("taunt-draft").value.trim();
  if (!text) return;
  const button = $<HTMLButtonElement>("send-taunt");
  button.disabled = true;
  $("taunt-status").textContent = "Envoi de la vanne…";
  let result = false;
  try {
    const response = await socket
      .timeout(25000)
      .emitWithAck("taunt-send", {
        text,
        voice: $<HTMLInputElement>("taunt-voice").checked,
      });
    if (!response.ok) throw new Error(response.error);
    result = true;
  } catch (e) {
    $("taunt-status").textContent = (e as Error).message;
  } finally {
    button.disabled = false;
  }
  if (result) {
    $<HTMLDialogElement>("taunt-dialog").close();
    $<HTMLTextAreaElement>("taunt-draft").value = "";
  }
};

socket.on("taunt-voice", ({ text, audio: clip, targetName, round }) => {
  if (!state || state.round !== round) return;
  toast(`À ${targetName} : ${text}`);
  if (clip) audio.playTaunt(clip);
});
document.body.insertAdjacentHTML(
  "beforeend",
  `<dialog id="account-dialog"><button id="close-account" class="close-dialog" aria-label="Fermer">×</button><h2>Ton compte café.</h2><p id="account-status" role="status"></p><form id="account-form"><label>Identifiant<input id="account-name" autocomplete="username" minlength="3" maxlength="24" required pattern="[a-zA-Z0-9_]{3,24}"></label><label>Mot de passe<input id="account-password" type="password" autocomplete="current-password" minlength="10" maxlength="128" required></label><button type="submit" class="primary">Se connecter</button><button type="button" id="register-account">Créer mon compte et garder mes victoires</button></form><button id="logout-account">Se déconnecter</button><p class="muted">Conserve ton mot de passe : la récupération par e-mail n’est pas disponible. Un compte retrouve sa progression sur le même serveur, sur tous tes appareils.</p></dialog>`,
);
const accountButton = document.createElement("button");
accountButton.className = "icon-btn";
accountButton.textContent = "Compte";
$("wardrobe-button").after(accountButton);
accountButton.onclick = () => {
  $("account-status").textContent = profile?.username
    ? `Connecté : ${profile.username} · ${profile.wins} victoire(s)`
    : "Invité : crée un compte pour conserver ta progression.";
  $("account-form").hidden = !!profile?.username;
  $("logout-account").hidden = !profile?.username;
  $<HTMLDialogElement>("account-dialog").showModal();
};
$("close-account").onclick = () =>
  $<HTMLDialogElement>("account-dialog").close();
let accountPending = false;
async function accountAction(mode: string) {
  if (accountPending) return;
  if (state) {
    $("account-status").textContent =
      "Quitte la table avant de changer de compte.";
    return;
  }
  if (mode !== "logout" && !$<HTMLFormElement>("account-form").reportValidity())
    return;
  accountPending = true;
  $("account-status").textContent = "Connexion au café…";
  try {
    await ensureProfile();
    const r = await socket
      .timeout(10000)
      .emitWithAck(mode, {
        token: localStorage.getItem("yaniv-profile"),
        username: $<HTMLInputElement>("account-name").value,
        password: $<HTMLInputElement>("account-password").value,
      });
    if (!r.ok) throw new Error(r.error);
    localStorage.setItem("yaniv-profile", r.token);
    applyProfile(r);
    $<HTMLInputElement>("account-password").value = "";
    $("account-form").hidden = !!r.username;
    $("logout-account").hidden = !r.username;
    $("account-status").textContent = r.username
      ? `Connecté : ${r.username} · ${r.wins} victoire(s)`
      : "Déconnecté. Tu joues maintenant en invité.";
  } catch (e) {
    $("account-status").textContent = (e as Error).message;
  } finally {
    accountPending = false;
  }
}
$("account-form").onsubmit = (e) => {
  e.preventDefault();
  void accountAction("login");
};
$("register-account").onclick = () => void accountAction("register");
$("logout-account").onclick = () => void accountAction("logout");
