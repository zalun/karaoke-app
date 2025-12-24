import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import { DetachedPlayer } from "./components/player";
import "./index.css";

console.log("[main.tsx] Loading app, hash:", window.location.hash, "pathname:", window.location.pathname);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/player" element={<DetachedPlayer />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>
);
