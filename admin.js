/* Admin — review & moderate experiences.
 * Access is gated by Supabase Auth: a magic link signs you in, and the
 * RLS policies only let ONE email address read/modify rows. Anyone else
 * who signs in sees an empty list and every write is refused.
 */
(function () {
  "use strict";

  var SUPABASE_URL = "https://araavruihkejddppjbft.supabase.co";
  var SUPABASE_KEY = "sb_publishable_JLzNXICOAvDZprQIuX4C9A_2bkxDz2-";

  var loginSec = document.getElementById("login");
  var panelSec = document.getElementById("panel");
  var loginForm = document.getElementById("loginForm");
  var loginEmail = document.getElementById("loginEmail");
  var loginBtn = document.getElementById("loginBtn");
  var loginMsg = document.getElementById("loginMsg");
  var whoami = document.getElementById("whoami");
  var signOutBtn = document.getElementById("signOut");
  var tabPending = document.getElementById("tabPending");
  var tabPublished = document.getElementById("tabPublished");
  var listState = document.getElementById("listState");
  var list = document.getElementById("list");

  if (!window.supabase || !window.supabase.createClient) {
    listState.hidden = false;
    listState.textContent = "Failed to load the auth library.";
    return;
  }

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  var currentTab = "pending";

  function setMsg(el, text, kind) {
    el.textContent = text || "";
    el.className = "form-msg" + (kind ? " " + kind : "");
  }

  function showLogin() {
    panelSec.hidden = true;
    loginSec.hidden = false;
  }

  function showPanel(email) {
    loginSec.hidden = true;
    panelSec.hidden = false;
    whoami.textContent = email || "";
    loadList();
  }

  /* ---------- auth ---------- */
  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = loginEmail.value.trim();
    if (!email) return;
    loginBtn.disabled = true;
    setMsg(loginMsg, "Sending…");
    sb.auth.signInWithOtp({
      email: email,
      options: { emailRedirectTo: window.location.origin + "/admin" }
    }).then(function (res) {
      if (res.error) {
        setMsg(loginMsg, res.error.message || "Couldn't send the link.", "err");
      } else {
        setMsg(loginMsg, "Check your inbox for the sign-in link.", "ok");
      }
    }).catch(function () {
      setMsg(loginMsg, "Something went wrong. Try again.", "err");
    }).finally(function () {
      loginBtn.disabled = false;
    });
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
  tabPending.addEventListener("click", function () { switchTab("pending"); });
  tabPublished.addEventListener("click", function () { switchTab("published"); });

  function switchTab(tab) {
    currentTab = tab;
    tabPending.classList.toggle("is-active", tab === "pending");
    tabPublished.classList.toggle("is-active", tab === "published");
    loadList();
  }

  function fmtDate(s) {
    try { return new Date(s).toLocaleString(); } catch (e) { return s || ""; }
  }

  function row(r) {
    var li = document.createElement("li");
    li.className = "admin-item";

    var meta = document.createElement("div");
    meta.className = "admin-meta";
    var name = r.anonymous ? "Anonymous"
      : (r.name && r.name.trim() ? r.name.trim() : "— no name —");
    var bits = [name];
    if (r.rating) bits.push("★ " + r.rating);
    if (r.email && !r.anonymous) bits.push(r.email);
    bits.push(fmtDate(r.created_at));
    meta.textContent = bits.join("  ·  ");
    li.appendChild(meta);

    var q = document.createElement("blockquote");
    q.textContent = r.experience || "";
    li.appendChild(q);

    var actions = document.createElement("div");
    actions.className = "admin-actions";

    if (r.status !== "published") {
      actions.appendChild(btn("Approve", "ok", function () {
        moderate(r.id, { status: "published", published_at: new Date().toISOString() });
      }));
    }
    if (r.status !== "rejected") {
      actions.appendChild(btn("Reject", "warn", function () {
        moderate(r.id, { status: "rejected" });
      }));
    }
    if (r.status === "published") {
      actions.appendChild(btn("Unpublish", "", function () {
        moderate(r.id, { status: "pending", published_at: null });
      }));
    }
    li.appendChild(actions);
    return li;
  }

  function btn(label, kind, fn) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "btn small" + (kind ? " " + kind : " ghost");
    b.textContent = label;
    b.addEventListener("click", function () {
      b.disabled = true;
      fn();
    });
    return b;
  }

  function loadList() {
    listState.hidden = false;
    listState.textContent = "Loading…";
    list.textContent = "";
    sb.from("experiences")
      .select("id,created_at,name,email,experience,rating,anonymous,status,published_at")
      .eq("status", currentTab)
      .order("created_at", { ascending: currentTab === "pending" })
      .then(function (res) {
        if (res.error) {
          listState.textContent = "Couldn't load (" + res.error.message + ").";
          return;
        }
        var rows = res.data || [];
        if (!rows.length) {
          listState.textContent = currentTab === "pending"
            ? "Nothing waiting. 🎉"
            : "Nothing here yet.";
          return;
        }
        listState.hidden = true;
        var frag = document.createDocumentFragment();
        rows.forEach(function (r) { frag.appendChild(row(r)); });
        list.appendChild(frag);
      });
  }

  function moderate(id, patch) {
    sb.from("experiences").update(patch).eq("id", id).then(function (res) {
      if (res.error) {
        alert("Update failed: " + res.error.message);
        loadList();
      } else {
        loadList();
      }
    });
  }
})();
