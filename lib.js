// Shared by every page: data loading, dates, formatting and the listing renderer.
// Data contract: docs/frontend-handoff.md.

export const TZ = "Europe/Zurich";
export const SITE_NAME = "ZKV"; // in tab titles; the masthead reads "ZKV: Zürcher Kinoverbund"
const STALE_HOURS = 36;

const SOURCE_NAMES = {
  arena: "Arena Sihlcity",
  bluecinema: "blue Cinema",
  filmstelle: "Filmstelle",
  kinokoni: "KINOKONI",
  riffraff_houdini: "Riffraff and Houdini",
  xenix: "Xenix",
  arthouse: "Arthouse",
  filmpodium: "Filmpodium",
};

// "Digital HD" is how Xenix and Filmpodium write it: an HD file, not a DCP.
export const FORMATS = { dcp: "DCP", "35mm": "35MM", "16mm": "16MM", "70mm": "70MM", digital: "Digital HD", bluray: "Blu-ray" };

export const $ = (id) => document.getElementById(id);

// Replace a node's content. Unlike replaceChildren, which prints null as "null",
// missing parts (null, undefined, false) are skipped.
export function fill(node, ...kids) {
  node.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
}

export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) n.append(k);
  return n;
}

// ---------- Dates ----------

export const asDate = (iso) => new Date(`${iso}T12:00:00Z`);

const fmt = (opts) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts });
export const fmtWeekday = fmt({ weekday: "long" });
export const fmtDayMonth = fmt({ day: "numeric", month: "long" });
export const fmtShortWd = fmt({ weekday: "short" });
export const fmtMonth = fmt({ month: "short" });
const fmtShortDate = fmt({ weekday: "short", day: "numeric", month: "short" });
const fmtFullDay = fmt({ weekday: "long", day: "numeric", month: "long" });
export const fmtFullYear = fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" });

const thisYear = () => asDate(zurichToday()).getUTCFullYear();

// The year only when it is not this year's.
export const fmtFull = {
  format: (d) => (d.getUTCFullYear() === thisYear() ? fmtFullDay : fmtFullYear).format(d),
};
export const fmtShort = {
  format: (d) => fmtShortDate.format(d) + (d.getUTCFullYear() === thisYear() ? "" : ` ${d.getUTCFullYear()}`),
};

