import {
  NewProjectModal,
  NewSessionModal,
} from "./components/CreationModals";
import { ErrorOverlay } from "./components/ErrorOverlay";
import { ChatPanel } from "./components/ChatPanel";
import {
  ProjectBar,
  RuntimeHeader,
  SessionBar,
} from "./components/RuntimeBars";
import { StateSidebar } from "./components/StateSidebar";
import { TerminalPanel } from "./components/TerminalPanel";
import { useRuntimeController } from "./hooks/useRuntimeController";
import type { RuntimeBootstrap } from "./types";

type RuntimeAppProps = {
  bootstrap: RuntimeBootstrap;
};

export function RuntimeApp({ bootstrap }: RuntimeAppProps) {
  const runtime = useRuntimeController(bootstrap);

  return (
    <>
      <RuntimeHeader {...runtime.headerProps} />
      <ProjectBar {...runtime.projectBarProps} />
      <SessionBar {...runtime.sessionBarProps} />

      <div id="lobby-view">Pick a session above or start a new one</div>

      <TerminalPanel ref={runtime.terminalRef} {...runtime.terminalPanelProps}>
        <ErrorOverlay {...runtime.errorOverlayProps} />
      </TerminalPanel>

      <ChatPanel {...runtime.chatPanelProps} />
      <StateSidebar {...runtime.stateSidebarProps} />
      <NewSessionModal {...runtime.newSessionModalProps} />
      <NewProjectModal {...runtime.newProjectModalProps} />
    </>
  );
}
