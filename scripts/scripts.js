/* =========================================================
    PWA: registro del service worker
========================================================= */

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    });
}

/* =========================================================
    ESTADO
========================================================= */

const STORAGE_KEY = "qpeeg_state_v1";

const DEFAULT_STATE = {
    photo: null,
    achievements: [],
    routines: [],
    activeRoutineId: null,
    logs: {}
};

let state = loadState();

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return structuredClone(DEFAULT_STATE);
        return Object.assign(structuredClone(DEFAULT_STATE), JSON.parse(raw));
    } catch (e) {
        return structuredClone(DEFAULT_STATE);
    }
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getDateText(date = new Date()) {
    const text = date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/* ---------- Registro por rutina + fecha ---------- */

let selectedDate = null; // null = hoy

function dateKey(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function parseKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
}

function getWorkoutDateKey() {
    return selectedDate || dateKey();
}

/* Lee sin crear nada */
function readExerciseLog(routineId, key, ex) {
    const stored = state.logs[routineId]?.[key]?.exercises?.[ex.id];
    return {
        kg: stored ? stored.kg : ex.kg,
        reps: ex.series.map((_, i) => (stored ? (stored.reps[i] || 0) : 0))
    };
}

/* Crea el registro si no existe (para escribir) */
function ensureExerciseLog(routineId, key, dayId, ex) {
    state.logs[routineId] ??= {};
    const entry = (state.logs[routineId][key] ??= { dayId, exercises: {} });
    entry.dayId = dayId;
    return (entry.exercises[ex.id] ??= { kg: ex.kg, reps: ex.series.map(() => 0) });
}

function exerciseStatus(ex, log) {
    const filled = log.reps.map((r, i) => ({ r, t: ex.series[i].target })).filter(x => x.r > 0);

    if (filled.length === 0) return "pending";
    if (filled.some(x => x.r < x.t)) return "red";
    if (filled.some(x => x.r > x.t)) return "gold";
    return "green";
}

function dayStatus(routine, key) {
    const entry = state.logs[routine.id]?.[key];
    if (!entry) return "empty";

    const day = findDay(routine, entry.dayId);
    if (!day || day.exercises.length === 0) return "empty";

    const statuses = day.exercises.map(ex => exerciseStatus(ex, readExerciseLog(routine.id, key, ex)));

    if (statuses.every(s => s === "pending")) return "empty";
    if (statuses.some(s => s === "pending")) return "red"; // se empezó pero no se completó
    if (statuses.includes("red")) return "red";
    if (statuses.includes("gold")) return "gold";
    return "green";
}

/* =========================================================
    PANTALLA DE INICIO
========================================================= */

let tooltipInterval = null;

function initLanding() {
    if (state.photo) {
        document.getElementById("profileImg").src = state.photo;
        document.getElementById("profileImg").style.display = "block";
        document.getElementById("profilePlaceholder").style.display = "none";
    }

    renderAchievements();
    startTooltipLoop();

    document.getElementById("profilePhoto").addEventListener("click", onProfilePhotoClick);
    document.getElementById("photoInput").addEventListener("change", onPhotoSelected);
}

function startTooltipLoop() {
    const tooltip = document.getElementById("profileTooltip");
    tooltip.classList.add("visible");
    tooltipInterval = setInterval(() => tooltip.classList.toggle("visible"), 2000);
}

function stopTooltipLoop() {
    clearInterval(tooltipInterval);
    document.getElementById("profileTooltip").classList.remove("visible");
}

function onProfilePhotoClick() {
    stopTooltipLoop();

    if (!state.photo) {
        document.getElementById("photoInput").click();
        return;
    }

    enterApp();
}

function onPhotoSelected(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        state.photo = reader.result;
        saveState();

        document.getElementById("profileImg").src = state.photo;
        document.getElementById("profileImg").style.display = "block";
        document.getElementById("profilePlaceholder").style.display = "none";
    };
    reader.readAsDataURL(file);
}

function enterApp() {
    document.getElementById("landing").style.display = "none";
    document.getElementById("mainApp").style.display = "flex";
    setHeaderDateText(getDateText());
}

/* =========================================================
    LOGROS / OBJETIVOS (máx. 3)
========================================================= */

function renderAchievements() {
    const list = document.getElementById("achievementsList");
    const control = document.getElementById("achievementsControl");

    list.innerHTML = "";
    state.achievements.forEach(text => {
        const chip = document.createElement("div");
        chip.className = "achievement-chip";
        chip.textContent = text;
        list.appendChild(chip);
    });

    control.innerHTML = "";

    if (state.achievements.length >= 3) {
        const msg = document.createElement("p");
        msg.className = "achievements-limit";
        msg.textContent = "recuerda que no puedes ocuparte de todo, un par de cosas a la vez sin perder tu constancia";
        control.appendChild(msg);
        return;
    }

    const addBtn = document.createElement("button");
    addBtn.className = "achievements-add";
    addBtn.textContent = "+";
    addBtn.onclick = onAddAchievement;
    control.appendChild(addBtn);
}

function onAddAchievement() {
    const text = prompt("Escribe un objetivo o logro:");
    if (!text) return;

    state.achievements.push(text.trim());
    saveState();
    renderAchievements();
}

/* =========================================================
    SEMANA
========================================================= */

/* Orden cíclico de pestañas que recorre el deslizamiento horizontal */
const TAB_ORDER = [
    { id: "week", label: "SEMANA" },
    { id: "exercises", label: "RUTINAS" },
    { id: "history", label: "HISTORIAL" }
];

/* Deslizar recorre TAB_ORDER en bucle; desde Entreno
   (que no pertenece a TAB_ORDER) salen tomando "Semana" como base */
function shiftWeekTab(direction) {
    selectedDate = null;

    const current = document.querySelector(".section.active").id;
    let currentIndex = TAB_ORDER.findIndex(tab => tab.id === current);
    if (currentIndex === -1) currentIndex = TAB_ORDER.findIndex(tab => tab.id === "week");

    const nextIndex = (currentIndex + direction + TAB_ORDER.length) % TAB_ORDER.length;
    showSection(TAB_ORDER[nextIndex].id);
}