export function zurichToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function nextDate(iso) {
  const d = asDate(iso);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// The build's date, or the visitor's Zürich date if it is later and has listings.
// The visitor's Zürich date, or the build's if the visitor's clock is behind it. When the
// data is stale, "Today" stays the real day and the page says the data is old (staleNotice).
export function todayFrom(index) {
  const local = zurichToday();
  return local > index.today ? local : index.today;
}

// "These listings were last updated …" when the daily build is more than 36 hours old,
// placed under the masthead's top bar. The per-cinema notice stays in the footer.
export function staleNotice(index) {
  const gen = new Date(index.generated_at);
  if (!(Date.now() - gen > STALE_HOURS * 36e5)) return;
  const when = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(gen);
  const bar = document.querySelector(".topbar");
  if (!bar || document.querySelector(".stale-notice")) return;
  bar.after(el("p", { class: "stale-notice", role: "status" },
    el("strong", {}, "These listings were last updated on " + when + "."),
    " They may be out of date; check with the cinema."));
}

// "Today, Saturday" / "Tomorrow, Sunday" / "Monday". "Tomorrow" stays ink:
// red means now, and the red Today button already says so.
export function weekdayLine(date, today) {
  const weekday = fmtWeekday.format(asDate(date));
  if (date === today) return [el("span", { class: "today" }, "Today"), `, ${weekday}`];
  if (date === nextDate(today)) return [`Tomorrow, ${weekday}`];
  return [weekday];
}

// ---------- Data and links ----------

// Gives up after 15 s, so a stalled connection ends in the retry message, not "Loading…".
export async function getJson(url, { timeout = 15000 } = {}) {
  const res = await fetch(url, { cache: "no-cache", signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

const links = { venues: new Map(), series: new Map(), names: new Map() };

// Remember the slugs the build gave venues and series, so names can link.
export function useIndex(index) {
  for (const v of index.venues || []) links.venues.set(v.name, v.slug);
  for (const [name, slug] of Object.entries(index.series || {})) links.series.set(name, slug);
  for (const [name, shown] of Object.entries(index.series_names || {})) links.names.set(name, shown);
}

// A name the build shows as "<venue's name> (<English>)": the venue's own German and the
// English apart, or null where there is no translation. Zürich venues write German.
export function splitShown(shown, name) {
  if (!name || shown === name || !shown.startsWith(`${name} (`) || !shown.endsWith(")")) return null;
  return { german: name, english: shown.slice(name.length + 2, -1) };
}

// A series' name as shown: the English where the build has one, else the venue's own
// (user, 2026-10-24: English first; the German goes on a quieter line, `seriesGerman`).
export function seriesName(name) {
  const parts = splitShown(links.names.get(name) || name, name);
  return parts ? parts.english : name;
}

// The venue's own name of a translated series, or null.
export function seriesGerman(name) {
  return splitShown(links.names.get(name) || name, name) ? name : null;
}

// The venue's German name on a quieter line (Label size, Graphite) under an English one.
export const germanLine = (text, className) => el("p", { class: className, lang: "de" }, text);

export function venueHref(name, date) {
  const slug = links.venues.get(name);
  if (!slug) return null;
  return `venue.html?v=${encodeURIComponent(slug)}${date ? `&date=${date}` : ""}`;
}

// A series page by its slug, or by name when only one operator uses that name. Listings
// carry their own slugs (`series_slugs`): two operators' "Ladies Night" are two series.
export function seriesHref(name, slug = links.series.get(name)) {
  return slug ? `series.html?s=${encodeURIComponent(slug)}` : null;
}

// A film's page: every screening of it, at every venue (user, 2026-10-19). Only films
// shown more than once have one (`film_slug`).
export const filmHref = (slug) => (slug ? `film.html?f=${encodeURIComponent(slug)}` : null);

// ---------- Formatting ----------


export const FILM_FORMATS = new Set(["35mm", "16mm", "70mm"]);
export const onFilm = (f) => Boolean(f && FILM_FORMATS.has(f.format));

// Film-strip icon from Bootstrap Icons 1.11.3 (MIT License, (c) 2019-2024 The Bootstrap
// Authors), after the format of a screening projected from a print, as Screen Slate does.
const FILM_PATH = "M0 1a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1zm4 0v6h8V1zm8 8H4v6h8zM1 1v2h2V1zm2 3H1v2h2zM1 7v2h2V7zm2 3H1v2h2zm-2 3v2h2v-2zM15 1h-2v2h2zm-2 3v2h2V4zm2 3h-2v2h2zm-2 3v2h2v-2zm2 3h-2v2h2z";

export function svgIcon(path, className = "icon") {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", className);
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", path);
  svg.append(p);
  return svg;
}

// The format as shown: "35MM" plus the film icon for a print, else the plain tag.
function formatNode(f, tag) {
  if (!tag) return null;
  return onFilm(f) ? el("span", { class: "on-film" }, tag, " ", svgIcon(FILM_PATH, "icon icon--film")) : tag;
}

export function formatTag(f) {
  if (!f) return null;
  const parts = [];
  if (FORMATS[f.format]) parts.push(FORMATS[f.format]);
  for (const p of f.presentation || []) parts.push(p.replace(/-/g, " ").toUpperCase());
  return parts.length ? parts.join(" ") : null;
}

const allSame = (arr) => arr.every((x) => x === arr[0]);

// A version in plain English (user, 2026-10-19): "English audio, German & French
// subtitles". Where the venue only says "original version", TMDB's original language
// names it ("Japanese audio"); without it, "Original audio".
const languageNames = new Intl.DisplayNames(["en"], { type: "language" });
function languageName(code) {
  try {
    const name = code && languageNames.of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}
const andList = (items) => (items.length < 2 ? items.join("")
  : `${items.slice(0, -1).join(", ")} & ${items[items.length - 1]}`);

export function langText(lang, original = null) {
  const d = lang && lang.description;
  if (!d || d === "Language not stated") return null;
  if (d === "No dialogue" || d === "Various languages") return d;
  const [audio, subs] = d.split("; subtitles: ");
  const subList = subs ? subs.split(", ") : [];
  // TMDB's language for "original version", unless the venue subtitles the film in that
  // very language ("OV/en" on a film TMDB calls English): then TMDB is likely wrong.
  const ov = languageName(original);
  const ovName = ov && !subList.includes(ov) ? ov : "Original";
  let spoken;
  if (audio === "Silent") spoken = "Silent";
  else {
    const names = [...new Set(audio.split(", ").map((n) => (n === "Original version" ? ovName : n)))];
    spoken = `${andList(names)} audio`; // "Original audio", "Original & German audio"
  }
  // One language for both reads once: "English audio and subtitles" (user, 2026-10-24).
  const names = audio.split(", ");
  if (subList.length === 1 && names.length === 1 && names[0] === subList[0]) return `${spoken} and subtitles`;
  return subList.length ? `${spoken}, ${andList(subList)} subtitles` : spoken;
}

// A film turning 25, 50, 75 or 100 in the year it is shown says so (delight,
// 2026-10-19): "1976 (50 years ago)". A fact about the film, not a claim that the
// screening marks it; rare enough to stay a find.
function yearText(year, shownIn) {
  const age = shownIn - year;
  // The anniversary in sentence case, so it doesn't shout inside the capitals of an info
  // line (critique 2026-10-19).
  return age > 0 && age % 25 === 0
    ? el("span", {}, String(year), el("span", { class: "anniv" }, ` (${age} years ago)`))
    : String(year);
}

// The site's title form: "Original (English)", or the title as the venue gives it.
export function titleNodes(e) {
  // Original title isolated so that right-to-left scripts don't reorder the English half.
  // The original reads in its own language (WCAG 3.1.2): the film's original language, from
  // TMDB, marks only the original part. TMDB's "xx" (no language) is left unmarked and its "cn"
  // is Cantonese, "yue" in HTML.
  const o = e.original_title;
  const en = e.english_title;
  const tmdbLang = e.original_language;
  const lang = !tmdbLang || tmdbLang === "xx" ? null : tmdbLang === "cn" ? "yue" : tmdbLang;
  // A program's title is "<venue's name> (<English name>)" once translated: the English
  // is the headline here; `programParts` gives the venue's name for the line below.
  const parts = programParts(e);
  if (parts) return shortLabelled(parts.english);
  if (o && en && e.title !== o && e.title.startsWith(o)) {
    return [el("bdi", { lang }, o), ` (${en})`];
  }
  // With no English title the venue's own title shows; only a German film's is surely German.
  const titleLang = e.title === o || (!en && lang === "de") ? lang : null;
  return shortLabelled(e.title, titleLang);
}

// A feature with a short before it is titled "Feature & short: Short" in the data; the
// page sets the lowercase "short:" as the label SHORT, like GUEST (user, 2026-10-24).
const SHORT_UNDER = 40; // minutes: shorter is a short, in a program with a feature
const SHORT_MARK = " & short: ";
function shortLabelled(title, lang = null) {
  const at = title.indexOf(SHORT_MARK);
  if (at < 0) return [el("bdi", { lang }, title)];
  return [
    el("bdi", { lang }, title.slice(0, at)), " & ",
    el("span", { class: "note-label" }, "Short"), " ",
    el("bdi", { lang }, title.slice(at + SHORT_MARK.length)),
  ];
}

// A translated program's venue name and English, or null.
function programParts(e) {
  return e.kind === "program" && e.venue_title ? splitShown(e.title, e.venue_title) : null;
}

function infoLine(parts) {
  const kept = parts.filter((p) => p != null && p !== "");
  if (!kept.length) return null;
  const n = el("p", { class: "info" });
  kept.forEach((p, i) => {
    if (i) n.append(", ");
    n.append(p);
  });
  return n;
}

// ---------- Listings ----------

// "DOUBLE FEATURE" next to the series "Double Feature «Halloween»" says the same thing twice.
const inSeries = (e, label) => e.series.some((s) => s.toLowerCase().includes(label.toLowerCase()));

/**
 * One film (or program) with its screenings.
 * `now`: a timestamp on today's listing (passed times are struck through), else null.
 * `dates`: on a series page, [{date, screenings}] shown as timetable rows instead of one line of times.
 * `onSeries`: on a series page, that series' name, which is then not repeated above each film.
 * `place`: a venue named at the end of the info line, linked (a series at several venues).
 * `today`: the date that timetable rows mark as "Today".
 * `onFilm`: on the film's own page, which then gets no "All dates" link.
 */
// "Translated" after a text the build had machine-translated (user, 2026-10-24;
// look: agent, pending user review). Words, not an icon or a tooltip, so it works
// on touch and for screen readers; hand-kept English is unmarked.
export const translatedMark = () => el("span", { class: "machine" }, "Translated");

export function renderListing(e, { now = null, dates = null, onSeries = null, place = null, today = null, onFilm = false } = {}) {
  const times = dates ? dates.flatMap((d) => d.screenings) : e.screenings;
  // The year of the first screening listed, for anniversaries.
  const shownIn = Number((times[0]?.start || "").slice(0, 4)) || new Date().getFullYear();

  const tags = [
    // First listed at this venue in the last few days (user, 2026-10-19).
    e.new ? el("span", { class: "tag-label tag-new" }, "New") : null,
    ...e.series.filter((s) => s !== onSeries).map((s) => {
      const href = seriesHref(s, (e.series_slugs || {})[s] || links.series.get(s));
      return el("span", { class: "tag-series", dir: "auto" }, href ? el("a", { href }, seriesName(s)) : seriesName(s));
    }),
    ...e.labels.filter((l) => !inSeries(e, l)).map((l) => el("span", { class: "tag-label", dir: "auto" },
      l, (e.labels_translated || []).includes(l) ? translatedMark() : null)),
  ];

  const title = el("h3", { class: "title" },
    e.film_url ? el("a", { href: e.film_url }, titleNodes(e)) : titleNodes(e),
    e.subtitle ? el("span", { class: "subtitle" }, ` — ${e.subtitle}`, e.subtitle_translated ? translatedMark() : null) : null);

  const langs = times.map((t) => langText(t.language, e.original_language));
  const formats = times.map((t) => formatTag(t.format));
  const labelsPerTime = times.map((t) => (t.label && !inSeries(e, t.label) ? t.label : null));
  const notes = times.map((t) => t.note || null);
  // A note left in German says so, for screen readers (audit 2026-10-19).
  const noteLang = (i) => times[i].note_lang || null;
  const shared = { lang: allSame(langs), format: allSame(formats), label: allSame(labelsPerTime), note: allSame(notes) };

  // A program whose films all share a director, year, format or language shows it once,
  // on the program's line, unless the venue gives the program its own (user, 2026-10-17).
  const kids = e.kind === "program" ? e.program_films : [];
  const common = (get) => {
    if (kids.length < 2) return null;
    const values = kids.map(get);
    return values.every((v) => v && v === values[0]) ? values[0] : null;
  };
  const lifted = {
    // A mystery's "?" stays with its hidden films.
    directors: e.directors.length || e.mystery
      ? null
      : common((c) => (c.directors.length ? c.directors.join(", ") : null)),
    year: e.year ? null : common((c) => c.year || null),
  };
  const programFormat = shared.format ? formats[0] : null;
  const programLang = shared.lang ? langs[0] : null;
  const omit = {
    directors: Boolean(lifted.directors),
    year: Boolean(lifted.year),
    format: Boolean(programFormat) && kids.every((c) => formatTag(c.format) === programFormat),
    // The program's start, which its first film takes when the venue gives it none.
    startAt: times.length === 1 ? times[0].time : null,
    timed: kids.some((c) => c.start),
    shownIn,
    // A film under 40 minutes in a program that also has a feature (40 or more) is a short.
    hasFeature: kids.some((c) => (c.runtime_min || 0) >= SHORT_UNDER),
    lang: Boolean(programLang) && kids.every((c) => c.language && langText(c.language, c.original_language) === programLang),
  };

  let info = infoLine([
    e.directors.length ? e.directors.join(", ") : lifted.directors,
    e.year ? yearText(e.year, shownIn) : lifted.year ? yearText(lifted.year, shownIn) : null,
    e.runtime_min ? `${e.runtime_min}M` : null,
    shared.format ? formatNode(times[0].format, formats[0]) : null,
    place ? (venueHref(place) ? el("a", { href: venueHref(place), class: "info-place" }, place) : place) : null,
  ]);

  // The film's other screenings, here and at other venues, on its own page: at the end
  // of the info line, which already describes the film (quieter, 2026-10-19: on a line
  // of its own it repeated under most listings of a day).
  if (!onFilm && e.film_slug) {
    // The dot holds on to the word before it, so a wrapped line never starts with it.
    const more = el("span", { class: "info-more" }, info ? "\u00a0· " : null,
      el("a", { href: filmHref(e.film_slug) }, "All dates",
        el("span", { class: "visually-hidden" }, ` for ${e.title}`)));
    if (info) info.append(more);
    else info = el("p", { class: "info" }, more);
  }

  const timeItem = (t) => {
    const i = times.indexOf(t);
    const extra = [
      // Grouped by version on a day's listing; beside the time only on series pages.
      dates && !shared.lang && langs[i] ? langs[i] : null,
      !shared.format && formats[i] ? formatNode(t.format, formats[i]) : null,
      !shared.label && labelsPerTime[i]
        ? (times[i].label_translated ? el("span", {}, labelsPerTime[i], translatedMark()) : labelsPerTime[i])
        : null,
    ].filter(Boolean);
    const gone = now !== null && Date.parse(t.start) < now;
    // No ticket links (user decision): a wrong match would sell the wrong ticket.
    // On today's listing the start is kept on the item, so tickTimes() can count it down.
    return el("li", { class: `time${gone ? " is-gone" : ""}`, "data-start": now !== null ? t.start : null },
      el("span", {}, el("time", { datetime: t.start }, t.time),
        gone ? el("span", { class: "visually-hidden" }, ", already started") : null),
      // The film's last screening here, set like a venue label next to its time.
      t.last ? el("span", { class: "t-last" }, "Last screening") : null,
      extra.length ? el("span", { class: "t-extra" }, extra.flatMap((x, j) => (j ? [" ", x] : [x]))) : null);
  };
  const timeList = (list) => el("ul", { class: "times", "aria-label": "Screenings" }, list.map(timeItem));

  // Screenings in different versions are grouped under each version, in order of each
  // version's first screening (user, 2026-10-19).
  const versions = [...new Set(langs)];
  const screeningList = dates
    ? el("ul", { class: "dates" }, dates.map((d) => el("li", { class: "date-row" },
      // Each date opens that day's listings, a way on from a series or film page
      // (critique 2026-10-19).
      el("span", { class: `date-label${d.date === today ? " is-today" : ""}` },
        el("a", { href: d.date === today ? "./" : `./?date=${d.date}` },
          el("time", { datetime: d.date }, d.date === today ? "Today" : fmtShort.format(asDate(d.date))))),
      timeList(d.screenings))))
    : shared.lang || versions.length < 2
      ? timeList(times)
      : el("div", { class: "versions" }, versions.map((v) => el("div", { class: "version" },
        v ? el("p", { class: "version-label" }, v) : null,
        timeList(times.filter((_, i) => langs[i] === v)))));

  const noteItems = [];
  // Venue notes are in any language: each sets its own text direction.
  // GUEST opens the note that names the guest, rather than crowding the time row
  // (quieter, 2026-10-19: beside a time at most the countdown and LAST SCREENING).
  const guestLabel = (i) => (times[i].guest ? [el("span", { class: "note-label" }, "Guest"), " "] : []);
  if (shared.note && notes[0]) {
    noteItems.push(el("li", {}, ...guestLabel(0), el("span", { dir: "auto", lang: noteLang(0) }, notes[0]), times[0].note_translated ? translatedMark() : null));
  }
  else if (!shared.note) {
    const when = (t) => (dates ? `${fmtShort.format(asDate(t.start.slice(0, 10)))} ${t.time}` : t.time);
    times.forEach((t, i) => {
      if (notes[i]) noteItems.push(el("li", {}, el("span", { class: "at" }, when(t)), ...guestLabel(i), el("bdi", { lang: noteLang(i) }, notes[i]), times[i].note_translated ? translatedMark() : null));
    });
  }
  if (shared.label && labelsPerTime[0] && !e.labels.includes(labelsPerTime[0]) && !inSeries(e, labelsPerTime[0])) {
    tags.push(el("span", { class: "tag-label" }, labelsPerTime[0], times[0].label_translated ? translatedMark() : null));
  }

  const programFilms = e.kind === "program" && e.program_films.length
    ? el("ul", { class: "program-films" }, e.program_films.map((c, i) => renderProgramFilm(c, omit, i)))
    : null;

  // A program's screening is when the program starts, so it sits under the program's
  // title, with its notes, before the films (user, 2026-10-17).
  const notesList = noteItems.length ? el("ul", { class: "notes" }, noteItems) : null;
  // The language on its own line in sentence case: spelled out, it made the uppercase
  // info line long and slow to read (critique 2026-10-19).
  const langLine = shared.lang && langs[0] ? el("p", { class: "lang" }, langs[0]) : null;
  const german = programParts(e);
  return el("li", { class: "entry" },
    tags.some(Boolean) ? el("p", { class: "tags" }, tags) : null,
    title,
    german ? germanLine(german.german, "title-de") : null,
    info,
    langLine,
    programFilms ? [screeningList, notesList, programFilms] : [screeningList, notesList]);
}

// "10:30" from a venue's timetable, or from a hand-kept full date-time.
const hhmm = (start) => (start && start.length > 5 ? start.slice(11, 16) : start || null);

// `omit`: what the program's own line already says for every film.
// When any film of a program has a start time, the times run in their own column, like a
// timetable, and the first film takes the program's start (user, 2026-10-19: times mixed
// into the titles read badly; repeating the program's time keeps the column complete).
function renderProgramFilm(c, omit = {}, i = 0) {
  // A film TMDB knows reads like a main title ("Original (English)"); otherwise the venue's
  // title, with its own original title when it gives one.
  const o = c.original_title && c.original_title !== c.title ? c.original_title : null;
  // A surprise film ("?" in the data) reads "Mystery film" in graphite, so it doesn't
  // look like missing data (user, 2026-10-19).
  const mystery = c.title === "?";
  const name = mystery ? el("span", { class: "program-film-mystery" }, "Mystery film")
    : c.english_title ? titleNodes(c) : [el("bdi", {}, c.title), o ? [" (", el("bdi", {}, o), ")"] : null];
  const start = hhmm(c.start) || (i === 0 ? omit.startAt : null);
  return el("li", { class: `program-film${omit.timed ? " has-time" : ""}` },
    omit.timed ? el("span", { class: "program-film-start" }, start ? el("time", {}, start) : null) : null,
    el("div", { class: "program-film-body" },
    el("p", { class: "program-film-title" },
      omit.hasFeature && !mystery && c.runtime_min && c.runtime_min < SHORT_UNDER
        ? [el("span", { class: "note-label" }, "Short"), " "] : null,
      name),
    infoLine([
      c.directors.length && !omit.directors && !mystery ? c.directors.join(", ") : null,
      c.year && !omit.year ? yearText(c.year, omit.shownIn) : null,
      c.runtime_min ? `${c.runtime_min}M` : null,
      omit.format ? null : formatNode(c.format, formatTag(c.format)),
    ]),
    c.language && !omit.lang && langText(c.language, c.original_language)
      ? el("p", { class: "lang" }, langText(c.language, c.original_language)) : null,
    c.notes.length ? el("ul", { class: "notes" }, c.notes.map((n, k) => el("li", { dir: "auto", lang: (c.notes_lang || [])[k] || null }, n, (c.notes_translated || [])[k] ? translatedMark() : null))) : null));
}

// A venue section on the timetable grid: `head` in the left column, listings on the right.
export function renderSection({ id, head, listings }) {
  return el("section", { class: "venue", id, "aria-labelledby": `${id}-h` },
    el("div", { class: "venue-inner" },
      el("div", { class: "venue-head" }, el("div", {}, ...head)),
      el("ol", { class: "entries" }, listings)));
}

// ---------- Date strip ----------

/**
 * The row of days. `days`: [{date, empty}]; `hrefFor(date)` gives each day's link.
 * Days are marked with data-date so the day page can take over the click.
 */
export function renderStrip(list, { days, current, today, hrefFor }) {
  // Where the marker was, to slide it from there (the strip is rebuilt each time).
  const old = list.querySelector('[aria-current="date"]');
  const from = old ? { x: old.offsetLeft, w: old.offsetWidth } : null;
  let prevMonth = null;
  let prevTime = null;
  const items = days.map(({ date, empty }) => {
    const d = asDate(date);
    const month = date.slice(0, 7);
    const newMonth = prevMonth !== null && month !== prevMonth;
    // Days without screenings have no file: open a gap so the strip doesn't read as continuous.
    const gap = prevTime !== null && d - prevTime > 864e5;
    prevMonth = month;
    prevTime = d;
    const a = el("a", {
      class: ["strip-day", date === today && "is-today", empty && "is-empty", (newMonth || gap) && "month-start"]
        .filter(Boolean).join(" "),
      href: hrefFor(date),
      "data-date": date,
      "aria-current": date === current ? "date" : null,
      "aria-label": `${date === today ? "Today, " : ""}${fmtFull.format(d)}${empty ? ", nothing matches the filters" : ""}`,
    },
    el("span", { class: "wd", "aria-hidden": "true" }, date === today ? "Today" : fmtShortWd.format(d)),
    el("span", { class: "dn", "aria-hidden": "true" }, String(d.getUTCDate()),
      newMonth ? el("span", { class: "mo" }, fmtMonth.format(d)) : null));
    return el("li", {}, a);
  });
  fill(list, ...items);
  const selected = list.querySelector('[aria-current="date"]');
  if (selected) {
    placeMarker(list, selected, from);
    const left = selected.offsetLeft - list.clientWidth / 2 + selected.offsetWidth / 2;
    // Instant: the edge check below needs the final position. The bar's slide is in
    // the strip's own coordinates, so it still reads as travel.
    list.scrollTo({ left: Math.max(0, left) });
  }
  markStripEdges(list);
}

// ---------- Motion ----------

const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
export const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The one authored motion (animate pass, 2026-10-19): the black bar that marks the
// day travels along the strip to the day chosen, so the week reads as one timeline.
// Without motion it simply sits on the day.
function placeMarker(list, day, from) {
  const bar = el("li", { class: "strip-marker", "aria-hidden": "true" });
  bar.style.width = `${day.offsetWidth}px`;
  bar.style.transform = `translateX(${day.offsetLeft}px)`;
  list.append(bar);
  list.classList.add("has-marker");
  if (!from || calm() || from.x === day.offsetLeft) return;
  bar.animate([
    { transform: `translateX(${from.x}px) scaleX(${from.w / day.offsetWidth})` },
    { transform: `translateX(${day.offsetLeft}px)` },
  ], { duration: 340, easing: EASE_OUT });
}

/**
 * A new day's listing arrives from the side the day lies on in the strip: later days
 * from the right, earlier ones from the left. `dir` is "next", "prev" or null (no
 * movement, only the fade back from the dimmed loading state).
 */
export function arrive(nodes, dir) {
  const dx = !dir || calm() ? 0 : dir === "next" ? 16 : -16;
  for (const node of nodes) {
    if (!node) continue;
    node.getAnimations().forEach((a) => a.cancel()); // a quick second click restarts it
    node.animate([
      { opacity: 0.35, transform: `translateX(${dx}px)` },
      { opacity: 1, transform: "none" },
    ], { duration: dx ? 320 : 200, easing: EASE_OUT });
  }
}

// Scrolled to the very end, the strip can't snap a whole day to the left edge; the day
// cut by the edge is hidden rather than shown as a sliver ("ED 5").
export function markStripEdges(list) {
  // Every read first, then the writes, so no class change forces a layout between
  // measurements (optimize 2026-10-19).
  const left = list.scrollLeft;
  const right = left + list.clientWidth;
  const atEnd = left > 1 && left >= list.scrollWidth - list.clientWidth - 1;
  // On wide displays no one swipes, so a day cut by the right edge looks broken: it is
  // hidden and the strip ends on a whole day (user, 2026-10-19). Phones keep the cut,
  // their cue that the strip swipes.
  const wide = window.matchMedia("(min-width: 900px)").matches;
  const days = [...list.children];
  const cut = days.map((li) => {
    const start = li.offsetLeft;
    const end = start + li.offsetWidth;
    return (atEnd && start < left - 1 && end > left + 1) || (wide && start < right - 1 && end > right + 1);
  });
  days.forEach((li, i) => li.classList.toggle("is-cut", cut[i]));
}

// At most one check per frame, however many scroll events a swipe fires.
export function bindStrip(list) {
  let queued = false;
  const check = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      markStripEdges(list);
    });
  };
  list.addEventListener("scroll", check, { passive: true });
  window.addEventListener("resize", check, { passive: true });
}

// Previous / next day at the end of a long listing, so the day can be changed without
// scrolling back up (critique: phone users). Links carry data-date for in-page navigation.
export function dayFoot(prev, next, hrefFor) {
  if (!prev && !next) return null;
  const link = (date, rel, label) => (date
    ? el("a", { href: hrefFor(date), "data-date": date, rel, class: `day-foot-${rel}` },
      el("span", { class: "day-foot-label" }, label), fmtFull.format(asDate(date)))
    : el("span"));
  return el("nav", { class: "day-foot grid", "aria-label": "Other days" },
    link(prev, "prev", "Previous day"), link(next, "next", "Next day"));
}

// Previous / next day arrows.
export function setStep(a, date, href) {
  if (date) {
    a.href = href;
    a.dataset.date = date;
    a.removeAttribute("aria-disabled");
    a.setAttribute("aria-label", `${a.id === "prev-day" ? "Previous day" : "Next day"}: ${fmtFull.format(asDate(date))}`);
  } else {
    a.removeAttribute("href");
    delete a.dataset.date;
    a.setAttribute("aria-disabled", "true");
  }
}

// ---------- Page states ----------

export function renderError(main, err, what = "The listings couldn’t be loaded.") {
  console.error(err);
  const box = el("div", { class: "status grid", role: "alert" },
    el("p", {}, `${what} Check your connection and try again.`),
    el("button", { type: "button" }, "Try again"));
  box.querySelector("button").addEventListener("click", () => location.reload());
  fill(main, box);
  main.setAttribute("aria-busy", "false");
}

export function renderStatus(main, ...lines) {
  // Each line a string or a list of nodes; missing lines are skipped.
  fill(main, el("div", { class: "status grid" }, lines.filter((l) => l != null).map((l) => el("p", {}, l))));
  main.setAttribute("aria-busy", "false");
}

// Sources whose last run failed or is more than STALE_HOURS older than the build.
export function staleSources(index) {
  const gen = new Date(index.generated_at);
  return new Map(Object.entries(index.sources || {})
    .filter(([, s]) => !s.ok || (gen - new Date(s.run_at)) / 36e5 > STALE_HOURS));
}

// Under a venue fed by a stale source: the warning where its times are read, not only
// in the footer (critique 2026-10-19).
// With English-speaking on, the day listing hides other screenings; venue and film
// pages don't, and say so (critique 2026-10-19).
export function filterNote() {
  try {
    const stored = JSON.parse(localStorage.getItem("filters") || "{}");
    return stored.english
      ? el("p", { class: "fact-note" }, "Every screening is listed here, not only English-speaking ones.")
      : null;
  } catch {
    return null;
  }
}

// The date a venue's data stopped updating ("Sat 17 Oct"), null when it is current, or
// "" when it is stale with no known date.
export function staleSince(index, sources) {
  const stale = staleSources(index);
  if (!(sources || []).some((s) => stale.has(s))) return null;
  const runs = sources.filter((s) => stale.has(s)).map((s) => stale.get(s).run_at).filter(Boolean);
  return runs.length ? fmtShort.format(new Date(runs.sort()[0])) : "";
}

export function staleNote(index, sources) {
  const since = staleSince(index, sources);
  if (since === null) return null;
  return el("p", { class: "venue-stale" },
    since ? `Not updated since ${since}; check with the cinema.` : "May be out of date; check with the cinema.");
}

export function renderFooter(index) {
  staleNotice(index);
  const gen = new Date(index.generated_at);
  const when = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(gen);
  $("updated").textContent = `Updated ${when}`;

  // Worded like the note under each affected venue (clarify, 2026-10-19).
  const staleMap = staleSources(index);
  const stale = [...staleMap.keys()].map((k) => SOURCE_NAMES[k] || k);
  $("stale").hidden = !stale.length;
  if (stale.length) {
    const runs = [...staleMap.values()].map((s) => s.run_at).filter(Boolean).sort();
    const since = runs.length ? ` since ${fmtShort.format(new Date(runs[0]))}` : "";
    // "and" in a sentence; the language lines' "&" is for their compact form.
    const names = stale.length < 2 ? stale.join("") : `${stale.slice(0, -1).join(", ")} and ${stale.at(-1)}`;
    $("stale").textContent = `${names} ${stale.length === 1 ? "hasn’t" : "haven’t"} been updated${since}; check with the cinema.`;
  }
}

// ---------- Theme ----------

// Auto follows the system; Light or Dark is kept on this device (user, 2026-10-19).
// The pages' <head> applies a saved choice before paint; this adds the footer control.
const THEME_KEY = "zkv-theme";
const THEME_GROUND = { light: "#ffffff", dark: "#111111" };

function readTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "auto";
  } catch {
    return "auto";
  }
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "auto") delete root.dataset.theme;
  else root.dataset.theme = theme;
  // The phone's top bar follows the choice; Auto restores the per-scheme values.
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.dataset.auto ??= meta.content;
    meta.content = theme === "auto" ? meta.dataset.auto : THEME_GROUND[theme];
  }
}

