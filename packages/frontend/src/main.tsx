import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { I18nProvider } from "./i18n.ts";
import "./styles.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("Root element #root not found");
}

createRoot(container).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);
