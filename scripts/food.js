/* =========================================================
    COMIDA: contador de calorías por porciones del plan nutricional
    Cada alimento equivale a N porciones de un grupo (harina, proteína, grasa…)
    y cada porción tiene un valor promedio. Son aproximaciones: para afinarlas
    basta con cambiar los números de FOOD_GROUPS.
    c = carbohidratos (g), p = proteína (g), f = grasa (g) por porción.
    goal = porciones al día del plan (null = sin meta).
========================================================= */

const FOOD_GROUPS = [
    { k: "h",  name: "Harinas",     c: 15, p: 3, f: 1, goal: 21,   color: "#e08a4b" },
    { k: "bg", name: "Proteína BG", c: 0,  p: 7, f: 1, goal: 10,   color: "#d9544f" },
    { k: "mg", name: "Proteína MG", c: 0,  p: 7, f: 5, goal: 2,    color: "#ef7a6a" },
    { k: "g",  name: "Grasas",      c: 0,  p: 0, f: 5, goal: 6,    color: "#f2c14e" },
    { k: "v",  name: "Vegetales",   c: 5,  p: 2, f: 0, goal: 3,    color: "#4caf6d" },
    { k: "fr", name: "Frutas",      c: 15, p: 0, f: 0, goal: null, color: "#9ccc65" },
    { k: "l",  name: "Lácteos",     c: 12, p: 8, f: 3, goal: null, color: "#5aa9e6" }
];

const FOOD_GROUP = Object.fromEntries(FOOD_GROUPS.map(g => [g.k, g]));
const groupKcal = g => 4 * g.c + 4 * g.p + 9 * g.f;
const PLAN_KCAL = FOOD_GROUPS.reduce((sum, g) => sum + (g.goal || 0) * groupKcal(g), 0);