/* Muestra los días de la rutina activa, o el mensaje de selección */
function renderWeekSection() {
    const container = document.getElementById("weekRoutineContent");
    container.innerHTML = "";

    const routine = state.activeRoutineId ? findRoutine(state.activeRoutineId) : null;

    if (!routine) {
        state.activeRoutineId = null;
        const msg = document.createElement("p");
        msg.className = "split-caption";
        msg.textContent = "Selecciona una rutina en la pestaña Rutinas";
        container.appendChild(msg);
        return;
    }

    const picker = document.createElement("div");
    picker.className = "split-picker";

    routine.days.forEach(day => {
        const btn = document.createElement("button");
        btn.className = "split-card";
        btn.textContent = day.name;
        btn.onclick = () => startWorkoutDay(routine.id, day.id);
        picker.appendChild(btn);
    });

    container.appendChild(picker);

    const caption = document.createElement("p");
    caption.className = "split-caption";
    caption.textContent = "Elige el día de hoy";
    container.appendChild(caption);
}

/* Al elegir un día, entra a Entreno y crea/asocia el registro de esa fecha */
function startWorkoutDay(routineId, dayId) {
    activeWorkout = { routineId, dayId };
    workoutPage = 0;

    const key = getWorkoutDateKey();
    state.logs[routineId] ??= {};
    state.logs[routineId][key] ??= { dayId, exercises: {} };
    state.logs[routineId][key].dayId = dayId;
    saveState();

    showSection("workout");
}

/* Panel "Series": progreso del día activo (hechas / totales) */
function renderSeriesPanel() {
    const left = document.getElementById("seriesColLeft");
    const right = document.getElementById("seriesColRight");
    left.innerHTML = "";
    right.innerHTML = "";

    const routine = findRoutine(state.activeRoutineId);
    if (!routine) return;

    const key = getWorkoutDateKey();
    const entry = state.logs[routine.id]?.[key];
    if (!entry) return;

    const day = findDay(routine, entry.dayId);
    if (!day) return;

    const half = Math.ceil(day.exercises.length / 2);

    day.exercises.forEach((exercise, index) => {
        const log = readExerciseLog(routine.id, key, exercise);
        const done = log.reps.filter(r => r > 0).length;

        const line = document.createElement("div");
        line.className = "series-line";
        line.innerHTML = `<span>${exercise.name}</span><span>${done}/${exercise.series.length}</span>`;

        (index < half ? left : right).appendChild(line);
    });
}

/* =========================================================
    NAVEGACIÓN ENTRE SECCIONES
========================================================= */

function showSection(sectionId) {
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
    document.getElementById(sectionId).classList.add("active");

    const label = document.querySelector(".week-tab-label");
    label.onclick = null;
    label.classList.remove("clickable");

    if (sectionId === "exercises") {
        routineNav = { level: "root", routineId: null, dayId: null, exercisePage: 0 };
        renderRoutinesTab();
    } else if (sectionId === "week") {
        setHeaderDateText(getDateText(selectedDate ? parseKey(selectedDate) : new Date()));
        renderWeekSection();
        renderSeriesPanel();
    } else if (sectionId === "workout") {
        const day = findDay(findRoutine(activeWorkout.routineId), activeWorkout.dayId);
        setHeaderDateText(day ? day.name : "");
        renderWorkoutForDay(activeWorkout.routineId, activeWorkout.dayId);
    } else if (sectionId === "history") {
        setHeaderDateText(getDateText());
        renderHistory();
    } else {
        setHeaderDateText("");
    }

    const tab = TAB_ORDER.find(t => t.id === sectionId);
    label.textContent = tab ? tab.label : (sectionId === "workout" ? "ENTRENO" : label.textContent);

    renderDots(document.getElementById("tabDots"), TAB_ORDER.length, TAB_ORDER.findIndex(t => t.id === sectionId));
}

/* Puntos indicadores (index = -1: ninguno activo) */
function renderDots(container, total, index) {
    container.innerHTML = "";
    if (total < 2) return;
    for (let i = 0; i < total; i++) {
        const dot = document.createElement("span");
        dot.className = "page-dot" + (i === index ? " active" : "");
        container.appendChild(dot);
    }
}

function goToWeek() {
    selectedDate = null;
    showSection("week");
}

/* =========================================================
    ENTRENAMIENTO: CARRUSELES DE KG Y REPS
========================================================= */

const KG_STEP = 2.5;
const EXERCISES_PER_SCREEN = 2;

let workoutPage = 0;
let activeWorkout = { routineId: null, dayId: null };

function renderWorkoutForDay(routineId, dayId) {
    const container = document.getElementById("workoutExercises");
    container.innerHTML = "";

    const routine = findRoutine(routineId);
    const day = routine ? findDay(routine, dayId) : null;
    if (!day) return;

    const totalPages = Math.max(1, Math.ceil(day.exercises.length / EXERCISES_PER_SCREEN));
    workoutPage = Math.min(workoutPage, totalPages - 1);

    const start = workoutPage * EXERCISES_PER_SCREEN;

    const page = document.createElement("div");
    page.className = "workout-page";

    day.exercises.slice(start, start + EXERCISES_PER_SCREEN)
        .forEach(exercise => page.appendChild(buildExerciseCard(routineId, dayId, exercise.id)));

    container.appendChild(page);

    renderDots(document.getElementById("workoutDots"), totalPages, workoutPage);
}

function shiftWorkoutPage(direction) {
    workoutPage += direction;
    renderWorkoutForDay(activeWorkout.routineId, activeWorkout.dayId);
}

function getWorkoutExercise(routineId, dayId, exerciseId) {
    const day = findDay(findRoutine(routineId), dayId);
    return day.exercises.find(e => e.id === exerciseId);
}

