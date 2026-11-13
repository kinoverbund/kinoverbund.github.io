// All films with a screening to come, A–Z (#154), laid out like the venues page: a row
// per film, its title linked to the film's page, where it plays, and when it plays next.
// `data/films.json` is written by the build in the order shown (title as displayed,
// accents and case ignored); there are no filters, as on the venues page.

import {
  $, el, fill, asDate, fmtShortWd, getJson, useIndex, filmHref, titleNodes, splitShown,
  todayFrom, renderError, renderStatus, renderFooter, staleSince,
} from "./lib.js";

// "Tue 20": the next day, as the venues page writes it.
const fmtShortWdDay = (iso) => `${fmtShortWd.format(asDate(iso))} ${asDate(iso).getUTCDate()}`;

async function start() {
  const main = $("listing");
  let index;
  let films;
  try {
    index = await getJson("data/index.json");
    useIndex(index);
    films = await getJson("data/films.json");
  } catch (err) {
    renderError(main, err);
    return;
  }
  renderFooter(index);
  const today = todayFrom(index);
  const now = Date.now();

  // A day counts while a screening on it is still to come, as the day page counts.
  const rows = films.map((f) => ({
    ...f,
    next: f.dates.find((d) => d.date > today || (d.date === today && d.starts.some((s) => Date.parse(s) >= now))),
  })).filter((f) => f.next);
  if (!rows.length) {
    renderStatus(main, "No films are listed.", "The cinemas’ own websites have their programs.");
    main.setAttribute("aria-busy", "false");
    return;
  }

  fill(main, el("ol", { class: "venue-list film-list grid" }, rows.map((f) => {
    const next = f.next.date;
    // Today's figure stays "Today"; under it, the earliest screening not yet started
    // (starts are Zürich local, "2026-10-20T18:30+02:00").
    const soon = f.next.starts.find((s) => Date.parse(s) >= now);
    // Old data says so in place of the label, its figure in gray, as on the venues page.
    const since = staleSince(index, f.sources);
    const figure = next === today ? ["Today", `Next at ${soon.slice(11, 16)}`] : [fmtShortWdDay(next), "Next screening"];
    if (since !== null) figure[1] = since ? `Not updated since ${since}` : "May be out of date";
    // A translated program is headlined in English; the venue's own name goes below.
    const parts = f.kind === "program" && f.venue_title ? splitShown(f.title, f.venue_title) : null;
    const facts = [...(f.directors || []).slice(0, 2), f.year].filter(Boolean).join(", ");
    return el("li", { class: "venue-row" },
      el("h2", { class: "venue-name" }, el("a", { href: filmHref(f.slug) }, ...titleNodes(f))),
      el("p", { class: "venue-row-place" },
        parts ? el("span", { class: "venue-row-operator", lang: "de" }, parts.german) : null,
        facts ? el("span", { class: "venue-row-operator" }, facts) : null,
        el("span", { class: "venue-row-operator" }, f.venues.join(", "))),
      el("p", { class: `venue-row-figure${next === today ? " is-today" : ""}${since !== null ? " is-stale" : ""}` },
        el("span", { class: "figure" }, figure[0]), el("span", { class: "figure-label" }, figure[1])));
  })));
  main.setAttribute("aria-busy", "false");
}

start();
