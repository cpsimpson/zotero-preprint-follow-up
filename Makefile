PLUGIN_NAME := zotero-preprint-follow-up
VERSION := $(shell python3 -c 'import json;print(json.load(open("manifest.json"))["version"])')
DIST_DIR := dist
XPI := $(DIST_DIR)/$(PLUGIN_NAME)-$(VERSION).xpi

.PHONY: xpi clean

xpi: $(XPI)

$(XPI): manifest.json bootstrap.js README.md LICENSE
	mkdir -p $(DIST_DIR)
	zip -j -q $(XPI) manifest.json bootstrap.js README.md LICENSE
	@echo "Built $(XPI)"

clean:
	rm -rf $(DIST_DIR)
