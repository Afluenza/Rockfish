#!/bin/sh
# Rockfish setup for macOS and Linux.
# Downloads the Stockfish 18.0.8 engine from the official npm package,
# checks the SHA-256 hash of each file, and places the files in engine/.
# Safe to run more than once: files that already match are left alone.

set -eu

cd "$(dirname "$0")"

VERSION="18.0.8"
TARBALL_URL="${ROCKFISH_TARBALL_URL:-https://registry.npmjs.org/stockfish/-/stockfish-${VERSION}.tgz}"

JS_HASH="5243fd9b276cab7dfe3ad1d43ab9ead73568fac76468c614242977a210c4a391"
WASM_HASH="a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1"
LICENSE_HASH="0b383d5a63da644f628d99c33976ea6487ed89aaa59f0b3257992deac1171e6b"

sha256_of() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | cut -d ' ' -f 1
  else
    sha256sum "$1" | cut -d ' ' -f 1
  fi
}

# check_file <path> <expected-hash>: returns 0 when the file exists and matches.
check_file() {
  [ -f "$1" ] && [ "$(sha256_of "$1")" = "$2" ]
}

all_engine_files_ok() {
  check_file engine/stockfish-18-lite-single.js "$JS_HASH" &&
  check_file engine/stockfish-18-lite-single.wasm "$WASM_HASH" &&
  check_file engine/LICENSE-stockfish.txt "$LICENSE_HASH"
}

echo "Rockfish setup"
echo

if all_engine_files_ok; then
  echo "Engine files are already in place and verified. Nothing to download."
else
  for tool in curl tar; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      echo "Error: '$tool' is needed but was not found. Install it and run setup again." >&2
      exit 1
    fi
  done

  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT

  echo "Downloading Stockfish ${VERSION} from the official npm package..."
  curl -fsSL "$TARBALL_URL" -o "$TMP_DIR/stockfish.tgz"
  tar -xzf "$TMP_DIR/stockfish.tgz" -C "$TMP_DIR"

  mkdir -p engine
  cp "$TMP_DIR/package/bin/stockfish-18-lite-single.js" engine/
  cp "$TMP_DIR/package/bin/stockfish-18-lite-single.wasm" engine/
  cp "$TMP_DIR/package/Copying.txt" engine/LICENSE-stockfish.txt

  echo "Checking file hashes..."
  if ! all_engine_files_ok; then
    rm -f engine/stockfish-18-lite-single.js engine/stockfish-18-lite-single.wasm engine/LICENSE-stockfish.txt
    echo "Error: a downloaded file did not match its expected SHA-256 hash." >&2
    echo "The engine files were removed. Try again, or add them by hand (see README)." >&2
    exit 1
  fi
  echo "Engine files installed and verified."
fi

echo

if [ ! -f assets/king.png ]; then
  echo "Warning: assets/king.png is missing. Rockfish needs this icon to load."
  echo "Copy it from the Rockfish download, then run setup again."
  exit 1
fi

echo "Setup complete. Next steps:"
echo "  1. Open chrome://extensions (Opera: opera://extensions)."
echo "  2. Turn on Developer mode."
echo "  3. Click Load unpacked and choose this folder:"
echo "     $(pwd)"
