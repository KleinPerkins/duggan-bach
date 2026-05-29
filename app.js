/**
 * Duggan Bachelor Party site — runtime.
 *
 * Features:
 *  1. Load static itinerary.json + render TABBED by day.
 *  2. Live weather (Open-Meteo, no API key, CORS-friendly).
 *  3. Embed 4-day Google Calendar widget scoped to Jul 16-19.
 *  4. Opt-in section: deadline countdown + button + live tallies from
 *     the responses sheet via Google's gviz/tq endpoint (CORS-friendly).
 *  5. Flights section: form button + sheet embed.
 */
(function () {
  "use strict";

  const cfg = window.SITE_CONFIG;
  if (!cfg) { console.error("SITE_CONFIG missing"); return; }

  // ===================================================================
  // Action buttons (static wiring)
  // ===================================================================
  function setHref(id, url, opts = {}) {
    const el = document.getElementById(id);
    if (!el || !url) return;
    el.href = url;
    if (opts.newTab) { el.target = "_blank"; el.rel = "noopener"; }
  }

  setHref("subscribe-btn", cfg.calendarSubscribeUrl, { newTab: true });
  setHref("flight-form-btn", cfg.flightFormUrl, { newTab: true });
  setHref("optin-form-btn", cfg.optinFormUrl, { newTab: true });
  setHref("calendar-public-link", cfg.calendarEmbedUrl, { newTab: true });

  // ===================================================================
  // Flight sheet embed + view button
  // ===================================================================
  (function wireFlights() {
    const embed = document.getElementById("flight-sheet-embed");
    const btn = document.getElementById("flight-sheet-btn");
    const fallback = document.getElementById("flight-fallback");
    if (cfg.flightSheetEmbedUrl) {
      embed.src = cfg.flightSheetEmbedUrl;
      if (btn && cfg.flightSheetViewUrl) {
        btn.href = cfg.flightSheetViewUrl;
        btn.target = "_blank";
        btn.rel = "noopener";
      } else if (btn) btn.style.display = "none";
    } else {
      embed.style.display = "none";
      if (fallback) fallback.hidden = false;
      if (btn) btn.style.display = "none";
    }
  })();

  // ===================================================================
  // 4-day calendar widget — rendered later by renderScheduleGrid() once
  // itinerary.json has loaded (it reuses the same normalized event data).
  // ===================================================================

  // ===================================================================
  // Weather (Open-Meteo)
  // ===================================================================
  (async function loadWeather() {
    const valueEl = document.getElementById("weather-value");
    const subEl = document.getElementById("weather-sub");
    if (!valueEl || !subEl) return;

    // Panama City coords
    const lat = 8.9824, lon = -79.5199;
    const tripStart = new Date("2026-07-16T12:00:00-05:00");
    const tripEnd = new Date("2026-07-19T12:00:00-05:00");
    const now = new Date();
    const msDay = 1000 * 60 * 60 * 24;
    const daysToTrip = Math.ceil((tripStart - now) / msDay);

    // Open-Meteo's standard forecast horizon is ~16 days. If we're outside
    // that window, skip the API call and show climatological averages.
    if (daysToTrip > 14) {
      valueEl.textContent = "~87° / 76°F";
      subEl.textContent = `Typical July · live forecast in ${daysToTrip - 14} days`;
      return;
    }

    valueEl.textContent = "Loading…";
    try {
      const fmt = (d) => d.toISOString().slice(0, 10);
      // If the trip already started, clamp to today.
      const fetchStart = now > tripStart ? fmt(now) : fmt(tripStart);
      const fetchEnd = fmt(tripEnd);
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
        `&timezone=America/Panama&start_date=${fetchStart}&end_date=${fetchEnd}` +
        `&temperature_unit=fahrenheit`;
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const data = await resp.json();
      const d = data.daily;
      if (!d || !d.time || d.time.length === 0) throw new Error("no forecast data");

      const maxTemps = d.temperature_2m_max;
      const minTemps = d.temperature_2m_min;
      const precips = d.precipitation_probability_max;
      const avgMax = Math.round(maxTemps.reduce((a,b) => a+b, 0) / maxTemps.length);
      const avgMin = Math.round(minTemps.reduce((a,b) => a+b, 0) / minTemps.length);
      const maxRain = Math.max(...precips);

      valueEl.textContent = `${avgMax}° / ${avgMin}°F`;
      subEl.textContent = `${d.time.length}-day forecast · ${maxRain}% rain on worst day · live`;
    } catch (err) {
      console.warn("weather load failed:", err);
      valueEl.textContent = "~87° / 76°F";
      subEl.textContent = "Typical July · brief afternoon rain";
    }
  })();

  // ===================================================================
  // Opt-in countdown + tallies
  // ===================================================================
  (function wireOptinCountdown() {
    const el = document.getElementById("optin-countdown");
    if (!el) return;
    const deadline = new Date("2026-07-02T23:59:59-05:00"); // Thu Jul 2 EOD Panama (2 weeks before trip)
    const now = new Date();
    const msDay = 1000 * 60 * 60 * 24;
    const diffDays = Math.ceil((deadline - now) / msDay);
    if (diffDays < 0) {
      el.textContent = "Deadline passed";
      el.classList.add("passed");
    } else if (diffDays === 0) {
      el.textContent = "Last day! Thu Jul 2";
      el.classList.add("urgent");
    } else if (diffDays <= 7) {
      el.textContent = `${diffDays} days left · by Thu Jul 2`;
      el.classList.add("urgent");
    } else {
      el.textContent = `${diffDays} days left · by Thu Jul 2`;
    }
  })();

  (async function loadOptinTallies() {
    const container = document.getElementById("optin-tallies");
    if (!container) return;
    if (!cfg.optinSheetId || !cfg.optinSheetGid) {
      container.innerHTML = `<div class="optin-tally-empty">Tallies will appear here once the opt-in sheet is connected. Use the button above to submit your picks.</div>`;
      return;
    }

    try {
      const rows = await fetchSheetRows(cfg.optinSheetId, cfg.optinSheetGid);
      if (!rows || rows.length === 0) {
        container.innerHTML = `<div class="optin-tally-empty">No opt-ins yet. Be the first — hit "Submit Your Opt-Ins" above.</div>`;
        return;
      }
      container.innerHTML = renderTallies(rows);
    } catch (err) {
      console.warn("opt-in tally load failed:", err);
      container.innerHTML = `<div class="optin-tally-empty">Couldn't load live tallies (${escapeHtml(err.message || "unknown")}). Submit your picks via the button above.</div>`;
    }
  })();

  /**
   * Fetch the linked Google Sheet via gviz/tq endpoint, which sends CORS
   * headers for anyone-with-link sheets. Returns array of row objects keyed
   * by header label. First row treated as headers.
   */
  async function fetchSheetRows(sheetId, gid) {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${gid}`;
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const text = await resp.text();
    // gviz wraps JSON in `google.visualization.Query.setResponse(...)` — strip it
    const m = text.match(/setResponse\(([\s\S]*)\);?\s*$/);
    if (!m) throw new Error("malformed gviz response");
    const data = JSON.parse(m[1]);
    if (data.status === "error") throw new Error(data.errors?.[0]?.detailed_message || "gviz error");
    const cols = data.table.cols.map(c => c.label || c.id || "");
    const rows = data.table.rows.map(r => {
      const obj = {};
      r.c.forEach((cell, i) => {
        obj[cols[i]] = cell ? (cell.f || cell.v) : null;
      });
      return obj;
    });
    return rows;
  }

  function renderTallies(rows) {
    // Map sheet header labels to canonical short labels for the UI.
    // Headers will vary in spelling once you re-link — be tolerant.
    const findCol = (rows, partials) => {
      if (rows.length === 0) return null;
      for (const key of Object.keys(rows[0])) {
        const lk = key.toLowerCase();
        if (partials.every(p => lk.includes(p.toLowerCase()))) return key;
      }
      return null;
    };

    const satCol = findCol(rows, ["saturday", "track"]) || findCol(rows, ["sat", "daytime"]);
    const friCol = findCol(rows, ["friday", "dinner"]);

    const totalResponses = rows.length;
    let html = `<div class="optin-tally-card">
      <h4>Responses</h4>
      <div class="optin-tally-row"><span class="optin-tally-label">Total submitted</span><span class="optin-tally-count">${totalResponses}</span></div>
    </div>`;

    html += renderTallyCard("Saturday daytime", rows, satCol, {
      "Track A": ["track a", "locks"],
      "Track B": ["track b", "shooting"],
      "Track C": ["track c", "golf"],
      "Undecided": ["undecided"],
      "Hotel": ["sleeping", "chill", "hotel"],
    });
    html += renderTallyCard("Friday dinner", rows, friCol, {
      "A · La Barbara": ["option a", "barbara"],
      "B · Fish market": ["option b", "fish", "mercado"],
      "C · Tacos": ["option c", "tacos", "cholula"],
      "Undecided": ["undecided"],
      "Skipping": ["skip"],
    });
    return html;
  }

  function renderTallyCard(title, rows, columnKey, buckets) {
    if (!columnKey) {
      return `<div class="optin-tally-card"><h4>${escapeHtml(title)}</h4><div class="optin-tally-empty" style="padding:8px 0">Column not found in sheet yet</div></div>`;
    }
    const counts = {};
    for (const label of Object.keys(buckets)) counts[label] = 0;
    counts["(other)"] = 0;
    for (const row of rows) {
      const val = (row[columnKey] || "").toString().toLowerCase().trim();
      if (!val) continue;
      let matched = false;
      for (const [label, partials] of Object.entries(buckets)) {
        if (partials.some(p => val.includes(p.toLowerCase()))) {
          counts[label]++;
          matched = true;
          break;
        }
      }
      if (!matched) counts["(other)"]++;
    }
    const rowsHtml = Object.entries(counts)
      .filter(([label, c]) => c > 0 || label !== "(other)")
      .map(([label, c]) =>
        `<div class="optin-tally-row"><span class="optin-tally-label">${escapeHtml(label)}</span><span class="optin-tally-count">${c}</span></div>`
      ).join("");
    return `<div class="optin-tally-card"><h4>${escapeHtml(title)}</h4>${rowsHtml || '<div class="optin-tally-empty" style="padding:8px 0">No responses yet</div>'}</div>`;
  }

  // ===================================================================
  // Itinerary (tabbed by day)
  // ===================================================================
  const container = document.getElementById("itinerary-content");
  const tabsContainer = document.getElementById("day-tabs");

  function loadItinerary() {
    return fetch("itinerary.json", { cache: "no-store" })
      .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }

  function normalizeEvents(raw) {
    return raw.events.map(ev => {
      const isAllDay = ev.type === "allday-hotel";
      const startDate = isAllDay
        ? new Date(ev.start_date + "T00:00:00")
        : parseLocalDateTime(ev.start);
      const endDate = isAllDay
        ? new Date(ev.end_date + "T00:00:00")
        : parseLocalDateTime(ev.end);
      return {
        id: ev.id,
        summary: ev.summary,
        description: ev.description || "",
        location: ev.location || "",
        isAllDay,
        startDate,
        endDate,
        type: ev.type || "locked",
      };
    });
  }

  function parseLocalDateTime(s) {
    // Panama is UTC-5 year-round (no DST). Treating timestamps in itinerary.json
    // as Panama-local.
    return new Date(s + "-05:00");
  }

  function groupByDay(events) {
    events.sort((a, b) => a.startDate - b.startDate);
    const tz = cfg.calendarTimezone;
    const groups = new Map();
    for (const e of events) {
      const key = e.startDate.toLocaleDateString("en-CA", { timeZone: tz });
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }
    return [...groups.entries()].sort();
  }

  function formatDayShort(key, tz) {
    const d = new Date(key + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", timeZone: tz });
  }
  function formatDayMonth(key, tz) {
    const d = new Date(key + "T12:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz });
  }
  function formatTime(date, tz) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz,
    });
  }

  function renderEvent(e) {
    const tz = cfg.calendarTimezone;
    const tagMap = {
      "locked": '<span class="event-tag locked">Locked</span>',
      "optin": '<span class="event-tag optin">Opt-in</span>',
      "travel": '<span class="event-tag travel">Travel</span>',
      "travel-optin": '<span class="event-tag travel">Travel · Opt-in</span>',
      "allday-hotel": '<span class="event-tag hotel">Hotel</span>',
      "bookend": "",
    };
    const tag = tagMap[e.type] || "";
    const timeHtml = e.isAllDay
      ? '<div class="event-time all-day">All day</div>'
      : `<div class="event-time"><span class="start">${formatTime(e.startDate, tz)}</span><span class="end">${formatTime(e.endDate, tz)}</span></div>`;
    const locHtml = e.location ? `<div class="event-location">${escapeHtml(e.location)}</div>` : "";
    const descHtml = e.description ? `<div class="event-desc">${linkify(escapeHtml(e.description))}</div>` : "";
    return `<div class="event-card type-${e.type}">${timeHtml}<div class="event-body"><div class="event-title">${tag}${escapeHtml(e.summary)}</div>${locHtml}${descHtml}</div></div>`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function linkify(s) {
    return s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  }

  function renderTabsAndPanels(groups) {
    const tz = cfg.calendarTimezone;
    if (groups.length === 0) {
      container.innerHTML = '<div class="loading">No events found.</div>';
      tabsContainer.innerHTML = "";
      return;
    }

    // Initial active tab: from URL hash (#day-2026-07-16) if matches; else first.
    const hashMatch = (window.location.hash || "").match(/day-(\d{4}-\d{2}-\d{2})/);
    const hashKey = hashMatch ? hashMatch[1] : null;
    const activeKey = (hashKey && groups.find(([k]) => k === hashKey)) ? hashKey : groups[0][0];

    tabsContainer.innerHTML = groups.map(([key]) => {
      const isActive = key === activeKey;
      return `<button class="day-tab ${isActive ? "active" : ""}" data-day="${key}" role="tab" aria-selected="${isActive}">
        ${formatDayShort(key, tz)}<span class="day-tab-date">${formatDayMonth(key, tz)}</span>
      </button>`;
    }).join("");

    container.innerHTML = groups.map(([key, dayEvents]) => {
      const isActive = key === activeKey;
      return `<div class="day-panel ${isActive ? "active" : ""}" data-day="${key}" role="tabpanel">
        ${dayEvents.map(renderEvent).join("")}
      </div>`;
    }).join("");

    // Tab switching
    tabsContainer.querySelectorAll(".day-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.day;
        tabsContainer.querySelectorAll(".day-tab").forEach(b => {
          b.classList.toggle("active", b.dataset.day === key);
          b.setAttribute("aria-selected", b.dataset.day === key ? "true" : "false");
        });
        container.querySelectorAll(".day-panel").forEach(p => {
          p.classList.toggle("active", p.dataset.day === key);
        });
        // Update URL hash without scrolling
        history.replaceState(null, "", `#day-${key}`);
      });
    });
  }

  function renderFallback(err) {
    container.innerHTML = `<p style="color: var(--color-text-muted); margin-bottom: 16px; font-size: 14px;">
      Couldn't load the itinerary (${escapeHtml(err.message || "unknown")}). View it directly:
    </p>
    <iframe src="${cfg.calendarEmbedUrl}" style="width:100%; height:600px; border:0; border-radius:12px;" loading="lazy"></iframe>`;
    tabsContainer.innerHTML = "";
  }

  // ===================================================================
  // 4-day schedule grid (custom widget — no iframe)
  // ===================================================================
  const scheduleGrid = document.getElementById("schedule-grid");

  // Visible window: 8 AM to 2 AM next day. Events outside this window are
  // included as headers/banners or just clipped — currently nothing real
  // falls outside (latest is cigar bar end 1 AM Fri = hour 25).
  const WINDOW_START_HOUR = 8;   // 8 AM
  const WINDOW_END_HOUR = 26;    // 2 AM next calendar day

  function renderScheduleGrid(groups) {
    if (!scheduleGrid) return;
    if (!groups || groups.length === 0) {
      scheduleGrid.innerHTML = '<div class="loading">No schedule events.</div>';
      return;
    }

    const tz = cfg.calendarTimezone;
    const hourCount = WINDOW_END_HOUR - WINDOW_START_HOUR;

    // Header row (corner + 4 day headers)
    let html = `<div class="sg-headers">
      <div class="sg-corner"></div>`;
    for (const [key] of groups) {
      const d = new Date(key + "T12:00:00");
      const wk = d.toLocaleDateString("en-US", { weekday: "short", timeZone: tz });
      const dn = d.toLocaleDateString("en-US", { day: "numeric", timeZone: tz });
      const mo = d.toLocaleDateString("en-US", { month: "short", timeZone: tz });
      html += `<div class="sg-day-header">
        <div class="sg-day-weekday">${wk}</div>
        <div class="sg-day-num">${dn}</div>
        <div class="sg-day-month">${mo}</div>
      </div>`;
    }
    html += `</div>`;

    // All-day banner row (hotel spans all 4 days)
    const allDayBanner = groups.flatMap(([, evs]) => evs).find(e => e.type === "allday-hotel");
    if (allDayBanner) {
      html += `<div class="sg-allday-row">
        <div class="sg-allday-gutter">All-day</div>
        <div class="sg-allday-banner" data-jump="${groups[0][0]}">${escapeHtml(allDayBanner.summary)}</div>
      </div>`;
    }

    // Body: hours gutter + 4 day columns
    html += `<div class="sg-body" style="height: calc(${hourCount} * var(--hour-h));">`;
    html += `<div class="sg-hours">`;
    for (let h = WINDOW_START_HOUR; h < WINDOW_END_HOUR; h++) {
      html += `<div class="sg-hour-label">${formatHourLabel(h)}</div>`;
    }
    html += `</div>`;

    for (const [key, dayEvents] of groups) {
      html += `<div class="sg-col" data-day="${key}">`;
      for (const e of dayEvents) {
        const block = positionedEvent(e, key, tz);
        if (block) html += block;
      }
      html += `</div>`;
    }
    html += `</div>`;

    scheduleGrid.innerHTML = html;

    // Click handlers — jump to the day's tab in the Itinerary section
    scheduleGrid.querySelectorAll("[data-jump], .sg-event").forEach(el => {
      el.addEventListener("click", () => {
        const day = el.dataset.day || el.dataset.jump;
        if (!day) return;
        // Switch the itinerary tab
        document.querySelectorAll(".day-tab").forEach(b => {
          const match = b.dataset.day === day;
          b.classList.toggle("active", match);
          b.setAttribute("aria-selected", match ? "true" : "false");
        });
        document.querySelectorAll(".day-panel").forEach(p => {
          p.classList.toggle("active", p.dataset.day === day);
        });
        history.replaceState(null, "", `#day-${day}`);
        // Scroll the itinerary into view
        document.getElementById("itinerary")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function positionedEvent(e, dayKey, tz) {
    if (e.isAllDay) return null; // rendered as banner
    if (e.type === "bookend") return null; // arrival window noise

    // Hours-since-window-start (decimal) for top + height
    const dayStartUtcMs = new Date(dayKey + "T00:00:00-05:00").getTime();
    const startHour = (e.startDate.getTime() - dayStartUtcMs) / (1000 * 60 * 60);
    const endHour = (e.endDate.getTime() - dayStartUtcMs) / (1000 * 60 * 60);

    // Clip to window
    const top = Math.max(startHour, WINDOW_START_HOUR) - WINDOW_START_HOUR;
    const bottom = Math.min(endHour, WINDOW_END_HOUR) - WINDOW_START_HOUR;
    if (bottom <= 0 || top >= (WINDOW_END_HOUR - WINDOW_START_HOUR)) return null;

    const heightHours = Math.max(0.5, bottom - top); // minimum 30-min block for visibility

    const title = stripPrefix(e.summary);
    const timeStr = `${formatTime(e.startDate, tz)} – ${formatTime(e.endDate, tz)}`;

    return `<div class="sg-event t-${e.type}"
              data-day="${dayKey}"
              title="${escapeHtml(e.summary)}\n${escapeHtml(timeStr)}${e.location ? '\n📍 ' + escapeHtml(e.location) : ''}"
              style="top: calc(${top} * var(--hour-h)); height: calc(${heightHours} * var(--hour-h) - 2px);">
      <div class="sg-event-title">${escapeHtml(title)}</div>
      <div class="sg-event-time">${escapeHtml(timeStr)}</div>
    </div>`;
  }

  function stripPrefix(s) {
    // "Thursday dinner — Aya La Vida" → "Aya La Vida" if short enough; else keep
    const parts = s.split(" — ");
    return parts.length === 2 && parts[1].length <= 30 ? parts[1] : s;
  }

  function formatHourLabel(h24) {
    const wrapped = h24 % 24;
    if (wrapped === 0) return "12 AM";
    if (wrapped === 12) return "12 PM";
    if (wrapped > 12) return `${wrapped - 12} PM`;
    return `${wrapped} AM`;
  }

  loadItinerary()
    .then(normalizeEvents)
    .then(groupByDay)
    .then(groups => {
      renderTabsAndPanels(groups);
      renderScheduleGrid(groups);
    })
    .catch(err => { console.error("Itinerary load failed:", err); renderFallback(err); });
})();
