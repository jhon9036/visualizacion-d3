const rutaCSV = "data/Accidentes_Viales_20260426.csv";

const colores = {
  primary: "#1d4ed8",
  primaryDark: "#173b7a",
  teal: "#0f766e",
  amber: "#b45309",
  red: "#dc2626",
  purple: "#7c3aed",
  cyan: "#0891b2",
  text: "#111827",
  muted: "#64748b",
  grid: "#e2e8f0",
  panel: "#ffffff"
};

const paletaBarrios = [
  "#1d4ed8", "#0f766e", "#b45309", "#dc2626",
  "#7c3aed", "#16a34a", "#0891b2", "#ea580c",
  "#475569", "#be185d", "#65a30d", "#2563eb"
];

const mesesCortos = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const formatoNumero = new Intl.NumberFormat("es-CO");
const formatoFechaInput = d3.timeFormat("%Y-%m-%d");
const formatoMes = d3.timeFormat("%Y-%m");

const tooltip = d3.select("body")
  .append("div")
  .attr("class", "tooltip");

let fechasDisponibles = { min: null, max: null };

function normalizarTexto(texto) {
  return String(texto ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function detectarColumna(columnas, palabra) {
  return columnas.find(col => normalizarTexto(col).includes(palabra));
}

function textoSeguro(valor, defecto = "NO REGISTRA") {
  const texto = String(valor ?? "").trim();
  const normalizado = texto.toUpperCase();
  if (!texto || ["NA", "N/A", "NULL", "NONE", "NAN", "UNDEFINED"].includes(normalizado)) {
    return defecto;
  }
  return texto;
}

function numeroSeguro(valor) {
  const texto = String(valor ?? "").trim().replace(",", ".");
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : 0;
}

function normalizarMeses(valor) {
  const meses = {
    enero: "Jan", ene: "Jan",
    febrero: "Feb", feb: "Feb",
    marzo: "Mar", mar: "Mar",
    abril: "Apr", abr: "Apr",
    mayo: "May", may: "May",
    junio: "Jun", jun: "Jun",
    julio: "Jul", jul: "Jul",
    agosto: "Aug", ago: "Aug",
    septiembre: "Sep", setiembre: "Sep", sep: "Sep", set: "Sep",
    octubre: "Oct", oct: "Oct",
    noviembre: "Nov", nov: "Nov",
    diciembre: "Dec", dic: "Dec"
  };

  let texto = String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  Object.entries(meses).forEach(([origen, destino]) => {
    texto = texto.replace(new RegExp(`\\b${origen}\\b`, "gi"), destino);
  });

  return texto;
}

function parsearFecha(valor) {
  const texto = normalizarMeses(String(valor ?? "").trim());
  if (!texto) return null;

  const numero = Number(texto);
  if (Number.isFinite(numero) && numero > 20000 && numero < 80000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(excelEpoch.getTime() + numero * 86400000);
  }

  const formatos = [
    d3.timeParse("%Y %b %d %I:%M:%S %p"),
    d3.timeParse("%Y %b %d %H:%M:%S"),
    d3.timeParse("%Y-%m-%d %H:%M:%S"),
    d3.timeParse("%Y-%m-%d"),
    d3.timeParse("%d/%m/%Y"),
    d3.timeParse("%m/%d/%Y"),
    d3.timeParse("%d-%m-%Y"),
    d3.timeParse("%m-%d-%Y")
  ];

  for (const formato of formatos) {
    const fecha = formato(texto);
    if (fecha) return fecha;
  }

  const fallback = new Date(texto);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function limpiarDatos(data) {
  const columnas = data.columns ?? Object.keys(data[0] ?? {});

  const colFecha = detectarColumna(columnas, "fecha");
  const colBarrio = detectarColumna(columnas, "barrio");
  const colVehiculos = detectarColumna(columnas, "vehicul");
  const colHeridos = detectarColumna(columnas, "herid");
  const colDireccion = detectarColumna(columnas, "direccion");

  return data.map(d => {
    const fecha = colFecha ? parsearFecha(d[colFecha]) : null;
    const barrio = colBarrio ? textoSeguro(d[colBarrio]).toUpperCase() : "NO REGISTRA";
    const heridos = colHeridos ? numeroSeguro(d[colHeridos]) : 0;

    return {
      fecha,
      anio: fecha ? fecha.getFullYear() : null,
      mes: fecha ? fecha.getMonth() + 1 : null,
      barrio,
      vehiculos: colVehiculos ? numeroSeguro(d[colVehiculos]) : 0,
      heridos,
      gravedad: heridos > 0 ? "Con heridos" : "Sin heridos",
      direccion: colDireccion ? textoSeguro(d[colDireccion]) : "NO REGISTRA"
    };
  });
}

function limpiarGrafico(id) {
  d3.select(id).selectAll("*").remove();
}

function mostrarVacio(id, mensaje = "No hay datos para mostrar con los filtros actuales.") {
  limpiarGrafico(id);
  d3.select(id)
    .append("div")
    .attr("class", "empty-chart")
    .text(mensaje);
}

function crearSVG(id, opciones = {}) {
  limpiarGrafico(id);

  const ancho = opciones.ancho ?? 960;
  const alto = opciones.alto ?? 430;
  const margen = opciones.margen ?? { top: 28, right: 32, bottom: 64, left: 72 };

  const svg = d3.select(id)
    .append("svg")
    .attr("viewBox", `0 0 ${ancho} ${alto}`)
    .attr("role", "img");

  const defs = svg.append("defs");
  const grupo = svg.append("g")
    .attr("transform", `translate(${margen.left},${margen.top})`);

  return {
    svg,
    defs,
    grupo,
    ancho,
    alto,
    anchoInterno: ancho - margen.left - margen.right,
    altoInterno: alto - margen.top - margen.bottom,
    margen
  };
}

function agregarGridY(grupo, y, anchoInterno, ticks = 5) {
  grupo.append("g")
    .attr("class", "grid")
    .call(
      d3.axisLeft(y)
        .ticks(ticks)
        .tickSize(-anchoInterno)
        .tickFormat("")
    );
}

function agregarTituloEjeX(grupo, texto, anchoInterno, altoInterno) {
  grupo.append("text")
    .attr("class", "axis-title")
    .attr("x", anchoInterno / 2)
    .attr("y", altoInterno + 48)
    .attr("text-anchor", "middle")
    .text(texto);
}

function agregarTituloEjeY(grupo, texto, altoInterno) {
  grupo.append("text")
    .attr("class", "axis-title")
    .attr("transform", "rotate(-90)")
    .attr("x", -altoInterno / 2)
    .attr("y", -54)
    .attr("text-anchor", "middle")
    .text(texto);
}

function recortarTexto(texto, largo = 24) {
  return texto.length > largo ? `${texto.slice(0, largo - 1)}...` : texto;
}

function mostrarTooltip(event, contenido) {
  tooltip
    .style("opacity", 1)
    .html(contenido)
    .style("left", `${event.pageX + 14}px`)
    .style("top", `${event.pageY - 24}px`);
}

function ocultarTooltip() {
  tooltip.style("opacity", 0);
}

function contarPorBarrio(data) {
  return Array.from(
    d3.rollup(data, v => v.length, d => d.barrio),
    ([barrio, cantidad]) => ({ barrio, cantidad })
  ).sort((a, b) => d3.descending(a.cantidad, b.cantidad));
}

function obtenerDatosTop(data, topN) {
  if (!data.length) return [];
  const barriosTop = new Set(contarPorBarrio(data).slice(0, topN).map(d => d.barrio));
  return data.filter(d => barriosTop.has(d.barrio));
}

function leerFechaInput(id, finDelDia = false) {
  const valor = document.getElementById(id).value;
  if (!valor) return null;
  const fecha = new Date(`${valor}T00:00:00`);
  if (finDelDia) fecha.setHours(23, 59, 59, 999);
  return fecha;
}

function filtrarBase(dataOriginal) {
  const barrioSeleccionado = document.getElementById("filtroBarrio").value;
  const fechaInicio = leerFechaInput("fechaInicio");
  const fechaFin = leerFechaInput("fechaFin", true);

  return dataOriginal.filter(d => {
    const pasaBarrio = barrioSeleccionado === "todos" || d.barrio === barrioSeleccionado;
    const pasaInicio = !fechaInicio || (d.fecha && d.fecha >= fechaInicio);
    const pasaFin = !fechaFin || (d.fecha && d.fecha <= fechaFin);
    return pasaBarrio && pasaInicio && pasaFin;
  });
}

function actualizarControlTop(dataBase) {
  const input = document.getElementById("topBarrios");
  const output = document.getElementById("valorTop");
  const maxBarrios = Math.max(1, new Set(dataBase.map(d => d.barrio)).size);

  input.max = String(maxBarrios);
  if (+input.value > maxBarrios) input.value = String(maxBarrios);
  if (+input.value < 1) input.value = "1";

  output.textContent = input.value;
  return +input.value;
}

function actualizarMetricas(data) {
  document.getElementById("totalAccidentes").textContent = formatoNumero.format(data.length);
  document.getElementById("totalBarrios").textContent = formatoNumero.format(new Set(data.map(d => d.barrio)).size);
  document.getElementById("totalHeridos").textContent = formatoNumero.format(d3.sum(data, d => d.heridos));
  document.getElementById("totalVehiculos").textContent = formatoNumero.format(d3.sum(data, d => d.vehiculos));
}

function actualizarEstadoFiltros(dataBase, dataAnalisis, topN) {
  const barriosBase = new Set(dataBase.map(d => d.barrio)).size;
  document.getElementById("estadoFiltros").textContent =
    `Top ${topN} de ${barriosBase} barrios | ${formatoNumero.format(dataAnalisis.length)} registros`;
}

function agregarLeyenda(grupo, items, x, y) {
  const leyenda = grupo.append("g")
    .attr("class", "legend")
    .attr("transform", `translate(${x},${y})`);

  const item = leyenda.selectAll("g")
    .data(items)
    .enter()
    .append("g")
    .attr("transform", (d, i) => `translate(${i * 150},0)`);

  item.append("circle")
    .attr("r", 5)
    .attr("fill", d => d.color);

  item.append("text")
    .attr("x", 12)
    .attr("y", 4)
    .text(d => d.label);
}

function graficoBarras(data, topN) {
  if (!data.length) {
    mostrarVacio("#graficoBarras");
    return;
  }

  const conteo = contarPorBarrio(data).slice(0, topN);
  const alto = Math.max(380, conteo.length * 38 + 112);
  const { grupo, anchoInterno, altoInterno } = crearSVG("#graficoBarras", {
    ancho: 1040,
    alto,
    margen: { top: 28, right: 104, bottom: 58, left: 226 }
  });

  const maximo = d3.max(conteo, d => d.cantidad) || 1;
  const x = d3.scaleLinear()
    .domain([0, maximo * 1.16])
    .nice()
    .range([0, anchoInterno]);

  const y = d3.scaleBand()
    .domain(conteo.map(d => d.barrio))
    .range([0, altoInterno])
    .padding(0.28);

  const color = d3.scaleSequential()
    .domain([0, maximo])
    .interpolator(d3.interpolateRgbBasis(["#bfdbfe", colores.primary, colores.amber]));

  agregarGridY(grupo, y, anchoInterno, 0);

  grupo.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(y).tickFormat(d => recortarTexto(d, 28)).tickSize(0))
    .selectAll("text")
    .attr("title", d => d);

  grupo.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${altoInterno})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat(d => formatoNumero.format(d)));

  grupo.selectAll("rect")
    .data(conteo)
    .enter()
    .append("rect")
    .attr("x", 0)
    .attr("y", d => y(d.barrio))
    .attr("rx", 4)
    .attr("height", y.bandwidth())
    .attr("width", d => x(d.cantidad))
    .attr("fill", d => color(d.cantidad))
    .on("mousemove", (event, d) => mostrarTooltip(event, `<strong>${d.barrio}</strong><br>Accidentes: ${formatoNumero.format(d.cantidad)}`))
    .on("mouseout", ocultarTooltip);

  grupo.selectAll(".etiqueta")
    .data(conteo)
    .enter()
    .append("text")
    .attr("class", "etiqueta")
    .attr("x", d => x(d.cantidad) + 8)
    .attr("y", d => y(d.barrio) + y.bandwidth() / 2 + 4)
    .attr("fill", colores.text)
    .attr("font-size", 12)
    .attr("font-weight", 800)
    .text(d => formatoNumero.format(d.cantidad));

  agregarTituloEjeX(grupo, "Cantidad de accidentes", anchoInterno, altoInterno);
}

