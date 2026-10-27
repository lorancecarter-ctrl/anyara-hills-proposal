/* Anyara Hills — FAQ editor (admin console).
 *
 * Same shape as the conversation-question editor: everything saves on blur,
 * nothing hides behind a Save button. Answers are long, so they get an
 * auto-growing textarea rather than a single-line field.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var A = window.Anyara;
  var items = [];          // flat, ordered by category_order then sort_order

  function setState(text, kind) {
    var el = $('faqState');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'save-state' + (kind ? ' is-' + kind : '');
  }

  function message(text, kind) {
    var el = $('faqMsg');
    if (!el) return;
    el.textContent = '';
    if (!text) return;
    var box = document.createElement('div');
    box.className = 'msg ' + (kind === 'error' ? 'msg-error' : kind === 'warn' ? 'msg-warn' : 'msg-ok');
    box.textContent = text;
    el.appendChild(box);
  }

  function track(p, okText) {
    setState('Saving…', 'saving');
    return p.then(function (res) {
      if (res && res.error) throw res.error;
      setState(okText || 'Saved', 'ok');
      return res;
    }).catch(function (err) {
      setState('Not saved', 'error');
      message('Could not save: ' + (err.message || err)
        + (/row-level security/i.test(String(err.message)) ? ' — this account is not an admin.' : ''), 'error');
      throw err;
    });
  }

  /* ---------------- load ---------------- */

  function load() {
    setState('Loading…');
    return A.supabase()
      .from('faq_items')
      .select('id,category,category_order,question,answer,sort_order,active')
      .order('category_order', { ascending: true })
      .order('sort_order', { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        items = res.data || [];
        setState('');
        render();
      })
      .catch(function (err) {
        setState('');
        message('Could not load the FAQ: ' + (err.message || err), 'error');
      });
  }

  function categories() {
    var seen = {}, out = [];
    items.forEach(function (it) {
      if (!seen[it.category]) {
        seen[it.category] = 1;
        out.push({ name: it.category, order: it.category_order });
      }
    });
    out.sort(function (a, b) { return a.order - b.order; });
    return out;
  }

  function inCategory(name) {
    return items.filter(function (it) { return it.category === name; });
  }

  function nextOrder(name) {
    var rows = inCategory(name);
    return rows.length ? Math.max.apply(null, rows.map(function (r) { return r.sort_order; })) + 10 : 10;
  }

  function nextCategoryOrder() {
    var cats = categories();
    return cats.length ? Math.max.apply(null, cats.map(function (c) { return c.order; })) + 10 : 10;
  }

  /* ---------------- render ---------------- */

  function mk(label, title, fn, cls) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'tq-btn' + (cls ? ' ' + cls : '');
    b.textContent = label;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', fn);
    return b;
  }

  function render() {
    var wrap = $('faqGroups');
    wrap.textContent = '';

    if (!items.length) {
      var p = document.createElement('p');
      p.className = 'card-fine';
      p.textContent = 'No FAQ entries yet. Add a category to start — until then the app falls back to its built-in set.';
      wrap.appendChild(p);
      return;
    }

    var cats = categories();
    cats.forEach(function (cat, ci) {
      wrap.appendChild(renderCategory(cat, ci, cats));
    });
  }

  function renderCategory(cat, ci, cats) {
    var box = document.createElement('div');
    box.className = 'tq-stage';

    var head = document.createElement('div');
    head.className = 'tq-stage-head';

    var name = document.createElement('input');
    name.type = 'text';
    name.className = 'tq-stage-name';
    name.value = cat.name;
    name.addEventListener('blur', function () {
      var v = name.value.trim();
      if (!v) { name.value = cat.name; return; }
      if (v === cat.name) return;
      var old = cat.name;
      // a category is just a label on its rows — rename them all together
      inCategory(old).forEach(function (it) { it.category = v; });
      cat.name = v;
      track(A.supabase().from('faq_items').update({ category: v }).eq('category', old)).then(render);
    });
    head.appendChild(name);

    var acts = document.createElement('div');
    acts.className = 'tq-stage-actions';
    acts.appendChild(mk('↑', 'Move category up', function () {
      if (ci === 0) return;
      swapCategories(cats[ci], cats[ci - 1]);
    }));
    acts.appendChild(mk('↓', 'Move category down', function () {
      if (ci === cats.length - 1) return;
      swapCategories(cats[ci], cats[ci + 1]);
    }));
    acts.appendChild(mk('×', 'Delete this category and its questions', function () {
      var rows = inCategory(cat.name);
      if (!confirm('Delete the "' + cat.name + '" category and its ' + rows.length
        + ' question' + (rows.length === 1 ? '' : 's') + '? This cannot be undone.')) return;
      track(A.supabase().from('faq_items').delete().eq('category', cat.name)).then(function () {
        items = items.filter(function (it) { return it.category !== cat.name; });
        render();
      });
    }, 'tq-btn-danger'));
    head.appendChild(acts);
    box.appendChild(head);

    var list = document.createElement('div');
    list.className = 'tq-list';
    var rows = inCategory(cat.name);
    rows.forEach(function (it, i) { list.appendChild(renderItem(it, rows, i)); });
    box.appendChild(list);

    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn btn-ghost btn-sm tq-add';
    add.textContent = '+ Add a question';
    add.addEventListener('click', function () {
      track(A.supabase().from('faq_items').insert({
        category: cat.name, category_order: cat.order,
        question: 'New question', answer: 'Answer goes here.',
        sort_order: nextOrder(cat.name)
      }).select('id,category,category_order,question,answer,sort_order,active').single()
      ).then(function (res) {
        items.push(res.data);
        render();
        var qs = document.querySelectorAll('.faq-q-input');
        for (var i = 0; i < qs.length; i++) {
          if (qs[i].dataset.id === res.data.id) { qs[i].focus(); qs[i].select(); break; }
        }
      });
    });
    box.appendChild(add);

    return box;
  }

  function renderItem(it, rows, i) {
    var row = document.createElement('div');
    row.className = 'faq-row' + (it.active ? '' : ' is-off');

    var fields = document.createElement('div');
    fields.className = 'faq-fields';

    var q = document.createElement('input');
    q.type = 'text';
    q.className = 'faq-q-input';
    q.dataset.id = it.id;
    q.value = it.question;
    q.placeholder = 'Question';
    q.addEventListener('blur', function () {
      var v = q.value.trim();
      if (!v) { q.value = it.question; return; }
      if (v === it.question) return;
      it.question = v;
      track(A.supabase().from('faq_items').update({ question: v }).eq('id', it.id));
    });
    fields.appendChild(q);

    var a = document.createElement('textarea');
    a.className = 'faq-a-input';
    a.rows = 2;
    a.value = it.answer;
    a.placeholder = 'Answer';
    var autosize = function () {
      a.style.height = 'auto';
      a.style.height = Math.max(44, a.scrollHeight) + 'px';
    };
    a.addEventListener('input', autosize);
    a.addEventListener('blur', function () {
      var v = a.value.trim();
      if (!v) { a.value = it.answer; autosize(); return; }
      if (v === it.answer) return;
      it.answer = v;
      track(A.supabase().from('faq_items').update({ answer: v }).eq('id', it.id));
    });
    fields.appendChild(a);
    setTimeout(autosize, 0);

    row.appendChild(fields);

    var acts = document.createElement('div');
    acts.className = 'tq-row-actions';
    acts.appendChild(mk(it.active ? '◉' : '○',
      it.active ? 'Hide from advisors' : 'Show to advisors', function () {
        it.active = !it.active;
        track(A.supabase().from('faq_items').update({ active: it.active }).eq('id', it.id)).then(render);
      }));
    acts.appendChild(mk('↑', 'Move up', function () {
      if (i === 0) return;
      swapItems(rows[i], rows[i - 1]);
    }));
    acts.appendChild(mk('↓', 'Move down', function () {
      if (i === rows.length - 1) return;
      swapItems(rows[i], rows[i + 1]);
    }));
    acts.appendChild(mk('×', 'Delete this question', function () {
      if (!confirm('Delete this question?\n\n' + it.question)) return;
      track(A.supabase().from('faq_items').delete().eq('id', it.id)).then(function () {
        items = items.filter(function (x) { return x.id !== it.id; });
        render();
      });
    }, 'tq-btn-danger'));
    row.appendChild(acts);

    return row;
  }

  function swapItems(a, b) {
    var t = a.sort_order; a.sort_order = b.sort_order; b.sort_order = t;
    render();
    track(Promise.all([
      A.supabase().from('faq_items').update({ sort_order: a.sort_order }).eq('id', a.id),
      A.supabase().from('faq_items').update({ sort_order: b.sort_order }).eq('id', b.id)
    ]).then(function (rs) { return rs.filter(function (r) { return r && r.error; })[0] || {}; }));
  }

  function swapCategories(a, b) {
    var t = a.order; a.order = b.order; b.order = t;
    inCategory(a.name).forEach(function (it) { it.category_order = a.order; });
    inCategory(b.name).forEach(function (it) { it.category_order = b.order; });
    render();
    track(Promise.all([
      A.supabase().from('faq_items').update({ category_order: a.order }).eq('category', a.name),
      A.supabase().from('faq_items').update({ category_order: b.order }).eq('category', b.name)
    ]).then(function (rs) { return rs.filter(function (r) { return r && r.error; })[0] || {}; }));
  }

  /* ---------------- boot ---------------- */

  function init() {
    if (!$('faqGroups')) return;

    $('btnFaqReload').addEventListener('click', function () { message(''); load(); });

    $('btnAddFaqCategory').addEventListener('click', function () {
      var name = (prompt('Name for the new FAQ category?') || '').trim();
      if (!name) return;
      // a category only exists through its rows, so create it with a first entry
      track(A.supabase().from('faq_items').insert({
        category: name, category_order: nextCategoryOrder(),
        question: 'New question', answer: 'Answer goes here.', sort_order: 10
      }).select('id,category,category_order,question,answer,sort_order,active').single()
      ).then(function (res) {
        items.push(res.data);
        render();
      });
    });

    window.AnyaraFaqAdmin = { load: load };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