/* [nombre, equivalencia de 1 porción, (opcional) unidad en plural, (opcional) porciones por unidad] */
const FOOD_CATALOG = {
    h: [
        ["Arroz blanco", "1/3 taza (60 g)"],
        ["Arroz integral / Lentejas", "1/3 taza (70 g)"],
        ["Frijol entero o molido", "1/4 taza (60 g)"],
        ["Gallo pinto / Yuca", "1/3 taza (50 g)"],
        ["Garbanzo cocido", "1/3 taza (50 g)"],
        ["Garbanzo enlatado", "1/3 taza (65 g)"],
        ["Pasta (varias)", "1/2 taza (50 g)"],
        ["Canelón", "2 unidades"],
        ["Papa / Camote hervido", "1/2 taza (100 g)"],
        ["Papa / Camote horneado", "1/3 taza (80 g)"],
        ["Ayote sazón / Calabaza", "1 taza (250 g)"],
        ["Tiquizque", "1/4 taza (80 g)"],
        ["Plátano maduro", "1/4 taza (60 g)"],
        ["Elote / Maíz dulce", "1 mediano (85 g)"],
        ["Quinoa", "1/2 taza (65 g)"],
        ["Avena / Nestum / Granola", "1/4 taza (20 g)"],
        ["Nochis (crudo)", "1/3 taza (21 g)"],
        ["Cereal Allinklusive ZERO", "1/4 taza (26 g)"],
        ["Cereal (Cheerios, Zucaritas…)", "1/4 taza (20 g)"],
        ["Cereal Trijuelas", "1/4 taza (17,5 g)"],
        ["Pan cuadrado", "2 rebanadas (según tu menú)"],
        ["Pan / Bollitos Ruiseñor", "1 unidad"],
        ["Pan Thins Bimbo", "1 pieza"],
        ["Pan baguette", "4 dedos"],
        ["Pan hamburguesa artesano", "3 H"],
        ["Rapiditas de Bimbo (Med)", "1 unidad"],
        ["Tortilla Misión casera", "3 H"],
        ["Tortilla chalupa / taco Imasa", "2 unidades"],
        ["Tortiricas o Fogón", "2 unidades"],
        ["Galleta-arroz Bioland / Bicentury", "2 unidades"],
        ["Galleta-arroz Sanissimo", "4 unidades"],
        ["Galleta soda / María / Rice crispy", "1 paquete"],
        ["Harina de maíz (Juana / Maseca)", "2 cdas (24 g)"],
        ["Mezcla pancakes Tosh", "2 cdas (23 g)"],
        ["Miel", "1 cda (25 ml)"],
        ["Mermelada con azúcar", "1 cda (25 g)"],
        ["Pasas", "1 cda (20 g)"],
        ["Cocoa 0% azúcar", "1 cdta (20 g)"]
    ],
    bg: [
        ["Pechuga de pollo / Salmón", "30 g"],
        ["Muslo deshuesado", "25 g"],
        ["Beef steak / Molida res 10%", "20 g"],
        ["Molida res premium 5%", "25 g"],
        ["Lomito / Solomillo", "27 g"],
        ["Chuleta ahumada", "30 g"],
        ["Pescado blanco (corvina, tilapia)", "35 g"],
        ["Trucha", "25 g"],
        ["Calamar", "40 g"],
        ["Camarón cocido", "50 g"],
        ["Clara de huevo", "2 unidades"],
        ["Clara pasteurizada", "85 ml"],
        ["Jamón de pavo o light", "2-3 rebanadas"],
        ["Queso cottage", "50 g"],
        ["Queso ricotta", "40 g"],
        ["String cheese light", "1 unidad"],
        ["Atún Sabemas aceite", "1 lata = 5 porciones", "latas", 5],
        ["Atún Sabemas / Member agua", "1 lata = 4 porciones", "latas", 4],
        ["Atún Pronto aceite", "1 lata = 4 porciones", "latas", 4],
        ["Sardimar Funcional", "1 lata = 3 porciones", "latas", 3],
        ["Sardina salsa-tomate", "1 lata = 3 porciones", "latas", 3],
        ["Sardina light / Tesoro / Calvo", "1 lata = 2,5 porciones", "latas", 2.5],
        ["Whey protein", "1 scoop = 3 porciones", "scoops", 3]
    ],
    mg: [
        ["Huevo (completo)", "1 unidad"],
        ["Carne de res (+15% grasa)", "28 g"],
        ["Cerdo (chuleta / beef steak)", "30 g"],
        ["Tocineta", "1,5 unidades"],
        ["Salchicha de pavo", "1 unidad"],
        ["Nuggets de pollo Pipasa", "40 g"],
        ["Queso (Turrialba, semiduro, fresco, mozzarella)", "28 g"],
        ["Mozzarella Great Value Low skin", "26 g"],
        ["Queso Delactomy rallado", "23 g"],
        ["Queso Turrialba del Prado", "25 g"],
        ["Queso Dos Pinos 50%+ proteína", "28 g"],
        ["String cheese (stick)", "1 unidad"],
        ["Chicharritos Jacks", "15 g"],
        ["Atún Member Selection", "1 lata = 4 porciones", "latas", 4],
        ["Torta de arroz estándar", "1 torta = 2 porciones", "tortas", 2],
        ["Torta Beef Angus MS", "1 torta = 5 porciones", "tortas", 5]
    ],
    g: [
        ["Aceite (oliva, coco, canola…)", "1 cdta (5 g)"],
        ["Aguacate / Aceitunas", "1/4 o 2 cdas (30 g)"],
        ["Maní natural o con sal", "10 u o 1 cdta (8 g)"],
        ["Mantequilla de maní / almendra", "1 cdta (8 g)"],
        ["Mantequilla normal", "1 cdta (8 g)"],
        ["Mantequilla Light Dos Pinos", "2 cdtas (11 g)"],
        ["Almendra / Marañón", "8 unidades"],
        ["Nuez / Pecana", "1 cdta (7 g)"],
        ["Pistacho / Coco rallado", "1 cdta (10 g)"],
        ["Semilla de calabaza / girasol", "1 cdta (8 g)"],
        ["Chía / Linaza", "2 cdas (10 g)"],
        ["Chocolate Dark 75% o más", "2 piezas (10 g)"],
        ["Chips de chocolate / Granola Keto", "2 cdtas (10 g)"],
        ["Natilla Light Dos Pinos", "2 cdas (40 g)"],
        ["Mayonesa Delga-C", "2 cdas (45 g)"],
        ["Mayonesa Light Helmans", "2 cdas (20 g)"],
        ["Queso crema Dos Pinos Light", "1 cda (20 g)"],
        ["Leche de almendra", "1 taza (300 ml)"],
        ["Leche de coco", "1/2 taza (150 ml)"]
    ],
    v: [
        ["Vegetales frescos (ensalada)", "1 taza"],
        ["Vegetales hervidos / cocidos", "1/2 taza"]
    ],
    fr: [
        ["Banano", "1 pequeño (70 g)"],
        ["Manzana / Durazno", "1 pequeño (110 g)"],
        ["Naranja", "1/2 unidad (120 g)"],
        ["Pera", "1/2 unidad (100 g)"],
        ["Ciruela", "1 mediana (130 g)"],
        ["Fresa / Carambola", "5 u / 1 u (190 g)"],
        ["Piña", "3/4 taza (120 g)"],
        ["Sandía", "1 1/4 taza (200 g)"],
        ["Melón", "1 taza (180 g)"],
        ["Uva / Guayaba", "8 u / 1/2 (90 g)"],
        ["Mango", "1/2 unidad (100-130 g)"],
        ["Papaya", "3/4 taza (140 g)"],
        ["Kiwi", "1/2 unidad (100 g)"],
        ["Arándanos", "3/4 taza (100 g)"],
        ["Frambuesa", "1 taza (110 g)"],
        ["Mora", "1/3 taza"],
        ["Granadilla", "1 unidad (65 g)"],
        ["Cas / Cereza", "2 medianas (120 g)"],
        ["Guanábana", "4 cdas (95 g)"],
        ["Dátil", "1 unidad (20 g)"],
        ["Mamón chino / Jocote", "5 unidades"],
        ["Mamoncillo", "5 unidades (100 g)"],
        ["Jugo 100% de naranja", "1/2 taza (200 ml)"],
        ["Jugo 100% de manzana", "1/3 taza (130 ml)"],
        ["Agua de pipa", "1 pipa (300 ml)"],
        ["Mermelada St-Dalfour", "1 cda (25 g)"]
    ],
    l: [
        ["Leche", "1 taza (250 ml)"],
        ["Yogurt 0% grasa", "1/2 taza (200 ml)"],
        ["Yogurt griego Member Selection", "1/2 taza (175 ml)"],
        ["Yogurt natural Dos Pinos", "1/2 taza (165 ml)"],
        ["Helado Prote DP (chocolate o coco)", "4 cdas (70 g)"],
        ["Leche condensada", "5 cdas (75 g)"]
    ]
};

