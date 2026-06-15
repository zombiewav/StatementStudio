import React from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter } from "react-router"
import App from "./App.tsx"
import "./index.css"
import { applyTheme, ThemeProvider, type ThemeMode } from "./context/ThemeContext.tsx"

// Apply initial theme class early (before first render)
const savedTheme = (localStorage.getItem("theme") ?? localStorage.getItem("ss_theme")) as ThemeMode | null
const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
const theme = savedTheme ?? (prefersDark ? "dark" : "light")
applyTheme(theme)

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
)

