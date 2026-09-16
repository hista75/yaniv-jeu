import { randomInt, randomUUID } from "node:crypto";

export const SUITS = ["♠", "♥", "♦", "♣"];
export const RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "V",
  "D",
  "R",
];
export function check(condition, message) {
  if (!condition) throw new Error(message);
}
export function value(card, jokerTen = false) {
  return card.rank === "JOKER"
    ? jokerTen
      ? 10
      : 0
    : Math.min(RANKS.indexOf(card.rank) + 1, 10);
}
export function total(hand, jokerTen = false) {
  return hand.reduce((n, c) => n + value(c, jokerTen), 0);
}
export function shuffle(cards) {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function makeDeck(players) {
  check(
    Number.isInteger(players) && players >= 2 && players <= 8,
    "Il faut de 2 à 8 joueurs.",
  );
  const cards = [];
  for (let pack = 0; pack < (players >= 6 ? 2 : 1); pack++) {
    for (const suit of SUITS)
      for (const rank of RANKS)
        cards.push({ id: randomUUID(), rank, suit, pack });
    for (let j = 0; j < 2; j++)
      cards.push({ id: randomUUID(), rank: "JOKER", suit: "✦", pack });
  }
  return cards;
}
export function combination(cards) {
  if (!cards.length || new Set(cards.map((c) => c.id)).size !== cards.length)
    return null;
  if (cards.length === 1) return "single";
  if (cards.every((c) => c.rank === cards[0].rank)) return "set";
  if (cards.length < 3 || cards.length > 13) return null;
  const real = cards.filter((c) => c.rank !== "JOKER");
  if (!real.length || real.some((c) => c.suit !== real[0].suit)) return null;
  const ranks = real.map((c) => RANKS.indexOf(c.rank));
  if (ranks.some((r) => r < 0) || new Set(ranks).size !== ranks.length)
    return null;
  // Validate the ranks independently of display order.
  for (let start = 0; start < 13; start++) {
    const window = Array.from(
      { length: cards.length },
      (_, i) => (start + i) % 13,
    );
    if (ranks.every((r) => window.includes(r))) return "run";
  }
  return null;
}
export function pickupIds(pile) {
  if (!pile.cards.length) return [];
  if (pile.kind !== "run") return pile.cards.map((c) => c.id);
  if (pile.eligibleIds) return [...pile.eligibleIds];
  const real = pile.cards.filter((c) => c.rank !== "JOKER");
  const jokers = pile.cards
    .filter((c) => c.rank === "JOKER")
    .sort((a, b) => a.id.localeCompare(b.id));
  const candidates = [];
  for (let start = 0; start < 13; start++) {
    const ranks = Array.from(
      { length: pile.cards.length },
      (_, i) => RANKS[(start + i) % 13],
    );
    if (!real.every((c) => ranks.includes(c.rank))) continue;
    let joker = 0;
    const ordered = ranks.map(
      (rank) => real.find((c) => c.rank === rank) || jokers[joker++],
    );
    if (ordered.some((c) => !c)) continue;
    const ends = [ordered[0], ordered.at(-1)];
    candidates.push({
      ends,
      cost: ends.filter((c) => c.rank === "JOKER").length,
      start,
    });
  }
  // Prefer internal wildcards, then lowest start A..R for ambiguous runs.
  candidates.sort((a, b) => a.cost - b.cost || a.start - b.start);
  return candidates[0]?.ends.map((c) => c.id) || [];
}
export function canBonus(played, drawn) {
  return !!drawn && played.some((c) => c.rank === drawn.rank);
}
export function scoreRound(players, callerId) {
  const active = players.filter((p) => !p.eliminated);
  const caller = active.find((p) => p.id === callerId);
  check(
    caller && total(caller.hand) <= 7,
    "Yaniv demande une main de 7 points ou moins.",
  );
  const callerTotal = total(caller.hand);
  const assafIds = active
    .filter((p) => p.id !== callerId && total(p.hand) <= callerTotal)
    .map((p) => p.id);
  const assaf = assafIds.length > 0;
  return {
    callerId,
    callerTotal,
    assaf,
    assafIds,
    rows: active.map((p) => {
      const comparison = total(p.hand);
      const points =
        p.id === callerId
          ? assaf
            ? comparison + 30
            : 0
          : total(p.hand, !assaf);
      const subtotal = p.score + points;
      // Apply one exact landing reduction, never cascade 100 -> 50 -> 0.
      const finalTotal = subtotal === 50 ? 0 : subtotal === 100 ? 50 : subtotal;
      return {
        id: p.id,
        name: p.name,
        hand: [...p.hand],
        comparison,
        points,
        subtotal,
        reduction: subtotal - finalTotal,
        total: finalTotal,
        eliminated: finalTotal >= 200,
      };
    }),
  };
}
