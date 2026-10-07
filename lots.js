/* Anyara Hills — shared Supabase client, session helpers and the lot cache.
 *
 * The gallery needs this to work with the Wi-Fi off, so every successful lot
 * fetch is mirrored into localStorage and served from there when the network
 * is unreachable. Pricing is only ever cached after a successful sign-in.
 */
window.Anyara = (function () {
  'use strict';

  var LOTS_CACHE_KEY = 'anyara.lots.v1';
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
      return sb.from('profiles').select('id,email,full_name,role').eq('id', user.id).single()
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

  return {
    configured: configured,
    supabase: supabase,
    signIn: signIn,
    signOut: signOut,
    currentSession: currentSession,
    updatePassword: updatePassword,
    myProfile: myProfile,
    loadLots: loadLots,
    readCache: readCache,
    clearCache: clearCache
  };
})();