function buildExerciseCard(routineId, dayId, exerciseId) {
    const ex = getWorkoutExercise(routineId, dayId, exerciseId);
    const log = readExerciseLog(routineId, getWorkoutDateKey(), ex);

    const card = document.createElement("div");
    card.className = "exercise";
    card.dataset.exercise = exerciseId;

    const top = document.createElement("div");
    top.className = "exercise-top";
    top.innerHTML = `
        <div class="exercise-name">${ex.name}</div>
        <span class="semaphore-dot" id="dot-${exerciseId}"></span>
    `;
    card.appendChild(top);

    const kgBox = document.createElement("div");
    kgBox.className = "kg-carousel";
    kgBox.innerHTML = `<div class="kg-value" id="kg-${exerciseId}">${log.kg} kg</div>`;
    attachValueSwipe(kgBox.querySelector(".kg-value"), dir => changeWorkoutKg(routineId, dayId, exerciseId, dir * KG_STEP));
    card.appendChild(kgBox);

    const seriesRow = document.createElement("div");
    seriesRow.className = "series-row";
    seriesRow.id = `series-row-${exerciseId}`;
    card.appendChild(seriesRow);

    renderWorkoutSeries(routineId, dayId, exerciseId, card);

    return card;
}

function renderWorkoutSeries(routineId, dayId, exerciseId, cardEl) {
    const ex = getWorkoutExercise(routineId, dayId, exerciseId);
    const log = readExerciseLog(routineId, getWorkoutDateKey(), ex);
    const row = (cardEl || document.querySelector(`.exercise[data-exercise="${exerciseId}"]`))
        .querySelector(`#series-row-${exerciseId}`);

    row.innerHTML = "";

    ex.series.forEach((serie, index) => {
        const wrap = document.createElement("div");
        wrap.className = "serie-carousel";
        wrap.innerHTML = `
            <span class="serie-label">${toRoman(index + 1)}</span>
            <div class="reps-value">${log.reps[index]}</div>
        `;
        const valueBox = wrap.querySelector(".reps-value");
        attachValueSwipe(valueBox, dir => changeWorkoutReps(routineId, dayId, exerciseId, index, dir, valueBox));
        row.appendChild(wrap);
    });

    updateSemaphore(routineId, dayId, exerciseId);
}

function changeWorkoutKg(routineId, dayId, exerciseId, delta) {
    const ex = getWorkoutExercise(routineId, dayId, exerciseId);
    const log = ensureExerciseLog(routineId, getWorkoutDateKey(), dayId, ex);
    const before = log.kg;
    log.kg = Math.max(0, log.kg + delta);
    saveState();
    if (log.kg !== before) animateValue(document.getElementById(`kg-${exerciseId}`), delta > 0 ? 1 : -1, `${log.kg} kg`);
}

function changeWorkoutReps(routineId, dayId, exerciseId, index, delta, valueBox) {
    const ex = getWorkoutExercise(routineId, dayId, exerciseId);
    const log = ensureExerciseLog(routineId, getWorkoutDateKey(), dayId, ex);
    const before = log.reps[index] || 0;
    log.reps[index] = Math.max(0, before + delta);
    saveState();

    if (log.reps[index] !== before) animateValue(valueBox, delta > 0 ? 1 : -1, String(log.reps[index]));
    updateSemaphore(routineId, dayId, exerciseId);
    renderSeriesPanel();
}

function toRoman(number) {
    const romans = ["I", "II", "III", "IV", "V", "VI"];
    return romans[number - 1] || number;
}

/* =========================================================
    SEMÁFORO (verde / dorado / rojo)
========================================================= */

function updateSemaphore(routineId, dayId, exerciseId) {
    const ex = getWorkoutExercise(routineId, dayId, exerciseId);
    const dot = document.getElementById(`dot-${exerciseId}`);
    if (!dot) return;

    const status = exerciseStatus(ex, readExerciseLog(routineId, getWorkoutDateKey(), ex));

    dot.classList.remove("dot-green", "dot-yellow", "dot-red");
    if (status === "red") dot.classList.add("dot-red");
    else if (status === "gold") dot.classList.add("dot-yellow");
    else if (status === "green") dot.classList.add("dot-green");
    // "pending": punto gris por defecto
}

/* =========================================================
    CREADOR DE RUTINAS (pestaña "Rutinas")
========================================================= */

const EXERCISE_NAME_MAX = 14;

let routineNav = { level: "root", routineId: null, dayId: null, exercisePage: 0 };

