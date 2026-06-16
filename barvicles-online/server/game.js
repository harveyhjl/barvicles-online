export const rooms = new Map();

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function id() {
  return Math.random().toString(36).slice(2, 9);
}

function roomCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function makeDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `${rank}${suit}-${id()}`, rank, suit });
    }
  }
  return shuffle(deck);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function top(room) {
  return room.discard[room.discard.length - 1];
}

function otherIndex(room, i) {
  return i === 0 ? 1 : 0;
}

function playerIndex(room, playerId) {
  const i = room.players.findIndex(p => p.id === playerId);
  if (i === -1) throw new Error("Player not found");
  return i;
}

function drawFromPile(room) {
  if (room.deck.length === 0) {
    if (room.discard.length <= 1) throw new Error("No cards left");
    const keep = room.discard.pop();
    room.deck = shuffle(room.discard);
    room.discard = [keep];
  }
  return room.deck.pop();
}

function isSixNineChaosCard(card, room) {
  const t = top(room);
  if (!t) return false;
  return (t.rank === "6" && card.rank === "9") || (t.rank === "9" && card.rank === "6");
}

function canPlayOn(card, room) {
  const t = top(room);
  if (!t) return true;

  // 6/9 chaos: either player may slap down the alternate card.
  if (isSixNineChaosCard(card, room)) return true;

  if (room.pendingDraw > 0) {
    if (card.rank === "10") return true;
    if (room.pendingRank && card.rank === room.pendingRank) return true;
    return false;
  }

  if (card.rank === "A") return true;
  return card.suit === room.currentSuit || card.rank === t.rank;
}

function hasPlayable(room, hand) {
  return hand.some(c => canPlayOn(c, room));
}

function resetHandsAndDeck(room) {
  room.deck = makeDeck();

  for (const p of room.players) {
    p.hand = [];
    p.saidBarvicles = false;
    for (let i = 0; i < 11; i++) p.hand.push(drawFromPile(room));
  }

  room.discard = [drawFromPile(room)];
  room.currentSuit = top(room).suit;
  room.phase = "playing";
  room.turn = 0;
  room.pendingDraw = 0;
  room.pendingRank = null;
  room.winner = null;
}

function finishGame(room, winnerIndex, reason) {
  const winner = room.players[winnerIndex];
  room.winner = winner.name;
  room.phase = "finished";
  room.scores[winner.id] = (room.scores[winner.id] || 0) + 1;
  room.log.push(reason || `${winner.name} wins.`);
}

export function createRoom(socketId, name) {
  let code = roomCode();
  while (rooms.has(code)) code = roomCode();

  const playerId = id();
  rooms.set(code, {
    code,
    phase: "lobby",
    players: [{ id: playerId, socketId, name, hand: [], connected: true, saidBarvicles: false }],
    deck: [],
    discard: [],
    currentSuit: null,
    turn: 0,
    pendingDraw: 0,
    pendingRank: null,
    winner: null,
    scores: { [playerId]: 0 },
    log: [`${name} created room ${code}.`]
  });

  return { roomCode: code, playerId };
}

export function joinRoom(code, socketId, name) {
  const room = rooms.get(code);
  if (!room) throw new Error("Room not found");
  if (room.players.length >= 2) throw new Error("Room full");

  const playerId = id();
  room.players.push({ id: playerId, socketId, name, hand: [], connected: true, saidBarvicles: false });
  room.scores[playerId] = 0;
  room.log.push(`${name} joined.`);
  return playerId;
}

export function startGame(code) {
  const room = rooms.get(code);
  if (!room) throw new Error("Room not found");
  if (room.players.length !== 2) throw new Error("Need two players");

  resetHandsAndDeck(room);
  room.log.push(`Game started. First card is ${top(room).rank}${top(room).suit}.`);
}

export function restartGame(code) {
  const room = rooms.get(code);
  if (!room) throw new Error("Room not found");
  if (room.players.length !== 2) throw new Error("Need two players");

  resetHandsAndDeck(room);
  room.log.push(`Game restarted. First card is ${top(room).rank}${top(room).suit}.`);
}

