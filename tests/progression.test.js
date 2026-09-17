import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Profiles, REWARDS } from "../server/progression.js";
import { generateTaunt } from "../server/taunts.js";
test("Profil : zéro victoire et récompenses verrouillées", () => {
  const p = new Profiles(),
    { token } = p.create();
  assert.equal(p.view(token).wins, 0);
  assert.throws(() => p.equip(token, "back", "solar"));
  assert.equal(p.get("forged"), undefined);
});
test("Victoire unique, paliers et choix contrôlés côté serveur", () => {
  const p = new Profiles(),
    { token } = p.create();
  p.award(token, "game-a");
  p.award(token, "game-a");
  assert.equal(p.view(token).wins, 1);
  p.equip(token, "back", "mosaic");
  assert.equal(p.view(token).equipped.back, "mosaic");
  assert.throws(() => p.equip(token, "skin", "sultan"));
  for (let i = 1; i < 20; i++) p.award(token, "game-" + i);
  for (const r of REWARDS)
    assert.doesNotThrow(() => p.equip(token, r.type, r.id));
  assert.throws(() => p.equip(token, "wins", "999"));
  assert.throws(() => p.equip(token, "back", "unknown"));
});
test("Profil persisté après redémarrage, token absent du fichier public", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "yaniv-profiles-"));
  try {
    const file = path.join(dir, "profiles.json"),
      p = new Profiles(file),
      { token } = p.create();
    p.award(token, "one");
    const reboot = new Profiles(file);
    assert.equal(reboot.view(token).wins, 1);
    assert.equal(JSON.stringify(reboot.view(token)).includes(token), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("IA absente : erreur explicite sans faux texte généré", async () => {
  await assert.rejects(generateTaunt({ apiKey: "" }), /non configurée/);
});
test("IA : requête serveur bornée, extraction du brouillon sans publication", async () => {
  let body;
  const text = await generateTaunt({
    apiKey: "test-only",
    idea: "le café",
    callerTotal: 5,
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      body = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: "Ton bluff coûte plus cher que le café !",
                },
              ],
            },
          ],
        }),
      };
    },
  });
  assert.equal(body.store, false);
  assert.equal(body.max_output_tokens, 300);
  assert.match(text, /café/);
});
test("IA indisponible ou sans texte : erreur exploitable", async () => {
  await assert.rejects(
    generateTaunt({ apiKey: "test", fetchImpl: async () => ({ ok: false }) }),
    /indisponible/,
  );
  await assert.rejects(
    generateTaunt({
      apiKey: "test",
      fetchImpl: async () => ({ ok: true, json: async () => ({ output: [] }) }),
    }),
    /Aucune/,
  );
});

import { tauntContext, synthesizeTaunt } from "../server/taunts.js";
test("Compte : migration invité, mot de passe vérifié, sessions partagées et révocation", async () => {
  const p = new Profiles();
  const guest = p.create();
  p.award(guest.token, "game-account");
  p.equip(guest.token, "back", "mosaic");
  const registered = await p.register(
    guest.token,
    "Djibril",
    "mot-de-passe-test",
  );
  assert.equal(registered.wins, 1);
  await assert.rejects(p.login("Djibril", "incorrect"), /incorrect/);
  const login = await p.login("djibril", "mot-de-passe-test");
  assert.equal(login.equipped.back, "mosaic");
  p.award(login.token, "game-account-2");
  assert.equal(p.view(guest.token).wins, 2);
  assert.equal(JSON.stringify(p.view(login.token)).includes("digest"), false);
  assert.equal(JSON.stringify(p.data).includes("mot-de-passe-test"), false);
  p.logout(login.token);
  assert.equal(p.get(login.token), undefined);
  assert.equal(p.view(guest.token).wins, 2);
  await assert.rejects(
    p.register(p.create().token, "DJIBRIL", "another-password"),
    /utilisé/,
  );
});
test("Compte : persistance du login après redémarrage et validation des entrées", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "yaniv-account-"));
  try {
    const file = path.join(dir, "profiles.json"),
      p = new Profiles(file),
      guest = p.create();
    await assert.rejects(
      p.register(guest.token, "bad space", "long-password"),
      /Identifiant/,
    );
    await assert.rejects(
      p.register(guest.token, "okay", "short"),
      /Mot de passe/,
    );
    await p.register(guest.token, "Saved", "long-password");
    p.award(guest.token, "persist");
    const reboot = new Profiles(file);
    assert.equal((await reboot.login("Saved", "long-password")).wins, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("Vanne : plus gros score de manche (Joker inclus), ou appelant contré", () => {
  const r = {
    callerId: "a",
    assaf: false,
    assafIds: ["b"],
    rows: [
      { id: "a", points: 0 },
      { id: "b", points: 12 },
      { id: "c", points: 20 },
    ],
  };
  assert.equal(tauntContext(r).targetId, "c");
  assert.deepEqual(tauntContext(r).allowedIds, ["a"]);
  r.assaf = true;
  assert.equal(tauntContext(r).targetId, "a");
  assert.deepEqual(tauntContext(r).allowedIds, ["b"]);
});
test("Voix IA : requête bornée, MP3 et absence de clé", async () => {
  await assert.rejects(
    synthesizeTaunt({ text: "Test", apiKey: "" }),
    /non configurée/,
  );
  let request;
  const audio = await synthesizeTaunt({
    text: "Bien essayé !",
    apiKey: "test",
    fetchImpl: async (url, opts) => {
      assert.equal(url, "https://api.openai.com/v1/audio/speech");
      request = JSON.parse(opts.body);
      return {
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      };
    },
  });
  assert.equal(request.input, "Bien essayé !");
  assert.equal(request.response_format, "mp3");
  assert.equal(audio, "AQID");
  await assert.rejects(
    synthesizeTaunt({ text: "x".repeat(181), apiKey: "test" }),
    /180/,
  );
  await assert.rejects(
    synthesizeTaunt({
      text: "Test",
      apiKey: "test",
      fetchImpl: async () => ({ ok: false }),
    }),
    /indisponible/,
  );
});
