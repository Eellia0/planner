import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./app.css";
import { useEditor } from "./store/editor";
import { initProjects, useSaveStatus } from "./store/projects";

// проверочные скрипты (scripts/check-*.mjs) читают состояние редактора напрямую; только при разработке
if (import.meta.env.DEV) (window as unknown as { planner: typeof useEditor }).planner = useEditor;

// без базы проектов работать можно, но ничего не сохранится — об этом говорит шапка
initProjects().catch((e) =>
  useSaveStatus.setState({ state: "error", error: e instanceof Error ? e.message : String(e) }),
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
