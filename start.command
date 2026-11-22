#!/bin/sh
# Double-click to start the N2 practice app, then open the browser.
cd "$(dirname "$0")"
[ -f data/n2.db ] || node --no-warnings scripts/build-db.js
(sleep 1 && open "http://localhost:5173") &
exec node --no-warnings server.js