function mountThemeChoice() {
  const updated = document.getElementById("updated");
  if (!updated) return;
  const current = readTheme();
  const choices = ["auto", "light", "dark"].map((t) => el("button", {
    type: "button", "aria-pressed": String(t === current), "data-theme-choice": t,
  }, t[0].toUpperCase() + t.slice(1)));
  const line = el("p", { class: "theme-choice", role: "group", "aria-label": "Theme" },
    "Theme: ", ...choices.flatMap((b, i) => (i ? [" · ", b] : [b])));
  line.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-theme-choice]");
    if (!b) return;
    const theme = b.dataset.themeChoice;
    try {
      if (theme === "auto") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Private mode: the choice holds for this page only.
    }
    applyTheme(theme);
    for (const x of choices) x.setAttribute("aria-pressed", String(x === b));
  });
  updated.after(line);
  applyTheme(current);
}

mountThemeChoice();

// ---------- Now ----------

// Today's page reads like a departure board (delight, 2026-10-19): a screening starting
// within SOON_MINUTES says so in red, the color that means now ("IN 12 MIN"), and
// started times strike themselves through, without a reload.
const SOON_MINUTES = 45;

export function tickTimes(root, now = Date.now()) {
  for (const li of root.querySelectorAll("li.time[data-start]")) {
    const start = Date.parse(li.dataset.start);
    const gone = start < now;
    const head = li.firstElementChild;
    if (gone !== li.classList.contains("is-gone")) {
      li.classList.toggle("is-gone", gone);
      const note = head.querySelector(".visually-hidden");
      if (gone && !note) head.append(el("span", { class: "visually-hidden" }, ", already started"));
      if (!gone && note) note.remove();
    }
    const minutes = Math.ceil((start - now) / 60000);
    let soon = li.querySelector(".t-soon");
    if (!gone && minutes <= SOON_MINUTES) {
      if (!soon) {
        soon = el("span", { class: "t-soon" });
        head.after(soon);
      }
      // The last minute says so, rather than counting to a screening that is under way.
      soon.textContent = minutes <= 1 ? "Starting" : `In ${minutes} min`;
    } else if (soon) {
      soon.remove();
    }
  }
  markDone(root);
}

