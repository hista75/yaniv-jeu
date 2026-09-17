import express from "express";
import { Profiles } from "./progression.js";
import { generateTaunt } from "./taunts.js";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  createGame,
  addPlayer,
  startGame,
  play,
  draw,
  bonus,
  yaniv,
  nextRound,
  removePlayer,
  tick,
  view,
} from "./game.js";
import { check } from "./rules.js";

export function makeServer({
  profileFile = process.env.DATA_DIR
    ? path.join(process.env.DATA_DIR, "profiles.json")
    : null,
  tauntGenerator = generateTaunt,
} = {}) {
  const profiles = new Profiles(profileFile);
  let aiActive = 0;
  const app = express();
  const http = createServer(app);
  const io = new Server(http, { maxHttpBufferSize: 8192, serveClient: false });
  const rooms = new Map(),
    sessions = new Map();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Referrer-Policy", "same-origin");
    next();
  });
  app.get("/version", (_, res) =>
    res.json({
      name: "Yaniv Café",
      version: "6.2.0",
      build: process.env.RENDER_GIT_COMMIT?.slice(0, 12) || "6.2.0-local",
      rules: "djerbien-2026-09",
      uptime: Math.floor(process.uptime()),
    }),
  );
  const dist = fileURLToPath(new URL("../dist/", import.meta.url));
  app.use(
    express.static(dist, {
      maxAge: "1h",
      setHeaders(res, file) {
        if (file.endsWith(".html")) res.set("Cache-Control", "no-cache");
      },
    }),
  );
  app.get("*", (_, res) => res.sendFile(path.join(dist, "index.html")));
  function broadcast(g) {
    if (
      g.phase === "GAME_END" &&
      g.lastEvent?.type === "win" &&
      g.result &&
      !g.rewardGranted
    ) {
      const winner = g.players.find((p) => p.id === g.winnerId);
      // Only completed games count, never a lobby or a disconnect-only victory.
      if (winner && g.result.rows.some((r) => r.eliminated)) {
        const won = profiles.award(winner.profileToken, g.gameId);
        g.rewardGranted = true;
        if (won) {
          const ws = sessions.get(winner.token);
          if (ws?.socketId)
            io.to(ws.socketId).emit(
              "profile",
              profiles.view(winner.profileToken),
            );
        }
      }
    }
    g.revision++;
    for (const p of g.players) {
      const s = sessions.get(p.token);
      if (s?.socketId) io.to(s.socketId).emit("state", view(g, p.id));
    }
  }
  function leave(session) {
    const g = rooms.get(session.code);
    if (g) {
      removePlayer(g, session.playerId);
      if (!g.players.length) rooms.delete(g.code);
      else broadcast(g);
    }
    sessions.delete(session.token);
  }
  io.on("connection", (socket) => {
    let session = null;
    let hits = [];
    function action(name, handler) {
      socket.on(name, async (data, ack) => {
        try {
          hits = hits.filter((t) => Date.now() - t < 1000);
          check(
            hits.length < 20,
            "Trop de demandes. Réessaie dans une seconde.",
          );
          hits.push(Date.now());
          const result = await handler(data ?? {});
          if (typeof ack === "function") ack({ ok: true, ...result });
        } catch (e) {
          if (typeof ack === "function") ack({ ok: false, error: e.message });
          else socket.emit("notice", e.message);
        }
      });
    }
    function game() {
      check(session, "Rejoins un salon.");
      const g = rooms.get(session.code);
      check(g, "Salon expiré.");
      return g;
    }
    action("profile", (data) => {
      if (data.token) {
        check(profiles.get(data.token), "Profil introuvable.");
        return profiles.view(data.token);
      }
      return profiles.create();
    });
    action("equip", (data) => profiles.equip(data.token, data.type, data.id));
    action("taunt", async (data) => {
      const g = game();
      check(
        g.result?.assaf && g.result.assafIds.includes(session.playerId),
        "Les vannes Assaf sont disponibles après ton contre.",
      );
      check(
        ["YANIV_REVEAL", "ROUND_END", "GAME_END"].includes(g.phase),
        "Cet Assaf est terminé.",
      );
      check(
        typeof data.idea === "string" && data.idea.length <= 120,
        "Thème trop long.",
      );
      check(
        Date.now() - (session.lastTaunt || 0) > 15000 &&
          (session.tauntRound !== g.round || (session.tauntCount || 0) < 3),
        "Maximum trois propositions par Assaf, espacées de 15 secondes.",
      );
      check(
        aiActive < 3,
        "Le comptoir prépare déjà des vannes, réessaie bientôt.",
      );
      if (session.tauntRound !== g.round) {
        session.tauntRound = g.round;
        session.tauntCount = 0;
      }
      session.lastTaunt = Date.now();
      session.tauntCount++;
      aiActive++;
      try {
        return {
          text: await tauntGenerator({
            idea: data.idea,
            callerTotal: g.result.callerTotal,
          }),
        };
      } finally {
        aiActive--;
      }
    });
    action("enter", (data) => {
      check(!session, "Tu es déjà dans un salon.");
      check(
        typeof data.name === "string" && data.name.trim().length >= 1,
        "Choisis un pseudo.",
      );
      const name = data.name.trim().slice(0, 20);
      const skin = [
        "jeune",
        "classique",
        "costaud",
        "nain",
        "vieux",
        "bg",
      ].includes(data.skin)
        ? data.skin
        : "jeune";
      const pose = ["normal", "focus", "chicha"].includes(data.pose)
        ? data.pose
        : "normal";
      let g;
      if (data.create) {
        check(rooms.size < 1000, "Le café est complet.");
        let code;
        do {
          code = randomBytes(3).toString("hex").slice(0, 4).toUpperCase();
        } while (rooms.has(code));
        g = createGame(code);
      } else {
        check(typeof data.code === "string", "Code requis.");
        g = rooms.get(data.code.trim().toUpperCase());
        check(g, "Salon introuvable. Vérifie le code.");
      }
      const token = randomBytes(32).toString("hex"),
        id = randomUUID();
      const profile = profiles.get(data.profileToken);
      const equipped = profile?.equipped || {
        back: "classic",
        face: "classic",
        skin: "default",
        pose: "default",
      };
      addPlayer(g, {
        id,
        name,
        skin: equipped.skin !== "default" ? equipped.skin : skin,
        pose: equipped.pose !== "default" ? equipped.pose : pose,
        token,
        profileToken: profile ? data.profileToken : undefined,
        back: equipped.back,
        face: equipped.face,
      });
      if (!g.gameId) g.gameId = randomUUID();
      rooms.set(g.code, g);
      session = {
        token,
        playerId: id,
        code: g.code,
        socketId: socket.id,
        expires: null,
      };
      sessions.set(token, session);
      socket.join(g.code);
      broadcast(g);
      return { token, code: g.code };
    });
    action("resume", (data) => {
      check(!session, "Déjà connecté.");
      check(typeof data.token === "string", "Session invalide.");
      const found = sessions.get(data.token);
      check(found, "Session expirée.");
      if (found.socketId && found.socketId !== socket.id)
        io.sockets.sockets.get(found.socketId)?.disconnect(true);
      session = found;
      session.socketId = socket.id;
      session.expires = null;
      const g = game();
      const p = g.players.find((p) => p.id === session.playerId);
      check(p, "Place expirée.");
      p.connected = true;
      socket.join(g.code);
      broadcast(g);
      return { token: session.token, code: g.code };
    });
    for (const [event, fn] of Object.entries({
      start: (g, id) => startGame(g, id),
      play: (g, id, d) => play(g, id, d.ids),
      draw: (g, id, d) => draw(g, id, d.source, d.cardId),
      bonus: (g, id, d) => bonus(g, id, d.add),
      yaniv: (g, id) => yaniv(g, id),
      next: (g, id) => nextRound(g, id),
    })) {
      action(event, (data) => {
        const g = game();
        check(
          data.revision === g.revision,
          "État actualisé : recommence ton action.",
        );
        fn(g, session.playerId, data);
        broadcast(g);
      });
    }
    action("chat", (data) => {
      const g = game();
      check(typeof data.text === "string", "Message invalide.");
      const text = data.text.trim().slice(0, 240);
      check(text, "Message vide.");
      const p = g.players.find((p) => p.id === session.playerId);
      g.chat.push({
        id: randomUUID(),
        playerId: p.id,
        name: p.name,
        text,
        at: Date.now(),
      });
      g.chat = g.chat.slice(-60);
      broadcast(g);
    });
    action("emote", (data) => {
      const g = game();
      check(
        ["👋", "😂", "👍", "😮", "😴", "🔥", "☕"].includes(data.emoji),
        "Émote inconnue.",
      );
      io.to(g.code).emit("emote", {
        playerId: session.playerId,
        emoji: data.emoji,
      });
    });
    action("leave", () => {
      const code = session?.code;
      if (session) leave(session);
      session = null;
      if (code) socket.leave(code);
    });
    socket.on("disconnect", () => {
      if (session?.socketId === socket.id) {
        session.socketId = null;
        session.expires = Date.now() + 30000;
        const g = rooms.get(session.code);
        const p = g?.players.find((p) => p.id === session.playerId);
        if (p) {
          p.connected = false;
          broadcast(g);
        }
      }
    });
  });
  const timer = setInterval(() => {
    for (const s of sessions.values())
      if (s.expires && Date.now() >= s.expires) leave(s);
    for (const g of rooms.values())
      try {
        if (tick(g)) broadcast(g);
      } catch (e) {
        console.error("Game timer:", g.code, e);
      }
  }, 250);
  timer.unref();
  return {
    app,
    http,
    io,
    rooms,
    sessions,
    close: () => {
      clearInterval(timer);
      return new Promise((resolve) => io.close(resolve));
    },
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = makeServer({
    profileFile: path.join(process.env.DATA_DIR || "data", "profiles.json"),
  });
  const port = Number(process.env.PORT) || 3000;
  server.http.listen(port, "0.0.0.0", () =>
    console.log(`Yaniv Café 6.2.0 — http://localhost:${port}`),
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, async () => {
      await server.close();
      process.exit(0);
    });
}
