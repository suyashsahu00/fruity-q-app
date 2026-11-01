
# Fruity Q: agent rules

## Project

Android-first web app (PWA) controlling a fruit-picking robot via ROS rosbridge. The robot side (ROS, hardware) is owned by a teammate. This repo contains the app only.

## Stack rules

- Plain HTML, CSS, vanilla JS. No npm, no bundlers, no frameworks.
- All topic names, IPs and limits live ONLY in app/js/config.js. Never hardcode them elsewhere.
- Everything must work offline (no CDN links).
- Never guess ROS topic names. Use TODO placeholders until the user confirms them.

## Safety rules (never break)

- Red STOP button visible on every screen.
- Never fake robot progress. If there is no data, show "Waiting for robot".
- Spray duration is capped in config.js.
- Movement buttons publish only while held; publish zero on release or disconnect.
- Dangerous actions (spray, follow) need a confirmation dialog.
- Mock mode must always show a DEMO MODE banner.

## Working rules

- The user is a non-coder: keep code simple and commented, explain changes in plain Hinglish.
- Do not add features that were not requested.
- Do not touch the "archived" folder.
- After each change, tell the user exactly how to test it in the browser.
