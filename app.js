/* Anyara Hills — Sales Proposal (iPad PWA) */
(function () {
  'use strict';

  var SQFT_PER_ACRE = 43560;
  var STORE_KEY = 'anyara.visit.v1';
  var $ = function (id) { return document.getElementById(id); };

  /* ================= state ================= */

  var blank = function () {
    return {
      guest: '', advisor: '', date: todayISO(),
      lot: '', sf: '', list: '', privilege: '',
      mof: 60, rate: 3.5, tenure: 30, validWeeks: 2,
      privileges: DEFAULT_PRIVILEGES.map(function (p) { return Object.assign({}, p); }),
      privilegesVersion: PRIVILEGES_VERSION,
      notes: '', used: {}
    };
  };

  function samePrivileges(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every(function (p, i) {
      return (p.name || '') === b[i].name
        && (p.detail || '') === b[i].detail
        && (p.value || '') === b[i].value;
    });
  }

  /* A saved visit carries its own copy of the privileges, so a corrected
     default would otherwise never reach an iPad with a visit already open —
     which is how RM30,000 survived the fix. Upgrade an untouched set; leave
     anything the advisor has edited exactly as they left it. */
  function migratePrivileges(s) {
    if (s.privilegesVersion === PRIVILEGES_VERSION) return s;
    var untouched = LEGACY_PRIVILEGE_SETS.some(function (set) {
      return samePrivileges(s.privileges, set);
    });
    if (untouched) {
      s.privileges = DEFAULT_PRIVILEGES.map(function (p) { return Object.assign({}, p); });
    }
    s.privilegesVersion = PRIVILEGES_VERSION;
    return s;
  }

  var state = load();

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return blank();
      var saved = JSON.parse(raw);
      var s = Object.assign(blank(), saved);
      if (!Array.isArray(s.privileges) || !s.privileges.length) s.privileges = blank().privileges;
      if (!s.used || typeof s.used !== 'object') s.used = {};
      // Take the version from the saved data, not from blank(): Object.assign
      // only overwrites keys the save actually has, so a visit written before
      // versioning existed would otherwise inherit the current version and be
      // mistaken for already-migrated.
      s.privilegesVersion = saved.privilegesVersion || 1;
      return migratePrivileges(s);
    } catch (e) { return blank(); }
  }

  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
    }, 220);
  }

  /* ================= formatting ================= */

  var num = function (v) {
    var n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : 0;
  };
  var hasVal = function (v) { return v !== '' && v !== null && v !== undefined && isFinite(parseFloat(v)); };

  function rm(n, dp) {
    if (!isFinite(n)) return '—';
    return 'RM ' + n.toLocaleString('en-MY', {
      minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0
    });
  }
  function sfFmt(n) {
    return n.toLocaleString('en-MY', { maximumFractionDigits: 0 }) + ' sf';
  }
  function longDate(iso) {
    if (!iso) return '—';
    var p = iso.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function addWeeks(iso, w) {
    if (!iso) return '';
    var p = iso.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + w * 7);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* ================= the maths ================= */

  /* Standard amortising instalment: P·r / (1 − (1+r)^−n) */
  function instalment(principal, annualRatePct, years) {
    var n = Math.round(years * 12);
    if (!(principal > 0) || !(n > 0)) return 0;
    var r = annualRatePct / 100 / 12;
    if (r === 0) return principal / n;
    return principal * r / (1 - Math.pow(1 + r, -n));
  }

  function derive() {
    var sf = num(state.sf);
    var list = num(state.list);
    var priv = num(state.privilege);
    var nett = list - priv;
    var mof = num(state.mof);
    var loan = nett * mof / 100;

    return {
      sf: sf,
      acres: sf > 0 ? sf / SQFT_PER_ACRE : 0,
      list: list,
      privilege: priv,
      nett: nett,
      psf: sf > 0 ? nett / sf : 0,
      mof: mof,
      loan: loan,
      down: nett - loan,
      monthly: instalment(loan, num(state.rate), num(state.tenure)),
      expiry: addWeeks(state.date, num(state.validWeeks) || 0)
    };
  }

  /* ================= navigation ================= */

  var scenes = {};
  var current = 'cover';

  function buildRail() {
    var wrap = $('railItems');
    var frag = document.createDocumentFragment();
    var toolSepDone = false;

    SCENES.forEach(function (s) {
      if (s.tool && !toolSepDone) {
        var sep = document.createElement('div');
        sep.className = 'rail-sep';
        frag.appendChild(sep);
        toolSepDone = true;
      }
      var b = document.createElement('button');
      b.className = 'rail-btn' + (s.tool ? ' is-tool' : '');
      b.dataset.goto = s.id;
      b.innerHTML = '<span class="rb-num">' + (s.num || '') + '</span>' +
                    '<span class="rb-lab"></span>';
      b.querySelector('.rb-lab').textContent = s.label;
      frag.appendChild(b);
    });
    wrap.appendChild(frag);
  }

  function go(id) {
    if (!scenes[id]) return;
    if (scenes[current]) scenes[current].classList.remove('is-active');
    scenes[id].classList.add('is-active');
    scenes[id].scrollTop = 0;
    current = id;

    Array.prototype.forEach.call(document.querySelectorAll('.rail-btn'), function (b) {
      b.classList.toggle('is-active', b.dataset.goto === id);
    });

    if (id === 'proposal') renderProposal();
    if (id === 'builder') syncFormFromState();
  }

  /* ================= discovery ================= */

  /* Questions come from Supabase so an admin can edit them; the bundled
     DISCOVERY set is the fallback for an iPad that has never been online.
     Tick keys use the question id where there is one, so renaming or
     reordering a question does not silently move someone's ticks. */
  function buildDiscovery(stages) {
    var wrap = $('discoveryStages');
    wrap.textContent = '';
    (stages || DISCOVERY).forEach(function (st, si) {
      var sec = document.createElement('div');
      sec.className = 'disc-stage';

      var h = document.createElement('div');
      h.className = 'disc-stage-h';
      var b = document.createElement('b');
      b.textContent = st.stage;
      h.appendChild(b);
      if (st.hint) {
        var hint = document.createElement('span');
        hint.textContent = st.hint;
        h.appendChild(hint);
      }
      sec.appendChild(h);

      st.qs.forEach(function (q, qi) {
        var text = (q && typeof q === 'object') ? q.text : q;
        var key = (q && q.id) ? q.id : (si + '.' + qi);
        var row = document.createElement('div');
        row.className = 'disc-q' + (state.used[key] ? ' is-used' : '');
        row.setAttribute('role', 'button');
        row.setAttribute('tabindex', '0');
        row.dataset.key = key;
        row.innerHTML = '<span class="dq-box">✓</span><p></p>';
        row.querySelector('p').textContent = text;

        var toggle = function () {
          if (state.used[key]) delete state.used[key];
          else state.used[key] = 1;
          row.classList.toggle('is-used', !!state.used[key]);
          save();
        };
        row.addEventListener('click', toggle);
        row.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
        });
        sec.appendChild(row);
      });

      wrap.appendChild(sec);
    });
  }

  /* ================= FAQ ================= */

  function buildFaq(filter) {
    var wrap = $('faqList');
    wrap.textContent = '';
    var f = (filter || '').trim().toLowerCase();

    var rows = FAQ.filter(function (item) {
      if (!f) return true;
      return (item.q + ' ' + item.a + ' ' + item.cat).toLowerCase().indexOf(f) !== -1;
    });

    if (!rows.length) {
      var empty = document.createElement('p');
      empty.className = 'faq-empty';
      empty.textContent = 'Nothing matches that. Confirm with your sales manager rather than guessing.';
      wrap.appendChild(empty);
      return;
    }

    var lastCat = null;
    rows.forEach(function (item) {
      if (item.cat !== lastCat) {
        var h = document.createElement('div');
        h.className = 'faq-cat';
        h.textContent = item.cat;
        wrap.appendChild(h);
        lastCat = item.cat;
      }
      var box = document.createElement('div');
      box.className = 'faq-item' + (f ? ' is-open' : '');

      var btn = document.createElement('button');
      btn.className = 'faq-q';
      btn.type = 'button';
      btn.textContent = item.q;

      var ans = document.createElement('div');
      ans.className = 'faq-a';
      ans.textContent = item.a;

      btn.addEventListener('click', function () { box.classList.toggle('is-open'); });
      box.appendChild(btn);
      box.appendChild(ans);
      wrap.appendChild(box);
    });
  }

  function buildQa() {
    var dl = $('qaList');
    QA.forEach(function (pair) {
      var dt = document.createElement('dt');
      dt.textContent = pair[0];
      var dd = document.createElement('dd');
      dd.textContent = pair[1];
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
  }

  /* ================= privileges editor ================= */

  function renderPrivRows() {
    var wrap = $('privRows');
    wrap.textContent = '';

    state.privileges.forEach(function (p, i) {
      var row = document.createElement('div');
      row.className = 'priv-row';

      row.appendChild(privField('Privilege', p.name, function (v) { p.name = v; onChange(); }));
      row.appendChild(privField('Detail', p.detail, function (v) { p.detail = v; onChange(); }));
      row.appendChild(privField('Value', p.value, function (v) { p.value = v; onChange(); }));

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'priv-del';
      del.textContent = '×';
      del.title = 'Remove';
      del.addEventListener('click', function () {
        state.privileges.splice(i, 1);
        renderPrivRows();
        onChange();
      });
      row.appendChild(del);
      wrap.appendChild(row);
    });
  }

  function privField(label, value, onInput) {
    var lab = document.createElement('label');
    lab.appendChild(document.createTextNode(label));
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.value = value || '';
    inp.addEventListener('input', function () { onInput(inp.value); });
    lab.appendChild(inp);
    return lab;
  }

  /* ================= builder wiring ================= */

  var FIELDS = [
    ['fGuest', 'guest'], ['fAdvisor', 'advisor'], ['fDate', 'date'],
    ['fLot', 'lot'], ['fSf', 'sf'], ['fList', 'list'], ['fPrivilege', 'privilege'],
    ['fMof', 'mof'], ['fRate', 'rate'], ['fTenure', 'tenure'], ['fValidWeeks', 'validWeeks']
  ];

  function wireBuilder() {
    FIELDS.forEach(function (pair) {
      var el = $(pair[0]);
      if (!el) return;
      el.addEventListener('input', function () {
        // store the bare number; the separators are display only
        state[pair[1]] = isGrouped(el) ? el.value.replace(/[^0-9.\-]/g, '') : el.value;
        onChange();
      });
      if (isGrouped(el)) {
        el.addEventListener('blur', function () { el.value = groupDigits(state[pair[1]]); });
        el.addEventListener('focus', function () { el.value = state[pair[1]] || ''; });
      }
    });

    $('btnAddPriv').addEventListener('click', function () {
      state.privileges.push({ name: '', detail: '', value: '' });
      renderPrivRows();
      onChange();
    });

    $('btnClearLot').addEventListener('click', function () {
      state.lot = ''; state.sf = ''; state.list = ''; state.privilege = '';
      var sel = $('fLotPick');
      if (sel) sel.value = '';
      syncFormFromState();
      onChange();
    });

    $('fLotPick').addEventListener('change', function () {
      if (this.value) applyLot(this.value);
    });
  }

  /* The money and area fields are text, not number, so they can carry thousand
     separators — a number input refuses to display them. Keep state numeric and
     only ever format what is shown. */
  function groupDigits(v) {
    if (v === '' || v === null || v === undefined) return '';
    var n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    if (!isFinite(n)) return '';
    var parts = String(n).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  function isGrouped(el) { return el && el.classList.contains('js-num'); }

  function syncFormFromState() {
    FIELDS.forEach(function (pair) {
      var el = $(pair[0]);
      if (!el) return;
      var want = isGrouped(el) ? groupDigits(state[pair[1]]) : String(state[pair[1]]);
      // don't reformat under the cursor while they are mid-edit
      if (document.activeElement === el) return;
      if (el.value !== want) el.value = want;
    });
  }

  function renderOutputs() {
    var d = derive();
    $('oAcres').textContent   = d.sf > 0 ? d.acres.toFixed(3) + ' acres' : '—';
    $('oNett').textContent    = hasVal(state.list) ? rm(d.nett) : '—';
    $('oPsf').textContent     = (d.sf > 0 && hasVal(state.list)) ? rm(d.psf) + ' psf' : '—';
    $('oLoan').textContent    = d.loan > 0 ? rm(d.loan) : '—';
    $('oDown').textContent    = d.loan > 0 ? rm(d.down) : '—';
    $('oMonthly').textContent = d.monthly > 0 ? rm(d.monthly) : '—';
    $('oExpiry').textContent  = d.expiry ? longDate(d.expiry) : '—';
  }

  function renderCover() {
    var has = !!(state.guest || '').trim();
    $('coverGuest').hidden = !has;
    if (!has) return;
    $('coverGuestName').textContent = state.guest;
    var bits = [];
    if ((state.advisor || '').trim()) bits.push('with ' + state.advisor);
    if (state.date) bits.push(longDate(state.date));
    $('coverGuestMeta').textContent = bits.join(' · ');
  }

  /* ================= proposal render ================= */

  function renderProposal() {
    var d = derive();
    var dash = '—';
    applyAdvisorContact();   // keep the footer in step with the Advisor field

    $('pGuest').textContent   = state.guest || dash;
    $('pAdvisor').textContent = state.advisor || dash;
    $('pDate').textContent    = longDate(state.date);

    $('pLot').textContent  = state.lot ? ('Lot ' + state.lot) : dash;
    $('pSize').textContent = d.sf > 0
      ? (d.acres.toFixed(3) + ' acres  |  ' + sfFmt(d.sf))
      : dash;
    $('pList').textContent = hasVal(state.list) ? rm(d.list) : dash;
    $('pPriv').textContent = hasVal(state.privilege) && d.privilege > 0 ? '– ' + rm(d.privilege) : dash;
    $('pNett').textContent = hasVal(state.list) ? rm(d.nett) : dash;
    $('pPsf').textContent  = (d.sf > 0 && hasVal(state.list)) ? rm(d.psf) + ' psf' : dash;

    var body = $('pPrivBody');
    body.textContent = '';
    state.privileges
      .filter(function (p) { return (p.name || p.detail || p.value); })
      .forEach(function (p) {
        var tr = document.createElement('tr');
        tr.appendChild(cell(p.name));
        tr.appendChild(cell(p.detail));
        tr.appendChild(cell(p.value, 'ta-r'));
        body.appendChild(tr);
      });

    var nettTxt = hasVal(state.list) ? rm(d.nett) : dash;
    $('pOpt1').textContent = nettTxt;
    $('pOpt2').textContent = nettTxt;

    $('pLoanLabel').textContent = 'Loan Quantum (' + trim(d.mof) + '% Margin of Finance)';
    $('pDownLabel').textContent = 'Down Payment (' + trim(100 - d.mof) + '%)';
    $('pLoan').textContent    = d.loan > 0 ? rm(d.loan) : dash;
    $('pDown').textContent    = d.loan > 0 ? rm(d.down) : dash;
    $('pRate').textContent    = trim(num(state.rate)) + '% p.a.';
    $('pTenure').textContent  = trim(num(state.tenure)) + ' years';
    $('pMonthly').textContent = d.monthly > 0 ? rm(d.monthly) : dash;

    var w = num(state.validWeeks);
    $('pValidity').textContent =
      'This proposal is valid for ' + trim(w) + ' week' + (w === 1 ? '' : 's') +
      ' from your date of visit' +
      (d.expiry ? ' — until ' + longDate(d.expiry) : '') +
      ', unless otherwise extended in writing by Anyara Hills management.';
  }

  function cell(text, cls) {
    var td = document.createElement('td');
    td.textContent = text || '';
    if (cls) td.className = cls;
    return td;
  }
  function trim(n) {
    return (Math.round(n * 100) / 100).toString();
  }

  /* ================= session sheet ================= */

  var SHEET = [['sGuest', 'guest'], ['sAdvisor', 'advisor'], ['sDate', 'date']];

  function openSheet() {
    SHEET.forEach(function (p) { $(p[0]).value = state[p[1]] || ''; });
    $('sheet').hidden = false;
    $('sheetScrim').hidden = false;
  }
  function closeSheet() {
    $('sheet').hidden = true;
    $('sheetScrim').hidden = true;
  }

  function wireSheet() {
    SHEET.forEach(function (p) {
      $(p[0]).addEventListener('input', function () {
        state[p[1]] = $(p[0]).value;
        onChange();
      });
    });
    $('btnSession').addEventListener('click', openSheet);
    $('btnOpenSession').addEventListener('click', openSheet);
    $('btnSheetDone').addEventListener('click', closeSheet);
    $('sheetScrim').addEventListener('click', closeSheet);

    $('btnNewVisit').addEventListener('click', function () {
      if (!confirm('Start a new visit? This clears the guest, the notes and the lot pricing on this iPad.')) return;
      state = blank();
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
      syncFormFromState();
      renderPrivRows();
      $('visitNotes').value = '';
      Array.prototype.forEach.call(document.querySelectorAll('.disc-q'), function (r) {
        r.classList.remove('is-used');
      });
      SHEET.forEach(function (p) { $(p[0]).value = state[p[1]] || ''; });
      onChange();
      closeSheet();
      go('cover');
    });
  }

  /* ================= change fan-out ================= */

  function onChange() {
    renderOutputs();
    renderCover();
    if (current === 'proposal') renderProposal();
    save();
  }

  /* ================= lot picker ================= */

  var lots = [];

  function renderLotPicker(result) {
    lots = result.rows || [];
    var wrap = $('lotPickWrap');
    var sel = $('fLotPick');
    var note = $('lotStatus');

    if (!lots.length) {
      wrap.hidden = true;
      note.hidden = true;
      return;
    }

    sel.textContent = '';
    var blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '— type the figures manually —';
    sel.appendChild(blank);

    lots.forEach(function (l) {
      var o = document.createElement('option');
      o.value = l.lot_no;
      var nett = (l.nett_price !== null && l.nett_price !== undefined)
        ? Number(l.nett_price) : (Number(l.list_price) - Number(l.privilege));
      o.textContent = 'Lot ' + l.lot_no + ' · ' + rm(nett)
        + (l.status && l.status !== 'Available' ? ' · ' + l.status : '');
      if (l.status === 'Sold') o.disabled = true;
      sel.appendChild(o);
    });

    if (state.lot) sel.value = state.lot;
    wrap.hidden = false;

    note.hidden = false;
    note.textContent = lots.length + ' lots loaded'
      + (result.source === 'cache'
          ? ' from this iPad (offline — last synced ' + longDate((result.fetchedAt || '').slice(0, 10)) + ')'
          : ' from the price list');
    note.className = 'lot-status' + (result.source === 'cache' ? ' is-stale' : '');
  }

  function applyLot(lotNo) {
    var l = lots.filter(function (x) { return x.lot_no === lotNo; })[0];
    if (!l) return;
    state.lot = l.lot_no;
    state.sf = String(l.land_size_sf);
    state.list = String(l.list_price);
    state.privilege = String(l.privilege);
    syncFormFromState();
    onChange();
  }

  function loadLots() {
    if (!window.Anyara || !window.Anyara.configured()) return;
    window.Anyara.loadLots().then(renderLotPicker);
  }

  function loadTalk() {
    if (!window.Anyara || !window.Anyara.configured()) return;
    window.Anyara.loadTalk().then(function (res) {
      if (res.stages && res.stages.length) buildDiscovery(res.stages);
    });
  }

  /* The signed-in advisor's own number, printed on their proposals in place of
     the gallery line. Blank falls back to the gallery number. */
  var GALLERY_PHONE = '+6019 660 6511';
  var advisor = { name: '', phone: '' };

  function applyAdvisorContact() {
    var name = $('pAdvisorName');
    var phone = $('pAdvisorPhone');
    if (!name || !phone) return;
    // The Advisor field on this visit is the name the client should see.
    // profiles.full_name is only a fallback — the signup trigger derives it
    // from the email address, so it reads like "lorenztong".
    var shown = (state.advisor || '').trim() || advisor.name || '';
    name.textContent = shown;
    name.hidden = !shown;
    phone.textContent = advisor.phone || GALLERY_PHONE;
  }

  function setupAdvisor(profile) {
    if (!profile) return;
    advisor.phone = profile.phone || '';
    advisor.name = profile.full_name || '';
    var wrap = $('sPhoneWrap'), note = $('sPhoneNote'), input = $('sPhone');
    if (wrap && input) {
      wrap.hidden = false;
      if (note) note.hidden = false;
      input.value = advisor.phone;
    }
    applyAdvisorContact();
  }

  /* Called by auth.js once a Supabase sign-in completes. */
  window.AnyaraApp = {
    onSignedIn: function (profile) {
      setupAdvisor(profile);
      loadLots();
      loadTalk();
    }
  };

  /* ================= boot ================= */

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('.scene'), function (el) {
      scenes[el.dataset.scene] = el;
    });

    buildRail();
    buildDiscovery();
    buildFaq('');
    buildQa();
    renderPrivRows();
    wireBuilder();
    wireSheet();
    syncFormFromState();

    $('visitNotes').value = state.notes || '';
    $('visitNotes').addEventListener('input', function () {
      state.notes = $('visitNotes').value;
      save();
    });

    var phoneEl = $('sPhone');
    if (phoneEl) {
      var phoneTimer = null;
      phoneEl.addEventListener('input', function () {
        advisor.phone = phoneEl.value.trim();
        applyAdvisorContact();
        if (current === 'proposal') renderProposal();
        clearTimeout(phoneTimer);
        phoneTimer = setTimeout(function () {
          if (window.Anyara && window.Anyara.configured()) {
            window.Anyara.saveMyPhone(advisor.phone).catch(function () { /* offline; retries next edit */ });
          }
        }, 700);
      });
    }
    applyAdvisorContact();

    $('faqSearch').addEventListener('input', function () { buildFaq($('faqSearch').value); });
    $('btnPrint').addEventListener('click', function () { window.print(); });

    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-goto]');
      if (t) go(t.dataset.goto);
    });

    onChange();
    go('cover');
    loadLots();
    loadTalk();

    registerServiceWorker();
  }

  /* The shell is served cache-first, so without this a new build sits in the
     cache unused until someone clears website data — the page would load new
     HTML against old JS. Reload once when a new worker takes over. */
  /* Ask the active worker which build it is serving. Guessing at stale caches
     has cost more time on this project than any actual bug. */
  function showVersion() {
    var el = $('appVersion');
    if (!el) return;
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
      el.textContent = 'live (no offline cache)';
      return;
    }
    var ch = new MessageChannel();
    var done = false;
    ch.port1.onmessage = function (e) {
      done = true;
      el.textContent = e.data || 'unknown';
    };
    navigator.serviceWorker.controller.postMessage('version', [ch.port2]);
    setTimeout(function () { if (!done) el.textContent = 'unknown'; }, 2000);
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    var reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloading) return;      // guard against a reload loop
      reloading = true;
      location.reload();
    });

    window.addEventListener('load', function () {
      // updateViaCache 'none': GitHub Pages serves sw.js with max-age=600, and
      // iOS has been inconsistent about bypassing that when checking for a new
      // worker. This makes the check always hit the network.
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (reg) {
        reg.update();                                  // check on every launch
        setInterval(function () { reg.update(); }, 60 * 60 * 1000);
        setTimeout(showVersion, 400);
      }).catch(function () { /* offline unavailable; the app still runs */ });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
