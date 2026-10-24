// A series page, like Screen Slate's: every upcoming film of the series, each with all
// its dates and times, in order of its next screening; the left column hangs that next
// date (user, 2026-10-17). A facts line gives the venue(s), run and film count; the list
// itself opens with the next screening. URL: series.html?s=<slug>.

import {
  $, el, fill, SITE_NAME, asDate, fmtShort, getJson, useIndex, venueHref, todayFrom, seriesName, seriesGerman,
  renderListing, renderError, renderStatus, renderFooter, svgIcon, keepTime, nearMisses, didYouMean,
} from "./lib.js";


// Arrow from Bootstrap Icons 1.11.3 (MIT License, (c) 2019-2024 The Bootstrap Authors):
// the title links out to the venue's own page for the series.
const ARROW_PATH = "M14 2.5a.5.5 0 0 0-.5-.5h-6a.5.5 0 0 0 0 1h4.793L2.146 13.146a.5.5 0 0 0 .708.708L13 3.707V8.5a.5.5 0 0 0 1 0z";

// "Houdini and Riffraff", each linked to `hrefFor(name)` when there is one.
function nameList(names, hrefFor) {
  return names.flatMap((name, i) => {
    const href = hrefFor(name);
    const part = href ? el("a", { href, rel: /^https?:/.test(href) ? "noopener" : null }, name) : name;
    return i === 0 ? [part] : [i === names.length - 1 ? " and " : ", ", part];
  });
}

const venueList = (names) => nameList(names, (name) => venueHref(name));

// Where a series has its own page at more than one venue, a line of its own names
// them, each linked to its page there (critique 2026-10-19: "(series page)" after every
// venue read like debug text).
function seriesPages(names, links) {
  const own = names.filter((name) => links[name]);
  if (new Set(own.map((name) => links[name])).size < 2) return null;
  // Each with the arrow, as they leave the site, so they don't read as the venue links
  // above them (critique 2026-10-19).
  return el("p", {}, "Series pages at ", own.flatMap((name, i) => [
    i === 0 ? null : i === own.length - 1 ? " and " : ", ",
    el("a", { href: links[name], rel: "noopener" }, name, svgIcon(ARROW_PATH, "icon icon--arrow icon--inline")),
  ]));
}

// The series name as the page title; when the series has its own page at one venue,
// the title is the link to it (user, 2026-10-17), with an arrow so it reads as a link
// on a phone too.
function renderTitle(name, links, own) {
  const dash = (t) => t.replace(/ ([–—-]) /g, "\u00a0$1 "); // a line never starts with a dash
  const text = dash(name);
  const german = seriesGerman(own);
  if (german) {
    $("page-german").replaceChildren(german);
    $("page-german").hidden = false;
  }
  const urls = [...new Set(Object.values(links))];
  if (urls.length !== 1) {
    fill($("page-title"), text);
    return;
  }
  const [url] = urls;
  const venue = Object.keys(links).join(" and ");
  fill($("page-title"), el("a", { href: url, rel: "noopener", class: "title-link" },
    text, el("span", { class: "visually-hidden" }, `, series page at ${venue}`),
    svgIcon(ARROW_PATH, "icon icon--arrow")));
}

// The series' description under the facts: the venue's opening paragraph in its own
// language, or a hand-kept English text, and a link to the full text at the venue
// (user, 2026-10-19).
function renderAbout(about) {
  if (!about || !about.text) return;
  // Quoted as the venue wrote it, or translated by the build; either way said so, for
  // readers who don't read German (user, 2026-10-24).
  const inGerman = about.translated ? ", translated from German"
    : (about.lang || "").startsWith("de") ? ", in German" : null;
  $("page-facts").classList.add("has-about");
  $("page-facts").append(el("div", { class: "series-about" },
    el("p", { lang: about.lang || null, dir: "auto" }, about.text),
    about.url && about.venue
      ? el("p", { class: "source" }, el("a", { href: about.url, rel: "noopener" }, `From ${about.venue}`,
        svgIcon(ARROW_PATH, "icon icon--arrow")), inGerman)
      : about.venue ? el("p", { class: "source" }, `From ${about.venue}`, inGerman) : null));
}

const wayOn = () => [
  el("a", { href: "./" }, "Today’s listings"), " · ", el("a", { href: "venues.html" }, "All venues"),
];

