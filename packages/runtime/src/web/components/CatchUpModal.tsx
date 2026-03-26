import { useEffect, useState, type ReactNode } from "react";

type CatchUpModalProps = {
  open: boolean;
  onDismiss(): void;
};

export function CatchUpModal({ open, onDismiss }: CatchUpModalProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/state-summary")
      .then((res) => res.json())
      .then((data) => setContent(data.markdown || ""))
      .catch(() => setContent(""))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const dateStr = new Date().toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const isEmpty = !loading && (content === null || content.trim() === "");

  return (
    <div id="name-modal" style={{ zIndex: 150 }}>
      <div
        className="modal-box oauth-modal-box"
        style={{ maxHeight: "80vh", display: "flex", flexDirection: "column", overflowY: "hidden" }}
      >
        <div style={{ marginBottom: 4 }}>
          <h2
            style={{
              background: "linear-gradient(135deg, #E8A838, #D4872C)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              fontSize: 22,
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            Welcome to this Jam
          </h2>
          <p style={{ color: "#9B8FC2", fontSize: 12, margin: 0 }}>{dateStr}</p>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            marginTop: 16,
            marginBottom: 16,
            background: "#0C0A14",
            border: "1px solid rgba(168, 85, 247, 0.12)",
            borderRadius: 8,
            padding: "12px 16px",
            minHeight: 80,
            maxHeight: 400,
            fontSize: 13,
            color: "#D4CCE8",
            lineHeight: 1.6,
          }}
        >
          {loading ? (
            <div style={{ color: "#5B4F7A", textAlign: "center", padding: "20px 0" }}>Loading…</div>
          ) : isEmpty ? (
            <div style={{ color: "#5B4F7A", textAlign: "center", padding: "20px 0" }}>
              No activity yet in this session
            </div>
          ) : (
            <StateMarkdown content={content!} />
          )}
        </div>

        <div className="oauth-modal-actions">
          <button
            type="button"
            style={{
              background: "linear-gradient(135deg, #E8A838, #D4872C)",
              border: "none",
              color: "#fff",
              padding: "10px 28px",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 15,
              fontWeight: 600,
            }}
            onClick={onDismiss}
          >
            Let's go
          </button>
        </div>
      </div>
    </div>
  );
}

function StateMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      elements.push(
        <h3
          key={i}
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#E8A838",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            margin: "14px 0 6px",
          }}
        >
          {line.slice(3)}
        </h3>,
      );
    } else if (line.startsWith("# ")) {
      elements.push(
        <h2 key={i} style={{ fontSize: 15, fontWeight: 700, color: "#E8E2F4", margin: "10px 0 6px" }}>
          {line.slice(2)}
        </h2>,
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <div key={i} style={{ paddingLeft: 14, margin: "2px 0" }}>
          <span style={{ color: "#E8A838", marginRight: 6 }}>•</span>
          <InlineMarkdown text={line.slice(2)} />
        </div>,
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} style={{ height: 4 }} />);
    } else {
      elements.push(
        <p key={i} style={{ margin: "4px 0" }}>
          <InlineMarkdown text={line} />
        </p>,
      );
    }
  }

  return <>{elements}</>;
}

function InlineMarkdown({ text }: { text: string }) {
  // Handle **bold**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} style={{ color: "#E8E2F4" }}>
            {part.slice(2, -2)}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  );
}