function newId(prefix) {
    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

function findRoutine(routineId) {
    return state.routines.find(r => r.id === routineId);
}

function findDay(routine, dayId) {
    return routine.days.find(d => d.id === dayId);
}

function setHeaderDateText(text, onBack) {
    const el = document.getElementById("weekDate");

    if (onBack) {
        el.textContent = `← ${text}`;
        el.classList.add("clickable");
        el.onclick = onBack;
    } else {
        el.textContent = text;
        el.classList.remove("clickable");
        el.onclick = null;
    }
}

function renderRoutinesTab() {
    const container = document.getElementById("routinesContainer");
    container.innerHTML = "";

    if (routineNav.level === "root") {
        setHeaderDateText(getDateText());
        container.appendChild(buildRoutinesRoot());
    } else if (routineNav.level === "days") {
        setHeaderDateText(findRoutine(routineNav.routineId).name, () => {
            routineNav = { level: "root", routineId: null, dayId: null };
            renderRoutinesTab();
        });
        container.appendChild(buildDaysView(routineNav.routineId));
    } else if (routineNav.level === "exercises") {
        const day = findDay(findRoutine(routineNav.routineId), routineNav.dayId);
        setHeaderDateText(day.name, () => {
            routineNav = { level: "days", routineId: routineNav.routineId, dayId: null };
            renderRoutinesTab();
        });
        container.appendChild(buildDayExercisesView(routineNav.routineId, routineNav.dayId));
    }
}

/* ---------- Nivel 1: lista de rutinas ---------- */

function buildRoutinesRoot() {
    const root = document.createElement("div");
    root.className = "routine-page";

    const gridWrapper = document.createElement("div");
    gridWrapper.className = "day-grid-wrapper";

    const grid = document.createElement("div");
    grid.className = "day-grid";
    const isTwoColumns = state.routines.length >= 4;
    grid.classList.toggle("two-columns", isTwoColumns);

    state.routines.forEach(routine => {
        const card = document.createElement("button");
        card.className = "day-card routine-pill";
        card.classList.toggle("routine-active", state.activeRoutineId === routine.id);

        const activateBtn = document.createElement("button");
        activateBtn.className = "routine-activate";
        activateBtn.textContent = state.activeRoutineId === routine.id ? "Activado" : "Activar";
        activateBtn.onclick = (event) => {
            event.stopPropagation();
            toggleActiveRoutine(routine.id);
        };
        card.appendChild(activateBtn);

        const xBtn = document.createElement("span");
        xBtn.className = "day-delete-x";
        xBtn.textContent = "✕";
        xBtn.onclick = (event) => {
            event.stopPropagation();
            deleteRoutine(routine.id);
        };
        card.appendChild(xBtn);

        const label = document.createElement("span");
        label.textContent = routine.name;
        card.appendChild(label);

        card.onclick = () => {
            routineNav = { level: "days", routineId: routine.id, dayId: null };
            renderRoutinesTab();
        };
        grid.appendChild(card);
    });

    const addCard = document.createElement("button");
    addCard.className = "square-card add-square";

    if ((state.routines.length + 1) % 2 === 1 && isTwoColumns) {
        addCard.classList.add("add-day-full-row");
    }

    addCard.innerHTML = `<span class="add-square-plus">+</span><small>Añadir rutina</small>`;
    addCard.onclick = addRoutine;
    grid.appendChild(addCard);

    if (state.routines.length === 0) {
        gridWrapper.classList.add("empty-wrapper");
        grid.classList.add("empty-grid");
    }

    gridWrapper.appendChild(grid);
    root.appendChild(gridWrapper);

    return root;
}

function deleteRoutine(routineId) {
    const routine = findRoutine(routineId);

    if (!confirm(`¿Borrar la rutina "${routine.name}" completa, con todos sus días y ejercicios? Esta acción no se puede deshacer.`)) return;

    state.routines = state.routines.filter(r => r.id !== routineId);
    saveState();

    routineNav = { level: "root", routineId: null, dayId: null };
    renderRoutinesTab();
}

function toggleActiveRoutine(routineId) {
    state.activeRoutineId = (state.activeRoutineId === routineId) ? null : routineId;
    saveState();
    renderRoutinesTab();
}

function addRoutine() {
    const name = prompt("Nombre de la rutina:");
    if (!name) return;

    const routine = { id: newId("routine"), name: name.trim(), days: [] };
    state.routines.push(routine);
    saveState();

    routineNav = { level: "days", routineId: routine.id, dayId: null };
    renderRoutinesTab();
}

/* ---------- Nivel 2: días de una rutina ---------- */

function buildDaysView(routineId) {
    const routine = findRoutine(routineId);

    const root = document.createElement("div");
    root.className = "routine-page";

    const gridWrapper = document.createElement("div");
    gridWrapper.className = "day-grid-wrapper";

    const grid = document.createElement("div");
    grid.className = "day-grid";
    const isTwoColumns = routine.days.length >= 4;
    grid.classList.toggle("two-columns", isTwoColumns);

    routine.days.forEach(day => {
        const card = document.createElement("button");
        card.className = "day-card";

        const xBtn = document.createElement("span");
        xBtn.className = "day-delete-x";
        xBtn.textContent = "✕";
        xBtn.onclick = (event) => {
            event.stopPropagation();
            deleteDay(routineId, day.id);
        };
        card.appendChild(xBtn);

        const label = document.createElement("span");
        label.textContent = day.name;
        card.appendChild(label);

        card.onclick = () => {
            routineNav = { level: "exercises", routineId, dayId: day.id };
            renderRoutinesTab();
        };
        attachLongPress(card, () => renameDay(routineId, day.id));
        grid.appendChild(card);
    });

    if (routine.days.length < 6) {
        const addCard = document.createElement("button");
        addCard.className = "square-card add-square";

        if ((routine.days.length + 1) % 2 === 1 && isTwoColumns) {
            addCard.classList.add("add-day-full-row");
        }

        addCard.innerHTML = `<span class="add-square-plus">+</span><small>Añadir día</small>`;
        addCard.onclick = () => addDay(routineId);
        grid.appendChild(addCard);
    }

    if (routine.days.length === 0) {
        gridWrapper.classList.add("empty-wrapper");
        grid.classList.add("empty-grid");
    }

    gridWrapper.appendChild(grid);
    root.appendChild(gridWrapper);

    const hint = document.createElement("p");
    hint.className = "hint-text";
    hint.textContent = "Toca un día para abrirlo. Mantén presionado para renombrarlo. Máx. 6 días.";
    root.appendChild(hint);

    return root;
}

function renumberAutoDays(routine) {
    routine.days.forEach((day, index) => {
        if (!day.customName) day.name = `Día ${index + 1}`;
    });
}

function addDay(routineId) {
    const routine = findRoutine(routineId);
    if (routine.days.length >= 6) return;

    routine.days.push({ id: newId("day"), name: "", customName: false, exercises: [] });
    renumberAutoDays(routine);
    saveState();
    renderRoutinesTab();
}

function deleteDay(routineId, dayId) {
    const routine = findRoutine(routineId);
    const day = findDay(routine, dayId);

    if (!confirm(`¿Borrar "${day.name}" y todos sus ejercicios? Esta acción no se puede deshacer.`)) return;

    routine.days = routine.days.filter(d => d.id !== dayId);
    renumberAutoDays(routine);
    saveState();
    renderRoutinesTab();
}

function renameDay(routineId, dayId) {
    const routine = findRoutine(routineId);
    const day = findDay(routine, dayId);

    const name = prompt("Nombre del día:", day.name);
    if (!name) return;

    day.name = name.trim();
    day.customName = true;
    saveState();
    renderRoutinesTab();
}

/* ---------- Nivel 3: ejercicios dentro de un día (paginado, 2 por página, máx. 6 páginas) ---------- */

const EXERCISES_PER_PAGE = 2;
const MAX_EXERCISE_PAGES = 6;

function buildDayExercisesView(routineId, dayId) {
    const routine = findRoutine(routineId);
    const day = findDay(routine, dayId);

    const root = document.createElement("div");
    root.className = "routine-page";

    const page = routineNav.exercisePage || 0;
    const startIndex = page * EXERCISES_PER_PAGE;
    const pageExercises = day.exercises.slice(startIndex, startIndex + EXERCISES_PER_PAGE);

    const list = document.createElement("div");
    list.className = "day-exercises-list";

    pageExercises.forEach((exercise, localIndex) => {
        list.appendChild(buildRoutineExerciseCard(routineId, dayId, startIndex + localIndex));
    });

    root.appendChild(list);

    const totalPages = Math.max(1, Math.ceil(day.exercises.length / EXERCISES_PER_PAGE));

    const pageIndicator = document.createElement("div");
    pageIndicator.className = "page-indicator";
    for (let i = 0; i < totalPages; i++) {
        const dot = document.createElement("span");
        dot.className = "page-dot" + (i === page ? " active" : "");
        pageIndicator.appendChild(dot);
    }
    root.appendChild(pageIndicator);

    /* Botón inferior "+" (las páginas se cambian deslizando) */
    const actions = document.createElement("div");
    actions.className = "routine-actions";

    if (totalPages < MAX_EXERCISE_PAGES) {
        const addBtn = document.createElement("button");
        addBtn.className = "add-serie-btn";
        addBtn.textContent = "+";
        addBtn.onclick = () => addRoutineExercise(routineId, dayId);
        actions.appendChild(addBtn);
    }

    root.appendChild(actions);

    const help = document.createElement("p");
    help.className = "routine-help";
    help.textContent = "Desliza hacia arriba o abajo sobre el peso o una serie para subirlo o bajarlo. Mantén presionado el peso para escribirlo; mantén presionada una serie para eliminarla. Máx. 6 series por ejercicio y 6 páginas (2 ejercicios por página).";
    root.appendChild(help);

    return root;
}

function addRoutineExercise(routineId, dayId) {
    const routine = findRoutine(routineId);
    const day = findDay(routine, dayId);

    const currentPages = Math.ceil(day.exercises.length / EXERCISES_PER_PAGE);
    if (day.exercises.length % EXERCISES_PER_PAGE === 0 && currentPages >= MAX_EXERCISE_PAGES) {
        alert(`Máximo ${MAX_EXERCISE_PAGES} páginas de ejercicios por día.`);
        return;
    }

    let name = prompt(`Nombre del ejercicio (máx. ${EXERCISE_NAME_MAX} caracteres):`);
    if (!name) return;
    name = name.trim().slice(0, EXERCISE_NAME_MAX);
    if (!name) return;

    day.exercises.push({
        id: newId("ex"),
        name,
        kg: 0,
        series: [{ target: 0, actual: 0 }, { target: 0, actual: 0 }, { target: 0, actual: 0 }]
    });

    saveState();

    routineNav.exercisePage = Math.floor((day.exercises.length - 1) / EXERCISES_PER_PAGE);
    renderRoutinesTab();
}

function deleteRoutineExercise(routineId, dayId, exerciseIndex) {
    const routine = findRoutine(routineId);
    const day = findDay(routine, dayId);
    const exercise = day.exercises[exerciseIndex];

    if (!confirm(`¿Borrar el ejercicio "${exercise.name}"? Esta acción no se puede deshacer.`)) return;

    day.exercises.splice(exerciseIndex, 1);
    saveState();

    const totalPages = Math.max(1, Math.ceil(day.exercises.length / EXERCISES_PER_PAGE));
    if (routineNav.exercisePage >= totalPages) routineNav.exercisePage = totalPages - 1;

    renderRoutinesTab();
}

const MAX_SERIES_PER_EXERCISE = 6;

function buildRoutineExerciseCard(routineId, dayId, exerciseIndex) {
    const routine = findRoutine(routineId);
    const day = findDay(routine, dayId);
    const exercise = day.exercises[exerciseIndex];

    const card = document.createElement("div");
    card.className = "exercise";
    card.style.position = "relative"; // necesario para posicionar la X

    const deleteBtn = document.createElement("span");
    deleteBtn.className = "day-delete-x";
    deleteBtn.textContent = "✕";
    deleteBtn.onclick = (event) => {
        event.stopPropagation();
        deleteRoutineExercise(routineId, dayId, exerciseIndex);
    };
    card.appendChild(deleteBtn);

    const name = document.createElement("div");
    name.className = "exercise-name";
    name.textContent = exercise.name;
    card.appendChild(name);

    const kgBox = document.createElement("div");
    kgBox.className = "kg-carousel";
    kgBox.innerHTML = `<div class="kg-value long-pressable">${exercise.kg} kg/lbs</div>`;
    const kgValue = kgBox.querySelector(".kg-value");
    attachValueSwipe(kgValue, dir => changeRoutineKg(routineId, dayId, exerciseIndex, dir * KG_STEP, kgValue));
    attachLongPress(kgValue, () => setCustomRoutineKg(routineId, dayId, exerciseIndex));
    card.appendChild(kgBox);

    const seriesRow = document.createElement("div");
    seriesRow.className = "series-row";

    exercise.series.forEach((serie, serieIndex) => {
        const el = document.createElement("div");
        el.className = "serie-carousel long-pressable";
        el.innerHTML = `
            <span class="serie-label">${toRoman(serieIndex + 1)}</span>
            <div class="reps-value">${serie.target}</div>
        `;
        const repsValue = el.querySelector(".reps-value");
        attachValueSwipe(repsValue, dir => changeRoutineReps(routineId, dayId, exerciseIndex, serieIndex, dir, repsValue));
        attachLongPress(repsValue, () => removeRoutineSerie(routineId, dayId, exerciseIndex, serieIndex));
        seriesRow.appendChild(el);
    });

    card.appendChild(seriesRow);

    if (exercise.series.length < MAX_SERIES_PER_EXERCISE) {
        const addSerieBtn = document.createElement("button");
        addSerieBtn.className = "add-serie-btn";
        addSerieBtn.textContent = "+";
        addSerieBtn.onclick = () => {
            exercise.series.push({ target: 0, actual: 0 });
            saveState();
            renderRoutinesTab();
        };
        card.appendChild(addSerieBtn);
    }

    return card;
}

function changeRoutineKg(routineId, dayId, exerciseIndex, delta, valueBox) {
    const day = findDay(findRoutine(routineId), dayId);
    const exercise = day.exercises[exerciseIndex];

    const before = exercise.kg;
    exercise.kg = Math.max(0, exercise.kg + delta);
    saveState();
    if (exercise.kg !== before) animateValue(valueBox, delta > 0 ? 1 : -1, `${exercise.kg} kg/lbs`);
}

function changeRoutineReps(routineId, dayId, exerciseIndex, serieIndex, delta, valueBox) {
    const day = findDay(findRoutine(routineId), dayId);
    const serie = day.exercises[exerciseIndex].series[serieIndex];

    const before = serie.target;
    serie.target = Math.max(0, serie.target + delta);
    saveState();
    if (serie.target !== before) animateValue(valueBox, delta > 0 ? 1 : -1, String(serie.target));
}

function setCustomRoutineKg(routineId, dayId, exerciseIndex) {
    const day = findDay(findRoutine(routineId), dayId);
    const exercise = day.exercises[exerciseIndex];

    const value = prompt("Introduce el peso personalizado (kg/lbs):", exercise.kg);
    if (value === null) return;

    const number = parseFloat(value.replace(",", "."));
    if (isNaN(number) || number < 0) {
        alert("Introduce un peso válido.");
        return;
    }

    exercise.kg = number;
    saveState();
    renderRoutinesTab();
}

function removeRoutineSerie(routineId, dayId, exerciseIndex, serieIndex) {
    const day = findDay(findRoutine(routineId), dayId);
    const exercise = day.exercises[exerciseIndex];

    if (exercise.series.length <= 1) return;

    exercise.series.splice(serieIndex, 1);
    saveState();
    renderRoutinesTab();
}

/* ---------- Piezas reutilizables del creador de rutinas ---------- */

function attachLongPress(el, callback) {
    let timer = null;

    let sx = 0, sy = 0;

    const start = (event) => {
        if (event.type === "mousedown" && event.button !== 0) return;
        const point = event.touches ? event.touches[0] : event;
        sx = point.clientX; sy = point.clientY;
        timer = setTimeout(callback, 550);
    };

    const cancel = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };

    el.addEventListener("mousedown", start);
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("mouseup", cancel);
    el.addEventListener("mouseleave", cancel);
    el.addEventListener("touchend", cancel);
    el.addEventListener("touchcancel", cancel);
    el.addEventListener("touchmove", cancel);
    el.addEventListener("pointermove", e => { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 8) cancel(); });
}

