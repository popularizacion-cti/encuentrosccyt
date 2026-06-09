// ================================
// CONFIGURACIÓN DE LA FUENTE DE DATOS DRIVE
// ================================
const SHEET_ID = "1KXmB725GOfa-ROh7L9MHNcgAT9KqXDFrwNGOZmAJe1s";
const URL_DRIVE = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;

let encuentrosGlobal = [];
let encuentrosFiltrados = [];
let indiceCarruselActual = 0;

let chartEncuentros, chartAsistentes, chartRegiones;

// Normalización de texto limpia para evitar problemas con tildes y mayúsculas
const normalizarNombre = (str) => {
    if (!str) return "";
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
};

// ================================
// CARGA INICIAL DE DATOS
// ================================
async function inicializarObservatorio() {
    try {
        const response = await fetch(URL_DRIVE);
        const text = await response.text();
        const json = JSON.parse(text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1));

        encuentrosGlobal = json.table.rows.map(r => ({
            nombre: r.c[0]?.v || "Encuentro de CCyT",
            ciudad: r.c[1]?.v || "Por definir",
            region: r.c[2]?.v || "Por definir",
            ugel: r.c[3]?.v || "No especifica",
            mes: r.c[4]?.v || "",
            anio: String(r.c[5]?.v || ""),
            institucion: r.c[6]?.v || "CONCYTEC",
            lugar: r.c[7]?.v || "Sede central",
            alcance: r.c[8]?.v || "Nacional",
            descripcion: r.c[9]?.v || "Sin descripción disponible.",
            enlace: r.c[10]?.v || "#",
            clubes: Number(r.c[11]?.v || 0),
            estudiantes: Number(r.c[12]?.v || 0),
            docentes: Number(r.c[13]?.v || 0),
            participantes: Number(r.c[14]?.v || 0)
        }));

        encuentrosFiltrados = [...encuentrosGlobal];
        
        await cargarMapaPeruSVG();
        construirSelectoresFiltro();
        vincularEventosInteraccion();
        procesarVisualizacion();
    } catch (error) {
        console.error("Error cargando el Observatorio:", error);
    }
}

// ================================
// CARGA NATIVA DEL MAPA SVG
// ================================
async function cargarMapaPeruSVG() {
    try {
        const res = await fetch('peru.svg');
        const svgText = await res.text();
        document.getElementById('contenedor-svg').innerHTML = svgText;
        
        const paths = document.querySelectorAll('#contenedor-svg svg path');
        paths.forEach(p => {
            p.classList.add('region-path', 'fill-slate-200', 'stroke-white');
            
            p.addEventListener('click', () => {
                const regionId = p.getAttribute('id') || p.getAttribute('name');
                if (regionId) {
                    document.getElementById('filtroRegion').value = regionId;
                    ejecutarFiltradoEstructural();
                }
            });

            p.addEventListener('mousemove', (evento) => {
                const regionId = p.getAttribute('id') || p.getAttribute('name');
                if (!regionId) return;

                // Contamos cuántos encuentros tiene esta región en la lista actual filtrada
                const totalEncuentrosRegion = encuentrosFiltrados.filter(e => 
                    normalizarNombre(e.region) === normalizarNombre(regionId)
                ).length;

                const tooltip = document.getElementById('tooltip-mapa');
                
                // Inyectamos la información estructurada con la paleta corporativa
                tooltip.innerHTML = `
                    <div class="font-bold text-brand border-b border-slate-700/50 pb-1 mb-1 text-[13px]">${regionId}</div>
                    <div class="text-slate-300">📊 Encuentros: <span class="font-black text-white text-sm">${totalEncuentrosRegion}</span></div>
                `;

                // Hacemos visible el tooltip y lo posicionamos al lado del puntero
                tooltip.classList.remove('hidden');
                tooltip.style.left = (evento.pageX + 15) + 'px';
                tooltip.style.top = (evento.pageY + 15) + 'px';
            });

            p.addEventListener('mouseout', () => {
                // Volvemos a ocultar el tooltip inmediatamente al salir de la región
                document.getElementById('tooltip-mapa').classList.add('hidden');
            });

        });
    } catch (e) {
        console.error("Error renderizando mapa SVG nativo:", e);
    }
}

