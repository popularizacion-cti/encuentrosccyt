// ================================
// CONFIGURACIÓN GOOGLE SHEETS
// ================================
const SHEET_ID = "1KXmB725GOfa-ROh7L9MHNcgAT9KqXDFrwNGOZmAJe1s";
const URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;

let eventosGlobal = [];
let map;
let geoLayer;
let grafico1, grafico2, grafico3;

// ================================
// CARGA DE DATOS
// ================================
async function cargarDatos() {

  const response = await fetch(URL);
  const text = await response.text();

  // Extraemos el JSON real del wrapper de Google
  const json = JSON.parse(
    text.substring(
      text.indexOf("{"),
      text.lastIndexOf("}") + 1
    )
  );

  // Transformamos datos
  eventosGlobal = json.table.rows.map(r => ({
    nombre: r.c[0]?.v || "",
    ciudad: r.c[1]?.v || "",
    region: r.c[2]?.v || "",
    ugel: r.c[3]?.v || "",
    mes: r.c[4]?.v || "",
    anio: String(r.c[5]?.v || ""),
    institucion: r.c[6]?.v || "",
    lugar: r.c[7]?.v || "",
    alcance: r.c[8]?.v || "",
    descripcion: r.c[9]?.v || "",
    enlace: r.c[10]?.v || "",
    clubes: Number(r.c[11]?.v || 0),
    alumnos: Number(r.c[12]?.v || 0),
    docentes: Number(r.c[13]?.v || 0),
    participantes: Number(r.c[14]?.v || 0),
    modalidad: r.c[15]?.v || ""
  }));

  inicializarMapa();
  cargarFiltros();
  actualizarVisualizacion();
}

// ================================
// MAPA COMPLETAMENTE BLOQUEADO EN PERÚ
// ================================
function inicializarMapa() {

  map = L.map('map', {

    // 🔒 Desactiva todos los controles de interacción
    zoomControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    touchZoom: false,

    // 🔒 Fija el nivel de zoom (no permite acercar ni alejar)
    minZoom: 6,
    maxZoom: 6,

    // 🔒 BLOQUEO GEOGRÁFICO DEL MAPA
    maxBounds: [

      // 👉 PRIMER PAR = ESQUINA SUROESTE
      //    [LATITUD, LONGITUD]
      //    LATITUD controla ALTO (arriba-abajo)
      //    LONGITUD controla ANCHO (izquierda-derecha)

      [-20, -85],   // 🔒 Alto inferior (Sur)  | 🔒 Ancho izquierdo (Oeste)

      // 👉 SEGUNDO PAR = ESQUINA NORESTE
      [5, -65]      // 🔒 Alto superior (Norte) | 🔒 Ancho derecho (Este)

    ],

    // Hace que el mapa "rebote" si intenta salirse
    maxBoundsViscosity: 1.0

  }).setView([-9.19, -75.015], 6);

  // Capa base
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')
    .addTo(map);

  // Carga del GeoJSON
  fetch('peru-regiones.geojson')
    .then(res => res.json())
    .then(data => {
      geoLayer = L.geoJSON(data, {
        style: estiloRegion,
        onEachFeature: onEachRegion
      }).addTo(map);
    });
}

// ================================
// FILTROS
// ================================
function aplicarFiltros() {

  const anio = document.getElementById("filtroAnio").value;
  const region = document.getElementById("filtroRegion").value;
  const inst = document.getElementById("filtroInstitucion").value;
  const alcance = document.getElementById("filtroAlcance").value;

  return eventosGlobal.filter(e =>
    (!anio || e.anio === anio) &&
    (!region || e.region === region) &&
    (!inst || e.institucion === inst) &&
    (!alcance || e.alcance === alcance)
  );
}

// ================================
// ESTILO DINÁMICO DEL MAPA
// ================================
function estiloRegion(feature) {

  const regionNombre = String(feature.properties.NOMBDEP).toUpperCase();
  const filtrados = aplicarFiltros();

  const cantidad = filtrados.filter(e =>
    e.region.toUpperCase() === regionNombre
  ).length;

  const max = Math.max(
    ...Object.values(
      filtrados.reduce((acc, e) => {
        acc[e.region] = (acc[e.region] || 0) + 1;
        return acc;
      }, {})
    ),
    0
  );

  // Transparente si no hay eventos
  if (cantidad === 0) {
    return { fillColor: "transparent", weight: 1, color: "#999", fillOpacity: 0.3 };
  }

  const intensidad = cantidad / max;

  return {
    fillColor: `rgba(181,18,27, ${intensidad})`,
    weight: 1,
    color: "#444",
    fillOpacity: 0.8
  };
}

