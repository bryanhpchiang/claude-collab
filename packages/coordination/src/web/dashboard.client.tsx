import { hydrateRoot } from "react-dom/client";
import "./app.css";
import { readDashboardBootstrap } from "./bootstrap";
import { DashboardPage } from "./pages/DashboardPage";

const root = document.getElementById("app");

if (root) {
  const bootstrap = readDashboardBootstrap();
  hydrateRoot(root, (
    <DashboardPage
      initialJams={bootstrap.jams}
      user={bootstrap.user}
    />
  ));
}
