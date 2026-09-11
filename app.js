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

  var MAX_LEN = 250;
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

  /* ===================== Experiences ticker ===================== *
   * One experience at a time; the list scrolls bottom -> top.
   * Each message rests for 5s, then a 2s slide brings up the next.
   */
  var track = document.getElementById("track");
  var ticker = document.getElementById("ticker");
  var state = document.getElementById("expState");

  var HOLD_MS = 5000;
  var SLIDE_MS = 2000;
  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function item(row) {
    var li = document.createElement("li");
    li.className = "ticker-item";

    var q = document.createElement("blockquote");
    q.textContent = "“" + String(row.experience == null ? "" : row.experience) + "”";
    li.appendChild(q);

    var who = document.createElement("div");
    who.className = "who";
    var name = row.display_name;
    name = name && String(name).trim() ? String(name).trim() : "Anonymous";
    who.textContent = "— " + name + " —";
    li.appendChild(who);

    return li;
  }

  var tickTimer = null;
  var idx = 0;
  var tickCount = 0;

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
          if (ticker) ticker.hidden = true;
          return;
        }
        if (state) state.hidden = true;
        if (ticker) ticker.hidden = false;

        var frag = document.createDocumentFragment();
        rows.forEach(function (row) { frag.appendChild(item(row)); });
        // clone the first so the loop back to the top is seamless
        if (rows.length > 1) frag.appendChild(item(rows[0]));
        track.appendChild(frag);

        if (rows.length > 1 && !reduceMotion) startTicker(rows.length);
      })
      .catch(function () {
        if (ticker) ticker.hidden = true;
        if (state) {
          state.hidden = false;
          state.textContent = "Couldn't load experiences right now.";
        }
      });
  }

  function moveTo(n, animate) {
    track.style.transition = animate
      ? ("transform " + (SLIDE_MS / 1000) + "s cubic-bezier(0.45,0,0.15,1)")
      : "none";
    track.style.transform = "translateY(calc(var(--ticker-h) * " + (-n) + "))";
  }

  function startTicker(count) {
    tickCount = count;
    if (tickTimer) return;
    moveTo(idx, false);
    tickTimer = setInterval(function () {
      if (document.hidden) return;
      idx++;
      moveTo(idx, true);
      if (idx === tickCount) {
        // now showing the clone of item 0 — snap back once the slide ends
        window.setTimeout(function () {
          idx = 0;
          moveTo(0, false);
          void track.offsetHeight; // reflow so the next animated move runs
        }, SLIDE_MS + 50);
      }
    }, HOLD_MS + SLIDE_MS);
  }

  function stopTicker() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }

  // pause while a visitor hovers or focuses so they can finish reading, resume after
  if (ticker) {
    ticker.addEventListener("pointerenter", stopTicker);
    ticker.addEventListener("focusin", stopTicker);
    ticker.addEventListener("pointerleave", function () {
      if (tickCount > 1 && !reduceMotion) startTicker(tickCount);
    });
    ticker.addEventListener("focusout", function () {
      if (tickCount > 1 && !reduceMotion) startTicker(tickCount);
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
  var experienceField = document.getElementById("experienceField");
  var charCount = document.getElementById("charCount");
  var currentRating = 0;

  function setMsg(text, kind) {
    if (!msg) return;
    msg.textContent = text || "";
    msg.className = "form-msg" + (kind ? " " + kind : "");
  }

  /* live character counter */
  function updateCharCount() {
    if (!experienceField || !charCount) return;
    var len = experienceField.value.length;
    charCount.textContent = len + " / " + MAX_LEN;
    charCount.classList.toggle("at-limit", len >= MAX_LEN);
    charCount.classList.toggle("near-limit", len >= MAX_LEN * 0.9 && len < MAX_LEN);
  }
  if (experienceField) {
    experienceField.addEventListener("input", updateCharCount);
    updateCharCount();
  }

  if (openBtn && dialog) {
    openBtn.addEventListener("click", function () {
      setMsg("");
      updateCharCount();
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
            updateCharCount();
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
