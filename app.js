// The day page: reads data/index.json and data/days/<date>.json (see docs/frontend-handoff.md).

import {
  $, el, fill, dayFoot, arrive, staleNote, zurichToday, asDate, fmtDayMonth, fmtFull, fmtFullYear, SITE_NAME, getJson, useIndex, venueHref, todayFrom,
  weekdayLine, renderListing, renderSection, renderStrip, bindStrip, setStep, renderError, tickTimes, keepTime,
  fmtShort, nextDate,
  renderStatus, renderFooter,
} from "./lib.js";

const STORE_KEY = "filters";

const state = {
  index: null,
  date: null,
  english: false,
  curated: true,         // Curated is the default view (user decision, 2026-10-17)
  days: new Map(),      // date -> Promise<day json>
  dayInfo: new Map(),   // date -> index.days entry
};

const todayDate = () => todayFrom(state.index);

// Past days are not shown (user decision, 2026-10-17); the data still carries them.
function visibleDays() {
  const today = todayDate();
  return state.index.days.filter((d) => d.date >= today);
}

// ---------- Storage and URL ----------

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch {
    return {};
  }
}

function writeStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ english: state.english, curated: state.curated }));
  } catch {
    // Storage unavailable (private mode, blocked): the URL still carries the state.
  }
}

function readUrl() {
  const p = new URLSearchParams(location.search);
  const has = p.has("english") || p.has("curated");
  const stored = has ? {} : readStore();
  state.english = has ? p.get("english") === "1" : Boolean(stored.english);
  state.curated = has ? p.get("curated") !== "0" : stored.curated ?? true;
  const date = p.get("date");
  const today = todayDate();
  state.date = date && date >= today && state.dayInfo.has(date) ? date : nearestDay(date && date > today ? date : today);
}

function urlFor(date, english = state.english, curated = state.curated) {
  const p = new URLSearchParams();
  if (date !== todayDate()) p.set("date", date);
  if (english) p.set("english", "1");
  if (!curated) p.set("curated", "0");
  const q = p.toString();
  return q ? `?${q}` : location.pathname;
}

function nearestDay(date) {
  const dates = visibleDays().map((d) => d.date);
  if (!dates.length) return null;
  const later = dates.find((d) => d >= date);
  return later || dates[dates.length - 1];
}

function loadDay(date) {
  if (!state.days.has(date)) {
    const p = getJson(`data/days/${date}.json`);
    p.catch(() => state.days.delete(date));
    state.days.set(date, p);
  }
  return state.days.get(date);
}

// ---------- Filtering ----------

const timeOk = (t, curated = state.curated) => (!state.english || t.english) && (!curated || t.curated);

function filterDay(day, curated = state.curated) {
  const venues = [];
  for (const v of day.venues) {
    const listings = [];
    for (const e of v.listings) {
      const screenings = e.screenings.filter((t) => timeOk(t, curated));
      if (screenings.length) listings.push({ ...e, screenings });
    }
    if (listings.length) venues.push({ ...v, listings });
  }
  return venues;
}

// Index counts cannot say how many times are both English and curated; zero in either means zero.
function dayMayMatch(info) {
  if (state.english && !info.english) return false;
  if (state.curated && !info.curated) return false;
  return info.screenings > 0;
}

// The active filters as words, followed by a space ("English-speaking, curated "). "Curated"
// links to its FAQ answer instead of being explained here (user, 2026-10-19).
function filterWords() {
  const w = [];
  if (state.english) w.push("English-speaking");
  if (state.curated) w.push(el("a", { href: "faq.html#curated" }, "curated"));
  return w.length ? [...w.flatMap((x, i) => (i ? [", ", x] : [x])), " "] : [];
}

// ---------- Rendering ----------

