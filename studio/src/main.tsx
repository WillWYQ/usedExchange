import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./tokens.css";

const root = document.getElementById("root");
if (root === null) throw new Error("#root not found in studio/index.html");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
