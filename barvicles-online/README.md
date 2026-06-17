# Barvicles Online v11

## Major rule updates in v11

- **10 / Nope fixed properly**
  - 10 can nope almost every special.
  - If you nope a nope, the game goes back to how it was before the first nope.
  - 3 Kings still cannot be noped.

- **Queen changed**
  - You now play Queen first.
  - Then you dump 3 cards separately, one at a time.
  - Dumped cards do **not** activate their powers.
  - If a King is dumped, someone can quickly play a 5 to pick that King up.

- **6/9 chaos fixed**
  - 6 and 9 must alternate strictly.
  - If 6 is down, only 9 continues the chain.
  - If 9 is down, only 6 continues the chain.
  - The fastest player can slap down the correct alternate.
  - Once nobody has the next required 6/9 card, play continues as normal. The winner of the slap-down does **not** steal the next turn.

- **Scoring changed**
  - Best of 5 rounds = first to 3 rounds wins a set.
  - First to 3 sets wins the match.
  - Winner starts the next round.

- **Background colour**
  - Green if you are winning.
  - Pink if your opponent is winning.
  - It compares sets first, then rounds.

## Important files

Rules live in:

```text
server/game.js
```

Website/buttons/audio/background live in:

```text
client/src/App.jsx
client/src/style.css
```

## Replace files on GitHub

Copy these from v11 over your existing files:

```text
server/game.js
server/index.js
client/src/App.jsx
client/src/style.css
README.md
```

Then commit:

```text
Update Barvicles v11 rules
```

Netlify needs redeploying for UI/background changes.
Render needs redeploying for rule changes.

## Browser note

If the old game keeps showing, hard refresh:

```text
Cmd + Shift + R
```

If rooms get stuck, press **Reset browser** in the game.
