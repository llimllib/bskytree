.PHONY: extension clean lint

extension:
	rm -f bskytree-extension.zip
	cd extension && zip -r ../bskytree-extension.zip *

lint:
	npx @biomejs/biome check index.js extension/

clean:
	rm -f bskytree-extension.zip
