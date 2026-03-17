import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

// ── Global stale-chunk recovery ──
// After a deploy with rsync --delete, old JS chunks no longer exist.
// Vite fires this event when a dynamic import's preload link 404s.
// Catch it globally and force a fresh reload to pick up new index.html.
window.addEventListener("vite:preloadError", (e) => {
  e.preventDefault(); // prevent unhandled-rejection noise
  const reloadKey = "vite-preload-reload";
  const reloaded = Number(sessionStorage.getItem(reloadKey) ?? 0);
  if (reloaded < 2) {
    sessionStorage.setItem(reloadKey, String(reloaded + 1));
    window.location.reload();
  }
});
// Clear the reload flag on successful page load (chunks loaded fine)
window.addEventListener("load", () => sessionStorage.removeItem("vite-preload-reload"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
