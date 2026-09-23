#!/bin/bash
# Run a list of suites across the four lanes.
#   batch.sh <suite> <suite> ...
#
# A second copy of sweep.sh with the lanes fixed at 1–4 until 23 September,
# when both were found never to read a suite's status. It is sweep.sh now, so
# there is one runner to keep right.
exec bash "$(dirname "$0")/sweep.sh" "1 2 3 4" "$@"
