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
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <NativeRoot />
  </React.StrictMode>,
);
