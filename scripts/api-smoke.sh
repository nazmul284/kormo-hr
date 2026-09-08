#!/usr/bin/env bash
# Kormo HR — API smoke test. Exercises every module with an appropriate role.
BASE="${KORMO_API:-http://localhost:3000/api}"
SP="$(mktemp -d)"
trap 'rm -rf "$SP"' EXIT
PASS=0; FAIL=0; declare -a FAILURES

login() {  # login <user> <cookiejar>
  curl -s -m 10 -c "$2" -H 'Content-Type: application/json' \
    -d "{\"identifier\":\"$1\",\"password\":\"Kormo@123\"}" \
    "$BASE/auth/login" -o /dev/null -w '%{http_code}'
}

check() { # check <label> <cookiejar> <expected> <path>
  local label="$1" jar="$2" expect="$3" path="$4"
  local code
  code=$(curl -s -m 20 -b "$jar" "$BASE$path" -o "$SP/last.json" -w '%{http_code}')
  if [ "$code" = "$expect" ]; then
    PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %-42s %s\n' "$label" "$code"
  else
    FAIL=$((FAIL+1)); FAILURES+=("$label expected $expect got $code : $path")
    printf '  \033[31m✗\033[0m %-42s %s (expected %s)\n' "$label" "$code" "$expect"
    head -c 300 "$SP/last.json"; echo
  fi
}

echo "── auth ──"
for u in md admin hr.admin payroll manager employee field; do
  c=$(login "$u" "$SP/jar-$u.txt")
  if [ "$c" = "200" ]; then PASS=$((PASS+1)); printf '  \033[32m✓\033[0m login %-36s 200\n' "$u"
  else FAIL=$((FAIL+1)); FAILURES+=("login $u -> $c"); printf '  \033[31m✗\033[0m login %-36s %s\n' "$u" "$c"; fi
done

EMP=$SP/jar-employee.txt
MGR=$SP/jar-manager.txt
HR=$SP/jar-hr.admin.txt
PAY=$SP/jar-payroll.txt
FLD=$SP/jar-field.txt
MD=$SP/jar-md.txt

echo "── identity & dashboard ──"
check "auth/me"                        "$EMP" 200 "/auth/me"
check "dashboard (employee)"           "$EMP" 200 "/dashboard"
check "dashboard (manager)"            "$MGR" 200 "/dashboard"
check "dashboard (hr)"                 "$HR"  200 "/dashboard"
check "company overview (hr)"          "$HR"  200 "/dashboard/company-overview"
check "company overview (employee)"    "$EMP" 200 "/dashboard/company-overview"

echo "── tenancy ──"
check "companies"                      "$EMP" 200 "/tenancy/companies"
check "locations"                      "$EMP" 200 "/tenancy/locations"
check "departments"                    "$EMP" 200 "/tenancy/departments"
check "designations"                   "$EMP" 200 "/tenancy/designations"
check "shifts"                         "$EMP" 200 "/tenancy/shifts"
check "features"                       "$EMP" 200 "/tenancy/features"

echo "── employees ──"
check "employee list"                  "$MGR" 200 "/employees?pageSize=5"
check "directory"                      "$EMP" 200 "/employees/directory?pageSize=5"
check "my team"                        "$MGR" 200 "/employees/my-team"
check "birthdays"                      "$EMP" 200 "/employees/birthdays?scope=month"
check "anniversaries"                  "$EMP" 200 "/employees/anniversaries"
check "own profile"                    "$EMP" 200 "/employees/23"
check "own personal details"           "$EMP" 200 "/employees/23/personal-details"
check "own compensation"               "$EMP" 200 "/employees/23/compensation"
check "own nominees"                   "$EMP" 200 "/employees/23/nominees"
check "own education"                  "$EMP" 200 "/employees/23/education-experience"
check "own documents"                  "$EMP" 200 "/employees/23/documents"
check "allowed fields"                 "$EMP" 200 "/employees/23/allowed-fields"
check "org tree"                        "$EMP" 200 "/employees/1/hierarchy?maxLevel=2&generateUpperTree=true"
check "department tree"                "$EMP" 200 "/employees/hierarchy/department"
check "change requests mine"           "$EMP" 200 "/employees/change-requests/mine"
check "change requests pending (hr)"   "$HR"  200 "/employees/change-requests/pending"
# authorisation boundaries
check "compensation of another (403)"  "$EMP" 403 "/employees/1/compensation"
check "pending changes as employee"    "$EMP" 403 "/employees/change-requests/pending"
check "bad id rejected (400)"          "$EMP" 400 "/employees/undefined"
check "null id rejected (400)"         "$EMP" 400 "/employees/null"