/* Deslizar verticalmente sobre un número lo sube (arriba) o lo baja (abajo):
   un paso cada VALUE_STEP_PX píxeles, con la animación del número. */
const VALUE_STEP_PX = 26;

function attachValueSwipe(el, onStep) {
    let lastY = null, pointer = null;

    el.addEventListener("pointerdown", e => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        lastY = e.clientY;
        pointer = e.pointerId;
        try { el.setPointerCapture(pointer); } catch (err) {}
    });

    el.addEventListener("pointermove", e => {
        if (lastY === null || e.pointerId !== pointer) return;
        let dy = e.clientY - lastY;
        while (Math.abs(dy) >= VALUE_STEP_PX) {
            const dir = dy < 0 ? 1 : -1;          /* arriba = subir */
            onStep(dir);
            lastY -= dir * VALUE_STEP_PX;
            dy = e.clientY - lastY;
        }
    });

    const end = () => { lastY = null; pointer = null; };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
}

/* =========================================================
    HISTORIAL
========================================================= */

function renderHistory() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    const title = now.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
    document.getElementById("historyTitle").textContent = title.charAt(0).toUpperCase() + title.slice(1);

    const grid = document.getElementById("historyGrid");
    grid.innerHTML = "";

    const routine = findRoutine(state.activeRoutineId);
    if (!routine) {
        const msg = document.createElement("p");
        msg.className = "split-caption";
        msg.style.gridColumn = "1 / -1";
        msg.textContent = "Selecciona una rutina en la pestaña Rutinas";
        grid.appendChild(msg);
        return;
    }

    ["L", "M", "X", "J", "V", "S", "D"].forEach(letter => {
        const h = document.createElement("div");
        h.className = "history-weekday";
        h.textContent = letter;
        grid.appendChild(h);
    });

    const firstOffset = (new Date(year, month, 1).getDay() + 6) % 7; // lunes primero
    for (let i = 0; i < firstOffset; i++) {
        const blank = document.createElement("div");
        blank.className = "history-cell blank";
        grid.appendChild(blank);
    }

    const todayKey = dateKey(now);
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let d = 1; d <= daysInMonth; d++) {
        const key = dateKey(new Date(year, month, d));
        const status = dayStatus(routine, key);

        const cell = document.createElement("button");
        cell.className = "history-cell";
        cell.textContent = d;

        if (status === "green") cell.classList.add("green");
        if (status === "red") cell.classList.add("red");
        if (status === "gold") cell.classList.add("gold");
        if (key === todayKey) cell.classList.add("today");

        if (key > todayKey) {
            cell.classList.add("future");
        } else {
            cell.onclick = () => openHistoryDay(key);
        }

        grid.appendChild(cell);
    }
}

