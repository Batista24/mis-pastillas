/* Mis pastillas - recordatorio personal. Todo se guarda solo en este dispositivo. */
(function () {
  'use strict';
  const KEY = 'recordatorio.v1';
  const NOTE_KEY = 'recordatorio.avisos';
  const DOW = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MON = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const params = new URLSearchParams(location.search);

  /* ---------- fechas (todo en hora local, como texto AAAA-MM-DD) ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = (s) => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2], 12, 0, 0); };
  const add = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
  const diff = (a, b) => Math.round((parse(b) - parse(a)) / 86400000); // días de a a b
  function now() { // ?hoy=2026-11-10&hora=21:00 solo sirve para probar
    const h = params.get('hoy');
    if (h && /^\d{4}-\d{2}-\d{2}$/.test(h)) {
      const t = (params.get('hora') || '09:00').split(':').map(Number);
      const d = parse(h); d.setHours(t[0], t[1] || 0, 0, 0); return d;
    }
    return new Date();
  }
  const today = () => ymd(now());
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const longDate = (s) => { const d = parse(s); return DOW[d.getDay()] + ' ' + d.getDate() + ' de ' + MON[d.getMonth()]; };
  const shortDate = (s) => { const d = parse(s); return DOW[d.getDay()].slice(0, 3) + ' ' + d.getDate() + ' ' + MON[d.getMonth()].slice(0, 3); };
  const time12 = (t) => { const p = t.split(':').map(Number); return (p[0] % 12 || 12) + ':' + pad(p[1]) + ' ' + (p[0] >= 12 ? 'p. m.' : 'a. m.'); };
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const label = (t) => t.name + (t.mg ? ' ' + t.mg + ' mg' : '');
  const freq = (t) => {
    const n = Number(t.every);
    const f = n === 1 ? 'Todos los días' : n === 2 ? 'Un día sí y un día no' : n === 7 ? 'Una vez por semana' : 'Cada ' + n + ' días';
    const pd = timesOf(t).length;
    return f + (pd > 1 ? ' · ' + pd + ' veces al día' : '') + (t.course ? ' · ' + t.course * pd + ' veces en total' : '');
  };
  const timesOf = (t) => (Array.isArray(t.times) && t.times.length ? t.times : [t.time]);
  const dateOf = (k) => k.slice(0, 10);
  const slotOf = (k) => (k.length > 10 ? Number(k.slice(11)) - 1 : 0);
  const keyOf = (d, s) => (s ? d + '#' + (s + 1) : d);
  const timeOfKey = (t, k) => timesOf(t)[slotOf(k)] || t.time;
  const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b);

  /* ---------- datos ---------- */
  const PALETTE = ['#d9480f', '#2756c5', '#7b2cbf', '#0b7a75', '#b5179e', '#8a6d00'];
  function defaults() { return { v: 2, notify: false, treatments: [] }; }
  function migrate(st) { st.v = 2; return st; } // versión 1 -> 2: no se borra nada
  let state;
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const s = JSON.parse(raw); if (s && Array.isArray(s.treatments)) return migrate(s); }
    } catch (e) { /* sin almacenamiento: se usa la memoria */ }
    return defaults();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignorar */ } }
  state = load();
  const DRAFT = 'recordatorio.borrador';
  const getDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT)); } catch (e) { return null; } };
  const setDraft = (d) => { try { if (d) localStorage.setItem(DRAFT, JSON.stringify(d)); else localStorage.removeItem(DRAFT); } catch (e) { /* ignorar */ } };
  let tab = getDraft() ? 'nueva' : 'hoy';

  /* ---------- cálculo de dosis ---------- */
  function doseDates(t, from, to) {
    const out = [], n = Math.max(1, Math.floor(t.every) || 1);
    let k0 = 0;
    const d0 = diff(t.start, from);
    if (d0 > 0) k0 = Math.ceil(d0 / n);
    for (let k = k0; k < k0 + 2000; k++) {
      if (t.course && k >= t.course) break;
      const date = add(t.start, k * n);
      if (date > to) break;
      out.push(date);
    }
    return out;
  }
  function doseKeys(t, from, to) {
    const out = [], ts = timesOf(t);
    doseDates(t, from, to).forEach((d) => ts.forEach((_, s) => out.push(keyOf(d, s))));
    return out;
  }
  function info(t, td) {
    const takenN = Object.keys(t.taken).length;
    const left = Math.max(0, (Number(t.pills) || 0) - takenN);
    const pendFuture = doseKeys(t, td, add(td, 400)).filter((d) => !t.taken[d]);
    const overdue = doseKeys(t, add(td, -3), add(td, -1)).filter((d) => !t.taken[d]);
    const covered = pendFuture.slice(0, left);
    const isToday = doseDates(t, td, td).length > 0;
    let refill = null;
    if (t.noStock) refill = null;
    else if (t.course) { if (pendFuture.length > left) refill = { missing: pendFuture.length - left }; }
    else if (left <= 3 && !t.noStock) refill = { missing: null };
    return {
      takenN, left, pendFuture, overdue, covered,
      lastCovered: covered.length ? dateOf(covered[covered.length - 1]) : null,
      firstUncovered: pendFuture[left] ? dateOf(pendFuture[left]) : null,
      isToday, todayTaken: isToday && doseKeys(t, td, td).every((k) => !!t.taken[k]),
      next: pendFuture[0] ? dateOf(pendFuture[0]) : null,
      finished: !!t.course && pendFuture.length === 0 && overdue.length === 0 && !isToday,
      refill
    };
  }

  /* ---------- pantallas ---------- */
  function refillText(t, i) {
    if (!i.refill) return '';
    if (t.course) return 'Te faltan ' + plural(i.refill.missing, 'pastilla', 'pastillas') + ' para completar el tratamiento. Compra antes del ' + longDate(i.firstUncovered) + '.';
    if (i.left === 0) return 'Ya no te quedan pastillas. Compra más antes de tu próxima dosis' + (i.next ? ' (' + longDate(i.next) + ')' : '') + '.';
    return 'Te quedan solo ' + plural(i.left, 'pastilla', 'pastillas') + '. Compra más antes del ' + longDate(i.firstUncovered) + '.';
  }
  function card(t, td, nowD) {
    const i = info(t, td);
    let main = '', action = '';
    const dueAt = (tm) => { const p = tm.split(':').map(Number); const d = new Date(nowD); d.setHours(p[0], p[1], 0, 0); return d; };
    const multi = timesOf(t).length > 1;
    if (i.finished) {
      main = '<p class="state done">Tratamiento terminado. ¡Bien hecho!</p>';
    } else if (i.isToday) {
      doseKeys(t, td, td).forEach((k) => {
        const tm = timeOfKey(t, k), due = nowD >= dueAt(tm);
        if (t.taken[k]) {
          main += '<p class="state done">' + (multi ? 'Tomada <span>· ' + time12(tm) + '</span>' : 'Hoy ya la tomaste') + '</p>';
          action += '<button class="btn link" data-act="untake" data-id="' + t.id + '" data-date="' + k + '">Deshacer' + (multi ? ' (' + time12(tm) + ')' : '') + '</button>';
        } else {
          main += '<p class="state ' + (due ? 'now' : 'today') + '">' + (due ? 'Ya es hora de tu pastilla' : 'Hoy toca') + ' <span>· ' + time12(tm) + '</span></p>';
          action += '<button class="btn take" data-act="take" data-id="' + t.id + '" data-date="' + k + '">Ya la tomé' + (multi ? ' · ' + time12(tm) : '') + '</button>';
        }
      });
    } else {
      main = '<p class="state rest">Hoy no toca</p>';
    }
    const nextLine = (!i.finished && !(i.isToday && !i.todayTaken) && i.next)
      ? '<p class="meta">Próxima: <strong>' + longDate(i.next) + '</strong> · ' + timesOf(t).map(time12).join(' y ') + '</p>' : '';
    const tm = add(td, 1);
    const tomorrow = i.finished ? '' : '<p class="meta">Mañana: <strong>' + (doseDates(t, tm, tm).length ? 'sí toca' : 'no toca') + '</strong></p>';
    const over = i.overdue.map((d) =>
      '<div class="warn"><span>No marcaste la pastilla del <strong>' + longDate(dateOf(d)) + '</strong>' + (multi ? ' (' + time12(timeOfKey(t, d)) + ')' : '') + '.</span> <button class="btn small" data-act="take" data-id="' + t.id + '" data-date="' + d + '">La tomé ese día</button></div>'
    ).join('') + (i.overdue.length ? '<p class="fine">Si olvidaste una dosis, pregunta a tu médico o farmacéutico qué hacer.</p>' : '');
    let stock = t.noStock ? '<div class="stock"><b>—</b><span>sin conteo<br>de pastillas</span></div>' : '<div class="stock"><b>' + i.left + '</b><span>' + (i.left === 1 ? 'pastilla' : 'pastillas') + '<br>por tomar</span></div>';
    if (t.how) stock = '<div class="side">' + stock + '<p class="how">' + esc(t.how) + '</p></div>';
    let lasts = '';
    if (i.lastCovered && !i.finished && !t.noStock) lasts = '<p class="meta">Te alcanzan hasta el <strong>' + longDate(i.lastCovered) + '</strong>.</p>';
    const prog = t.course ? '<p class="meta">Dosis tomadas: <strong>' + i.takenN + ' de ' + t.course * timesOf(t).length + '</strong></p>' : '';
    const alert = i.refill && !i.finished ? '<div class="buy"><b>Comprar más</b><p>' + esc(refillText(t, i)) + '</p></div>' : '';
    return '<section class="card" style="--c:' + t.color + '"><div class="card-top"><div>' + (t.title ? '<p class="ttl">' + esc(t.title) + '</p>' : '') + '<h2>' + esc(label(t)) + '</h2><p class="meta">' + freq(t) + ' · <button class="btn link inline" data-act="edit" data-id="' + t.id + '">Editar nombre y mg</button></p>' + main + tomorrow + nextLine + lasts + prog + '</div>' + stock + '</div>' + action + over + alert + '</section>';
  }
  function viewHoy() {
    const n = now(), td = ymd(n);
    const notif = ('Notification' in window)
      ? (state.notify && Notification.permission === 'granted'
        ? '<p class="fine">Avisos en esta pantalla: activados (suenan solo si la app está abierta). Para alarmas seguras usa el calendario del celular, en Ajustes.</p>'
        : '<button class="btn ghost" data-act="notif">Activar avisos en esta pantalla</button>')
      : '';
    const empty = '<section class="card"><h2>Todavía no hay pastillas</h2><p>Toca el botón para agregar tu primera pastilla: su nombre, los miligramos y cada cuánto la tomas.</p><button class="btn primary" data-act="add">＋ Agregar pastilla</button></section>';
    return '<header class="head"><p class="kicker">Hoy es</p><h1>' + cap(longDate(td)) + '</h1></header>' +
      (state.treatments.length ? state.treatments.map((t) => card(t, td, n)).join('') + '<button class="btn ghost" data-act="add">＋ Agregar otra pastilla</button>' + notif : empty);
  }
  function viewCal() {
    const td = today();
    if (!state.treatments.length) return '<header class="head"><h1>Calendario</h1></header><section class="card"><p>Aquí verás los días que te toca cada pastilla. Primero agrega una en la pantalla <strong>Hoy</strong>.</p></section>';
    const infos = state.treatments.map((t) => ({ t: t, i: info(t, td) }));
    let rows = '';
    for (let k = -3; k <= 27; k++) {
      const d = add(td, k);
      const chips = infos.map((x) => doseKeys(x.t, d, d).map((key) => {
        const taken = !!x.t.taken[key];
        const noPill = !taken && k >= 0 && x.i.covered.indexOf(key) < 0;
        const can = k <= 0;
        const cls = 'chip' + (taken ? ' taken' : '') + (noPill ? ' nopill' : '') + (k < 0 && !taken ? ' missed' : '');
        const lab = esc(label(x.t)) + (timesOf(x.t).length > 1 ? ' · ' + time12(timeOfKey(x.t, key)) : '') + (taken ? ' · tomada' : noPill ? ' · sin pastilla' : k < 0 ? ' · sin marcar' : '');
        return '<button class="' + cls + '" style="--c:' + x.t.color + '"' + (can ? ' data-act="toggle" data-id="' + x.t.id + '" data-date="' + key + '"' : ' disabled') + '><i></i>' + lab + '</button>';
      }).join('')).join('');
      rows += '<div class="day' + (k === 0 ? ' is-today' : '') + (!chips ? ' empty' : '') + '"><div class="dl"><b>' + (k === 0 ? 'Hoy' : shortDate(d)) + '</b>' + (k === 0 ? '<span>' + shortDate(d) + '</span>' : '') + '</div><div class="dc">' + (chips || '<span class="rest">Sin pastilla</span>') + '</div></div>';
    }
    return '<header class="head"><h1>Calendario</h1><p class="fine">Toca una pastilla de hoy o de días pasados para marcarla como tomada.</p></header><div class="days">' + rows + '</div>';
  }
  function field(t, f, label, type, extra) {
    let v = t[f]; if (v === null || v === undefined) v = '';
    if (f === 'pills' && t.noStock) v = '';
    return '<label class="fld"><span>' + label + '</span><input type="' + type + '" data-f="' + f + '" data-id="' + t.id + '" value="' + esc(v) + '" ' + (extra || '') + '></label>';
  }
  const HOWS = [['','Sin indicar'],['En ayunas','En ayunas'],['Antes de comer','Antes de comer'],['Después de comer','Después de comer'],['Después del desayuno','Después del desayuno'],['Con la comida','Con la comida'],['Antes de dormir','Antes de dormir']];
  const howOpts = (cur) => HOWS.map((h) => '<option value="' + h[0] + '"' + (h[0] === (cur || '') ? ' selected' : '') + '>' + h[1] + '</option>').join('');
  const howList = () => '<datalist id="how-list">' + HOWS.filter((h) => h[0]).map((h) => '<option value="' + h[0] + '"></option>').join('') + '</datalist>';
  function viewNew() {
    return '<header class="head"><h1>Agregar pastilla</h1><p class="fine">Llena estos datos. Después los puedes cambiar en Ajustes.</p></header>' +
      '<form id="newform" class="card" novalidate>' +
      '<label class="fld"><span>Encabezado (opcional)</span><input name="title" type="text" maxlength="40" placeholder="Ejemplo: Tratamiento de la presión" autocomplete="off"></label>' +
      '<label class="fld"><span>Nombre de la pastilla (opcional)</span><input name="name" type="text" maxlength="40" placeholder="Ejemplo: Amoxicilina" autocomplete="off"></label>' +
      '<label class="fld"><span>Miligramos, mg (opcional)</span><input name="mg" type="text" inputmode="decimal" maxlength="10" placeholder="Ejemplo: 500" autocomplete="off"></label>' +
      '<label class="fld"><span>¿Cada cuánto la tomas?</span><select name="every"><option value="1">Todos los días</option><option value="2">Un día sí y un día no</option><option value="3">Cada 3 días</option><option value="7">Una vez por semana</option><option value="otro">Otra frecuencia…</option></select></label>' +
      '<label class="fld" id="otroWrap" hidden><span>Escribe cada cuántos días la tomas</span><input name="otro" type="number" min="1" max="30" inputmode="numeric"></label>' +
      '<label class="fld"><span>¿Cuántas pastillas tienes ahora? (opcional)</span><input name="pills" type="number" min="1" max="999" inputmode="numeric" placeholder="Ejemplo: 10"><small class="fine">Si lo dejas vacío, no llevo el conteo ni te aviso cuándo comprar.</small></label>' +
      '<label class="fld"><span>¿Cómo se toma? (opcional)</span><input name="how" type="text" maxlength="40" list="how-list" placeholder="Toca y elige, o escribe lo tuyo" autocomplete="off">' + howList() + '<small class="fine">Ejemplo: después del desayuno. Puedes elegir una opción o escribir lo que quieras.</small></label>' +
      '<label class="fld"><span>¿Cuánto dura el tratamiento? (opcional)</span><div class="two"><input name="dur" type="number" min="1" max="60" inputmode="numeric" placeholder="Ejemplo: 5"><select name="unit"><option value="30">meses</option><option value="7">semanas</option><option value="1">días</option></select></div><small class="fine">Si el doctor dijo "por 5 meses", escribe 5 y elige meses. Si no sabes, déjalo vacío.</small></label>' +
      '<label class="fld"><span>¿Qué día empiezas?</span><input name="start" type="date" value="' + today() + '"></label>' +
      '<label class="fld"><span>¿Cuántas veces al día la tomas?</span><select name="perday"><option value="1">1 vez al día</option><option value="2">2 veces al día</option><option value="3">3 veces al día</option></select></label>' +
      '<label class="fld"><span>¿A qué hora te aviso? (primera toma)</span><input name="time" type="time" value="09:00"></label>' +
      '<label class="fld" id="t2Wrap" hidden><span>Hora de la segunda toma</span><input name="time2" type="time" value="19:00"></label>' +
      '<label class="fld" id="t3Wrap" hidden><span>Hora de la tercera toma</span><input name="time3" type="time" value="14:00"></label>' +
      '<p class="error" id="formerr" role="alert"></p>' +
      '<button class="btn primary" type="submit">Guardar pastilla</button>' +
      '<button class="btn link" type="button" data-act="cancelNew">Cancelar</button></form>';
  }
  function viewSet() {
    const forms = state.treatments.map((t) => {
      const i = info(t, today());
      return '<section class="card set" id="set-' + t.id + '" style="--c:' + t.color + '">' + (t.title ? '<p class="ttl">' + esc(t.title) + '</p>' : '') + '<h2>' + esc(label(t)) + '</h2>' +
        field(t, 'title', 'Encabezado (opcional)', 'text', 'maxlength="40" placeholder="Ejemplo: Tratamiento de la presión"') +
        field(t, 'name', 'Nombre de la pastilla', 'text', 'maxlength="40" placeholder="Ejemplo: Amoxicilina"') +
        field(t, 'mg', 'Miligramos (mg)', 'text', 'inputmode="decimal" maxlength="10" placeholder="Ejemplo: 500"') +
        '<div class="two">' + field(t, 'every', 'Se toma cada (días)', 'number', 'min="1" max="30" inputmode="numeric"') + '<label class="fld"><span>Veces al día</span><select data-f="perday" data-id="' + t.id + '">' + [1, 2, 3].map((n) => '<option value="' + n + '"' + (timesOf(t).length === n ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label></div>' +
        timesOf(t).map((tm, ix) => '<label class="fld"><span>Hora de la toma' + (timesOf(t).length > 1 ? ' ' + (ix + 1) : '') + '</span><input type="time" data-f="tm' + ix + '" data-id="' + t.id + '" value="' + tm + '"></label>').join('') +
        field(t, 'start', 'Primer día del tratamiento', 'date') +
        field(t, 'course', 'Cuántos días te toca en total (vacío = sin final)', 'number', 'min="1" max="400" inputmode="numeric"') +
        '<label class="fld"><span>¿Cómo se toma? (opcional)</span><input type="text" maxlength="40" list="how-list" data-f="how" data-id="' + t.id + '" value="' + esc(t.how || '') + '" placeholder="Toca y elige, o escribe lo tuyo" autocomplete="off">' + howList() + '</label>' +
        field(t, 'pills', 'Pastillas compradas en total (vacío = no llevar conteo)', 'number', 'min="0" max="999" inputmode="numeric"') +
        '<p class="fine">' + (t.noStock ? 'No llevas el conteo de pastillas.' : 'Ahora te quedan <strong>' + i.left + '</strong>.') + '</p>' +
        '<div class="refill"><label class="fld"><span>Compré más pastillas</span><input id="add-' + t.id + '" type="number" min="1" max="999" value="10" inputmode="numeric"></label><button class="btn small" data-act="refill" data-id="' + t.id + '">Agregar</button></div>' +
        '<button class="btn link danger" data-act="reset" data-id="' + t.id + '">Borrar lo marcado y empezar de nuevo</button>' +
        '<button class="btn link danger" data-act="remove" data-id="' + t.id + '">Quitar esta pastilla</button></section>';
    }).join('');
    return '<header class="head"><h1>Ajustes</h1></header>' +
      '<section class="card"><h2>Alarmas en el calendario del celular</h2>' +
      '<p>Es la forma más segura de que suene: el calendario del celular avisa aunque esta app esté cerrada.</p>' +
      '<ol class="steps"><li>Toca el botón de abajo para bajar el archivo.</li><li>Ábrelo y elige tu calendario para importarlo.</li><li>Si cambias la hora o compras más pastillas, vuelve a bajarlo e impórtalo otra vez: se actualizan los mismos eventos.</li></ol>' +
      (state.treatments.length ? '<button class="btn primary" data-act="ics">Bajar calendario con alarmas</button>' : '<p class="fine">Primero agrega una pastilla en la pantalla Hoy.</p>') + '</section>' +
      forms +
      '<button class="btn ghost" data-act="add">＋ Agregar pastilla</button><div style="height:16px"></div>' +
      '<section class="card"><h2>Copia de seguridad</h2><p class="fine">Tus datos están solo en este dispositivo. Guarda una copia por si cambias de celular.</p><div class="row"><button class="btn" data-act="export">Guardar copia</button><label class="btn">Restaurar copia<input type="file" accept="application/json" data-act-change="import" hidden></label></div></section>';
  }
  function syncNew() {
    const f = document.getElementById('newform'); if (!f) return;
    const n = Number(f.elements.namedItem('perday').value) || 1;
    document.getElementById('t2Wrap').hidden = n < 2; document.getElementById('t3Wrap').hidden = n < 3;
  }
  function render() {
    const app = document.getElementById('app');
    app.innerHTML = tab === 'hoy' ? viewHoy() : tab === 'cal' ? viewCal() : tab === 'nueva' ? viewNew() : viewSet();
    if (tab === 'nueva') {
      const d = getDraft(), f = document.getElementById('newform');
      if (d && f) { Object.keys(d).forEach((k) => { const el = f.elements.namedItem(k); if (el) el.value = d[k]; });
        document.getElementById('otroWrap').hidden = f.elements.namedItem('every').value !== 'otro'; }
      syncNew();
    }
    const items = [['hoy', 'Hoy', '◉'], ['cal', 'Calendario', '▦'], ['set', 'Ajustes', '⚙']];
    document.getElementById('nav').innerHTML = items.map((x) =>
      '<button data-act="tab" data-tab="' + x[0] + '"' + (tab === x[0] ? ' aria-current="page" class="on"' : '') + '><span aria-hidden="true">' + x[2] + '</span>' + x[1] + '</button>').join('');
  }

  /* ---------- calendario .ics (alarmas del celular) ---------- */
  const icsText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  function stamp(date, hm, plusMin) {
    const p = hm.split(':').map(Number);
    const d = parse(date); d.setHours(p[0], p[1] + (plusMin || 0), 0, 0);
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
  }
  function buildICS() {
    const td = today();
    const utc = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mis pastillas//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Mis pastillas'];
    const ev = (uid, date, hm, mins, title, desc) => {
      L.push('BEGIN:VEVENT', 'UID:' + uid + '@mis-pastillas', 'DTSTAMP:' + utc,
        'DTSTART:' + stamp(date, hm), 'DTEND:' + stamp(date, hm, mins), 'SUMMARY:' + icsText(title), 'DESCRIPTION:' + icsText(desc),
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(title), 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
    };
    state.treatments.forEach((t) => {
      const i = info(t, td);
      (t.course ? i.pendFuture : t.noStock ? i.pendFuture.filter((d) => dateOf(d) <= add(td, 30)) : i.covered).forEach((d) => ev('dosis-' + t.id + '-' + d, dateOf(d), timeOfKey(t, d), 15, '💊 ' + label(t), 'Toma tu pastilla y márcala en la app Mis pastillas.'));
      if (i.firstUncovered && (!t.course || i.refill)) { // aviso de recompra 3 días antes de la primera dosis sin pastilla
        let rd = add(i.firstUncovered, -3); if (rd < td) rd = td;
        ev('compra-' + t.id + '-' + i.firstUncovered, rd, '09:00', 30, '🛒 Comprar pastillas: ' + label(t),
          'Tus pastillas alcanzan hasta antes del ' + longDate(i.firstUncovered) + '. Compra más y márcalo en la app.');
      }
    });
    L.push('END:VCALENDAR');
    return L.join('\r\n') + '\r\n';
  }
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type: type }));
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /* ---------- avisos mientras la app está abierta ---------- */
  let swReg = null;
  const noteLog = (() => { try { return JSON.parse(localStorage.getItem(NOTE_KEY)) || {}; } catch (e) { return {}; } })();
  function showNote(title, body, tag) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      if (swReg && swReg.showNotification) swReg.showNotification(title, { body: body, tag: tag, icon: 'icons/icon-192.png' });
      else new Notification(title, { body: body, tag: tag });
    } catch (e) { /* ignorar */ }
  }
  function checkDue() {
    if (!state.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
    const n = now(), td = ymd(n);
    state.treatments.forEach((t) => {
      doseKeys(t, td, td).forEach((dk) => {
        if (t.taken[dk]) return;
        const p = timeOfKey(t, dk).split(':').map(Number), due = new Date(n); due.setHours(p[0], p[1], 0, 0);
        const mins = (n - due) / 60000;
        const k = t.id + dk, c = noteLog[k] || 0;
        if (mins >= 0 && c < 3 && mins >= c * 30) {
          noteLog[k] = c + 1;
          try { localStorage.setItem(NOTE_KEY, JSON.stringify(noteLog)); } catch (e) { /* ignorar */ }
          showNote('💊 Hora de tu pastilla', label(t), k);
        }
      });
    });
  }

  /* ---------- acciones ---------- */
  const T = (id) => state.treatments.find((t) => t.id === id);
  const actions = {
    tab(el) { tab = el.dataset.tab; render(); window.scrollTo(0, 0); },
    add() { tab = 'nueva'; render(); window.scrollTo(0, 0); },
    cancelNew() { setDraft(null); tab = 'hoy'; render(); window.scrollTo(0, 0); },
    remove(el) {
      const t = T(el.dataset.id);
      if (!confirm('¿Quitar "' + label(t) + '" de la app? Se borra también lo que marcaste.')) return;
      state.treatments = state.treatments.filter((x) => x.id !== t.id); save(); tab = 'hoy'; render();
    },
    edit(el) {
      tab = 'set'; render();
      const sec = document.getElementById('set-' + el.dataset.id);
      if (sec) { sec.scrollIntoView(); const i = sec.querySelector('input[data-f=name]'); if (i) i.focus(); }
    },
    take(el) { T(el.dataset.id).taken[el.dataset.date] = Date.now(); save(); render(); },
    untake(el) { delete T(el.dataset.id).taken[el.dataset.date]; save(); render(); },
    toggle(el) { const t = T(el.dataset.id), d = el.dataset.date; if (t.taken[d]) delete t.taken[d]; else t.taken[d] = Date.now(); save(); render(); },
    refill(el) {
      const t = T(el.dataset.id), n = Math.floor(Number(document.getElementById('add-' + t.id).value));
      if (n > 0) { t.pills = (Number(t.pills) || 0) + n; save(); render(); }
    },
    reset(el) {
      const t = T(el.dataset.id);
      if (!confirm('¿Borrar las pastillas marcadas de "' + label(t) + '" y empezar de nuevo desde hoy?')) return;
      t.taken = {}; t.start = today(); save(); render();
    },
    ics() { download('mis-pastillas.ics', buildICS(), 'text/calendar'); },
    export() { download('mis-pastillas-copia.json', JSON.stringify(state, null, 2), 'application/json'); },
    notif() {
      if (!('Notification' in window)) return;
      Notification.requestPermission().then((p) => {
        state.notify = p === 'granted'; save(); render();
        if (state.notify) showNote('Avisos activados', 'Te avisaré aquí a la hora de tus pastillas mientras la app esté abierta.', 'test');
      });
    }
  };
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (el && actions[el.dataset.act] && !el.disabled) actions[el.dataset.act](el);
  });
  document.addEventListener('input', (e) => {
    if (e.target.form && e.target.form.id === 'newform') {
      const d = {}; Array.prototype.forEach.call(e.target.form.elements, (el) => { if (el.name) d[el.name] = el.value; }); setDraft(d);
    }
    const m = document.getElementById('formerr'); if (m && e.target.form && e.target.form.id === 'newform') m.textContent = ''; });
  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'newform') return;
    e.preventDefault();
    const f = e.target, g = (n) => f.elements.namedItem(n).value.trim();
    const err = (m) => { document.getElementById('formerr').textContent = m; };
    const name = g('name') || 'Pastilla ' + (state.treatments.length + 1);
    const every = g('every') === 'otro' ? Math.floor(Number(g('otro'))) : Number(g('every'));
    if (!(every >= 1 && every <= 30)) return err('Escribe cada cuántos días la tomas (de 1 a 30).');
    const noStock = g('pills') === '';
    const pills = noStock ? 999 : Math.floor(Number(g('pills'))); if (!(pills >= 1)) return err('Revisa cuántas pastillas tienes.');
    let course = null;
    if (g('dur') !== '') { const dur = Math.floor(Number(g('dur'))); if (!(dur >= 1)) return err('Revisa cuánto dura el tratamiento.');
      course = Math.max(1, Math.ceil(dur * Number(g('unit')) / every)); }
    const start = g('start'), time = g('time'), pd = Number(g('perday')) || 1;
    const times = [time, g('time2'), g('time3')].slice(0, pd);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return err('Escribe el día en que empiezas.');
    if (!times.every((x) => /^\d{2}:\d{2}$/.test(x))) return err('Escribe la hora de cada toma.');
    times.sort();
    state.treatments.push({ id: 't' + Date.now().toString(36), title: g('title'), how: g('how').slice(0, 40), name: name, mg: g('mg').replace(',', '.').replace(/[^0-9.]/g, '').slice(0, 10),
      color: PALETTE[state.treatments.length % PALETTE.length], every: every, start: start, time: times[0], times: times, pills: pills, noStock: noStock, course: course, taken: {} });
    save(); setDraft(null); tab = 'hoy'; render(); window.scrollTo(0, 0);
  });
  document.addEventListener('change', (e) => {
    if (e.target.name === 'perday' && e.target.form && e.target.form.id === 'newform') { syncNew(); return; }
    if (e.target.name === 'every' && e.target.form && e.target.form.id === 'newform') {
      document.getElementById('otroWrap').hidden = e.target.value !== 'otro'; return;
    }
    const el = e.target;
    if (el.dataset.actChange === 'import') {
      const f = el.files && el.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const s = JSON.parse(r.result);
          if (!s || !Array.isArray(s.treatments) || !s.treatments.every((t) => t && t.id && t.start && typeof t.taken === 'object')) throw new Error('formato');
          if (confirm('¿Reemplazar tus datos actuales con esta copia?')) { state = s; save(); render(); }
        } catch (err) { alert('Ese archivo no es una copia válida de esta app.'); }
      };
      r.readAsText(f); return;
    }
    if (!el.dataset.f) return;
    const t = T(el.dataset.id), f = el.dataset.f;
    let v = el.value;
    if (f === 'perday') {
      const n = Math.min(3, Math.max(1, Number(v) || 1)), cur = timesOf(t).slice(), defs = ['09:00', '19:00', '14:00'];
      while (cur.length < n) cur.push(defs.find((x) => cur.indexOf(x) < 0) || '12:00');
      cur.length = n; cur.sort(); t.times = cur; t.time = cur[0]; save(); render(); return;
    }
    if (/^tm\d$/.test(f)) {
      if (!/^\d{2}:\d{2}$/.test(v)) return;
      const cur = timesOf(t).slice(); cur[Number(f.slice(2))] = v; cur.sort(); t.times = cur; t.time = cur[0]; save(); render(); return;
    }
    if (f === 'every') { v = Math.min(30, Math.max(1, Math.floor(Number(v)) || 1)); }
    else if (f === 'pills') { if (v === '') { t.noStock = true; v = 999; } else { t.noStock = false; v = Math.max(0, Math.floor(Number(v)) || 0); } }
    else if (f === 'course') { v = v === '' ? null : Math.max(1, Math.floor(Number(v)) || 1); }
    else if (f === 'start' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { return; }
    else if (f === 'time' && !/^\d{2}:\d{2}$/.test(v)) { return; }
    else if (f === 'how') { v = v.trim().slice(0, 40); }
    else if (f === 'title') { v = v.trim().slice(0, 40); }
    else if (f === 'name') { v = v.trim() || t.name; }
    else if (f === 'mg') { v = v.trim().replace(',', '.').replace(/[^0-9.]/g, '').slice(0, 10); }
    t[f] = v; save(); render();
  });

  /* ---------- inicio ---------- */
  render();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').then((r) => { swReg = r; }).catch(() => {});
  }
  setInterval(() => {
    checkDue();
    const a = document.activeElement;
    if (tab === 'hoy' && !(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) render();
  }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkDue(); if (tab !== 'set') render(); } });
  checkDue();
  window.__pastillas = { info: info, state: () => state, buildICS: buildICS, doseDates: doseDates };
})();
