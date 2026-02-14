.PHONY: extension clean lint

extension:
	rm -f bskytree-extension.zip
	cd extension && zip -r ../bskytree-extension.zip *

lint:
	npx @biomejs/biome check index.js

clean:
	rm -f bskytree-extension.zip
