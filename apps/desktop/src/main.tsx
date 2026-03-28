import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { themeColorVariables } from "./styles/theme/colors";
import "./styles.css";

Object.entries(themeColorVariables).forEach(([name, value]) => {
  document.documentElement.style.setProperty(name, value);
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
