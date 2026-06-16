# Barvicles Online

A simple two-player online card game prototype for **Barvicles**.

## What it includes

- Online rooms using Socket.IO
- 11-card deal
- Pickup pile and discard pile
- UI showing your hand, top card, opponent card count, whose turn it is
- Rule logic for:
  - Match suit or rank
  - Must play if you can
  - Pickup ends your turn
  - Ace = wild, choose suit
  - 2 = pickup 2, stackable
  - 4 = pickup 4, stackable
  - 7 = skip
  - 10 = nope/cancel pickup chain
  - Jack = swap hands
  - Queen = dump up to 3 extra cards immediately
  - Barvicles call required on last card, penalty draw 1 if missed

## Run locally

Install Node.js first.

```bash
cd barvicles-online
npm run install-all
npm run dev
```

Open:

```text
http://localhost:5173
```

One player creates a room. The other joins with the room code.

## Make it playable online

The quickest setup:

1. Put this project in a GitHub repo.
2. Deploy `server/` to Render, Railway, Fly.io, or a cheap VPS.
3. Deploy `client/` to Vercel or Netlify.
4. Set the client environment variable:

```bash
VITE_SERVER_URL=https://your-server-url
```

Then rebuild/redeploy the client.

## Important

I had to infer some Barvicles rules from the chat. Edit `server/game.js` if your house rules differ.
