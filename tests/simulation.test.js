import test from "node:test";
import assert from "node:assert/strict";
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
  active,
} from "../server/game.js";
import { combination, total, value, pickupIds } from "../server/rules.js";

for (let n = 2; n <= 8; n++)
  test(`Partie complète simulée à ${n} joueurs : conservation, phases, éliminations`, () => {
    const g = createGame("SIMU");
    for (let i = 0; i < n; i++)
      addPlayer(g, { id: String(i), name: "Test " + i });
    startGame(g, "0");
    let steps = 0;
    while (g.phase !== "GAME_END" && steps++ < 30000) {
      const p = g.players.find((p) => p.id === g.turnId);
      if (g.phase === "ROUND_END") {
        nextRound(g, "0");
        continue;
      }
      if (total(p.hand) <= 7) {
        yaniv(g, p.id);
        settle(g);
        continue;
      }
      let best = [p.hand[0]],
        bestScore = -1;
      for (let mask = 1; mask < 1 << p.hand.length; mask++) {
        const chosen = p.hand.filter((_, i) => mask & (1 << i));
        if (combination(chosen)) {
          const score = total(chosen) + chosen.length * 4;
          if (score > bestScore) {
            bestScore = score;
            best = chosen;
          }
        }
      }
      play(
        g,
        p.id,
        best.map((c) => c.id),
      );
      assert.equal(g.phase, "DRAW");
      const legal = pickupIds(g.previousDiscard),
        candidate = g.previousDiscard.cards
          .filter((c) => legal.includes(c.id))
          .sort((a, b) => value(a) - value(b))[0];
      if (candidate && value(candidate) <= 2)
        draw(g, p.id, "discard", candidate.id);
      else draw(g, p.id, "deck");
      if (g.phase === "BONUS") bonus(g, p.id, true);
      const cards = [
        ...g.deck,
        ...g.archive,
        ...g.previousDiscard.cards,
        ...g.currentPlay.cards,
        ...g.players.flatMap((p) => p.hand),
      ];
      assert.equal(new Set(cards.map((c) => c.id)).size, cards.length);
      assert.ok(cards.length === 54 || cards.length === 108);
      assert.ok(active(g).every((p) => p.hand.length <= 5));
    }
    assert.equal(g.phase, "GAME_END", `Simulation exceeded ${steps} steps`);
    assert.ok(g.winnerId);
    assert.ok(active(g).length <= 1);
  });