echo "── attendance ──"
check "monthly attendance"             "$EMP" 200 "/attendance?month=8&year=2026"
check "attendance stats"               "$EMP" 200 "/attendance/stats?month=8&year=2026"
check "current week"                   "$EMP" 200 "/attendance/current-week"
check "calendar"                       "$EMP" 200 "/attendance/calendar?month=8&year=2026"
check "roster"                         "$EMP" 200 "/attendance/roster?month=9&year=2026"
check "subordinate roster"             "$MGR" 200 "/attendance/roster?month=9&year=2026&subordinates=true"
check "pending counts"                 "$MGR" 200 "/attendance/pending-counts"
check "edit requests mine"             "$EMP" 200 "/attendance/edit-requests/mine"
check "edit request queue"             "$MGR" 200 "/attendance/edit-requests/queue"
check "overtime mine"                  "$EMP" 200 "/attendance/overtime/mine"
check "overtime queue"                 "$MGR" 200 "/attendance/overtime/queue"
check "compensation mine"              "$EMP" 200 "/attendance/compensation/mine"
check "compensation queue"             "$MGR" 200 "/attendance/compensation/queue"
check "shift exchange"                 "$EMP" 200 "/attendance/shift-exchange"

echo "── leave ──"
check "leave types"                    "$EMP" 200 "/leave/types"
check "leave balances"                 "$EMP" 200 "/leave/balances"
check "my leave requests"              "$EMP" 200 "/leave/requests/mine"
check "leave report"                   "$EMP" 200 "/leave/report"
check "carry forward"                  "$EMP" 200 "/leave/carry-forward"
check "approval queue"                 "$MGR" 200 "/leave/approvals/pending"
check "approval archive"               "$MGR" 200 "/leave/approvals/archive"
check "bradford (self)"                "$EMP" 200 "/leave/bradford"
check "bradford (team)"                "$MGR" 200 "/leave/bradford?team=true"
check "colleagues on leave"            "$EMP" 200 "/leave/colleagues-on-leave"

echo "── holiday ──"
check "holidays 2026"                  "$EMP" 200 "/holidays?year=2026"
check "holiday years"                  "$EMP" 200 "/holidays/years"
check "next holiday"                   "$EMP" 200 "/holidays/next"

echo "── payroll & tax ──"
check "my payslips"                    "$EMP" 200 "/payroll/payslips"
check "payroll runs (payroll admin)"   "$PAY" 200 "/payroll/runs"
check "cost trend"                     "$PAY" 200 "/payroll/cost-trend"
check "payroll runs (employee 403)"    "$EMP" 403 "/payroll/runs"
check "fiscal years"                   "$EMP" 200 "/tax/fiscal-years"
check "tax statement"                  "$EMP" 200 "/tax/statement?fiscalYear=2026-27"
check "tax payments"                   "$EMP" 200 "/tax/payments?fiscalYear=2026-27"
check "tax configuration"              "$EMP" 200 "/tax/configuration?fiscalYear=2026-27"
check "company tax summary"            "$PAY" 200 "/tax/company-summary?fiscalYear=2026-27"
check "company tax (employee 403)"     "$EMP" 403 "/tax/company-summary"