// A film with every time of today behind it goes gray, title and all, so what is left
// stands out late in the day (critique 2026-10-19).
function markDone(root) {
  for (const entry of root.querySelectorAll("li.entry")) {
    const times = entry.querySelectorAll("li.time[data-start]");
    entry.classList.toggle("is-done", times.length > 0 && [...times].every((t) => t.classList.contains("is-gone")));
  }
}

// Every half minute while the page is visible; a hidden tab does no work.
export function keepTime(root) {
  tickTimes(root);
  setInterval(() => {
    if (document.visibilityState === "visible") tickTimes(root);
  }, 30000);
}

// ---------- Near misses ----------

// A wrong or outdated link still finds what was meant (delight, 2026-10-19): series
// addresses gained their operator ("sneaky-sunday" became "sneaky-sunday-neugass-kino"),
// and a typed venue ("rifraf") is one letter off. Candidates: [{key, ...}].
function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = keep;
    }
  }
  return row[b.length];
}

export function nearMisses(query, candidates) {
  const q = (query || "").toLowerCase().trim();
  if (!q) return [];
  // An old address that the new one extends: the same series, its operator added.
  const extended = candidates.filter((c) => c.key.startsWith(`${q}-`));
  if (extended.length) return extended;
  const limit = Math.max(2, Math.floor(q.length / 5));
  // A candidate may answer to several keys (a series: its address and its bare name).
  return candidates
    .map((c) => ({ c, d: Math.min(...(c.keys || [c.key]).map((k) => distance(q, k))) }))
    .filter(({ d }) => d <= limit)
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map(({ c }) => c);
}

// "Did you mean A, B or C?" with each a link.
export function didYouMean(matches) {
  const links = matches.map((m) => el("a", { href: m.href }, m.label));
  return ["Did you mean ", ...links.flatMap((a, i) => (i === 0 ? [a] : [i === links.length - 1 ? " or " : ", ", a])), "?"];
}
