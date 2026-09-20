# GAZUDIAN GAMES — official site

Interactive arcade-style studio site with a fully playable in-browser demo game (**SKYBREAKER**), XP/level scroll progression, achievements, synthesized chiptune SFX (Web Audio, zero assets) and a hand-drawn SVG logo + cover art.

Zero dependencies. One tiny static server. Deploys to Railway as-is.

## Live

- **Production:** https://gazudian-games-production-842e.up.railway.app
- **Repo:** https://github.com/KKaramaligkas/gazudian-games (pushes to `main` auto-deploy)

## Run locally

```bash
npm start          # -> http://localhost:3000
```

No `npm install` needed — there are no dependencies.

## Structure

```
server.js            zero-dep static server (honours $PORT)
public/
  index.html         the whole site (inline SVG logo + game cover art)
  css/style.css      design system, layout, motion
  js/audio.js        Web Audio chiptune synth (no audio files)
  js/main.js         boot screen, starfield, XP/levels, achievements, toasts
  js/game.js         SKYBREAKER playable demo (canvas)
  assets/logo.svg    logo mark (also used as favicon)
```

## Customise

- **Social links / contact** — search `index.html` for `data-placeholder="social"` and drop in real URLs.
- **Playtest form** — `js/main.js`, look for `WIRE YOUR ENDPOINT HERE` (it currently stores locally + toasts).
- **Team slots** — `index.html` → `#guild` section ("SLOT LOCKED" cards).
- **Logo colors** — `public/assets/logo.svg` + the `--cyan/--magenta` tokens in `css/style.css`.

## Deploy (Railway)

The repo builds with zero config (Node start script):

1. New Project → Deploy from GitHub repo → pick this repo.
2. Settings → Networking → Generate Domain.

Railway injects `$PORT`; `server.js` listens on it.