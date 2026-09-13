# README screenshots

Produced by the same harness that verifies the UI, so a screenshot cannot
show a page that was broken at the time it was taken:

```bash
npm run dev          # with a seeded database

node scripts/screenshot.mjs --user md --out ./docs/screenshots \
  --routes /dashboard,/directory,/attendance,/leave,/payroll,/tax,\
/performance,/org-chart,/field-force/tracking,/onboarding

node scripts/screenshot.mjs --user md --theme dark --out ./docs/screenshots \
  --routes /dashboard,/payroll
```

The harness fails on a console error, a failed request, or a page that is
still showing skeletons — so these are verified renders, not just captures.

Two chores afterwards, both easy to forget:

```bash
rm -f docs/screenshots/report-*.json   # run reports, not images
for f in docs/screenshots/*.png; do sips -Z 1600 "$f"; done
```

The harness shoots at `deviceScaleFactor: 2`, which is right for spotting
rendering defects and wrong for a repository — the README displays these
around 880px wide, and the unscaled files are roughly half again as large
for no visible gain.
