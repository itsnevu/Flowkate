#!/bin/bash
# Usage: ./update_version.sh <new_version>
# FORMAT IS <0.0.0>

if [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  # Rewrite the package's own "version" field and nothing else.
  #
  # Anchoring to that key matters: the previous version of this script substituted the old
  # version string itself, unescaped, so its dots were regex wildcards. Bumping 0.3.0 -> 0.3.1
  # matched inside "@types/chrome": "^0.0.330" and rewrote it to "^0.0.3.1", which left
  # package.json disagreeing with pnpm-lock.yaml and broke every --frozen-lockfile install.
  # The match is applied once per file, so a dependency that happens to be pinned at the same
  # version as the package is left alone.
  find . -name 'package.json' -not -path '*/node_modules/*' -not -path './landing/*' -exec \
    perl -0777 -i -pe 's/("version"\s*:\s*")[^"]*(")/${1}'"$1"'${2}/' {} \;

  echo "Updated versions to $1";
else
  echo "Version format <$1> isn't correct, proper format is <0.0.0>";
fi
