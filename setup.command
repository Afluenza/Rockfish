#!/bin/sh
# macOS: double-click this file in Finder. It opens Terminal and runs setup.sh
# in the folder that contains it.
cd "$(dirname "$0")" || exit 1
sh ./setup.sh
echo
echo "Press Return to close this window."
read -r _ || true
