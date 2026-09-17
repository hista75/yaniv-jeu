import {
  check,
  makeDeck,
  shuffle,
  combination,
  pickupIds,
  canBonus,
  scoreRound,
  total,
} from "./rules.js";
export const BONUS_MS = 6000,
  REVEAL_MS = 6500,
  TURN_MS = 90000;
export const emptyPile = () => ({ cards: [], kind: "single" });
export function createGame(code) {
  return {
    code,
    players: [],
    hostId: null,
    phase: "WAITING",
    round: 0,
    revision: 0,
    turnId: null,
    deck: [],
    archive: [],
    previousDiscard: emptyPile(),
    currentPlay: emptyPile(),
    bonusId: null,
    deadline: null,
    result: null,
    winnerId: null,
    chat: [],
    lastEvent: null,
  };
}
export function active(g) {
  return g.players.filter((p) => !p.eliminated);
}
export function emitEvent(g, type, extra = {}) {
  g.lastEvent = {
    seq: (g.lastEvent?.seq || 0) + 1,
    type,
    at: Date.now(),
    ...extra,
  };
}
export function addPlayer(g, info) {
  check(g.phase === "WAITING", "Cette partie a déjà commencé.");
  check(g.players.length < 8, "Salon complet : 8 joueurs maximum.");
  check(!g.players.some((p) => p.id === info.id), "Tu es déjà dans ce salon.");
  const p = { ...info, score: 0, hand: [], eliminated: false, connected: true };
  g.players.push(p);
  g.hostId ??= p.id;
  emitEvent(g, "join", { playerId: p.id });
  return p;
}
export function dealRound(g) {
  const alive = active(g);
  check(
    alive.length >= 2 && alive.length <= 8,
    "Il faut de 2 à 8 joueurs actifs.",
  );
  g.deck = shuffle(makeDeck(alive.length));
  g.archive = [];
  for (const p of g.players) p.hand = p.eliminated ? [] : g.deck.splice(0, 5);
  g.previousDiscard = { cards: [g.deck.pop()], kind: "single" };
  g.currentPlay = emptyPile();
  g.turnId = alive[g.round % alive.length].id;
  g.round++;
  g.phase = "PLAY";
  g.bonusId = null;
  g.result = null;
  g.winnerId = null;
  g.deadline = Date.now() + TURN_MS;
  emitEvent(g, "deal");
}
export function startGame(g, id) {
  check(g.hostId === id, "Seul l’hôte peut lancer.");
  check(g.phase === "WAITING", "La partie est déjà lancée.");
  g.seatCount = g.players.length;
  g.players.forEach((p, i) => (p.seat = i));
  dealRound(g);
}
export function actor(g, id, phase) {
  check(g.phase === phase, "Action impossible pendant cette phase.");
  check(g.turnId === id, "Ce n’est pas ton tour.");
  const p = g.players.find((p) => p.id === id);
  check(p && !p.eliminated, "Joueur inactif.");
  return p;
}
export function play(g, id, ids) {
  const p = actor(g, id, "PLAY");
  check(
    Array.isArray(ids) &&
      ids.length > 0 &&
      ids.length <= p.hand.length &&
      new Set(ids).size === ids.length,
    "Sélection invalide.",
  );
  const chosen = ids.map((cid) => p.hand.find((c) => c.id === cid));
  check(chosen.every(Boolean), "Une carte ne t’appartient pas.");
  const kind = combination(chosen);
  check(
    kind,
    "Pose une carte, des cartes de même rang ou une suite de même enseigne.",
  );
  p.hand = p.hand.filter((c) => !ids.includes(c.id));
  g.currentPlay = { cards: chosen, kind };
  if (kind === "run") g.currentPlay.eligibleIds = pickupIds(g.currentPlay);
  g.phase = "DRAW";
  g.deadline = Date.now() + TURN_MS;
  emitEvent(g, "play", { playerId: id, cards: chosen });
}
export function finishTurn(g) {
  g.archive.push(...g.previousDiscard.cards);
  g.previousDiscard = g.currentPlay;
  g.currentPlay = emptyPile();
  const alive = active(g);
  const i = alive.findIndex((p) => p.id === g.turnId);
  g.turnId = alive[(i + 1) % alive.length]?.id || null;
  g.bonusId = null;
  g.phase = "PLAY";
  g.deadline = Date.now() + TURN_MS;
}
export function draw(g, id, source, cardId) {
  const p = actor(g, id, "DRAW");
  let card;
  check(
    source === "deck" || source === "discard",
    "Source de pioche invalide.",
  );
  if (source === "deck") {
    if (!g.deck.length && g.archive.length) {
      g.deck = shuffle(g.archive);
      g.archive = [];
    }
    // Finite stock: retire the old available pile only when nothing else remains.
    if (!g.deck.length) {
      g.deck = shuffle(g.previousDiscard.cards);
      g.previousDiscard = emptyPile();
    }
    check(
      g.deck.length > 0,
      "Paquet vide : récupère une carte de la défausse.",
    );
    card = g.deck.pop();
  } else {
    check(
      pickupIds(g.previousDiscard).includes(cardId),
      "Seules les extrémités logiques de l’ancienne suite sont récupérables.",
    );
    card = g.previousDiscard.cards.find((c) => c.id === cardId);
    g.previousDiscard.cards = g.previousDiscard.cards.filter(
      (c) => c.id !== cardId,
    );
  }
  p.hand.push(card);
  // Never expose a deck draw, even in animation events.
  emitEvent(g, "draw", {
    playerId: id,
    source,
    ...(source === "discard" ? { card } : {}),
  });
  if (canBonus(g.currentPlay.cards, card)) {
    g.bonusId = card.id;
    g.phase = "BONUS";
    g.deadline = Date.now() + BONUS_MS;
  } else finishTurn(g);
}
export function bonus(g, id, add) {
  const p = actor(g, id, "BONUS");
  check(typeof add === "boolean", "Choix bonus invalide.");
  if (add) {
    const card = p.hand.find((c) => c.id === g.bonusId);
    check(canBonus(g.currentPlay.cards, card), "Bonus invalide.");
    p.hand = p.hand.filter((c) => c.id !== card.id);
    if (g.currentPlay.kind === "run") {
      const ends = pickupIds(g.currentPlay);
      const matchesEnd = g.currentPlay.cards.some(
        (c) => ends.includes(c.id) && c.rank === card.rank,
      );
      g.currentPlay.eligibleIds = matchesEnd ? [...ends, card.id] : ends;
    }
    g.currentPlay.cards.push(card);
    emitEvent(g, "bonus", { playerId: id, cards: [card] });
  }
  finishTurn(g);
}
export function yaniv(g, id) {
  actor(g, id, "PLAY");
  g.result = scoreRound(g.players, id);
  g.phase = "YANIV_REVEAL";
  g.deadline = Date.now() + REVEAL_MS;
  emitEvent(g, "yaniv", { playerId: id, assaf: g.result.assaf });
}
export function settle(g) {
  check(g.phase === "YANIV_REVEAL", "Aucune révélation en cours.");
  for (const row of g.result.rows) {
    const p = g.players.find((p) => p.id === row.id);
    if (p) {
      p.score = row.total;
      p.eliminated = row.eliminated;
    }
  }
  const alive = active(g);
  // Simultaneous elimination: lowest final score wins; fixed seat order breaks ties.
  if (alive.length <= 1) {
    g.winnerId =
      alive[0]?.id || [...g.players].sort((a, b) => a.score - b.score)[0]?.id;
    g.phase = "GAME_END";
    emitEvent(g, "win", { playerId: g.winnerId });
  } else {
    g.phase = "ROUND_END";
    emitEvent(g, g.result.assaf ? "assaf" : "roundEnd");
  }
  g.deadline = null;
}
export function nextRound(g, id) {
  check(g.hostId === id, "Seul l’hôte peut continuer.");
  check(g.phase === "ROUND_END", "La manche n’est pas terminée.");
  dealRound(g);
}
export function removePlayer(g, id) {
  const i = g.players.findIndex((p) => p.id === id);
  if (i < 0) return;
  const old = g.players[i];
  const next = active(g).filter((p) => p.id !== id);
  const wasTurn = g.turnId === id;
  const nextId = g.players
    .slice(i + 1)
    .concat(g.players.slice(0, i))
    .find((p) => !p.eliminated)?.id;
  g.archive.push(...old.hand);
  g.players.splice(i, 1);
  if (g.hostId === id)
    g.hostId =
      g.players.find((p) => p.connected)?.id || g.players[0]?.id || null;
  if (!["WAITING", "GAME_END"].includes(g.phase)) {
    if (next.length <= 1) {
      g.phase = "GAME_END";
      g.winnerId = next[0]?.id || null;
      g.deadline = null;
    } else if (wasTurn && ["PLAY", "DRAW", "BONUS"].includes(g.phase)) {
      if (g.currentPlay.cards.length) {
        g.archive.push(...g.previousDiscard.cards);
        g.previousDiscard = g.currentPlay;
        g.currentPlay = emptyPile();
      }
      g.turnId = nextId;
      g.phase = "PLAY";
      g.bonusId = null;
      g.deadline = Date.now() + TURN_MS;
    }
  }
  emitEvent(g, "leave", { playerId: id });
}
export function tick(g, now = Date.now()) {
  if (!g.deadline || now < g.deadline) return false;
  if (g.phase === "BONUS") bonus(g, g.turnId, false);
  else if (g.phase === "YANIV_REVEAL") settle(g);
  else if (g.phase === "PLAY") {
    const p = g.players.find((p) => p.id === g.turnId);
    if (total(p.hand) <= 7) yaniv(g, p.id);
    else play(g, p.id, [p.hand.at(-1).id]);
  } else if (g.phase === "DRAW") draw(g, g.turnId, "deck");
  return true;
}
export function view(g, id) {
  const me = g.players.find((p) => p.id === id);
  const reveal = ["YANIV_REVEAL", "ROUND_END", "GAME_END"].includes(g.phase);
  return {
    code: g.code,
    me: id,
    hostId: g.hostId,
    revision: g.revision,
    phase: g.phase,
    round: g.round,
    turnId: g.turnId,
    seatCount: g.seatCount || g.players.length,
    players: g.players.map(
      ({
        id,
        name,
        skin,
        pose,
        score,
        hand,
        eliminated,
        connected,
        seat,
        back,
        face,
      }) => ({
        id,
        name,
        skin,
        pose,
        score,
        back,
        face,
        count: hand.length,
        eliminated,
        connected,
        seat,
      }),
    ),
    hand: me?.hand || [],
    previousDiscard: g.previousDiscard,
    currentPlay: g.currentPlay,
    pickupIds: pickupIds(g.previousDiscard),
    deckCount: g.deck.length,
    bonusId: g.turnId === id ? g.bonusId : null,
    deadline: g.deadline,
    result: reveal ? g.result : null,
    winnerId: g.winnerId,
    chat: g.chat,
    lastEvent: g.lastEvent,
  };
}
