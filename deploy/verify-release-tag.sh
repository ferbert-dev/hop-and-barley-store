#!/bin/sh
set -eu

[ "$#" -eq 1 ] || { echo 'Usage: verify-release-tag.sh VMAJOR.MINOR.PATCH' >&2; exit 2; }
version=$1
printf '%s\n' "$version" | LC_ALL=C grep -Eq '^V(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' || {
  echo 'A version tag such as V1.0.0 is required; latest is not a release identity.' >&2
  exit 1
}
revision=$(git rev-parse --verify "refs/tags/$version^{commit}")
git merge-base --is-ancestor "$revision" refs/remotes/origin/main || {
  echo 'The release tag must point to a commit in main history.' >&2
  exit 1
}
printf '%s\n' "$revision"
