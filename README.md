# Fishing Rush

A 60-second arcade fishing game that runs entirely in the browser — cast your line, strike when the fish bites, then fight the tension bar to reel it in before the clock runs out.

Inspired by my Roblox fishing game, rebuilt as a tiny standalone web game: no engine, no images, no audio files. The boat, the fisherman, the water and every fish are drawn in code with Canvas 2D.

## How to play

1. **Cast** — click the water, tap, or press `Space`.
2. **Wait** — watch the shadow under the water circle toward your bobber.
3. **Strike** — the moment the yellow **!** pops up, click again *fast*. Hesitate and the fish is gone.
4. **Reel** — press and **hold** to raise the pink marker, release to let it sink. The fish drags it down and surges at random.
5. **Stay in the green** — keeping the marker inside the moving green zone fills your reel progress. If the marker pins at either end of the bar, line strain builds; full strain snaps the line.
6. **Score** — rarer fish are worth more but fight harder: a narrower, faster sweet spot and a stronger pull.

| Fish | Rarity | Points |
| --- | --- | --- |
| Sardine | Common | 10 |
| River Bass | Common | 25 |
| Blue Catfish | Uncommon | 45 |
| Koi | Rare | 90 |
| Golden Carp | Epic | 180 |
| Rainbow Trout | Legendary | 350 |

Your best score is kept in the browser (localStorage).

## Controls

- **Mouse** — click to cast / strike, press & hold to reel
- **Touch** — tap to cast / strike, touch & hold to reel (the big yellow button works too)
- **Keyboard** — `Space` does everything the mouse does

## Tech used

- **TypeScript** (strict mode) — game source in `src/main.ts`, compiled to the committed `game.js`
- **Canvas 2D** — all rendering: scene, fish, particles, and the tension-bar minigame UI
- **Vanilla HTML/CSS** — neo-brutalist page design (cream paper, ink borders, hard offset shadows), responsive layout, zero dependencies and zero build output besides `game.js`
- `requestAnimationFrame` game loop with delta-time physics

## Run it locally

No build step, no server needed:

1. Clone or download this repo.
2. Open `index.html` in any modern browser.

That's it — the game runs straight from the file.

### Rebuild `game.js` from the TypeScript source (optional)

```bash
npm install
npm run build
```

## Credits

Built by **Remike Dev** (GitHub: [@kirax-12](https://github.com/kirax-12)) — UI/UX designer & game developer.
