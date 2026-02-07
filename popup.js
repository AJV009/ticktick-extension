const API_BASE = "https://api.ticktick.com/open/v1";

// DOM elements
const viewLogin = document.getElementById("view-login");
const viewProject = document.getElementById("view-project");
const viewMain = document.getElementById("view-main");
const btnLogin = document.getElementById("btn-login");
const projectSelect = document.getElementById("project-select");
const btnSaveProject = document.getElementById("btn-save-project");
const pageTitle = document.getElementById("page-title");
const pageUrl = document.getElementById("page-url");
const projectName = document.getElementById("project-name");
const btnAddTask = document.getElementById("btn-add-task");
const btnChangeProject = document.getElementById("btn-change-project");
const feedback = document.getElementById("feedback");

let accessToken = null;
let cachedProjects = null;

// --- Initialization ---

async function init() {
  const data = await chrome.storage.local.get(["access_token", "project_id", "project_name"]);
  accessToken = data.access_token;

  if (!accessToken) {
    showView("login");
    return;
  }

  // Verify the token actually works before leaving the login screen
  try {
    cachedProjects = await apiGet("/project");
  } catch {
    // Token is invalid/expired — clear it and stay on login
    await chrome.storage.local.remove(["access_token"]);
    accessToken = null;
    showView("login");
    return;
  }

  if (!data.project_id) {
    await showProjectPicker();
    return;
  }

  await showMainView(data.project_id, data.project_name);
}

// --- View Management ---

function showView(name) {
  viewLogin.hidden = name !== "login";
  viewProject.hidden = name !== "project";
  viewMain.hidden = name !== "main";
}

// --- OAuth ---

btnLogin.addEventListener("click", async () => {
  btnLogin.disabled = true;
  btnLogin.textContent = "Connecting...";

  const response = await chrome.runtime.sendMessage({ action: "authenticate" });

  if (response?.error) {
    showFeedback(response.error, "error");
    btnLogin.disabled = false;
    btnLogin.textContent = "Connect to TickTick";
    return;
  }

  const data = await chrome.storage.local.get("access_token");
  accessToken = data.access_token;
  await showProjectPicker();
});

// --- Project Selection ---

async function showProjectPicker() {
  showView("project");
  projectSelect.innerHTML = '<option value="">Loading projects...</option>';
  btnSaveProject.disabled = true;

  try {
    const projects = cachedProjects || await apiGet("/project");
    cachedProjects = null; // clear cache after use
    projectSelect.innerHTML = '<option value="">Select a project...</option>';
    for (const p of projects) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      projectSelect.appendChild(opt);
    }
  } catch (err) {
    projectSelect.innerHTML = '<option value="">Failed to load projects</option>';
    showFeedback(err.message, "error");
  }
}

projectSelect.addEventListener("change", () => {
  btnSaveProject.disabled = !projectSelect.value;
});

btnSaveProject.addEventListener("click", async () => {
  const id = projectSelect.value;
  const name = projectSelect.options[projectSelect.selectedIndex].text;
  await chrome.storage.local.set({ project_id: id, project_name: name });
  await showMainView(id, name);
});

// --- Main View ---

async function showMainView(projId, projName) {
  showView("main");
  projectName.textContent = projName;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  pageTitle.textContent = tab.title || "Untitled";
  pageUrl.textContent = tab.url || "";
}

btnChangeProject.addEventListener("click", async (e) => {
  e.preventDefault();
  await showProjectPicker();
});

btnAddTask.addEventListener("click", async () => {
  btnAddTask.disabled = true;
  btnAddTask.textContent = "Adding...";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const { project_id } = await chrome.storage.local.get("project_id");

    await apiPost("/task", {
      title: tab.title || "Untitled",
      content: tab.url || "",
      projectId: project_id,
    });

    showFeedback("Task added!", "success");
    setTimeout(() => window.close(), 1200);
  } catch (err) {
    showFeedback(err.message, "error");
    btnAddTask.disabled = false;
    btnAddTask.textContent = "Add Task";
  }
});

// --- API Helpers ---

async function apiGet(path) {
  const res = await fetch(API_BASE + path, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// --- Feedback ---

function showFeedback(message, type) {
  feedback.textContent = message;
  feedback.className = `feedback ${type}`;
  feedback.hidden = false;
  if (type === "error") {
    setTimeout(() => { feedback.hidden = true; }, 3000);
  }
}

// --- Start ---

init();
