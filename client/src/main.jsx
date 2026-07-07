import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

// Send the auth cookie with every API call (client :5177 → api :5001).
const _fetch = window.fetch.bind(window);
window.fetch = (url, opts = {}) => _fetch(url, { credentials: "include", ...opts });

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