function graficoLinea(data) {
  const datosFecha = data.filter(d => d.fecha);
  if (!datosFecha.length) {
    mostrarVacio("#graficoLinea", "No hay fechas validas para graficar.");
    return;
  }

  const conteo = Array.from(
    d3.rollup(datosFecha, v => v.length, d => d3.timeMonth(d.fecha)),
    ([fecha, cantidad]) => ({ fecha, cantidad })
  ).sort((a, b) => d3.ascending(a.fecha, b.fecha));

  const { defs, grupo, anchoInterno, altoInterno } = crearSVG("#graficoLinea", {
    ancho: 1040,
    alto: 430,
    margen: { top: 26, right: 36, bottom: 64, left: 76 }
  });

  let dominioX = d3.extent(conteo, d => d.fecha);
  if (+dominioX[0] === +dominioX[1]) {
    dominioX = [d3.timeMonth.offset(dominioX[0], -1), d3.timeMonth.offset(dominioX[1], 1)];
  }

  const maximo = d3.max(conteo, d => d.cantidad) || 1;
  const x = d3.scaleTime().domain(dominioX).range([0, anchoInterno]);
  const y = d3.scaleLinear().domain([0, maximo * 1.18]).nice().range([altoInterno, 0]);

  defs.append("linearGradient")
    .attr("id", "lineaArea")
    .attr("x1", "0%")
    .attr("x2", "0%")
    .attr("y1", "0%")
    .attr("y2", "100%")
    .selectAll("stop")
    .data([
      { offset: "0%", color: "rgba(29, 78, 216, 0.25)" },
      { offset: "100%", color: "rgba(29, 78, 216, 0)" }
    ])
    .enter()
    .append("stop")
    .attr("offset", d => d.offset)
    .attr("stop-color", d => d.color);

  agregarGridY(grupo, y, anchoInterno);

  grupo.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${altoInterno})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat(formatoMes));

  grupo.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(y).ticks(6).tickFormat(d => formatoNumero.format(d)));

  const area = d3.area()
    .x(d => x(d.fecha))
    .y0(altoInterno)
    .y1(d => y(d.cantidad))
    .curve(d3.curveMonotoneX);

  const linea = d3.line()
    .x(d => x(d.fecha))
    .y(d => y(d.cantidad))
    .curve(d3.curveMonotoneX);

  grupo.append("path")
    .datum(conteo)
    .attr("fill", "url(#lineaArea)")
    .attr("d", area);

  grupo.append("path")
    .datum(conteo)
    .attr("fill", "none")
    .attr("stroke", colores.primary)
    .attr("stroke-width", 3.5)
    .attr("d", linea);

  grupo.selectAll("circle")
    .data(conteo)
    .enter()
    .append("circle")
    .attr("cx", d => x(d.fecha))
    .attr("cy", d => y(d.cantidad))
    .attr("r", 5)
    .attr("fill", colores.amber)
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 2)
    .on("mousemove", (event, d) => mostrarTooltip(event, `<strong>${formatoMes(d.fecha)}</strong><br>Accidentes: ${formatoNumero.format(d.cantidad)}`))
    .on("mouseout", ocultarTooltip);

  agregarTituloEjeX(grupo, "Mes", anchoInterno, altoInterno);
  agregarTituloEjeY(grupo, "Accidentes", altoInterno);
}

