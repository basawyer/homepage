(function () {
  var STATE_LABELS = { hauled:"Hauled out", anchored:"At anchor", marina:"In a marina", passage:"Underway" };

  function fmtDate(s) {
    var d = new Date(s + "T00:00:00Z");
    return d.toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric", year:"numeric", timeZone:"UTC" });
  }

  var entries = [];
  var map, trackLine;
  var markers = [];   // parallel to entries[]
  var selected = -1;

  /* ── Map setup ─────────────────────────────────────── */
  function initMap(ents) {
    map = L.map("map", { zoomControl: true, attributionControl: true });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19
    }).addTo(map);

    // Track line
    var coords = ents.map(function(e){ return [e.position.lat, e.position.lon]; });
    trackLine = L.polyline(coords, { color: "rgba(79,141,253,0.35)", weight: 2, dashArray: "4 4" }).addTo(map);

    // Markers — one per entry
    ents.forEach(function(e, i) {
      var icon = L.divIcon({
        className: "",
        html: '<div class="map-dot" data-idx="' + i + '"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
        popupAnchor: [0, -10]
      });
      var m = L.marker([e.position.lat, e.position.lon], { icon: icon });
      m.bindPopup(
        '<div class="popup-date">' + fmtDate(e.date) + '</div>' +
        '<div class="popup-place">' + e.place + '</div>'
      );
      m.on("click", function() { selectEntry(i, false); });
      m.addTo(map);
      markers.push(m);
    });

    map.fitBounds(trackLine.getBounds(), { padding: [30, 30] });
  }

  /* ── Entry card ─────────────────────────────────────── */
  function renderCard(e) {
    var w = e.weather || {};
    var b = e.battery || {};
    var html = "";
    html += '<div class="date-line">' + fmtDate(e.date) + "</div>";
    html += '<div class="place-line">' + e.place + "</div>";
    html += '<span class="state-chip">' + (STATE_LABELS[e.state] || e.state) + "</span>";
    if (e.note) html += '<div class="note-line">' + e.note + "</div>";
    if (e.weather && e.weather.notable) html += '<div class="notable">' + e.weather.notable + "</div>";
    html += '<div class="stat-grid">';
    if (typeof w.avgWindKt === "number")
      html += stat("Avg wind", w.avgWindKt.toFixed(1) + " kt");
    if (typeof w.maxGustKt === "number")
      html += stat("Max gust", w.maxGustKt.toFixed(1) + " kt");
    if (typeof w.rainMm === "number")
      html += stat("Rain", w.rainMm.toFixed(1) + " mm");
    if (typeof w.minTempC === "number")
      html += stat("Temp", Math.round(w.minTempC) + "–" + Math.round(w.maxTempC) + "°C");
    if (typeof e.logNm === "number")
      html += stat("Log", e.logNm.toFixed(0) + " nm");
    if (typeof b.socPercent === "number")
      html += stat("Battery", b.socPercent + "%" + (b.solarProducing ? " ☀" : ""));
    html += "</div>";
    document.getElementById("entry-content").innerHTML = html;
  }

  function stat(label, value) {
    return '<div class="stat"><span class="label">' + label + '</span><span class="value">' + value + "</span></div>";
  }

  /* ── Timeline ───────────────────────────────────────── */
  function renderTimeline(ents) {
    var el = document.getElementById("timeline");
    el.innerHTML = "";
    // Newest first
    for (var i = ents.length - 1; i >= 0; i--) {
      (function(idx) {
        var e = ents[idx];
        var row = document.createElement("div");
        row.className = "timeline-entry" + (idx === ents.length - 1 ? " latest" : "");
        row.dataset.idx = idx;
        row.innerHTML =
          '<span class="dot"></span>' +
          '<div class="entry-date">' + fmtDate(e.date) + "</div>" +
          '<div class="entry-summary">' + e.place + "</div>";
        row.addEventListener("click", function() { selectEntry(idx, true); });
        el.appendChild(row);
      })(i);
    }
  }

  /* ── Selection — the single source of truth ─────────── */
  function selectEntry(idx, flyMap) {
    if (idx === selected) return;
    selected = idx;
    var e = entries[idx];

    // Update card
    renderCard(e);

    // Update timeline highlight + scroll the row into view
    document.querySelectorAll(".timeline-entry").forEach(function(el) {
      el.classList.toggle("selected", Number(el.dataset.idx) === idx);
    });
    var row = document.querySelector('.timeline-entry[data-idx="' + idx + '"]');
    if (row) row.scrollIntoView({ block: "nearest", behavior: "smooth" });

    // Update map markers
    document.querySelectorAll(".map-dot").forEach(function(el) {
      el.classList.toggle("selected", Number(el.dataset.idx) === idx);
    });

    // Pan/fly map
    if (map) {
      var latlng = [e.position.lat, e.position.lon];
      if (flyMap) {
        map.flyTo(latlng, Math.max(map.getZoom(), 9), { duration: 0.8 });
      } else {
        map.panTo(latlng);
      }
      markers[idx].openPopup();
    }
  }

  /* ── Bootstrap ──────────────────────────────────────── */
  window.addEventListener("load", function() {
    fetch("data/log.json")
      .then(function(r) { return r.json(); })
      .then(function(data) {
        entries = (data.entries || []).slice();
        if (!entries.length) {
          document.getElementById("entry-content").innerHTML = '<p class="dim">No log entries yet.</p>';
          return;
        }
        renderTimeline(entries);
        initMap(entries);
        selectEntry(entries.length - 1, false);
        // Mark latest dot selected in timeline
        var latestRow = document.querySelector(".timeline-entry.latest");
        if (latestRow) latestRow.classList.add("selected");
      })
      .catch(function(err) {
        document.getElementById("entry-content").innerHTML = '<p class="dim">Could not load the log.</p>';
        console.error(err);
      });
  });
})();
