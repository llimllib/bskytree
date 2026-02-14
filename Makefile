.PHONY: extension clean

extension: bskytree-extension.zip

bskytree-extension.zip: extension/*
	cd extension && zip -r ../bskytree-extension.zip *

clean:
	rm -f bskytree-extension.zip
