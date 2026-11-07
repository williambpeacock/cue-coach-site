// The website's cue path viewer (viewer.html, built by cue_path.py --web): fetches one
// stroke's shot path from the "shot-path" edge function with the login the web page
// already has, then draws it (startViewer, in the viewer page).
//
//   viewer.html?recording=<recording id>&stroke=<stroke_no>&label=<name for the shot>
//
// The path is made on the fly from the stored recording, so it always uses the current
// physics. Admins and coaches only for now (the function decides).
(async () => {
  const q = new URLSearchParams(location.search);
  const msg = document.getElementById("loadmsg");
  const say = (text, bad) => { msg.hidden = false; msg.textContent = text; msg.className = bad ? "err" : ""; };
  // The viewer stays hidden until there's a path to draw.
  const parts = [...document.querySelectorAll(".wrap > *:not(header):not(#loadmsg)")];
  const showViewer = (on) => parts.forEach((el) => { el.style.display = on ? "" : "none"; });
  showViewer(false);
  document.getElementById("title").textContent = "Cue path";
  const back = document.createElement("a");
  back.href = "./"; back.className = "back"; back.textContent = "← Back to strokes";
  document.querySelector("header").prepend(back);

  if (window.CUE_CONFIG_MISSING || !window.CUE_CONFIG) return say("No config.js next to this page.", true);
  const recording = q.get("recording"), stroke = q.get("stroke") ?? "0";
  if (!recording) return say("No stroke chosen: open this from a stroke on the strokes page.", true);
  const db = supabase.createClient(CUE_CONFIG.SUPABASE_URL, CUE_CONFIG.SUPABASE_PUBLISHABLE_KEY);
  const { data: { session } } = await db.auth.getSession();
  if (!session) return say("Sign in on the strokes page first.", true);

  say("Working out the cue's path…");
  try {
    const url = `${CUE_CONFIG.SUPABASE_URL}/functions/v1/shot-path?recording=${encodeURIComponent(recording)}&stroke=${encodeURIComponent(stroke)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } });
    const body = await res.json().catch(() => ({ ok: false, error: `the server answered ${res.status}` }));
    if (!body.ok) return say(`Couldn't make this stroke's path: ${body.error}`, true);
    msg.hidden = true;
    showViewer(true);
    startViewer([{ label: q.get("label") || "This stroke", ...body.path }]);
  } catch (e) {
    say(`Couldn't reach the server: ${e.message}`, true);
  }
})();