function renderHeader() {
  const date = state.date;
  const today = todayDate();
  fill($("date-weekday"), ...weekdayLine(date, today));
  $("date-day").textContent = fmtDayMonth.format(asDate(date));
  // The year always, day first (user: dates are day first).
  document.title = `${fmtFullYear.format(asDate(date))} · ${SITE_NAME}`;

  const dates = visibleDays().map((d) => d.date);
  const i = dates.indexOf(date);
  setStep($("prev-day"), dates[i - 1], urlFor(dates[i - 1]));
  setStep($("next-day"), dates[i + 1], urlFor(dates[i + 1]));

  const todayLink = $("today-link");
  // Invisible rather than removed, so the arrows never move when it appears.
  todayLink.classList.toggle("is-here", date === today);
  todayLink.href = urlFor(today);
  todayLink.dataset.date = today;

  $("filter-english").setAttribute("aria-pressed", String(state.english));
  $("filter-curated").setAttribute("aria-pressed", String(state.curated));

  fitDayHead();

  renderStrip($("strip"), {
    days: visibleDays().map((info) => ({ date: info.date, empty: !dayMayMatch(info) })),
    current: date,
    today,
    hrefFor: (d) => urlFor(d),
  });
}

// On phones the weekday line carries Today and the date line the arrows; when enlarged
// text makes either line overflow its room, the head falls back to the stacked layout
// (harden 2026-10-19).
function fitDayHead() {
  const head = $("date-heading").closest(".day-head");
  head.classList.remove("is-stacked");
  // The text's own width against the room beside the buttons (padding excluded).
  const over = (n) => {
    const range = document.createRange();
    range.selectNodeContents(n);
    const room = n.clientWidth - parseFloat(getComputedStyle(n).paddingRight);
    return range.getBoundingClientRect().width > room + 1;
  };
  if (over($("date-weekday")) || over($("date-day"))) head.classList.add("is-stacked");
}

