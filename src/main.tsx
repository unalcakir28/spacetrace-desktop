import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { locale } from "./i18n";
import "./theme.css";

// index.html ships `lang="en"` because it has to say something before any
// script runs. Correct it here, once, from whatever the store resolved to:
// the attribute drives hyphenation and what a screen reader pronounces, and
// German text announced as English is worse than no attribute at all.
document.documentElement.lang = locale();

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