function graficoHistograma(data) {
  if (!data.length) {
    mostrarVacio("#graficoHistograma");
    return;
  }

  const valores = data.map(d => d.heridos);
  const maximo = Math.max(1, d3.max(valores) || 0);
  const { grupo, anchoInterno, altoInterno } = crearSVG("#graficoHistograma", {
    ancho: 620,
    alto: 390,
    margen: { top: 24, right: 24, bottom: 60, left: 64 }
  });

  const x = d3.scaleLinear().domain([0, maximo]).nice().range([0, anchoInterno]);
  const bins = d3.bin()
    .domain(x.domain())
    .thresholds(Math.min(10, Math.max(4, maximo + 1)))(valores);

  const y = d3.scaleLinear()
    .domain([0, d3.max(bins, d => d.length) || 1])
    .nice()
    .range([altoInterno, 0]);

  agregarGridY(grupo, y, anchoInterno);

  grupo.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${altoInterno})`)
    .call(d3.axisBottom(x).ticks(5));

  grupo.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(y).ticks(5).tickFormat(d => formatoNumero.format(d)));

  grupo.selectAll("rect")
    .data(bins)
    .enter()
    .append("rect")
    .attr("x", d => x(d.x0) + 2)
    .attr("y", d => y(d.length))
    .attr("rx", 4)
    .attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - 4))
    .attr("height", d => altoInterno - y(d.length))
    .attr("fill", d => d.x0 > 0 ? colores.red : colores.teal)
    .attr("opacity", 0.9)
    .on("mousemove", (event, d) => {
      const rango = `${Math.round(d.x0)} - ${Math.round(d.x1)}`;
      mostrarTooltip(event, `<strong>Rango: ${rango}</strong><br>Frecuencia: ${formatoNumero.format(d.length)}`);
    })
    .on("mouseout", ocultarTooltip);

  agregarTituloEjeX(grupo, "Numero de heridos", anchoInterno, altoInterno);
  agregarTituloEjeY(grupo, "Frecuencia", altoInterno);
}

function graficoDispersion(data) {
  if (!data.length) {
    mostrarVacio("#graficoDispersion");
    return;
  }

  const { grupo, anchoInterno, altoInterno } = crearSVG("#graficoDispersion", {
    ancho: 1040,
    alto: 450,
    margen: { top: 24, right: 36, bottom: 76, left: 74 }
  });

  const maxVehiculos = Math.max(1, d3.max(data, d => d.vehiculos) || 0);
  const maxHeridos = Math.max(1, d3.max(data, d => d.heridos) || 0);

  const x = d3.scaleLinear().domain([0, maxVehiculos * 1.08]).nice().range([0, anchoInterno]);
  const y = d3.scaleLinear().domain([0, maxHeridos * 1.15]).nice().range([altoInterno, 0]);
  const radio = d3.scaleSqrt().domain([0, maxHeridos]).range([4, 18]);
  const barrios = Array.from(new Set(data.map(d => d.barrio)));
  const usarBarrio = barrios.length <= 12;

  const color = usarBarrio
    ? d3.scaleOrdinal().domain(barrios).range(paletaBarrios)
    : d3.scaleOrdinal().domain(["Sin heridos", "Con heridos"]).range([colores.teal, colores.red]);

  agregarGridY(grupo, y, anchoInterno);

  grupo.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${altoInterno})`)
    .call(d3.axisBottom(x).ticks(6));

  grupo.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(y).ticks(6));

  grupo.selectAll("circle")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx", d => x(d.vehiculos))
    .attr("cy", d => y(d.heridos))
    .attr("r", d => radio(d.heridos))
    .attr("fill", d => usarBarrio ? color(d.barrio) : color(d.gravedad))
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 1)
    .attr("opacity", 0.72)
    .on("mousemove", (event, d) => {
      mostrarTooltip(
        event,
        `<strong>${d.barrio}</strong><br>Vehiculos: ${formatoNumero.format(d.vehiculos)}<br>Heridos: ${formatoNumero.format(d.heridos)}<br>Direccion: ${d.direccion}`
      );
    })
    .on("mouseout", ocultarTooltip);

  const items = usarBarrio
    ? barrios.slice(0, 6).map(barrio => ({ label: recortarTexto(barrio, 16), color: color(barrio) }))
    : [
        { label: "Sin heridos", color: color("Sin heridos") },
        { label: "Con heridos", color: color("Con heridos") }
      ];

  agregarLeyenda(grupo, items, 0, altoInterno + 54);
  agregarTituloEjeX(grupo, "Vehiculos involucrados", anchoInterno, altoInterno);
  agregarTituloEjeY(grupo, "Personas heridas", altoInterno);
}

