/* Anyara Hills — conversation question editor.
 *
 * Lives in the admin console. Everything saves on blur rather than behind a
 * Save button: an admin tidying wording should not be able to lose work by
 * navigating away, and every change here is individually reversible.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var A = window.Anyara;
  var stages = [];        // [{ id, name, hint, sort_order, questions: [...] }]
  var busy = 0;

  /* ---------------- status ---------------- */

  function setState(text, kind) {
    var el = $('talkState');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'save-state' + (kind ? ' is-' + kind : '');
  }

  function track(promise, okText) {
    busy++;
    setState('Saving…', 'saving');
    return promise.then(function (res) {
      if (res && res.error) throw res.error;
      busy--;
      if (!busy) setState(okText || 'Saved', 'ok');
      return res;
    }).catch(function (err) {
      busy--;
      setState('Not saved', 'error');
      message('Could not save: ' + (err.message || err)
        + (/row-level security/i.test(String(err.message)) ? ' — this account is not an admin.' : ''), 'error');
      throw err;
    });
  }

  function message(text, kind) {
    var el = $('talkMsg');
    el.textContent = '';
    if (!text) return;
    var box = document.createElement('div');
    box.className = 'msg ' + (kind === 'error' ? 'msg-error' : kind === 'warn' ? 'msg-warn' : 'msg-ok');
    box.textContent = text;
    el.appendChild(box);
  }

  /* ---------------- load ---------------- */

  function load() {
    setState('Loading…');
    return A.supabase()
      .from('talk_stages')
      .select('id,name,hint,sort_order,talk_questions(id,text,sort_order,active)')
      .order('sort_order', { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        stages = (res.data || []).map(function (s) {
          return {
            id: s.id, name: s.name, hint: s.hint || '', sort_order: s.sort_order,
            questions: (s.talk_questions || []).sort(function (a, b) {
              return a.sort_order - b.sort_order;
            })
          };
        });
        setState('');
        render();
      })
      .catch(function (err) {
        setState('');
        message('Could not load the questions: ' + (err.message || err), 'error');
      });
  }

  /* ---------------- helpers ---------------- */

  function nextOrder(list) {
    return list.length ? Math.max.apply(null, list.map(function (x) { return x.sort_order; })) + 10 : 10;
  }

  /* Renumber a whole list in one round trip so order survives a reorder. */
  function persistOrder(table, list) {
    var rows = list.map(function (item, i) {
      item.sort_order = (i + 1) * 10;
      return { id: item.id, sort_order: item.sort_order };
    });
    return track(Promise.all(rows.map(function (r) {
      return A.supabase().from(table).update({ sort_order: r.sort_order }).eq('id', r.id);
    })).then(function (results) {
      var bad = results.filter(function (r) { return r && r.error; })[0];
      return bad || {};
    }));
  }

  function move(list, index, delta) {
    var to = index + delta;
    if (to < 0 || to >= list.length) return false;
    var tmp = list[index];
    list[index] = list[to];
    list[to] = tmp;
    return true;
  }

  function iconButton(label, title, onClick, cls) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'tq-btn' + (cls ? ' ' + cls : '');
    b.textContent = label;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', onClick);
    return b;
  }

  /* ---------------- render ---------------- */

  function render() {
    var wrap = $('talkStages');
    wrap.textContent = '';

    if (!stages.length) {
      var empty = document.createElement('p');
      empty.className = 'card-fine';
      empty.textContent = 'No stages yet. Add one to get started — until then the app falls back to its built-in question set.';
      wrap.appendChild(empty);
      return;
    }

    stages.forEach(function (stage, si) {
      wrap.appendChild(renderStage(stage, si));
    });
  }

  function renderStage(stage, si) {
    var box = document.createElement('div');
    box.className = 'tq-stage';

    /* --- stage header --- */
    var head = document.createElement('div');
    head.className = 'tq-stage-head';

    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'tq-stage-name';
    nameInput.value = stage.name;
    nameInput.placeholder = 'Stage name';
    nameInput.addEventListener('blur', function () {
      var v = nameInput.value.trim();
      if (!v) { nameInput.value = stage.name; return; }
      if (v === stage.name) return;
      stage.name = v;
      track(A.supabase().from('talk_stages').update({ name: v }).eq('id', stage.id));
    });
    head.appendChild(nameInput);

    var actions = document.createElement('div');
    actions.className = 'tq-stage-actions';
    actions.appendChild(iconButton('↑', 'Move stage up', function () {
      if (move(stages, si, -1)) { render(); persistOrder('talk_stages', stages); }
    }));
    actions.appendChild(iconButton('↓', 'Move stage down', function () {
      if (move(stages, si, 1)) { render(); persistOrder('talk_stages', stages); }
    }));
    actions.appendChild(iconButton('×', 'Delete this stage and its questions', function () {
      var n = stage.questions.length;
      if (!confirm('Delete the stage "' + stage.name + '"'
        + (n ? ' and its ' + n + ' question' + (n === 1 ? '' : 's') : '') + '? This cannot be undone.')) return;
      track(A.supabase().from('talk_stages').delete().eq('id', stage.id)).then(function () {
        stages = stages.filter(function (s) { return s.id !== stage.id; });
        render();
      });
    }, 'tq-btn-danger'));
    head.appendChild(actions);
    box.appendChild(head);

    /* --- stage hint --- */
    var hint = document.createElement('input');
    hint.type = 'text';
    hint.className = 'tq-stage-hint';
    hint.value = stage.hint;
    hint.placeholder = 'Optional note shown beside the stage name (e.g. a follow-up line to use)';
    hint.addEventListener('blur', function () {
      var v = hint.value.trim();
      if (v === stage.hint) return;
      stage.hint = v;
      track(A.supabase().from('talk_stages').update({ hint: v || null }).eq('id', stage.id));
    });
    box.appendChild(hint);

    /* --- questions --- */
    var list = document.createElement('div');
    list.className = 'tq-list';
    stage.questions.forEach(function (q, qi) {
      list.appendChild(renderQuestion(stage, q, qi));
    });
    box.appendChild(list);

    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn btn-ghost btn-sm tq-add';
    add.textContent = '+ Add a question';
    add.addEventListener('click', function () {
      var row = { text: '', sort_order: nextOrder(stage.questions), active: true, stage_id: stage.id };
      track(A.supabase().from('talk_questions')
        .insert({ stage_id: stage.id, text: 'New question', sort_order: row.sort_order })
        .select('id,text,sort_order,active').single()
      ).then(function (res) {
        stage.questions.push(res.data);
        render();
        // put the cursor straight into the new row
        var inputs = document.querySelectorAll('.tq-stage .tq-text');
        for (var i = 0; i < inputs.length; i++) {
          if (inputs[i].dataset.id === res.data.id) { inputs[i].focus(); inputs[i].select(); break; }
        }
      });
    });
    box.appendChild(add);

    return box;
  }

  function renderQuestion(stage, q, qi) {
    var row = document.createElement('div');
    row.className = 'tq-row' + (q.active ? '' : ' is-off');

    var text = document.createElement('textarea');
    text.className = 'tq-text';
    text.rows = 1;
    text.value = q.text;
    text.dataset.id = q.id;
    var autosize = function () {
      text.style.height = 'auto';
      text.style.height = Math.max(34, text.scrollHeight) + 'px';
    };
    text.addEventListener('input', autosize);
    text.addEventListener('blur', function () {
      var v = text.value.trim();
      if (!v) { text.value = q.text; autosize(); return; }   // empty is not a valid question
      if (v === q.text) return;
      q.text = v;
      track(A.supabase().from('talk_questions').update({ text: v }).eq('id', q.id));
    });
    row.appendChild(text);
    setTimeout(autosize, 0);

    var actions = document.createElement('div');
    actions.className = 'tq-row-actions';

    actions.appendChild(iconButton(q.active ? '◉' : '○',
      q.active ? 'Hide from advisors without deleting' : 'Show to advisors again', function () {
        q.active = !q.active;
        track(A.supabase().from('talk_questions').update({ active: q.active }).eq('id', q.id))
          .then(render);
      }));

    actions.appendChild(iconButton('↑', 'Move up', function () {
      if (move(stage.questions, qi, -1)) { render(); persistOrder('talk_questions', stage.questions); }
    }));
    actions.appendChild(iconButton('↓', 'Move down', function () {
      if (move(stage.questions, qi, 1)) { render(); persistOrder('talk_questions', stage.questions); }
    }));
    actions.appendChild(iconButton('×', 'Delete this question', function () {
      if (!confirm('Delete this question? This cannot be undone.\n\n' + q.text)) return;
      track(A.supabase().from('talk_questions').delete().eq('id', q.id)).then(function () {
        stage.questions = stage.questions.filter(function (x) { return x.id !== q.id; });
        render();
      });
    }, 'tq-btn-danger'));

    row.appendChild(actions);
    return row;
  }

  /* ---------------- boot ---------------- */

  function init() {
    if (!$('talkStages')) return;

    $('btnTalkReload').addEventListener('click', function () { message(''); load(); });

    $('btnAddStage').addEventListener('click', function () {
      var name = (prompt('Name for the new stage?') || '').trim();
      if (!name) return;
      track(A.supabase().from('talk_stages')
        .insert({ name: name, sort_order: nextOrder(stages) })
        .select('id,name,hint,sort_order').single()
      ).then(function (res) {
        var s = res.data;
        s.hint = s.hint || '';
        s.questions = [];
        stages.push(s);
        render();
      });
    });

    window.AnyaraTalkAdmin = { load: load };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
