// 공부 플래너 페이지 전용 코드

var SUBJECTS = [
  { name: "국어", color: "#7c3aed" },
  { name: "수학", color: "#2563eb" },
  { name: "영어", color: "#059669" },
  { name: "과학", color: "#d97706" },
  { name: "사회", color: "#e11d48" },
  { name: "기타", color: "#64748b" },
];

var MODES = {
  focus: { minutes: 25, label: "집중" },
  short: { minutes: 5, label: "짧은 휴식" },
  long: { minutes: 15, label: "긴 휴식" },
};

var planner = {
  tasks: readStored("study-tasks"),
  sessions: readStored("study-sessions"),
  mode: "focus",
  seconds: MODES.focus.minutes * 60,
  running: false,
  deadline: null,
  timerId: null,
  timerSubject: "수학",
  filter: "전체",
  weekOffset: 0,
};
var plannerEventsBound = false;

function readStored(key) {
  try {
    var value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : [];
  } catch (error) {
    return [];
  }
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function dateKey(date) {
  var value = date || new Date();
  return value.getFullYear() + "-" + pad(value.getMonth() + 1) + "-" + pad(value.getDate());
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, function (character) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
  });
}

function savePlanner() {
  localStorage.setItem("study-tasks", JSON.stringify(planner.tasks));
  localStorage.setItem("study-sessions", JSON.stringify(planner.sessions));
}

function onAuthReady() {
  if (!plannerEventsBound) {
    bindPlannerEvents();
    plannerEventsBound = true;
  }
  document.getElementById("taskDue").value = dateKey();
  renderPlanner();
  updateTimer();
}

function bindPlannerEvents() {
  document.getElementById("openTaskForm").addEventListener("click", openTaskForm);
  document.getElementById("emptyAddTask").addEventListener("click", openTaskForm);
  document.getElementById("closeTaskForm").addEventListener("click", closeTaskForm);
  document.getElementById("taskForm").addEventListener("submit", addTask);
  document.getElementById("taskDialog").addEventListener("click", function (event) {
    if (event.target === event.currentTarget) closeTaskForm();
  });
  document.getElementById("taskFilters").addEventListener("click", function (event) {
    var button = event.target.closest("[data-filter]");
    if (!button) return;
    planner.filter = button.dataset.filter;
    renderTasks();
  });
  document.getElementById("taskList").addEventListener("click", handleTaskAction);
  document.getElementById("timerModes").addEventListener("click", function (event) {
    var button = event.target.closest("[data-mode]");
    if (button) switchMode(button.dataset.mode);
  });
  document.getElementById("timerSubject").addEventListener("change", function (event) {
    planner.timerSubject = event.target.value;
  });
  document.getElementById("timerToggle").addEventListener("click", toggleTimer);
  document.getElementById("timerReset").addEventListener("click", resetTimer);
  document.getElementById("weekPrevious").addEventListener("click", function () {
    planner.weekOffset -= 1;
    renderWeek();
  });
  document.getElementById("weekNext").addEventListener("click", function () {
    planner.weekOffset += 1;
    renderWeek();
  });
  document.getElementById("weekCurrent").addEventListener("click", function () {
    planner.weekOffset = 0;
    renderWeek();
  });
}

function renderPlanner() {
  renderDateHeading();
  renderStats();
  renderWeek();
  renderTasks();
}

function renderDateHeading() {
  document.getElementById("todayDate").textContent = new Date().toLocaleDateString("ko-KR", {
    month: "long", day: "numeric", weekday: "long",
  });
}

function renderStats() {
  var today = dateKey();
  var todayTasks = planner.tasks.filter(function (task) { return task.due === today; });
  var doneToday = todayTasks.filter(function (task) { return task.done; }).length;
  var todayMinutes = planner.sessions.filter(function (session) { return session.date === today; })
    .reduce(function (total, session) { return total + Number(session.minutes || 0); }, 0);
  var totalDone = planner.tasks.filter(function (task) { return task.done; }).length;
  var completion = todayTasks.length ? Math.round(doneToday / todayTasks.length * 100) : 0;

  document.getElementById("todayMinutes").textContent = todayMinutes + "분";
  document.getElementById("todayTasks").textContent = doneToday + "/" + todayTasks.length;
  document.getElementById("totalDone").textContent = totalDone + "개";
  document.getElementById("todayCompletion").textContent = completion + "%";
}

