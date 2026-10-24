// All venues, alphabetically, each with its address and next screening day.

import {
  $, el, fill, asDate, fmtShortWd, getJson, useIndex, venueHref, todayFrom, renderError, renderFooter, staleSince,
} from "./lib.js";

// "Tue 20": the next day, as the strip writes it.
const fmtShortWdDay = (iso) => `${fmtShortWd.format(asDate(iso))} ${asDate(iso).getUTCDate()}`;

async function start() {
  const main = $("listing");
  let index;
  try {
    index = await getJson("data/index.json");
  } catch (err) {
    renderError(main, err);
    return;
  }
  useIndex(index);
  renderFooter(index);
  const today = todayFrom(index);
  // What is still to come today, per venue, as the day page counts (critique 2026-10-19:
  // the whole day's total contradicted it in the evening). Without the day's file, the
  // day's total.
  const now = Date.now();
  let left = null;
  if (index.venues.some((v) => (v.screenings || {})[today])) {
    try {
      const day = await getJson(`data/days/${today}.json`);
      left = new Map(day.venues.map((v) => [v.name,
        v.listings.reduce((n, e) => n + e.screenings.filter((t) => Date.parse(t.start) >= now).length, 0)]));
    } catch {
      left = null;
    }
  }

  // A station board of venues (layout pass, then bolder, 2026-10-19): each name at the
  // venue page's own title size, where it is, and today's screening count as a figure
  // at the same scale, like platforms and departures; a venue with nothing today shows
  // its next day instead.
  fill(main, el("ol", { class: "venue-list grid" }, index.venues.map((v) => {
    const n = left ? left.get(v.name) || 0 : (v.screenings || {})[today] || 0;
    // A venue whose day is over shows its next one, saying today is done.
    const over = v.dates.includes(today) && n === 0;
    const next = v.dates.find((d) => (over ? d > today : d >= today));
    // Old data says so in place of the label, its figure in gray (critique 2026-10-19:
    // the board's large figures must not vouch for times nobody has checked).
    const since = staleSince(index, v.sources);
    const figure = !next ? ["–", over ? "Done for today" : "No screenings listed"]
      : next === today ? [String(n), left ? "Still to come today" : n === 1 ? "Screening today" : "Screenings today"]
        : [fmtShortWdDay(next), over ? "Done for today" : "Next screenings"];
    if (since !== null && next) figure[1] = since ? `Not updated since ${since}` : "May be out of date";
    const operator = v.operator !== v.name && !v.name.startsWith(v.operator) ? v.operator : null;
    return el("li", { class: "venue-row" },
      el("h2", { class: "venue-name" }, el("a", { href: venueHref(v.name) }, v.name)),
      el("p", { class: "venue-row-place" }, v.address || null, operator ? el("span", { class: "venue-row-operator" }, operator) : null),
      el("p", { class: `venue-row-figure${next === today ? " is-today" : ""}${since !== null && next ? " is-stale" : ""}` },
        el("span", { class: "figure" }, figure[0]), el("span", { class: "figure-label" }, figure[1])));
  })));
  main.setAttribute("aria-busy", "false");
}

start();
