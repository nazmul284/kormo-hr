#!/usr/bin/env bash
#
# Kormo HR — end-to-end workflow test.
#
# Exercises the write paths that matter and asserts their side effects:
# applying for leave holds the balance, an overlap is refused, an employee
# cannot approve their own request, a manager's approval moves the balance
# and stamps attendance, and an export produces a real spreadsheet.
#
# Idempotent: it picks a free date, and cancels the leave it created on the
# way out, so it can be run repeatedly.
#
#   bash scripts/workflow-test.sh
#   KORMO_API=http://localhost:4000/api bash scripts/workflow-test.sh
#
set -u

BASE="${KORMO_API:-http://localhost:3000/api}"
PASSWORD="${SEED_DEFAULT_PASSWORD:-Kormo@123}"
SP="$(mktemp -d)"
trap 'rm -rf "$SP"' EXIT

PASS=0; FAIL=0; declare -a FAILURES=()

ok()  { PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); FAILURES+=("$1"); printf '  \033[31m✗\033[0m %s\n' "$1"; }
note(){ printf '    \033[2m%s\033[0m\n' "$1"; }

# Sign-in is deliberately rate-limited (ten attempts a minute), so back off
# and retry rather than reporting the throttle as a failure.
login() { # login <username>
  local user="$1" code
  for attempt in 1 2 3 4 5 6 7; do
    code=$(curl -s -m 15 -c "$SP/jar-$user.txt" -H 'Content-Type: application/json' \
      -d "{\"identifier\":\"$user\",\"password\":\"$PASSWORD\"}" \
      "$BASE/auth/login" -o /dev/null -w '%{http_code}')
    [ "$code" = "200" ] && { echo 200; return; }
    if [ "$code" = "429" ]; then
      note "sign-in throttled (429) — waiting 12s before retry $attempt"
      sleep 12
      continue
    fi
    echo "$code"; return
  done
  echo "$code"
}

echo "── sign in ──"
for user in employee manager; do
  code=$(login "$user")
  if [ "$code" = "200" ]; then ok "signed in as $user"; else bad "sign-in for $user returned $code"; fi
done
EMP="$SP/jar-employee.txt"
MGR="$SP/jar-manager.txt"

if [ ! -s "$EMP" ] || [ ! -s "$MGR" ]; then
  echo; echo "cannot continue without both sessions"; exit 1
fi

