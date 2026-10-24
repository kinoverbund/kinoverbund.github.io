// A venue page, like Screen Slate's: the venue's facts, then one day of its screenings
// with previous / next. Facts only: no about text, no prices (user, 2026-10-17).
// URL: venue.html?v=<slug>[&date=YYYY-MM-DD]. No filters: the venue's whole program.

import {
  $, el, fill, dayFoot, arrive, staleNote, filterNote, tickTimes, keepTime, fmtShort, seriesHref, seriesName, svgIcon, asDate, fmtDayMonth, FORMATS, SITE_NAME, getJson, useIndex, todayFrom,
  weekdayLine, renderListing, renderSection, renderStrip, bindStrip, setStep, renderError,
  renderStatus, renderFooter, nearMisses, didYouMean, venueHref,
} from "./lib.js";

const params = new URLSearchParams(location.search);

// Instagram icon from Bootstrap Icons 1.11.3 (MIT License, (c) 2019-2024 The Bootstrap Authors).
const INSTAGRAM_PATH = "M8 0C5.829 0 5.556.01 4.703.048 3.85.088 3.269.222 2.76.42a3.9 3.9 0 0 0-1.417.923A3.9 3.9 0 0 0 .42 2.76C.222 3.268.087 3.85.048 4.7.01 5.555 0 5.827 0 8.001c0 2.172.01 2.444.048 3.297.04.852.174 1.433.372 1.942.205.526.478.972.923 1.417.444.445.89.719 1.416.923.51.198 1.09.333 1.942.372C5.555 15.99 5.827 16 8 16s2.444-.01 3.298-.048c.851-.04 1.434-.174 1.943-.372a3.9 3.9 0 0 0 1.416-.923c.445-.445.718-.891.923-1.417.197-.509.332-1.09.372-1.942C15.99 10.445 16 10.173 16 8s-.01-2.445-.048-3.299c-.04-.851-.175-1.433-.372-1.941a3.9 3.9 0 0 0-.923-1.417A3.9 3.9 0 0 0 13.24.42c-.51-.198-1.092-.333-1.943-.372C10.443.01 10.172 0 7.998 0zm-.717 1.442h.718c2.136 0 2.389.007 3.232.046.78.035 1.204.166 1.486.275.373.145.64.319.92.599s.453.546.598.92c.11.281.24.705.275 1.485.039.843.047 1.096.047 3.231s-.008 2.389-.047 3.232c-.035.78-.166 1.203-.275 1.485a2.5 2.5 0 0 1-.599.919c-.28.28-.546.453-.92.598-.28.11-.704.24-1.485.276-.843.038-1.096.047-3.232.047s-2.39-.009-3.233-.047c-.78-.036-1.203-.166-1.485-.276a2.5 2.5 0 0 1-.92-.598 2.5 2.5 0 0 1-.6-.92c-.109-.281-.24-.705-.275-1.485-.038-.843-.046-1.096-.046-3.233s.008-2.388.046-3.231c.036-.78.166-1.204.276-1.486.145-.373.319-.64.599-.92s.546-.453.92-.598c.282-.11.705-.24 1.485-.276.738-.034 1.024-.044 2.515-.045zm4.988 1.328a.96.96 0 1 0 0 1.92.96.96 0 0 0 0-1.92m-4.27 1.122a4.109 4.109 0 1 0 0 8.217 4.109 4.109 0 0 0 0-8.217m0 1.441a2.667 2.667 0 1 1 0 5.334 2.667 2.667 0 0 1 0-5.334";

const instagramIcon = () => svgIcon(INSTAGRAM_PATH);

const mapsHref = (v) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${v.name}, ${v.address}`)}`;

const hrefFor = (venue, date, first) =>
  `venue.html?v=${encodeURIComponent(venue.slug)}${date === first ? "" : `&date=${date}`}`;

function formatList(codes) {
  return codes.map((c) => FORMATS[c] || c.replace(/-/g, " ").toUpperCase()).join(", ");
}

