import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { blendHostBackground } from "./hostChrome.js";
import "./styles.css";

// After the stylesheet, so --host-band is resolvable rather than an empty string
blendHostBackground();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
