# Cue Coach web page

Players sign in and see their own sessions, weekly trends and every stroke. Coaches see their
linked players, and admin sees everyone. One static page (`index.html`) with no server. It reads
the Supabase views `player_sessions`, `player_weeks` and `stroke_facts`
(`cloud/production/supabase/migrations/`), and row-level security decides what each person
sees.

## Try it

    python3 -m http.server 8765 --directory web

- **http://localhost:8765/?mock=1** runs on `web/mock/`, a copy of BP01's and PP01's real
  numbers (no stroke files, no login needed).
- **http://localhost:8765/** uses the real project. It needs `web/config.js` (gitignored),
  copied from `config.example.js` with the project URL and *publishable* key.

## Signing in

- **Logins** are made with `cloud/production/add_player.py` (`--email` for a real address).
- **Passwords** are set by "Forgot password?" on the page, which emails a link through Resend.
- **The link only works from an address Supabase allows.** Add each address the page is served
  from in the dashboard: Authentication → URL Configuration → Redirect URLs
  (e.g. `http://localhost:8765/` and `https://cue-coach.com/app/`).

## Cue path viewer (2026-11-06)

Admins and coaches get a **Path** link on each stroke. It opens `viewer.html`, which fetches that
stroke's path from the `shot-path` edge function (made on the fly from the stored recording) and
draws it. `viewer.html` and `viewer_settings.js` are built by `python3 cue_path.py --web` from the
repo's `cue_path_viewer_template.html` and `viewer_settings.js`: change those, rebuild, publish.
`viewer_loader.js` is the website's own part (login and fetch).

## Live TV view (2026-11-07)

`tv.html` is a full-screen page for a TV beside the table: the last stroke in huge type (speed,
mph, backstroke, straightness…) and today's session (count, average, hardest, spread, a bar per
stroke). It reads `stroke_facts` for the player's strokes today every second (the view has no
realtime events) and flashes when one arrives. Same login as `index.html`; `?player=BP01` picks
the player for coaches/admin, `?mock=1` replays a mock day. The **Metrics** button (or M) picks up to 8 tiles from the 8 on Billy's metrics sheet (2026-11-08: Straightness, Timing, Cue twist, Pause, Backstroke, Forward stroke, Follow-through, Follow-through time); the pick is kept in that browser and in `?m=`. F or the button goes full screen; the
mouse and controls hide after 4 s and the screen is kept awake where the browser allows.

## Coaching (2026-11-13)

Coaches and admins get a **Students** page: invite a student by email, see each student's drill
and where they are in the cycle (baseline to shoot, test waiting for review, practising until a
due date ...), open their shots, assign a drill and level. Admins see every coach's students and
invites. A student sees, on their own training log, invites to accept or decline, their coach,
their drill and target, and can end the link. Every change goes through the `coaching` edge
function; the page reads the coaching tables directly. `?mock=1&role=coach` (or `role=player`)
tries it on `mock/coaching.json`.

**Scoreboard** (plan step 4): on any player's log, their scores on drills from the Cue Coach list,
from the `drill_sets` view (`mock/drill_sets.json`): sets, last, best, last-10 average, trend and
days in a row, practice and test apart. Players' own drills are left off.

**Drill charts** (2026-11-13), on the same log: **Drill progress** (score per scored set for one
drill and level, average of the last 5, best so far, test sets as triangles, the coach's goal per
set when an active assignment has one); **Does your stroke pay off?** (make rate on drill shots
when Straightness, Timing or Cue twist was good vs not: the coach's band if assigned, otherwise the
player's own better half; from the `drill_results` view, `mock/drill_results.json`, whose numbers
are made up); **Shots per day** split by drill, with "Not a drill" for the rest; **Practice
calendar** (the last year, shaded by shots, with streaks). Drill colors follow the drill id and
were checked with the dataviz palette validator on the dark panel.

**Fargo rating** (2026-11-13), on the same log: the latest rating, Fargo ID and date, an Update form
and the history with each change. Typed in by the player, their coach or an admin (FargoRate has no
public feed); entries aren't edited, a wrong one is removed by whoever entered it (or an admin).
From the `fargo_ratings` table; `mock/fargo_ratings.json` is made up.

## Hosting

Copy the folder (`index.html`, `config.js`, `viewer.html`, `viewer_loader.js`,
`viewer_settings.js`, `tv.html`; no `mock/` needed) to any static host, such as a
folder on the cue-coach.com site or Netlify. Add that address to the Redirect URLs.

## Notes

- Speeds are m/s with mph alongside (× 2.237). A few strokes get a negative impact speed from the
  engine, a known artifact: the views leave them out of speed figures, and the stroke table shows "–".
- `*` beside a stroke's time marks a low-confidence speed.
- Refresh the mock data with the query in this repo's history (BP01 + PP01, last 10 days of strokes)
  if the views change.

## Feedback (2026-11-17)

Everyone signed in gets a **Feedback** link: send feedback (Suggest an improvement first, an
optional screenshot) and see what they've sent and whether it's fixed. Admins also see every
report, sort and answer it, and add reports by hand. `feedback.js`; sending goes through the
`feedback` edge function, which emails katherine@cue-coach.com. `#feedback` in the address opens
it. Plan and details: `docs/plans/feedback_plan.md`.
**Answers (2026-11-20):** an admin writes an answer on a report's card (with ready-made starts) and
presses Send answer; the `feedback` function (`action: "reply"`) saves it in `feedback_replies`,
emails it to the tester with Reply going to katherine@, and marks the report answered (Tester told
ticked). The tester sees answers under "What you've sent". Mock: `mock/feedback_replies.json`.