/* Tocar un día: abre su entreno si ya existe, o el selector de días de la rutina */
function openHistoryDay(key) {
    selectedDate = (key === dateKey()) ? null : key;

    const entry = state.logs[state.activeRoutineId]?.[key];
    const routine = findRoutine(state.activeRoutineId);

    if (entry && routine && findDay(routine, entry.dayId)) {
        activeWorkout = { routineId: routine.id, dayId: entry.dayId };
        workoutPage = 0;
        showSection("workout");
    } else {
        showSection("week");
    }
}

function completeWorkout() {
    goToWeek();
}

/* =========================================================
    ARRANQUE
========================================================= */

/* =========================================================
    AJUSTE AUTOMÁTICO AL ESPACIO DISPONIBLE
    Si el contenido de la sección no cabe, primero se achica el encabezado
    (--hdr) para alargar el campo y luego los espacios internos (--k).
========================================================= */

function fitLayout(force) {
    if (SWIPE.busy && !force) return; /* se ajusta al terminar de cambiar de pantalla */
    const app = document.getElementById("mainApp");
    const main = document.querySelector("main");
    if (!app || !main || app.style.display === "none") return;

    const root = document.documentElement;
    root.style.removeProperty("--hdr");
    root.style.removeProperty("--k");

    /* Cuánto se pasa el contenido visible del borde inferior de la zona principal,
       mida lo que mida su contenedor (aunque este lo recorte) */
    const active = main.querySelector(".section.active");
    const overflows = () => {
        const limit = main.getBoundingClientRect().bottom - parseFloat(getComputedStyle(main).paddingBottom);
        let lowest = 0;
        active.querySelectorAll("*").forEach(el => {
            const r = el.getBoundingClientRect();
            if (el.dataset.anim === "1") return;
            if (r.height > 0 && r.bottom > lowest) lowest = r.bottom;
        });
        return Math.max(lowest - limit, main.scrollHeight - main.clientHeight) > 1;
    };
    if (!overflows()) return;

    const base = parseFloat(getComputedStyle(document.querySelector(".week-tab-label")).height);
    for (let h = base - 4; h >= 34; h -= 4) {
        root.style.setProperty("--hdr", `${h}px`);
        if (!overflows()) return;
    }

    for (let k = 0.9; k >= 0.3; k -= 0.1) {
        root.style.setProperty("--k", k.toFixed(2));
        if (!overflows()) return;
    }
}

