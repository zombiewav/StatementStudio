import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // A fixed port keeps the site at one address. If the dev server moved to another port the
  // browser would treat it as a different site and the saved sign-in would not be found.
  server: { port: 5173, strictPort: true },
  test: {
    include: ["src/**/*.test.ts"],
  },
})