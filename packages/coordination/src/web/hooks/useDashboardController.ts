import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CoordinationUser,
  DashboardAccessState,
  DashboardJam,
} from "../types";

type UseDashboardControllerOptions = {
  initialJams: DashboardJam[];
  user: CoordinationUser;
};

function createAccessState(): DashboardAccessState {
  return {
    jamId: "",
    jamName: "",
    loading: false,
    error: "",
    creatingLink: false,
    revokingInviteId: "",
    removingMemberId: "",
    members: [],
    inviteLinks: [],
    generatedUrls: {},
  };
}

function hasActiveJam(jams: DashboardJam[], userId: string) {
  return jams.some(
    (jam) =>
      jam.creator.user_id === userId &&
      (jam.state === "pending" || jam.state === "running"),
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function safeJson(response: Response) {
  return response.json().catch(() => ({}));
}

async function ensureAuthorized(response: Response) {
  if (response.status === 401) {
    window.location.href = "/auth/github";
    return false;
  }
  return true;
}

export function useDashboardController({ initialJams, user }: UseDashboardControllerOptions) {
  const [jams, setJams] = useState(initialJams);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createName, setCreateName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [access, setAccess] = useState<DashboardAccessState>(createAccessState);

  const activeJamExists = useMemo(() => hasActiveJam(jams, user.id), [jams, user.id]);

  const closeAccessModal = useCallback(() => {
    setAccess(createAccessState());
  }, []);

  const closeCreateModal = useCallback(() => {
    if (creating) return;
    setCreateModalOpen(false);
    setCreateError("");
  }, [creating]);

  const loadJams = async () => {
    try {
      const response = await fetch("/api/jams");
      if (!(await ensureAuthorized(response))) return;
      if (!response.ok) {
        throw new Error(`Failed to fetch jams (${response.status})`);
      }
      setJams(await response.json());
      setError((current) => (current.startsWith("Failed to fetch") ? "" : current));
    } catch (nextError) {
      setError(getErrorMessage(nextError, "Failed to fetch jams"));
    }
  };

  useEffect(() => {
    const hasPending = jams.some((jam) => jam.state === "pending");
    if (!hasPending) return;
    const timer = window.setInterval(() => {
      loadJams().catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [jams]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closeAccessModal();
      closeCreateModal();
    };

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [closeAccessModal, closeCreateModal]);

  const loadAccess = async (jamId: string) => {
    setAccess((current) => ({ ...current, loading: true, error: "" }));

    try {
      const response = await fetch(`/api/jams/${encodeURIComponent(jamId)}/members`);
      if (!(await ensureAuthorized(response))) return;
      if (!response.ok) {
        const body = await safeJson(response);
        throw new Error(body.error || `Failed to load access (${response.status})`);
      }

      const payload = await response.json();
      setAccess((current) => ({
        ...current,
        loading: false,
        error: "",
        members: payload.members || [],
        inviteLinks: payload.inviteLinks || [],
      }));
    } catch (nextError) {
      setAccess((current) => ({
        ...current,
        loading: false,
        error: getErrorMessage(nextError, "Failed to load access controls"),
      }));
    }
  };

  const createJam = async (nameOverride?: string) => {
    if (activeJamExists) return;

    setCreating(true);
    setCreateError("");

    try {
      const response = await fetch("/api/jams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: (nameOverride ?? createName).trim() || undefined }),
      });

      if (!(await ensureAuthorized(response))) return;
      if (!response.ok) {
        const body = await safeJson(response);
        throw new Error(body.error || `Failed to create instance (${response.status})`);
      }

      setCreateName("");
      setCreateModalOpen(false);
      setCreateError("");
      setError("");
      await loadJams();
    } catch (nextError) {
      setCreateError(getErrorMessage(nextError, "Failed to create instance"));
    } finally {
      setCreating(false);
    }
  };

  const deleteJam = async (jamId: string) => {
    setDeletingId(jamId);

    try {
      const response = await fetch(`/api/jams/${encodeURIComponent(jamId)}`, {
        method: "DELETE",
      });
      if (!(await ensureAuthorized(response))) return;
      if (!response.ok) {
        const body = await safeJson(response);
        throw new Error(body.error || `Failed to terminate instance (${response.status})`);
      }

      setError("");
      setAccess((current) => (current.jamId === jamId ? createAccessState() : current));
      await loadJams();
    } catch (nextError) {
      setError(getErrorMessage(nextError, "Failed to terminate instance"));
    } finally {
      setDeletingId(null);
    }
  };

  const restartJam = async (jamId: string) => {
    const jam = jams.find((entry) => entry.id === jamId);
    await deleteJam(jamId);
    if (!jam) return;
    await createJam(jam.name || "");
  };

  const openAccessModal = (jamId: string) => {
    const jam = jams.find((entry) => entry.id === jamId);
    if (!jam) return;

    setAccess({
      ...createAccessState(),
      jamId,
      jamName: jam.name || `jam-${jam.id}`,
      loading: true,
    });
    loadAccess(jamId).catch(() => undefined);
  };

  const createInviteLink = async () => {
    if (!access.jamId) return;
    setAccess((current) => ({ ...current, creatingLink: true }));

    try {
      const response = await fetch(
        `/api/jams/${encodeURIComponent(access.jamId)}/invite-links`,
        { method: "POST" },
      );
      if (!(await ensureAuthorized(response))) return;
      if (!response.ok) {
        const body = await safeJson(response);
        throw new Error(body.error || `Failed to create invite link (${response.status})`);
      }

      const payload = await response.json();
      setAccess((current) => ({
        ...current,
        creatingLink: false,
        inviteLinks: [
          {
            id: payload.id,
            created_at: payload.created_at,
            jam_id: current.jamId,
            created_by_user_id: user.id,
          },
          ...current.inviteLinks,
        ],
        generatedUrls: {
          ...current.generatedUrls,
          [payload.id]: payload.url,
        },
      }));

      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(payload.url).catch(() => undefined);
      }
    } catch (nextError) {
      setAccess((current) => ({
        ...current,
        creatingLink: false,
        error: getErrorMessage(nextError, "Failed to create invite link"),
      }));
    }
  };

  const revokeInviteLink = async (linkId: string) => {
    if (!access.jamId) return;
    setAccess((current) => ({ ...current, revokingInviteId: linkId }));

    try {
      const response = await fetch(
        `/api/jams/${encodeURIComponent(access.jamId)}/invite-links/${encodeURIComponent(linkId)}`,
        { method: "DELETE" },
      );
      if (!(await ensureAuthorized(response))) return;
      if (!response.ok) {
        const body = await safeJson(response);
        throw new Error(body.error || `Failed to revoke invite link (${response.status})`);
      }

      setAccess((current) => ({
        ...current,
        revokingInviteId: "",
        inviteLinks: current.inviteLinks.map((link) =>
          link.id === linkId ? { ...link, revoked_at: new Date().toISOString() } : link,
        ),
      }));
    } catch (nextError) {
      setAccess((current) => ({
        ...current,
        revokingInviteId: "",
        error: getErrorMessage(nextError, "Failed to revoke invite link"),
      }));
    }
  };

  const removeMember = async (userId: string) => {
    if (!access.jamId) return;
    setAccess((current) => ({ ...current, removingMemberId: userId }));

    try {
      const response = await fetch(
        `/api/jams/${encodeURIComponent(access.jamId)}/members/${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      );
      if (!(await ensureAuthorized(response))) return;
      if (!response.ok) {
        const body = await safeJson(response);
        throw new Error(body.error || `Failed to remove member (${response.status})`);
      }

      setAccess((current) => ({
        ...current,
        removingMemberId: "",
        members: current.members.filter((member) => member.user_id !== userId),
      }));
    } catch (nextError) {
      setAccess((current) => ({
        ...current,
        removingMemberId: "",
        error: getErrorMessage(nextError, "Failed to remove member"),
      }));
    }
  };

  const copyInviteLink = async (linkId: string) => {
    const url = access.generatedUrls[linkId];
    if (!url || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(url).catch(() => undefined);
  };

  return {
    access,
    activeJamExists,
    createError,
    createJam,
    createModalOpen,
    createName,
    creating,
    deletingId,
    error,
    jams,
    openAccessModal,
    restartJam,
    setCreateError,
    setCreateModalOpen,
    setCreateName,
    setError,
    closeAccessModal,
    closeCreateModal,
    createInviteLink,
    revokeInviteLink,
    removeMember,
    copyInviteLink,
    deleteJam,
    user,
  };
}
