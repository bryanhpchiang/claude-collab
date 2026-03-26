import type {
  ClipboardEvent,
  DragEvent,
  KeyboardEvent,
  RefObject,
} from "react";
import { nameColor } from "../lib/colors.js";
import {
  formatSessionTime,
  renderMentions,
} from "../lib/format.js";
import type {
  ChatEntry,
  PendingMention,
} from "../types";
import type { SlashCommand } from "../hooks/useRuntimeComposer";

const KEY_MAP: Record<string, string> = {
  Enter: "\r",
  Esc: "\x1b",
  Tab: "\t",
  Space: " ",
  Up: "\x1b[A",
  Down: "\x1b[B",
  Left: "\x1b[D",
  Right: "\x1b[C",
  "Ctrl+C": "\x03",
  "Ctrl+B": "\x02",
  y: "y",
  n: "n",
};

type ChatPanelProps = {
  canSendMessages: boolean;
  chatCollapsed: boolean;
  chatEntries: ChatEntry[];
  chatLogRef: RefObject<HTMLDivElement>;
  chatUnread: number;
  draggingOver: boolean;
  mentionActiveIndex: number;
  mentionDropdownVisible: boolean;
  mentionOptions: string[];
  mentionsBanner: PendingMention[];
  message: string;
  messageInputRef: RefObject<HTMLTextAreaElement>;
  myName: string;
  sendFailed: boolean;
  slashActiveIndex: number;
  slashDropdownVisible: boolean;
  slashOptions: SlashCommand[];
  typingUsers: string[];
  uploadingImage: boolean;
  onCompleteSlashCommand(cmd: SlashCommand): void;
  onCompleteMention(user: string): void;
  onDismissMentions(): void;
  onDragEnter(event: DragEvent<HTMLDivElement>): void;
  onDragLeave(event: DragEvent<HTMLDivElement>): void;
  onDragOver(event: DragEvent<HTMLDivElement>): void;
  onDrop(event: DragEvent<HTMLDivElement>): void;
  onMessageChange(nextValue: string, cursor: number): void;
  onMessageClick(cursor: number): void;
  onMessageKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void;
  onMessagePaste(event: ClipboardEvent<HTMLTextAreaElement>): void;
  onSendKey(label: string, seq: string): void;
  onSendMessage(): void;
  onToggleCollapsed(): void;
};

function TypingDots() {
  return (
    <span className="typing-dots">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </span>
  );
}

function TypingIndicator({ users }: { users: string[] }) {
  if (!users.length) return null;
  const label = users.length === 1
    ? <><span style={{ color: nameColor(users[0]) }}>{users[0]}</span> is typing</>
    : users.length === 2
    ? <><span style={{ color: nameColor(users[0]) }}>{users[0]}</span> and <span style={{ color: nameColor(users[1]) }}>{users[1]}</span> are typing</>
    : <>{users.length} people are typing</>;
  return (
    <div className="typing-indicator">
      {label}
      <TypingDots />
    </div>
  );
}

