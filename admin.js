/* Admin — review & moderate experiences.
 * Access is gated by Supabase Auth. Primary sign-in is email + password
 * (create the user in the Supabase dashboard). A one-time email code is
 * offered as a fallback. Either way the RLS policies only let ONE email
 * address read/modify rows — anyone else who signs in sees nothing.
 */
(function () {
  "use strict";

  var SUPABASE_URL = "https://araavruihkejddppjbft.supabase.co";
  var SUPABASE_KEY = "sb_publishable_JLzNXICOAvDZprQIuX4C9A_2bkxDz2-";
  var PRODUCTION_ORIGIN = "https://youarebadass.ca";

  // If this ever loads from a stray local/dev server, still email a link
  // back to the real site — not to a localhost address nobody can open.
  var isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname)
    || window.location.protocol === "file:";
  var REDIRECT_ORIGIN = isLocalHost ? PRODUCTION_ORIGIN : window.location.origin;

  var loginSec = document.getElementById("login");
  var panelSec = document.getElementById("panel");
  var loginForm = document.getElementById("loginForm");
  var loginEmail = document.getElementById("loginEmail");
  var loginPassword = document.getElementById("loginPassword");
  var loginBtn = document.getElementById("loginBtn");
  var useCodeBtn = document.getElementById("useCode");
  var codeForm = document.getElementById("codeForm");
  var codeEmail = document.getElementById("codeEmail");
  var codeSendBtn = document.getElementById("codeSendBtn");
  var codeVerifyForm = document.getElementById("codeVerifyForm");
  var loginCode = document.getElementById("loginCode");
  var codeBtn = document.getElementById("codeBtn");
  var codeBack = document.getElementById("codeBack");
  var loginMsg = document.getElementById("loginMsg");
  var whoami = document.getElementById("whoami");
  var signOutBtn = document.getElementById("signOut");
  var listState = document.getElementById("listState");
  var table = document.getElementById("table");
  var list = document.getElementById("list");
  var sortDateBtn = document.getElementById("sortDate");
  var sortArrow = document.getElementById("sortArrow");
  var filterStatus = document.getElementById("filterStatus");

  if (!window.supabase || !window.supabase.createClient) {
    listState.hidden = false;
    listState.textContent = "Failed to load the auth library.";
    return;
  }

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  function setMsg(el, text, kind) {
    el.textContent = text || "";
    el.className = "form-msg" + (kind ? " " + kind : "");
  }

  var panelShown = false;

  function showLogin() {
    panelShown = false;
    panelSec.hidden = true;
    loginSec.hidden = false;
    loginForm.hidden = false;
    codeForm.hidden = true;
    codeVerifyForm.hidden = true;
  }

  function showPanel(email) {
    loginSec.hidden = true;
    panelSec.hidden = false;
    whoami.textContent = email || "";
    if (panelShown) return;      // auth events can fire several times
    panelShown = true;
    loadList();
  }

  /* ---------- password sign-in ---------- */
  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = loginEmail.value.trim();
    var password = loginPassword.value;
    if (!email || !password) return;
    loginBtn.disabled = true;
    setMsg(loginMsg, "Signing in…");
    sb.auth.signInWithPassword({ email: email, password: password })
      .then(function (res) {
        if (res.error) setMsg(loginMsg, res.error.message || "Sign-in failed.", "err");
        // success -> onAuthStateChange swaps to the panel
      })
      .catch(function () { setMsg(loginMsg, "Something went wrong. Try again.", "err"); })
      .finally(function () { loginBtn.disabled = false; });
  });

  /* ---------- one-time email code (fallback) ---------- */
  var pendingEmail = "";

  useCodeBtn.addEventListener("click", function () {
    loginForm.hidden = true;
    codeForm.hidden = false;
    codeEmail.value = loginEmail.value.trim();
    codeEmail.focus();
    setMsg(loginMsg, "");
  });

  codeForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = codeEmail.value.trim();
    if (!email) return;
    codeSendBtn.disabled = true;
    setMsg(loginMsg, "Sending…");
    sb.auth.signInWithOtp({
      email: email,
      options: { emailRedirectTo: REDIRECT_ORIGIN + "/admin" }
    }).then(function (res) {
      if (res.error) {
        setMsg(loginMsg, res.error.message || "Couldn't send the code.", "err");
      } else {
        pendingEmail = email;
        codeForm.hidden = true;
        codeVerifyForm.hidden = false;
        loginCode.value = "";
        loginCode.focus();
        setMsg(loginMsg, "Enter the 6-digit code from the email.", "ok");
      }
    }).catch(function () {
      setMsg(loginMsg, "Something went wrong. Try again.", "err");
    }).finally(function () {
      codeSendBtn.disabled = false;
    });
  });

  codeVerifyForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var token = loginCode.value.replace(/\D/g, "");
    if (token.length < 6 || !pendingEmail) return;
    codeBtn.disabled = true;
    setMsg(loginMsg, "Verifying…");
    sb.auth.verifyOtp({ email: pendingEmail, token: token, type: "email" })
      .then(function (res) {
        if (res.error) setMsg(loginMsg, res.error.message || "That code didn't work.", "err");
      })
      .catch(function () { setMsg(loginMsg, "Something went wrong. Try again.", "err"); })
      .finally(function () { codeBtn.disabled = false; });
  });

  codeBack.addEventListener("click", function () {
    pendingEmail = "";
    showLogin();
    setMsg(loginMsg, "");
    loginEmail.focus();
  });

  signOutBtn.addEventListener("click", function () {
    sb.auth.signOut().then(function () { showLogin(); });
  });

  sb.auth.onAuthStateChange(function (_event, session) {
    if (session && session.user) showPanel(session.user.email);
    else showLogin();
  });

  sb.auth.getSession().then(function (res) {
    var session = res.data && res.data.session;
    if (session && session.user) showPanel(session.user.email);
    else showLogin();
  });

  /* ---------- list & moderation ---------- */
  function fmtDate(s) {
    try {
      return new Date(s).toLocaleString([], {
        year: "2-digit", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit"
      });
    } catch (e) { return s || ""; }
  }

  function td(text) {
    var c = document.createElement("td");
    c.textContent = text;
    return c;
  }

  function row(r) {
    var tr = document.createElement("tr");

    tr.appendChild(td(fmtDate(r.created_at)));
    tr.appendChild(td(r.anonymous ? "Anonymous"
      : (r.name && r.name.trim() ? r.name.trim() : "—")));
    tr.appendChild(td(r.rating ? String(r.rating) : "—"));
    tr.appendChild(td(r.status));

    var exp = td(r.experience || "");
    exp.className = "col-exp";
    tr.appendChild(exp);

    var act = document.createElement("td");
    act.className = "col-act";
    act.appendChild(btn("Approve", r.status === "published", function () {
      moderate(r.id, { status: "published", published_at: new Date().toISOString() });
    }));
    act.appendChild(btn("Reject", r.status === "rejected", function () {
      moderate(r.id, { status: "rejected", published_at: null });
    }));
    act.appendChild(btn("Delete", false, function () {
      if (!window.confirm("Delete this experience permanently?")) return;
      remove(r.id);
    }));
    tr.appendChild(act);
    return tr;
  }

  function btn(label, isCurrent, fn) {
    var b = document.createElement("button");
    b.type = "button";
    if (isCurrent) b.disabled = true;
    b.textContent = label;
    b.addEventListener("click", function () {
      b.disabled = true;
      fn();
    });
    return b;
  }

  /* ---------- sort (by date) & filter (by status) ---------- */
  var sortAsc = false; // newest first by default

  function updateSortArrow() {
    sortArrow.innerHTML = sortAsc ? "&#9650;" : "&#9660;";
  }

  if (sortDateBtn) {
    sortDateBtn.addEventListener("click", function () {
      sortAsc = !sortAsc;
      updateSortArrow();
      loadList();
    });
  }
  if (filterStatus) {
    filterStatus.addEventListener("change", loadList);
  }

  var loadSeq = 0;
  var COLS = 6;

  function messageRow(text) {
    var tr = document.createElement("tr");
    tr.className = "admin-empty-row";
    var c = document.createElement("td");
    c.colSpan = COLS;
    c.textContent = text;
    tr.appendChild(c);
    return tr;
  }

  function loadList() {
    var seq = ++loadSeq;
    var status = filterStatus ? filterStatus.value : "";

    // keep the header (with the sort/filter controls) visible throughout,
    // so a filter that matches nothing never traps you behind it
    listState.hidden = true;
    table.hidden = false;
    list.textContent = "";
    list.appendChild(messageRow("Loading…"));

    var query = sb.from("experiences")
      .select("id,created_at,name,email,experience,rating,anonymous,status,published_at");
    if (status) query = query.eq("status", status);
    query = query.order("created_at", { ascending: sortAsc });

    query.then(function (res) {
      if (seq !== loadSeq) return;   // a newer load started; drop this result
      list.textContent = "";
      if (res.error) {
        list.appendChild(messageRow("Couldn't load (" + res.error.message + ")."));
        return;
      }
      var rows = res.data || [];
      if (!rows.length) {
        list.appendChild(messageRow(
          status ? "No " + status + " experiences. Change the filter above to see more."
                 : "No experiences yet."
        ));
        return;
      }
      var frag = document.createDocumentFragment();
      rows.forEach(function (r) { frag.appendChild(row(r)); });
      list.appendChild(frag);
    });
  }

  function moderate(id, patch) {
    sb.from("experiences").update(patch).eq("id", id).then(function (res) {
      if (res.error) alert("Update failed: " + res.error.message);
      loadList();
    });
  }

  function remove(id) {
    sb.from("experiences").delete().eq("id", id).then(function (res) {
      if (res.error) alert("Delete failed: " + res.error.message);
      loadList();
    });
  }
})();
