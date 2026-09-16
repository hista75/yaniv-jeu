import test from "node:test";
import assert from "node:assert/strict";
import {
  makeDeck,
  combination,
  pickupIds,
  total,
  scoreRound,
  canBonus,
} from "../server/rules.js";
import {
  createGame,
  addPlayer,
  startGame,
  play,
  draw,
  bonus,
  yaniv,
  settle,
  nextRound,
  removePlayer,
  tick,
  view,
} from "../server/game.js";
let serial = 0;
const c = (rank, suit = "♠") => ({
  id: `fixture-card-${++serial}`,
  rank,
  suit,
  pack: 0,
});
const p = (id, hand, score = 0) => ({
  id,
  name: id,
  hand,
  score,
  eliminated: false,
});
function game(n = 2) {
  const g = createGame("TEST");
  for (let i = 0; i < n; i++)
    addPlayer(g, {
      id: String(i),
      name: "Joueur " + i,
      skin: "jeune",
      pose: "normal",
    });
  startGame(g, "0");
  return g;
}
function setup(hand) {
  const g = game();
  g.players[0].hand = hand;
  return g;
}
test("54 cartes uniques, deux Jokers", () => {
  const d = makeDeck(2);
  assert.equal(d.length, 54);
  assert.equal(new Set(d.map((c) => c.id)).size, 54);
  assert.equal(d.filter((c) => c.rank === "JOKER").length, 2);
});
test("108 cartes dès six joueurs", () => {
  assert.equal(makeDeck(5).length, 54);
  assert.equal(makeDeck(6).length, 108);
  assert.equal(makeDeck(8).length, 108);
});
test("exactement cinq cartes et une défausse de départ pour 2 à 8", () => {
  for (let n = 2; n <= 8; n++) {
    const g = game(n);
    assert.ok(g.players.every((p) => p.hand.length === 5));
    assert.equal(g.previousDiscard.cards.length, 1);
    assert.equal(g.deck.length, (n >= 6 ? 108 : 54) - n * 5 - 1);
  }
});
test("carte seule", () => assert.equal(combination([c("R")]), "single"));
test("même rang, pas simplement même score de figure", () => {
  assert.equal(combination([c("D"), c("D", "♥")]), "set");
  assert.equal(combination([c("V"), c("R")]), null);
});
test("suite minimum trois", () =>
  assert.equal(combination([c("2"), c("3")]), null));
test("suite sans Joker", () =>
  assert.equal(combination([c("5"), c("6"), c("7")]), "run"));
test("suite avec Joker", () =>
  assert.equal(
    combination([c("5", "♥"), c("6", "♥"), c("JOKER"), c("8", "♥")]),
    "run",
  ));
test("suite Roi vers As", () =>
  assert.equal(combination([c("V"), c("D"), c("JOKER"), c("A")]), "run"));
test("suite interdit mélanges et rangs doublés", () => {
  assert.equal(combination([c("2"), c("3", "♥"), c("4")]), null);
  assert.equal(combination([c("2"), c("2"), c("3")]), null);
});
test("ordre visuel préservé, extrémités logiques seulement", () => {
  const cards = [c("4"), c("2"), c("3")];
  const g = setup(cards);
  play(
    g,
    "0",
    cards.map((c) => c.id),
  );
  assert.deepEqual(g.currentPlay.cards, cards);
  assert.deepEqual(pickupIds(g.currentPlay), [cards[1].id, cards[0].id]);
});
test("toutes cartes du groupe récupérables", () => {
  const cards = [c("7"), c("7", "♥"), c("7", "♦")];
  assert.deepEqual(
    pickupIds({ cards, kind: "set" }),
    cards.map((c) => c.id),
  );
});
test("impossible récupérer milieu ou sa propre pose", () => {
  const cards = [c("4"), c("2"), c("3")];
  const card = c("9");
  const g = setup([card]);
  g.previousDiscard = { cards, kind: "run" };
  play(g, "0", [card.id]);
  assert.throws(() => draw(g, "0", "discard", cards[2].id));
  assert.throws(() => draw(g, "0", "discard", card.id));
  draw(g, "0", "discard", cards[0].id);
  assert.equal(g.players[0].hand[0].id, cards[0].id);
  assert.equal(g.previousDiscard.cards[0].id, card.id);
});
test("pioche seulement après pose, une seule fois", () => {
  const card = c("9");
  const g = setup([card]);
  assert.throws(() => draw(g, "0", "deck"));
  play(g, "0", [card.id]);
  g.deck = [c("2")];
  draw(g, "0", "deck");
  assert.throws(() => draw(g, "0", "deck"));
  assert.equal(g.turnId, "1");
});
test("bonus même rang après pioche et ajout", () => {
  const g = setup([c("7")]);
  g.deck = [c("7", "♦")];
  play(
    g,
    "0",
    g.players[0].hand.map((c) => c.id),
  );
  draw(g, "0", "deck");
  assert.equal(g.phase, "BONUS");
  bonus(g, "0", true);
  assert.equal(g.players[0].hand.length, 0);
  assert.equal(g.previousDiscard.cards.length, 2);
  assert.equal(g.turnId, "1");
});
test("bonus marche pour tout rang posé dans une suite", () => {
  assert.equal(canBonus([c("5"), c("6"), c("7")], c("6", "♦")), true);
  assert.equal(canBonus([c("V")], c("D")), false);
});
test("bonus garder et délai serveur", () => {
  const g = setup([c("7")]);
  g.deck = [c("7")];
  play(
    g,
    "0",
    g.players[0].hand.map((c) => c.id),
  );
  draw(g, "0", "deck");
  tick(g, g.deadline + 1);
  assert.equal(g.phase, "PLAY");
  assert.equal(g.players[0].hand.length, 1);
});
test("Yaniv autorisé à 7, blocage des actions pendant révélation", () => {
  const g = setup([c("7")]);
  yaniv(g, "0");
  assert.equal(g.phase, "YANIV_REVEAL");
  assert.throws(() =>
    play(
      g,
      "0",
      g.players[0].hand.map((c) => c.id),
    ),
  );
  assert.throws(() => draw(g, "0", "deck"));
});
test("Yaniv refusé au-dessus de 7", () =>
  assert.throws(() => yaniv(setup([c("8")]), "0")));
