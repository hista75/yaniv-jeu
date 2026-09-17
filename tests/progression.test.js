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
