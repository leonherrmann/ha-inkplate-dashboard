#!/usr/bin/env bash
# test-harnesses/run.sh -- every add-on check in one command.
#
#   test-harnesses/run.sh          backend + pure checks (about a minute)
#   test-harnesses/run.sh --ui     also the WebKit checks against the built dist
#   test-harnesses/run.sh timer    only checks whose name contains "timer"
#
# Sets up what the checks need on first use and keeps it: a Python 3.13 venv in
# .venv (the python3 on PATH is miniconda 3.8 and cannot parse the backend),
# Pillow and httpx on top of requirements.txt (the Dockerfile adds Pillow via
# apk, so it is not in there), and Playwright's WebKit. Runs everything even
# after a failure and ends with the list of what failed.
set -uo pipefail

REPO=$(cd "$(dirname "$0")/.." && pwd)
HARN="$REPO/test-harnesses"
BACKEND="$REPO/dashboard/backend"
VENV="$REPO/.venv"
PY="$VENV/bin/python"
PORT=8127

UI=0
FILTER=""
for arg in "$@"; do
    case "$arg" in
        --ui) UI=1 ;;
        -h|--help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) FILTER="$arg" ;;
    esac
done

# --- setup, once ------------------------------------------------------------
if [ ! -x "$PY" ]; then
    PY313=$(command -v python3.13 || echo /opt/homebrew/bin/python3.13)
    [ -x "$PY313" ] || { echo "run.sh: python3.13 not found (brew install python@3.13)"; exit 1; }
    echo "setting up $VENV"
    "$PY313" -m venv "$VENV"
fi
REQ_STAMP="$VENV/.requirements"
if ! cmp -s "$BACKEND/requirements.txt" "$REQ_STAMP"; then
    echo "installing backend requirements"
    "$PY" -m pip install -q --disable-pip-version-check -r "$BACKEND/requirements.txt" pillow httpx && \
        cp "$BACKEND/requirements.txt" "$REQ_STAMP"
fi
if [ ! -d "$HARN/node_modules/playwright" ]; then
    echo "installing playwright"
    (cd "$HARN" && npm install --silent)
fi

# --- running ----------------------------------------------------------------
PASSED=()
FAILED=()
LOGDIR=$(mktemp -d)

run() { # name, dir, command...
    local name=$1 dir=$2; shift 2
    [ -z "$FILTER" ] || [[ "$name" == *"$FILTER"* ]] || return 0
    printf '%-22s ' "$name"
    if (cd "$dir" && "$@") > "$LOGDIR/$name.log" 2>&1; then
        echo "ok"; PASSED+=("$name")
    else
        echo "FAIL"; FAILED+=("$name")
        tail -15 "$LOGDIR/$name.log" | sed 's/^/    /'
    fi
}

run importcheck "$BACKEND" "$PY" importcheck.py
for h in manifestpostcheck albumcheck imagecheck shotcheck gridmigratecheck \
         calendarcheck firmwarecheck panelscheck; do
    run "$h" "$BACKEND" env PYTHONPATH=. "$PY" "$HARN/$h.py"
done
for h in adoptcheck timercheck; do
    run "$h" "$BACKEND" env PYTHONPATH=. SUPERVISOR_TOKEN=test "$PY" "$HARN/$h.py"
done
run snapcheck "$BACKEND" node "$HARN/snapcheck.mjs"
run dithercheck "$REPO/dashboard" "$PY" tools/dithercheck.py

if [ "$UI" = 1 ]; then
    (cd "$HARN" && npx playwright install webkit >/dev/null 2>&1)
    # The committed dist, which is what ships. Rebuild it first
    # (npm run build in dashboard/frontend) after a frontend change.
    "$PY" -m http.server "$PORT" --bind 127.0.0.1 -d "$REPO/dashboard/frontend/dist" >/dev/null 2>&1 &
    SERVER=$!
    trap 'kill $SERVER 2>/dev/null' EXIT
    for _ in $(seq 50); do
        curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break
        sleep 0.1
    done
    for h in shapecheck sheetcheck pickercheck devicecheck device-overrides \
             refreshfloorcheck iconcheck manifestcheck photosizecheck canvascheck \
             chiprowcheck themecheck; do
        run "$h" "$HARN" node "$h.mjs"
    done
fi

echo
echo "${#PASSED[@]} passed, ${#FAILED[@]} failed${FAILED:+: ${FAILED[*]}}"
[ "$UI" = 1 ] || echo "(browser checks skipped; add --ui)"
echo "logs: $LOGDIR"
[ "${#FAILED[@]}" -eq 0 ]
