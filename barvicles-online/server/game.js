export const rooms = new Map();

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const NOPEABLE = new Set(["A", "2", "3", "4", "7", "8", "J", "Q"]);

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

function findCardIndex(hand, cardId) {
  return hand.findIndex(c => c.id === cardId);
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

function cloneCard(card) {
  return card ? { ...card } : null;
}

function snapshotState(room) {
  return {
    hands: room.players.map(p => p.hand.map(cloneCard)),
    currentSuit: room.currentSuit,
    pendingDraw: room.pendingDraw,
    pendingRank: room.pendingRank,
    turn: room.turn,
    queenDump: room.queenDump ? { ...room.queenDump } : null,
    sixNine: room.sixNine ? { ...room.sixNine } : null
  };
}

function restoreSnapshot(room, snap) {
  room.players.forEach((p, idx) => {
    p.hand = snap.hands[idx].map(cloneCard);
  });
  room.currentSuit = snap.currentSuit;
  room.pendingDraw = snap.pendingDraw;
  room.pendingRank = snap.pendingRank;
  room.turn = snap.turn;
  room.queenDump = snap.queenDump ? { ...snap.queenDump } : null;
  room.sixNine = snap.sixNine ? { ...snap.sixNine } : null;
}

function clearNope(room) {
  room.nopeTarget = null;
  room.nopedTarget = null;
}

function rememberNopeTarget(room, effectName, before, after, sourcePlayerId) {
  room.nopeTarget = { effectName, before, after, sourcePlayerId };
  room.nopedTarget = null;
}

function rankNeededAfter(rank) {
  if (rank === "6") return "9";
  if (rank === "9") return "6";
  return null;
}

function anyoneHasRank(room, rank) {
  return room.players.some(p => p.hand.some(c => c.rank === rank));
}

function updateSixNineAfterPlay(room, playedRank) {
  if (playedRank !== "6" && playedRank !== "9") return;

  if (!room.sixNine?.active) return;

  const nextRank = rankNeededAfter(playedRank);
  room.sixNine.nextRank = nextRank;

  if (!anyoneHasRank(room, nextRank)) {
    const resumeTurn = room.sixNine.resumeTurn ?? room.turn;
    room.sixNine = null;
    room.turn = resumeTurn;
    room.log.push(`6/9 chain ended. Play continues as normal.`);
  }
}

function startSixNineIfNeeded(room, playedRank, playerIndexWhoPlayed) {
  if (playedRank !== "6" && playedRank !== "9") return false;

  const nextRank = rankNeededAfter(playedRank);
  room.sixNine = {
    active: true,
    nextRank,
    resumeTurn: otherIndex(room, playerIndexWhoPlayed)
  };

  if (!anyoneHasRank(room, nextRank)) {
    room.sixNine = null;
    room.turn = otherIndex(room, playerIndexWhoPlayed);
    return false;
  }

  room.log.push(`6/9 chaos started. Next card must be ${nextRank}.`);
  return true;
}

function canNope(card, room, playerId) {
  if (card.rank !== "10") return false;
  if (room.nopeTarget && room.nopeTarget.sourcePlayerId !== playerId) return true;
  if (room.nopedTarget) return true;
  return false;
}

function canPickupKingWithFive(card, room) {
  if (card.rank !== "5") return false;
  const t = top(room);
  return t?.rank === "K";
}

function isSixNineChaosCard(card, room) {
  if (!room.sixNine?.active) return false;
  return card.rank === room.sixNine.nextRank;
}

function canPlayOn(card, room, playerId) {
  const t = top(room);
  if (!t) return true;

  // During Queen dump, the Queen player can dump anything without powers.
  if (room.queenDump?.active && room.queenDump.playerId === playerId) return true;

  // During Queen dump, anyone quick enough can use 5 to collect a King sitting on top.
  if (room.queenDump?.active && canPickupKingWithFive(card, room)) return true;

  // 6/9 chaos: only the required alternate rank may be played.
  if (room.sixNine?.active) return isSixNineChaosCard(card, room);

  // 10 can nope almost every special, and nope a nope.
  if (canNope(card, room, playerId)) return true;

  if (room.pendingDraw > 0) {
    if (card.rank === "10") return true;
    if (room.pendingRank && card.rank === room.pendingRank) return true;
    return false;
  }

  if (card.rank === "A") return true;
  return card.suit === room.currentSuit || card.rank === t.rank;
}

function hasPlayable(room, hand, playerId) {
  return hand.some(c => canPlayOn(c, room, playerId));
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

  if (room.nextStartingPlayerId) {
    const winnerIndex = room.players.findIndex(p => p.id === room.nextStartingPlayerId);
    room.turn = winnerIndex >= 0 ? winnerIndex : 0;
  } else {
    room.turn = 0;
  }

  room.pendingDraw = 0;
  room.pendingRank = null;
  room.nopeTarget = null;
  room.nopedTarget = null;
  room.queenDump = null;
  room.sixNine = null;
  room.winner = null;
}

function ensureScore(room, playerId) {
  if (!room.scores[playerId]) {
    room.scores[playerId] = { rounds: 0, sets: 0 };
  }
}

function finishRound(room, winnerIndex, reason) {
  const winner = room.players[winnerIndex];
  ensureScore(room, winner.id);

  room.scores[winner.id].rounds += 1;
  let setWon = false;
  let matchWon = false;

  if (room.scores[winner.id].rounds >= 3) {
    room.scores[winner.id].sets += 1;
    setWon = true;
    room.players.forEach(p => {
      ensureScore(room, p.id);
      room.scores[p.id].rounds = 0;
    });
  }

  if (room.scores[winner.id].sets >= 3) {
    matchWon = true;
    room.matchWinner = winner.name;
  }

  room.winner = winner.name;
  room.nextStartingPlayerId = winner.id;
  room.phase = "finished";
  clearNope(room);
  room.queenDump = null;
  room.sixNine = null;

  room.log.push(reason || `${winner.name} wins the round.`);
  if (setWon) room.log.push(`${winner.name} wins the set.`);
  if (matchWon) room.log.push(`${winner.name} wins the match.`);
  room.log.push(`${winner.name} starts the next round.`);
}

function finishIfAnyPlayerHasNoCards(room) {
  const winnerIndex = room.players.findIndex(p => p.hand.length === 0);
  if (winnerIndex !== -1) {
    finishRound(room, winnerIndex, `${room.players[winnerIndex].name} wins with no cards left.`);
    return true;
  }
  return false;
}

function applyBarviclesPenaltyIfNeeded(room, player) {
  if (room.phase !== "playing") return;
  if (player.hand.length === 1 && !player.saidBarvicles) {
    player.hand.push(drawFromPile(room));
    room.log.push(`${player.name} forgot Barvicles and picked up 1.`);
  }
}

function removeCardsFromHandToDiscard(player, room, cards) {
  for (const c of cards) {
    const idx = findCardIndex(player.hand, c.id);
    if (idx === -1) throw new Error("Card not in hand");
    const [realCard] = player.hand.splice(idx, 1);
    room.discard.push(realCard);
    room.currentSuit = realCard.suit;
  }
}

function commitPlayedCardAfterRestore(player, room, playedCard) {
  // Used after restoring a snapshot for nope logic.
  // A played card must never return to the player's hand.
  const idx = findCardIndex(player.hand, playedCard.id);
  if (idx !== -1) {
    const [realCard] = player.hand.splice(idx, 1);
    room.discard.push(realCard);
    room.currentSuit = realCard.suit;
    return;
  }

  // Fallback: if the exact id is missing, still put the card on the pile.
  room.discard.push(playedCard);
  room.currentSuit = playedCard.suit;
}

}