let fitQueued = false;
function queueFit() {
    if (fitQueued) return;
    fitQueued = true;
    requestAnimationFrame(() => { fitQueued = false; fitLayout(); });
}

function initFitLayout() {
    new MutationObserver(queueFit).observe(document.querySelector("main"), { childList: true, subtree: true });
    new MutationObserver(queueFit).observe(document.getElementById("mainApp"), { attributes: true, attributeFilter: ["style"] });
    window.addEventListener("resize", queueFit);
    window.addEventListener("orientationchange", queueFit);
}


/* =========================================================
    DESLIZAMIENTO (SWIPE) CON ANIMACIÓN
    - Horizontal: cambia de pestaña (Semana / Rutinas / Historial);
      dentro de las páginas de ejercicios de una rutina pasa de página.
    - Vertical (solo en Entreno): cambia de página de ejercicios.
    La pantalla sigue al dedo; al soltar se completa o rebota.
========================================================= */

/* Profundidad: la pantalla actual se aleja hacia el lado contrario al que vas, se encoge y se
   desvanece; la nueva llega desde el lado al que vas, desde el fondo, y se agranda hasta su sitio. */
const ANIM = {
    out: (p, a) => ({ transform: `translate${a}(${p * 18}%) scale(${1 - 0.16 * Math.abs(p)})`, opacity: 1 - Math.abs(p), origin: "50% 50%" }),
    in:  (p, a) => ({ transform: `translate${a}(${p * 32}%) scale(${1 - 0.2 * Math.abs(p)})`, opacity: 1 - Math.abs(p), origin: "50% 50%" })
};

/* Mismo estilo para los números de las flechas ▲▼: el número viejo se aleja y el nuevo llega desde el fondo */
const VALUE_ANIM = {
    out: (p, a) => ({ transform: `translate${a}(${p * 70}%) scale(${1 - 0.45 * Math.abs(p)})`, opacity: 1 - Math.abs(p), origin: "50% 50%" }),
    in:  (p, a) => ({ transform: `translate${a}(${p * 85}%) scale(${1 - 0.45 * Math.abs(p)})`, opacity: 1 - Math.abs(p), origin: "50% 50%" })
};

const SWIPE = { busy: false, justDragged: false };

const frameStyle = f => ({ transform: f.transform, opacity: f.opacity, transformOrigin: f.origin });

function setFrame(el, f) {
    el.style.transform = f.transform;
    el.style.opacity = f.opacity;
    el.style.transformOrigin = f.origin;
}

function clearFrame(el) {
    el.style.transform = "";
    el.style.opacity = "";
    el.style.transformOrigin = "";
}

function playFrames(el, from, to, ms, easing) {
    const anim = el.animate([frameStyle(from), frameStyle(to)], { duration: ms, easing, fill: "forwards" });
    return anim.finished.then(() => anim.cancel()).catch(() => {});
}

/* Completa el cambio: sale la pantalla actual, se actualiza el contenido y entra la nueva */
async function commitSwipe(ctx, dir, p0) {
    const A = ANIM, a = ctx.axis === "x" ? "X" : "Y";
    SWIPE.busy = true;

    await playFrames(ctx.el, A.out(p0, a), A.out(-dir, a), 170, "ease-in");

    clearFrame(ctx.el);
    ctx.run(dir);
    fitLayout(true);

    setFrame(ctx.el, A.in(dir, a));
    await playFrames(ctx.el, A.in(dir, a), A.in(0, a), 260, "cubic-bezier(.2,.8,.2,1)");

    clearFrame(ctx.el);
    SWIPE.busy = false;
}

/* Cambia el texto de un valor (kg, repeticiones) con animación.
   dir = +1 al subir (▲): el número viejo sale hacia arriba y el nuevo llega desde abajo; -1 al bajar (▼).
   El dato ya está guardado cuando se llama: solo se anima lo que se ve. */
