/**
 * Site config. Manually maintained — values come from
 *   data/calendar_state.json, data/form_sheet_state.json, data/optin_form_state.json,
 *   data/optin_sheet_state.json
 * Update in lockstep when those files change, then re-deploy with scripts/deploy_site.sh.
 */
window.SITE_CONFIG = {
  // --- Calendar ---
  calendarId: "37da5bbc7e2cdf4182b8f40910425a12d8acfdd2f16add300e1a87aac970d72c@group.calendar.google.com",
  calendarTimezone: "America/Panama",
  calendarSubscribeUrl: "https://calendar.google.com/calendar/u/0/r?cid=37da5bbc7e2cdf4182b8f40910425a12d8acfdd2f16add300e1a87aac970d72c%40group.calendar.google.com",
  calendarIcsUrl: "https://calendar.google.com/calendar/ical/37da5bbc7e2cdf4182b8f40910425a12d8acfdd2f16add300e1a87aac970d72c%40group.calendar.google.com/public/basic.ics",
  calendarEmbedUrl: "https://calendar.google.com/calendar/embed?src=37da5bbc7e2cdf4182b8f40910425a12d8acfdd2f16add300e1a87aac970d72c%40group.calendar.google.com&ctz=America/Panama",

  // --- Flight form + sheet ---
  flightFormUrl: "https://docs.google.com/forms/d/e/1FAIpQLScSzFBjgHNgK_SMrD88BPlZSx5SCWpS657V8OsD9o4moyUdGQ/viewform",
  flightSheetEmbedUrl: "https://docs.google.com/spreadsheets/d/1IA9tqeFJJlz_SrlwgWwftjI5ub8gs5uddGXdV733Nio/htmlembed?gid=1113867018&widget=true&headers=false&chrome=false",
  flightSheetViewUrl: "https://docs.google.com/spreadsheets/d/1IA9tqeFJJlz_SrlwgWwftjI5ub8gs5uddGXdV733Nio/edit#gid=1113867018",

  // --- Opt-in form + tally sheet ---
  optinFormUrl: "https://docs.google.com/forms/d/e/1FAIpQLSc2PA6kJnicoJ2xLdvN27GJZeW8au8GL7R0ElagIJ-n1V5EbA/viewform",
  // optinSheetId + optinSheetGid populated by scripts/wire_optin_sheet.py
  // after you complete the manual "Link to Sheets" step (Form Responses 2 tab).
  optinSheetId: "1IA9tqeFJJlz_SrlwgWwftjI5ub8gs5uddGXdV733Nio",
  optinSheetGid: "1069474027"null,
};
