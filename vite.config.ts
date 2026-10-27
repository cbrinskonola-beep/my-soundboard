import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "version-offline-cache",
      apply: "build",
      closeBundle() {
        const hash = createHash("sha256")
          .update(readFileSync("dist/index.html"))
          .digest("hex")
          .slice(0, 12);
        const sw = readFileSync("dist/sw.js", "utf8").replace(
          "soundspace-v1",
          `soundspace-${hash}`,
        );
        writeFileSync("dist/sw.js", sw);
      },
    },
  ],
  base: "./",
});
