/* global Zotero, APP_SHUTDOWN */

"use strict";

const ADDON_NAME = "Preprint Follow-Up";

function install() {}

async function startup() {
  await Zotero.initializationPromise;
  Zotero.debug(`${ADDON_NAME}: started`);
}

function shutdown(_data, reason) {
  if (reason === APP_SHUTDOWN) {
    return;
  }
  Zotero.debug(`${ADDON_NAME}: stopped`);
}

function uninstall() {}
