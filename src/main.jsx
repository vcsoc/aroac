import React from "react";
import { createRoot } from "react-dom/client";
import NativeRoot from "./NativeRoot.jsx";
import "./styles.css";
import "./compact.css";
import "./search.css";
import "./panels.css";
import "./workspace.css";
import "./location-controls.css";
import "./map-controls.css";
import "./contact-navigation.css";
import "./layout-settings.css";
import "./quick-switch.css";
import "./panel-layout.css";
import "./saved-items.css";
import "./release-seven.css";
import "./interface-ui.css";
import "./guidance.css";
import "./release-ten.css";
import "./release-twelve.css";
import "./on-off.css";
import Scrollbars from "./Scrollbars";
// Reset an abandoned demo origin before any component reads browser preferences.
if (
  window.location.protocol === "oar:" &&
  window.location.hostname === "demo"
) {
  localStorage.clear();
  sessionStorage.clear();
}
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Scrollbars />
    <NativeRoot />
  </React.StrictMode>,
);
