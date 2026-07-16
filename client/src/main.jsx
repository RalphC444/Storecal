import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Stylesheets, split by area for navigability. Order preserves the original
// cascade: shared/app base first, then the standalone feature screens.
import "./styles/base.css";
import "./styles/auth.css";
import "./styles/marketing.css";
import "./styles/admin.css";
import "./styles/cookie.css";
import App from "./App.jsx";

// Send the auth cookie with every API call (client :5177 → api :5001).
const _fetch = window.fetch.bind(window);
window.fetch = (url, opts = {}) => _fetch(url, { credentials: "include", ...opts });

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