async function animateValue(box, dir, text) {
    let span = box.querySelector(".v");
    if (!span) {
        span = document.createElement("span");
        span.className = "v";
        span.textContent = box.textContent;
        box.textContent = "";
        box.appendChild(span);
    }

    const token = (span._token = (span._token || 0) + 1);
    const mid = span.dataset.anim === "1";   /* ya había una animación en curso: no repite la salida */
    span.dataset.anim = "1";
    span.getAnimations().forEach(a => a.cancel());

    if (!mid) await playFrames(span, VALUE_ANIM.out(0, "Y"), VALUE_ANIM.out(-dir, "Y"), 90, "ease-in");
    if (token !== span._token) return;

    span.textContent = text;
    setFrame(span, VALUE_ANIM.in(dir, "Y"));
    await playFrames(span, VALUE_ANIM.in(dir, "Y"), VALUE_ANIM.in(0, "Y"), 160, "cubic-bezier(.2,.8,.2,1)");
    if (token !== span._token) return;

    clearFrame(span);
    delete span.dataset.anim;
}

/* Rebote: vuelve a su sitio (también cuando no hay más páginas) */
async function snapBack(ctx, p0) {
    const A = ANIM, a = ctx.axis === "x" ? "X" : "Y";
    SWIPE.busy = true;
    await playFrames(ctx.el, A.out(p0, a), A.out(0, a), 240, "cubic-bezier(.2,.9,.3,1.2)");
    clearFrame(ctx.el);
    SWIPE.busy = false;
}

/* Qué se desliza según dónde se toque y hacia qué eje */
function swipeContext(inHeader, axis) {
    const main = document.querySelector("main");
    const active = document.querySelector(".section.active").id;

    const tabs = { el: main, axis: "x", can: () => true, run: d => shiftWeekTab(d) };

    if (inHeader) return axis === "x" ? tabs : null;

    if (active === "workout") {
        if (axis === "x") return tabs;
        const day = findDay(findRoutine(activeWorkout.routineId) || { days: [] }, activeWorkout.dayId);
        const total = day ? Math.ceil(day.exercises.length / EXERCISES_PER_SCREEN) : 1;
        if (total < 2) return null;
        return {
            el: document.getElementById("workoutExercises"), axis: "y",
            can: d => workoutPage + d >= 0 && workoutPage + d < total,
            run: d => shiftWorkoutPage(d)
        };
    }

    if (axis !== "x") return null;

    if (active === "exercises" && routineNav.level === "exercises") {
        const day = findDay(findRoutine(routineNav.routineId), routineNav.dayId);
        const total = Math.max(1, Math.ceil(day.exercises.length / EXERCISES_PER_PAGE));
        return {
            el: document.getElementById("routinesContainer"), axis: "x",
            can: d => (routineNav.exercisePage || 0) + d >= 0 && (routineNav.exercisePage || 0) + d < total,
            run: d => { routineNav.exercisePage = (routineNav.exercisePage || 0) + d; renderRoutinesTab(); }
        };
    }

    return tabs;
}

function initSwipe() {
    const app = document.getElementById("mainApp");
    let g = null;

    app.addEventListener("pointerdown", e => {
        if (SWIPE.busy || (e.pointerType === "mouse" && e.button !== 0)) return;
        if (e.target.closest("input, textarea, select, .kg-value, .reps-value")) return;
        g = { x: e.clientX, y: e.clientY, t: performance.now(), inHeader: !!e.target.closest("header"), axis: null, ctx: null, p: 0, dir: 0, can: false };
    });

    window.addEventListener("pointermove", e => {
        if (!g) return;
        const dx = e.clientX - g.x, dy = e.clientY - g.y;

        if (!g.axis) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
            g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
            g.ctx = swipeContext(g.inHeader, g.axis);
            if (!g.ctx) { g = null; return; }
            g.size = g.axis === "x" ? g.ctx.el.offsetWidth : g.ctx.el.offsetHeight;
            g.ctx.el.style.willChange = "transform, opacity";
        }

        const d = g.axis === "x" ? dx : dy;
        g.dir = d < 0 ? 1 : -1;               /* deslizar a la izquierda / arriba = siguiente */
        g.can = g.ctx.can(g.dir);
        g.p = Math.max(-1, Math.min(1, d / g.size)) * (g.can ? 1 : 0.18);   /* sin más páginas: resistencia */
        g.dragging = true;

        const A = ANIM;
        setFrame(g.ctx.el, A.out(g.p, g.axis === "x" ? "X" : "Y"));
    });

    const finish = (e, cancelled) => {
        if (!g) return;
        const gesture = g;
        g = null;
        if (!gesture.dragging) return;

        gesture.ctx.el.style.willChange = "";
        SWIPE.justDragged = true;
        setTimeout(() => { SWIPE.justDragged = false; }, 60);

        const d = Math.abs(gesture.axis === "x" ? e.clientX - gesture.x : e.clientY - gesture.y);
        const velocity = d / Math.max(1, performance.now() - gesture.t);
        const passed = Math.abs(gesture.p) > 0.22 || (velocity > 0.45 && d > 30);

        if (!cancelled && gesture.can && passed) commitSwipe(gesture.ctx, gesture.dir, gesture.p);
        else snapBack(gesture.ctx, gesture.p);
    };

    window.addEventListener("pointerup", e => finish(e, false));
    window.addEventListener("pointercancel", e => finish(e, true));

    /* Un arrastre no debe activar el botón sobre el que terminó el dedo */
    app.addEventListener("click", e => {
        if (SWIPE.justDragged) { e.stopPropagation(); e.preventDefault(); }
    }, true);
}

document.addEventListener("DOMContentLoaded", () => {
    initSwipe();
    renderDots(document.getElementById("tabDots"), TAB_ORDER.length, 0);
    initFitLayout();
    initLanding();
    renderWeekSection();
    renderSeriesPanel();
    renderRoutinesTab();
});
