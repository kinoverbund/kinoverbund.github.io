// A film page: every upcoming screening of one film, at every venue (user, 2026-10-19).
// Only screenings: no synopsis, cast, ratings or posters, so the site never turns into a
// film database. Laid out like a series page turned around: one row per venue, the venue
// in the left column, its dates and times on the right. URL: film.html?f=<slug>.
// The venue's name links to the film's page there, where tickets are sold, as titles do
// elsewhere; the venue pages are linked in the facts line. Bolder (2026-10-19): the
// venues are named at the day page's headline size, so the page reads as a day turned
// sideways: where, in large type, then when.

import {
  $, el, fill, SITE_NAME, asDate, fmtShort, getJson, useIndex, venueHref, todayFrom,
  renderListing, translatedMark, renderError, renderStatus, renderFooter, keepTime, titleNodes, svgIcon, staleNote, filterNote,
} from "./lib.js";

// Arrow from Bootstrap Icons 1.11.3 (MIT License, (c) 2019-2024 The Bootstrap Authors),
// as on series titles: the venue's name leaves the site, for the film's page there.
const ARROW_PATH = "M14 2.5a.5.5 0 0 0-.5-.5h-6a.5.5 0 0 0 0 1h4.793L2.146 13.146a.5.5 0 0 0 .708.708L13 3.707V8.5a.5.5 0 0 0 1 0z";

const wayOn = () => [
  el("a", { href: "./" }, "Today’s listings"), " · ", el("a", { href: "venues.html" }, "All venues"),
];

// "Houdini, Riffraff and Xenix", each linked to its venue page.
const venueList = (names) => names.flatMap((name, i) => {
  const href = venueHref(name);
  const part = href ? el("a", { href }, name) : name;
  return i === 0 ? [part] : [i === names.length - 1 ? " and " : ", ", part];
});

async function start() {
  const main = $("listing");
  const slug = new URLSearchParams(location.search).get("f") || "";
  let index;
  let doc;
  try {
    index = await getJson("data/index.json");
    useIndex(index);
    renderFooter(index);
    // An address the index does not list is "not found" without asking for its file, so
    // the console stays clean.
    const listed = index.page_slugs ? index.page_slugs.films : null;
    if (listed && !listed.includes(slug)) throw new Error("not found: 404");
    doc = await getJson(`data/films/${encodeURIComponent(slug)}.json`);
  } catch (err) {
    if (index && /: 404$/.test(err.message)) {
      document.title = `Film not found · ${SITE_NAME}`;
      $("page-title").textContent = "Film not found";
      renderStatus(main, "No film matches this link.",
        "Its screenings may have ended. A film shown only once has no page of its own.", wayOn());
    } else {
      renderError(main, err);
    }
    return;
  }

  // Past days are not shown, as on series pages.
  const today = todayFrom(index);
  const now = Date.now();
  const rows = doc.venues
    .map((v) => ({ ...v, dates: v.dates.filter((d) => d.date >= today) }))
    .filter((v) => v.dates.length);

  document.title = `${doc.name} · ${SITE_NAME}`;
  const lead = rows[0] || doc.venues[0];
  fill($("page-title"), titleNodes(lead),
    lead.subtitle ? el("span", { class: "subtitle" }, ` — ${lead.subtitle}`, lead.subtitle_translated ? translatedMark() : null) : null);

  if (!rows.length) {
    fill($("page-facts"));
    renderStatus(main, "This film has no upcoming screenings.",
      ["It played at ", ...venueList(doc.venues.map((v) => v.venue)), "."], wayOn());
    return;
  }

  // The film's line (director, year, runtime) once, under the title; then where and when.
  // Only screenings still to come, as the day page counts (critique 2026-10-19).
  const ahead = (t) => Date.parse(t.start) >= now;
  const dates = [...new Set(rows.flatMap((v) => v.dates.filter((d) => d.screenings.some(ahead)).map((d) => d.date)))].sort();
  const count = rows.reduce((n, v) => n + v.dates.reduce((m, d) => m + d.screenings.filter(ahead).length, 0), 0);
  // "Today to Wed 21 Oct": the listed run, which is not the film's last day.
  const day = (d) => (d === today ? "today" : fmtShort.format(asDate(d)));
  const span = dates.length === 1 ? day(dates[0]) : `${day(dates[0])} to ${day(dates[dates.length - 1])}`;
  const head = renderListing(lead, { dates: lead.dates, today, onFilm: true });
  const info = head.querySelector(":scope > .info");
  fill($("page-facts"),
    info ? el("p", { class: "info" }, [...info.childNodes]) : null,
    el("p", {}, "At ", venueList(rows.map((v) => v.venue))),
    count
      ? el("p", {}, `${count} ${count === 1 ? "screening" : "screenings"}, ${span}`)
      : el("p", {}, "No more screenings today."),
    filterNote());

  const addresses = new Map((index.venues || []).map((x) => [x.name, x.address]));
  fill(main, ...rows.map((v, n) => {
    const entry = renderListing(v, {
      dates: v.dates,
      now: v.dates.some((d) => d.date === today) ? now : null,
      today,
      onFilm: true,
    });
    const part = (cls) => entry.querySelector(`:scope > .${cls}`);
    const id = `venue-${n}`;
    return el("section", { class: "venue film-row", id, "aria-labelledby": `${id}-h` },
      el("div", { class: "venue-inner" },
        el("div", { class: "venue-head film-head" },
          el("div", {}, part("tags"),
            el("h2", { class: "venue-name", id: `${id}-h` }, v.film_url
              ? el("a", { href: v.film_url, rel: "noopener", class: "title-link" }, v.venue,
                el("span", { class: "visually-hidden" }, `, the film’s page at ${v.venue}`),
                svgIcon(ARROW_PATH, "icon icon--arrow"))
              : v.venue),
            // Where it is, and, as on the day page, a warning when its times are old.
            addresses.get(v.venue) ? el("p", { class: "venue-meta" }, addresses.get(v.venue)) : null,
            staleNote(index, [v.source]))),
        el("div", { class: "film-dates" }, part("lang"), part("dates"), part("notes"), part("program-films"))));
  }));
  main.setAttribute("aria-busy", "false");
  keepTime(main);
}

start();
