import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { blendHostBackground, fitToHost, markFramed } from "./hostChrome.js";
import { initTheme } from "./theme.js";
import "./styles.css";

// Before the first render, so the editor never paints light and then flips --
// and before the band, which takes its colour from the theme.
initTheme();
markFramed();
// After the stylesheet, so --host-band is resolvable rather than an empty string
blendHostBackground();
// Once there is a body to measure with
fitToHost();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
