import ts from "typescript";
import { build } from "vite";
// In-process transpilation also supports constrained Windows build environments.
await build({
  configFile: false,
  resolve: { preserveSymlinks: true },
  esbuild: false,
  plugins: [
    {
      name: "typescript-in-process",
      enforce: "pre",
      transform(code, id) {
        if (/\.ts$/.test(id))
          return {
            code: ts.transpileModule(code, {
              compilerOptions: {
                target: ts.ScriptTarget.ES2022,
                module: ts.ModuleKind.ESNext,
              },
            }).outputText,
            map: null,
          };
      },
    },
  ],
  build: {
    target: "esnext",
    minify: false,
    rollupOptions: {
      output: {
        manualChunks: { three: ["three"], socket: ["socket.io-client"] },
      },
    },
  },
});