function graficoDona(data) {
  if (!data.length) {
    mostrarVacio("#graficoDona");
    return;
  }

  limpiarGrafico("#graficoDona");

  const resumen = [
    { tipo: "Sin heridos", cantidad: data.filter(d => d.heridos === 0).length, color: colores.teal },
    { tipo: "Con heridos", cantidad: data.filter(d => d.heridos > 0).length, color: colores.red }
  ];

  const total = d3.sum(resumen, d => d.cantidad);
  const ancho = 620;
  const alto = 390;
  const radio = Math.min(ancho, alto) / 2 - 58;

  const svg = d3.select("#graficoDona")
    .append("svg")
    .attr("viewBox", `0 0 ${ancho} ${alto}`);

  const grupo = svg.append("g")
    .attr("transform", `translate(${ancho * 0.43},${alto / 2})`);

  const pie = d3.pie()
    .sort(null)
    .value(d => d.cantidad);

  const arc = d3.arc()
    .innerRadius(radio * 0.62)
    .outerRadius(radio);

  grupo.selectAll("path")
    .data(pie(resumen))
    .enter()
    .append("path")
    .attr("d", arc)
    .attr("fill", d => d.data.color)
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 4)
    .on("mousemove", (event, d) => {
      const porcentaje = total ? (d.data.cantidad / total * 100).toFixed(1) : "0.0";
      mostrarTooltip(event, `<strong>${d.data.tipo}</strong><br>Accidentes: ${formatoNumero.format(d.data.cantidad)}<br>Participacion: ${porcentaje}%`);
    })
    .on("mouseout", ocultarTooltip);

  grupo.append("text")
    .attr("text-anchor", "middle")
    .attr("y", -4)
    .attr("fill", colores.text)
    .attr("font-size", 30)
    .attr("font-weight", 900)
    .text(formatoNumero.format(total));

  grupo.append("text")
    .attr("text-anchor", "middle")
    .attr("y", 22)
    .attr("fill", colores.muted)
    .attr("font-size", 13)
    .attr("font-weight", 700)
    .text("accidentes");

  const leyenda = svg.append("g")
    .attr("class", "legend")
    .attr("transform", `translate(${ancho * 0.72},${alto / 2 - 38})`);

  const item = leyenda.selectAll("g")
    .data(resumen)
    .enter()
    .append("g")
    .attr("transform", (d, i) => `translate(0,${i * 38})`);

  item.append("rect")
    .attr("width", 13)
    .attr("height", 13)
    .attr("rx", 3)
    .attr("fill", d => d.color);

  item.append("text")
    .attr("x", 22)
    .attr("y", 11)
    .text(d => `${d.tipo}: ${formatoNumero.format(d.cantidad)}`);
}

