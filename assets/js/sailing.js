(function () {
  var STATE_LABELS = {
    hauled: "Hauled out",
    anchored: "At anchor",
    marina: "In a marina",
    passage: "Underway"
  };

  function fmtDate(dateStr) {
    var d = new Date(dateStr + "T00:00:00Z");
    return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  }

  function fmtPos(pos) {
    if (!pos) return "";
    var lat = pos.lat, lon = pos.lon;
    var ns = lat >= 0 ? "N" : "S";
    var ew = lon >= 0 ? "E" : "W";
    return Math.abs(lat).toFixed(4) + "°" + ns + " " + Math.abs(lon).toFixed(4) + "°" + ew;
  }

  function renderHeader(entry, opts) {
    opts = opts || {};
    var el = document.getElementById("log-detail");
    var stateLabel = STATE_LABELS[entry.state] || entry.state;
    var w = entry.weather || {};
    var b = entry.battery || {};

    var html = "";
    html += '<span class="state-chip">' + stateLabel + "</span>";
    html += '<div class="date-line">' + fmtDate(entry.date) + "</div>";
    html += '<div class="place-line">' + (entry.place || fmtPos(entry.position)) + "</div>";

    if (opts.viewingPast) {
      html += '<div class="viewing-note">Viewing a past entry.<a href="#" id="back-to-latest">Back to latest ↺</a></div>';
    }

    if (entry.note) {
      html += '<p class="log-note">' + entry.note + "</p>";
    }

    if (entry.weather.notable) {
      html += '<div class="notable">' + entry.weather.notable + "</div>";
    }

    html += '<div class="stat-grid">';
    if (typeof w.avgWindKt === "number") {
      html += '<div class="stat"><span class="label">Avg wind</span><span class="value">' + w.avgWindKt.toFixed(1) + " kt</span></div>";
    }
    if (typeof w.maxGustKt === "number") {
      html += '<div class="stat"><span class="label">Max gust</span><span class="value">' + w.maxGustKt.toFixed(1) + " kt</span></div>";
    }
    if (typeof w.minTempC === "number" && typeof w.maxTempC === "number") {
      html += '<div class="stat"><span class="label">Temp</span><span class="value">' + Math.round(w.minTempC) + "–" + Math.round(w.maxTempC) + "°C</span></div>";
    }
    if (typeof w.rainMm === "number") {
      html += '<div class="stat"><span class="label">Rain</span><span class="value">' + w.rainMm.toFixed(1) + " mm</span></div>";
    }
    if (typeof entry.logNm === "number") {
      html += '<div class="stat"><span class="label">Log</span><span class="value">' + entry.logNm.toFixed(1) + " nm</span></div>";
    }
    if (typeof b.socPercent === "number") {
      html += '<div class="stat"><span class="label">Battery</span><span class="value">' + b.socPercent + "%" + (b.solarProducing ? " ☀" : "") + "</span></div>";
    }
    html += "</div>";

    if (entry.photos && entry.photos.length) {
      html += '<div class="photo-grid">';
      entry.photos.forEach(function (p) {
        html += '<img src="' + p.url + '" alt="' + (p.caption || "") + '" loading="lazy" />';
      });
      html += "</div>";
    }

    el.innerHTML = html;

    var backLink = document.getElementById("back-to-latest");
    if (backLink) {
      backLink.addEventListener("click", function (e) {
        e.preventDefault();
        selectEntry(window.__sailingEntries.length - 1);
      });
    }
  }

  function renderTimeline(entries) {
    var el = document.getElementById("timeline");
    el.innerHTML = "";
    // Newest first in the list, so scrolling down goes further into the past.
    for (var i = entries.length - 1; i >= 0; i--) {
      (function (idx) {
        var entry = entries[idx];
        var wrap = document.createElement("div");
        wrap.className = "timeline-entry" + (idx === entries.length - 1 ? " latest" : "");
        wrap.dataset.index = idx;

        var dot = document.createElement("span");
        dot.className = "dot";
        dot.addEventListener("click", function () { selectEntry(idx); });

        var btn = document.createElement("button");
        btn.className = "entry-link";
        btn.innerHTML =
          '<div class="entry-date">' + fmtDate(entry.date) + "</div>" +
          '<div class="entry-summary">' + (entry.place || fmtPos(entry.position)) +
          (entry.weather && entry.weather.notable ? " · " + entry.weather.notable : "") +
          "</div>";
        btn.addEventListener("click", function () { selectEntry(idx); });

        wrap.appendChild(dot);
        wrap.appendChild(btn);
        el.appendChild(wrap);
      })(i);
    }
  }

  function selectEntry(idx) {
    var entries = window.__sailingEntries;
    var entry = entries[idx];
    var isLatest = idx === entries.length - 1;
    renderHeader(entry, { viewingPast: !isLatest });
    document.querySelectorAll(".timeline-entry").forEach(function (el) {
      el.classList.toggle("selected", Number(el.dataset.index) === idx);
    });
    document.getElementById("log-header").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function setNavHeight() {
    var nav = document.querySelector("nav.site-nav");
    if (nav) {
      document.documentElement.style.setProperty("--nav-h", nav.offsetHeight + "px");
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    setNavHeight();
    window.addEventListener("resize", setNavHeight);
    fetch("data/log.json")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        window.__sailingEntries = data.entries || [];
        if (!window.__sailingEntries.length) {
          document.getElementById("log-detail").innerHTML = '<p class="loading">No log entries yet.</p>';
          document.getElementById("timeline").innerHTML = "";
          return;
        }
        renderTimeline(window.__sailingEntries);
        renderHeader(window.__sailingEntries[window.__sailingEntries.length - 1]);
        var latestEl = document.querySelector(".timeline-entry.latest");
        if (latestEl) latestEl.classList.add("selected");
      })
      .catch(function (err) {
        document.getElementById("log-detail").innerHTML = '<p class="loading">Could not load the log.</p>';
        console.error(err);
      });
  });
})();