echo "── performance ──"
check "my cycles"                      "$EMP" 200 "/performance/cycles"
check "my goals"                       "$EMP" 200 "/performance/goals/mine"
check "team goals"                     "$MGR" 200 "/performance/goals/team"
check "job confirmation"               "$MGR" 200 "/performance/job-confirmation"
check "all cycles (hr)"                "$HR"  200 "/performance/cycles/all"

echo "── field force ──"
check "my visits"                      "$FLD" 200 "/field-force/visits/mine"
check "customers"                      "$FLD" 200 "/field-force/customers?pageSize=5"
check "visit dashboard (mgr)"          "$MGR" 200 "/field-force/visits/dashboard"
check "visit dashboard (emp 403)"      "$EMP" 403 "/field-force/visits/dashboard"
check "tracking config"                "$FLD" 200 "/field-force/tracking/config"
check "tracking overview (mgr)"        "$MGR" 200 "/field-force/tracking/overview?scope=ongoing"
check "tracking report (mgr)"          "$MGR" 200 "/field-force/tracking/report"

echo "── onboarding ──"
check "pending employees"              "$HR"  200 "/onboarding/pending-employees"
check "my onboarding tasks"            "$HR"  200 "/onboarding/tasks/mine"
check "templates"                      "$HR"  200 "/onboarding/templates"

echo "── resignation ──"
check "resignation context"            "$EMP" 200 "/resignation/context?lastWorkingDay=2026-11-30"
check "my resignations"                "$EMP" 200 "/resignation/mine"
check "approval queue"                 "$MGR" 200 "/resignation/approvals"
check "clearance queue"                "$HR"  200 "/resignation/clearance"
check "exit questions"                 "$EMP" 200 "/resignation/exit-interview/questions"

echo "── booking ──"
check "rooms"                          "$EMP" 200 "/booking/rooms"
check "grid day"                       "$EMP" 200 "/booking/grid?view=day"
check "grid week"                      "$EMP" 200 "/booking/grid?view=week"
check "grid month"                     "$EMP" 200 "/booking/grid?view=month"
check "my bookings"                    "$EMP" 200 "/booking/mine"
check "room availability"              "$EMP" 200 "/booking/rooms/1/availability?date=2026-09-10"

echo "── food ──"
check "food programs"                  "$EMP" 200 "/food/programs"
check "food monthly"                   "$EMP" 200 "/food/monthly"
check "food report"                    "$EMP" 200 "/food/report"
check "consumption (hr)"               "$HR"  200 "/food/consumption"
check "consumption (emp 403)"          "$EMP" 403 "/food/consumption"

echo "── workplace ──"
check "notices"                        "$EMP" 200 "/notices"
check "policies"                       "$EMP" 200 "/policies"
check "notifications"                  "$EMP" 200 "/notifications"
check "unread count"                   "$EMP" 200 "/notifications/unread-count"
check "helpdesk mine"                  "$EMP" 200 "/helpdesk"
check "helpdesk all (hr)"              "$HR"  200 "/helpdesk?scope=all"
check "audit log (admin)"              "$MD"  200 "/audit-log"
check "audit log (emp 403)"            "$EMP" 403 "/audit-log"

echo "── reports ──"
check "report types"                   "$EMP" 200 "/reports/types"
check "my report jobs"                 "$HR"  200 "/reports/mine"

echo "── unauthenticated ──"
UNAUTH=$(curl -s -m 10 "$BASE/dashboard" -o /dev/null -w '%{http_code}')
if [ "$UNAUTH" = "401" ]; then PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %-42s 401\n' "no cookie rejected"
else FAIL=$((FAIL+1)); FAILURES+=("unauth -> $UNAUTH"); printf '  \033[31m✗\033[0m %-42s %s\n' "no cookie rejected" "$UNAUTH"; fi

echo
echo "════════════════════════════════════════════"
printf 'passed: \033[32m%d\033[0m   failed: \033[31m%d\033[0m\n' "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "failures:"
  for f in "${FAILURES[@]}"; do echo "  - $f"; done
  exit 1
fi