// ================================
// SISTEMA DE FILTRADO CON INTERCONEXIÓN (CRUZADO)
// ================================
function ejecutarFiltradoEstructural() {
    // 1. Guardamos qué valores tiene seleccionados el usuario actualmente
    const anioSeleccionado = document.getElementById("filtroAnio").value;
    const regionSeleccionada = document.getElementById("filtroRegion").value;

    // 2. Filtramos la data maestra de encuentrosGlobal
    encuentrosFiltrados = encuentrosGlobal.filter(e => 
        (!anioSeleccionado || e.anio === anioSeleccionado) &&
        (!regionSeleccionada || normalizarNombre(e.region) === normalizarNombre(regionSeleccionada))
    );

    // 3. RECALCULAR FILTROS CRUZADOS: Reconfiguramos las opciones disponibles
    // Si no hay año seleccionado, actualizamos el selector de años en base a la región activa y viceversa
    if (!anioSeleccionado) {
        inyectarOpcionesSelect("filtroAnio", [...new Set(encuentrosFiltrados.map(e => e.anio))]);
    }
    if (!regionSeleccionada) {
        inyectarOpcionesSelect("filtroRegion", [...new Set(encuentrosFiltrados.map(e => e.region))]);
    }

    // 4. Restauramos los valores en los elementos HTML para que no se pierda la selección del usuario
    document.getElementById("filtroAnio").value = anioSeleccionado;
    document.getElementById("filtroRegion").value = regionSeleccionada;

    // 5. Actualizamos el estado visual de la región activa en el mapa SVG
    document.querySelectorAll('.region-path').forEach(el => {
        const id = el.getAttribute('id') || el.getAttribute('name');
        if (regionSeleccionada && normalizarNombre(id) === normalizarNombre(regionSeleccionada)) {
            el.classList.add('active-region');
        } else {
            el.classList.remove('active-region');
        }
    });

    indiceCarruselActual = 0; 
    procesarVisualizacion();
}

// ================================
// RENDERIZADO DEL CARRUSEL DE TARJETAS
// ================================
function renderizarCarrusel() {
    const contenedor = document.getElementById("listaEventos");
    const infoPaginacion = document.getElementById("infoPaginacion");
    const btnPrev = document.getElementById("prevCard");
    const btnNext = document.getElementById("nextCard");

    contenedor.innerHTML = "";
    const total = encuentrosFiltrados.length;

    if (total === 0) {
        infoPaginacion.innerText = "0 / 0";
        btnPrev.disabled = true;
        btnNext.disabled = true;
        contenedor.innerHTML = `
            <div class="bg-white p-8 rounded-2xl shadow-xl text-center border-t-4 border-brand">
                <span class="text-4xl block mb-2">🔍</span>
                <p class="text-slate-500 font-bold">No se encontraron encuentros con los filtros seleccionados.</p>
            </div>`;
        return;
    }

    infoPaginacion.innerText = `${indiceCarruselActual + 1} / ${total}`;
    btnPrev.disabled = indiceCarruselActual === 0;
    btnNext.disabled = indiceCarruselActual === total - 1;

    const e = encuentrosFiltrados[indiceCarruselActual];

    contenedor.innerHTML = `
        <div class="bg-white rounded-2xl shadow-xl border-t-4 border-accent overflow-hidden transition-all duration-300">
            <div class="bg-accent/10 p-5 border-b border-accent/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                    <span class="text-xs uppercase font-bold text-accent tracking-widest bg-white px-2.5 py-1 rounded-md shadow-sm border border-accent/10 inline-block mb-1">
                        📆 ${e.mes ? e.mes + ', ' : ''} ${e.anio}
                    </span>
                    <h3 class="text-xl font-black text-slate-800">${e.nombre}</h3>
                </div>
                <span class="text-xs font-bold text-white bg-dark px-3 py-1 rounded-full shrink-0 shadow-sm">
                    🌍 Alcance: ${e.alcance}
                </span>
            </div>

            <div class="p-6 space-y-6">
                <div class="grid sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm">
                    <div class="space-y-2">
                        <p class="text-slate-600"><span class="font-bold text-slate-800">📍 Región:</span> ${e.region}</p>
                        <p class="text-slate-600"><span class="font-bold text-slate-800">🏢 UGEL:</span> ${e.ugel}</p>
                        <p class="text-slate-600"><span class="font-bold text-slate-800">🏛️ Lugar:</span> ${e.lugar} (${e.ciudad})</p>
                    </div>
                    <div class="space-y-2">
                        <p class="text-slate-600"><span class="font-bold text-slate-800">👤 Organizador:</span> ${e.institucion}</p>
                        <p class="text-slate-600">
                            <span class="font-bold text-slate-800">🔗 Enlace:</span> 
                            <a href="${e.enlace}" target="_blank" class="text-brand font-semibold hover:underline">${e.enlace !== '#' ? 'Visitar Sitio →' : 'No disponible'}</a>
                        </p>
                    </div>
                </div>

                <div class="space-y-1.5">
                    <h4 class="font-bold text-xs uppercase tracking-wider text-slate-700">📄 Descripción General</h4>
                    <p class="text-sm text-slate-600 leading-relaxed">${e.descripcion}</p>
                </div>

                <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div class="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-center">
                        <span class="text-2xl block">🔬</span>
                        <span class="text-base font-black text-slate-800 block">${e.clubes}</span>
                        <span class="text-[10px] font-medium text-slate-500 uppercase tracking-tight">CCyT</span>
                    </div>
                    <div class="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-center">
                        <span class="text-2xl block">👩‍🎓</span>
                        <span class="text-base font-black text-dark block">${e.estudiantes}</span>
                        <span class="text-[10px] font-medium text-slate-500 uppercase tracking-tight">Estudiantes</span>
                    </div>
                    <div class="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-center">
                        <span class="text-2xl block">👨‍🏫</span>
                        <span class="text-base font-black text-accent block">${e.docentes}</span>
                        <span class="text-[10px] font-medium text-slate-500 uppercase tracking-tight">Docentes</span>
                    </div>
                    <div class="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-center bg-brand/5 border-brand/20">
                        <span class="text-2xl block">🔥</span>
                        <span class="text-base font-black text-brand block">${e.participantes}</span>
                        <span class="text-[10px] font-bold text-slate-600 uppercase tracking-tight">Participantes</span>
                    </div>
                </div>
            </div>
        </div>`;
}

