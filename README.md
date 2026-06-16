# Barvicles Online v9

## Implemented rules

### Setup

- 11 cards each.
- One card face up starts the discard pile.
- The rest is the pickup pile.
- You must play if you can.
- If you pick up, your turn ends.
- Call **Barvicles** when you are on your last card.
- Forgetting Barvicles means pick up 1.

### Card rules

| Card | Rule |
|---|---|
| A | Wildcard. Change suit. |
| 2 | Pick up 2. Stackable. |
| 3 | You take one random card from the opponent. If this leaves them with zero cards, they win. |
| 4 | Pick up 4. Stackable. |
| 5 | If a King is on top, playing a 5 lets you pick that King up into your hand. The 5 becomes the new top card. |
| 6 / 9 | Chaos chain. If the top card is 6, either player can play a 9. If the top card is 9, either player can play a 6. Whoever clicks fastest gets it down. |
| 7 | Miss a go. In two-player mode, the same player gets another turn. |
| 8 | One random card from your hand goes to the opponent. |
| 10 | Nope. Cancels almost every special effect: A change suit, 2/4 pickup chains, 3/8 random card transfer, 7 skip, J swap, and Q dump. Can nope a nope. Cannot nope 3 Kings. |
| J | Swap hands. If Jack is your last card, you still swap, so the opponent receives your empty hand and wins. |
| Q | Play Queen and dump up to 3 extra cards on top. The final dumped card becomes the new top card. |
| K | Playing 3 Kings together instantly wins. Cannot be noped. Winner starts the next game. |

## Extra app features

- Restart game button.
- Score tracker for the room.
- Winner starts the next game.
- Turn-change sound effects with a Sound on/off button and Test sound button.
- 10 can nope almost every special effect, including Ace suit changes.
- If any player reaches zero cards because of another player's effect, they still win.
- 5 can pick up a King if the King is on top.
- Reset browser button for stale saved-room bugs.
- 6/9 chaos can be played even when it is not technically your turn.

## Run locally

```bash
cd barvicles-online-v7
npm run install-all
npm run dev
```

Open:

```text
http://localhost:5173
```

## Replace your current version

Copy these files/folders over your current project:

```text
package.json
README.md
server/index.js
server/game.js
client/index.html
client/package.json
client/src/App.jsx
client/src/style.css
```

Then commit and push:

```bash
git add .
git commit -m "Update Barvicles rules v7"
git push
```

Render and Netlify should redeploy automatically.

If Netlify does not update:

```text
Deploys → Trigger deploy → Clear cache and deploy site
```

If Render does not update:

```text
Manual Deploy → Clear build cache & deploy
```

## Deployment reminder

Render server root directory is probably:

```text
barvicles-online/server
```

Netlify client base directory is probably:

```text
barvicles-online/client
```

because your GitHub repo looked nested earlier.


## Audio note

Browsers block sound until someone clicks/taps the page. Use the **Test sound** button once after opening the game. After that, turn-change sounds should work.
