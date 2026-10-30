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
    logs: {},
    food: { log: {} }
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

let saveWarned = false;
function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        return true;
    } catch (e) {
        if (!saveWarned) {
            saveWarned = true;
            showMessage({ title: "No se pudo guardar", message: "El almacenamiento del teléfono está lleno o bloqueado. Exporta un respaldo y libera espacio." });
        }
        return false;
    }
}

/* Reduce la foto a ~320px (JPEG) para que ocupe pocos KB */
function shrinkImage(file, max = 320) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const k = Math.min(1, max / Math.max(img.width, img.height));
            const c = document.createElement("canvas");
            c.width = Math.round(img.width * k);
            c.height = Math.round(img.height * k);
            c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            resolve(c.toDataURL("image/jpeg", 0.85));
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("img")); };
        img.src = url;
    });
}

/* ---------- Respaldo ---------- */
function exportBackup() {
    const blob = new Blob([JSON.stringify({ app: "qpeeg", version: 1, state }, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `qpeeg-respaldo-${dateKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function importBackup(file) {
    let data;
    try {
        data = JSON.parse(await file.text());
    } catch (e) { data = null; }
    const st = data && data.app === "qpeeg" ? data.state : null;
    if (!st || !Array.isArray(st.routines) || typeof st.logs !== "object") {
        showMessage({ title: "Archivo no válido", message: "Ese archivo no es un respaldo de Q.P.E.E.G." });
        return;
    }
    const ok = await askConfirm({
        title: "Importar respaldo",
        message: "Esto reemplazará todos tus datos actuales por los del respaldo.",
        confirmLabel: "Reemplazar",
        danger: true
    });
    if (!ok) return;
    state = Object.assign(structuredClone(DEFAULT_STATE), st);
    if (saveState()) location.reload();
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
    document.getElementById("exportBtn").addEventListener("click", exportBackup);
    const imp = document.getElementById("importInput");
    document.getElementById("importBtn").addEventListener("click", () => imp.click());
    imp.addEventListener("change", () => { if (imp.files[0]) importBackup(imp.files[0]); imp.value = ""; });
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

    enterApp(true);
}

function onPhotoSelected(event) {
    const file = event.target.files[0];
    if (!file) return;

    shrinkImage(file).then(data => {
        state.photo = data;
        saveState();
        document.getElementById("profileImg").src = state.photo;
        document.getElementById("profileImg").style.display = "block";
        document.getElementById("profilePlaceholder").style.display = "none";
    }).catch(() => showMessage({ title: "Foto no válida", message: "No se pudo leer esa imagen." }));
    event.target.value = "";
}

function enterApp(animated) {
    const landing = document.getElementById("landing");
    const app = document.getElementById("mainApp");
    const show = () => setHeaderDateText(getDateText());

    if (animated && !SWIPE.busy) {
        switchScreen(landing, app, 1, "flex", show);
        return;
    }

    landing.style.display = "none";
    app.style.display = "flex";
    show();
}

/* Cambia entre la pantalla de inicio y la app con la animación Profundidad */
async function switchScreen(fromEl, toEl, dir, toDisplay, after) {
    SWIPE.busy = true;
    document.body.style.overflowX = "hidden";

    await playFrames(fromEl, ANIM.out(0, "X"), ANIM.out(-dir, "X"), 170, "ease-in");

    fromEl.style.display = "none";
    toEl.style.display = toDisplay;
    if (after) after();
    fitLayout(true);

    setFrame(toEl, ANIM.in(dir, "X"));
    await playFrames(toEl, ANIM.in(dir, "X"), ANIM.in(0, "X"), 260, "cubic-bezier(.2,.8,.2,1)");

    clearFrame(toEl);
    document.body.style.overflowX = "";
    SWIPE.busy = false;
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

async function onAddAchievement() {
    const text = await askText({ title: "Nuevo objetivo", label: "Escribe un objetivo o logro", maxLength: 60, placeholder: "Ej. Dominada con +10 kg" });
    if (!text) return;

    state.achievements.push(text);
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
    { id: "food", label: "COMIDA" },
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
    } else if (sectionId === "food") {
        setHeaderDateText(getDateText());
        renderFood();
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

/* Botón de la casita (siempre visible en el encabezado): vuelve a la pantalla de inicio de toda la app,
   la del perfil. Al volver a entrar, la app empieza en Semana. */
function goHome() {
    if (SWIPE.busy) return;

    switchScreen(document.getElementById("mainApp"), document.getElementById("landing"), -1, "flex", () => {
        selectedDate = null;
        showSection("week");
        stopTooltipLoop();
        startTooltipLoop();
        window.scrollTo(0, 0);
    });
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

    /* El semáforo se pinta con las tarjetas ya dentro del documento */
    day.exercises.slice(start, start + EXERCISES_PER_SCREEN).forEach(exercise => updateSemaphore(routineId, dayId, exercise.id));

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
    attachValueSwipe(kgBox.querySelector(".kg-value"), dir => changeWorkoutKg(routineId, dayId, exerciseId, dir * KG_STEP), () => openStepper({
        title: ex.name,
        subtitle: "Peso",
        unit: "kg",
        read: () => String(readExerciseLog(routineId, getWorkoutDateKey(), getWorkoutExercise(routineId, dayId, exerciseId)).kg),
        step: dir => changeWorkoutKg(routineId, dayId, exerciseId, dir * KG_STEP),
        onType: () => setCustomWorkoutKg(routineId, dayId, exerciseId),
        onClose: refreshWorkout
    }));
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
        attachValueSwipe(valueBox, dir => changeWorkoutReps(routineId, dayId, exerciseId, index, dir, valueBox), () => openStepper({
            title: ex.name,
            subtitle: `Serie ${toRoman(index + 1)} · repeticiones (meta ${ex.series[index].target})`,
            unit: "reps",
            read: () => String(readExerciseLog(routineId, getWorkoutDateKey(), getWorkoutExercise(routineId, dayId, exerciseId)).reps[index]),
            step: dir => changeWorkoutReps(routineId, dayId, exerciseId, index, dir, null),
            onClose: refreshWorkout
        }));
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

    if (valueBox && log.reps[index] !== before) animateValue(valueBox, delta > 0 ? 1 : -1, String(log.reps[index]));
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

const EXERCISE_NAME_MAX = 20;

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

async function deleteRoutine(routineId) {
    const routine = findRoutine(routineId);

    if (!await askConfirm({ title: "Borrar rutina", message: `¿Borrar la rutina "${routine.name}" completa, con todos sus días y ejercicios? Esta acción no se puede deshacer.` })) return;

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
    openPicker({
        title: "Nueva rutina",
        groups: [{ items: ROUTINE_PRESETS.map(p => ({ label: p.name, sub: p.days.join(" · "), value: p })) }],
        createLabel: "Rutina personalizada",
        onPick: preset => createRoutine(preset.name, preset.key),
        onCreate: async () => {
            const name = await askText({ title: "Rutina personalizada", label: "Nombre de la rutina", maxLength: 24 });
            if (name) createRoutine(name, null);
        }
    });
}

function createRoutine(name, preset) {
    const routine = { id: newId("routine"), name, preset, days: [] };
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

    /* Opciones según la rutina prefabricada elegida (o todas, si es personalizada); sin repetir las ya creadas */
    const preset = ROUTINE_PRESETS.find(p => p.key === routine.preset);
    const used = routine.days.map(d => normalizeText(d.name));
    const options = (preset ? preset.days : GENERIC_DAYS).filter(n => !used.includes(normalizeText(n)));

    openPicker({
        title: "Nuevo día",
        groups: [{ items: options.map(n => ({ label: n, value: n })) }],
        emptyText: "Ya añadiste todos los días de esta rutina",
        createLabel: "Día personalizado",
        onPick: name => createDay(routineId, name),
        onCreate: async () => {
            const name = await askText({ title: "Día personalizado", label: "Nombre del día (vacío = \"Día N\")", maxLength: 24, allowEmpty: true });
            if (name === null) return;
            createDay(routineId, name);   /* vacío = "Día N" automático */
        }
    });
}

function createDay(routineId, name) {
    const routine = findRoutine(routineId);
    if (routine.days.length >= 6) return;

    routine.days.push({ id: newId("day"), name: name || "", customName: !!name, exercises: [] });
    renumberAutoDays(routine);
    saveState();
    renderRoutinesTab();
}

async function deleteDay(routineId, dayId) {
    const routine = findRoutine(routineId);
    const day = findDay(routine, dayId);

    if (!await askConfirm({ title: "Borrar día", message: `¿Borrar "${day.name}" y todos sus ejercicios? Esta acción no se puede deshacer.` })) return;

    routine.days = routine.days.filter(d => d.id !== dayId);
    renumberAutoDays(routine);
    saveState();
    renderRoutinesTab();
}

async function renameDay(routineId, dayId) {
    const routine = findRoutine(routineId);
    const day = findDay(routine, dayId);

    const name = await askText({ title: "Renombrar día", label: "Nombre del día", value: day.name, maxLength: 24 });
    if (!name) return;

    day.name = name;
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
        showMessage({ title: "Límite alcanzado", message: `Máximo ${MAX_EXERCISE_PAGES} páginas de ejercicios por día.` });
        return;
    }

    /* Grupos musculares del día primero (Push: pecho, hombro, tríceps...), sin repetir los ya añadidos */
    const used = day.exercises.map(e => normalizeText(e.name));
    const priority = priorityGroups(day.name);
    const groups = Object.entries(EXERCISE_CATALOG)
        .sort(([a], [b]) => priorityIndex(priority, a) - priorityIndex(priority, b))
        .map(([title, names]) => ({
            title,
            items: names.filter(n => !used.includes(normalizeText(n))).map(n => ({ label: n, value: n }))
        }));

    openPicker({
        title: "Añadir ejercicio",
        groups,
        searchable: true,
        createLabel: "Nuevo ejercicio",
        onPick: name => createExercise(routineId, dayId, name),
        onCreate: async query => {
            const name = await askText({ title: "Nuevo ejercicio", label: `Nombre del ejercicio (máx. ${EXERCISE_NAME_MAX} caracteres)`, value: query || "", maxLength: EXERCISE_NAME_MAX });
            if (name) createExercise(routineId, dayId, name);
        }
    });
}

function createExercise(routineId, dayId, name) {
    const day = findDay(findRoutine(routineId), dayId);
    name = name.slice(0, EXERCISE_NAME_MAX).trim();
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

async function deleteRoutineExercise(routineId, dayId, exerciseIndex) {
    const routine = findRoutine(routineId);
    const day = findDay(routine, dayId);
    const exercise = day.exercises[exerciseIndex];

    if (!await askConfirm({ title: "Borrar ejercicio", message: `¿Borrar el ejercicio "${exercise.name}"? Esta acción no se puede deshacer.` })) return;

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
    attachValueSwipe(kgValue, dir => changeRoutineKg(routineId, dayId, exerciseIndex, dir * KG_STEP, kgValue), () => openStepper({
        title: exercise.name,
        subtitle: "Peso",
        unit: "kg/lbs",
        read: () => String(findDay(findRoutine(routineId), dayId).exercises[exerciseIndex].kg),
        step: dir => changeRoutineKg(routineId, dayId, exerciseIndex, dir * KG_STEP, null),
        onType: () => setCustomRoutineKg(routineId, dayId, exerciseIndex),
        onClose: renderRoutinesTab
    }));
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
        attachValueSwipe(repsValue, dir => changeRoutineReps(routineId, dayId, exerciseIndex, serieIndex, dir, repsValue), () => openStepper({
            title: exercise.name,
            subtitle: `Serie ${toRoman(serieIndex + 1)} · repeticiones objetivo`,
            unit: "reps",
            read: () => String(findDay(findRoutine(routineId), dayId).exercises[exerciseIndex].series[serieIndex].target),
            step: dir => changeRoutineReps(routineId, dayId, exerciseIndex, serieIndex, dir, null),
            onClose: renderRoutinesTab
        }));
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
    if (valueBox && exercise.kg !== before) animateValue(valueBox, delta > 0 ? 1 : -1, `${exercise.kg} kg/lbs`);
}

function changeRoutineReps(routineId, dayId, exerciseIndex, serieIndex, delta, valueBox) {
    const day = findDay(findRoutine(routineId), dayId);
    const serie = day.exercises[exerciseIndex].series[serieIndex];

    const before = serie.target;
    serie.target = Math.max(0, serie.target + delta);
    saveState();
    if (valueBox && serie.target !== before) animateValue(valueBox, delta > 0 ? 1 : -1, String(serie.target));
}

async function setCustomRoutineKg(routineId, dayId, exerciseIndex) {
    const day = findDay(findRoutine(routineId), dayId);
    const exercise = day.exercises[exerciseIndex];

    const value = await askText({
        title: "Peso personalizado",
        label: "Peso (kg/lbs)",
        value: String(exercise.kg),
        inputMode: "decimal",
        maxLength: 7,
        validate: v => { const n = parseFloat(v.replace(",", ".")); return (isNaN(n) || n < 0) ? "Introduce un peso válido." : ""; }
    });
    if (value === null) return;

    exercise.kg = parseFloat(value.replace(",", "."));
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

/* Deslizar sobre el número lo sube/baja (un paso cada stepPx px). Un toque corto (sin mover) llama a onTap. */
function attachValueSwipe(el, onStep, onTap, stepPx = VALUE_STEP_PX) {
    let lastY = null, pointer = null, startX = 0, startY = 0, startT = 0, moved = false;

    el.addEventListener("pointerdown", e => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        lastY = startY = e.clientY;
        startX = e.clientX;
        startT = performance.now();
        moved = false;
        pointer = e.pointerId;
        try { el.setPointerCapture(pointer); } catch (err) {}
    });

    el.addEventListener("pointermove", e => {
        if (lastY === null || e.pointerId !== pointer) return;
        if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) moved = true;

        let dy = e.clientY - lastY;
        while (Math.abs(dy) >= stepPx) {
            const dir = dy < 0 ? 1 : -1;          /* arriba = subir */
            onStep(dir);
            lastY -= dir * stepPx;
            dy = e.clientY - lastY;
        }
    });

    el.addEventListener("pointerup", () => {
        const tap = lastY !== null && !moved && onTap && performance.now() - startT < 400;
        lastY = null; pointer = null;
        if (tap) onTap();
    });
    el.addEventListener("pointercancel", () => { lastY = null; pointer = null; });
}

function refreshWorkout() {
    renderWorkoutForDay(activeWorkout.routineId, activeWorkout.dayId);
    renderSeriesPanel();
}

/* Peso exacto en Entreno (como ya existía en Rutinas) */
async function setCustomWorkoutKg(routineId, dayId, exerciseId) {
    const ex = getWorkoutExercise(routineId, dayId, exerciseId);
    const current = readExerciseLog(routineId, getWorkoutDateKey(), ex).kg;

    const value = await askText({
        title: "Peso exacto",
        label: "Peso (kg/lbs)",
        value: String(current),
        inputMode: "decimal",
        maxLength: 7,
        validate: v => { const n = parseFloat(v.replace(",", ".")); return (isNaN(n) || n < 0) ? "Introduce un peso válido." : ""; }
    });
    if (value === null) return;

    const log = ensureExerciseLog(routineId, getWorkoutDateKey(), dayId, ex);
    log.kg = parseFloat(value.replace(",", "."));
    saveState();
}

/* =========================================================
    CUADRO PARA CAMBIAR UN NÚMERO (toque corto sobre peso o repeticiones)
    Ventana más grande que el cuadro original: un área grande para deslizar
    arriba/abajo, botones ▲ ▼ (mantenerlos presionados repite) y, en el peso,
    un acceso para escribirlo exacto.
========================================================= */

let stepperOverlay = null;

function openStepper({ title, subtitle, unit, read, step, onType, onClose, doneLabel, cancelLabel }) {
    if (stepperOverlay) return;

    const overlay = document.createElement("div");
    overlay.className = "picker-overlay stepper-overlay";

    const sheet = document.createElement("div");
    sheet.className = "picker-sheet stepper-sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");

    const heading = document.createElement("h3");
    heading.className = "picker-title stepper-title";
    heading.textContent = title;
    const sub = document.createElement("div");
    sub.className = "stepper-sub";
    sub.textContent = subtitle;

    const up = document.createElement("button");
    up.type = "button";
    up.className = "stepper-btn";
    up.setAttribute("aria-label", "Subir");
    up.textContent = "▲";

    const down = document.createElement("button");
    down.type = "button";
    down.className = "stepper-btn";
    down.setAttribute("aria-label", "Bajar");
    down.textContent = "▼";

    const box = document.createElement("div");
    box.className = "stepper-value";
    box.textContent = read();

    const unitEl = document.createElement("div");
    unitEl.className = "stepper-unit";
    unitEl.textContent = unit;

    const hint = document.createElement("div");
    hint.className = "stepper-hint";
    hint.textContent = "Desliza sobre el número o usa ▲ ▼";

    const actions = document.createElement("div");
    actions.className = "dialog-actions";
    if (onType) {
        const typeBtn = document.createElement("button");
        typeBtn.type = "button";
        typeBtn.className = "dialog-btn ghost";
        typeBtn.textContent = "Escribir";
        typeBtn.onclick = async () => { if (!ready()) return; await onType(); box.textContent = read(); };
        actions.appendChild(typeBtn);
    }
    if (cancelLabel) {
        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "dialog-btn ghost";
        cancelBtn.textContent = cancelLabel;
        cancelBtn.onclick = () => { if (ready()) close(false); };
        actions.appendChild(cancelBtn);
    }
    const done = document.createElement("button");
    done.type = "button";
    done.className = "dialog-btn accept";
    done.textContent = doneLabel || "Listo";
    actions.appendChild(done);

    sheet.append(heading, sub, up, box, unitEl, down, hint, actions);
    overlay.appendChild(sheet);

    const apply = dir => {
        const before = read();
        step(dir);
        const after = read();
        if (after !== before) animateValue(box, dir, after);
    };

    /* Botones ▲ ▼: un paso al tocar; si se mantienen, se repite */
    const bindRepeat = (btn, dir) => {
        let timer = null, interval = null;
        const stop = () => { clearTimeout(timer); clearInterval(interval); timer = interval = null; };
        btn.addEventListener("pointerdown", e => {
            e.preventDefault();
            apply(dir);
            timer = setTimeout(() => { interval = setInterval(() => apply(dir), 110); }, 420);
        });
        ["pointerup", "pointerleave", "pointercancel"].forEach(ev => btn.addEventListener(ev, stop));
        btn.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); apply(dir); } });
    };
    bindRepeat(up, 1);
    bindRepeat(down, -1);

    attachValueSwipe(box, apply, null, 34);

    /* el "clic" que acompaña al toque que abrió el cuadro no debe pulsar nada */
    const openedAt = performance.now();
    const ready = () => performance.now() - openedAt > 350;

    let closed = false;
    const close = (confirmed = true) => {
        if (closed) return;
        closed = true;
        window.removeEventListener("keydown", onKey, true);
        stepperOverlay = null;

        overlay.style.pointerEvents = "none";
        sheet.animate([{ transform: "none", opacity: 1 }, { transform: "scale(0.9) translateY(4%)", opacity: 0 }], { duration: 130, easing: "ease-in", fill: "forwards" });
        overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 130, fill: "forwards" }).finished.then(() => overlay.remove()).catch(() => overlay.remove());
        if (onClose) onClose(confirmed);
    };

    const onKey = e => {
        if (dialogOverlay) return;   /* hay un cuadro de texto encima: que lo maneje él */
        if (e.key === "Escape") { e.preventDefault(); close(!cancelLabel); }
        else if (e.key === "Enter") { e.preventDefault(); close(true); }
        else if (e.key === "ArrowUp") { e.preventDefault(); apply(1); }
        else if (e.key === "ArrowDown") { e.preventDefault(); apply(-1); }
    };
    window.addEventListener("keydown", onKey, true);

    done.onclick = () => { if (ready()) close(true); };
    overlay.addEventListener("pointerdown", e => { if (e.target === overlay) close(!cancelLabel); });

    document.body.appendChild(overlay);
    stepperOverlay = overlay;

    overlay.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "ease-out" });
    sheet.animate([{ transform: "scale(0.84) translateY(6%)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" });
}


/* =========================================================
    MENÚ EMERGENTE (rutinas, días y ejercicios prefabricados)
    Una ventana flotante sobre la app (no es una sección): buscador arriba
    (solo en ejercicios), lista en el medio y botón de "crear" abajo.
    Así se escribe menos con el teclado.
========================================================= */

const ROUTINE_PRESETS = [
    { key: "tp",  name: "Torso-Pierna",   days: ["Torso", "Pierna"] },
    { key: "ppl", name: "Push-Pull-Legs", days: ["Push", "Pull", "Legs"] },
    { key: "fb",  name: "Full Body",      days: ["Full Body A", "Full Body B", "Full Body C"] }
];

const GENERIC_DAYS = ["Push", "Pull", "Legs", "Torso", "Pierna", "Full Body"];

/* Todos los nombres caben en EXERCISE_NAME_MAX caracteres */
const EXERCISE_CATALOG = {
    "Pecho": ["Press banca", "Press inclinado", "Press declinado", "Press mancuernas", "Aperturas", "Cruce de poleas", "Pec deck", "Fondos", "Flexiones"],
    "Espalda": ["Dominadas", "Jalón al pecho", "Remo con barra", "Remo mancuerna", "Remo T", "Remo polea baja", "Pullover polea", "Peso muerto"],
    "Hombro": ["Press militar", "Press hombro", "Elev. laterales", "Elev. frontales", "Pájaros", "Face pull", "Encogimientos"],
    "Bíceps": ["Curl barra", "Curl mancuernas", "Curl martillo", "Curl predicador", "Curl inclinado", "Curl polea"],
    "Tríceps": ["Press francés", "Extensión polea", "Ext. sobre cabeza", "Press cerrado", "Fondos tríceps", "Patada tríceps"],
    "Pierna": ["Sentadilla", "Sentadilla frontal", "Prensa", "Zancadas", "Sentadilla búlgara", "Ext. cuádriceps", "Curl femoral", "Peso muerto rumano", "Gemelos"],
    "Glúteo": ["Hip thrust", "Puente de glúteo", "Patada de glúteo", "Abductores"],
    "Core": ["Plancha", "Crunch", "Elev. de piernas", "Rueda abdominal", "Russian twist"]
};

const DAY_GROUPS = [
    [/push/, ["Pecho", "Hombro", "Tríceps"]],
    [/pull/, ["Espalda", "Bíceps"]],
    [/leg|pierna/, ["Pierna", "Glúteo", "Core"]],
    [/torso|upper/, ["Pecho", "Espalda", "Hombro", "Bíceps", "Tríceps"]]
];

function normalizeText(text) {
    return String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function priorityGroups(dayName) {
    const n = normalizeText(dayName);
    const hit = DAY_GROUPS.find(([re]) => re.test(n));
    return hit ? hit[1] : [];
}

function priorityIndex(priority, group) {
    const i = priority.indexOf(group);
    return i === -1 ? 99 : i;
}

let pickerOverlay = null;

/* options: { title, groups: [{ title?, items: [{ label, sub?, value }] }], searchable, createLabel, emptyText, onPick(value), onCreate(query) } */
function openPicker(options) {
    closePicker(true);

    const overlay = document.createElement("div");
    overlay.className = "picker-overlay";

    const sheet = document.createElement("div");
    sheet.className = "picker-sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");

    const head = document.createElement("div");
    head.className = "picker-head";
    const title = document.createElement("h3");
    title.className = "picker-title";
    title.textContent = options.title;
    const closeBtn = document.createElement("button");
    closeBtn.className = "picker-close";
    closeBtn.setAttribute("aria-label", "Cerrar");
    closeBtn.textContent = "✕";
    closeBtn.onclick = () => closePicker();
    head.append(title, closeBtn);
    sheet.appendChild(head);

    let search = null;
    if (options.searchable) {
        search = document.createElement("input");
        search.type = "search";
        search.className = "picker-search";
        search.placeholder = "Buscar…";
        search.autocomplete = "off";
        search.spellcheck = false;
        sheet.appendChild(search);
    }

    const list = document.createElement("div");
    list.className = "picker-list";
    sheet.appendChild(list);

    if (options.onCreate) {
        const createBtn = document.createElement("button");
        createBtn.className = "picker-create";
        createBtn.textContent = `+ ${options.createLabel}`;
        createBtn.onclick = () => {
            const query = search ? search.value.trim() : "";
            closePicker();
            options.onCreate(query);
        };
        sheet.appendChild(createBtn);
    }

    const renderList = () => {
        const query = search ? normalizeText(search.value) : "";
        list.innerHTML = "";
        let count = 0;

        options.groups.forEach(group => {
            const items = group.items.filter(item => !query || normalizeText(item.label).includes(query));
            if (!items.length) return;

            if (group.title) {
                const heading = document.createElement("div");
                heading.className = "picker-group";
                heading.textContent = group.title;
                list.appendChild(heading);
            }

            items.forEach(item => {
                const btn = document.createElement("button");
                btn.className = "picker-item";
                const label = document.createElement("span");
                label.textContent = item.label;
                btn.appendChild(label);
                if (item.sub) {
                    const sub = document.createElement("small");
                    sub.textContent = item.sub;
                    btn.appendChild(sub);
                }
                btn.onclick = () => {
                    closePicker();
                    options.onPick(item.value);
                };
                list.appendChild(btn);
                count++;
            });
        });

        if (!count) {
            const empty = document.createElement("p");
            empty.className = "picker-empty";
            empty.textContent = query ? "Sin resultados. Puedes crearlo con el botón de abajo." : (options.emptyText || "Sin opciones");
            list.appendChild(empty);
        }
    };

    if (search) search.addEventListener("input", renderList);
    renderList();

    overlay.addEventListener("pointerdown", e => { if (e.target === overlay) closePicker(); });
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    pickerOverlay = overlay;

    overlay.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "ease-out" });
    sheet.animate(
        [{ transform: "scale(0.84) translateY(6%)", opacity: 0 }, { transform: "none", opacity: 1 }],
        { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" }
    );
}

function closePicker(immediate) {
    const overlay = pickerOverlay;
    if (!overlay) return;
    pickerOverlay = null;

    if (immediate) { overlay.remove(); return; }

    const sheet = overlay.firstElementChild;
    overlay.style.pointerEvents = "none";
    sheet.animate([{ transform: "none", opacity: 1 }, { transform: "scale(0.9) translateY(4%)", opacity: 0 }], { duration: 140, easing: "ease-in", fill: "forwards" });
    overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: "forwards" }).finished.then(() => overlay.remove()).catch(() => overlay.remove());
}

document.addEventListener("keydown", e => { if (e.key === "Escape" && !dialogOverlay) closePicker(); });


/* =========================================================
    CUADROS DE DIÁLOGO PROPIOS (reemplazan prompt / confirm / alert del navegador)
    Misma ventana flotante que el menú de selección. Devuelven una promesa:
      askText(...)    -> texto (sin espacios en los extremos) o null si se cancela
      askConfirm(...) -> true / false
      showMessage(...)-> se resuelve al cerrarlo
========================================================= */

let dialogOverlay = null;

function openDialog({ title, message, input, buttons, validate }) {
    return new Promise(resolve => {
        if (dialogOverlay) { dialogOverlay.remove(); dialogOverlay = null; }

        const overlay = document.createElement("div");
        overlay.className = "picker-overlay dialog-overlay";

        const sheet = document.createElement("form");
        sheet.className = "picker-sheet dialog-sheet";
        sheet.setAttribute("role", "dialog");
        sheet.setAttribute("aria-modal", "true");
        sheet.noValidate = true;

        const heading = document.createElement("h3");
        heading.className = "picker-title dialog-title";
        heading.textContent = title;
        sheet.appendChild(heading);

        if (message) {
            const text = document.createElement("p");
            text.className = "dialog-text";
            text.textContent = message;
            sheet.appendChild(text);
        }

        let field = null, error = null;
        if (input) {
            field = document.createElement("input");
            field.className = "dialog-input";
            field.type = "text";
            field.value = input.value || "";
            field.placeholder = input.placeholder || "";
            if (input.maxLength) field.maxLength = input.maxLength;
            if (input.inputMode) field.inputMode = input.inputMode;
            field.autocomplete = "off";
            field.spellcheck = false;
            field.setAttribute("aria-label", input.label || title);

            if (input.label) {
                const label = document.createElement("label");
                label.className = "dialog-text";
                label.textContent = input.label;
                sheet.appendChild(label);
            }
            sheet.appendChild(field);

            error = document.createElement("div");
            error.className = "dialog-error";
            sheet.appendChild(error);
        }

        const actions = document.createElement("div");
        actions.className = "dialog-actions";
        sheet.appendChild(actions);

        let finished = false;
        const finish = value => {
            if (finished) return;
            finished = true;
            window.removeEventListener("keydown", onKey, true);
            dialogOverlay = null;

            overlay.style.pointerEvents = "none";
            sheet.animate([{ transform: "none", opacity: 1 }, { transform: "scale(0.9) translateY(4%)", opacity: 0 }], { duration: 130, easing: "ease-in", fill: "forwards" });
            overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 130, fill: "forwards" }).finished.then(() => overlay.remove()).catch(() => overlay.remove());
            resolve(value);
        };

        const submit = button => {
            if (!button.confirm) { finish(button.cancelValue); return; }
            if (!field) { finish(button.value); return; }

            const text = field.value.trim();
            let problem = "";
            if (!text && !input.allowEmpty) problem = "Escribe algo para continuar.";
            else if (validate && text) problem = validate(text) || "";
            else if (input.validate && text) problem = input.validate(text) || "";

            if (problem) { error.textContent = problem; field.focus(); return; }
            finish(text);
        };

        buttons.forEach(b => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = `dialog-btn ${b.kind || "ghost"}`;
            btn.textContent = b.label;
            btn.onclick = () => submit(b);
            actions.appendChild(btn);
            b._el = btn;
        });

        const confirmButton = buttons.find(b => b.confirm);
        const cancelButton = buttons.find(b => !b.confirm) || confirmButton;

        sheet.addEventListener("submit", e => { e.preventDefault(); submit(confirmButton); });
        if (field) field.addEventListener("input", () => { error.textContent = ""; });

        const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); submit(cancelButton); } };
        window.addEventListener("keydown", onKey, true);

        overlay.addEventListener("pointerdown", e => { if (e.target === overlay) submit(cancelButton); });

        overlay.appendChild(sheet);
        document.body.appendChild(overlay);
        dialogOverlay = overlay;

        overlay.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "ease-out" });
        sheet.animate([{ transform: "scale(0.84) translateY(6%)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" });

        const focusTarget = field || confirmButton._el;
        setTimeout(() => { focusTarget.focus(); if (field) field.select(); }, 60);
    });
}

function askText({ title, label, value, placeholder, maxLength, inputMode, allowEmpty, validate, confirmLabel }) {
    return openDialog({
        title,
        input: { label, value, placeholder, maxLength, inputMode, allowEmpty, validate },
        buttons: [
            { label: "Cancelar", kind: "ghost", confirm: false, cancelValue: null },
            { label: confirmLabel || "Aceptar", kind: "accept", confirm: true }
        ]
    });
}

function askConfirm({ title, message, confirmLabel, danger = true }) {
    return openDialog({
        title,
        message,
        buttons: [
            { label: "Cancelar", kind: "ghost", confirm: false, cancelValue: false },
            { label: confirmLabel || "Borrar", kind: danger ? "danger" : "accept", confirm: true, value: true }
        ]
    });
}

function showMessage({ title, message }) {
    return openDialog({
        title,
        message,
        buttons: [{ label: "Entendido", kind: "accept", confirm: true, value: true, cancelValue: undefined }]
    });
}

/* =========================================================
    HISTORIAL
========================================================= */

let historyOffset = 0; /* 0 = mes actual, -1 = anterior */

function renderHistory() {
    const now = new Date();
    const view = new Date(now.getFullYear(), now.getMonth() + historyOffset, 1);
    const year = view.getFullYear();
    const month = view.getMonth();
    const next = document.getElementById("histNext");
    next.disabled = historyOffset >= 0;
    if (!next.dataset.bound) {
        next.dataset.bound = "1";
        next.onclick = () => { if (historyOffset < 0) { historyOffset++; renderHistory(); } };
        document.getElementById("histPrev").onclick = () => { historyOffset--; renderHistory(); };
    }

    const title = view.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
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
            const sc = el.closest("[data-scroll]");
            if (sc && sc !== el) return;   /* lo que está dentro de una lista con su propio scroll no cuenta */
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
        if (axis !== "x") return null;
        const day = findDay(findRoutine(activeWorkout.routineId) || { days: [] }, activeWorkout.dayId);
        const total = day ? Math.ceil(day.exercises.length / EXERCISES_PER_SCREEN) : 1;
        if (total < 2) return tabs;
        return {
            el: document.getElementById("workoutExercises"), axis: "x",
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