test("Assaf inférieur", () => {
  const r = scoreRound([p("a", [c("3")]), p("b", [c("2")])], "a");
  assert.equal(r.assaf, true);
  assert.equal(r.rows[0].points, 33);
});
test("Assaf égal avec Joker = zéro", () => {
  const r = scoreRound([p("a", [c("2")]), p("b", [c("2"), c("JOKER")])], "a");
  assert.equal(r.assaf, true);
  assert.equal(r.rows[1].comparison, 2);
  assert.equal(r.rows[1].points, 2);
});
test("Joker +10 uniquement après Yaniv réussi", () => {
  const r = scoreRound([p("a", [c("A")]), p("b", [c("2"), c("JOKER")])], "a");
  assert.equal(r.assaf, false);
  assert.equal(r.rows[0].points, 0);
  assert.equal(r.rows[1].points, 12);
});
test("figures 10, As 1, Joker zéro", () =>
  assert.equal(total([c("V"), c("D"), c("R"), c("A"), c("JOKER")]), 31));
test("élimination à 200, gagnant", () => {
  const g = setup([c("A")]);
  g.players[1].hand = [c("2")];
  g.players[1].score = 198;
  yaniv(g, "0");
  settle(g);
  assert.equal(g.players[1].eliminated, true);
  assert.equal(g.phase, "GAME_END");
  assert.equal(g.winnerId, "0");
});
test("éliminé visible mais non distribué, manche suivante", () => {
  const g = game(3);
  g.players[0].hand = [c("A")];
  g.players[1].hand = [c("9")];
  g.players[1].score = 199;
  g.players[2].hand = [c("8")];
  yaniv(g, "0");
  settle(g);
  nextRound(g, "0");
  assert.equal(g.players.length, 3);
  assert.equal(g.players[1].hand.length, 0);
  assert.equal(g.players[0].hand.length, 5);
});
test("minimum deux et maximum huit", () => {
  const g = createGame("TEST");
  addPlayer(g, { id: "a" });
  assert.throws(() => startGame(g, "a"));
  for (let i = 1; i < 8; i++) addPlayer(g, { id: String(i) });
  assert.throws(() => addPlayer(g, { id: "extra" }));
});
test("rejet IDs dupliqués et cartes adverses sans mutation", () => {
  const g = game();
  const before = structuredClone(g);
  const id = g.players[0].hand[0].id;
  assert.throws(() => play(g, "0", [id, id]));
  assert.throws(() => play(g, "0", [g.players[1].hand[0].id]));
  assert.deepEqual(g, before);
});
test("main adverse et carte piochée secrètes dans snapshots", () => {
  const g = setup([c("9")]);
  g.deck = [c("2")];
  const secret = g.deck[0];
  play(
    g,
    "0",
    g.players[0].hand.map((c) => c.id),
  );
  draw(g, "0", "deck");
  const state = JSON.stringify(view(g, "1"));
  assert.ok(!state.includes(secret.id));
  assert.ok(!state.includes("token"));
  assert.equal(view(g, "1").players[0].count, 1);
});
test("recyclage fini sans duplication des cartes", () => {
  const g = game();
  const initial = all(g)
    .map((c) => c.id)
    .sort();
  for (let i = 0; i < 180; i++) {
    const p = g.players.find((p) => p.id === g.turnId);
    play(g, p.id, [p.hand[0].id]);
    draw(g, p.id, "deck");
    if (g.phase === "BONUS") bonus(g, p.id, false);
    assert.deepEqual(
      all(g)
        .map((c) => c.id)
        .sort(),
      initial,
    );
  }
  function all(g) {
    return [
      ...g.deck,
      ...g.archive,
      ...g.previousDiscard.cards,
      ...g.currentPlay.cards,
      ...g.players.flatMap((p) => p.hand),
    ];
  }
});
test("départ en cours de pioche : prochain joueur en PLAY", () => {
  const g = game(3);
  play(g, "0", [g.players[0].hand[0].id]);
  removePlayer(g, "0");
  assert.equal(g.turnId, "1");
  assert.equal(g.phase, "PLAY");
  assert.equal(g.hostId, "1");
  assert.equal(g.currentPlay.cards.length, 0);
});
test("départ avant joueur actif ne déplace pas son tour", () => {
  const g = game(3);
  g.turnId = "2";
  removePlayer(g, "0");
  assert.equal(g.turnId, "2");
});

