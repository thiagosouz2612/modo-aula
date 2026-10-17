import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { createReadStream, existsSync, statSync } from "node:fs";

// Só para testar no navegador (fora do aplicativo): serve a Bíblia de uma
// pasta local em /biblia-dev. Use BIBLIA_DEV=/caminho/para/public/biblia.
function bibliaDev(): Plugin {
  const dir = process.env.BIBLIA_DEV;
  return {
    name: "biblia-dev",
    configureServer(server) {
      if (!dir) return;
      server.middlewares.use("/biblia-dev", (req, res, next) => {
        const p = resolve(dir, "." + decodeURIComponent((req.url ?? "").split("?")[0]));
        if (!p.startsWith(dir) || !existsSync(p) || !statSync(p).isFile()) return next();
        res.setHeader("Content-Type", "application/octet-stream");
        createReadStream(p).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), bibliaDev()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: { index: resolve(__dirname, "index.html"), tela: resolve(__dirname, "tela.html") },
    },
  },
});
