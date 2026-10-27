/* Anyara Hills — gallery photo manager (admin console).
 *
 * Uploads go through Anyara.uploadPhoto, which downscales in the browser
 * first. Originals off a phone are several MB each and would make the gallery
 * unusable over the sales-gallery Wi-Fi.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var A = window.Anyara;
  var photos = [];          // flat, ordered
  var DEFAULT_ALBUM = 'The Estate';

  function setState(text, kind) {
    var el = $('galState');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'save-state' + (kind ? ' is-' + kind : '');
  }

  function message(text, kind) {
    var el = $('galMsg');
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
      .from('gallery_photos')
      .select('id,path,caption,album,sort_order,active,width,height,bytes')
      .order('album', { ascending: true })
      .order('sort_order', { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        photos = res.data || [];
        setState('');
        render();
      })
      .catch(function (err) {
        setState('');
        message('Could not load the gallery: ' + (err.message || err), 'error');
      });
  }

  function albumNames() {
    var seen = {}, out = [];
    photos.forEach(function (p) { if (!seen[p.album]) { seen[p.album] = 1; out.push(p.album); } });
    return out;
  }

  function nextOrder(album) {
    var inAlbum = photos.filter(function (p) { return p.album === album; });
    return inAlbum.length ? Math.max.apply(null, inAlbum.map(function (p) { return p.sort_order; })) + 10 : 10;
  }

  /* ---------------- render ---------------- */

  function render() {
    // keep the album suggestions current
    var dl = $('galAlbums');
    dl.textContent = '';
    albumNames().concat([DEFAULT_ALBUM, 'Masterplan', 'Clubhouse', 'Lifestyle', 'Views'])
      .filter(function (v, i, a) { return a.indexOf(v) === i; })
      .forEach(function (name) {
        var o = document.createElement('option');
        o.value = name;
        dl.appendChild(o);
      });

    var wrap = $('galAlbumsWrap');
    wrap.textContent = '';

    if (!photos.length) {
      var p = document.createElement('p');
      p.className = 'card-fine';
      p.textContent = 'No photos yet. Choose an album name, then add photos — they appear in the sales app the next time an iPad is online.';
      wrap.appendChild(p);
      return;
    }

    albumNames().forEach(function (album) {
      var inAlbum = photos.filter(function (p) { return p.album === album; });

      var head = document.createElement('div');
      head.className = 'gal-album-head';
      var title = document.createElement('span');
      title.className = 'gal-album-name';
      title.textContent = album;
      var count = document.createElement('span');
      count.className = 'gal-album-count';
      count.textContent = inAlbum.length + ' photo' + (inAlbum.length === 1 ? '' : 's');
      head.appendChild(title);
      head.appendChild(count);
      wrap.appendChild(head);

      var grid = document.createElement('div');
      grid.className = 'gal-grid';
      inAlbum.forEach(function (photo, i) {
        grid.appendChild(renderPhoto(photo, inAlbum, i));
      });
      wrap.appendChild(grid);
    });
  }

  function renderPhoto(photo, inAlbum, i) {
    var card = document.createElement('div');
    card.className = 'gal-card' + (photo.active ? '' : ' is-off');

    var img = document.createElement('img');
    img.src = A.photoUrl(photo.path);
    img.alt = photo.caption || '';
    img.loading = 'lazy';
    card.appendChild(img);

    var cap = document.createElement('input');
    cap.type = 'text';
    cap.className = 'gal-caption';
    cap.placeholder = 'Caption (optional)';
    cap.value = photo.caption || '';
    cap.addEventListener('blur', function () {
      var v = cap.value.trim();
      if (v === (photo.caption || '')) return;
      photo.caption = v;
      track(A.supabase().from('gallery_photos').update({ caption: v || null }).eq('id', photo.id));
    });
    card.appendChild(cap);

    var bar = document.createElement('div');
    bar.className = 'gal-actions';

    var mk = function (label, title, fn, cls) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tq-btn' + (cls ? ' ' + cls : '');
      b.textContent = label;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.addEventListener('click', fn);
      return b;
    };

    bar.appendChild(mk(photo.active ? '◉' : '○',
      photo.active ? 'Hide from advisors' : 'Show to advisors', function () {
        photo.active = !photo.active;
        track(A.supabase().from('gallery_photos').update({ active: photo.active }).eq('id', photo.id))
          .then(render);
      }));

    bar.appendChild(mk('↑', 'Move earlier', function () {
      if (i === 0) return;
      swapOrder(inAlbum, i, i - 1);
    }));
    bar.appendChild(mk('↓', 'Move later', function () {
      if (i === inAlbum.length - 1) return;
      swapOrder(inAlbum, i, i + 1);
    }));
    bar.appendChild(mk('×', 'Delete this photo', function () {
      if (!confirm('Delete this photo? The file is removed from storage and cannot be recovered.')) return;
      track(A.deletePhoto(photo)).then(function () {
        photos = photos.filter(function (p) { return p.id !== photo.id; });
        render();
      });
    }, 'tq-btn-danger'));

    card.appendChild(bar);
    return card;
  }

  function swapOrder(inAlbum, a, b) {
    var pa = inAlbum[a], pb = inAlbum[b];
    var tmp = pa.sort_order; pa.sort_order = pb.sort_order; pb.sort_order = tmp;
    photos.sort(function (x, y) {
      return x.album === y.album ? x.sort_order - y.sort_order : x.album.localeCompare(y.album);
    });
    render();
    track(Promise.all([
      A.supabase().from('gallery_photos').update({ sort_order: pa.sort_order }).eq('id', pa.id),
      A.supabase().from('gallery_photos').update({ sort_order: pb.sort_order }).eq('id', pb.id)
    ]).then(function (rs) { return rs.filter(function (r) { return r && r.error; })[0] || {}; }));
  }

  /* ---------------- upload ---------------- */

  function humanSize(n) {
    if (!n) return '';
    return n > 1048576 ? (n/1048576).toFixed(1) + ' MB' : Math.round(n/1024) + ' KB';
  }

  function handleFiles(fileList) {
    var files = [].slice.call(fileList).filter(function (f) { return /^image\//.test(f.type); });
    if (!files.length) { message('Those files are not images.', 'error'); return; }

    var album = ($('galAlbum').value || '').trim() || DEFAULT_ALBUM;
    $('galAlbum').value = album;

    var bar = $('galProgress');
    bar.hidden = false;
    message('');

    var done = 0, failed = 0, savedBytes = 0, order = nextOrder(album);

    var step = function (i) {
      if (i >= files.length) {
        bar.textContent = done + ' uploaded'
          + (failed ? ', ' + failed + ' failed' : '')
          + (savedBytes > 0 ? ' · ' + humanSize(savedBytes) + ' saved by resizing' : '');
        setState(failed ? 'Some failed' : 'Saved', failed ? 'error' : 'ok');
        return load();
      }
      var f = files[i];
      bar.textContent = 'Uploading ' + (i + 1) + ' of ' + files.length + ' — ' + f.name;
      setState('Uploading…', 'saving');

      return A.uploadPhoto(f, { album: album, sort_order: order + i * 10 })
        .then(function (res) {
          if (res && res.error) throw res.error;
          done++;
          if (res && res.data && res.data.bytes) savedBytes += Math.max(0, f.size - res.data.bytes);
        })
        .catch(function (err) {
          failed++;
          message('“' + f.name + '” did not upload: ' + (err.message || err)
            + (/row-level security|not an admin/i.test(String(err.message)) ? ' — this account is not an admin.' : ''), 'error');
        })
        .then(function () { return step(i + 1); });
    };

    step(0);
  }

  /* ---------------- boot ---------------- */

  function init() {
    if (!$('galAlbumsWrap')) return;

    $('btnGalPick').addEventListener('click', function () { $('galFiles').click(); });
    $('galFiles').addEventListener('change', function () {
      handleFiles(this.files);
      this.value = '';
    });
    $('btnGalReload').addEventListener('click', function () { message(''); load(); });

    var zone = document.querySelector('.gal-upload');
    ['dragenter', 'dragover'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('is-over'); });
    });
    zone.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    });

    window.AnyaraGalleryAdmin = { load: load };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
