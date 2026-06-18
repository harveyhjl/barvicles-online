# Barvicles Online v24

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

## v12 fix

- Fixed nope snapshot bug: when a 10 is played, it never returns to the player's hand after restore logic. Played cards stay played.

## v13 fix

- Fixed 5-on-King so a 5 can be played on any King, regardless of suit, whenever a King is the top card.

## v14 fix

- Fixed nope-a-nope so both played 10s stay on the discard pile. No played 10 returns to hand after snapshot restoration.

## v15 fix

- Fixed 3 Kings after the Queen rewrite. 3 Kings is again allowed as a three-card play and wins instantly.

## v16 fix

- Hard rule added: any card on the discard pile is automatically removed from all hands after nope snapshot restores. No played cards can return to hand, including 10s.

## v17 fix

- Fixed impossible mixed state where Queen dump stayed active during a pickup chain. Pending pickup now clears stale Queen dump.


## v18 fixes

- Fixed 6/9 chain getting stuck: if nobody has the required alternate number, the chain ends and play resumes normally.
- Added rule toggles for each major rule.
- Background colour is now the same for both players:
  - Player 1 / room creator winning = green
  - Player 2 / joiner winning = pink
  - draw = normal table
- Score still uses sets first, then rounds.

## Files to update

For these changes, update:

```text
server/game.js
server/index.js
client/src/App.jsx
client/src/style.css
README.md
```

Render must redeploy for server rule fixes. Netlify must redeploy for toggles and colour.


## v19 update

- Added **Play vs Computer** button in the lobby.
- If no second player joins, the room creator can add **BarvBot**.
- BarvBot plays automatically after a short delay.
- Bot logic is simple:
  - wins with 3 Kings if possible
  - nopes/stacks pickup chains if possible
  - chooses Ace suit based on its hand
  - dumps Queen cards one by one
  - otherwise plays the best available card or picks up

## Files to update

```text
server/game.js
server/index.js
client/src/App.jsx
README.md
```

Render must redeploy for bot logic.
Netlify must redeploy for the Play vs Computer button.


## v20 fix

- Fixed missing server socket handler for `addComputerPlayer`.
- The v19 client button existed, but the server was not listening for it. Clicking it did nothing.
- Now `Play vs Computer` actually adds BarvBot.


## v24 clean rebuild

This version was rebuilt cleanly from the last working base rather than patching the broken v21/v22/v23 server files.

Included:
- Clean `server/index.js` with no duplicate imports, no missing `Server`, and no bad `disconnectPlayer` import.
- Play vs Computer retained.
- Rule toggles retained.
- 6/9 fixed for online play:
  - it only continues if the next player actually has the required alternate card
  - otherwise play resumes normally
- Top button says **New game**.
- Short chat messages added.
- Fireworks for set win.
- Big Three Kings celebration.

## Files to update

Replace the whole project folder if possible.

Minimum files:
```text
server/game.js
server/index.js
client/src/App.jsx
client/src/style.css
README.md
```

Redeploy Render and Netlify.