function pickupKingWithFive(room, player, cards) {
  if (cards.length !== 1 || cards[0].rank !== "5") return false;
  if (top(room)?.rank !== "K") return false;

  const five = cards[0];
  const fiveIdx = findCardIndex(player.hand, five.id);
  if (fiveIdx === -1) throw new Error("Card not in hand");
  const [realFive] = player.hand.splice(fiveIdx, 1);

  const king = room.discard.pop();
  player.hand.push(king);

  room.discard.push(realFive);
  room.currentSuit = realFive.suit;

  room.log.push(`${player.name} played 5 and picked up ${king.rank}${king.suit}.`);
  return true;
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
    nopeTarget: null,
    nopedTarget: null,
    queenDump: null,
    sixNine: null,
    winner: null,
    matchWinner: null,
    nextStartingPlayerId: null,
    scores: { [playerId]: { rounds: 0, sets: 0 } },
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
  room.scores[playerId] = { rounds: 0, sets: 0 };
  room.log.push(`${name} joined.`);
  return playerId;
}

export function startGame(code) {
  const room = rooms.get(code);
  if (!room) throw new Error("Room not found");
  if (room.players.length !== 2) throw new Error("Need two players");

  room.players.forEach(p => ensureScore(room, p.id));
  resetHandsAndDeck(room);
  room.log.push(`Game started. First card is ${top(room).rank}${top(room).suit}.`);
}

export function restartGame(code) {
  const room = rooms.get(code);
  if (!room) throw new Error("Room not found");
  if (room.players.length !== 2) throw new Error("Need two players");

  resetHandsAndDeck(room);
  room.log.push(`Next round started. First card is ${top(room).rank}${top(room).suit}.`);
}

