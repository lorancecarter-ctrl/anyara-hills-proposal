/* Anyara Hills — pricing admin console.
 *
 * Real price lists are messy: the master sheet carries the superseded prices and
 * the revised prices side by side under IDENTICAL headings, some phases use a
 * shifted layout, and there are signatory rows at the bottom. Guessing silently
 * would quote stale prices to a client, so the column mapping is always shown
 * and always overridable before anything is published.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var A = window.Anyara;

  var allLots = [];
  var book = null;      // { sheetNames, name, grid, gridText }
  var headerIdx = -1;
  var columns = [];     // [{ index, label, letter }]
  var mapping = {};     // field -> column index (or undefined)
  var parsed = null;    // { rows, issues, notes }

  /* ================= fields ================= */

  var FIELDS = [
    { key: 'lot_no',       label: 'Lot number',      required: true,
      names: ['lot no', 'lot', 'lot number', 'lotno', 'unit', 'unit no'] },
    { key: 'phase',        label: 'Phase',           names: ['phase'] },
    { key: 'land_size_sf', label: 'Land size (sf)',  required: true,
      names: ['area sqft', 'area sq ft', 'land size sf', 'land size', 'size sf', 'size', 'sqft', 'sq ft', 'square feet', 'area'] },
    { key: 'list_price',   label: 'List price',      required: true, preferLast: true,
      names: ['list price', 'list price rm', 'price', 'list'] },
    { key: 'spa_price',    label: 'SPA / nett price', preferLast: true, avoid: ['current'],
      names: ['spa price', 'spa price rm', 'nett price', 'nett spa price', 'net price'] },
    { key: 'privilege',    label: 'Privilege',
      names: ['privilege', 'privilege entitlement', 'anyara privilege entitlement', 'entitlement', 'discount', 'rebate'] },
    { key: 'status',       label: 'Status',          names: ['status'] },
    { key: 'category',     label: 'Category',        names: ['category', 'type', 'tier'] },
    { key: 'notes',        label: 'Notes',           names: ['notes', 'note', 'remark', 'remarks'] }
  ];

  var STATUSES = ['Available', 'Reserved', 'Booked', 'Sold'];

  /* ================= helpers ================= */

  function normalise(h) {
    return String(h == null ? '' : h)
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/\s+/g, ' ')
      .replace(/\(\s*rm\s*\)/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function colLetter(n) {
    var s = '';
    n += 1;
    while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - r - 1) / 26; }
    return s;
  }

  function toNumber(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).replace(/[^0-9.\-]/g, '');
    if (!s || s === '-' || s === '.') return null;
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  function rm(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return 'RM ' + Number(n).toLocaleString('en-MY', { maximumFractionDigits: 0 });
  }
  function sfFmt(n) {
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

  /* ================= workbook ================= */

  function readWorkbook(data, filename) {
    if (/\.csv$/i.test(filename || '')) {
      // raw:true, or SheetJS turns "036" into 36 and lot numbers lose their zeros
      return XLSX.read(new TextDecoder('utf-8').decode(data), { type: 'string', raw: true });
    }
    return XLSX.read(data, { type: 'array' });
  }

  function loadSheet(wb, name) {
    var sheet = wb.Sheets[name];
    return {
      grid: XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: true, raw: true }),
      gridText: XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: true, raw: false, defval: '' })
    };
  }

  /* The heading row is the one that names the most fields — not simply the
     first non-empty row, because these sheets open with a title and a date. */
  function detectHeader(gridText) {
    var best = -1, bestScore = 0;
    for (var i = 0; i < Math.min(gridText.length, 25); i++) {
      var row = gridText[i] || [];
      var score = 0;
      row.forEach(function (cell) {
        var h = normalise(cell);
        if (!h) return;
        FIELDS.forEach(function (f) {
          if (f.names.indexOf(h) !== -1) score++;
        });
      });
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return bestScore >= 2 ? best : -1;
  }

  function readColumns(gridText, idx) {
    var row = gridText[idx] || [];
    var width = Math.max.apply(null, gridText.slice(0, idx + 40).map(function (r) {
      return (r || []).length;
    }).concat([row.length]));
    var out = [];
    for (var i = 0; i < width; i++) {
      var label = String(row[i] == null ? '' : row[i]).replace(/\s+/g, ' ').trim();
      out.push({ index: i, label: label, letter: colLetter(i) });
    }
    return out;
  }

  /* Auto-map, and say out loud when a heading was ambiguous. */
  function autoMap(cols) {
    var map = {}, notes = [];

    FIELDS.forEach(function (f) {
      var hits = cols.filter(function (c) {
        var h = normalise(c.label);
        if (!h || f.names.indexOf(h) === -1) return false;
        if (f.avoid && f.avoid.some(function (bad) { return h.indexOf(bad) !== -1; })) return false;
        return true;
      });

      // headings that carry a word we were told to avoid ("CURRENT SPA PRICE")
      if (!hits.length && f.avoid) return;
      if (!hits.length) return;

      var chosen = f.preferLast ? hits[hits.length - 1] : hits[0];
      map[f.key] = chosen.index;

      if (hits.length > 1) {
        notes.push({
          field: f.key,
          message: '“' + chosen.label.replace(/\s+/g, ' ') + '” appears in ' + hits.length
            + ' columns (' + hits.map(function (h) { return h.letter; }).join(', ') + '). '
            + 'Using column ' + chosen.letter + ' — on a revision sheet the superseded prices sit '
            + 'to the left. Check this is the one you mean.'
        });
      }
    });

    return { map: map, notes: notes };
  }

  /* ================= extraction ================= */

  function extractRows() {
    var rows = [], issues = [], noSpa = 0, noList = 0, skipped = 0, seen = {};
    var grid = book.grid, gridText = book.gridText;

    var get = function (r, key) {
      return mapping[key] === undefined ? null : r[mapping[key]];
    };

    for (var i = headerIdx + 1; i < grid.length; i++) {
      var r = grid[i] || [];
      var rt = gridText[i] || [];
      var lineNo = i + 1;

      // lot number from the text view, so "003A" and "001" survive intact
      var lot = get(rt, 'lot_no');
      if (lot === null || lot === undefined || String(lot).trim() === '') lot = get(r, 'lot_no');
      lot = (lot === null || lot === undefined) ? '' : String(lot).trim();
      if (!lot) continue;

      var size = toNumber(get(r, 'land_size_sf'));
      var list = toNumber(get(r, 'list_price'));
      var spaRaw = mapping.spa_price === undefined ? null : toNumber(get(r, 'spa_price'));

      // Footer and signatory rows carry text in the lot column but no figures —
      // drop them quietly rather than reporting them as broken data.
      if (size === null && list === null && spaRaw === null) { skipped++; continue; }

      // A revision sheet leaves the new list price blank for phases it did not
      // reprice. Those lots carry a nett price and no discount, so the nett
      // price is the list price.
      if (list === null && spaRaw !== null) { list = spaRaw; noList++; }

      if (seen[lot.toLowerCase()]) {
        issues.push({ row: lineNo, message: 'Lot ' + lot + ' appears more than once — the later row was dropped.' });
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

      // Privilege comes either straight from a column, or from list − SPA.
      var priv;
      if (mapping.spa_price !== undefined) {
        var spa = spaRaw;
        if (spa === null) { priv = 0; noSpa++; }
        else if (spa > list) {
          issues.push({ row: lineNo, message: 'Lot ' + lot + ': SPA price (' + rm(spa) + ') is above the list price (' + rm(list) + ').' });
          continue;
        } else {
          priv = list - spa;
        }
      } else {
        priv = toNumber(get(r, 'privilege'));
        if (priv === null) priv = 0;
        if (priv < 0) {
          issues.push({ row: lineNo, message: 'Lot ' + lot + ': privilege cannot be negative.' });
          continue;
        }
        if (priv > list) {
          issues.push({ row: lineNo, message: 'Lot ' + lot + ': privilege (' + rm(priv) + ') is above the list price (' + rm(list) + ').' });
          continue;
        }
      }

      var status = get(rt, 'status');
      status = status ? String(status).trim() : '';
      var matched = STATUSES.filter(function (s) { return s.toLowerCase() === status.toLowerCase(); })[0];
      if (!matched) {
        if (status) issues.push({ row: lineNo, message: 'Lot ' + lot + ': unknown status “' + status + '” — set to Available.' });
        matched = 'Available';
      }

      var txt = function (key) {
        var v = get(rt, key);
        v = (v === null || v === undefined) ? '' : String(v).trim();
        return v || null;
      };

      seen[lot.toLowerCase()] = true;
      rows.push({
        lot_no: lot,
        land_size_sf: size,
        list_price: list,
        privilege: priv,
        status: matched,
        phase: txt('phase'),
        category: txt('category'),
        notes: txt('notes')
      });
    }

    var notes = [];
    if (noList) {
      notes.push(noList + ' lot(s) had no price in the list-price column — the SPA / nett price was '
        + 'used as the list price, so they carry no privilege. This is normal for phases a revision '
        + 'did not reprice.');
    }
    if (noSpa) {
      notes.push(noSpa + ' lot(s) had no SPA price — recorded with no privilege, so nett equals list.');
    }
    if (skipped) {
      notes.push(skipped + ' non-data row(s) below the table were ignored (totals, signatories and similar).');
    }
    return { rows: rows, issues: issues, notes: notes };
  }

  /* ================= mapping UI ================= */

  function renderMapper(autoNotes) {
    var wrap = $('mapper');
    wrap.textContent = '';

    var head = document.createElement('p');
    head.className = 'card-fine map-head';
    head.textContent = 'Heading row detected at row ' + (headerIdx + 1)
      + '. Check each column below before publishing.';
    wrap.appendChild(head);

    var grid = document.createElement('div');
    grid.className = 'map-grid';

    FIELDS.forEach(function (f) {
      var lab = document.createElement('label');
      lab.className = 'map-field';

      var name = document.createElement('span');
      name.className = 'map-name';
      name.textContent = f.label + (f.required ? ' *' : '');
      lab.appendChild(name);

      var sel = document.createElement('select');
      var none = document.createElement('option');
      none.value = '';
      none.textContent = '— not in this file —';
      sel.appendChild(none);

      columns.forEach(function (c) {
        var o = document.createElement('option');
        o.value = String(c.index);
        o.textContent = c.letter + (c.label ? ' — ' + c.label : '');
        sel.appendChild(o);
      });

      sel.value = mapping[f.key] === undefined ? '' : String(mapping[f.key]);
      sel.addEventListener('change', function () {
        if (sel.value === '') delete mapping[f.key];
        else mapping[f.key] = parseInt(sel.value, 10);
        refreshPreview();
      });

      lab.appendChild(sel);
      grid.appendChild(lab);
    });

    wrap.appendChild(grid);

    (autoNotes || []).forEach(function (n) {
      var box = document.createElement('div');
      box.className = 'msg msg-warn';
      box.textContent = n.message;
      wrap.appendChild(box);
    });

    var hint = document.createElement('p');
    hint.className = 'card-fine';
    hint.textContent = 'Map either “SPA / nett price” or “Privilege” — whichever your sheet has. '
      + 'The other is worked out from the list price.';
    wrap.appendChild(hint);

    $('mapperWrap').hidden = false;
  }

  /* ================= preview ================= */

  function refreshPreview() {
    var missing = FIELDS.filter(function (f) { return f.required && mapping[f.key] === undefined; });
    var needsPrice = mapping.spa_price === undefined && mapping.privilege === undefined;

    if (missing.length || needsPrice) {
      $('preview').hidden = true;
      var parts = [];
      if (missing.length) parts.push('Map a column for: ' + missing.map(function (f) { return f.label; }).join(', ') + '.');
      if (needsPrice) parts.push('Map either “SPA / nett price” or “Privilege”.');
      showMessage(parts.join(' '), 'warn');
      return;
    }

    showMessage('');
    parsed = extractRows();

    if (!parsed.rows.length) {
      $('preview').hidden = true;
      showMessage('No usable rows with this mapping.', 'error');
      return;
    }
    renderPreview();
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
        && (cur.phase || null) === (r.phase || null)
        && (cur.category || null) === (r.category || null);
      if (same) { unchanged++; r._action = 'same'; } else { updates++; r._action = 'changed'; }
    });

    var absent = allLots.filter(function (l) {
      return !parsed.rows.some(function (r) { return r.lot_no.toLowerCase() === l.lot_no.toLowerCase(); });
    });

    var s = $('summary');
    s.textContent = '';
    [['Rows read', parsed.rows.length], ['New lots', adds], ['Changed', updates],
     ['Unchanged', unchanged], ['Rejected', parsed.issues.length]].forEach(function (pair) {
      var d = document.createElement('div');
      d.className = 'sum';
      var n = document.createElement('span'); n.className = 'sum-n'; n.textContent = pair[1];
      var l = document.createElement('span'); l.className = 'sum-l'; l.textContent = pair[0];
      d.appendChild(n); d.appendChild(l);
      s.appendChild(d);
    });

    var iss = $('issues');
    iss.textContent = '';

    parsed.notes.forEach(function (n) {
      var box = document.createElement('div');
      box.className = 'msg msg-ok';
      box.textContent = n;
      iss.appendChild(box);
    });

    if (absent.length) {
      var warn = document.createElement('div');
      warn.className = 'msg msg-warn';
      warn.textContent = absent.length + ' lot(s) already in the app are not in this file: '
        + absent.slice(0, 12).map(function (l) { return l.lot_no; }).join(', ')
        + (absent.length > 12 ? '…' : '')
        + '. They stay exactly as they are — publishing never deletes.';
      iss.appendChild(warn);
    }

    if (parsed.issues.length) {
      var box2 = document.createElement('div');
      box2.className = 'msg msg-warn';
      var h = document.createElement('strong');
      h.textContent = parsed.issues.length + ' row(s) were rejected:';
      box2.appendChild(h);
      var ul = document.createElement('ul');
      parsed.issues.slice(0, 25).forEach(function (i) {
        var li = document.createElement('li');
        li.textContent = 'Row ' + i.row + ' — ' + i.message;
        ul.appendChild(li);
      });
      box2.appendChild(ul);
      if (parsed.issues.length > 25) {
        var more = document.createElement('p');
        more.textContent = '…and ' + (parsed.issues.length - 25) + ' more.';
        box2.appendChild(more);
      }
      iss.appendChild(box2);
    }

    var cols = LOT_COLUMNS.concat([{
      label: 'Change',
      value: function (r) { return r._action === 'new' ? 'New' : r._action === 'changed' ? 'Updated' : 'No change'; },
      cls: function (r) { return 'act-' + r._action; }
    }]);
    table($('previewTable'), cols, parsed.rows, 'Nothing to import.');

    $('preview').hidden = false;
    $('btnPublish').disabled = false;
  }

  /* ================= tables ================= */

  function table(el, cols, rows, empty) {
    el.textContent = '';
    if (!rows.length) {
      var cap = document.createElement('caption');
      cap.className = 'data-empty';
      cap.textContent = empty;
      el.appendChild(cap);
      return;
    }
    var thead = document.createElement('thead');
    var htr = document.createElement('tr');
    cols.forEach(function (c) {
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
      cols.forEach(function (c) {
        var td = document.createElement('td');
        td.textContent = c.value(row);
        if (c.numeric) td.className = 'ta-r';
        if (c.cls) { var k = c.cls(row); if (k) td.classList.add(k); }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    el.appendChild(tbody);
  }

  function nettOf(r) {
    return (r.nett_price !== undefined && r.nett_price !== null)
      ? Number(r.nett_price) : (Number(r.list_price) - Number(r.privilege));
  }

  var LOT_COLUMNS = [
    { label: 'Lot',       value: function (r) { return r.lot_no; } },
    { label: 'Phase',     value: function (r) { return r.phase || '—'; } },
    { label: 'Category',  value: function (r) { return r.category || '—'; } },
    { label: 'Size (sf)', numeric: true, value: function (r) { return sfFmt(r.land_size_sf); } },
    { label: 'List',      numeric: true, value: function (r) { return rm(r.list_price); } },
    { label: 'Privilege', numeric: true, value: function (r) { return rm(r.privilege); } },
    { label: 'Nett / SPA', numeric: true, value: function (r) { return rm(nettOf(r)); } },
    { label: 'PSF',       numeric: true, value: function (r) {
        return r.land_size_sf > 0 ? rm(nettOf(r) / r.land_size_sf) : '—'; } },
    { label: 'Status',    value: function (r) { return r.status; },
      cls: function (r) { return 'status-' + String(r.status).toLowerCase(); } }
  ];

  /* ================= messages ================= */

  function showMessage(text, kind) {
    var el = $('parseMsg');
    el.textContent = '';
    if (!text) return;
    var box = document.createElement('div');
    box.className = 'msg ' + (kind === 'error' ? 'msg-error' : kind === 'warn' ? 'msg-warn' : 'msg-ok');
    box.textContent = text;
    el.appendChild(box);
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
        privilege: r.privilege, status: r.status, phase: r.phase,
        category: r.category, notes: r.notes
      };
    });
    var adds = parsed.rows.filter(function (r) { return r._action === 'new'; }).length;
    var changed = parsed.rows.filter(function (r) { return r._action === 'changed'; }).length;

    // Supabase caps a request body; send in batches so a 338-lot list goes through.
    var CHUNK = 200;
    var chunks = [];
    for (var i = 0; i < payload.length; i += CHUNK) chunks.push(payload.slice(i, i + CHUNK));

    chunks.reduce(function (p, chunk) {
      return p.then(function () {
        return A.supabase().from('lots').upsert(chunk, { onConflict: 'lot_no' }).select('lot_no')
          .then(function (res) { if (res.error) throw res.error; });
      });
    }, Promise.resolve())
      .then(function () {
        return A.supabase().from('price_imports').insert({
          filename: parsed.filename || book.filename,
          row_count: parsed.rows.length,
          inserted: adds, updated: changed, skipped: parsed.issues.length
        });
      })
      .then(function () {
        showMessage('Published. ' + parsed.rows.length + ' lot(s) are now live in the app.', 'ok');
        resetUpload();
        return refresh();
      })
      .catch(function (err) {
        btn.disabled = false;
        btn.textContent = 'Publish to the app';
        var m = String(err.message || err);
        showMessage('Could not publish: ' + m
          + (m.indexOf('row-level security') !== -1
             ? ' — this account is not an admin. Promote it with the SQL at the bottom of supabase/schema.sql.'
             : ''), 'error');
      });
  }

  function resetUpload() {
    parsed = null; book = null; headerIdx = -1; columns = []; mapping = {};
    $('preview').hidden = true;
    $('mapperWrap').hidden = true;
    $('sheetWrap').hidden = true;
    $('file').value = '';
    $('dropName').textContent = '';
    $('btnPublish').disabled = false;
    $('btnPublish').textContent = 'Publish to the app';
  }

  /* ================= current list ================= */

  function refresh() {
    return A.loadLots().then(function (res) {
      allLots = res.rows;
      var meta = $('lotsMeta');
      if (!allLots.length) {
        meta.textContent = 'No lots yet — upload a price list to get started.';
      } else {
        var newest = allLots.reduce(function (a, l) { return (!a || l.updated_at > a) ? l.updated_at : a; }, null);
        var counts = {};
        allLots.forEach(function (l) { counts[l.status] = (counts[l.status] || 0) + 1; });
        meta.textContent = allLots.length + ' lots — '
          + Object.keys(counts).map(function (k) { return counts[k] + ' ' + k.toLowerCase(); }).join(', ')
          + (res.source === 'cache' ? ' (cached — could not reach Supabase)' : '')
          + '. Last updated ' + when(newest) + '.';
      }
      renderLots();
      return loadImports();
    });
  }

  function renderLots() {
    var q = ($('lotSearch').value || '').trim().toLowerCase();
    var rows = q ? allLots.filter(function (l) {
      return (l.lot_no + ' ' + (l.phase || '') + ' ' + (l.category || '') + ' ' + l.status)
        .toLowerCase().indexOf(q) !== -1;
    }) : allLots;
    table($('lotsTable'), LOT_COLUMNS, rows, q ? 'No lot matches that.' : 'No lots yet.');
  }

  function loadImports() {
    return A.supabase().from('price_imports')
      .select('filename,row_count,inserted,updated,skipped,imported_at')
      .order('imported_at', { ascending: false }).limit(10)
      .then(function (res) {
        table($('importsTable'), [
          { label: 'When',    value: function (r) { return when(r.imported_at); } },
          { label: 'File',    value: function (r) { return r.filename || '—'; } },
          { label: 'Rows',    numeric: true, value: function (r) { return r.row_count; } },
          { label: 'New',     numeric: true, value: function (r) { return r.inserted; } },
          { label: 'Updated', numeric: true, value: function (r) { return r.updated; } },
          { label: 'Rejected', numeric: true, value: function (r) { return r.skipped; } }
        ], res.data || [], 'No imports yet.');
      })
      .catch(function () { /* non-fatal */ });
  }

  /* ================= file handling ================= */

  function useSheet(wb, name, filename) {
    var s = loadSheet(wb, name);
    book = { wb: wb, name: name, filename: filename, grid: s.grid, gridText: s.gridText };

    headerIdx = detectHeader(s.gridText);
    if (headerIdx === -1) {
      $('mapperWrap').hidden = true;
      $('preview').hidden = true;
      showMessage('Could not find a heading row on “' + name + '”. '
        + 'It needs a row naming at least a lot number and a price.', 'error');
      return;
    }

    columns = readColumns(s.gridText, headerIdx);
    var auto = autoMap(columns);
    mapping = auto.map;
    renderMapper(auto.notes);
    refreshPreview();
  }

  function handleFile(f) {
    if (!f) return;
    $('dropName').textContent = f.name;
    showMessage('');

    var reader = new FileReader();
    reader.onload = function (e) {
      var wb;
      try {
        wb = readWorkbook(new Uint8Array(e.target.result), f.name);
      } catch (err) {
        showMessage('Could not read that file: ' + (err.message || err), 'error');
        return;
      }

      var sel = $('sheetSelect');
      sel.textContent = '';
      wb.SheetNames.forEach(function (n) {
        var o = document.createElement('option');
        o.value = n; o.textContent = n;
        sel.appendChild(o);
      });
      $('sheetWrap').hidden = wb.SheetNames.length < 2;
      sel.onchange = function () { useSheet(wb, sel.value, f.name); };

      useSheet(wb, wb.SheetNames[0], f.name);
    };
    reader.onerror = function () { showMessage('Could not read that file.', 'error'); };
    reader.readAsArrayBuffer(f);
  }

  /* ================= auth / boot ================= */

  function showGate() { $('adminGate').hidden = false; $('adminApp').hidden = true; }

  function enterConsole(profile) {
    $('adminGate').hidden = true;
    $('adminApp').hidden = false;
    $('adminWho').textContent = profile.email + (profile.role === 'admin' ? '' : ' (read-only)');
    if (profile.role !== 'admin') {
      showMessage('This account is signed in but is not an admin, so publishing will be refused. '
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
    A.signIn(email, pass).then(function (res) {
      btn.disabled = false;
      if (res.error) { err.textContent = res.error.message; err.hidden = false; return; }
      $('aPass').value = '';
      return A.myProfile().then(enterConsole);
    }).catch(function (ex) {
      btn.disabled = false;
      err.textContent = ex.message || String(ex);
      err.hidden = false;
    });
  }

  function init() {
    if (!A.configured() || !window.supabase) { $('setupWarning').hidden = false; return; }

    $('adminSignIn').addEventListener('submit', handleSignIn);
    $('btnAdminSignOut').addEventListener('click', function () { A.signOut().then(showGate); });
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

  // exposed for the test harness
  window.__adminInternals = {
    readWorkbook: readWorkbook, loadSheet: loadSheet, detectHeader: detectHeader,
    readColumns: readColumns, autoMap: autoMap,
    setState: function (b, h, c, m) { book = b; headerIdx = h; columns = c; mapping = m; },
    extractRows: extractRows
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
