import { useRef, useState } from "react";
import { markdownToHtml } from "../lib/format.js";
import type { RuntimeSecret } from "../types";

export function useRuntimeSidebar(emptyStateHtml: string) {
  const pollTimerRef = useRef<number | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [secretsOpen, setSecretsOpen] = useState(false);
  const [stateSummaryHtml, setStateSummaryHtml] = useState(emptyStateHtml);
  const [lastUpdatedText, setLastUpdatedText] = useState("");
  const [updatingSummary, setUpdatingSummary] = useState(false);
  const [secretType, setSecretType] = useState("GitHub Token");
  const [secretCustomName, setSecretCustomName] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [secrets, setSecrets] = useState<RuntimeSecret[]>([]);

  const stopPolling = () => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const resetSummary = () => {
    stopPolling();
    setStateSummaryHtml(emptyStateHtml);
    setLastUpdatedText("");
    setUpdatingSummary(false);
  };

  const fetchStateSummary = async () => {
    setUpdatingSummary(true);

    try {
      const response = await fetch("/api/state-summary");
      const data = await response.json();
      if (!data.markdown || !data.markdown.trim()) {
        setStateSummaryHtml(emptyStateHtml);
        setLastUpdatedText("");
        return;
      }

      setStateSummaryHtml(markdownToHtml(data.markdown));
      const timestamp = data.lastModified && data.lastModified > 0 ? new Date(data.lastModified) : new Date();
      setLastUpdatedText(
        `Updated ${timestamp.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
      );
    } catch {
      setStateSummaryHtml(emptyStateHtml);
      setLastUpdatedText("");
    } finally {
      setUpdatingSummary(false);
    }
  };

  const fetchSecrets = async () => {
    try {
      const response = await fetch("/api/secrets");
      setSecrets(await response.json());
    } catch {
      setSecrets([]);
    }
  };

  const startPolling = () => {
    stopPolling();
    pollTimerRef.current = window.setInterval(() => {
      fetchStateSummary().catch(() => undefined);
    }, 15000);
  };

  const toggleSidebar = () => {
    const nextOpen = !sidebarOpen;
    setSidebarOpen(nextOpen);
    if (nextOpen) {
      fetchStateSummary().catch(() => undefined);
      fetchSecrets().catch(() => undefined);
    }
  };

  const toggleSecrets = () => {
    const nextOpen = !secretsOpen;
    setSecretsOpen(nextOpen);
    if (nextOpen) fetchSecrets().catch(() => undefined);
  };

  const saveSecret = async () => {
    const name = secretType === "Custom" ? secretCustomName.trim() : secretType;
    if (!name || !secretValue) return;

    try {
      await fetch("/api/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, value: secretValue }),
      });
      setSecretValue("");
      setSecretCustomName("");
      fetchSecrets().catch(() => undefined);
    } catch {}
  };

  const removeSecret = async (name: string) => {
    await fetch(`/api/secrets/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    fetchSecrets().catch(() => undefined);
  };

  return {
    fetchSecrets,
    fetchStateSummary,
    lastUpdatedText,
    removeSecret,
    resetSummary,
    saveSecret,
    secretCustomName,
    secretType,
    secretValue,
    secrets,
    secretsOpen,
    setSecretCustomName,
    setSecretType,
    setSecretValue,
    setSidebarOpen,
    sidebarOpen,
    startPolling,
    stateSummaryHtml,
    stopPolling,
    toggleSecrets,
    toggleSidebar,
    updatingSummary,
  };
}