export function playCards(code, playerId, cardIds, chosenSuit, saidBarvicles) {
  const room = rooms.get(code);
  if (!room) throw new Error("Room not found");
  if (room.phase !== "playing") throw new Error("Game not active");

  const i = playerIndex(room, playerId);
  const player = room.players[i];

  if (!cardIds?.length) throw new Error("Choose a card");

  const cards = cardIds.map(cid => {
    const idx = findCardIndex(player.hand, cid);
    if (idx === -1) throw new Error("Card not in hand");
    return player.hand[idx];
  });

  // Queen is now a staged move: play Queen first, then dump three cards separately.
  if (cards.length > 1) {
    throw new Error("Play one card at a time. Queen dump cards are played separately.");
  }

  const first = cards[0];
  const isThreeKingsWin = cardIds.length === 3 && cards.every(c => c.rank === "K");
  const isNopeMove = first.rank === "10" && canNope(first, room, playerId);
  const isChaosMove = isSixNineChaosCard(first, room);
  const isKingPickupMove = canPickupKingWithFive(first, room);

  // Three Kings can be played together; this branch is kept for direct API safety.
  if (isThreeKingsWin) {
    removeCardsFromHandToDiscard(player, room, cards);
    finishRound(room, i, `${player.name} played 3 Kings and wins the round.`);
    return;
  }

  if (i !== room.turn && !isNopeMove && !isChaosMove && !isKingPickupMove) {
    throw new Error("Not your turn");
  }

  if (!canPlayOn(first, room, playerId)) throw new Error("Card is not playable");

  // Interrupt: 5 picks up a King from the top. Does not change Queen dump count.
  if (isKingPickupMove) {
    pickupKingWithFive(room, player, cards);
    if (finishIfAnyPlayerHasNoCards(room)) return;
    applyBarviclesPenaltyIfNeeded(room, player);
    return;
  }

  // During Queen dump: cards have no powers. Just place them. They are one-by-one.
  if (room.queenDump?.active && room.queenDump.playerId === playerId) {
    removeCardsFromHandToDiscard(player, room, cards);
    room.queenDump.remaining -= 1;
    room.log.push(`${player.name} dumped ${first.rank}${first.suit} from Queen. No power activates.`);

    if (finishIfAnyPlayerHasNoCards(room)) return;

    if (room.queenDump.remaining <= 0 || player.hand.length === 0) {
      const resumeTurn = room.queenDump.resumeTurn;
      room.queenDump = null;
      room.turn = resumeTurn;
      room.log.push(`Queen dump finished. Play continues.`);
    }

    applyBarviclesPenaltyIfNeeded(room, player);
    return;
  }

  const before = snapshotState(room);

  // Remove normal card from hand and put it on discard.
  removeCardsFromHandToDiscard(player, room, cards);
  player.saidBarvicles = !!saidBarvicles;
  room.log.push(`${player.name} played ${first.rank}${first.suit}.`);

    if (first.rank === "10" && isNopeMove) {
    if (room.nopedTarget) {
      restoreSnapshot(room, room.nopedTarget.after);
      room.nopeTarget = room.nopedTarget;
      room.nopedTarget = null;
      room.log.push(`${player.name} noped the nope. The game returns to how it was before the first nope.`);
    } else if (room.nopeTarget) {
      const target = room.nopeTarget;
      restoreSnapshot(room, target.before);
      room.nopedTarget = target;
      room.nopeTarget = null;
      room.log.push(`${player.name} noped ${target.effectName}.`);
    }

    // Important: restoring the snapshot puts the played 10 back in hand.
    // Remove it again and put it on the discard pile. Played cards never return.
    commitPlayedCardAfterRestore(player, room, first);

    room.turn = otherIndex(room, i);
    if (finishIfAnyPlayerHasNoCards(room)) return;
    return;
  }
  let skipNext = false;
  let specialApplied = false;

  if (first.rank === "A") {
    if (!SUITS.includes(chosenSuit)) throw new Error("Ace needs a chosen suit");
    room.currentSuit = chosenSuit;
    room.log.push(`${player.name} changed suit to ${chosenSuit}.`);
    specialApplied = true;
  } else if (first.rank === "2") {
    room.pendingDraw += 2;
    room.pendingRank = "2";
    specialApplied = true;
  } else if (first.rank === "4") {
    room.pendingDraw += 4;
    room.pendingRank = "4";
    specialApplied = true;
  } else if (first.rank === "7") {
    skipNext = true;
    specialApplied = true;
  } else if (first.rank === "J") {
    const oi = otherIndex(room, i);
    [room.players[i].hand, room.players[oi].hand] = [room.players[oi].hand, room.players[i].hand];
    room.players[i].saidBarvicles = false;
    room.players[oi].saidBarvicles = false;
    room.log.push(`${player.name} swapped hands.`);

    if (room.players[oi].hand.length === 0) {
      finishRound(room, oi, `${room.players[oi].name} wins because ${player.name} swapped them an empty hand with Jack.`);
      return;
    }

    specialApplied = true;
  } else if (first.rank === "3") {
    const oi = otherIndex(room, i);
    const other = room.players[oi];
    if (other.hand.length > 0) {
      const stolenIndex = Math.floor(Math.random() * other.hand.length);
      const [stolen] = other.hand.splice(stolenIndex, 1);
      player.hand.push(stolen);
      room.log.push(`${player.name} took a random card from ${other.name}.`);
      specialApplied = true;
    }
  } else if (first.rank === "8") {
    const oi = otherIndex(room, i);
    const other = room.players[oi];
    if (player.hand.length > 0) {
      const giftedIndex = Math.floor(Math.random() * player.hand.length);
      const [gifted] = player.hand.splice(giftedIndex, 1);
      other.hand.push(gifted);
      room.log.push(`${player.name} had to give a random card to ${other.name}.`);
      specialApplied = true;
    }
  } else if (first.rank === "Q") {
    room.queenDump = {
      active: true,
      playerId: player.id,
      remaining: 3,
      resumeTurn: otherIndex(room, i)
    };
    room.turn = i;
    room.log.push(`${player.name} must now dump 3 cards separately. Dumped cards have no powers.`);
    specialApplied = true;
  }

  // 6/9 chaos after a normal 6/9 play.
  if (first.rank === "6" || first.rank === "9") {
    clearNope(room);
    const active = startSixNineIfNeeded(room, first.rank, i);
    if (active) room.turn = i; // wait for fastest 6/9 slap-down from either player
    if (finishIfAnyPlayerHasNoCards(room)) return;
    applyBarviclesPenaltyIfNeeded(room, player);
    return;
  }

  const after = snapshotState(room);

  if (specialApplied && NOPEABLE.has(first.rank)) {
    rememberNopeTarget(room, first.rank, before, after, player.id);
  } else {
    clearNope(room);
  }

  if (finishIfAnyPlayerHasNoCards(room)) return;

  applyBarviclesPenaltyIfNeeded(room, player);

  if (room.queenDump?.active) {
    room.turn = i;
  } else if (skipNext) {
    room.turn = i;
    room.log.push(`${room.players[otherIndex(room, i)].name} is skipped.`);
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

  if (room.queenDump?.active) {
    throw new Error("Queen dump is active. Dump a card.");
  }

  if (room.sixNine?.active) {
    if (anyoneHasRank(room, room.sixNine.nextRank)) {
      throw new Error(`6/9 chaos is active. Next card must be ${room.sixNine.nextRank}.`);
    }
    room.turn = room.sixNine.resumeTurn;
    room.sixNine = null;
  }

  if (room.pendingDraw > 0) {
    for (let n = 0; n < room.pendingDraw; n++) player.hand.push(drawFromPile(room));
    room.log.push(`${player.name} picked up ${room.pendingDraw}.`);
    room.pendingDraw = 0;
    room.pendingRank = null;
    clearNope(room);
  } else {
    if (hasPlayable(room, player.hand, playerId)) throw new Error("You must play if you can");
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

  room.players.forEach(p => ensureScore(room, p.id));

  return {
    code,
    phase: room.phase,
    you: {
      id: me.id,
      name: me.name,
      hand: me.hand,
      cardCount: me.hand.length,
      saidBarvicles: me.saidBarvicles,
      score: room.scores[me.id]?.rounds || 0,
      rounds: room.scores[me.id]?.rounds || 0,
      sets: room.scores[me.id]?.sets || 0
    },
    opponent: opp ? {
      name: opp.name,
      cardCount: opp.hand.length,
      connected: opp.connected,
      score: room.scores[opp.id]?.rounds || 0,
      rounds: room.scores[opp.id]?.rounds || 0,
      sets: room.scores[opp.id]?.sets || 0
    } : null,
    topCard: top(room),
    currentSuit: room.currentSuit,
    pickupPileCount: room.deck.length,
    discardCount: room.discard.length,
    pendingDraw: room.pendingDraw,
    queenDump: room.queenDump ? { ...room.queenDump } : null,
    sixNine: room.sixNine ? { ...room.sixNine } : null,
    isYourTurn: room.players[room.turn]?.id === playerId,
    winner: room.winner,
    matchWinner: room.matchWinner,
    scores: room.players.map(p => ({
      name: p.name,
      score: room.scores[p.id]?.rounds || 0,
      rounds: room.scores[p.id]?.rounds || 0,
      sets: room.scores[p.id]?.sets || 0
    })),
    log: room.log.slice(-12)
  };
}