const venueId = (v) => `venue-${v.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

// Late at night, with nothing left today, the count says when the next day starts
// (delight, 2026-10-19): "No more curated screenings today · Tomorrow from 10:30".
function pointToNextDay() {
  const shown = state.date;
  const token = renderToken; // a newer render (another filter, another day) wins

  const next = visibleDays().find((d) => d.date > shown && dayMayMatch(d));
  if (!next) return;
  loadDay(next.date).then((day) => {
    if (state.date !== shown || token !== renderToken) return;
    const first = filterDay(day).flatMap((v) => v.listings.flatMap((e) => e.screenings.map((t) => t.time))).sort()[0];
    if (!first) return;
    const when = next.date === nextDate(shown) ? "Tomorrow" : fmtShort.format(asDate(next.date));
    const link = () => el("a", { href: urlFor(next.date), "data-date": next.date }, `${when} from ${first}`);
    // At full size above the finished listing (critique 2026-10-19); in the count line
    // only when that line isn't there.
    const done = document.querySelector(".day-done");
    if (done) done.append(" ", link(), ".");
    else $("count").append(" · ", link());
  }).catch(() => {});
}

// The count is the page's one live region (audit 2026-10-19: the date heading was a
// second one, announcing each day change twice), so it starts with the date for
// screen readers.
const spoken = () => el("span", { class: "visually-hidden" }, `${fmtFull.format(asDate(state.date))}: `);

// `full`: the day without the Curated filter, to say how much it leaves out.
function renderDay(venues, full = null) {
  const main = $("listing");
  const isToday = state.date === todayDate();
  const now = isToday ? Date.now() : null;
  // On today, count only what is still to come. Listings keep their order by first screening,
  // past or not (user decision, 2026-10-17).
  const left = (e) => (now === null ? e.screenings.length : e.screenings.filter((t) => Date.parse(t.start) >= now).length);
  const venueLeft = (v) => v.listings.reduce((m, e) => m + left(e), 0);
  const total = venues.reduce((n, v) => n + venueLeft(v), 0);
  const words = filterWords();
  const cinemas = now === null ? venues.length : venues.filter(venueLeft).length;
  // Curated is on by default; say what it leaves out, as a way to see it (critique
  // 2026-10-19: "14 curated screenings" alone read like thin data).
  const more = full ? full.reduce((n, v) => n + venueLeft(v), 0) - total : 0;
  const moreLink = more > 0
    ? [" · ", el("a", { href: urlFor(state.date, state.english, false), "data-full": "" },
      // Named for what the link does, so it stays true with English-speaking on too.
      `${more} more with Curated off`)]
    : [];

  // Late on a day, "0 … still to come" would read like a fault: say it plainly.
  if (now !== null && total === 0 && venues.length) {
    fill($("count"), spoken(), "No more ", ...words, "screenings today", ...moreLink);
    pointToNextDay();
  } else {
    fill($("count"), spoken(),
      el("strong", {}, String(total)),
      " ", ...words, `${total === 1 ? "screening" : "screenings"}${now === null ? "" : " still to come"}`,
      cinemas ? ` at ${cinemas} ${cinemas === 1 ? "cinema" : "cinemas"}` : "",
      ...moreLink,
    );
  }

  fill($("jump"), ...venues.map((v) => el("li", {},
    el("a", { href: `#${venueId(v)}` }, v.name,
      el("span", { class: "n" }, String(venueLeft(v)))))));
  // Nothing left anywhere: a row of zeros helps nobody (critique 2026-10-19).
  $("jump").parentElement.hidden = venues.length < 2 || (now !== null && total === 0);

  if (!venues.length) {
    fill(main, renderEmpty());
    return;
  }

  const days = visibleDays().map((d) => d.date);
  const at = days.indexOf(state.date);
  const foot = dayFoot(days[at - 1], days[at + 1], (d) => urlFor(d));
  // Today is over: said at full size above what played, which pointToNextDay() ends
  // with the next day's first screening.
  const done = now !== null && total === 0
    ? el("div", { class: "grid" }, el("p", { class: "day-done" }, "That’s all for today."))
    : null;
  fill(main, done, ...venues.map((v) => {
    const id = venueId(v);
    const href = venueHref(v.name, state.date === todayDate() ? null : state.date);
    // The checked address from the venue facts, so the day and venue pages agree.
    const address = (state.index.venues || []).find((x) => x.name === v.name)?.address || v.address;
    const meta = [v.operator !== v.name && !v.name.startsWith(v.operator) ? v.operator : null, address].filter(Boolean).join(" · ");
    return renderSection({
      id,
      head: [
        el("h2", { class: "venue-name", id: `${id}-h` }, href ? el("a", { href }, v.name) : v.name),
        meta ? el("span", { class: "venue-meta" }, meta) : null,
        staleNote(state.index, [...new Set(v.listings.map((e) => e.source))]),
      ],
      listings: v.listings.map((e) => renderListing(e, { now })),
    });
  }), foot);
}

function renderEmpty() {
  const words = filterWords();
  const box = el("div", { class: "status grid" },
    el("p", {}, "No ", ...words, `screenings on ${fmtFull.format(asDate(state.date))}.`));
  const days = visibleDays();
  const target = days.find((d) => d.date > state.date && dayMayMatch(d))
    || [...days].reverse().find((d) => d.date < state.date && dayMayMatch(d));
  if (target) {
    const link = el("a", { href: urlFor(target.date), "data-date": target.date }, fmtFull.format(asDate(target.date)));
    box.append(el("p", {}, target.date > state.date ? "The next is on " : "The closest is on ", link, "."));
  }
  box.append(el("p", {}, el("a", { href: urlFor(state.date, false, false), "data-clear": "" }, "Show everything on this day")));
  return box;
}

// ---------- Flow ----------

let renderToken = 0;
let shownDate = null; // the day on screen, to know which way the next one lies