export function playCards(code, playerId, cardIds, chosenSuit, saidBarvicles) {
  const room = rooms.get(code);
  if (!room) throw new Error("Room not found");
  if (room.phase !== "playing") throw new Error("Game not active");

  const i = playerIndex(room, playerId);
  const player = room.players[i];

  if (!cardIds?.length) throw new Error("Choose a card");

  let cards = cardIds.map(cid => {
    const idx = player.hand.findIndex(c => c.id === cid);
    if (idx === -1) throw new Error("Card not in hand");
    return player.hand[idx];
  });

  // Queen can be clicked in any order with its dumped cards.
  const queenIndex = cards.findIndex(c => c.rank === "Q");
  if (queenIndex > 0 && cards.length > 1) {
    const queen = cards.splice(queenIndex, 1)[0];
    cards = [queen, ...cards];
  }

  const first = cards[0];
  const isThreeKingsWin = cards.length === 3 && cards.every(c => c.rank === "K");
  const isChaosMove = cards.length === 1 && isSixNineChaosCard(first, room);

  // Normal moves require turn. 6/9 chaos is a race, so either player can play.
  if (i !== room.turn && !isChaosMove) throw new Error("Not your turn");

  // 3 Kings: instant win, ignores top card, cannot be noped.
  if (isThreeKingsWin) {
    for (const c of cards) {
      const idx = player.hand.findIndex(x => x.id === c.id);
      player.hand.splice(idx, 1);
      room.discard.push(c);
    }
    finishGame(room, i, `${player.name} played 3 Kings and wins.`);
    return;
  }

  if (!canPlayOn(first, room)) throw new Error("First card is not playable");

  if (cards.length > 1 && first.rank !== "Q") {
    throw new Error("Only Queen can dump extra cards");
  }
  if (first.rank === "Q" && cards.length > 4) {
    throw new Error("Queen can dump up to 3 extra cards");
  }

  for (const c of cards) {
    const idx = player.hand.findIndex(x => x.id === c.id);
    player.hand.splice(idx, 1);
    room.discard.push(c);
    room.currentSuit = c.suit;
  }

  const playedList = cards.map(c => c.rank + c.suit).join(", ");
  player.saidBarvicles = !!saidBarvicles;

  if (first.rank === "A") {
    if (!SUITS.includes(chosenSuit)) throw new Error("Ace needs a chosen suit");
    room.currentSuit = chosenSuit;
    room.log.push(`${player.name} played ${playedList} and changed suit to ${chosenSuit}.`);
  } else if (isChaosMove) {
    room.log.push(`${player.name} slapped down ${playedList} in the 6/9 chaos chain.`);
  } else {
    room.log.push(`${player.name} played ${playedList}.`);
  }

  let skipNext = false;
  let jackSwapped = false;

  if (first.rank === "2") {
    room.pendingDraw += 2;
    room.pendingRank = "2";
  } else if (first.rank === "4") {
    room.pendingDraw += 4;
    room.pendingRank = "4";
  } else if (first.rank === "10" && room.pendingDraw > 0) {
    room.pendingDraw = 0;
    room.pendingRank = null;
    room.log.push(`${player.name} noped the pickup chain.`);
  } else if (first.rank === "7") {
    skipNext = true;
  } else if (first.rank === "J") {
    const oi = otherIndex(room, i);

    // Jack always swaps. If Jack was your last card, opponent receives empty hand and wins.
    [room.players[i].hand, room.players[oi].hand] = [room.players[oi].hand, room.players[i].hand];
    room.players[i].saidBarvicles = false;
    room.players[oi].saidBarvicles = false;
    jackSwapped = true;
    room.log.push(`${player.name} swapped hands.`);

    if (room.players[oi].hand.length === 0) {
      finishGame(room, oi, `${room.players[oi].name} wins because ${player.name} swapped them an empty hand with Jack.`);
      return;
    }
  } else if (first.rank === "3" || first.rank === "8") {
    const oi = otherIndex(room, i);
    const other = room.players[oi];
    if (other.hand.length > 0) {
      const stolenIndex = Math.floor(Math.random() * other.hand.length);
      const [stolen] = other.hand.splice(stolenIndex, 1);
      player.hand.push(stolen);
      room.log.push(`${player.name} took a random card from ${other.name}.`);
    }
  } else if (room.pendingDraw === 0) {
    room.pendingRank = null;
  }

  if (!jackSwapped && player.hand.length === 0) {
    finishGame(room, i, `${player.name} wins.`);
    return;
  }

  if (player.hand.length === 1 && !player.saidBarvicles) {
    player.hand.push(drawFromPile(room));
    room.log.push(`${player.name} forgot Barvicles and picked up 1.`);
  }

  if (skipNext) {
    room.turn = i;
    room.log.push(`${room.players[otherIndex(room, i)].name} is skipped.`);
  } else if (isChaosMove) {
    // Whoever won the race now has control.
    room.turn = i;
  } else {
    room.turn = otherIndex(room, i);
  }
}

export function drawCard(code, playerId) {
  const room = rooms.get(code);
  if (!room) throw new Error("Room not found");
  if (room.phase !== "playing") throw new Error("Game not active");

  const i = playerIndex(room, playerId);
  if (i !== room.turn) throw new Error("Not your turn");

  const player = room.players[i];

  if (room.pendingDraw > 0) {
    for (let n = 0; n < room.pendingDraw; n++) player.hand.push(drawFromPile(room));
    room.log.push(`${player.name} picked up ${room.pendingDraw}.`);
    room.pendingDraw = 0;
    room.pendingRank = null;
  } else {
    if (hasPlayable(room, player.hand)) throw new Error("You must play if you can");
    player.hand.push(drawFromPile(room));
    room.log.push(`${player.name} picked up 1.`);
  }

  player.saidBarvicles = false;
  room.turn = otherIndex(room, i);
}

export function callBarvicles(code, playerId) {
  const room = rooms.get(code);
  if (!room) throw new Error("Room not found");
  const i = playerIndex(room, playerId);
  room.players[i].saidBarvicles = true;
  room.log.push(`${room.players[i].name} called Barvicles.`);
}

export function getPublicState(code, playerId) {
  const room = rooms.get(code);
  if (!room) throw new Error("Room not found");

  const i = playerIndex(room, playerId);
  const me = room.players[i];
  const opp = room.players[otherIndex(room, i)] || null;

  return {
    code,
    phase: room.phase,
    you: {
      id: me.id,
      name: me.name,
      hand: me.hand,
      cardCount: me.hand.length,
      saidBarvicles: me.saidBarvicles,
      score: room.scores[me.id] || 0
    },
    opponent: opp ? {
      name: opp.name,
      cardCount: opp.hand.length,
      connected: opp.connected,
      score: room.scores[opp.id] || 0
    } : null,
    topCard: top(room),
    currentSuit: room.currentSuit,
    pickupPileCount: room.deck.length,
    discardCount: room.discard.length,
    pendingDraw: room.pendingDraw,
    isYourTurn: room.players[room.turn]?.id === playerId,
    winner: room.winner,
    scores: room.players.map(p => ({ name: p.name, score: room.scores[p.id] || 0 })),
    log: room.log.slice(-10)
  };
}
