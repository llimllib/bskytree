.PHONY: clean lint submit-extension

EXTENSION_SRC := $(shell find extension -type f)

bskytree-extension.zip: $(EXTENSION_SRC)
	rm -f bskytree-extension.zip
	cd extension && zip -r ../bskytree-extension.zip *

lint:
	npx @biomejs/biome check index.js extension/

submit-extension: bskytree-extension.zip
	./scripts/submit-extension.sh

clean:
	rm -f bskytree-extension.zip
