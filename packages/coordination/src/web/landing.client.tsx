import { hydrateRoot } from "react-dom/client";
import "./app.css";
import { readLandingBootstrap } from "./bootstrap";
import { LandingPage } from "./pages/LandingPage";

const root = document.getElementById("app");

if (root) {
  const bootstrap = readLandingBootstrap();
  hydrateRoot(root, (
    <LandingPage
      authEnabled={bootstrap.authEnabled}
      signedIn={bootstrap.signedIn}
    />
  ));
}
