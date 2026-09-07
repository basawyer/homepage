(function () {
  var STATE_LABELS = { hauled:"Hauled out", anchored:"At anchor", marina:"In a marina", passage:"Underway" };

  function fmtDate(s) {
    var d = new Date(s + "T00:00:00Z");
    return d.toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric", year:"numeric", timeZone:"UTC" });
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  var entries = [];
  var map, trackLine;
  var markers = [];
  var selected = -1;
  var latestStatus = null;
  var statusLoaded = false;
  var totalTrackNm = null;

  /* Free from https://carto.com/basemaps/apikey/ — no account, 5M tiles/month.
     Left empty, CARTO writes "API KEY REQUIRED" across every tile. */
  var CARTO_KEY = "cb1_2yfx_1_f83f08519bd0d660edd22ef0";

  /* Same harbor / anchorage: consecutive logs within this distance count as one stay */
  var SAME_PLACE_NM = 3;
  var DOT_MIN_PX = 8;
  var DOT_MAX_PX = 28;
  var DOT_CAP_DAYS = 60;

  /* Live data lives in Cloudflare R2 (updated without a Pages deploy). */
  var LOG_URL = "https://pub-e637401be00045af940050b2f0eeaacf.r2.dev/sailing-log.json";
  var STATUS_URL = "https://pub-e637401be00045af940050b2f0eeaacf.r2.dev/boat-status.json";

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
    return new Date().toISOString().slice(0, 10);
  }

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

  /* Initial bearing from a→b in degrees (0 = north, clockwise). */
  function bearingDeg(a, b) {
    var toRad = function(d) { return d * Math.PI / 180; };
    var lat1 = toRad(a[0]);
    var lat2 = toRad(b[0]);
    var dLon = toRad(b[1] - a[1]);
    var y = Math.sin(dLon) * Math.cos(lat2);
    var x = Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  /* Place chevrons along the track so direction of travel is readable. */
  var ARROW_EVERY_NM = 80;
  var ARROW_MIN_SEG_NM = 8;

  function addTrackArrows(coords) {
    var since = 0;
    for (var i = 1; i < coords.length; i++) {
      var a = { lat: coords[i - 1][0], lon: coords[i - 1][1] };
      var b = { lat: coords[i][0], lon: coords[i][1] };
      var seg = distNm(a, b);
      since += seg;
      // Skip harbor hops; place a chevron after ~ARROW_EVERY_NM of travel
      if (seg < ARROW_MIN_SEG_NM || since < ARROW_EVERY_NM) continue;
      since = 0;

      var mid = [(coords[i - 1][0] + coords[i][0]) / 2, (coords[i - 1][1] + coords[i][1]) / 2];
      var deg = bearingDeg(coords[i - 1], coords[i]);
      var icon = L.divIcon({
        className: "track-arrow-wrap",
        html: '<div class="track-arrow" style="transform:rotate(' + deg.toFixed(1) + 'deg)"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });
      L.marker(mid, { icon: icon, interactive: false, keyboard: false, zIndexOffset: -100 }).addTo(map);
    }
  }

  function popupStat(label, value) {
    return '<div class="popup-stat"><span class="label">' + esc(label) +
      '</span><span class="value">' + esc(value) + "</span></div>";
  }

  function popupHtml(e, days) {
    var w = e.weather || {};
    var b = e.battery || {};
    var html = "";
    html += '<div class="popup-date">' + esc(fmtDate(e.date)) + "</div>";
    html += '<div class="popup-place">' + esc(e.place) + "</div>";
    html += '<span class="state-chip">' + esc(STATE_LABELS[e.state] || e.state) + "</span>";
    html += '<div class="popup-stay">' + esc(fmtStay(days)) + "</div>";
    if (e.note) html += '<div class="popup-note">' + esc(e.note) + "</div>";
    if (w.notable) html += '<div class="popup-notable">' + esc(w.notable) + "</div>";

    var stats = "";
    if (typeof w.avgWindKt === "number")
      stats += popupStat("Avg wind", w.avgWindKt.toFixed(1) + " kt");
    if (typeof w.maxGustKt === "number")
      stats += popupStat("Max gust", w.maxGustKt.toFixed(1) + " kt");
    if (typeof w.rainMm === "number")
      stats += popupStat("Rain", w.rainMm.toFixed(1) + " mm");
    if (typeof w.minTempC === "number")
      stats += popupStat("Temp", Math.round(w.minTempC) + "–" + Math.round(w.maxTempC) + "°C");
    if (typeof e.logNm === "number")
      stats += popupStat("Log", e.logNm.toFixed(0) + " nm");
    if (typeof b.socPercent === "number")
      stats += popupStat("Battery", b.socPercent + "%" + (b.solarProducing ? " ☀" : ""));
    if (stats) html += '<div class="popup-stats">' + stats + "</div>";
    return html;
  }

  function setStatus(msg) {
    var el = document.getElementById("map-status");
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = msg;
  }

  function initMap(ents) {
    map = L.map("map", { zoomControl: true, attributionControl: true });

    var tileUrl = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" +
      (CARTO_KEY ? "?key=" + CARTO_KEY : "");

    L.tileLayer(tileUrl, {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19
    }).addTo(map);

    var coords = ents.map(function(e){ return [e.position.lat, e.position.lon]; });
    trackLine = L.polyline(coords, { color: "rgba(76,192,168,0.45)", weight: 2, dashArray: "4 4" }).addTo(map);
    addTrackArrows(coords);

    var dwell = stayDays(ents);

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
      m.bindPopup(popupHtml(e, dwell[i]), { maxWidth: 300 });
      m.on("click", function() { selectEntry(i); });
      m.addTo(map);
      markers.push(m);
    });

    map.fitBounds(trackLine.getBounds(), { padding: [40, 40] });
  }

  function selectEntry(idx) {
    if (idx === selected) {
      markers[idx].openPopup();
      return;
    }
    selected = idx;
    document.querySelectorAll(".map-dot").forEach(function(el) {
      el.classList.toggle("selected", Number(el.dataset.idx) === idx);
    });
    markers[idx].openPopup();
  }

  function trackNm(ents) {
    var total = 0;
    for (var i = 1; i < ents.length; i++) {
      if (!ents[i - 1].position || !ents[i].position) continue;
      total += distNm(ents[i - 1].position, ents[i].position);
    }
    return total;
  }

  function fmtUpdated(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", timeZoneName: "short"
    });
  }

  function renderStatus() {
    var loading = document.getElementById("status-loading");
    var content = document.getElementById("status-content");
    if (!content) return;

    if (!statusLoaded) return;

    if (!latestStatus) {
      if (loading) {
        loading.hidden = false;
        loading.textContent = "Could not load live status.";
      }
      content.hidden = true;
      return;
    }

    var status = latestStatus;
    var wind = status.conditions && typeof status.conditions.windKt === "number"
      ? status.conditions.windKt.toFixed(0) + " kt"
      : "—";
    var temp = status.conditions && typeof status.conditions.tempC === "number"
      ? Math.round(status.conditions.tempC) + "°C"
      : "—";
    var distance = totalTrackNm != null
      ? Math.round(totalTrackNm).toLocaleString("en-US") + " nm"
      : "—";
    var updated = fmtUpdated(status.updatedAt);

    content.innerHTML =
      '<div class="status-place">' + esc(status.place || "Unknown location") + "</div>" +
      '<span class="state-chip">' + esc(STATE_LABELS[status.state] || status.state || "—") + "</span>" +
      (status.activity
        ? '<p class="status-activity">' + esc(status.activity) + "</p>"
        : "") +
      '<div class="status-conditions">' +
        '<div class="status-metric"><span class="label">Wind</span><span class="value">' + esc(wind) + "</span></div>" +
        '<div class="status-metric"><span class="label">Temp</span><span class="value">' + esc(temp) + "</span></div>" +
        '<div class="status-metric"><span class="label">Distance</span><span class="value">' + esc(distance) + "</span></div>" +
      "</div>" +
      (updated ? '<p class="status-updated">Updated ' + esc(updated) + "</p>" : "");

    if (loading) loading.hidden = true;
    content.hidden = false;
  }

  function loadStatus() {
    return fetch(STATUS_URL)
      .then(function(r) {
        if (!r.ok) throw new Error("status HTTP " + r.status);
        return r.json();
      })
      .then(function(status) {
        latestStatus = status;
        statusLoaded = true;
        renderStatus();
      })
      .catch(function(err) {
        console.error(err);
        latestStatus = null;
        statusLoaded = true;
        renderStatus();
      });
  }

  window.addEventListener("load", function() {
    setStatus("Loading log…");
    loadStatus();
    fetch(LOG_URL)
      .then(function(r) {
        if (!r.ok) throw new Error("log HTTP " + r.status);
        return r.json();
      })
      .then(function(data) {
        entries = (data.entries || []).slice();
        if (!entries.length) {
          setStatus("No log entries yet.");
          return;
        }
        totalTrackNm = trackNm(entries);
        renderStatus();
        setStatus("");
        initMap(entries);
        setTimeout(function() { if (map) map.invalidateSize(); }, 0);
      })
      .catch(function(err) {
        setStatus("Could not load the log.");
        console.error(err);
      });
  });
})();
