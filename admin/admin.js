/* Anyara Hills — pricing admin console. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var A = window.Anyara;
  var parsed = null;        // { rows, issues, filename }
  var allLots = [];

  /* ================= column mapping ================= */

  var FIELDS = [
    { key: 'lot_no',       required: true,  names: ['lot no', 'lot', 'lot number', 'lot_no', 'lotno', 'unit', 'unit no'] },
    { key: 'land_size_sf', required: true,  names: ['land size (sf)', 'land size sf', 'land size', 'size (sf)', 'size', 'sf', 'sqft', 'square feet', 'area'] },
    { key: 'list_price',   required: true,  names: ['list price', 'list price (rm)', 'price', 'price (rm)', 'spa price', 'list'] },
    { key: 'privilege',    required: false, names: ['privilege', 'privilege entitlement', 'anyara privilege entitlement', 'entitlement', 'discount', 'rebate'] },
    { key: 'status',       required: false, names: ['status'] },
    { key: 'phase',        required: false, names: ['phase'] },
    { key: 'notes',        required: false, names: ['notes', 'note', 'remark', 'remarks'] }
  ];

  var STATUSES = ['Available', 'Reserved', 'Booked', 'Sold'];

  function normaliseHeader(h) {
    return String(h == null ? '' : h)
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/\(rm\)|rm\b/g, ' ')
      .replace(/[^a-z0-9()]+/g, ' ')
      .trim();
  }

  function mapHeaders(headerRow) {
    var map = {};
    headerRow.forEach(function (raw, i) {
      var h = normaliseHeader(raw);
      if (!h) return;
      FIELDS.forEach(function (f) {
        if (map[f.key] !== undefined) return;
        for (var n = 0; n < f.names.length; n++) {
          if (h === f.names[n] || h === normaliseHeader(f.names[n])) { map[f.key] = i; return; }
        }
      });
    });
    return map;
  }

  function toNumber(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).replace(/[^0-9.\-]/g, '');
    if (!s || s === '-' || s === '.') return null;
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  /* ================= parsing ================= */

  function parseWorkbook(data, filename) {
    var wb;
    if (/\.csv$/i.test(filename || '')) {
      // CSV: read as text with raw:true, otherwise SheetJS coerces "036" to 36
      // and lot numbers lose their leading zeros.
      wb = XLSX.read(new TextDecoder('utf-8').decode(data), { type: 'string', raw: true });
    } else {
      wb = XLSX.read(data, { type: 'array' });
    }
    var sheet = wb.Sheets[wb.SheetNames[0]];

    // Two views of the same sheet, row-aligned (blankrows keeps the indices true
    // to the spreadsheet, so reported row numbers match what the admin sees):
    //   grid     — raw values, for the numeric columns
    //   gridText — formatted text, so a lot displayed as "036" stays "036"
    var grid = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: true, raw: true });
    var gridText = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: true, raw: false, defval: '' });

    if (!grid.length) return { rows: [], issues: [{ row: 0, message: 'The sheet is empty.' }], filename: filename };

    // find the header row — first row that maps lot_no and list_price
    var headerIdx = -1, map = null;
    for (var i = 0; i < Math.min(grid.length, 15); i++) {
      var m = mapHeaders(grid[i] || []);
      if (m.lot_no !== undefined && m.list_price !== undefined) { headerIdx = i; map = m; break; }
    }

    if (headerIdx === -1) {
      return {
        rows: [],
        issues: [{ row: 0, message: 'Could not find the heading row. It needs at least a lot number column and a list price column in the first 15 rows.' }],
        filename: filename
      };
    }

    var missing = FIELDS.filter(function (f) { return f.required && map[f.key] === undefined; });
    if (missing.length) {
      return {
        rows: [],
        issues: [{ row: headerIdx + 1, message: 'Missing required column(s): ' + missing.map(function (f) { return f.key; }).join(', ') }],
        filename: filename
      };
    }

    var rows = [], issues = [], seen = {};

    for (i = headerIdx + 1; i < grid.length; i++) {
      var r = grid[i] || [];
      var rt = gridText[i] || [];
      var lineNo = i + 1;
      var get = function (key) { return map[key] === undefined ? null : r[map[key]]; };
      var getText = function (key) { return map[key] === undefined ? null : rt[map[key]]; };

      // text view first, so "036" keeps its leading zero and "203A" stays intact
      var lot = getText('lot_no');
      if (lot === null || lot === undefined || String(lot).trim() === '') lot = get('lot_no');
      lot = (lot === null || lot === undefined) ? '' : String(lot).trim();
      if (!lot) continue;                                  // blank row — skip silently

      var size = toNumber(get('land_size_sf'));
      var list = toNumber(get('list_price'));
      var priv = toNumber(get('privilege'));
      if (priv === null) priv = 0;

      if (seen[lot.toLowerCase()]) {
        issues.push({ row: lineNo, message: 'Lot ' + lot + ' appears more than once in this file — the later row was dropped.' });
        continue;
      }
      if (size === null || size <= 0) {
        issues.push({ row: lineNo, message: 'Lot ' + lot + ': land size is missing or not a positive number.' });
        continue;
      }
      if (list === null || list < 0) {
        issues.push({ row: lineNo, message: 'Lot ' + lot + ': list price is missing or not a number.' });
        continue;
      }
      if (priv < 0) {
        issues.push({ row: lineNo, message: 'Lot ' + lot + ': privilege cannot be negative.' });
        continue;
      }
      if (priv > list) {
        issues.push({ row: lineNo, message: 'Lot ' + lot + ': privilege (' + priv + ') is larger than the list price (' + list + ').' });
        continue;
      }

      var status = get('status');
      status = status ? String(status).trim() : 'Available';
      var matched = STATUSES.filter(function (s) { return s.toLowerCase() === status.toLowerCase(); })[0];
      if (!matched) {
        if (String(status).trim()) {
          issues.push({ row: lineNo, message: 'Lot ' + lot + ': unknown status "' + status + '" — set to Available.' });
        }
        matched = 'Available';
      }

      var phase = get('phase');
      var notes = get('notes');

      seen[lot.toLowerCase()] = true;
      rows.push({
        lot_no: lot,
        land_size_sf: size,
        list_price: list,
        privilege: priv,
        status: matched,
        phase: phase ? String(phase).trim() : null,
        notes: notes ? String(notes).trim() : null
      });
    }

    return { rows: rows, issues: issues, filename: filename };
  }

  /* ================= formatting ================= */

  function rm(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return 'RM ' + Number(n).toLocaleString('en-MY', { maximumFractionDigits: 0 });
  }
  function sf(n) {
    if (n === null || n === undefined) return '—';
    return Number(n).toLocaleString('en-MY', { maximumFractionDigits: 0 });
  }
  function when(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return isNaN(d) ? '—' : d.toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  function table(el, columns, rows, empty) {
    el.textContent = '';
    if (!rows.length) {
      var p = document.createElement('caption');
      p.className = 'data-empty';
      p.textContent = empty;
      el.appendChild(p);
      return;
    }
    var thead = document.createElement('thead');
    var htr = document.createElement('tr');
    columns.forEach(function (c) {
      var th = document.createElement('th');
      th.textContent = c.label;
      if (c.numeric) th.className = 'ta-r';
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    el.appendChild(thead);

    var tbody = document.createElement('tbody');
    rows.forEach(function (row) {
      var tr = document.createElement('tr');
      columns.forEach(function (c) {
        var td = document.createElement('td');
        td.textContent = c.value(row);
        if (c.numeric) td.className = 'ta-r';
        if (c.cls) td.classList.add(c.cls(row) || '');
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    el.appendChild(tbody);
  }

  var LOT_COLUMNS = [
    { label: 'Lot',      value: function (r) { return r.lot_no; } },
    { label: 'Phase',    value: function (r) { return r.phase || '—'; } },
    { label: 'Size (sf)', numeric: true, value: function (r) { return sf(r.land_size_sf); } },
    { label: 'List',     numeric: true, value: function (r) { return rm(r.list_price); } },
    { label: 'Privilege', numeric: true, value: function (r) { return rm(r.privilege); } },
    { label: 'Nett',     numeric: true, value: function (r) {
        return rm(r.nett_price !== undefined && r.nett_price !== null
          ? r.nett_price : r.list_price - r.privilege);
      } },
    { label: 'PSF',      numeric: true, value: function (r) {
        var nett = (r.nett_price !== undefined && r.nett_price !== null)
          ? Number(r.nett_price) : (r.list_price - r.privilege);
        return r.land_size_sf > 0 ? rm(nett / r.land_size_sf) : '—';
      } },
    { label: 'Status',   value: function (r) { return r.status; },
      cls: function (r) { return 'status-' + String(r.status).toLowerCase(); } }
  ];

  /* ================= preview ================= */

  function showParseMessage(html, kind) {
    var el = $('parseMsg');
    el.textContent = '';
    if (!html) return;
    var box = document.createElement('div');
    box.className = kind === 'error' ? 'msg msg-error' : 'msg msg-ok';
    box.textContent = html;
    el.appendChild(box);
  }

  function renderPreview() {
    var existing = {};
    allLots.forEach(function (l) { existing[l.lot_no.toLowerCase()] = l; });

    var adds = 0, updates = 0, unchanged = 0;
    parsed.rows.forEach(function (r) {
      var cur = existing[r.lot_no.toLowerCase()];
      if (!cur) { adds++; r._action = 'new'; return; }
      var same = Number(cur.land_size_sf) === r.land_size_sf
        && Number(cur.list_price) === r.list_price
        && Number(cur.privilege) === r.privilege
        && String(cur.status) === r.status
        && (cur.phase || null) === (r.phase || null);
      if (same) { unchanged++; r._action = 'same'; }
      else { updates++; r._action = 'changed'; }
    });

    var missing = allLots.filter(function (l) {
      return !parsed.rows.some(function (r) { return r.lot_no.toLowerCase() === l.lot_no.toLowerCase(); });
    });

    var s = $('summary');
    s.textContent = '';
    [
      ['Rows read', parsed.rows.length],
      ['New lots', adds],
      ['Changed', updates],
      ['Unchanged', unchanged],
      ['Rows skipped', parsed.issues.filter(function (i) { return i.row; }).length]
    ].forEach(function (pair) {
      var d = document.createElement('div');
      d.className = 'sum';
      var n = document.createElement('span'); n.className = 'sum-n'; n.textContent = pair[1];
      var l = document.createElement('span'); l.className = 'sum-l'; l.textContent = pair[0];
      d.appendChild(n); d.appendChild(l);
      s.appendChild(d);
    });

    var iss = $('issues');
    iss.textContent = '';

    if (missing.length) {
      var warn = document.createElement('div');
      warn.className = 'msg msg-warn';
      warn.textContent = missing.length + ' lot(s) already in the app are not in this file: '
        + missing.slice(0, 12).map(function (l) { return l.lot_no; }).join(', ')
        + (missing.length > 12 ? '…' : '')
        + '. They will be left exactly as they are — publishing never deletes lots.';
      iss.appendChild(warn);
    }

    if (parsed.issues.length) {
      var box = document.createElement('div');
      box.className = 'msg msg-warn';
      var h = document.createElement('strong');
      h.textContent = parsed.issues.length + ' row(s) need attention:';
      box.appendChild(h);
      var ul = document.createElement('ul');
      parsed.issues.slice(0, 25).forEach(function (i) {
        var li = document.createElement('li');
        li.textContent = (i.row ? 'Row ' + i.row + ' — ' : '') + i.message;
        ul.appendChild(li);
      });
      box.appendChild(ul);
      if (parsed.issues.length > 25) {
        var more = document.createElement('p');
        more.textContent = '…and ' + (parsed.issues.length - 25) + ' more.';
        box.appendChild(more);
      }
      iss.appendChild(box);
    }

    var cols = LOT_COLUMNS.concat([{
      label: 'Change', value: function (r) {
        return r._action === 'new' ? 'New' : r._action === 'changed' ? 'Updated' : 'No change';
      },
      cls: function (r) { return 'act-' + r._action; }
    }]);
    table($('previewTable'), cols, parsed.rows, 'Nothing to import.');

    $('preview').hidden = false;
    $('btnPublish').disabled = parsed.rows.length === 0;
  }

  /* ================= publish ================= */

  function publish() {
    if (!parsed || !parsed.rows.length) return;
    var btn = $('btnPublish');
    btn.disabled = true;
    btn.textContent = 'Publishing…';

    var payload = parsed.rows.map(function (r) {
      return {
        lot_no: r.lot_no, land_size_sf: r.land_size_sf, list_price: r.list_price,
        privilege: r.privilege, status: r.status, phase: r.phase, notes: r.notes
      };
    });

    var adds = parsed.rows.filter(function (r) { return r._action === 'new'; }).length;
    var changed = parsed.rows.filter(function (r) { return r._action === 'changed'; }).length;

    A.supabase().from('lots').upsert(payload, { onConflict: 'lot_no' }).select('lot_no')
      .then(function (res) {
        if (res.error) throw res.error;
        return A.supabase().from('price_imports').insert({
          filename: parsed.filename,
          row_count: parsed.rows.length,
          inserted: adds,
          updated: changed,
          skipped: parsed.issues.filter(function (i) { return i.row; }).length
        });
      })
      .then(function () {
        showParseMessage('Published. ' + parsed.rows.length + ' lot(s) are now live in the app.', 'ok');
        resetUpload();
        return refresh();
      })
      .catch(function (err) {
        btn.disabled = false;
        btn.textContent = 'Publish to the app';
        showParseMessage('Could not publish: ' + (err.message || err)
          + (String(err.message || '').indexOf('row-level security') !== -1
             ? ' — this account is not an admin. Promote it with the SQL at the bottom of supabase/schema.sql.'
             : ''), 'error');
      });
  }

  function resetUpload() {
    parsed = null;
    $('preview').hidden = true;
    $('file').value = '';
    $('dropName').textContent = '';
    $('btnPublish').disabled = false;
    $('btnPublish').textContent = 'Publish to the app';
  }

  /* ================= loading ================= */

  function refresh() {
    return A.loadLots().then(function (res) {
      allLots = res.rows;
      var meta = $('lotsMeta');
      if (!allLots.length) {
        meta.textContent = 'No lots yet — upload a price list to get started.';
      } else {
        meta.textContent = allLots.length + ' lot(s)'
          + (res.source === 'cache' ? ' (from this device’s cache — could not reach Supabase)' : '')
          + '. Last updated ' + when(allLots.reduce(function (a, l) {
              return (!a || l.updated_at > a) ? l.updated_at : a;
            }, null)) + '.';
      }
      renderLots();
      return loadImports();
    });
  }

  function renderLots() {
    var q = ($('lotSearch').value || '').trim().toLowerCase();
    var rows = q
      ? allLots.filter(function (l) {
          return (l.lot_no + ' ' + (l.phase || '') + ' ' + l.status).toLowerCase().indexOf(q) !== -1;
        })
      : allLots;
    table($('lotsTable'), LOT_COLUMNS, rows, q ? 'No lot matches that.' : 'No lots yet.');
  }

  function loadImports() {
    return A.supabase().from('price_imports')
      .select('filename,row_count,inserted,updated,skipped,imported_at')
      .order('imported_at', { ascending: false }).limit(10)
      .then(function (res) {
        table($('importsTable'), [
          { label: 'When',   value: function (r) { return when(r.imported_at); } },
          { label: 'File',   value: function (r) { return r.filename || '—'; } },
          { label: 'Rows',   numeric: true, value: function (r) { return r.row_count; } },
          { label: 'New',    numeric: true, value: function (r) { return r.inserted; } },
          { label: 'Updated', numeric: true, value: function (r) { return r.updated; } },
          { label: 'Skipped', numeric: true, value: function (r) { return r.skipped; } }
        ], res.data || [], 'No imports yet.');
      })
      .catch(function () { /* non-fatal */ });
  }

  /* ================= file input ================= */

  function handleFile(f) {
    if (!f) return;
    $('dropName').textContent = f.name;
    showParseMessage('');
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        parsed = parseWorkbook(new Uint8Array(e.target.result), f.name);
      } catch (err) {
        showParseMessage('Could not read that file: ' + (err.message || err), 'error');
        return;
      }
      if (!parsed.rows.length) {
        $('preview').hidden = true;
        showParseMessage(parsed.issues.length ? parsed.issues[0].message : 'No usable rows found.', 'error');
        return;
      }
      renderPreview();
    };
    reader.onerror = function () { showParseMessage('Could not read that file.', 'error'); };
    reader.readAsArrayBuffer(f);
  }

  /* ================= auth / boot ================= */

  function showGate() {
    $('adminGate').hidden = false;
    $('adminApp').hidden = true;
  }

  function enterConsole(profile) {
    $('adminGate').hidden = true;
    $('adminApp').hidden = false;
    $('adminWho').textContent = profile.email + (profile.role === 'admin' ? '' : ' (read-only)');
    if (profile.role !== 'admin') {
      showParseMessage('This account is signed in but is not an admin, so publishing will be refused. '
        + 'Promote it with the SQL at the bottom of supabase/schema.sql.', 'error');
    }
    refresh();
  }

  function handleSignIn(e) {
    e.preventDefault();
    var email = ($('aEmail').value || '').trim().toLowerCase();
    var pass = $('aPass').value;
    var err = $('aErr');
    err.hidden = true;

    if (!email || !pass) { err.textContent = 'Enter your email and password.'; err.hidden = false; return; }

    var btn = $('aSubmit');
    btn.disabled = true;
    A.signIn(email, pass)
      .then(function (res) {
        btn.disabled = false;
        if (res.error) { err.textContent = res.error.message; err.hidden = false; return; }
        $('aPass').value = '';
        return A.myProfile().then(enterConsole);
      })
      .catch(function (ex) {
        btn.disabled = false;
        err.textContent = ex.message || String(ex);
        err.hidden = false;
      });
  }

  function init() {
    if (!A.configured() || !window.supabase) {
      $('setupWarning').hidden = false;
      return;
    }

    $('adminSignIn').addEventListener('submit', handleSignIn);
    $('btnAdminSignOut').addEventListener('click', function () {
      A.signOut().then(showGate);
    });

    $('btnPick').addEventListener('click', function () { $('file').click(); });
    $('file').addEventListener('change', function () { handleFile(this.files[0]); });
    $('btnCancel').addEventListener('click', resetUpload);
    $('btnPublish').addEventListener('click', publish);
    $('btnRefresh').addEventListener('click', refresh);
    $('lotSearch').addEventListener('input', renderLots);

    var drop = $('drop');
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('is-over'); });
    });
    drop.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });

    A.currentSession().then(function (session) {
      if (!session) { showGate(); return; }
      return A.myProfile().then(enterConsole);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
