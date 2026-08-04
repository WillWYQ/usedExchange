import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyTheme, initialTheme } from "./theme";
import "./tokens.css";

// Resolve the theme before React mounts so the first paint is right:
// stored preference wins, system preference breaks the tie.
applyTheme(initialTheme());

const root = document.getElementById("root");
if (root === null) throw new Error("#root not found in studio/index.html");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
