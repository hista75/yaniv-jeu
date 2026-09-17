import { existsSync } from "node:fs";
const file = new URL("../dist/index.html", import.meta.url);
if (!existsSync(file)) {
  console.log("Client absent : compilation avant démarrage…");
  await import("./build.mjs");
  if (!existsSync(file))
    throw new Error("La compilation n’a pas produit dist/index.html.");
}
