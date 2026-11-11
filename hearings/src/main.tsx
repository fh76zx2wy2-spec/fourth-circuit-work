import { createRoot } from "react-dom/client";
import { AuthGate } from "./components/auth-gate";
import { Index } from "./Hearings";
import { configureMainSession, type MainSession } from "./lib/supabase";
import styles from "./styles.css?inline";

export function mount(container: HTMLElement, session: MainSession) {
  configureMainSession(session);
  const shadow = container.attachShadow({ mode: "open" });
  const stylesheet = document.createElement("style");
  stylesheet.textContent = styles;
  const view = document.createElement("div");
  view.dir = "rtl";
  shadow.append(stylesheet, view);
  createRoot(view).render(<AuthGate><Index /></AuthGate>);
}
