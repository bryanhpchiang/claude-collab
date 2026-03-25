export type AuthenticatedRuntimeUser = {
  id: string;
  email: string;
  login: string;
  name: string;
  avatar_url: string;
};

export type SessionSummary = {
  id: string;
  name: string;
  projectId: string;
  users: string[];
  createdAt: number;
};

export type ProjectSummary = {
  id: string;
  name: string;
  cwd: string;
  sessionCount: number;
  sessions: SessionSummary[];
  createdAt: number;
};

export type DiskSession = {
  claudeSessionId: string;
  project: string;
  firstMessage: string;
  timestamp: string;
  lastModified: string;
};

export type PendingMention = {
  from: string;
  text: string;
  sessionId: string;
  sessionName: string;
  timestamp: number;
};

export type RuntimeSecret = {
  name: string;
  createdBy: string;
  createdAt: number;
};

export type ChatEntry =
  | { type: "chat"; name: string; text: string; timestamp?: number }
  | { type: "system"; text: string; timestamp?: number };

export type RuntimeBootstrap = {
  initialUser: AuthenticatedRuntimeUser | null;
  requestedSessionId: string | null;
};
