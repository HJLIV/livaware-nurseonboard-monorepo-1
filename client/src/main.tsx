import { createRoot } from "react-dom/client";
import { PostHogProvider } from "posthog-js/react";
import App from "./App";
import "./index.css";

// PostHog config is injected into the HTML shell by the Express server as
// `window.__POSTHOG__` (see server/posthog-config.ts). The project token is a
// public/publishable token, safe to expose to the browser.
const posthogConfig = (window as { __POSTHOG__?: { token?: string; host?: string } })
  .__POSTHOG__;

const root = createRoot(document.getElementById("root")!);

if (posthogConfig?.token) {
  root.render(
    <PostHogProvider
      apiKey={posthogConfig.token}
      options={{ api_host: posthogConfig.host, defaults: "2026-01-30" }}
    >
      <App />
    </PostHogProvider>,
  );
} else {
  root.render(<App />);
}