test("Assaf : chacun prend sa main, seul l'appelant reçoit +30", () => {
  const r = scoreRound([p("a", [c("5")], 8), p("b", [c("3")], 10)], "a");
  assert.equal(r.rows[0].points, 35);
  assert.equal(r.rows[0].total, 43);
  assert.equal(r.rows[1].points, 3);
  assert.equal(r.rows[1].total, 13);
});
for (const [before, expected] of [
  [47, 49],
  [48, 0],
  [49, 51],
  [97, 99],
  [98, 50],
  [99, 101],
  [148, 150],
]) {
  test(`Palier : ${before} + 2 donne ${expected}`, () => {
    const r = scoreRound([p("a", [c("A")]), p("b", [c("2")], before)], "a");
    assert.equal(r.rows[1].total, expected);
    assert.equal(r.rows[1].subtotal, before + 2);
  });
}
test("Palier après pénalité Assaf et persistance à la manche suivante", () => {
  const g = setup([c("5")]);
  g.players[0].score = 65;
  g.players[1].hand = [c("3")];
  yaniv(g, "0");
  settle(g);
  assert.equal(g.players[0].score, 50);
  assert.equal(g.players[1].score, 3);
  nextRound(g, g.hostId);
  assert.equal(g.players[0].score, 50);
});

for (const ranks of [
  ["7", "5", "6"],
  ["6", "7", "5"],
  ["5", "6", "7"],
]) {
  test(`Extrémités logiques ${ranks.join("/")}`, () => {
    const cards = ranks.map((r) => c(r));
    assert.deepEqual(
      pickupIds({ cards, kind: "run" }).map(
        (id) => cards.find((c) => c.id === id).rank,
      ),
      ["5", "7"],
    );
  });
}
test("Joker interne et bouclage Roi As indépendants de l'ordre", () => {
  const cards = [c("A"), c("JOKER"), c("V"), c("D")];
  assert.deepEqual(pickupIds({ cards, kind: "run" }), [
    cards[2].id,
    cards[0].id,
  ]);
});
test("Joker ambigu : départ le plus bas, même résultat en ordre inversé", () => {
  const cards = [c("2"), c("JOKER"), c("3")];
  const ids = pickupIds({ cards, kind: "run" });
  assert.deepEqual(ids, [cards[1].id, cards[2].id]);
  assert.deepEqual(
    pickupIds({ cards: [...cards].reverse(), kind: "run" }),
    ids,
  );
});
for (const rank of ["5", "6"])
  test(`Bonus ${rank} conserve les bornes de la suite`, () => {
    const cards = [c("7"), c("5"), c("6")],
      g = setup(cards),
      extra = c(rank, "♥");
    g.deck = [extra];
    play(
      g,
      "0",
      cards.map((c) => c.id),
    );
    draw(g, "0", "deck");
    bonus(g, "0", true);
    const ids = pickupIds(g.previousDiscard);
    assert.equal(ids.includes(cards[1].id), true);
    assert.equal(ids.includes(cards[0].id), true);
    assert.equal(ids.includes(extra.id), rank === "5");
  });
