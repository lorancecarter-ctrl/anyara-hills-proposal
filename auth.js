/* Anyara Hills — sign-in gate.
 *
 * SCOPE, honestly stated: there is no server behind this app. Accounts live in
 * this iPad's localStorage, so they are per-device and anyone with the unlocked
 * device and a debugger can read them. This gate exists to stop a guest picking
 * up an unattended iPad mid-viewing, not to protect the pricing data.
 *
 * Passwords are never stored in the clear — PBKDF2-SHA256 where the browser
 * gives us WebCrypto (HTTPS or localhost), and a salted iterated SHA-256
 * otherwise, since crypto.subtle is absent on a plain-http LAN address.
 */
(function () {
  'use strict';

  var ACCOUNTS_KEY = 'anyara.accounts.v1';
  var SESSION_KEY = 'anyara.session.v1';
  var DEFAULT_PASSWORD = '1234';
  var MIN_LENGTH = 8;
  var PBKDF2_ITERATIONS = 150000;
  var JS_ITERATIONS = 5000;

  var $ = function (id) { return document.getElementById(id); };

  /* ================= SHA-256 (pure JS fallback) ================= */

  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function rotr(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }

  function sha256Bytes(bytes) {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
             0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var len = bytes.length;
    var blocks = Math.ceil((len + 9) / 64);
    var total = blocks * 64;
    var buf = new Uint8Array(total);
    buf.set(bytes);
    buf[len] = 0x80;

    var dv = new DataView(buf.buffer);
    var bits = len * 8;
    dv.setUint32(total - 8, Math.floor(bits / 4294967296), false);
    dv.setUint32(total - 4, bits >>> 0, false);

    var w = new Uint32Array(64);
    for (var i = 0; i < blocks; i++) {
      var off = i * 64;
      for (var t = 0; t < 16; t++) w[t] = dv.getUint32(off + t * 4, false);
      for (t = 16; t < 64; t++) {
        var x = w[t - 15], y = w[t - 2];
        var s0 = (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0;
        var s1 = (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10)) >>> 0;
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
        var ch = ((e & f) ^ (~e & g)) >>> 0;
        var t1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
        var S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
        var maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
        var t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }

    var out = new Uint8Array(32);
    for (i = 0; i < 8; i++) {
      out[i * 4] = (H[i] >>> 24) & 0xff;
      out[i * 4 + 1] = (H[i] >>> 16) & 0xff;
      out[i * 4 + 2] = (H[i] >>> 8) & 0xff;
      out[i * 4 + 3] = H[i] & 0xff;
    }
    return out;
  }

  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var esc = unescape(encodeURIComponent(str));
    var arr = new Uint8Array(esc.length);
    for (var i = 0; i < esc.length; i++) arr[i] = esc.charCodeAt(i);
    return arr;
  }

  function toHex(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return s;
  }

  function randomSalt() {
    var a = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
    else for (var i = 0; i < 16; i++) a[i] = Math.floor(Math.random() * 256);
    return toHex(a);
  }

  /* ================= hashing ================= */

  function hasSubtle() {
    return !!(window.crypto && crypto.subtle && crypto.subtle.importKey);
  }

  function derive(password, salt, algo, iterations) {
    if (algo === 'pbkdf2-sha256') {
      return crypto.subtle
        .importKey('raw', utf8(password), { name: 'PBKDF2' }, false, ['deriveBits'])
        .then(function (key) {
          return crypto.subtle.deriveBits(
            { name: 'PBKDF2', salt: utf8(salt), iterations: iterations, hash: 'SHA-256' },
            key, 256
          );
        })
        .then(function (bits) { return toHex(new Uint8Array(bits)); });
    }
    // salted, iterated SHA-256
    return new Promise(function (resolve) {
      var cur = utf8(salt + ':' + password);
      for (var i = 0; i < iterations; i++) cur = sha256Bytes(cur);
      resolve(toHex(cur));
    });
  }

  function hashPassword(password) {
    var algo = hasSubtle() ? 'pbkdf2-sha256' : 'sha256-iter';
    var iterations = algo === 'pbkdf2-sha256' ? PBKDF2_ITERATIONS : JS_ITERATIONS;
    var salt = randomSalt();
    return derive(password, salt, algo, iterations).then(function (hash) {
      return { algo: algo, salt: salt, iterations: iterations, hash: hash };
    });
  }

  function verifyPassword(password, rec) {
    if (!rec || !rec.hash) return Promise.resolve(false);
    return derive(password, rec.salt, rec.algo, rec.iterations).then(function (hash) {
      // constant-time-ish compare
      if (hash.length !== rec.hash.length) return false;
      var diff = 0;
      for (var i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ rec.hash.charCodeAt(i);
      return diff === 0;
    });
  }

  /* ================= stores ================= */

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

  var accounts = function () { return readJSON(ACCOUNTS_KEY, {}); };
  var saveAccounts = function (a) { writeJSON(ACCOUNTS_KEY, a); };
  var session = function () { return readJSON(SESSION_KEY, null); };
  var saveSession = function (s) { writeJSON(SESSION_KEY, s); };
  var clearSession = function () {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  };

  function normalise(email) { return String(email || '').trim().toLowerCase(); }
  function looksLikeEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

  /* ================= password quality =================
   * Supabase's HaveIBeenPwned check is a Pro-plan feature, so the obvious
   * rubbish is rejected here instead. Not a substitute for a breach database —
   * it just stops the handful of passwords people actually reach for first.
   */

  var COMMON = [
    'password', 'password1', 'password123', 'passw0rd', '12345678', '123456789',
    '1234567890', 'qwertyui', 'qwerty123', 'iloveyou', 'princess', 'football',
    'baseball', 'sunshine', 'trustno1', 'superman', 'whatever', 'welcome1',
    'admin123', 'letmein1', 'abc12345', 'monkey123', 'anyara', 'anyarahills',
    'anyara123', 'khkland', 'goldhill', 'salesteam', 'changeme', 'default1'
  ];

  function passwordProblem(pw, email) {
    if (pw.length < MIN_LENGTH) return 'Use at least ' + MIN_LENGTH + ' characters.';
    if (pw === DEFAULT_PASSWORD) return 'Choose something other than the default password.';

    var low = pw.toLowerCase();
    if (COMMON.indexOf(low) !== -1) return 'That is one of the most commonly used passwords. Choose another.';

    // the project name with trivial padding is the obvious guess here
    if (/^(anyara|khkland|goldhill)\W*\d*$/i.test(pw)) {
      return 'Avoid the project or company name on its own.';
    }

    var local = String(email || '').split('@')[0].toLowerCase();
    if (local && local.length > 2 && low.indexOf(local) !== -1) {
      return 'Do not build the password out of your email address.';
    }

    if (/^(.)\1+$/.test(pw)) return 'That is the same character repeated. Choose another.';
    if (/^(0123456789|1234567890|abcdefgh|qwertyuiop)/i.test(pw)) {
      return 'That is a keyboard or number run. Choose another.';
    }

    // some variety, without demanding a symbol zoo
    var classes = 0;
    if (/[a-z]/.test(pw)) classes++;
    if (/[A-Z]/.test(pw)) classes++;
    if (/[0-9]/.test(pw)) classes++;
    if (/[^A-Za-z0-9]/.test(pw)) classes++;
    if (classes < 2) return 'Mix at least two of: lower case, upper case, numbers, symbols.';

    return null;
  }

  /* ================= UI ================= */

  var pendingEmail = null;

  function showError(id, message) {
    var el = $(id);
    el.textContent = message;
    el.hidden = !message;
  }

  function showPane(which) {
    $('gateSignIn').hidden = which !== 'signin';
    $('gateChange').hidden = which !== 'change';
    $('gate').hidden = false;
    document.body.classList.add('is-locked');
    var focus = which === 'signin' ? 'gEmail' : 'gNew';
    setTimeout(function () { var f = $(focus); if (f) f.focus(); }, 60);
  }

  function enterApp(email) {
    $('gate').hidden = true;
    document.body.classList.remove('is-locked');
    var who = $('sessionWho');
    if (who) who.textContent = email;
    var out = $('btnSignOut');
    if (out) out.hidden = false;
  }

  function startChange(email, firstTime) {
    pendingEmail = email;
    $('gNew').value = '';
    $('gConfirm').value = '';
    showError('gChangeErr', '');
    $('gChangeLede').textContent = firstTime
      ? 'This account is still on the default password. Set your own before you continue.'
      : 'Set a new password for this account.';
    showPane('change');
  }

  function handleSignIn(e) {
    e.preventDefault();
    var email = normalise($('gEmail').value);
    var password = $('gPass').value;
    showError('gErr', '');

    if (!looksLikeEmail(email)) { showError('gErr', 'Enter a valid email address.'); return; }
    if (!password) { showError('gErr', 'Enter your password.'); return; }

    var all = accounts();
    var rec = all[email];
    var btn = $('gSubmit');
    btn.disabled = true;

    if (!rec) {
      // First sign-in on this iPad: only the default password creates an account.
      if (password !== DEFAULT_PASSWORD) {
        btn.disabled = false;
        showError('gErr', 'No account on this iPad for that address. Sign in with the default password to set one up.');
        return;
      }
      hashPassword(DEFAULT_PASSWORD).then(function (h) {
        all[email] = {
          email: email, algo: h.algo, salt: h.salt, iterations: h.iterations,
          hash: h.hash, mustChange: true, createdAt: new Date().toISOString()
        };
        saveAccounts(all);
        btn.disabled = false;
        $('gPass').value = '';
        startChange(email, true);
      });
      return;
    }

    verifyPassword(password, rec).then(function (ok) {
      btn.disabled = false;
      if (!ok) { showError('gErr', 'That password is not right.'); return; }
      $('gPass').value = '';
      if (rec.mustChange) { startChange(email, true); return; }
      saveSession({ email: email, since: new Date().toISOString() });
      enterApp(email);
    });
  }

  function handleChange(e) {
    e.preventDefault();
    var next = $('gNew').value;
    var confirm = $('gConfirm').value;
    showError('gChangeErr', '');

    var problem = passwordProblem(next, pendingEmail);
    if (problem) { showError('gChangeErr', problem); return; }
    if (next !== confirm) { showError('gChangeErr', 'Those two do not match.'); return; }

    var btn = $('gChangeSubmit');
    btn.disabled = true;

    hashPassword(next).then(function (h) {
      var all = accounts();
      var rec = all[pendingEmail] || { email: pendingEmail, createdAt: new Date().toISOString() };
      rec.algo = h.algo; rec.salt = h.salt; rec.iterations = h.iterations; rec.hash = h.hash;
      rec.mustChange = false;
      rec.updatedAt = new Date().toISOString();
      all[pendingEmail] = rec;
      saveAccounts(all);
      saveSession({ email: pendingEmail, since: new Date().toISOString() });
      btn.disabled = false;
      $('gNew').value = ''; $('gConfirm').value = '';
      enterApp(pendingEmail);
      pendingEmail = null;
    });
  }

  function signOut() {
    clearSession();
    $('gEmail').value = '';
    $('gPass').value = '';
    showError('gErr', '');
    showPane('signin');
  }

  /* ================= Supabase mode =================
   * Used whenever config.js is filled in. Accounts then live on the server, so
   * one login works on every iPad and can be revoked centrally. Without config
   * we fall back to the device-local store above, so the app still runs.
   */

  function remoteEnabled() {
    return !!(window.Anyara && window.Anyara.configured() && window.Anyara.supabase());
  }

  function remoteSignIn(e) {
    e.preventDefault();
    var email = normalise($('gEmail').value);
    var password = $('gPass').value;
    showError('gErr', '');

    if (!looksLikeEmail(email)) { showError('gErr', 'Enter a valid email address.'); return; }
    if (!password) { showError('gErr', 'Enter your password.'); return; }

    var btn = $('gSubmit');
    btn.disabled = true;

    window.Anyara.signIn(email, password).then(function (res) {
      btn.disabled = false;
      if (res.error) {
        showError('gErr', /Invalid login/i.test(res.error.message)
          ? 'That email and password do not match an account.'
          : res.error.message);
        return;
      }
      $('gPass').value = '';
      return afterRemoteAuth();
    }).catch(function (ex) {
      btn.disabled = false;
      showError('gErr', ex.message || String(ex));
    });
  }

  function afterRemoteAuth() {
    return window.Anyara.myProfile().then(function (profile) {
      if (!profile) { showPane('signin'); return; }
      pendingEmail = profile.email;
      if (profile.must_change_password) {
        $('gNew').value = ''; $('gConfirm').value = '';
        showError('gChangeErr', '');
        $('gChangeLede').textContent =
          'This account is still on the password your admin set. Choose your own before you continue.';
        showPane('change');
        return;
      }
      enterApp(profile.email);
      if (window.AnyaraApp && window.AnyaraApp.onSignedIn) window.AnyaraApp.onSignedIn(profile);
    });
  }

  function remoteChange(e) {
    e.preventDefault();
    var next = $('gNew').value;
    var confirm = $('gConfirm').value;
    showError('gChangeErr', '');

    var problem = passwordProblem(next, pendingEmail);
    if (problem) { showError('gChangeErr', problem); return; }
    if (next !== confirm) { showError('gChangeErr', 'Those two do not match.'); return; }

    var btn = $('gChangeSubmit');
    btn.disabled = true;

    window.Anyara.updatePassword(next).then(function (res) {
      if (res.error) throw res.error;
      var sb = window.Anyara.supabase();
      return sb.auth.getUser().then(function (u) {
        return sb.from('profiles')
          .update({ must_change_password: false })
          .eq('id', u.data.user.id);
      });
    }).then(function () {
      btn.disabled = false;
      $('gNew').value = ''; $('gConfirm').value = '';
      enterApp(pendingEmail);
      if (window.AnyaraApp && window.AnyaraApp.onSignedIn) {
        window.AnyaraApp.onSignedIn({ email: pendingEmail });
      }
    }).catch(function (ex) {
      btn.disabled = false;
      showError('gChangeErr', ex.message || String(ex));
    });
  }

  function remoteSignOut() {
    window.Anyara.signOut().then(function () {
      $('gEmail').value = ''; $('gPass').value = '';
      showError('gErr', '');
      showPane('signin');
    });
  }

  /* ================= boot ================= */

  function init() {
    var remote = remoteEnabled();

    $('gateSignIn').addEventListener('submit', remote ? remoteSignIn : handleSignIn);
    $('gateChange').addEventListener('submit', remote ? remoteChange : handleChange);

    var out = $('btnSignOut');
    if (out) out.addEventListener('click', remote ? remoteSignOut : signOut);

    var hint = $('gateModeHint');
    if (hint) {
      hint.textContent = remote
        ? 'Your Anyara Hills account works on any gallery iPad.'
        : 'First time on this iPad? Sign in with the default password your sales manager gave you — you’ll be asked to set your own straight away.';
    }

    if (remote) {
      window.Anyara.currentSession().then(function (s) {
        if (!s) { showPane('signin'); return; }
        return afterRemoteAuth();
      }).catch(function () { showPane('signin'); });
      return;
    }

    var s = session();
    var rec = s ? accounts()[s.email] : null;

    if (s && rec && !rec.mustChange) {
      enterApp(s.email);
    } else if (s && rec && rec.mustChange) {
      startChange(s.email, true);
    } else {
      clearSession();
      showPane('signin');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
