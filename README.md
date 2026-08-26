# song ranker

rank the songs in a folder against each other. pick which of two is
better, it keeps score with elo, and at the end you have a ranking.

## run it (for everyone)

1. download the latest zip from Releases and unzip it
2. double click `index.html`
3. drop your songs folder in the window

if songs don't play, use the server instead: open a terminal in the
folder and run `python3 serve.py`, then open http://localhost:8000.
that also fixes browser caching.

## updating (keeps your ratings)

ratings are saved in your browser, not in the folder. updating the
app does not delete them.

**easiest keep the same folder:** unzip the new release *on top of*
the old `songRanker-local` folder and click Replace. same
`file:///.../index.html` or same `http://localhost:8000` so same
storage, no export needed. this is the seamless path for everyone,
including first update from the current GitHub build which has no
Export button.

**going forward (1.1.0+):**
1. click `Export Data` at the bottom of the ranking list so it
   downloads `songRanker-backup.json`
2. replace the old app folder with the new one
3. open the new `index.html` (or http://localhost:8000) and click
   `Import Data`, pick the json file. it reloads intact.

if you run via `python3 serve.py` you never need to export. just
replace the files and reload. `http://localhost:8000` has the same
storage every time. `file://` needs Export and Import only if you move
to a new folder.

**first update from old GitHub via new folder:** old has no Export.
if you already made a new folder and ratings look gone, don't panic.
reopen the *old* `index.html`, press F12 → Console → paste:
`Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob([localStorage.getItem('localSongRanker')],{type:'application/json'})),download:'songRanker-backup.json'}).click()`
then Import in the new folder.

after an update you will see a short "Updated! Your ratings were
kept." toast and the version in the footer bumps (e.g. v1.1.0).
`serve.py` sends `Cache-Control: no-store` and the page has
`no-cache` meta tags, so you never need a hard refresh.

## how it works

- pick a folder of audio. every file becomes a song, named after the
  filename.
- the app shows two songs, you pick the one you like better.
- votes save to localStorage, keyed by filename. pick the same folder
  again and the votes are still there.
- the folder gets remembered. most browsers reopen it on their own,
  some need one click to reconnect, and on firefox/safari there's an
  option to keep the songs stored in the browser instead, which costs
  disk space.
- keys: a or left arrow picks A, l or right arrow picks B, space skips.

## formats

mp3, ogg, wav, flac, m4a, aac, opus, webm, wma, aiff.

## credits

stripped from https://github.com/stavros-alt/drSongRanker. credit the
original if you publish something based on it.
