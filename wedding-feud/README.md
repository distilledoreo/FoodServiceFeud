# Wedding Feud

A turnkey wedding-themed Family-Feud-style game built from the ideas in the original FoodServiceFeud host/projector system, but with no framework or CDN dependencies.

## Play

1. Serve or deploy the repository and open `wedding-feud/index.html` in the host browser.
2. Edit the two team names if desired.
3. Click **Launch Projector** and move that window to the audience display.
4. Use the answer buttons or keyboard shortcuts to run the game.

### Keyboard

- `1`–`8`: reveal answers
- `X`: strike
- `C`: clear strikes
- `Left` / `Right`: previous / next round
- `A`: award the current bank to Team 1
- `B`: award the current bank to Team 2
- `M`: cycle the 1× / 2× / 3× multiplier
- `P`: launch the projector window

Rounds 1–5 default to 1× points, 6–10 to 2×, and 11–15 to 3×. The host can override the multiplier at any time.

## Questions

The game includes 15 wedding-themed rounds. Every answer board totals 100 points for simple Feud-style scoring. These are **survey-style game values created for entertainment**, not results from an actual 100-person survey.

To customize the game, edit `questions.js`. Each question supports up to eight answers.

## Technical notes

- Plain HTML, CSS, and JavaScript—no build step.
- Host state persists in `localStorage`.
- Projector state syncs through `BroadcastChannel`, with the browser storage event as a fallback.
- Sound effects use the Web Audio API and require no audio assets.