// ================================
// LOGICA DE RELLENO Y KPIs
// ================================
function actualizarKPIs() {
    const totalRegiones = new Set(encuentrosFiltrados.map(e => normalizarNombre(e.region))).size;
    const totalAsistentes = encuentrosFiltrados.reduce((acc, curr) => acc + curr.participantes, 0);

    document.getElementById("kpiCobertura").innerText = `${totalRegiones} Regiones`;
    document.getElementById("kpiTotal").innerText = `${encuentrosFiltrados.length} Encuentros`;
    document.getElementById("kpiAsistentes").innerText = totalAsistentes.toLocaleString() + " Asistentes";
}

function actualizarIluminacionMapa() {
    const conteoPorRegion = encuentrosFiltrados.reduce((acc, e) => {
        const regNorm = normalizarNombre(e.region);
        acc[regNorm] = (acc[regNorm] || 0) + 1;
        return acc;
    }, {});

    const paths = document.querySelectorAll('.region-path');
    paths.forEach(p => {
        const idRegion = normalizarNombre(p.getAttribute('id') || p.getAttribute('name'));
        const cantidad = conteoPorRegion[idRegion] || 0;

        if (p.classList.contains('active-region')) return;

        p.style.fill = cantidad === 0 ? "#E2E8F0" : "#4DB748";
    });
}

function actualizarGraficosEstadisticos() {
    const mAnio = {};
    encuentrosFiltrados.forEach(e => { if(e.anio) mAnio[e.anio] = (mAnio[e.anio] || 0) + 1; });
    
    if (chartEncuentros) chartEncuentros.destroy();
    chartEncuentros = new Chart(document.getElementById("graficoEncuentros"), {
        type: "line",
        data: {
            labels: Object.keys(mAnio),
            datasets: [{ label: "Eventos por Año", data: Object.values(mAnio), borderColor: "#7A2C8E", backgroundColor: "rgba(122,44,142,0.1)", tension: 0.3, fill: true }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    const mAsist = {};
    encuentrosFiltrados.forEach(e => { if(e.anio) mAsist[e.anio] = (mAsist[e.anio] || 0) + e.participantes; });
    
    if (chartAsistentes) chartAsistentes.destroy();
    chartAsistentes = new Chart(document.getElementById("graficoAsistentes"), {
        type: "bar",
        data: {
            labels: Object.keys(mAsist),
            datasets: [{ label: "Asistentes totales", data: Object.values(mAsist), backgroundColor: "#F79131" }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    const mReg = {};
    encuentrosFiltrados.forEach(e => { if(e.region) mReg[e.region] = (mReg[e.region] || 0) + 1; });

    if (chartRegiones) chartRegiones.destroy();
    chartRegiones = new Chart(document.getElementById("graficoRegiones"), {
        type: "bar",
        data: {
            labels: Object.keys(mReg),
            datasets: [{ label: "Encuentros por Región", data: Object.values(mReg), backgroundColor: "#4DB748" }]
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false }
    });
}

function procesarVisualizacion() {
    actualizarKPIs();
    renderizarCarrusel();
    actualizarIluminacionMapa();
    actualizarGraficosEstadisticos();
}

function construirSelectoresFiltro() {
    inyectarOpcionesSelect("filtroAnio", [...new Set(encuentrosGlobal.map(e => e.anio))]);
    inyectarOpcionesSelect("filtroRegion", [...new Set(encuentrosGlobal.map(e => e.region))]);
}

function inyectarOpcionesSelect(id, listado) {
    const el = document.getElementById(id);
    el.innerHTML = `<option value="">Todos</option>`;
    listado.filter(Boolean).sort().forEach(item => {
        el.innerHTML += `<option value="${item}">${item}</option>`;
    });
}

function vincularEventosInteraccion() {
    document.querySelectorAll("select").forEach(sel => {
        sel.addEventListener("change", ejecutarFiltradoEstructural);
    });

    document.getElementById("prevCard").addEventListener("click", () => {
        if (indiceCarruselActual > 0) {
            indiceCarruselActual--;
            renderizarCarrusel();
        }
    });

    document.getElementById("nextCard").addEventListener("click", () => {
        if (indiceCarruselActual < encuentrosFiltrados.length - 1) {
            indiceCarruselActual++;
            renderizarCarrusel();
        }
    });

    document.getElementById("btn-limpiar").addEventListener("click", () => {
        document.getElementById("filtroAnio").value = "";
        document.getElementById("filtroRegion").value = "";
        document.querySelectorAll('.region-path').forEach(el => el.classList.remove('active-region'));
        encuentrosFiltrados = [...encuentrosGlobal];
        indiceCarruselActual = 0;
        procesarVisualizacion();
    });
}

document.addEventListener("DOMContentLoaded", inicializarObservatorio);