/* ---------- datos ---------- */

const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtNum = (n, d = 1) => Number(n).toLocaleString("es-ES", { maximumFractionDigits: d });

function foodEntries(key = dateKey()) {
    return (state.food && state.food.log && state.food.log[key]) || [];
}

function addFoodEntry(entry) {
    state.food ??= { log: {} };
    state.food.log ??= {};
    (state.food.log[dateKey()] ??= []).push(entry);
    saveState();
}

function removeFoodEntry(id) {
    const key = dateKey();
    if (!state.food?.log?.[key]) return;
    state.food.log[key] = state.food.log[key].filter(e => e.id !== id);
    if (!state.food.log[key].length) delete state.food.log[key];
    saveState();
}

function foodTotals(entries) {
    const portions = {};
    let kcal = 0, c = 0, p = 0, f = 0;
    entries.forEach(e => {
        const g = FOOD_GROUP[e.g];
        if (!g) return;
        portions[e.g] = (portions[e.g] || 0) + e.p;
        kcal += e.p * groupKcal(g);
        c += e.p * g.c;
        p += e.p * g.p;
        f += e.p * g.f;
    });
    return { portions, kcal, c, p, f };
}

/* ---------- pantalla ---------- */

function renderFood() {
    const root = document.getElementById("foodContent");
    if (!root) return;

    const entries = foodEntries();
    const t = foodTotals(entries);
    const pct = Math.min(100, (t.kcal / PLAN_KCAL) * 100);

    const chips = FOOD_GROUPS.map(g => {
        const have = t.portions[g.k] || 0;
        const ratio = g.goal ? Math.min(100, (have / g.goal) * 100) : (have > 0 ? 100 : 0);
        const over = g.goal && have > g.goal;
        return `<button class="food-chip${over ? " over" : ""}" data-g="${g.k}" style="--c:${g.color}">
            <span class="fc-name">${g.name}</span>
            <span class="fc-val"><b>${fmtNum(have)}</b>${g.goal ? ` / ${g.goal}` : ""}</span>
            <i style="width:${ratio}%"></i>
        </button>`;
    }).join("");

    const rows = entries.slice().reverse().map(e => {
        const g = FOOD_GROUP[e.g];
        if (!g) return "";
        return `<div class="food-row" style="--c:${g.color}">
            <span class="fr-dot"></span>
            <span class="fr-name">${esc(e.n)}<small>${esc(e.t)}</small></span>
            <span class="fr-kcal">${fmtNum(e.p * groupKcal(g), 0)} kcal</span>
            <button class="fr-del" data-id="${e.id}" aria-label="Quitar">✕</button>
        </div>`;
    }).join("");

    root.innerHTML = `
        <div class="food-summary">
            <div class="food-kcal"><b>${fmtNum(t.kcal, 0)}</b><span>/ ${fmtNum(PLAN_KCAL, 0)} kcal</span></div>
            <div class="food-bar"><i style="width:${pct}%"></i></div>
            <div class="food-macros">
                <span>Carbohidratos <b>${fmtNum(t.c, 0)} g</b></span>
                <span>Proteína <b>${fmtNum(t.p, 0)} g</b></span>
                <span>Grasa <b>${fmtNum(t.f, 0)} g</b></span>
            </div>
        </div>
        <div class="food-groups">${chips}<button class="food-chip food-add" data-add="1">+ Comida</button></div>
        <div class="food-list-title">Hoy</div>
        <div class="food-list" data-scroll>${rows || '<p class="food-empty">Toca un grupo o "+ Comida" para agregar lo que comas.</p>'}</div>`;
}

