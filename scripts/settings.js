/* =========================================================
    AJUSTES DE ESTILO: tema claro/oscuro, color del destello y foto de perfil
    Se guardan en state.settings = { theme, glow }.
========================================================= */

const GLOW_PALETTES = [
    { id: "verde",    name: "Verde",    g1: "76, 175, 109", g2: "224, 192, 64" },
    { id: "azul",     name: "Azul",     g1: "70, 130, 230", g2: "150, 100, 230" },
    { id: "morado",   name: "Morado",   g1: "150, 90, 220", g2: "230, 100, 170" },
    { id: "rosa",     name: "Rosa",     g1: "232, 100, 150", g2: "240, 160, 90" },
    { id: "rojo",     name: "Rojo",     g1: "224, 85, 85",  g2: "240, 150, 70" },
    { id: "naranja",  name: "Naranja",  g1: "240, 150, 60", g2: "224, 192, 64" },
    { id: "turquesa", name: "Turquesa", g1: "40, 190, 190", g2: "70, 130, 230" },
    { id: "gris",     name: "Gris",     g1: "160, 160, 170", g2: "110, 110, 120" }
];

function getSettings() {
    state.settings = Object.assign({ theme: "dark", glow: "verde" }, state.settings || {});
    return state.settings;
}

function applySettings() {
    const st = getSettings();
    const root = document.documentElement;
    const palette = GLOW_PALETTES.find(p => p.id === st.glow) || GLOW_PALETTES[0];

    if (st.theme === "light") root.dataset.theme = "light";
    else delete root.dataset.theme;

    root.style.setProperty("--glow1", palette.g1);
    root.style.setProperty("--glow2", palette.g2);

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = st.theme === "light" ? "#f4f4f1" : "#181818";
}

let settingsOverlay = null;

function openSettings() {
    if (settingsOverlay) return;
    const st = getSettings();

    const overlay = document.createElement("div");
    overlay.className = "picker-overlay";
    const sheet = document.createElement("div");
    sheet.className = "picker-sheet settings-sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");

    const head = document.createElement("div");
    head.className = "picker-head";
    head.innerHTML = '<h3 class="picker-title">Ajustes</h3>';
    const closeBtn = document.createElement("button");
    closeBtn.className = "picker-close";
    closeBtn.setAttribute("aria-label", "Cerrar");
    closeBtn.textContent = "✕";
    head.appendChild(closeBtn);
    sheet.appendChild(head);

    const label = text => { const d = document.createElement("div"); d.className = "settings-label"; d.textContent = text; return d; };

    /* Tema */
    const seg = document.createElement("div");
    seg.className = "seg";
    [["dark", "Oscuro"], ["light", "Claro"]].forEach(([value, text]) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "seg-btn" + (st.theme === value ? " active" : "");
        b.textContent = text;
        b.onclick = () => {
            getSettings().theme = value;
            saveState();
            applySettings();
            seg.querySelectorAll(".seg-btn").forEach(x => x.classList.toggle("active", x === b));
        };
        seg.appendChild(b);
    });
    sheet.append(label("Tema"), seg);

    /* Color del destello */
    const swatches = document.createElement("div");
    swatches.className = "swatches";
    GLOW_PALETTES.forEach(pal => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "swatch" + (st.glow === pal.id ? " active" : "");
        b.style.background = `linear-gradient(135deg, rgb(${pal.g1}) 0%, rgb(${pal.g1}) 55%, rgb(${pal.g2}) 100%)`;
        b.setAttribute("aria-label", pal.name);
        b.title = pal.name;
        b.onclick = () => {
            getSettings().glow = pal.id;
            saveState();
            applySettings();
            swatches.querySelectorAll(".swatch").forEach(x => x.classList.toggle("active", x === b));
        };
        swatches.appendChild(b);
    });
    sheet.append(label("Color del destello"), swatches);

    /* Foto */
    const photoWrap = document.createElement("div");
    photoWrap.className = "settings-photo";
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "dialog-btn danger";
    delBtn.textContent = "Quitar foto de perfil";
    delBtn.disabled = !state.photo;
    delBtn.onclick = async () => {
        const ok = await askConfirm({
            title: "Quitar foto",
            message: "Se borrará la foto de perfil para que puedas elegir otra.",
            confirmLabel: "Quitar"
        });
        if (!ok) return;
        removeProfilePhoto();
        delBtn.disabled = true;
    };
    photoWrap.appendChild(delBtn);
    sheet.append(label("Foto de perfil"), photoWrap);

    overlay.appendChild(sheet);

    const close = () => {
        if (!settingsOverlay) return;
        settingsOverlay = null;
        window.removeEventListener("keydown", onKey, true);
        overlay.style.pointerEvents = "none";
        sheet.animate([{ transform: "none", opacity: 1 }, { transform: "scale(0.9) translateY(4%)", opacity: 0 }], { duration: 130, easing: "ease-in", fill: "forwards" });
        overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 130, fill: "forwards" }).finished.then(() => overlay.remove()).catch(() => overlay.remove());
    };
    const onKey = e => { if (dialogOverlay) return; if (e.key === "Escape") { e.preventDefault(); close(); } };
    window.addEventListener("keydown", onKey, true);
    closeBtn.onclick = close;
    overlay.addEventListener("pointerdown", e => { if (e.target === overlay) close(); });

    document.body.appendChild(overlay);
    settingsOverlay = overlay;

    overlay.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "ease-out" });
    sheet.animate([{ transform: "scale(0.84) translateY(6%)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" });
}

function removeProfilePhoto() {
    state.photo = null;
    saveState();
    const img = document.getElementById("profileImg");
    img.removeAttribute("src");
    img.style.display = "none";
    document.getElementById("profilePlaceholder").style.display = "";
}

applySettings();
document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("settingsBtn");
    if (btn) btn.addEventListener("click", openSettings);
});