function getWeekDays() {
  var now = new Date();
  var monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + planner.weekOffset * 7);
  return Array.from({ length: 7 }, function (_, index) {
    var date = new Date(monday);
    date.setDate(monday.getDate() + index);
    var key = dateKey(date);
    var minutes = planner.sessions.filter(function (session) { return session.date === key; })
      .reduce(function (total, session) { return total + Number(session.minutes || 0); }, 0);
    return { key: key, day: date.getDate(), label: ["월", "화", "수", "목", "금", "토", "일"][index], minutes: minutes };
  });
}

function renderWeek() {
  var days = getWeekDays();
  var today = dateKey();
  var maxMinutes = Math.max(60, ...days.map(function (day) { return day.minutes; }));
  var chart = document.getElementById("weekChart");

  chart.innerHTML = days.map(function (day) {
    var height = day.minutes ? Math.max(8, day.minutes / maxMinutes * 75) : 2;
    return '<div class="study-week-day">' +
      '<span class="study-week-minutes">' + (day.minutes ? day.minutes + "분" : "") + "</span>" +
      '<div class="study-week-track"><div class="study-week-bar' + (day.key === today ? " is-today" : "") + '" style="height:' + height + '%"></div></div>' +
      '<div class="study-week-label' + (day.key === today ? " is-today" : "") + '"><b>' + day.label + '</b><span>' + day.day + "</span></div>" +
      "</div>";
  }).join("");
  document.getElementById("weekTotal").textContent = days.reduce(function (total, day) {
    return total + day.minutes;
  }, 0) + "분";
  document.getElementById("weekCurrent").disabled = planner.weekOffset === 0;
}

function renderTasks() {
  var filters = ["전체", "할 일", "완료"].concat(SUBJECTS.map(function (subject) { return subject.name; }));
  document.getElementById("taskFilters").innerHTML = filters.map(function (filter) {
    return '<button type="button" data-filter="' + escapeHtml(filter) + '" class="study-filter' +
      (planner.filter === filter ? " is-active" : "") + '" aria-pressed="' + (planner.filter === filter) + '">' +
      escapeHtml(filter) + "</button>";
  }).join("");

  var tasks = planner.tasks.filter(function (task) {
    if (planner.filter === "전체") return true;
    if (planner.filter === "완료") return task.done;
    if (planner.filter === "할 일") return !task.done;
    return task.subject === planner.filter;
  });
  var list = document.getElementById("taskList");
  var empty = document.getElementById("taskEmpty");
  empty.hidden = tasks.length > 0;
  list.innerHTML = tasks.map(function (task) {
    var subject = SUBJECTS.find(function (item) { return item.name === task.subject; }) || SUBJECTS[SUBJECTS.length - 1];
    var overdue = !task.done && task.due < dateKey();
    var priority = task.priority === "높음" ? '<span class="study-priority">중요</span>' : "";
    return '<li class="study-task' + (task.done ? " is-done" : "") + '" data-id="' + escapeHtml(task.id) + '">' +
      '<button type="button" class="study-check" data-action="toggle" aria-label="' + (task.done ? "완료 취소" : "완료 처리") + '" aria-pressed="' + !!task.done + '">' +
      (task.done ? "✓" : "") + "</button>" +
      '<span class="study-subject-mark" style="--subject-color:' + subject.color + '"></span>' +
      '<div class="study-task-copy"><div class="study-task-title-row"><strong>' + escapeHtml(task.title) + '</strong>' +
      '<span class="study-subject-tag" style="--subject-color:' + subject.color + '">' + escapeHtml(task.subject) + "</span>" + priority + "</div>" +
      '<p class="study-task-due' + (overdue ? " is-overdue" : "") + '">' + escapeHtml(task.due || "마감일 없음") +
      (overdue ? " · 마감 지남" : "") + "</p></div>" +
      '<button type="button" class="study-delete" data-action="delete" aria-label="할 일 삭제">×</button>' +
      "</li>";
  }).join("");
  renderStats();
}

