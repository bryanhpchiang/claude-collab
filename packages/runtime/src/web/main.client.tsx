import "@xterm/xterm/css/xterm.css";
import "./xterm-overrides.css";
import { hydrateRoot } from "react-dom/client";
import "./app.css";
import { readRuntimeBootstrap } from "./bootstrap";
import { RuntimeApp } from "./RuntimeApp";

const root = document.getElementById("app");

if (root) {
  hydrateRoot(root, <RuntimeApp bootstrap={readRuntimeBootstrap()} />);
}
