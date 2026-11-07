// Settings for the cue path viewer (output/animations/cue_path_viewer.html).
// Change a value, save, and reload the page. No rebuild needed.
// Colors are any CSS color: "#1f3a33", "rgb(31, 58, 51)", "darkgreen".
// Lengths are inches.

window.VIEWER_SETTINGS = {
  text: {
    title: "Where the cue tip went",
    highlight: "tip",                 // one word of the title in the accent color ("" for none)
    subtitle: "Cue Coach · Top and side views",
  },

  page: {
    background: "#1c1e22",            // brand charcoal
    panel: "#24272c",
    line: "#41454d",
    text: "#f0f0f0",                  // brand off-white
    muted: "#9a9da2",                 // brand gray
    accent: "#e8792e",                // brand orange
    font: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
  },

  table: {
    cloth: "#1f3a33",                 // try "#0a5c36" (classic green), "#1d4f91" (tournament blue)
    show_shot_line: true,
    shot_line_color: "rgba(240,240,240,0.25)",
    show_table_surface: true,         // side view: the bed of the table under the ball
    surface_color: "rgba(240,240,240,0.18)",
  },

  cue: {
    length_in: 58,
    grip_to_tip_in: 46,               // where the back hand holds it; also sets "inches at the tip"
    thickness_in: 0.85,               // drawn thickness (a real cue tapers ~1.2 in to 0.5 in)
    butt_share: 0.45,                 // how much of the cue is the dark butt section (0 to 1)
    butt_color: "#3a2416",
    joint_color: "#d9c49a",
    shaft_color: "#e9dcc0",
    ferrule_color: "#f5f5f0",
    tip_color: "#4d8fd6",
  },

  ball: {
    show: true,
    color: "#f4f1e8",
    diameter_in: 2.25,
    hide_after_contact: true,
  },

  grip: {
    show: true,
    color: "rgba(240,240,240,0.8)",
  },

  trace: {
    sideways_color: "#e8792e",        // the tip's path in the top view, and its line on the chart
    height_color: "#6fb3e0",          // the tip's path in the side view, and its line on the chart
    width_px: 2.5,
    show_full_path_faintly: true,     // the whole path drawn faintly behind the animated part
  },

  views: {
    top: true,
    side: true,
    chart: true,
    notes: true,
  },

  enlarge: {
    sideways: 10,                     // starting value of the slider
    sideways_max: 20,
    up_down: 3,
    up_down_max: 10,
  },

  playback: {
    speeds: [0.1, 0.25, 0.5, 1],      // the speed slider's steps (1 = real time)
    start_speed: 0.25,
    autoplay: false,
    loop: false,
  },

  units: "in",                        // "in" or "cm" for the numbers shown (drawing is unaffected)
};