function calcularBoxPlot(valores) {
  const ordenados = valores.slice().sort(d3.ascending);
  const q1 = d3.quantile(ordenados, 0.25) ?? 0;
  const mediana = d3.quantile(ordenados, 0.5) ?? 0;
  const q3 = d3.quantile(ordenados, 0.75) ?? 0;
  const iqr = q3 - q1;
  const limiteInf = q1 - 1.5 * iqr;
  const limiteSup = q3 + 1.5 * iqr;
  const dentro = ordenados.filter(v => v >= limiteInf && v <= limiteSup);

  return {
    min: d3.min(dentro) ?? d3.min(ordenados) ?? 0,
    q1,
    mediana,
    q3,
    max: d3.max(dentro) ?? d3.max(ordenados) ?? 0,
    media: d3.mean(ordenados) ?? 0,
    outliers: ordenados.filter(v => v < limiteInf || v > limiteSup),
    total: ordenados.length
  };
}

function graficoCaja(data, topN) {
  if (!data.length) {
    mostrarVacio("#graficoCaja");
    return;
  }

  const barriosTop = contarPorBarrio(data).slice(0, topN).map(d => d.barrio);
  const resumen = barriosTop.map(barrio => {
    const valores = data.filter(d => d.barrio === barrio).map(d => d.heridos);
    return { barrio, ...calcularBoxPlot(valores) };
  });

  const { grupo, anchoInterno, altoInterno } = crearSVG("#graficoCaja", {
    ancho: 1040,
    alto: 470,
    margen: { top: 24, right: 32, bottom: 132, left: 74 }
  });

  const maximo = Math.max(1, d3.max(resumen, d => Math.max(d.max, ...d.outliers)) || 0);
  const x = d3.scaleBand().domain(barriosTop).range([0, anchoInterno]).padding(0.36);
  const y = d3.scaleLinear().domain([0, maximo * 1.18]).nice().range([altoInterno, 0]);
  const color = d3.scaleOrdinal().domain(barriosTop).range(paletaBarrios);

  agregarGridY(grupo, y, anchoInterno);

  grupo.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${altoInterno})`)
    .call(d3.axisBottom(x).tickFormat(d => recortarTexto(d, 14)))
    .selectAll("text")
    .attr("transform", "rotate(-35)")
    .attr("text-anchor", "end")
    .attr("dx", "-0.5em")
    .attr("dy", "0.2em");

  grupo.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(y).ticks(6));

  const box = grupo.selectAll(".box")
    .data(resumen)
    .enter()
    .append("g")
    .attr("class", "box")
    .attr("transform", d => `translate(${x(d.barrio) + x.bandwidth() / 2},0)`);

  box.append("line")
    .attr("y1", d => y(d.min))
    .attr("y2", d => y(d.max))
    .attr("stroke", "#475569")
    .attr("stroke-width", 1.5);

  box.append("line")
    .attr("x1", -x.bandwidth() * 0.25)
    .attr("x2", x.bandwidth() * 0.25)
    .attr("y1", d => y(d.min))
    .attr("y2", d => y(d.min))
    .attr("stroke", "#475569")
    .attr("stroke-width", 1.5);

  box.append("line")
    .attr("x1", -x.bandwidth() * 0.25)
    .attr("x2", x.bandwidth() * 0.25)
    .attr("y1", d => y(d.max))
    .attr("y2", d => y(d.max))
    .attr("stroke", "#475569")
    .attr("stroke-width", 1.5);

  box.append("rect")
    .attr("x", -x.bandwidth() * 0.36)
    .attr("y", d => y(d.q3))
    .attr("width", x.bandwidth() * 0.72)
    .attr("height", d => Math.max(2, y(d.q1) - y(d.q3)))
    .attr("rx", 4)
    .attr("fill", d => color(d.barrio))
    .attr("opacity", 0.78)
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 1);

  box.append("line")
    .attr("x1", -x.bandwidth() * 0.36)
    .attr("x2", x.bandwidth() * 0.36)
    .attr("y1", d => y(d.mediana))
    .attr("y2", d => y(d.mediana))
    .attr("stroke", "#111827")
    .attr("stroke-width", 2.4);

  box.append("circle")
    .attr("cy", d => y(d.media))
    .attr("r", 4.5)
    .attr("fill", colores.amber)
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 1.5);

  box.append("rect")
    .attr("x", -x.bandwidth() / 2)
    .attr("y", 0)
    .attr("width", x.bandwidth())
    .attr("height", altoInterno)
    .attr("fill", "transparent")
    .on("mousemove", (event, d) => {
      mostrarTooltip(
        event,
        `<strong>${d.barrio}</strong><br>Registros: ${formatoNumero.format(d.total)}<br>Mediana: ${d.mediana.toFixed(1)}<br>Media: ${d.media.toFixed(1)}<br>Q1-Q3: ${d.q1.toFixed(1)} - ${d.q3.toFixed(1)}`
      );
    })
    .on("mouseout", ocultarTooltip);

  agregarTituloEjeY(grupo, "Numero de heridos", altoInterno);
}

function graficoCalor(data) {
  const datosValidos = data.filter(d => d.anio && d.mes);
  if (!datosValidos.length) {
    mostrarVacio("#graficoCalor", "No hay fechas validas para crear el mapa de calor.");
    return;
  }

  const conteo = d3.rollup(
    datosValidos,
    v => v.length,
    d => d.anio,
    d => d.mes
  );

  const anios = Array.from(new Set(datosValidos.map(d => d.anio))).sort(d3.ascending);
  const meses = d3.range(1, 13);
  const celdas = anios.flatMap(anio => meses.map(mes => ({
    anio,
    mes,
    cantidad: conteo.get(anio)?.get(mes) ?? 0
  })));

  const alto = Math.max(360, anios.length * 42 + 126);
  const { defs, grupo, anchoInterno, altoInterno } = crearSVG("#graficoCalor", {
    ancho: 1040,
    alto,
    margen: { top: 24, right: 96, bottom: 66, left: 76 }
  });

  const x = d3.scaleBand().domain(meses).range([0, anchoInterno]).padding(0.06);
  const y = d3.scaleBand().domain(anios).range([0, altoInterno]).padding(0.08);
  const maximo = d3.max(celdas, d => d.cantidad) || 1;
  const color = d3.scaleSequential()
    .domain([0, maximo])
    .interpolator(d3.interpolateRgbBasis(["#f8fafc", "#bfdbfe", "#f59e0b", "#dc2626"]));

  grupo.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${altoInterno})`)
    .call(d3.axisBottom(x).tickFormat(d => mesesCortos[d - 1]));

  grupo.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(y).tickFormat(d => String(d)));

  grupo.selectAll("rect")
    .data(celdas)
    .enter()
    .append("rect")
    .attr("x", d => x(d.mes))
    .attr("y", d => y(d.anio))
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth())
    .attr("rx", 4)
    .attr("fill", d => d.cantidad === 0 ? "#f8fafc" : color(d.cantidad))
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 1.2)
    .on("mousemove", (event, d) => mostrarTooltip(event, `<strong>${d.anio} - ${mesesCortos[d.mes - 1]}</strong><br>Accidentes: ${formatoNumero.format(d.cantidad)}`))
    .on("mouseout", ocultarTooltip);

  grupo.selectAll("text.valor")
    .data(celdas)
    .enter()
    .append("text")
    .attr("class", "valor")
    .attr("x", d => x(d.mes) + x.bandwidth() / 2)
    .attr("y", d => y(d.anio) + y.bandwidth() / 2 + 4)
    .attr("text-anchor", "middle")
    .attr("fill", d => d.cantidad / maximo > 0.62 ? "#ffffff" : "#334155")
    .attr("font-size", 11)
    .attr("font-weight", 800)
    .text(d => d.cantidad > 0 ? formatoNumero.format(d.cantidad) : "");

  const gradiente = defs.append("linearGradient")
    .attr("id", "gradienteCalor")
    .attr("x1", "0%")
    .attr("x2", "0%")
    .attr("y1", "100%")
    .attr("y2", "0%");

  [
    { offset: "0%", color: "#f8fafc" },
    { offset: "35%", color: "#bfdbfe" },
    { offset: "70%", color: "#f59e0b" },
    { offset: "100%", color: "#dc2626" }
  ].forEach(stop => {
    gradiente.append("stop")
      .attr("offset", stop.offset)
      .attr("stop-color", stop.color);
  });

  const leyendaX = anchoInterno + 32;
  grupo.append("rect")
    .attr("x", leyendaX)
    .attr("y", 8)
    .attr("width", 14)
    .attr("height", altoInterno - 18)
    .attr("rx", 4)
    .attr("fill", "url(#gradienteCalor)");

  const escalaLeyenda = d3.scaleLinear().domain([0, maximo]).range([altoInterno - 10, 8]);
  grupo.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${leyendaX + 18},0)`)
    .call(d3.axisRight(escalaLeyenda).ticks(5).tickFormat(d => formatoNumero.format(d)));

  agregarTituloEjeX(grupo, "Mes", anchoInterno, altoInterno);
  agregarTituloEjeY(grupo, "Anio", altoInterno);
}

function mostrarHallazgos(data, topN) {
  const lista = d3.select("#listaHallazgos");
  lista.selectAll("*").remove();

  if (!data.length) {
    lista.append("li").text("No hay datos con los filtros seleccionados.");
    return;
  }

  const barrioMayor = contarPorBarrio(data)[0];
  const totalAccidentes = data.length;
  const totalHeridos = d3.sum(data, d => d.heridos);
  const totalVehiculos = d3.sum(data, d => d.vehiculos);
  const conHeridos = data.filter(d => d.heridos > 0).length;
  const porcentajeHeridos = totalAccidentes ? (conHeridos / totalAccidentes * 100).toFixed(1) : "0.0";

  const hallazgos = [
    `Se analizaron ${formatoNumero.format(totalAccidentes)} registros dentro del Top ${topN} aplicado.`,
    `El barrio con mayor accidentalidad es ${barrioMayor.barrio}, con ${formatoNumero.format(barrioMayor.cantidad)} registros.`,
    `Se registran ${formatoNumero.format(totalHeridos)} personas heridas y ${formatoNumero.format(totalVehiculos)} vehiculos involucrados.`,
    `${porcentajeHeridos}% de los accidentes del conjunto actual reportan al menos una persona herida.`,
    `La linea temporal y el mapa de calor permiten ubicar periodos de mayor concentracion.`
  ];

  lista.selectAll("li")
    .data(hallazgos)
    .enter()
    .append("li")
    .text(d => d);
}

function actualizarDashboard(dataOriginal) {
  const dataBase = filtrarBase(dataOriginal);
  const topN = actualizarControlTop(dataBase);
  const dataAnalisis = obtenerDatosTop(dataBase, topN);

  actualizarMetricas(dataAnalisis);
  actualizarEstadoFiltros(dataBase, dataAnalisis, topN);

  graficoBarras(dataBase, topN);
  graficoLinea(dataAnalisis);
  graficoHistograma(dataAnalisis);
  graficoDona(dataAnalisis);
  graficoDispersion(dataAnalisis);
  graficoCaja(dataAnalisis, topN);
  graficoCalor(dataAnalisis);
  mostrarHallazgos(dataAnalisis, topN);
}

function configurarFechas(datos) {
  const fechas = datos.map(d => d.fecha).filter(Boolean).sort(d3.ascending);
  if (!fechas.length) return;

  fechasDisponibles = {
    min: fechas[0],
    max: fechas[fechas.length - 1]
  };

  const inicio = document.getElementById("fechaInicio");
  const fin = document.getElementById("fechaFin");

  inicio.min = formatoFechaInput(fechasDisponibles.min);
  inicio.max = formatoFechaInput(fechasDisponibles.max);
  inicio.value = formatoFechaInput(fechasDisponibles.min);

  fin.min = formatoFechaInput(fechasDisponibles.min);
  fin.max = formatoFechaInput(fechasDisponibles.max);
  fin.value = formatoFechaInput(fechasDisponibles.max);
}

function cargarBarrios(datos) {
  const barrios = Array.from(new Set(datos.map(d => d.barrio))).sort();
  const select = d3.select("#filtroBarrio");

  select.selectAll("option.barrio")
    .data(barrios)
    .enter()
    .append("option")
    .attr("class", "barrio")
    .attr("value", d => d)
    .text(d => d);
}

function restablecerFiltros(datos) {
  document.getElementById("filtroBarrio").value = "todos";

  if (fechasDisponibles.min && fechasDisponibles.max) {
    document.getElementById("fechaInicio").value = formatoFechaInput(fechasDisponibles.min);
    document.getElementById("fechaFin").value = formatoFechaInput(fechasDisponibles.max);
  }

  document.getElementById("topBarrios").value = String(Math.min(10, new Set(datos.map(d => d.barrio)).size || 1));
  actualizarDashboard(datos);
}

d3.csv(rutaCSV).then(data => {
  const datos = limpiarDatos(data);

  cargarBarrios(datos);
  configurarFechas(datos);
  actualizarDashboard(datos);

  d3.select("#topBarrios").on("input", () => actualizarDashboard(datos));
  d3.select("#filtroBarrio").on("change", () => actualizarDashboard(datos));
  d3.select("#fechaInicio").on("change", () => actualizarDashboard(datos));
  d3.select("#fechaFin").on("change", () => actualizarDashboard(datos));
  d3.select("#limpiarFiltros").on("click", () => restablecerFiltros(datos));
}).catch(error => {
  console.error("Error cargando el CSV:", error);
  document.getElementById("estadoFiltros").textContent = "Error cargando datos";
  d3.select("main")
    .append("section")
    .attr("class", "grafico grafico-ancho")
    .html("<h2>Error al cargar el dataset</h2><div class='empty-chart'>Verifica que el archivo CSV exista en data/Accidentes_Viales_20260426.csv y abre el proyecto desde un servidor local.</div>");
});
