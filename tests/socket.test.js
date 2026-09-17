import test from "node:test";
import assert from "node:assert/strict";
import { io } from "socket.io-client";
import { makeServer } from "../server/index.js";
import { total } from "../server/rules.js";
async function fixture(t) {
  const server = makeServer();
  await new Promise((r) => server.http.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.http.address().port}`;
  const clients = [];
  t.after(async () => {
    clients.forEach((c) => c.socket.disconnect());
    await server.close();
  });
  async function client() {
    const socket = io(url, { transports: ["websocket"], forceNew: true });
    const c = { socket, state: null, token: null };
    socket.on("state", (s) => (c.state = s));
    await new Promise((r, j) => {
      socket.once("connect", r);
      socket.once("connect_error", j);
    });
    c.send = async (event, data = {}) => {
      const res = await socket
        .timeout(3000)
        .emitWithAck(event, { revision: c.state?.revision, ...data });
      const until = Date.now() + 1000;
      while (
        clients.some(
          (p) =>
            p.socket.connected &&
            p.state?.code === c.state?.code &&
            p.state?.revision < c.state?.revision,
        ) &&
        Date.now() < until
      )
        await new Promise((r) => setTimeout(r, 5));
      return res;
    };
    clients.push(c);
    return c;
  }
  return { server, url, client };
}
test("Socket.IO : deux joueurs, secret des mains, pose/pioche, chat, reprise, départ", async (t) => {
  const f = await fixture(t),
    a = await f.client(),
    b = await f.client();
  const created = await a.send("enter", {
    create: true,
    name: "Alice",
    skin: "jeune",
    pose: "normal",
  });
  assert.ok(created.ok);
  const code = created.code;
  assert.ok(
    (await b.send("enter", { code, name: "Bob", skin: "vieux", pose: "focus" }))
      .ok,
  );
  assert.equal((await b.send("start")).ok, false);
  assert.ok((await a.send("start")).ok);
  assert.equal(a.state.hand.length, 5);
  assert.equal(b.state.hand.length, 5);
  assert.equal(a.state.players[1].hand, undefined);
  assert.equal(JSON.stringify(b.state).includes(a.state.hand[0].id), false);
  assert.equal((await b.send("draw", { source: "deck" })).ok, false);
  const card = a.state.hand[0],
    previous = a.state.previousDiscard.cards[0];
  assert.ok((await a.send("play", { ids: [card.id] })).ok);
  assert.equal(a.state.phase, "DRAW");
  assert.equal(a.state.previousDiscard.cards[0].id, previous.id);
  assert.equal(
    (await a.send("draw", { source: "discard", cardId: card.id })).ok,
    false,
  );
  assert.ok(
    (await a.send("draw", { source: "discard", cardId: previous.id })).ok,
  );
  if (a.state.phase === "BONUS") await a.send("bonus", { add: false });
  assert.equal(a.state.turnId, b.state.me);
  assert.equal(a.state.previousDiscard.cards[0].id, card.id);
  assert.ok(
    (await a.send("chat", { text: "Bonjour <script>test</script>" })).ok,
  );
  assert.equal(a.state.chat.at(-1).text, "Bonjour <script>test</script>");
  const resume = await f.client();
  a.socket.disconnect();
  assert.ok((await resume.send("resume", { token: created.token })).ok);
  assert.equal(resume.state.me, a.state.me);
  assert.equal(resume.state.players.length, 2);
  assert.ok((await b.send("leave")).ok);
  assert.equal(resume.state.players.length, 1);
  assert.equal(resume.state.phase, "GAME_END");
  const version = await (await fetch(f.url + "/version")).json();
  assert.equal(version.version, "6.2.0");
});
test("Socket.IO : capacité 8, entrées en double et payloads malformés refusés", async (t) => {
  const f = await fixture(t),
    a = await f.client();
  const r = await a.send("enter", { create: true, name: "Hôte" });
  assert.equal(
    (await a.send("enter", { create: true, name: "Clone" })).ok,
    false,
  );
  for (let i = 1; i < 8; i++) {
    const c = await f.client();
    assert.ok((await c.send("enter", { code: r.code, name: "P" + i })).ok);
  }
  const ninth = await f.client();
  assert.equal(
    (await ninth.send("enter", { code: r.code, name: "9" })).ok,
    false,
  );
  assert.ok((await a.send("start")).ok);
  assert.equal(a.state.deckCount, 67);
  assert.equal((await a.send("play", { ids: { bad: true } })).ok, false);
});
test("Socket.IO : révélation, scores et manche suivante synchronisés", async (t) => {
  const f = await fixture(t),
    a = await f.client(),
    b = await f.client();
  const r = await a.send("enter", { create: true, name: "A" });
  await b.send("enter", { code: r.code, name: "B" });
  await a.send("start");
  // Test-only fixture changes the isolated server instance; no production debug route.
  const g = f.server.rooms.get(r.code);
  g.players[0].hand = [{ id: "ace", rank: "A", suit: "♠" }];
  g.players[1].hand = [
    { id: "two", rank: "2", suit: "♥" },
    { id: "joker", rank: "JOKER", suit: "✦" },
  ];
  assert.ok((await a.send("yaniv")).ok);
  assert.equal(a.state.phase, "YANIV_REVEAL");
  assert.equal(b.state.result.rows.length, 2);
  assert.equal(b.state.result.rows[1].points, 12);
  assert.equal((await b.send("play", { ids: ["two"] })).ok, false);
  g.deadline = Date.now() - 1;
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(a.state.phase, "ROUND_END");
  assert.equal(a.state.players[1].score, 12);
  assert.ok((await a.send("next")).ok);
  assert.equal(a.state.round, 2);
  assert.equal(b.state.hand.length, 5);
  assert.equal(a.state.result, null);
});

import { settle } from "../server/game.js";
test("Socket.IO : victoire serveur débloque le vestiaire, aucune victoire client acceptée", async (t) => {
  const f = await fixture(t),
    a = await f.client(),
    b = await f.client();
  const profile = await a.send("profile");
  assert.ok(profile.token);
  assert.equal(
    (
      await a.send("equip", {
        token: profile.token,
        type: "back",
        id: "aurora",
      })
    ).ok,
    false,
  );
  const entered = await a.send("enter", {
    create: true,
    name: "Alice",
    profileToken: profile.token,
  });
  await b.send("enter", { code: entered.code, name: "Bob" });
  await a.send("start");
  const g = f.server.rooms.get(entered.code);
  g.players[0].hand = [{ id: "a", rank: "A", suit: "♠", pack: 0 }];
  g.players[1].hand = [{ id: "b", rank: "2", suit: "♠", pack: 0 }];
  g.players[1].score = 198;
  assert.ok((await a.send("yaniv")).ok);
  g.deadline = Date.now() - 1;
  await new Promise((resolve) =>
    a.socket.on("state", (s) => {
      if (s.phase === "GAME_END") resolve();
    }),
  );
  const updated = await a.send("profile", { token: profile.token, wins: 999 });
  assert.equal(updated.wins, 1);
  assert.ok(
    (
      await a.send("equip", {
        token: profile.token,
        type: "back",
        id: "mosaic",
      })
    ).ok,
  );
  assert.equal((await a.send("profile", { token: profile.token })).wins, 1);
  assert.equal(JSON.stringify(b.state).includes(profile.token), false);
});
test("Socket.IO : vanne refusée sans Assaf et erreur sans clé", async (t) => {
  const f = await fixture(t),
    a = await f.client(),
    b = await f.client();
  assert.equal((await a.send("taunt", { idea: "café" })).ok, false);
  const e = await a.send("enter", { create: true, name: "A" });
  await b.send("enter", { code: e.code, name: "B" });
  await a.send("start");
  assert.equal((await b.send("taunt", { idea: "café" })).ok, false);
  const g = f.server.rooms.get(e.code);
  g.players[0].hand = [{ id: "a", rank: "3", suit: "♠", pack: 0 }];
  g.players[1].hand = [{ id: "b", rank: "2", suit: "♠", pack: 0 }];
  await a.send("yaniv");
  assert.equal((await a.send("taunt", { idea: "café" })).ok, false);
  const response = await b.send("taunt", { idea: "café" });
  assert.equal(response.ok, false);
  assert.match(response.error, /non configurée/);
  assert.equal(g.chat.length, 0);
});
