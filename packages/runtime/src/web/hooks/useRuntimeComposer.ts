import {
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  useRef,
  useState,
} from "react";

type MentionContext = {
  start: number;
  end: number;
  query: string;
};

export type SlashCommand = {
  name: string;
  description: string;
};

const SLASH_COMMANDS: SlashCommand[] = [
  { name: "/help", description: "Get help" },
  { name: "/clear", description: "Clear conversation" },
  { name: "/compact", description: "Compact conversation" },
  { name: "/config", description: "View configuration" },
  { name: "/cost", description: "Show token usage" },
  { name: "/doctor", description: "Check system health" },
  { name: "/init", description: "Initialize workspace" },
  { name: "/login", description: "Authenticate" },
  { name: "/logout", description: "Sign out" },
  { name: "/review", description: "Review code" },
  { name: "/vim", description: "Toggle vim mode" },
  { name: "/terminal-setup", description: "Setup terminal" },
];

function getSlashContext(value: string): string | null {
  if (!value.startsWith("/")) return null;
  const spaceIdx = value.indexOf(" ");
  if (spaceIdx !== -1) return null;
  return value.slice(1).toLowerCase();
}

function filterSlashCommands(query: string): SlashCommand[] {
  if (query === "") return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((cmd) =>
    cmd.name.slice(1).startsWith(query) || cmd.name.slice(1).includes(query)
  );
}

type UseRuntimeComposerOptions = {
  appendSystem(text: string): void;
  connectedUsers: string[];
  currentSessionId: string | null;
  myName: string;
  sendWs(payload: unknown): boolean;
};

function getMentionContext(value: string, cursor: number) {
  let index = cursor - 1;
  while (index >= 0 && /\w/.test(value[index])) index -= 1;
  if (index >= 0 && value[index] === "@") {
    return {
      start: index,
      end: cursor,
      query: value.slice(index + 1, cursor).toLowerCase(),
    } satisfies MentionContext;
  }
  return null;
}

function filterMentionUsers(users: string[], currentUserName: string, query: string) {
  const lowerCurrentUser = currentUserName.toLowerCase();
  const startsWith = users.filter((user) => (
    user.toLowerCase() !== lowerCurrentUser &&
    user.toLowerCase().startsWith(query)
  ));
  const includes = users.filter((user) => (
    user.toLowerCase() !== lowerCurrentUser &&
    !user.toLowerCase().startsWith(query) &&
    user.toLowerCase().includes(query)
  ));
  return [...startsWith, ...includes];
}

