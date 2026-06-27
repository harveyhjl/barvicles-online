# Barvicles Online v28

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


## v25 fix

- Fixed Create Room.
- v24 accidentally expected `createRoom()` to return `code`, but `game.js` returns `roomCode`.
- `server/index.js` now uses `{ roomCode, playerId }` correctly again.

Only `server/index.js` needs replacing for this fix.


## v26 fix

- Reworked 6/9 exactly as open-table chaos:
  - one player plays a 6 or 9
  - then either player can jump in with the opposite card
  - same player may continue 6→9→6→9 from their own hand
  - opponent may jump in at any point with the required opposite card
  - no 6 on 6 and no 9 on 9
  - when nobody has the required opposite card, the chain ends
  - after it ends, turn goes to the next player after the original 6/9 starter
- Fixed Queen dump nope-a-nope:
  - Queen gets noped = dump cancelled
  - nope gets noped = Queen dump returns to the original Queen player
- Played 10s still do not return to hand.

## Files to update

```text
server/game.js
server/index.js
README.md
```

Render must redeploy.


## v27 update — up to 4 players

- Rooms now support 2, 3, or 4 players.
- Join room limit increased from 2 to 4.
- Computer players can be added until the room reaches 4 players.
- Start game works with 2–4 players.
- Turn order is clockwise by join order.
- 7 skips the next player.
- 2/4 pickup chain affects the next player in order.
- 3 steals from the next player in order.
- 8 gives a random card to the next player in order.
- Jack swaps hands with the next player in order.
- Queen dump resumes with the next player after the Queen player.
- 6/9 open table still allows anyone to jump in with the required opposite card.
- UI now shows all other players, their card counts, and whose turn it is.

## Files to update

```text
server/game.js
server/index.js
client/src/App.jsx
client/src/style.css
README.md
```

Render and Netlify both need redeploying.


## v28 update

- Fixed bot survival after 6/9 chains:
  - if 6/9 is already active, playing the next 6/9 now advances/ends the existing chain instead of wrongly starting a fresh one.
  - when the chain ends and the next turn is a bot, the bot can continue normally.
- Slowed bot moves from 0.7s to 1.8s.
- Added per-card sound effects:
  - every played card now triggers a small sound based on rank.
  - pickup/draw has its own sound.
  - turn changes still have different sounds.
- Added clearer turn display:
  - big banner says **YOUR TURN** when it is your go.
  - otherwise it shows whose turn it is.

## Files to update

```text
server/game.js
server/index.js
client/src/App.jsx
client/src/style.css
README.md
```

Render and Netlify both need redeploying.