// ================================
// POPUP POR REGIÓN
// ================================
function onEachRegion(feature, layer) {

  const regionNombre = String(feature.properties.NOMBDEP).toUpperCase();

  layer.on("click", () => {

    const filtrados = aplicarFiltros().filter(e =>
      e.region.toUpperCase() === regionNombre
    );

    const total = filtrados.length;
    const asistentes = filtrados.reduce((a,b)=>a+b.participantes,0);
    const alum = filtrados.reduce((a,b)=>a+b.alumnos,0);
    const doce = filtrados.reduce((a,b)=>a+b.docentes,0);

    layer.bindPopup(`
      <strong>${regionNombre}</strong><br>
      Encuentros: ${total}<br>
      Asistentes: ${asistentes}<br>
      - Estudiantes: ${alum}<br>
      - Docentes: ${doce}
    `).openPopup();
  });
}

// ================================
// LISTA LATERAL
// ================================
function actualizarLista() {

  const contenedor = document.getElementById("listaEventos");
  const filtrados = aplicarFiltros();

  contenedor.innerHTML = "";

  filtrados.forEach(e => {
    contenedor.innerHTML += `
      <div class="evento-item">
        <strong>${e.nombre}</strong><br>
        Región ${e.region} - ${e.mes} ${e.anio}<br>
        Asistentes: ${e.participantes} (${e.alumnos} estudiantes y ${e.docentes} docentes)
      </div>
    `;
  });
}

// ================================
// INDICADORES
// ================================
function actualizarIndicadores() {

  const filtrados = aplicarFiltros();
  const regiones = new Set(filtrados.map(e=>e.region));
  const asistentes = filtrados.reduce((a,b)=>a+b.participantes,0);
  const alum = filtrados.reduce((a,b)=>a+b.alumnos,0);
  const doce = filtrados.reduce((a,b)=>a+b.docentes,0);

  document.getElementById("kpiCobertura").innerHTML =
    `Cobertura: ${regiones.size} regiones`;

  document.getElementById("kpiTotal").innerHTML =
    `Encuentros: ${filtrados.length}`;

  document.getElementById("kpiAsistentes").innerHTML =
    `Asistentes: ${asistentes} (${alum} estudiantes y ${doce} docentes)`;
}

// ================================
// GRÁFICOS
// ================================
function actualizarGraficos() {

  const filtrados = aplicarFiltros();

  // Encuentros por año
  const porAnio = {};
  filtrados.forEach(e=>{
    porAnio[e.anio] = (porAnio[e.anio] || 0) + 1;
  });

  if (grafico1) grafico1.destroy();

  grafico1 = new Chart(document.getElementById("graficoEncuentros"), {
    type: "line",
    data: {
      labels: Object.keys(porAnio),
      datasets: [{
        label: "Encuentros por año",
        data: Object.values(porAnio)
      }]
    },
    options: {
    responsive: false,
    maintainAspectRatio: false
    }
  });

  // Asistentes por año
  const asistentesAnio = {};
  filtrados.forEach(e=>{
    asistentesAnio[e.anio] = (asistentesAnio[e.anio] || 0) + e.participantes;
  });

  if (grafico2) grafico2.destroy();

  grafico2 = new Chart(document.getElementById("graficoAsistentes"), {
    type: "bar",
    data: {
      labels: Object.keys(asistentesAnio),
      datasets: [{
        label: "Asistentes por año",
        data: Object.values(asistentesAnio)
      }]
    },
    options: {
    responsive: false,
    maintainAspectRatio: false
    }
  });

  // Regiones con más encuentros
  const regiones = {};
  filtrados.forEach(e=>{
    regiones[e.region] = (regiones[e.region] || 0) + 1;
  });

  if (grafico3) grafico3.destroy();

  grafico3 = new Chart(document.getElementById("graficoRegiones"), {
    type: "bar",
    data: {
      labels: Object.keys(regiones),
      datasets: [{
        label: "Encuentros por región",
        data: Object.values(regiones)
      }]
    },
    options: {
    responsive: false,
    maintainAspectRatio: false
    }
  });
}

// ================================
// ACTUALIZACIÓN GLOBAL
// ================================
function actualizarVisualizacion() {
  if (geoLayer) geoLayer.setStyle(estiloRegion);
  actualizarIndicadores();
  actualizarGraficos();
  actualizarLista();
}

// ================================
// CARGA DE FILTROS
// ================================
function cargarFiltros() {

  llenarSelect("filtroAnio", [...new Set(eventosGlobal.map(e=>e.anio))]);
  llenarSelect("filtroRegion", [...new Set(eventosGlobal.map(e=>e.region))]);
  llenarSelect("filtroInstitucion", [...new Set(eventosGlobal.map(e=>e.institucion))]);
  llenarSelect("filtroAlcance", [...new Set(eventosGlobal.map(e=>e.alcance))]);

  document.querySelectorAll("select").forEach(s=>{
    s.addEventListener("change", actualizarVisualizacion);
  });
}

function llenarSelect(id, datos) {
  const select = document.getElementById(id);
  select.innerHTML = `<option value="">Todos</option>`;
  datos.filter(Boolean).forEach(d=>{
    select.innerHTML += `<option value="${d}">${d}</option>`;
  });
}

cargarDatos();
