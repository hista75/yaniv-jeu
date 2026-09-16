import { chromium, firefox } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { makeServer } from "../server/index.js";

// Two actual browser engines, an isolated HTTP server, and normal UI actions.
// Fixture mutations below belong only to this test process. There is no debug API.
const server = makeServer();
await new Promise((resolve) => server.http.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.http.address().port}`;
const browsers = [];
const errors = [];
await fs.mkdir("test-results", { recursive: true });
try {
  for (const [engine, executable] of [
    [chromium, process.env.CHROMIUM_EXECUTABLE_PATH],
    [firefox, process.env.FIREFOX_EXECUTABLE_PATH],
  ]) {
    browsers.push(
      await engine.launch({
        headless: true,
        ...(executable ? { executablePath: executable } : {}),
        ...(engine === chromium
          ? { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] }
          : { firefoxUserPrefs: { "webgl.force-enabled": true } }),
      }),
    );
  }
  const pages = await Promise.all(
    browsers.map((b) => b.newPage({ viewport: { width: 1365, height: 900 } })),
  );
  pages.forEach((p, i) => {
    p.on("pageerror", (e) => errors.push(`Browser ${i}: ${e.message}`));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(`Browser ${i}: ${m.text()}`);
    });
  });
  const [a, b] = pages;
  await Promise.all(pages.map((p) => p.goto(url)));
  await Promise.all(
    pages.map((p) =>
      p.waitForFunction(
        () =>
          document
            .querySelector("#asset-status")
            ?.textContent.includes("PRÊTE"),
        null,
        { timeout: 30000 },
      ),
    ),
  );
  await a.screenshot({ path: "test-results/menu.png" });
  await a.locator("#nickname").fill("Chrome");
  await a.locator("#create").click();
  await a.locator("#copy-lobby").waitFor({ state: "visible" });
  const code = (await a.locator("#copy-lobby").innerText()).slice(0, 4);
  await b.locator("#nickname").fill("Firefox");
  await b.locator('[data-skin="classique"]').click();
  await b.locator("#room-code").fill(code);
  await b.locator("#join").click();
  await a.locator("#start").click();
  for (const page of pages) {
    await page.waitForFunction(
      () => document.querySelectorAll("#hand button").length === 5,
    );
    assert.equal(await page.locator("#hand button").count(), 5);
  }
  const previous = await a
    .locator("#discard-cards button")
    .getAttribute("data-card-id");
  const played = await a
    .locator("#hand button")
    .first()
    .getAttribute("data-card-id");
  await a.locator("#hand button").first().click();
  await a.locator("#play").click();
  await a.waitForFunction(() => !document.querySelector("#draw-deck").disabled);
  assert.equal(
    await a.locator("#discard-cards button").getAttribute("data-card-id"),
    previous,
  );
  await a.locator("#discard-cards button").click();
  if (await a.locator("#bonus-panel").isVisible())
    await a.locator("#bonus-keep").click();
  await b.waitForFunction(() =>
    document
      .querySelector("#turn-banner")
      .textContent.startsWith("À toi de jouer"),
  );
  assert.equal(
    await b.locator("#discard-cards button").getAttribute("data-card-id"),
    played,
  );
  await b.locator("#hand button").first().click();
  await b.locator("#play").click();
  await b.locator("#draw-deck").click();
  if (await b.locator("#bonus-panel").isVisible())
    await b.locator("#bonus-keep").click();
  await a.locator("#chat-input").fill("Salut <b>la table</b>");
  await a.locator("#chat-form button").click();
  await b.getByText("Salut <b>la table</b>", { exact: false }).waitFor();
  assert.equal(await b.locator("#chat-messages b").count(), 0);
  await a.screenshot({ path: "test-results/two-players.png" });
  // A real reload must restore the seat and private hand.
  const count = await a.locator("#hand button").count();
  await a.reload();
  await a.locator("#game-ui").waitFor({ state: "visible" });
  assert.equal(await a.locator("#hand button").count(), count);
  // Deterministic equal Assaf fixture, still announced through the public UI.
  const game = server.rooms.get(code);
  game.turnId = game.players[0].id;
  game.phase = "PLAY";
  game.players[0].hand = [
    { id: "fixture-two-a", rank: "2", suit: "♠", pack: 0 },
  ];
  game.players[1].hand = [
    { id: "fixture-two-b", rank: "2", suit: "♥", pack: 0 },
    { id: "fixture-joker", rank: "JOKER", suit: "✦", pack: 0 },
  ];
  await a.locator("#chat-input").fill("Test de révélation");
  await a.locator("#chat-form button").click();
  await a.locator("#yaniv").click();
  for (const page of pages) {
    await page.locator("#result.revealing").waitFor();
    assert.match(await page.locator("#result h2").innerText(), /ASSAF/);
    assert.match(await page.locator("#result").innerText(), /\+32/);
  }
  await a.screenshot({ path: "test-results/assaf-reveal.png" });
  await a.locator("#next-round").waitFor({ state: "visible", timeout: 15000 });
  assert.equal(game.players[0].score, 32);
  assert.equal(game.players[1].score, 2);
  await a.locator("#next-round").click();
  await b.waitForFunction(
    () => document.querySelectorAll("#hand button").length === 5,
  );
  // Responsive controls and dialogs on a phone-sized viewport.
  await b.setViewportSize({ width: 390, height: 844 });
  await b.screenshot({ path: "test-results/mobile.png" });
  assert.ok(await b.locator("#hand").isVisible());
  assert.ok(await b.locator("#settings-btn").isVisible());
  assert.ok(
    await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await b.locator("#settings-btn").click();
  await b.locator("#quality").selectOption("low");
  await b.locator("#settings-dialog .close-dialog").click();
  // Fixed seats survive a departure; the remaining player wins.
  await b.locator("#leave-btn").click();
  await a.waitForFunction(() =>
    document.querySelector("#result h2")?.textContent.includes("remporte"),
  );
  assert.equal(game.players.length, 1);
  assert.equal(game.phase, "GAME_END");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Chromium + Firefox; room, 5 cards, play/draw, previous discard, chat escaping, reconnection, equal Assaf, next round, mobile, quality, departure, victory; no console errors.",
  );
} finally {
  await Promise.all(browsers.map((b) => b.close()));
  await server.close();
}
