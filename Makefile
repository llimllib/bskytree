.PHONY: extension clean

extension:
	rm -f bskytree-extension.zip
	cd extension && zip -r ../bskytree-extension.zip *

clean:
	rm -f bskytree-extension.zip
