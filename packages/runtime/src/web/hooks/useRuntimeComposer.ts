import {
  type ClipboardEvent,
  type KeyboardEvent,
  useRef,
  useState,
} from "react";

type MentionContext = {
  start: number;
  end: number;
  query: string;
};

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
  const messageInputRef = useRef<HTMLInputElement | null>(null);

  const [message, setMessage] = useState("");
  const [mentionContext, setMentionContext] = useState<MentionContext | null>(null);
  const [mentionOptions, setMentionOptions] = useState<string[]>([]);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [uploadingImage, setUploadingImage] = useState(false);

  const sendWsRef = useRef(sendWs);
  sendWsRef.current = sendWs;

  const messageRef = useRef(message);
  messageRef.current = message;

  const mentionDropdownVisible = mentionOptions.length > 0 && Boolean(mentionContext);

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
    sendWs({ type: "input", text, direct });
    setMessage("");
    setMentionContext(null);
    setMentionOptions([]);
    requestAnimationFrame(() => messageInputRef.current?.focus());
  };

  const handleMessageChange = (nextValue: string, cursor: number) => {
    setMessage(nextValue);
    refreshMentionState(nextValue, cursor);
  };

  const handleMessageClick = (cursor: number) => {
    refreshMentionState(message, cursor);
  };

  const handleMessageKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
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
    event.preventDefault();

    if (!message.trim()) {
      if (currentSessionId) sendWs({ type: "key", seq: "\r", label: "Enter" });
      return;
    }

    const direct = event.shiftKey;
    const wantEsc = !direct && (event.metaKey || event.ctrlKey);
    sendMessage(direct);
    if (wantEsc) sendWs({ type: "key", seq: "\x1b", label: "Esc" });
  };

  const handleImagePaste = async (event: ClipboardEvent<HTMLInputElement>) => {
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
          const currentMessage = messageRef.current.trim();
          const text = currentMessage ? `${currentMessage} ${data.path}` : data.path;
          sendWsRef.current({ type: "input", text, direct: false });
          setMessage("");
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

  return {
    completeMention,
    handleImagePaste,
    handleMessageChange,
    handleMessageClick,
    handleMessageKeyDown,
    mentionActiveIndex,
    mentionDropdownVisible,
    mentionOptions,
    message,
    messageInputRef,
    sendMessage,
    uploadingImage,
  };
}
