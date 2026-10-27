/* Anyara Hills — shared Supabase client, session helpers and the lot cache.
 *
 * The gallery needs this to work with the Wi-Fi off, so every successful lot
 * fetch is mirrored into localStorage and served from there when the network
 * is unreachable. Pricing is only ever cached after a successful sign-in.
 */
window.Anyara = (function () {
  'use strict';

  var LOTS_CACHE_KEY = 'anyara.lots.v1';
  var TALK_CACHE_KEY = 'anyara.talk.v1';
  var cfg = window.ANYARA_CONFIG || {};
  var client = null;

  function configured() {
    return !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  }

  function supabase() {
    if (client) return client;
    if (!configured()) return null;
    if (!window.supabase || !window.supabase.createClient) return null;
    client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'anyara.auth' }
    });
    return client;
  }

  /* ---------------- cache ---------------- */

  function readCache() {
    try {
      var raw = localStorage.getItem(LOTS_CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return (parsed && Array.isArray(parsed.rows)) ? parsed : null;
    } catch (e) { return null; }
  }

  function writeCache(rows) {
    try {
      localStorage.setItem(LOTS_CACHE_KEY, JSON.stringify({
        rows: rows, fetchedAt: new Date().toISOString()
      }));
    } catch (e) { /* quota or private mode — the app still works online */ }
  }

  function clearCache() {
    try { localStorage.removeItem(LOTS_CACHE_KEY); } catch (e) {}
  }

  /* ---------------- auth ---------------- */

  function signIn(email, password) {
    var sb = supabase();
    if (!sb) return Promise.reject(new Error('not-configured'));
    return sb.auth.signInWithPassword({ email: email, password: password });
  }

  function signOut() {
    clearCache();
    var sb = supabase();
    return sb ? sb.auth.signOut() : Promise.resolve();
  }

  function currentSession() {
    var sb = supabase();
    if (!sb) return Promise.resolve(null);
    return sb.auth.getSession().then(function (r) {
      return (r && r.data && r.data.session) ? r.data.session : null;
    });
  }

  /* Sends the reset email. redirectTo must also be listed under
     Authentication → URL Configuration → Redirect URLs, or Supabase refuses it. */
  function resetPassword(email) {
    var sb = supabase();
    if (!sb) return Promise.reject(new Error('not-configured'));
    return sb.auth.resetPasswordForEmail(email, {
      redirectTo: location.origin + location.pathname
    });
  }

  /* An advisor may edit their own profile row; profiles_update_self pins `role`
     so this cannot be used to self-promote. */
  function saveMyPhone(phone) {
    var sb = supabase();
    if (!sb) return Promise.reject(new Error('not-configured'));
    return sb.auth.getUser().then(function (u) {
      if (!u.data.user) throw new Error('not signed in');
      return sb.from('profiles')
        .update({ phone: phone || null })
        .eq('id', u.data.user.id);
    });
  }

  function updatePassword(password) {
    var sb = supabase();
    if (!sb) return Promise.reject(new Error('not-configured'));
    return sb.auth.updateUser({ password: password });
  }

  function myProfile() {
    var sb = supabase();
    if (!sb) return Promise.resolve(null);
    return sb.auth.getUser().then(function (u) {
      var user = u && u.data && u.data.user;
      if (!user) return null;
      return sb.from('profiles').select('id,email,full_name,role,phone,must_change_password').eq('id', user.id).single()
        .then(function (r) { return r.data || { id: user.id, email: user.email, role: 'advisor' }; })
        .catch(function () { return { id: user.id, email: user.email, role: 'advisor' }; });
    });
  }

  /* ---------------- lots ---------------- */

  /* Returns { rows, source: 'network' | 'cache' | 'none', fetchedAt } and never
     rejects — an offline iPad must still show the last known price list. */
  function loadLots() {
    var sb = supabase();
    var cached = readCache();

    if (!sb) {
      return Promise.resolve(cached
        ? { rows: cached.rows, source: 'cache', fetchedAt: cached.fetchedAt }
        : { rows: [], source: 'none', fetchedAt: null });
    }

    return sb.from('lots')
      .select('id,lot_no,phase,land_size_sf,list_price,privilege,nett_price,psf,status,notes,updated_at')
      .order('lot_no', { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        var rows = res.data || [];
        writeCache(rows);
        return { rows: rows, source: 'network', fetchedAt: new Date().toISOString() };
      })
      .catch(function () {
        return cached
          ? { rows: cached.rows, source: 'cache', fetchedAt: cached.fetchedAt }
          : { rows: [], source: 'none', fetchedAt: null };
      });
  }

  /* ---------------- conversation questions ---------------- */

  /* Shaped to match the bundled DISCOVERY constant, so the app renders either
     source identically. Never rejects: an offline iPad falls back to its cache,
     and the caller falls back to the bundled set when there is nothing at all. */
  function loadTalk() {
    var sb = supabase();

    var cached = (function () {
      try {
        var raw = localStorage.getItem(TALK_CACHE_KEY);
        var p = raw ? JSON.parse(raw) : null;
        return (p && Array.isArray(p.stages) && p.stages.length) ? p : null;
      } catch (e) { return null; }
    })();

    var fromCache = function () {
      return cached ? { stages: cached.stages, source: 'cache' } : { stages: [], source: 'none' };
    };

    if (!sb) return Promise.resolve(fromCache());

    return sb.from('talk_stages')
      .select('id,name,hint,sort_order,talk_questions(id,text,sort_order,active)')
      .order('sort_order', { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        var stages = (res.data || []).map(function (s) {
          var qs = (s.talk_questions || [])
            .filter(function (q) { return q.active; })
            .sort(function (a, b) { return a.sort_order - b.sort_order; })
            .map(function (q) { return { id: q.id, text: q.text }; });
          return { id: s.id, stage: s.name, hint: s.hint || '', qs: qs };
        }).filter(function (s) { return s.qs.length; });

        if (!stages.length) return fromCache();
        try {
          localStorage.setItem(TALK_CACHE_KEY, JSON.stringify({
            stages: stages, fetchedAt: new Date().toISOString()
          }));
        } catch (e) { /* quota */ }
        return { stages: stages, source: 'network' };
      })
      .catch(fromCache);
  }

  /* ---------------- faq ---------------- */

  var FAQ_CACHE_KEY = 'anyara.faq.v1';

  /* Returns rows shaped like the bundled FAQ constant ({cat, q, a}) so the app
     renders either source identically. Never rejects. */
  function loadFaq() {
    var sb = supabase();

    var cached = (function () {
      try {
        var raw = localStorage.getItem(FAQ_CACHE_KEY);
        var p = raw ? JSON.parse(raw) : null;
        return (p && Array.isArray(p.rows) && p.rows.length) ? p : null;
      } catch (e) { return null; }
    })();
    var fromCache = function () {
      return cached ? { rows: cached.rows, source: 'cache' } : { rows: [], source: 'none' };
    };

    if (!sb) return Promise.resolve(fromCache());

    return sb.from('faq_items')
      .select('id,category,category_order,question,answer,sort_order,active')
      .eq('active', true)
      .order('category_order', { ascending: true })
      .order('sort_order', { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        var rows = (res.data || []).map(function (r) {
          return { cat: r.category, q: r.question, a: r.answer };
        });
        if (!rows.length) return fromCache();
        try {
          localStorage.setItem(FAQ_CACHE_KEY, JSON.stringify({
            rows: rows, fetchedAt: new Date().toISOString()
          }));
        } catch (e) { /* quota */ }
        return { rows: rows, source: 'network' };
      })
      .catch(fromCache);
  }

  /* ---------------- gallery ---------------- */

  var GALLERY_CACHE_KEY = 'anyara.gallery.v1';
  var GALLERY_BUCKET = 'gallery';

  function photoUrl(path) {
    if (!cfg.SUPABASE_URL || !path) return '';
    return cfg.SUPABASE_URL + '/storage/v1/object/public/' + GALLERY_BUCKET + '/' + path;
  }

  function loadGallery() {
    var sb = supabase();

    var cached = (function () {
      try {
        var raw = localStorage.getItem(GALLERY_CACHE_KEY);
        var p = raw ? JSON.parse(raw) : null;
        return (p && Array.isArray(p.albums) && p.albums.length) ? p : null;
      } catch (e) { return null; }
    })();
    var fromCache = function () {
      return cached ? { albums: cached.albums, source: 'cache' } : { albums: [], source: 'none' };
    };

    if (!sb) return Promise.resolve(fromCache());

    return sb.from('gallery_photos')
      .select('id,path,caption,album,sort_order,active,width,height')
      .eq('active', true)
      .order('album', { ascending: true })
      .order('sort_order', { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        var byAlbum = {};
        var order = [];
        (res.data || []).forEach(function (p) {
          if (!byAlbum[p.album]) { byAlbum[p.album] = []; order.push(p.album); }
          byAlbum[p.album].push({
            id: p.id, caption: p.caption || '', url: photoUrl(p.path),
            width: p.width, height: p.height
          });
        });
        var albums = order.map(function (name) { return { album: name, photos: byAlbum[name] }; });
        if (!albums.length) return fromCache();
        try {
          localStorage.setItem(GALLERY_CACHE_KEY, JSON.stringify({
            albums: albums, fetchedAt: new Date().toISOString()
          }));
        } catch (e) { /* quota */ }
        return { albums: albums, source: 'network' };
      })
      .catch(fromCache);
  }

  /* Advisors upload straight off a phone, so originals run to several MB.
     Downscale in the browser before upload — the gallery has to stay quick
     over gallery Wi-Fi and inside the iPad's offline cache. */
  function prepareImage(file, maxEdge, quality) {
    maxEdge = maxEdge || 2000;
    quality = quality || 0.82;
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, maxEdge / Math.max(w, h));
        var tw = Math.round(w * scale), th = Math.round(h * scale);
        var canvas = document.createElement('canvas');
        canvas.width = tw; canvas.height = th;
        canvas.getContext('2d').drawImage(img, 0, 0, tw, th);
        canvas.toBlob(function (blob) {
          URL.revokeObjectURL(url);
          if (!blob) { reject(new Error('Could not process that image.')); return; }
          // keep the original if shrinking somehow made it larger
          var out = (blob.size < file.size) ? blob : file;
          resolve({ blob: out, width: tw, height: th, bytes: out.size });
        }, 'image/jpeg', quality);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('That file is not an image the browser can read.'));
      };
      img.src = url;
    });
  }

  function uploadPhoto(file, meta) {
    var sb = supabase();
    if (!sb) return Promise.reject(new Error('not-configured'));
    return prepareImage(file).then(function (prepared) {
      var name = (crypto && crypto.randomUUID ? crypto.randomUUID()
                 : String(Date.now()) + Math.random().toString(16).slice(2)) + '.jpg';
      var path = (meta.album || 'misc').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '/' + name;
      return sb.storage.from(GALLERY_BUCKET)
        .upload(path, prepared.blob, { contentType: 'image/jpeg', upsert: false })
        .then(function (res) {
          if (res.error) throw res.error;
          return sb.from('gallery_photos').insert({
            path: path, caption: meta.caption || null, album: meta.album,
            sort_order: meta.sort_order || 100,
            width: prepared.width, height: prepared.height, bytes: prepared.bytes
          }).select('id,path,caption,album,sort_order,active,width,height,bytes').single();
        });
    });
  }

  function deletePhoto(photo) {
    var sb = supabase();
    if (!sb) return Promise.reject(new Error('not-configured'));
    return sb.storage.from(GALLERY_BUCKET).remove([photo.path]).then(function () {
      return sb.from('gallery_photos').delete().eq('id', photo.id);
    });
  }

  return {
    configured: configured,
    loadTalk: loadTalk,
    loadFaq: loadFaq,
    loadGallery: loadGallery,
    photoUrl: photoUrl,
    uploadPhoto: uploadPhoto,
    deletePhoto: deletePhoto,
    supabase: supabase,
    signIn: signIn,
    signOut: signOut,
    currentSession: currentSession,
    resetPassword: resetPassword,
    saveMyPhone: saveMyPhone,
    updatePassword: updatePassword,
    myProfile: myProfile,
    loadLots: loadLots,
    readCache: readCache,
    clearCache: clearCache
  };
})();