document.addEventListener("click", e => {
    const root = document.getElementById("foodContent");
    if (!root || !root.contains(e.target) || SWIPE.justDragged) return;

    const del = e.target.closest(".fr-del");
    if (del) { removeFoodEntry(del.dataset.id); renderFood(); return; }

    const chip = e.target.closest(".food-chip");
    if (!chip) return;
    openFoodPicker(chip.dataset.add ? null : chip.dataset.g);
});

/* ---------- agregar ---------- */

function openFoodPicker(groupKey) {
    const keys = groupKey ? [groupKey] : FOOD_GROUPS.map(g => g.k);

    openPicker({
        title: groupKey ? FOOD_GROUP[groupKey].name : "Agregar comida",
        searchable: true,
        groups: keys.map(k => ({
            title: groupKey ? null : FOOD_GROUP[k].name,
            items: FOOD_CATALOG[k].map(item => ({ label: item[0], sub: item[1], value: { g: k, item } }))
        })),
        createLabel: "Porciones sueltas",
        onPick: ({ g, item }) => askFoodAmount(g, item),
        onCreate: query => {
            const loose = g => askFoodAmount(g, [query || FOOD_GROUP[g].name, "1 porción"]);
            if (groupKey) { loose(groupKey); return; }
            openPicker({
                title: "¿De qué grupo?",
                groups: [{ items: FOOD_GROUPS.map(g => ({ label: g.name, sub: `≈ ${fmtNum(groupKcal(g), 0)} kcal`, value: g.k })) }],
                onPick: loose
            });
        },
        emptyText: "Sin alimentos"
    });
}

function askFoodAmount(groupKey, item) {
    const [name, equiv, unit, per] = item;
    const perUnit = per || 1;
    const unitName = unit || "porciones";
    let qty = 1;

    openStepper({
        title: name,
        subtitle: unit ? equiv : `1 porción = ${equiv}`,
        unit: unitName,
        doneLabel: "Agregar",
        cancelLabel: "Cancelar",
        read: () => fmtNum(qty, 2),
        step: dir => { qty = Math.max(1, Math.round((qty + dir) * 100) / 100); },
        onType: async () => {
            const value = await askText({
                title: "Cantidad",
                label: `Cantidad (${unitName})`,
                value: String(qty).replace(".", ","),
                inputMode: "decimal",
                maxLength: 6,
                validate: v => { const n = parseFloat(v.replace(",", ".")); return (isNaN(n) || n <= 0 || n > 99) ? "Introduce una cantidad válida." : ""; }
            });
            if (value !== null) qty = Math.round(parseFloat(value.replace(",", ".")) * 100) / 100;
        },
        onClose: confirmed => {
            if (!confirmed) return;
            addFoodEntry({
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                n: name,
                g: groupKey,
                p: qty * perUnit,
                t: `${fmtNum(qty, 2)} ${qty === 1 ? unitName.replace(/(ciones|s)$/, m => m === "ciones" ? "ción" : "") : unitName}`
            });
            renderFood();
        }
    });
}
