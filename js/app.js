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
  const freq = (t) => (Number(t.every) === 1 ? 'Una pastilla cada día' : 'Una pastilla cada ' + t.every + ' días') + (t.course ? ' · ' + t.course + ' dosis' : '');
  const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b);

  /* ---------- datos ---------- */
  function defaults() {
    const td = today();
    return {
      v: 1, notify: false, tab: 'hoy',
      treatments: [
        { id: 'a', name: 'Pastilla 1', mg: '', color: '#d9480f', every: 2, start: td, time: '20:00', pills: 10, course: null, taken: {} },
        { id: 'b', name: 'Pastilla 2', mg: '', color: '#2756c5', every: 1, start: td, time: '20:00', pills: 10, course: 10, taken: {} }
      ]
    };
  }
  let state;
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const s = JSON.parse(raw); if (s && Array.isArray(s.treatments)) return s; }
    } catch (e) { /* sin almacenamiento: se usa la memoria */ }
    return defaults();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignorar */ } }
  state = load();
  let tab = 'hoy';

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
  function info(t, td) {
    const takenN = Object.keys(t.taken).length;
    const left = Math.max(0, (Number(t.pills) || 0) - takenN);
    const pendFuture = doseDates(t, td, add(td, 400)).filter((d) => !t.taken[d]);
    const overdue = doseDates(t, add(td, -3), add(td, -1)).filter((d) => !t.taken[d]);
    const covered = pendFuture.slice(0, left);
    const isToday = doseDates(t, td, td).length > 0;
    let refill = null;
    if (t.course) { if (pendFuture.length > left) refill = { missing: pendFuture.length - left }; }
    else if (left <= 3) refill = { missing: null };
    return {
      takenN, left, pendFuture, overdue, covered,
      lastCovered: covered.length ? covered[covered.length - 1] : null,
      firstUncovered: pendFuture[left] || null,
      isToday, todayTaken: !!t.taken[td],
      next: pendFuture[0] || null,
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
    const due = nowD >= (function () { const p = t.time.split(':').map(Number); const d = new Date(nowD); d.setHours(p[0], p[1], 0, 0); return d; })();
    if (i.finished) {
      main = '<p class="state done">Tratamiento terminado. ¡Bien hecho!</p>';
    } else if (i.isToday && !i.todayTaken) {
      main = '<p class="state ' + (due ? 'now' : 'today') + '">' + (due ? 'Ya es hora de tu pastilla' : 'Hoy toca') + ' <span>· ' + time12(t.time) + '</span></p>';
      action = '<button class="btn take" data-act="take" data-id="' + t.id + '" data-date="' + td + '">Ya la tomé</button>';
    } else if (i.isToday && i.todayTaken) {
      main = '<p class="state done">Hoy ya la tomaste</p>';
      action = '<button class="btn link" data-act="untake" data-id="' + t.id + '" data-date="' + td + '">Deshacer</button>';
    } else {
      main = '<p class="state rest">Hoy no toca</p>';
    }
    const nextLine = (!i.finished && !(i.isToday && !i.todayTaken) && i.next)
      ? '<p class="meta">Próxima: <strong>' + longDate(i.next) + '</strong> · ' + time12(t.time) + '</p>' : '';
    const over = i.overdue.map((d) =>
      '<div class="warn"><span>No marcaste la pastilla del <strong>' + longDate(d) + '</strong>.</span> <button class="btn small" data-act="take" data-id="' + t.id + '" data-date="' + d + '">La tomé ese día</button></div>'
    ).join('') + (i.overdue.length ? '<p class="fine">Si olvidaste una dosis, pregunta a tu médico o farmacéutico qué hacer.</p>' : '');
    let stock = '<div class="stock"><b>' + i.left + '</b><span>' + (i.left === 1 ? 'pastilla' : 'pastillas') + '<br>por tomar</span></div>';
    let lasts = '';
    if (i.lastCovered && !i.finished) lasts = '<p class="meta">Te alcanzan hasta el <strong>' + longDate(i.lastCovered) + '</strong>.</p>';
    const prog = t.course ? '<p class="meta">Dosis tomadas: <strong>' + i.takenN + ' de ' + t.course + '</strong></p>' : '';
    const alert = i.refill && !i.finished ? '<div class="buy"><b>Comprar más</b><p>' + esc(refillText(t, i)) + '</p></div>' : '';
    return '<section class="card" style="--c:' + t.color + '"><div class="card-top"><div><h2>' + esc(label(t)) + '</h2><p class="meta">' + freq(t) + ' · <button class="btn link inline" data-act="edit" data-id="' + t.id + '">Editar nombre y mg</button></p>' + main + nextLine + lasts + prog + '</div>' + stock + '</div>' + action + over + alert + '</section>';
  }
  function viewHoy() {
    const n = now(), td = ymd(n);
    const notif = ('Notification' in window)
      ? (state.notify && Notification.permission === 'granted'
        ? '<p class="fine">Avisos en esta pantalla: activados (suenan solo si la app está abierta). Para alarmas seguras usa el calendario del celular, en Ajustes.</p>'
        : '<button class="btn ghost" data-act="notif">Activar avisos en esta pantalla</button>')
      : '';
    return '<header class="head"><p class="kicker">Hoy es</p><h1>' + cap(longDate(td)) + '</h1></header>' +
      state.treatments.map((t) => card(t, td, n)).join('') + notif;
  }
  function viewCal() {
    const td = today();
    const infos = state.treatments.map((t) => ({ t: t, i: info(t, td) }));
    let rows = '';
    for (let k = -3; k <= 27; k++) {
      const d = add(td, k);
      const chips = infos.map((x) => {
        if (!doseDates(x.t, d, d).length) return '';
        const taken = !!x.t.taken[d];
        const noPill = !taken && k >= 0 && x.i.covered.indexOf(d) < 0;
        const can = k <= 0;
        const cls = 'chip' + (taken ? ' taken' : '') + (noPill ? ' nopill' : '') + (k < 0 && !taken ? ' missed' : '');
        const lab = esc(label(x.t)) + (taken ? ' · tomada' : noPill ? ' · sin pastilla' : k < 0 ? ' · sin marcar' : '');
        return '<button class="' + cls + '" style="--c:' + x.t.color + '"' + (can ? ' data-act="toggle" data-id="' + x.t.id + '" data-date="' + d + '"' : ' disabled') + '><i></i>' + lab + '</button>';
      }).join('');
      rows += '<div class="day' + (k === 0 ? ' is-today' : '') + (!chips ? ' empty' : '') + '"><div class="dl"><b>' + (k === 0 ? 'Hoy' : shortDate(d)) + '</b>' + (k === 0 ? '<span>' + shortDate(d) + '</span>' : '') + '</div><div class="dc">' + (chips || '<span class="rest">Sin pastilla</span>') + '</div></div>';
    }
    return '<header class="head"><h1>Calendario</h1><p class="fine">Toca una pastilla de hoy o de días pasados para marcarla como tomada.</p></header><div class="days">' + rows + '</div>';
  }
  function field(t, f, label, type, extra) {
    let v = t[f]; if (v === null || v === undefined) v = '';
    return '<label class="fld"><span>' + label + '</span><input type="' + type + '" data-f="' + f + '" data-id="' + t.id + '" value="' + esc(v) + '" ' + (extra || '') + '></label>';
  }
  function viewSet() {
    const forms = state.treatments.map((t) => {
      const i = info(t, today());
      return '<section class="card set" id="set-' + t.id + '" style="--c:' + t.color + '"><h2>' + esc(label(t)) + '</h2>' +
        field(t, 'name', 'Nombre de la pastilla', 'text', 'maxlength="40" placeholder="Ejemplo: Amoxicilina"') +
        field(t, 'mg', 'Miligramos (mg)', 'text', 'inputmode="decimal" maxlength="10" placeholder="Ejemplo: 500"') +
        '<div class="two">' + field(t, 'every', 'Se toma cada (días)', 'number', 'min="1" max="30" inputmode="numeric"') + field(t, 'time', 'Hora del aviso', 'time') + '</div>' +
        field(t, 'start', 'Primer día del tratamiento', 'date') +
        field(t, 'course', 'Termina después de (dosis). Vacío = sin final', 'number', 'min="1" max="400" inputmode="numeric"') +
        field(t, 'pills', 'Pastillas compradas en total', 'number', 'min="0" max="999" inputmode="numeric"') +
        '<p class="fine">Ahora te quedan <strong>' + i.left + '</strong>.</p>' +
        '<div class="refill"><label class="fld"><span>Compré más pastillas</span><input id="add-' + t.id + '" type="number" min="1" max="999" value="10" inputmode="numeric"></label><button class="btn small" data-act="refill" data-id="' + t.id + '">Agregar</button></div>' +
        '<button class="btn link danger" data-act="reset" data-id="' + t.id + '">Borrar lo marcado y empezar de nuevo</button></section>';
    }).join('');
    return '<header class="head"><h1>Ajustes</h1></header>' +
      '<section class="card"><h2>Alarmas en el calendario del celular</h2>' +
      '<p>Es la forma más segura de que suene: el calendario del celular avisa aunque esta app esté cerrada.</p>' +
      '<ol class="steps"><li>Toca el botón de abajo para bajar el archivo.</li><li>Ábrelo y elige tu calendario para importarlo.</li><li>Si cambias la hora o compras más pastillas, vuelve a bajarlo e impórtalo otra vez: se actualizan los mismos eventos.</li></ol>' +
      '<button class="btn primary" data-act="ics">Bajar calendario con alarmas</button></section>' +
      forms +
      '<section class="card"><h2>Copia de seguridad</h2><p class="fine">Tus datos están solo en este dispositivo. Guarda una copia por si cambias de celular.</p><div class="row"><button class="btn" data-act="export">Guardar copia</button><label class="btn">Restaurar copia<input type="file" accept="application/json" data-act-change="import" hidden></label></div></section>';
  }
  function render() {
    const app = document.getElementById('app');
    app.innerHTML = tab === 'hoy' ? viewHoy() : tab === 'cal' ? viewCal() : viewSet();
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
      i.covered.forEach((d) => ev('dosis-' + t.id + '-' + d, d, t.time, 15, '💊 ' + label(t), 'Toma tu pastilla y márcala en la app Mis pastillas.'));
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
      if (!doseDates(t, td, td).length || t.taken[td]) return;
      const p = t.time.split(':').map(Number), due = new Date(n); due.setHours(p[0], p[1], 0, 0);
      const mins = (n - due) / 60000;
      const k = t.id + td, c = noteLog[k] || 0;
      if (mins >= 0 && c < 3 && mins >= c * 30) {
        noteLog[k] = c + 1;
        try { localStorage.setItem(NOTE_KEY, JSON.stringify(noteLog)); } catch (e) { /* ignorar */ }
        showNote('💊 Hora de tu pastilla', label(t), k);
      }
    });
  }

  /* ---------- acciones ---------- */
  const T = (id) => state.treatments.find((t) => t.id === id);
  const actions = {
    tab(el) { tab = el.dataset.tab; render(); window.scrollTo(0, 0); },
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
  document.addEventListener('change', (e) => {
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
    if (f === 'every') { v = Math.min(30, Math.max(1, Math.floor(Number(v)) || 1)); }
    else if (f === 'pills') { v = Math.max(0, Math.floor(Number(v)) || 0); }
    else if (f === 'course') { v = v === '' ? null : Math.max(1, Math.floor(Number(v)) || 1); }
    else if (f === 'start' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { return; }
    else if (f === 'time' && !/^\d{2}:\d{2}$/.test(v)) { return; }
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
