import type { IPty } from "bun-pty";

export interface ChatEvent {
  type: "chat";
  name: string;
  text: string;
  timestamp: number;
}

export interface SystemEvent {
  type: "system";
  text: string;
  timestamp: number;
}

export type ChatHistoryEntry = ChatEvent | SystemEvent;

export interface Session {
  id: string;
  name: string;
  projectId: string;
  claudeSessionId?: string;
  shell: IPty;
  scrollback: string;
  chatHistory: ChatHistoryEntry[];
  createdAt: number;
}

export interface Project {
  id: string;
  name: string;
  cwd: string;
  sessions: Map<string, Session>;
  createdAt: number;
}

export interface DiskSession {
  claudeSessionId: string;
  project: string;
  firstMessage: string;
  timestamp: string;
  lastModified: string;
}

export interface PendingMention {
  from: string;
  text: string;
  sessionId: string;
  sessionName: string;
  timestamp: number;
}

export interface Secret {
  name: string;
  value: string;
  createdBy: string;
  createdAt: number;
}

export interface ClientInfo {
  name: string;
}

export interface SessionSummary {
  id: string;
  name: string;
  projectId: string;
  users: string[];
  createdAt: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  cwd: string;
  sessionCount: number;
  sessions: SessionSummary[];
  createdAt: number;
}
