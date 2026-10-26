#!/bin/zsh
# Double-click this file to start the Rational Functions Explorer.
# Your browser opens to the app. Close this Terminal window to stop it.

cd "$(dirname "$0")"
(sleep 1 && open "http://localhost:8766") &
python3 -m http.server 8766
