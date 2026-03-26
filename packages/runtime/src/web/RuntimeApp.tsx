import { CatchUpModal } from "./components/CatchUpModal";
import { ErrorOverlay } from "./components/ErrorOverlay";
import { ChatPanel } from "./components/ChatPanel";
import { InviteModal } from "./components/InviteModal";
import {
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
      <SessionBar {...runtime.sessionBarProps} />

      <div id="lobby-view"></div>

      <TerminalPanel ref={runtime.terminalRef} {...runtime.terminalPanelProps}>
        <ErrorOverlay {...runtime.errorOverlayProps} />
      </TerminalPanel>

      <ChatPanel {...runtime.chatPanelProps} />
      <StateSidebar {...runtime.stateSidebarProps} />
      <CatchUpModal {...runtime.catchUpModalProps} />
      <InviteModal {...runtime.inviteModalProps} />
    </>
  );
}
