/**
 * Duggan Bachelor Party site — runtime.
 *
 * Responsibilities:
 *  1. Pull live ICS feed from the public Google Calendar (via CORS proxy).
 *  2. Parse with ical.js, render day-by-day cards.
 *  3. Wire up the subscribe button, flight form button, sheet embed.
 *  4. Graceful fallback if ICS fetch fails (show calendar embed instead).
 */

(function () {
  "use strict";

  const cfg = window.SITE_CONFIG;
  if (!cfg) {
    console.error("SITE_CONFIG missing");
    return;
  }

  // ── Wire static action buttons ────────────────────────────────────────
  const subscribeBtn = document.getElementById("subscribe-btn");
  if (subscribeBtn) {
    subscribeBtn.href = cfg.calendarSubscribeUrl;
    subscribeBtn.target = "_blank";
    subscribeBtn.rel = "noopener";
  }

  const flightFormBtn = document.getElementById("flight-form-btn");
  if (flightFormBtn) flightFormBtn.href = cfg.flightFormUrl;

  const flightSheetBtn = document.getElementById("flight-sheet-btn");
  const flightSheetEmbed = document.getElementById("flight-sheet-embed");
  const flightFallback = document.getElementById("flight-fallback");

  if (cfg.flightSheetEmbedUrl) {
    flightSheetEmbed.src = cfg.flightSheetEmbedUrl;
    if (flightSheetBtn && cfg.flightSheetViewUrl) {
      flightSheetBtn.href = cfg.flightSheetViewUrl;
    } else if (flightSheetBtn) {
      flightSheetBtn.style.display = "none";
    }
  } else {
    flightSheetEmbed.style.display = "none";
    if (flightFallback) flightFallback.hidden = false;
    if (flightSheetBtn) flightSheetBtn.style.display = "none";
  }

  const calendarPublicLink = document.getElementById("calendar-public-link");
  if (calendarPublicLink) calendarPublicLink.href = cfg.calendarEmbedUrl;

  // ── Fetch + render itinerary ──────────────────────────────────────────
  const container = document.getElementById("itinerary-content");

  function fetchIcs() {
    const url = cfg.icsProxyUrl + encodeURIComponent(cfg.calendarIcsUrl);
    return fetch(url, { cache: "no-store" })
      .then(r => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      });
  }

  function parseIcs(icsText) {
    const jcal = ICAL.parse(icsText);
    const comp = new ICAL.Component(jcal);
    const events = comp.getAllSubcomponents("vevent");
    return events.map(ev => {
      const e = new ICAL.Event(ev);
      const desc = ev.getFirstPropertyValue("description") || "";
      const loc = ev.getFirstPropertyValue("location") || "";
      const transparency = ev.getFirstPropertyValue("transp") || "OPAQUE";
      const startDate = e.startDate;
      const endDate = e.endDate;

      return {
        uid: e.uid,
        summary: e.summary,
        description: desc,
        location: loc,
        isAllDay: startDate.isDate,
        startDate: startDate.toJSDate(),
        endDate: endDate.toJSDate(),
        transparency,
        // Heuristic type classification from the summary line
        type: classifyType(e.summary, transparency, startDate.isDate),
      };
    });
  }

  function classifyType(summary, transparency, isAllDay) {
    if (isAllDay) return "allday-hotel";
    if (/^\[opt-in/i.test(summary) || /^\[track [abc]\]/i.test(summary)) return "optin";
    if (/^Depart|^Return /.test(summary)) return "travel";
    if (/Arrival window|Departure window|decompress|send-off/i.test(summary)) return "bookend";
    return "locked";
  }

  function groupByDay(events) {
    events.sort((a, b) => a.startDate - b.startDate);
    const groups = new Map();
    for (const e of events) {
      // Day key in Panama time
      const tz = cfg.calendarTimezone;
      const key = formatDayKey(e.startDate, tz);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }
    return [...groups.entries()].sort();
  }

  function formatDayKey(date, tz) {
    return date.toLocaleDateString("en-CA", { timeZone: tz });
  }

  function formatDayHeader(key, tz) {
    const d = new Date(key + "T12:00:00");
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      timeZone: tz,
    });
  }

  function formatTime(date, tz) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: tz,
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

    let timeHtml;
    if (e.isAllDay) {
      timeHtml = '<div class="event-time all-day">All day</div>';
    } else {
      timeHtml = `<div class="event-time"><span class="start">${formatTime(e.startDate, tz)}</span><span class="end">${formatTime(e.endDate, tz)}</span></div>`;
    }

    const locHtml = e.location ? `<div class="event-location">${escapeHtml(e.location)}</div>` : "";
    const descHtml = e.description ? `<div class="event-desc">${linkify(escapeHtml(e.description))}</div>` : "";

    return `
      <div class="event-card type-${e.type}">
        ${timeHtml}
        <div class="event-body">
          <div class="event-title">${tag}${escapeHtml(e.summary)}</div>
          ${locHtml}
          ${descHtml}
        </div>
      </div>
    `;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function linkify(s) {
    return s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  }

  function render(events) {
    if (events.length === 0) {
      container.innerHTML = '<div class="loading">No events found in the calendar.</div>';
      return;
    }
    const groups = groupByDay(events);
    let html = "";
    for (const [key, dayEvents] of groups) {
      html += `<div class="day-group">
        <h3 class="day-header">${formatDayHeader(key, cfg.calendarTimezone)}<span class="day-header-date">${key}</span></h3>
        ${dayEvents.map(renderEvent).join("")}
      </div>`;
    }
    container.innerHTML = html;
  }

  function renderFallback(err) {
    container.innerHTML = `
      <div class="day-group">
        <p style="color: var(--color-text-muted); margin-bottom: 16px; font-size: 14px;">
          Couldn't load the live itinerary from the calendar (${escapeHtml(err.message || "unknown error")}).
          View it directly:
        </p>
        <iframe src="${cfg.calendarEmbedUrl}" style="width:100%; height:600px; border:0; border-radius:12px;" loading="lazy"></iframe>
      </div>
    `;
  }

  // ── Boot ──────────────────────────────────────────────────────────────
  fetchIcs()
    .then(parseIcs)
    .then(render)
    .catch(err => {
      console.error("Itinerary load failed:", err);
      renderFallback(err);
    });
})();
