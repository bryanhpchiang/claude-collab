import { $, escapeHtml } from "../lib/dom.js";
import { formatSessionTime } from "../lib/format.js";

export function createWorkspaceController({
  state,
  onJoinSession,
  onShowLobby,
  onLayoutChange,
  onError,
}) {
  const projectBar = $("project-bar");
  const sessionBar = $("session-bar");
  const newProjectButton = $("new-project-btn");
  const newSessionButton = $("new-session-btn");

  function renderProjectTabs() {
    projectBar.querySelectorAll(".project-tab").forEach((tab) => tab.remove());
    const showClose = state.projectList.length > 1;

    for (const project of state.projectList) {
      const tab = document.createElement("div");
      tab.className = `project-tab${project.id === state.currentProjectId ? " active" : ""}`;
      tab.dataset.id = project.id;
      tab.title = project.cwd;
      tab.innerHTML = `<span class="proj-name">${escapeHtml(project.name)}</span><span class="proj-count">${project.sessionCount}</span><button class="proj-close${showClose ? " visible" : ""}" title="Delete project">&times;</button>`;
      tab.querySelector(".proj-close").addEventListener("click", (event) => {
        event.stopPropagation();
        deleteProject(project.id);
      });
      tab.addEventListener("click", () => switchProject(project.id));
      projectBar.insertBefore(tab, newProjectButton);
    }
  }

  function renderSessionTabs() {
    sessionBar.querySelectorAll(".session-tab").forEach((tab) => tab.remove());
    const filtered = state.currentProjectId
      ? state.sessionList.filter((session) => session.projectId === state.currentProjectId)
      : state.sessionList;
    const showClose = filtered.length > 1;

    for (const session of filtered) {
      const tab = document.createElement("div");
      tab.className = `session-tab${session.id === state.currentSessionId ? " active" : ""}`;
      tab.dataset.id = session.id;
      tab.innerHTML = `<span class="tab-name">${escapeHtml(session.name)}</span><span class="user-count">${session.users.length}</span><button class="close-btn${showClose ? " visible" : ""}" title="Close session">&times;</button>`;
      tab.querySelector(".close-btn").addEventListener("click", (event) => {
        event.stopPropagation();
        deleteSession(session.id, session.users.length);
      });
      tab.addEventListener("click", () => onJoinSession(session.id));
      tab.addEventListener("dblclick", (event) => {
        event.stopPropagation();
        renameSession(tab, session);
      });
      sessionBar.insertBefore(tab, newSessionButton);
    }
  }

  function switchProject(projectId) {
    if (state.currentProjectId === projectId) return;
    state.currentProjectId = projectId;
    renderProjectTabs();
    renderSessionTabs();

    const sessions = state.sessionList.filter((session) => session.projectId === projectId);
    if (sessions.length === 0) {
      onShowLobby();
      return;
    }

    const general = sessions.find((session) => session.name === "General") || sessions[0];
    onJoinSession(general.id);
  }

  async function deleteProject(projectId) {
    if (state.projectList.length <= 1) return;
    const project = state.projectList.find((entry) => entry.id === projectId);
    const totalUsers = (project?.sessions || []).reduce((sum, session) => sum + session.users.length, 0);
    if (
      totalUsers > 0 &&
      !confirm(`There ${totalUsers === 1 ? "is 1 user" : `are ${totalUsers} users`} in this project. Delete it?`)
    ) {
      return;
    }

    const response = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    if (response.ok) return;
    const data = await response.json().catch(() => null);
    onError(data?.error || "Failed to delete project.");
  }

  async function deleteSession(sessionId, userCount) {
    const projectSessions = state.sessionList.filter((session) => session.projectId === state.currentProjectId);
    if (projectSessions.length <= 1) return;
    if (
      userCount > 0 &&
      !confirm(`There ${userCount === 1 ? "is 1 user" : `are ${userCount} users`} in this session. Close it?`)
    ) {
      return;
    }

    const response = await fetch("/api/sessions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sessionId }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      onError(data?.error || "Failed to delete session.");
      return;
    }

    if (state.currentSessionId === sessionId) {
      const nextSession = projectSessions.find((session) => session.id !== sessionId);
      if (nextSession) onJoinSession(nextSession.id);
      else onShowLobby();
    }
  }

  function renameSession(tab, session) {
    const nameElement = tab.querySelector(".tab-name");
    const input = document.createElement("input");
    input.value = session.name;
    input.style.cssText = "background:#0d1117;border:1px solid #58a6ff;color:#e6edf3;padding:2px 6px;border-radius:4px;font-size:12px;width:100px;outline:none;";
    nameElement.replaceWith(input);
    input.focus();
    input.select();

    let saved = false;
    const save = () => {
      if (saved) return;
      saved = true;
      const nextName = input.value.trim() || session.name;
      fetch("/api/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: session.id, name: nextName }),
      });
      session.name = nextName;
      const span = document.createElement("span");
      span.className = "tab-name";
      span.textContent = nextName;
      input.replaceWith(span);
    };

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        save();
      }
      if (event.key === "Escape") save();
    });
    input.addEventListener("blur", save);
  }

  async function openNewSessionMenu(event) {
    const existing = document.getElementById("new-session-menu");
    if (existing) {
      existing.remove();
      return;
    }

    const menu = document.createElement("div");
    menu.id = "new-session-menu";
    const rect = event.currentTarget.getBoundingClientRect();
    menu.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${rect.left}px;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:8px 0;z-index:200;box-shadow:0 8px 24px rgba(0,0,0,0.4);min-width:340px;max-height:400px;overflow-y:auto;`;

    const newOption = document.createElement("div");
    newOption.textContent = "+ New blank session";
    newOption.style.cssText = "padding:8px 16px;cursor:pointer;font-size:13px;color:#ff9a56;";
    newOption.onmouseenter = () => { newOption.style.background = "#21262d"; };
    newOption.onmouseleave = () => { newOption.style.background = ""; };
    newOption.onclick = async () => {
      menu.remove();
      const name = prompt("Session name:");
      if (!name) return;
      const url = state.currentProjectId ? `/api/projects/${state.currentProjectId}/sessions` : "/api/sessions";
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, projectId: state.currentProjectId }),
      });
      const session = await response.json();
      if (session.id) onJoinSession(session.id);
    };
    menu.appendChild(newOption);

    const divider = document.createElement("div");
    divider.style.cssText = "border-top:1px solid #30363d;margin:4px 0;";
    menu.appendChild(divider);

    const loading = document.createElement("div");
    loading.textContent = "Loading sessions from disk...";
    loading.style.cssText = "padding:8px 16px;font-size:12px;color:#8b949e;";
    menu.appendChild(loading);
    document.body.appendChild(menu);

    const response = await fetch("/api/disk-sessions");
    const diskSessions = await response.json();
    loading.remove();

    if (diskSessions.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "No sessions found on disk";
      empty.style.cssText = "padding:8px 16px;font-size:12px;color:#8b949e;";
      menu.appendChild(empty);
    } else {
      const header = document.createElement("div");
      header.textContent = "Resume from disk:";
      header.style.cssText = "padding:4px 16px 4px;font-size:11px;color:#8b949e;text-transform:uppercase;letter-spacing:0.5px;";
      menu.appendChild(header);

      for (const diskSession of diskSessions) {
        const option = document.createElement("div");
        const time = formatSessionTime(diskSession.lastModified || diskSession.timestamp);
        option.style.cssText = "padding:6px 16px;cursor:pointer;font-size:13px;";
        option.innerHTML = `<div style="color:#e6edf3;margin-bottom:2px">${escapeHtml(diskSession.firstMessage)}</div><div style="font-size:11px;color:#8b949e">${escapeHtml(diskSession.project)} &middot; ${diskSession.claudeSessionId.slice(0, 8)}${time ? ` &middot; <span style="color:#79c0ff">${escapeHtml(time)}</span>` : ""}</div>`;
        option.onmouseenter = () => { option.style.background = "#21262d"; };
        option.onmouseleave = () => { option.style.background = ""; };
        option.onclick = async () => {
          menu.remove();
          const name = diskSession.firstMessage.slice(0, 30) || diskSession.claudeSessionId.slice(0, 8);
          const url = state.currentProjectId ? `/api/projects/${state.currentProjectId}/sessions` : "/api/sessions";
          const createResponse = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              resumeId: diskSession.claudeSessionId,
              projectId: state.currentProjectId,
            }),
          });
          const session = await createResponse.json();
          if (session.id) onJoinSession(session.id);
        };
        menu.appendChild(option);
      }
    }

    const closeMenu = (closeEvent) => {
      if (!menu.contains(closeEvent.target) && closeEvent.target !== event.target) {
        menu.remove();
        document.removeEventListener("click", closeMenu);
      }
    };
    setTimeout(() => document.addEventListener("click", closeMenu), 0);
  }

  async function openNewProjectMenu(event) {
    const existing = document.getElementById("new-project-menu");
    if (existing) {
      existing.remove();
      return;
    }

    const menu = document.createElement("div");
    menu.id = "new-project-menu";
    const rect = event.currentTarget.getBoundingClientRect();
    menu.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${rect.left}px;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:12px 16px;z-index:200;box-shadow:0 8px 24px rgba(0,0,0,0.4);min-width:280px;`;
    menu.innerHTML = `
      <div style="font-size:13px;font-weight:600;color:#e6edf3;margin-bottom:8px;">New Project</div>
      <input id="np-name" type="text" placeholder="Project name" style="width:100%;background:#0d1117;border:1px solid #30363d;color:#e6edf3;padding:6px 10px;border-radius:6px;font-size:13px;outline:none;margin-bottom:6px;">
      <input id="np-cwd" type="text" placeholder="Working directory (optional, supports ~/...)" style="width:100%;background:#0d1117;border:1px solid #30363d;color:#8b949e;padding:6px 10px;border-radius:6px;font-size:12px;outline:none;margin-bottom:8px;">
      <div style="font-size:11px;color:#484f58;margin-bottom:8px;">Leave directory blank to auto-create in ~/projects/</div>
      <button id="np-create" style="background:#238636;color:white;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;width:100%;">Create</button>
    `;
    document.body.appendChild(menu);

    const nameInput = document.getElementById("np-name");
    const cwdInput = document.getElementById("np-cwd");
    nameInput.focus();

    const createProject = async () => {
      const name = nameInput.value.trim();
      if (!name) return;
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, cwd: cwdInput.value.trim() || undefined }),
      });
      const project = await response.json();
      menu.remove();
      if (project.id) {
        state.currentProjectId = project.id;
        renderProjectTabs();
        renderSessionTabs();
        if (project.defaultSessionId) onJoinSession(project.defaultSessionId);
      }
    };

    document.getElementById("np-create").addEventListener("click", createProject);
    nameInput.addEventListener("keydown", (keyEvent) => {
      if (keyEvent.key !== "Enter") return;
      keyEvent.preventDefault();
      createProject();
    });

    const closeMenu = (closeEvent) => {
      if (!menu.contains(closeEvent.target) && closeEvent.target !== event.currentTarget) {
        menu.remove();
        document.removeEventListener("click", closeMenu);
      }
    };
    setTimeout(() => document.addEventListener("click", closeMenu), 0);
  }

  newSessionButton.addEventListener("click", openNewSessionMenu);
  newProjectButton.addEventListener("click", openNewProjectMenu);

  return {
    renderProjectTabs,
    renderSessionTabs,
    switchProject,
  };
}