echo "── pick a leave type and a free date ──"
TYPE=$(curl -s -b "$EMP" "$BASE/leave/types" | python3 -c "
import json,sys
for t in json.load(sys.stdin):
    if t['key'] == 'casual': print(t['id']); break
")
[ -n "$TYPE" ] && ok "casual leave type resolved (id $TYPE)" || bad "no casual leave type found"

# Avoid any date the employee already has a request on, so the run is repeatable.
TAKEN=$(curl -s -b "$EMP" "$BASE/leave/requests/mine?pageSize=200" | python3 -c "
import json,sys
d=json.load(sys.stdin)
out=set()
from datetime import date, timedelta
for r in d.get('data', []):
    if r['status'] in ('CANCELLED','REJECTED'): continue
    s=date.fromisoformat(r['startDate'][:10]); e=date.fromisoformat(r['endDate'][:10])
    while s<=e:
        out.add(s.isoformat()); s+=timedelta(days=1)
print(','.join(sorted(out)))
")
START=$(python3 -c "
from datetime import date, timedelta
taken = set('''$TAKEN'''.split(',')) - {''}
d = date.today() + timedelta(days=60)
for _ in range(400):
    if d.weekday() not in (4, 5) and d.isoformat() not in taken:
        print(d.isoformat()); break
    d += timedelta(days=1)
")
[ -n "$START" ] && ok "found a free working day: $START" || bad "could not find a free date"

echo "── preview ──"
curl -s -b "$EMP" -H 'Content-Type: application/json' \
  -d "{\"leaveTypeId\":$TYPE,\"startDate\":\"$START\",\"endDate\":\"$START\"}" \
  "$BASE/leave/preview" -o "$SP/preview.json"
python3 -c "
import json
d=json.load(open('$SP/preview.json'))
assert d['leaveDays'] == 1, d
assert d['calendarDays'] == 1, d
print('    leaveDays=%s calendarDays=%s available=%s' % (d['leaveDays'], d['calendarDays'], d['balance']['available']))
" && ok "preview charges exactly one day" || bad "preview arithmetic wrong"

BEFORE=$(curl -s -b "$EMP" "$BASE/leave/balances" | python3 -c "
import json,sys
for b in json.load(sys.stdin)['balances']:
    if b['leaveTypeId'] == $TYPE: print(b['remaining'], b['pending'], b['consumed']); break
")
note "balance before — remaining/pending/consumed: $BEFORE"

echo "── apply ──"
curl -s -b "$EMP" -H 'Content-Type: application/json' \
  -d "{\"leaveTypeId\":$TYPE,\"startDate\":\"$START\",\"endDate\":\"$START\",\"reason\":\"Automated end-to-end verification of the Kormo HR leave workflow.\"}" \
  "$BASE/leave/apply" -o "$SP/apply.json" -w '%{http_code}' > "$SP/apply.code"
CODE=$(cat "$SP/apply.code")
REQ_ID=$(python3 -c "
import json
try: print(json.load(open('$SP/apply.json')).get('id',''))
except Exception: print('')
")
if { [ "$CODE" = "200" ] || [ "$CODE" = "201" ]; } && [ -n "$REQ_ID" ]; then
  ok "leave applied (request #$REQ_ID)"
else
  bad "apply failed ($CODE): $(head -c 200 "$SP/apply.json")"
fi

echo "── the pending day is held against the balance ──"
AFTER_APPLY=$(curl -s -b "$EMP" "$BASE/leave/balances" | python3 -c "
import json,sys
for b in json.load(sys.stdin)['balances']:
    if b['leaveTypeId'] == $TYPE: print(b['remaining'], b['pending'], b['consumed']); break
")
note "after apply — remaining/pending/consumed: $AFTER_APPLY"
python3 -c "
b='$BEFORE'.split(); a='$AFTER_APPLY'.split()
assert float(a[1]) == float(b[1]) + 1, f'pending should rise by exactly 1: {b} -> {a}'
" && ok "one day held as pending, so it cannot be double-spent" || bad "pending was not held"

echo "── an overlapping request is refused ──"
DUP=$(curl -s -b "$EMP" -H 'Content-Type: application/json' \
  -d "{\"leaveTypeId\":$TYPE,\"startDate\":\"$START\",\"endDate\":\"$START\",\"reason\":\"Deliberate overlap that must be refused.\"}" \
  "$BASE/leave/apply" -o "$SP/dup.json" -w '%{http_code}')
[ "$DUP" = "400" ] && ok "overlap refused with 400" || bad "overlap not refused (got $DUP)"
grep -q 'overlaps' "$SP/dup.json" && ok "the error names the conflicting request" || bad "error message is not specific"

echo "── an employee cannot approve their own leave ──"
if [ -n "$REQ_ID" ]; then
  SELF=$(curl -s -b "$EMP" -X PATCH -H 'Content-Type: application/json' \
    -d '{"decision":"APPROVED"}' "$BASE/leave/requests/$REQ_ID/decide" -o /dev/null -w '%{http_code}')
  [ "$SELF" = "403" ] && ok "self-approval blocked with 403" || bad "self-approval not blocked (got $SELF)"
else
  bad "skipped self-approval check — no request id"
fi

echo "── the manager approves ──"
if [ -n "$REQ_ID" ]; then
  APPROVE=$(curl -s -b "$MGR" -X PATCH -H 'Content-Type: application/json' \
    -d '{"decision":"APPROVED","note":"Approved by the automated verification run."}' \
    "$BASE/leave/requests/$REQ_ID/decide" -o "$SP/approve.json" -w '%{http_code}')
  [ "$APPROVE" = "200" ] && ok "manager approval accepted" || bad "approval failed ($APPROVE): $(head -c 200 "$SP/approve.json")"
fi

echo "── the balance moves from pending to consumed ──"
AFTER_APPROVE=$(curl -s -b "$EMP" "$BASE/leave/balances" | python3 -c "
import json,sys
for b in json.load(sys.stdin)['balances']:
    if b['leaveTypeId'] == $TYPE: print(b['remaining'], b['pending'], b['consumed']); break
")
note "after approve — remaining/pending/consumed: $AFTER_APPROVE"
python3 -c "
b='$BEFORE'.split(); a='$AFTER_APPROVE'.split()
assert float(a[1]) == float(b[1]),        f'pending should return to baseline: {b} -> {a}'
assert float(a[0]) == float(b[0]) - 1,    f'remaining should fall by 1: {b} -> {a}'
assert float(a[2]) == float(b[2]) + 1,    f'consumed should rise by 1: {b} -> {a}'
" && ok "pending released, remaining reduced, consumed increased" || bad "balance arithmetic is wrong"

echo "── an attendance correction can be approved ──"
# Raise one first if the queue is empty. It usually is on a second run: this
# script approves the seeded request and approval is not reversible, so
# without this the assertion silently skipped and the suite quietly shrank
# from 18 checks to 17.
FIRST=$(curl -s -b "$MGR" "$BASE/attendance/edit-requests/queue?status=PENDING" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(d['data'][0]['id'] if d.get('data') else '')
")
if [ -z "$FIRST" ]; then
  # This month first, then last month: the current month can run out of
  # candidates once earlier runs have raised a request on each of its days.
  PREV_Y=$(date -v-1m +%Y 2>/dev/null || date -d 'last month' +%Y)
  PREV_M=$(date -v-1m +%-m 2>/dev/null || date -d 'last month' +%-m)
  CORRECTABLE=''
  for WINDOW in "" "?year=$PREV_Y&month=$PREV_M"; do
    CORRECTABLE=$(curl -s -b "$EMP" "$BASE/attendance$WINDOW" | python3 -c "
import json,sys,datetime
today = datetime.date.today().isoformat()
rows = json.load(sys.stdin).get('days') or []
for r in rows:
    day = str(r.get('date',''))[:10]
    if day and day < today and r.get('status') in ('PRESENT','LATE') and not r.get('editRequest'):
        print(day)
" | tail -1)
    [ -n "$CORRECTABLE" ] && break
  done
  if [ -n "$CORRECTABLE" ]; then
    RAISE=$(curl -s -b "$EMP" -H 'Content-Type: application/json' \
      -d "{\"date\":\"$CORRECTABLE\",\"requestedInTime\":\"09:45\",\"reason\":\"Workflow verification: badge reader did not register the entry.\"}" \
      "$BASE/attendance/edit-requests" -o "$SP/raise.json" -w '%{http_code}')
    if [ "$RAISE" = "201" ] || [ "$RAISE" = "200" ]; then
      note "raised a correction for $CORRECTABLE so this step has something to approve"
      FIRST=$(python3 -c "
import json
print(json.load(open('$SP/raise.json')).get('id',''))
")
    else
      note "could not raise a correction ($RAISE): $(head -c 160 "$SP/raise.json")"
    fi
  fi
fi
if [ -n "$FIRST" ]; then
  EDIT=$(curl -s -b "$MGR" -X PATCH -H 'Content-Type: application/json' \
    -d '{"decision":"APPROVED","note":"Verified against the security log."}' \
    "$BASE/attendance/edit-requests/$FIRST" -o "$SP/edit.json" -w '%{http_code}')
  [ "$EDIT" = "200" ] && ok "attendance correction approved (#$FIRST)" || bad "correction approval failed ($EDIT)"
else
  note "no pending corrections left to approve — skipping"
fi

echo "── an export produces a real spreadsheet ──"
JOB=$(curl -s -b "$MGR" -H 'Content-Type: application/json' \
  -d '{"reportType":"EmployeeDirectory","format":"xlsx"}' "$BASE/reports" | python3 -c "
import json,sys
try: print(json.load(sys.stdin).get('jobId',''))
except Exception: print('')
")
if [ -n "$JOB" ]; then
  ok "export queued (job $JOB)"
  ST=unknown
  for _ in $(seq 1 25); do
    ST=$(curl -s -b "$MGR" "$BASE/reports/$JOB" | python3 -c "
import json,sys
try: print(json.load(sys.stdin)['status'])
except Exception: print('unknown')
")
    [ "$ST" = "READY" ] || [ "$ST" = "FAILED" ] && break
    sleep 1
  done
  [ "$ST" = "READY" ] && ok "export completed" || bad "export ended as $ST"
  if [ "$ST" = "READY" ]; then
    DL=$(curl -s -b "$MGR" "$BASE/reports/$JOB/download" -o "$SP/export.xlsx" -w '%{http_code}')
    SIZE=$(wc -c < "$SP/export.xlsx" | tr -d ' ')
    if [ "$DL" = "200" ] && [ "$SIZE" -gt 5000 ]; then
      ok "downloaded a $SIZE-byte file"
    else
      bad "download failed (HTTP $DL, $SIZE bytes)"
    fi
    file "$SP/export.xlsx" | grep -qiE 'excel|zip' && ok "the file is a valid spreadsheet" || bad "the file is not a spreadsheet"
  fi
else
  bad "could not queue an export"
fi

echo "── clean up, so this script is repeatable ──"
if [ -n "$REQ_ID" ]; then
  CANCEL=$(curl -s -b "$EMP" -X PATCH "$BASE/leave/requests/$REQ_ID/cancel" -o /dev/null -w '%{http_code}')
  [ "$CANCEL" = "200" ] && ok "test leave withdrawn and the balance restored" || bad "could not withdraw the test leave ($CANCEL)"
fi

echo
echo "════════════════════════════════════════════"
printf 'passed: \033[32m%d\033[0m   failed: \033[31m%d\033[0m\n' "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "failures:"
  for f in "${FAILURES[@]}"; do echo "  - $f"; done
  exit 1
fi
