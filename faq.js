// The FAQ page is static; this only fills in the footer (last update, stale sources).

import { getJson, renderFooter } from "./lib.js";

getJson("data/index.json").then(renderFooter).catch(() => {});