// The series running or coming up at this venue (user, 2026-10-17): running ones first,
// ending soonest first, then upcoming ones by start. Names in red, like series tags.
function seriesLine(v, today) {
  const live = (v.series || []).filter((x) => x.last >= today);
  if (!live.length) return null;
  const running = live.filter((x) => x.first <= today).sort((a, b) => a.last.localeCompare(b.last));
  const coming = live.filter((x) => x.first > today).sort((a, b) => a.first.localeCompare(b.first));
  const day = (iso) => (iso === today ? "today" : fmtShort.format(asDate(iso)));
  const item = (x) => {
    const when = x.first === x.last ? day(x.first)
      : x.first <= today ? `until ${day(x.last)}` : `from ${day(x.first)}`;
    const href = seriesHref(x.name, x.slug);
    return el("li", {},
      href ? el("a", { href, class: "fact-series-name" }, seriesName(x.name)) : el("span", { class: "fact-series-name" }, seriesName(x.name)),
      " ", el("span", { class: "fact-series-when" }, when));
  };
  // What runs now stays in view; what is still to come folds into "and 9 coming up", so
  // a venue with many series (Xenix) doesn't push the day's screenings off the first
  // screen (layout pass, 2026-10-19). Without running series, the next few show.
  const all = [...running, ...coming];
  const shown = running.length ? running : coming.slice(0, 3);
  const rest = all.slice(shown.length);
  const fold = rest.length > 1;
  const visible = fold ? shown : all;
  return el("div", { class: "fact-series" },
    el("h2", { class: "visually-hidden" }, "Series"),
    el("ul", {}, visible.map(item),
      fold ? el("li", { class: "fact-series-more" },
        el("details", {},
          el("summary", {}, `and ${rest.length} more coming up`),
          el("ul", {}, rest.map(item)))) : null));
}

function renderFacts(v, today, index) {
  // The opening year only when it is known (user, 2026-10-17).
  const since = v.since ? `Operating since ${v.since}` : null;
  const line = [v.operator !== v.name && !v.name.startsWith(v.operator) ? v.operator : null, since]
    .filter(Boolean).join(" · ");
  // The formats end that line rather than standing alone on one of their own.
  const formats = v.formats.length ? el("span", { class: "fact-formats" }, formatList(v.formats)) : null;
  fill($("page-facts"), 
    v.address
      ? el("p", { class: "fact-address" }, el("a", { href: mapsHref(v), rel: "noopener" }, v.address))
      : null,
    line || formats ? el("p", {}, line, line && formats ? " · " : null, formats) : null,
    v.website || v.instagram
      ? el("p", { class: "fact-links" },
        v.website ? el("a", { href: v.website, rel: "noopener" }, v.website.replace(/^https?:\/\/(www\.)?/, "")) : null,
        v.instagram
          ? el("a", { href: v.instagram, rel: "noopener", class: "icon-link", "aria-label": `${v.name} on Instagram`, title: "Instagram" }, instagramIcon())
          : null)
      : null,
    seriesLine(v, today),
    staleNote(index, v.sources),
    filterNote(),
  );
}

function hideDayControls() {
  document.querySelector(".day-head").hidden = true;
  document.querySelector(".strip").hidden = true;
}

