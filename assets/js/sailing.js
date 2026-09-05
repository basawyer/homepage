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

  /* Free from https://carto.com/basemaps/apikey/ — no account, 5M tiles/month.
     Left empty, CARTO writes "API KEY REQUIRED" across every tile. */
  var CARTO_KEY = "cb1_2yfx_1_f83f08519bd0d660edd22ef0";

  /* Same harbor / anchorage: consecutive logs within this distance count as one stay */
  var SAME_PLACE_NM = 3;
  var DOT_MIN_PX = 8;
  var DOT_MAX_PX = 28;
  /* Longest stay that still grows the dot; anything longer is max size */
  var DOT_CAP_DAYS = 60;

  function parseDay(s) {
    return new Date(s + "T00:00:00Z");
  }

  function daysBetween(a, b) {
    return Math.round((parseDay(b) - parseDay(a)) / 86400000);
  }

  function distNm(a, b) {
    var R = 3440.065;
    var toRad = function(d) { return d * Math.PI / 180; };
    var dLat = toRad(b.lat - a.lat);
    var dLon = toRad(b.lon - a.lon);
    var lat1 = toRad(a.lat);
    var lat2 = toRad(b.lat);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function todayISO() {
    var d = new Date();
    return d.toISOString().slice(0, 10);
  }

  /* Days on station for each entry: consecutive logs within SAME_PLACE_NM
     share the span from first log until the next log that left (or today). */
  function stayDays(ents) {
    var days = new Array(ents.length);
    var i = 0;
    while (i < ents.length) {
      var j = i + 1;
      while (j < ents.length && distNm(ents[i].position, ents[j].position) <= SAME_PLACE_NM) {
        j++;
      }
      var leave = j < ents.length ? ents[j].date : todayISO();
      var n = Math.max(1, daysBetween(ents[i].date, leave));
      for (var k = i; k < j; k++) days[k] = n;
      i = j;
    }
    return days;
  }

  function dotSize(days) {
    var t = Math.sqrt(Math.min(days, DOT_CAP_DAYS) / DOT_CAP_DAYS);
    return Math.round(DOT_MIN_PX + t * (DOT_MAX_PX - DOT_MIN_PX));
  }

  function fmtStay(days) {
    if (days < 45) return days + (days === 1 ? " day" : " days") + " here";
    var months = Math.round(days / 30.44);
    if (months < 18) return months + " months here";
    var years = Math.round(days / 365.25);
    return years + (years === 1 ? " year" : " years") + " here";
  }

  /* ── Map setup ─────────────────────────────────────── */
  function initMap(ents) {
    map = L.map("map", { zoomControl: true, attributionControl: true });

    var tileUrl = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" +
      (CARTO_KEY ? "?key=" + CARTO_KEY : "");

    L.tileLayer(tileUrl, {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19
    }).addTo(map);

    // Track line
    var coords = ents.map(function(e){ return [e.position.lat, e.position.lon]; });
    trackLine = L.polyline(coords, { color: "rgba(76,192,168,0.45)", weight: 2, dashArray: "4 4" }).addTo(map);

    var dwell = stayDays(ents);

    // Markers — one per entry, sized by time on station
    ents.forEach(function(e, i) {
      var px = dotSize(dwell[i]);
      var icon = L.divIcon({
        className: "",
        html: '<div class="map-dot" data-idx="' + i + '"></div>',
        iconSize: [px, px],
        iconAnchor: [px / 2, px / 2],
        popupAnchor: [0, -px / 2 - 4]
      });
      var m = L.marker([e.position.lat, e.position.lon], { icon: icon, zIndexOffset: px });
      m.bindPopup(
        '<div class="popup-date">' + fmtDate(e.date) + '</div>' +
        '<div class="popup-place">' + e.place + '</div>' +
        '<div class="popup-stay">' + fmtStay(dwell[i]) + '</div>'
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