export function useRuntimeComposer({
  appendSystem,
  connectedUsers,
  currentSessionId,
  myName,
  sendWs,
}: UseRuntimeComposerOptions) {
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);

  const [message, setMessage] = useState("");
  const [mentionContext, setMentionContext] = useState<MentionContext | null>(null);
  const [mentionOptions, setMentionOptions] = useState<string[]>([]);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [draggingOver, setDraggingOver] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const dragCounter = useRef(0);

  const [slashOptions, setSlashOptions] = useState<SlashCommand[]>([]);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);

  const sendWsRef = useRef(sendWs);
  sendWsRef.current = sendWs;

  const messageRef = useRef(message);
  messageRef.current = message;

  const typingTimeoutRef = useRef<number | null>(null);
  const isTypingRef = useRef(false);

  const mentionDropdownVisible = mentionOptions.length > 0 && Boolean(mentionContext);
  const slashDropdownVisible = slashOptions.length > 0;

  const refreshSlashState = (nextValue: string) => {
    const query = getSlashContext(nextValue);
    if (query === null) {
      setSlashOptions([]);
      setSlashActiveIndex(0);
      return;
    }
    const options = filterSlashCommands(query);
    setSlashOptions(options);
    setSlashActiveIndex(0);
  };

  const completeSlashCommand = (cmd: SlashCommand) => {
    setMessage(cmd.name);
    setSlashOptions([]);
    setSlashActiveIndex(0);
    requestAnimationFrame(() => {
      messageInputRef.current?.focus();
      const pos = cmd.name.length;
      messageInputRef.current?.setSelectionRange(pos, pos);
    });
  };

  const selectAndSendSlashCommand = (cmd: SlashCommand) => {
    setSlashOptions([]);
    setSlashActiveIndex(0);
    const ok = sendWs({ type: "input", text: cmd.name, direct: false });
    if (!ok) { setSendFailed(true); return; }
    setSendFailed(false);
    setMessage("");
    requestAnimationFrame(() => messageInputRef.current?.focus());
  };

  const refreshMentionState = (nextValue: string, cursor: number) => {
    const nextContext = getMentionContext(nextValue, cursor);
    if (!nextContext) {
      setMentionContext(null);
      setMentionOptions([]);
      setMentionActiveIndex(0);
      return;
    }

    const nextOptions = filterMentionUsers(connectedUsers, myName, nextContext.query);
    setMentionContext(nextContext);
    setMentionOptions(nextOptions);
    setMentionActiveIndex(0);
  };

  const completeMention = (username: string) => {
    if (!mentionContext) return;
    const before = message.slice(0, mentionContext.start);
    const after = message.slice(mentionContext.end);
    const nextValue = `${before}@${username} ${after}`;
    const nextPosition = before.length + username.length + 2;
    setMessage(nextValue);
    setMentionContext(null);
    setMentionOptions([]);
    setMentionActiveIndex(0);
    requestAnimationFrame(() => {
      messageInputRef.current?.focus();
      messageInputRef.current?.setSelectionRange(nextPosition, nextPosition);
    });
  };

  const sendMessage = (direct = false) => {
    const text = message.trim();
    if (!text || !currentSessionId) return;
    const ok = sendWs({ type: "input", text, direct });
    if (!ok) { setSendFailed(true); return; }
    setSendFailed(false);
    setMessage("");
    setMentionContext(null);
    setMentionOptions([]);
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    sendTypingSignal(false);
    requestAnimationFrame(() => messageInputRef.current?.focus());
  };

  const sendTypingSignal = (typing: boolean) => {
    if (isTypingRef.current === typing) return;
    isTypingRef.current = typing;
    sendWsRef.current({ type: "typing", typing });
  };

  const handleMessageChange = (nextValue: string, cursor: number) => {
    setMessage(nextValue);
    refreshMentionState(nextValue, cursor);
    refreshSlashState(nextValue);

    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    if (nextValue.trim()) {
      sendTypingSignal(true);
      typingTimeoutRef.current = window.setTimeout(() => {
        sendTypingSignal(false);
      }, 3000);
    } else {
      sendTypingSignal(false);
    }
  };

  const handleMessageClick = (cursor: number) => {
    refreshMentionState(message, cursor);
  };

  const handleMessageKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashDropdownVisible && ["Enter", "Tab", "ArrowDown", "ArrowUp", "Escape"].includes(event.key)) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSlashActiveIndex((current) => (current + 1) % slashOptions.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSlashActiveIndex((current) => (current - 1 + slashOptions.length) % slashOptions.length);
      } else if (event.key === "Tab") {
        event.preventDefault();
        completeSlashCommand(slashOptions[slashActiveIndex]);
      } else if (event.key === "Enter") {
        event.preventDefault();
        selectAndSendSlashCommand(slashOptions[slashActiveIndex]);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setSlashOptions([]);
        setSlashActiveIndex(0);
      }
      return;
    }

    if (mentionDropdownVisible && ["Enter", "Tab", "ArrowDown", "ArrowUp", "Escape"].includes(event.key)) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMentionActiveIndex((current) => (current + 1) % mentionOptions.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setMentionActiveIndex((current) => (current - 1 + mentionOptions.length) % mentionOptions.length);
      } else if (event.key === "Tab" || event.key === "Enter") {
        event.preventDefault();
        completeMention(mentionOptions[mentionActiveIndex]);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setMentionContext(null);
        setMentionOptions([]);
      }
      return;
    }

    if (event.key !== "Enter") return;

    // Shift+Enter inserts a newline in the textarea
    if (event.shiftKey && !event.metaKey && !event.ctrlKey) return;

    event.preventDefault();

    if (!message.trim()) {
      if (currentSessionId) sendWs({ type: "key", seq: "\r", label: "Enter" });
      return;
    }

    const direct = event.shiftKey && (event.metaKey || event.ctrlKey);
    const wantEsc = !direct && (event.metaKey || event.ctrlKey);
    sendMessage(direct);
    if (wantEsc) sendWs({ type: "key", seq: "\x1b", label: "Esc" });

    // Reset textarea height after sending
    const el = messageInputRef.current;
    if (el) { el.style.height = "auto"; }
  };

  const handleImagePaste = async (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (!item.type.startsWith("image/")) continue;
      event.preventDefault();
      const blob = item.getAsFile();
      if (!blob) continue;

      setUploadingImage(true);
      try {
        const formData = new FormData();
        formData.append("image", blob);
        const response = await fetch("/api/upload-image", {
          method: "POST",
          body: formData,
        });
        const data = await response.json();
        if (data.path) {
          setMessage((current) => `${current ? `${current} ` : ""}${data.path} `);
          requestAnimationFrame(() => messageInputRef.current?.focus());
        } else {
          appendSystem(`Image upload failed: ${data.error || "unknown error"}`);
        }
      } catch (error: any) {
        appendSystem(`Image upload failed: ${error.message}`);
      } finally {
        setUploadingImage(false);
      }
      break;
    }
  };

  const uploadImageFile = async (file: File) => {
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const response = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (data.path) {
        setMessage((current) => `${current ? `${current} ` : ""}${data.path} `);
        requestAnimationFrame(() => messageInputRef.current?.focus());
      } else {
        appendSystem(`Image upload failed: ${data.error || "unknown error"}`);
      }
    } catch (error: any) {
      appendSystem(`Image upload failed: ${error.message}`);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current += 1;
    if (event.dataTransfer?.types.includes("Files")) {
      setDraggingOver(true);
    }
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setDraggingOver(false);
    }
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current = 0;
    setDraggingOver(false);

    const files = event.dataTransfer?.files;
    if (!files?.length) return;

    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!imageFiles.length) {
      appendSystem("Only image files are supported for drag-and-drop upload.");
      return;
    }

    for (const file of imageFiles) {
      await uploadImageFile(file);
    }
  };

  return {
    completeMention,
    completeSlashCommand,
    draggingOver,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleImagePaste,
    handleMessageChange,
    handleMessageClick,
    handleMessageKeyDown,
    mentionActiveIndex,
    mentionDropdownVisible,
    mentionOptions,
    message,
    messageInputRef,
    sendFailed,
    sendMessage,
    slashActiveIndex,
    slashDropdownVisible,
    slashOptions,
    uploadingImage,
  };
}