function handleTaskAction(event) {
  var button = event.target.closest("[data-action]");
  if (!button) return;
  var item = button.closest("[data-id]");
  var taskId = item.dataset.id;

  if (button.dataset.action === "toggle") {
    planner.tasks = planner.tasks.map(function (task) {
      return task.id === taskId ? Object.assign({}, task, { done: !task.done }) : task;
    });
  } else {
    planner.tasks = planner.tasks.filter(function (task) { return task.id !== taskId; });
  }
  savePlanner();
  renderTasks();
}

function openTaskForm() {
  var dialog = document.getElementById("taskDialog");
  dialog.showModal();
  document.getElementById("taskTitle").focus();
}

function closeTaskForm() {
  document.getElementById("taskDialog").close();
}

function addTask(event) {
  event.preventDefault();
  var titleInput = document.getElementById("taskTitle");
  var title = titleInput.value.trim();
  if (!title) {
    titleInput.focus();
    return;
  }
  planner.tasks.unshift({
    id: Date.now() + "-" + Math.random().toString(16).slice(2),
    title: title,
    subject: document.getElementById("taskSubject").value,
    priority: document.getElementById("taskPriority").value,
    due: document.getElementById("taskDue").value,
    done: false,
    createdAt: Date.now(),
  });
  savePlanner();
  titleInput.value = "";
  closeTaskForm();
  renderTasks();
}

function switchMode(mode) {
  if (!MODES[mode]) return;
  stopTimer();
  planner.mode = mode;
  planner.seconds = MODES[mode].minutes * 60;
  document.querySelectorAll("[data-mode]").forEach(function (button) {
    var active = button.dataset.mode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  updateTimer();
}

function toggleTimer() {
  if (planner.running) {
    planner.seconds = Math.max(0, Math.ceil((planner.deadline - Date.now()) / 1000));
    stopTimer();
    updateTimer();
    return;
  }
  if (planner.seconds === 0) return;
  planner.running = true;
  planner.deadline = Date.now() + planner.seconds * 1000;
  planner.timerId = window.setInterval(tickTimer, 250);
  updateTimer();
}

function tickTimer() {
  planner.seconds = Math.max(0, Math.ceil((planner.deadline - Date.now()) / 1000));
  if (planner.seconds === 0) {
    stopTimer();
    if (planner.mode === "focus") {
      planner.sessions.push({
        id: Date.now() + "-" + Math.random().toString(16).slice(2),
        subject: planner.timerSubject,
        minutes: MODES.focus.minutes,
        date: dateKey(),
        createdAt: Date.now(),
      });
      savePlanner();
      renderStats();
      renderWeek();
    }
  }
  updateTimer();
}

function stopTimer() {
  planner.running = false;
  window.clearInterval(planner.timerId);
  planner.timerId = null;
}

function resetTimer() {
  stopTimer();
  planner.seconds = MODES[planner.mode].minutes * 60;
  updateTimer();
}

function updateTimer() {
  var totalSeconds = MODES[planner.mode].minutes * 60;
  var progress = (totalSeconds - planner.seconds) / totalSeconds;
  document.getElementById("timerDisplay").textContent = pad(Math.floor(planner.seconds / 60)) + ":" + pad(planner.seconds % 60);
  document.getElementById("timerModeLabel").textContent = MODES[planner.mode].label + " 시간";
  document.getElementById("timerStatus").textContent = planner.running ? "집중하고 있어요" :
    (planner.seconds === 0 ? "완료했어요!" : "준비되면 시작하세요");
  document.getElementById("timerToggle").textContent = planner.running ? "일시정지" : "시작";
  document.getElementById("timerToggle").setAttribute("aria-label", planner.running ? "타이머 일시정지" : "타이머 시작");
  document.getElementById("timerToggle").disabled = planner.seconds === 0;
  document.getElementById("timerRingProgress").style.strokeDashoffset = String(2 * Math.PI * 112 * (1 - progress));
}