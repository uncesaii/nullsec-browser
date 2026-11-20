import browser from "webextension-polyfill";

void browser.devtools.panels.create(
  "NullSec",
  "icons/icon-16.png",
  "devtools-panel.html",
);