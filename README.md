# song ranker

rank the songs in a folder against each other. pick which of two is
better, it keeps score with elo, and at the end you have a ranking.

## run it

open index.html in a browser. if songs don't play over file://, run
`python3 serve.py` and open http://localhost:8000 instead.

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