async function start() {
  const main = $("listing");
  const slug = new URLSearchParams(location.search).get("s") || "";
  let index;
  let doc;
  try {
    index = await getJson("data/index.json");
    useIndex(index);
    renderFooter(index);
    // An address the index does not list is "not found" without asking for its file, so
    // the console stays clean. (An index from before `page_slugs` falls back to asking.)
    const listed = index.page_slugs ? index.page_slugs.series : null;
    if (listed && !listed.includes(slug)) throw new Error("not found: 404");
    doc = await getJson(`data/series/${encodeURIComponent(slug)}.json`);
  } catch (err) {
    // A missing series is "not found"; anything else (offline, server error) is a
    // failed load, with a retry.
    if (index && /: 404$/.test(err.message)) {
      // Every current series, with the venues it plays at, to match the link against.
      const known = new Map();
      for (const v of index.venues || []) {
        for (const x of v.series || []) {
          const item = known.get(x.slug) || { key: x.slug, name: x.name, venues: [] };
          item.venues.push(v.name);
          known.set(x.slug, item);
        }
      }
      const bare = (name) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const matches = nearMisses(slug, [...known.values()].map((x) => ({
        ...x, keys: [x.key, bare(x.name)], href: `series.html?s=${encodeURIComponent(x.key)}`, label: `${x.name} at ${x.venues.join(" and ")}`,
      })));
      // An old address of exactly one series: go there (the link was right, once).
      // Only once: a forwarded link that also fails shows "not found" instead of looping.
      if (matches.length === 1 && matches[0].key.startsWith(`${slug}-`) && !new URLSearchParams(location.search).has("from")) {
        location.replace(`${matches[0].href}&from=${encodeURIComponent(slug)}${location.hash}`);
        return;
      }
      document.title = `Series not found · ${SITE_NAME}`;
      $("page-title").textContent = "Series not found";
      renderStatus(main, "No series matches this link.",
        matches.length ? didYouMean(matches) : "It may have ended.", wayOn());
    } else {
      renderError(main, err);
    }
    return;
  }
  // Arrived from an old link: drop the loop guard from the address (it stays shareable).
  if (new URLSearchParams(location.search).has("from")) {
    history.replaceState(null, "", `series.html?s=${encodeURIComponent(slug)}${location.hash}`);
  }
  const shownName = seriesName(doc.name);
  document.title = `${shownName} · ${SITE_NAME}`;
  // A dash stays with the word before it, so a line never starts with "–".
  renderTitle(shownName, doc.links || {}, doc.name);

  // Past days are not shown (user decision, 2026-10-17).
  const today = todayFrom(index);
  const now = Date.now();
  const films = doc.films
    .map((f) => ({ ...f, dates: f.dates.filter((d) => d.date >= today) }))
    .filter((f) => f.dates.length)
    // In order of each film's next screening.
    .sort((a, b) => a.dates[0].screenings[0].start.localeCompare(b.dates[0].screenings[0].start));

  if (!films.length) {
    // An ended series still says where it played.
    fill($("page-facts"));
    renderStatus(main, "This series has no upcoming screenings.",
      doc.venues.length ? ["It played at ", ...venueList(doc.venues), "."] : null, wayOn());
    return;
  }

  const venues = [...new Set(films.map((f) => f.venue))];
  const several = venues.length > 1;
  const dates = [...new Set(films.flatMap((f) => f.dates.map((d) => d.date)))].sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  const started = first === today || doc.films.some((f) => f.dates.some((d) => d.date < today));
  const run = dates.length === 1
    ? fmtShort.format(asDate(first))
    : started ? `Ongoing, until ${fmtShort.format(asDate(last))}`
      : `${fmtShort.format(asDate(first))} – ${fmtShort.format(asDate(last))}`;
  fill($("page-facts"),
    el("p", {}, "At ", venueList(venues)),
    seriesPages(venues, doc.links || {}),
    el("p", {}, `${run} · ${films.length} ${films.length === 1 ? "film" : "films"}`));
  // No "Next" line (user, 2026-10-19): the list is ordered by next screening, so its first
  // row already is the next film, and today's countdown and strike-through say the rest.

  renderAbout(doc.about);

  // One row per film, in order of its next screening: the film (series tags, title,
  // info line) hangs in the left column, all its dates and times run in the right, as
  // venue names and listings do on the day page (user, 2026-10-17).
  fill(main, ...films.map((f, n) => {
    const entry = renderListing(f, {
      dates: f.dates,
      now: f.dates.some((d) => d.date === today) ? now : null,
      onSeries: doc.name,
      place: several ? f.venue : null,
      today,
    });
    const part = (cls) => entry.querySelector(`:scope > .${cls}`);
    const id = `film-${n}`;
    const title = part("title");
    return el("section", { class: "venue film-row", id, "aria-labelledby": `${id}-h` },
      el("div", { class: "venue-inner" },
        el("div", { class: "venue-head film-head" },
          el("div", {}, part("tags"), el("h2", { class: "title", id: `${id}-h` }, [...title.childNodes]),
            part("title-de"), part("info"), part("lang"), part("program-films"))),
        el("div", { class: "film-dates" }, part("dates"), part("notes"))));
  }));
  main.setAttribute("aria-busy", "false");
  keepTime(main);
}

start();