async function show({ focus = false } = {}) {
  const token = ++renderToken;
  const main = $("listing");
  renderHeader();
  main.setAttribute("aria-busy", "true");
  main.classList.add("is-swapping");
  try {
    const day = await loadDay(state.date);
    if (token !== renderToken) return;
    renderDay(filterDay(day), state.curated ? filterDay(day, false) : null);
    main.classList.remove("is-swapping");
    const dir = !shownDate || shownDate === state.date ? null : state.date > shownDate ? "next" : "prev";
    shownDate = state.date;
    arrive([main, $("date-heading")], dir);
    tickTimes(main);
    main.setAttribute("aria-busy", "false");
    if (focus) main.focus({ preventScroll: true });
    prefetchNeighbours();
  } catch (err) {
    if (token === renderToken) {
      main.classList.remove("is-swapping");
      renderError(main, err);
    }
  }
}

function prefetchNeighbours() {
  const dates = visibleDays().map((d) => d.date);
  const i = dates.indexOf(state.date);
  for (const d of [dates[i + 1], dates[i - 1]]) if (d) loadDay(d).catch(() => {});
}

function go(date, { replace = false } = {}) {
  if (!date || !state.dayInfo.has(date) || date < todayDate()) return;
  const changed = date !== state.date;
  state.date = date;
  history[replace ? "replaceState" : "pushState"](null, "", urlFor(date));
  if (changed && window.scrollY > $("listing").offsetTop) window.scrollTo({ top: 0 });
  show({ focus: changed });
}

function setFilter(name, value) {
  state[name] = value;
  writeStore();
  history.replaceState(null, "", urlFor(state.date));
  show();
}

function bind() {
  bindStrip($("strip"));

  document.addEventListener("click", (ev) => {
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    const a = ev.target.closest("a[data-date], a[data-clear], a[data-full]");
    if (!a) return;
    ev.preventDefault();
    if (a.hasAttribute("data-full")) {
      setFilter("curated", false);
    } else if (a.hasAttribute("data-clear")) {
      state.english = false;
      state.curated = false;
      writeStore();
      go(state.date, { replace: true });
    } else {
      go(a.dataset.date);
    }
  });

  $("filter-english").addEventListener("click", () => setFilter("english", !state.english));
  $("filter-curated").addEventListener("click", () => setFilter("curated", !state.curated));

  document.addEventListener("keydown", (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.shiftKey) return;
    if (ev.target.closest("input, textarea, select, [contenteditable]")) return;
    // In the date strip the arrows scroll it, as the browser would (critique 2026-10-19).
    if (ev.target.closest(".strip-list")) return;
    const id = { ArrowLeft: "prev-day", ArrowRight: "next-day" }[ev.key];
    if (!id) return;
    const date = $(id).dataset.date;
    if (date) {
      ev.preventDefault();
      go(date);
    }
  });

  // At most once per frame while a window is being resized.
  let fitting = false;
  window.addEventListener("resize", () => {
    if (fitting) return;
    fitting = true;
    requestAnimationFrame(() => { fitting = false; fitDayHead(); });
  }, { passive: true });
  // Measured again once Heros is in: the fallback font is narrower.
  document.fonts?.ready.then(fitDayHead);
  window.addEventListener("popstate", () => {
    readUrl();
    show();
  });

  // A tab left open: when it comes back into view, redraw, so passed times are struck
  // through and a new day becomes "Today".
  let shownOn = zurichToday();
  keepTime($("listing"));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (zurichToday() !== shownOn) {
      shownOn = zurichToday();
      readUrl();
      history.replaceState(null, "", urlFor(state.date));
    }
    show();
  });
}

async function start() {
  try {
    state.index = await getJson("data/index.json");
  } catch (err) {
    renderError($("listing"), err);
    return;
  }
  useIndex(state.index);
  for (const d of state.index.days) state.dayInfo.set(d.date, d);
  renderFooter(state.index);
  if (!visibleDays().length) {
    renderStatus($("listing"), "No screenings are listed yet.");
    return;
  }
  readUrl();
  history.replaceState(null, "", urlFor(state.date));
  bind();
  show();
}

start();