export function ChatPanel({
  canSendMessages,
  chatCollapsed,
  chatEntries,
  chatLogRef,
  chatUnread,
  draggingOver,
  mentionActiveIndex,
  mentionDropdownVisible,
  mentionOptions,
  mentionsBanner,
  message,
  messageInputRef,
  myName,
  sendFailed,
  slashActiveIndex,
  slashDropdownVisible,
  slashOptions,
  typingUsers,
  uploadingImage,
  onCompleteSlashCommand,
  onCompleteMention,
  onDismissMentions,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onMessageChange,
  onMessageClick,
  onMessageKeyDown,
  onMessagePaste,
  onSendKey,
  onSendMessage,
  onToggleCollapsed,
}: ChatPanelProps) {
  return (
    <div id="bottom-panel" className={chatCollapsed ? "collapsed" : ""}>
      <div id="chat-toggle" onClick={onToggleCollapsed}>
        <span className="toggle-label">
          <span className="toggle-arrow">&#9660;</span> Chat
        </span>
        <span className="toggle-right">
          {chatCollapsed && typingUsers.length > 0 && (
            <span className="typing-pill">
              {typingUsers.length === 1
                ? <><span style={{ color: nameColor(typingUsers[0]) }}>{typingUsers[0]}</span> typing</>
                : <>{typingUsers.length} typing</>}
              <TypingDots />
            </span>
          )}
          <span id="chat-badge" style={{ display: chatUnread > 0 ? "inline" : "none" }}>
            {chatUnread > 99 ? "99+" : chatUnread}
          </span>
        </span>
      </div>

      <div id="key-bar">
        {Object.keys(KEY_MAP).map((label) => (
          <button
            className="key-btn"
            data-label={label}
            key={label}
            type="button"
            onClick={() => onSendKey(label, KEY_MAP[label])}
          >
            {label}
          </button>
        ))}
      </div>

      <div id="mentions-banner" style={{ display: mentionsBanner.length ? "block" : "none" }}>
        {mentionsBanner.length ? (
          <>
            <div className="banner-title">You were mentioned while away</div>
            {mentionsBanner.map((mention) => {
              const preview = mention.text.length > 60 ? `${mention.text.slice(0, 60)}...` : mention.text;
              return (
                <div className="banner-msg" key={`${mention.timestamp}-${mention.from}`}>
                  <span className="banner-from">{mention.from}</span> in <strong>{mention.sessionName}</strong>:{" "}
                  <span dangerouslySetInnerHTML={{ __html: renderMentions(preview, myName) }}></span>{" "}
                  <span style={{ color: "#9B8FC2", fontSize: 11 }}>
                    {formatSessionTime(new Date(mention.timestamp).toISOString())}
                  </span>
                </div>
              );
            })}
            <button className="banner-close" title="Dismiss" type="button" onClick={onDismissMentions}>
              &times;
            </button>
          </>
        ) : null}
      </div>

      <div id="chat-log" ref={chatLogRef}>
        {chatEntries.map((entry, index) => (
          <div className={`chat-msg${entry.type === "system" ? " system" : ""}`} key={`${entry.type}-${index}`}>
            {entry.type === "chat" ? (
              <>
                <span className="name" style={{ color: nameColor(entry.name) }}>{entry.name}</span>:{" "}
                <span
                  className="text"
                  dangerouslySetInnerHTML={{ __html: renderMentions(entry.text, myName) }}
                ></span>
              </>
            ) : (
              entry.text
            )}
          </div>
        ))}
        <TypingIndicator users={typingUsers} />
      </div>

      <div
        id="input-area"
        className={draggingOver ? "drag-over" : ""}
        style={{ position: "relative" }}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div
          className="name-tag"
          id="my-name-tag"
          style={{
            display: myName ? "block" : "none",
            color: myName ? nameColor(myName) : "",
          }}
        >
          {myName}
        </div>
        <textarea
          id="msg-input"
          ref={messageInputRef}
          rows={1}
          placeholder={uploadingImage ? "Uploading image..." : "Type a message to Claude..."}
          disabled={!canSendMessages}
          style={uploadingImage ? { borderColor: "#E8A838" } : undefined}
          value={message}
          onChange={(event) => {
            const nextValue = event.target.value;
            onMessageChange(nextValue, event.target.selectionStart ?? nextValue.length);
            const el = event.target;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
          }}
          onClick={(event) => {
            onMessageClick(event.currentTarget.selectionStart ?? message.length);
          }}
          onKeyDown={onMessageKeyDown}
          onPaste={onMessagePaste}
        />
        <button id="send-btn" disabled={!canSendMessages} type="button" onClick={onSendMessage}>
          Send
        </button>
        {sendFailed && (
          <span style={{ color: "#E8A838", fontSize: 11, marginLeft: 6 }}>Connection lost, reconnecting...</span>
        )}
        <div id="mention-dropdown" style={{ display: mentionDropdownVisible ? "block" : "none" }}>
          {mentionOptions.map((user, index) => (
            <div
              className={`mention-option${index === mentionActiveIndex ? " active" : ""}`}
              key={user}
              onMouseDown={(event) => {
                event.preventDefault();
                onCompleteMention(user);
              }}
            >
              <span className="mention-dot"></span>
              <span style={{ color: nameColor(user) }}>{user}</span>
            </div>
          ))}
        </div>
        <div id="slash-dropdown" style={{ display: slashDropdownVisible ? "block" : "none" }}>
          {slashOptions.map((cmd, index) => (
            <div
              className={`slash-option${index === slashActiveIndex ? " active" : ""}`}
              key={cmd.name}
              onMouseDown={(event) => {
                event.preventDefault();
                onCompleteSlashCommand(cmd);
              }}
            >
              <span className="slash-name">{cmd.name}</span>
              <span className="slash-desc">{cmd.description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
