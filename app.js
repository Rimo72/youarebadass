/* You Are Badass — front-end logic
 * No inline scripts anywhere (strict CSP). All DB values are rendered
 * with textContent / createElement, never innerHTML, so a malicious
 * submission cannot inject markup or script.
 */
(function () {
  "use strict";

  /* ---------- Google Analytics config (loader is in <head>) ---------- */
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  gtag("js", new Date());
  gtag("config", "G-35XL0X1T4C");

  /* ---------- Supabase (public, read-only anon key) ---------- */
  var SUPABASE_URL = "https://araavruihkejddppjbft.supabase.co";
  var SUPABASE_KEY = "sb_publishable_JLzNXICOAvDZprQIuX4C9A_2bkxDz2-";
  var REST = SUPABASE_URL + "/rest/v1/";
  var HEADERS = {
    apikey: SUPABASE_KEY,
    Authorization: "Bearer " + SUPABASE_KEY
  };

  var MAX_LEN = 2000;
  var MIN_LEN = 10;
  var THROTTLE_MS = 60 * 1000;

  /* ============================ Heart ============================ */
  (function heart() {
    var btn = document.getElementById("heart");
    if (!btn) return;
    var KEY = "yab_liked";
    var liked = false;
    try { liked = localStorage.getItem(KEY) === "1"; } catch (e) {}
    paint();
    btn.addEventListener("click", function () {
      liked = !liked;
      try { localStorage.setItem(KEY, liked ? "1" : "0"); } catch (e) {}
      paint();
    });
    function paint() {
      btn.classList.toggle("liked", liked);
      btn.setAttribute("aria-pressed", liked ? "true" : "false");
    }
  })();

  /* ========================= Carousel ========================= */
  var track = document.getElementById("track");
  var state = document.getElementById("expState");
  var prevBtn = document.getElementById("carPrev");
  var nextBtn = document.getElementById("carNext");

  function starRow(rating) {
    var wrap = document.createElement("div");
    wrap.className = "stars";
    var n = Math.max(0, Math.min(5, parseInt(rating, 10) || 0));
    if (!n) { wrap.hidden = true; return wrap; }
    for (var i = 1; i <= 5; i++) {
      var s = document.createElement("span");
      s.textContent = "★";
      if (i > n) s.className = "off";
      wrap.appendChild(s);
    }
    wrap.setAttribute("aria-label", n + " out of 5");
    return wrap;
  }

  function card(row) {
    var li = document.createElement("li");
    li.className = "car-card";

    li.appendChild(starRow(row.rating));

    var q = document.createElement("blockquote");
    q.textContent = String(row.experience == null ? "" : row.experience);
    li.appendChild(q);

    var who = document.createElement("div");
    who.className = "who";
    var name = row.display_name;
    who.textContent = "— " + (name && String(name).trim() ? String(name).trim() : "Anonymous");
    li.appendChild(who);

    return li;
  }

  function setNavState() {
    if (!track || !prevBtn || !nextBtn) return;
    var max = track.scrollWidth - track.clientWidth - 4;
    prevBtn.disabled = track.scrollLeft <= 4;
    nextBtn.disabled = track.scrollLeft >= max;
  }

  function scrollByCard(dir) {
    if (!track) return;
    var first = track.querySelector(".car-card");
    var step = first ? first.getBoundingClientRect().width + 16 : 320;
    track.scrollBy({ left: dir * step, behavior: "smooth" });
  }

  if (prevBtn) prevBtn.addEventListener("click", function () { scrollByCard(-1); });
  if (nextBtn) nextBtn.addEventListener("click", function () { scrollByCard(1); });
  if (track) track.addEventListener("scroll", setNavState, { passive: true });

  function loadExperiences() {
    if (!track) return;
    var url = REST + "published_experiences" +
      "?select=id,experience,rating,display_name,shown_at" +
      "&order=shown_at.desc&limit=30";

    fetch(url, { headers: HEADERS, method: "GET" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (rows) {
        track.textContent = "";
        if (!Array.isArray(rows) || rows.length === 0) {
          if (state) { state.hidden = false; state.textContent = "No experiences yet — be the first."; }
          if (prevBtn) prevBtn.hidden = true;
          if (nextBtn) nextBtn.hidden = true;
          return;
        }
        if (state) state.hidden = true;
        var frag = document.createDocumentFragment();
        rows.forEach(function (row) { frag.appendChild(card(row)); });
        track.appendChild(frag);
        setNavState();
        startAuto();
      })
      .catch(function () {
        if (state) {
          state.hidden = false;
          state.textContent = "Couldn't load experiences right now.";
        }
      });
  }

  /* gentle auto-advance, pauses on interaction */
  var autoTimer = null;
  function startAuto() {
    if (autoTimer || !track) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    autoTimer = setInterval(function () {
      if (document.hidden) return;
      var max = track.scrollWidth - track.clientWidth - 4;
      if (track.scrollLeft >= max) track.scrollTo({ left: 0, behavior: "smooth" });
      else scrollByCard(1);
    }, 5000);
  }
  function stopAuto() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  }
  if (track) {
    ["pointerdown", "wheel", "touchstart", "focusin"].forEach(function (ev) {
      track.addEventListener(ev, stopAuto, { passive: true });
    });
  }

  /* ========================= Form ========================= */
  var dialog = document.getElementById("expDialog");
  var openBtn = document.getElementById("openForm");
  var form = document.getElementById("expForm");
  var cancelBtn = document.getElementById("cancelForm");
  var submitBtn = document.getElementById("submitForm");
  var msg = document.getElementById("formMsg");
  var starsInput = document.getElementById("starsInput");
  var ratingField = document.getElementById("ratingValue");
  var currentRating = 0;

  function setMsg(text, kind) {
    if (!msg) return;
    msg.textContent = text || "";
    msg.className = "form-msg" + (kind ? " " + kind : "");
  }

  if (openBtn && dialog) {
    openBtn.addEventListener("click", function () {
      setMsg("");
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    });
  }
  if (cancelBtn && dialog) {
    cancelBtn.addEventListener("click", function () { dialog.close(); });
  }

  /* star picker */
  if (starsInput) {
    var stars = Array.prototype.slice.call(starsInput.querySelectorAll(".star"));
    function paintStars(v) {
      stars.forEach(function (s, i) { s.classList.toggle("on", i < v); });
    }
    stars.forEach(function (s, i) {
      s.addEventListener("click", function () {
        currentRating = (currentRating === i + 1) ? 0 : i + 1;
        if (ratingField) ratingField.value = String(currentRating);
        paintStars(currentRating);
      });
      s.addEventListener("mouseenter", function () { paintStars(i + 1); });
    });
    starsInput.addEventListener("mouseleave", function () { paintStars(currentRating); });
  }

  function lastSubmit() {
    try { return parseInt(localStorage.getItem("yab_last_submit"), 10) || 0; } catch (e) { return 0; }
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      setMsg("");

      /* honeypot: real users never fill this */
      if (form.website && form.website.value.trim() !== "") {
        dialog.close();
        return;
      }

      if (Date.now() - lastSubmit() < THROTTLE_MS) {
        setMsg("You just submitted one — give it a minute.", "err");
        return;
      }

      var experience = (form.experience.value || "").trim();
      var name = (form.name.value || "").trim();
      var email = (form.email.value || "").trim();
      var anonymous = !!form.anonymous.checked;

      if (experience.length < MIN_LEN) {
        setMsg("Please write at least " + MIN_LEN + " characters.", "err");
        return;
      }
      if (experience.length > MAX_LEN) {
        setMsg("Keep it under " + MAX_LEN + " characters.", "err");
        return;
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setMsg("That email doesn't look right.", "err");
        return;
      }

      var payload = {
        experience: experience,
        rating: currentRating > 0 ? currentRating : null,
        name: anonymous ? null : (name || null),
        email: email || null,
        anonymous: anonymous
      };

      if (submitBtn) submitBtn.disabled = true;
      setMsg("Sending…");

      fetch(REST + "experiences", {
        method: "POST",
        headers: Object.assign({}, HEADERS, {
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        }),
        body: JSON.stringify(payload)
      })
        .then(function (r) {
          if (r.status === 201 || r.ok) {
            try { localStorage.setItem("yab_last_submit", String(Date.now())); } catch (e) {}
            form.reset();
            currentRating = 0;
            if (ratingField) ratingField.value = "0";
            if (starsInput) {
              starsInput.querySelectorAll(".star").forEach(function (s) { s.classList.remove("on"); });
            }
            setMsg("Thank you! Your experience will show up once it's approved.", "ok");
            setTimeout(function () { if (dialog.open) dialog.close(); }, 1800);
          } else {
            return r.text().then(function () { throw new Error("HTTP " + r.status); });
          }
        })
        .catch(function () {
          setMsg("Something went wrong. Please try again later.", "err");
        })
        .finally(function () {
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  }

  loadExperiences();
})();