const wayOn = () => [
  el("a", { href: "./" }, "Today’s listings"), " · ", el("a", { href: "venues.html" }, "All venues"),
];

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
  const venue = (index.venues || []).find((v) => v.slug === params.get("v"));
  if (!venue) {
    // Nothing to navigate: no day controls, a tab title that says so, and a way on.
    hideDayControls();
    document.title = `Venue not found · ${SITE_NAME}`;
    $("page-title").textContent = "Venue not found";
    const matches = nearMisses(params.get("v"), (index.venues || []).map((x) => ({
      key: x.slug, label: x.name, href: venueHref(x.name),
    })));
    renderStatus(main, "No venue matches this link.", matches.length ? didYouMean(matches) : null, wayOn());
    return;
  }
  document.title = `${venue.name} · ${SITE_NAME}`;
  $("page-title").textContent = venue.name;
  renderFacts(venue, todayFrom(index), index);

  const today = todayFrom(index);
  const dates = venue.dates.filter((d) => d >= today);
  if (!dates.length) {
    hideDayControls();
    renderStatus(main, `${venue.name} has no screenings listed right now.`, wayOn());
    return;
  }
  const asked = params.get("date");
  const pick = (d) => (dates.includes(d) ? d : dates.find((x) => x >= (d || today)) || dates[0]);
  const first = dates[0];
  const days = new Map(); // date -> Promise<day json>
  const loadDay = (d) => {
    if (!days.has(d)) {
      const p = getJson(`data/days/${d}.json`);
      p.catch(() => days.delete(d));
      days.set(d, p);
    }
    return days.get(d);
  };

  // Changing day happens in place, like the day page: no reload, the address kept in
  // step for links and Back (user, 2026-10-17: the venue page visibly refreshed).
  let token = 0;
  let shownDate = null; // the day on screen, to know which way the next one lies
  async function show(date, { focus = false } = {}) {
    const mine = ++token;
    fill($("date-weekday"), ...weekdayLine(date, today));
    $("date-day").textContent = fmtDayMonth.format(asDate(date));
    const i = dates.indexOf(date);
    setStep($("prev-day"), dates[i - 1], dates[i - 1] && hrefFor(venue, dates[i - 1], first));
    setStep($("next-day"), dates[i + 1], dates[i + 1] && hrefFor(venue, dates[i + 1], first));
    const todayLink = $("today-link");
    todayLink.classList.toggle("is-here", date === today || !dates.includes(today));
    todayLink.href = hrefFor(venue, today, first);
    todayLink.dataset.date = today;
    renderStrip($("strip"), {
      days: dates.map((d) => ({ date: d, empty: false })),
      current: date,
      today,
      hrefFor: (d) => hrefFor(venue, d, first),
    });

    main.setAttribute("aria-busy", "true");
    main.classList.add("is-swapping");
    let listings;
    try {
      const day = await loadDay(date);
      if (mine !== token) return;
      const here = day.venues.find((x) => x.name === venue.name);
      const now = date === today ? Date.now() : null;
      listings = (here ? here.listings : []).map((e) => renderListing(e, { now }));
    } catch (err) {
      if (mine !== token) return;
      console.error(err);
      // The day head stays, so another day can still be chosen.
      listings = [el("li", { class: "status", role: "alert" },
        "This day couldn’t be loaded. Check your connection and try again.")];
    }
    // The day's date and its arrows head the left column, where the day page has the
    // venue's name; sticky, so the day can be changed from anywhere in a long list.
    fill(main, renderSection({ id: "screenings", head: [$("day-head")], listings }),
      dayFoot(dates[i - 1], dates[i + 1], (d) => hrefFor(venue, d, first)));
    main.classList.remove("is-swapping");
    const dir = !shownDate || shownDate === date ? null : date > shownDate ? "next" : "prev";
    shownDate = date;
    arrive([main], dir);
    tickTimes(main);
    main.setAttribute("aria-busy", "false");
    if (focus) main.focus({ preventScroll: true });
    for (const d of [dates[i + 1], dates[i - 1]]) if (d) loadDay(d).catch(() => {});
  }

  let current = pick(asked);
  function go(date, { push = true } = {}) {
    if (!date || !dates.includes(date)) return;
    const changed = date !== current;
    current = date;
    if (push) history.pushState(null, "", hrefFor(venue, date, first));
    show(date, { focus: changed });
  }

  bindStrip($("strip"));
  document.addEventListener("click", (ev) => {
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    const a = ev.target.closest("a[data-date]");
    if (!a || !a.href) return;
    ev.preventDefault();
    go(a.dataset.date);
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.shiftKey) return;
    if (ev.target.closest("input, textarea, select, [contenteditable]")) return;
    // In the date strip the arrows scroll it, as the browser would (critique 2026-10-19).
    if (ev.target.closest(".strip-list")) return;
    const id = { ArrowLeft: "prev-day", ArrowRight: "next-day" }[ev.key];
    const date = id && $(id).dataset.date;
    if (date) {
      ev.preventDefault();
      go(date);
    }
  });
  // A tab left open: redraw when it comes back, so passed times are struck through.
  keepTime(main);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") show(current);
  });
  window.addEventListener("popstate", () => {
    go(pick(new URLSearchParams(location.search).get("date")), { push: false });
  });

  history.replaceState(null, "", hrefFor(venue, current, first));
  show(current);
}

start();
