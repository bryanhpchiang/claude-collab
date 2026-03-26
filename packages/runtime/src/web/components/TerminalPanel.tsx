import {
  forwardRef,
  type ReactNode,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import { colorizeOutput } from "../lib/colors.js";
import { isClaudeReadyScreen } from "../lib/format.js";

export type TerminalHandle = {
  fit(): void;
  handleDisconnect(): void;
  hideOauthModal(): void;
  resetForSession(): void;
  setInteractiveMode(next: boolean): void;
  writeOutput(data: string): void;
};

type TerminalPanelProps = {
  children?: ReactNode;
  connectedUsers: string[];
  currentUserName: string;
  onClaudeReady(): void;
  onReady(): void;
  onResize?(cols: number, rows: number): void;
  onTtyInput(data: string): void;
};

export const TerminalPanel = forwardRef<TerminalHandle, TerminalPanelProps>(function TerminalPanel(
  { children, connectedUsers, currentUserName, onClaudeReady, onReady, onResize, onTtyInput },
  ref,
) {
  const terminalContainerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<any>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const connectedUsersRef = useRef(connectedUsers);
  const currentUserNameRef = useRef(currentUserName);
  const onClaudeReadyRef = useRef(onClaudeReady);
  const onReadyRef = useRef(onReady);
  const onResizeRef = useRef(onResize);
  const onTtyInputRef = useRef(onTtyInput);
  const userScrolledUpRef = useRef(false);
  const awaitingClaudeReadyRef = useRef(false);
  const interactiveRef = useRef(false);
  const oauthOpenedRef = useRef(false);
  const pendingResetRef = useRef(false);

  const [interactive, setInteractive] = useState(false);
  const [termReady, setTermReady] = useState(false);
  const [oauthVisible, setOauthVisible] = useState(false);
  const [oauthUrl, setOauthUrl] = useState("");
  const [oauthShowKeyInput, setOauthShowKeyInput] = useState(false);
  const [oauthKeyValue, setOauthKeyValue] = useState("");
  const [oauthTitle, setOauthTitle] = useState("Claude Sign In");
  const [oauthDescription, setOauthDescription] = useState(
    "Claude Code is asking you to finish OAuth in the browser.",
  );

  useEffect(() => {
    connectedUsersRef.current = connectedUsers;
  }, [connectedUsers]);

  useEffect(() => {
    currentUserNameRef.current = currentUserName;
  }, [currentUserName]);

  useEffect(() => {
    onClaudeReadyRef.current = onClaudeReady;
  }, [onClaudeReady]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);

  useEffect(() => {
    onTtyInputRef.current = onTtyInput;
  }, [onTtyInput]);

  useEffect(() => {
    const container = terminalContainerRef.current;
    if (!container || container.clientWidth === 0 || container.clientHeight === 0) {
      // Container has no dimensions yet — wait for layout via ResizeObserver
      if (container) {
        const ro = new ResizeObserver(() => {
          if (container.clientWidth > 0 && container.clientHeight > 0) {
            ro.disconnect();
            // Re-trigger this effect by forcing a state update
            container.dataset.ready = "1";
            setTermReady(v => !v);
          }
        });
        ro.observe(container);
        return () => ro.disconnect();
      }
      return;
    }

    const term = new XTerm({
      cursorBlink: false,
      cursorStyle: "bar",
      cursorWidth: 1,
      cursorInactiveStyle: "none",
      fontSize: typeof window !== "undefined" && window.innerWidth <= 600 ? 10 : 14,
      fontFamily: '"JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: "#0C0A14",
        foreground: "#E8E2F4",
        cursor: "transparent",
        selectionBackground: "#264f78",
      },
      disableStdin: true,
      scrollback: typeof window !== "undefined" && window.innerWidth <= 600 ? 2000 : 5000,
    });
    const fitAddon = new FitAddon();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    term.loadAddon(fitAddon);
    term.open(container);
    try { fitAddon.fit(); } catch {}
    if (pendingResetRef.current) {
      term.clear();
      term.reset();
      pendingResetRef.current = false;
      setInteractive(true);
    }
    onReadyRef.current();

    const isNearBottom = () => term.buffer.active.viewportY >= term.buffer.active.baseY - 5;

    const notifyResize = () => {
      const { cols, rows } = term;
      if (cols > 0 && rows > 0) onResizeRef.current?.(cols, rows);
    };

    const handleResize = () => {
      const nextFontSize = window.innerWidth <= 600 ? 10 : 14;
      if (term.options.fontSize !== nextFontSize) term.options.fontSize = nextFontSize;
      try { fitAddon.fit(); notifyResize(); } catch {}
    };

    const resizeObserver = new ResizeObserver(() => { try { fitAddon.fit(); notifyResize(); } catch {} });

    term.element?.addEventListener("wheel", () => {
      userScrolledUpRef.current = !isNearBottom();
    }, { passive: true });
    term.element?.addEventListener("touchmove", () => {
      userScrolledUpRef.current = !isNearBottom();
    }, { passive: true });
    term.element?.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "PageUp" || event.key === "ArrowUp") {
        userScrolledUpRef.current = true;
      }
    }, { passive: true });
    container.addEventListener("click", () => {
      if (interactiveRef.current) term.focus();
    });
    term.onData((data: string) => {
      if (!interactiveRef.current) return;
      onTtyInputRef.current(data);
    });

    resizeObserver.observe(container);
    window.addEventListener("resize", handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      term.dispose();
      fitAddonRef.current = null;
      termRef.current = null;
    };
  }, [termReady]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    interactiveRef.current = interactive;
    term.options.disableStdin = !interactive;
    if (interactive) {
      term.options.cursorBlink = true;
      term.options.cursorWidth = 1;
      term.options.cursorInactiveStyle = "outline";
      term.options.theme = { ...term.options.theme, cursor: "#E8A838" };
      term.focus();
    } else {
      term.options.cursorBlink = false;
      term.options.cursorWidth = 1;
      term.options.cursorInactiveStyle = "none";
      term.options.theme = { ...term.options.theme, cursor: "transparent" };
    }
  }, [interactive]);

  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden && oauthOpenedRef.current && oauthVisible) {
        setOauthShowKeyInput(true);
        setOauthTitle("Paste Your Code");
        setOauthDescription("Signed in? Paste the code from the browser below.");
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [oauthVisible]);

  const hideOauthModal = () => {
    setOauthVisible(false);
    setOauthUrl("");
    setOauthShowKeyInput(false);
    setOauthKeyValue("");
    setOauthTitle("Claude Sign In");
    setOauthDescription("Claude Code is asking you to finish OAuth in the browser.");
    oauthOpenedRef.current = false;
  };

  const getCurrentTerminalText = () => {
    const term = termRef.current;
    if (!term) return "";
    const buffer = term.buffer.active;
    const start = buffer.viewportY;
    const lines: string[] = [];
    for (let index = start; index < start + term.rows; index += 1) {
      const line = buffer.getLine(index);
      if (line) lines.push(line.translateToString(true));
    }
    return lines.join("\n");
  };

  const extractOauthUrlFromCurrentScreen = () => {
    const squashed = getCurrentTerminalText().replace(/\s+/g, "");
    if (!squashed.includes("Pastecodehereifprompted>")) return "";
    const prefix = "https://claude.ai/oauth/authorize?";
    const start = squashed.lastIndexOf(prefix);
    if (start === -1) return "";
    const afterStart = squashed.slice(start);
    const endMarker = afterStart.indexOf("Pastecodehereifprompted>");
    const candidate = endMarker === -1 ? afterStart : afterStart.slice(0, endMarker);
    if (!candidate.includes("client_id=") && !candidate.includes("response_type=")) return "";
    const match = candidate.match(/^https:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/);
    return match ? match[0] : "";
  };

  const maybeShowOauthModal = () => {
    const foundUrl = extractOauthUrlFromCurrentScreen();
    if (foundUrl) {
      setOauthUrl(foundUrl);
      setOauthVisible(true);
      if (oauthOpenedRef.current) {
        setOauthShowKeyInput(true);
        setOauthTitle("Paste Your Code");
        setOauthDescription("Signed in? Paste the code from the browser below.");
      }
      return;
    }

    if (oauthUrl) hideOauthModal();
  };

  const submitOauthKey = () => {
    const key = oauthKeyValue.trim();
    if (!key) return;
    onTtyInputRef.current(`${key}\r`);
    hideOauthModal();
  };

  useImperativeHandle(ref, () => ({
    fit() {
      try { fitAddonRef.current?.fit(); } catch {}
    },

    handleDisconnect() {
      awaitingClaudeReadyRef.current = false;
      hideOauthModal();
      setInteractive(false);
    },

    hideOauthModal,

    resetForSession() {
      awaitingClaudeReadyRef.current = true;
      pendingResetRef.current = true;
      hideOauthModal();
      if (!termRef.current) return;
      termRef.current.clear();
      termRef.current.reset();
      pendingResetRef.current = false;
      setInteractive(true);
    },

    setInteractiveMode(next: boolean) {
      setInteractive(Boolean(next));
    },

    writeOutput(data: string) {
      const term = termRef.current;
      if (!term) return;

      const viewport = userScrolledUpRef.current ? term.buffer.active.viewportY : -1;
      term.write(colorizeOutput(data, connectedUsersRef.current, currentUserNameRef.current), () => {
        if (viewport >= 0) term.scrollLines(viewport - term.buffer.active.viewportY);
        else term.scrollToBottom();

        maybeShowOauthModal();
        if (awaitingClaudeReadyRef.current && isClaudeReadyScreen(data)) {
          awaitingClaudeReadyRef.current = false;
          hideOauthModal();
          setInteractive(false);
          onClaudeReadyRef.current();
        }
      });
    },
  }), [oauthKeyValue, oauthUrl]);

  return (
    <>
      <div id="oauth-modal" className={oauthVisible ? "visible" : ""}>
        <div className="modal-box oauth-modal-box">
          <h2 id="oauth-modal-title">{oauthTitle}</h2>
          <p id="oauth-modal-desc">{oauthDescription}</p>
          {!oauthShowKeyInput ? <div id="oauth-url-preview">{oauthUrl}</div> : null}
          {!oauthShowKeyInput ? (
            <div id="oauth-default-actions" className="oauth-modal-actions">
              <button className="secondary-btn" type="button" onClick={hideOauthModal}>
                Dismiss
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!oauthUrl) return;
                  window.open(oauthUrl, "_blank", "noopener,noreferrer");
                  oauthOpenedRef.current = true;
                  setOauthShowKeyInput(true);
                  setOauthTitle("Paste Your Code");
                  setOauthDescription("Signed in? Paste the code from the browser below.");
                }}
              >
                Open Sign In
              </button>
            </div>
          ) : (
            <div id="oauth-key-input" style={{ display: "block", marginTop: 18 }}>
              <p style={{ color: "#9B8FC2", fontSize: 13, marginBottom: 10 }}>
                Paste the code from the sign-in page, or enter your Anthropic API key:
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  id="oauth-key-field"
                  type="text"
                  placeholder="Paste code or API key here..."
                  style={{
                    flex: 1,
                    background: "#0C0A14",
                    border: "1px solid rgba(168, 85, 247, 0.12)",
                    color: "#E8E2F4",
                    padding: "10px 14px",
                    borderRadius: 6,
                    fontSize: 14,
                    fontFamily: "'SF Mono', Monaco, monospace",
                    outline: "none",
                  }}
                  value={oauthKeyValue}
                  onChange={(event) => setOauthKeyValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    submitOauthKey();
                  }}
                />
                <button
                  id="oauth-key-submit"
                  type="button"
                  style={{
                    background: "#E8A838",
                    color: "white",
                    border: "none",
                    padding: "10px 20px",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                  }}
                  onClick={submitOauthKey}
                >
                  Submit
                </button>
              </div>
              <div className="oauth-modal-actions" style={{ marginTop: 12 }}>
                <button className="secondary-btn" type="button" onClick={hideOauthModal}>
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div id="terminal-container" style={{ position: "relative" }} className={interactive ? "interactive" : ""}>
        <div ref={terminalContainerRef} style={{ height: "100%", width: "100%" }}></div>
        {children}
      </div>
    </>
  );
});
