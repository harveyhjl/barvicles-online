export const rooms = new Map();

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const NOPEABLE = new Set(["A", "2", "3", "4", "7", "8", "J", "Q"]);

const DEFAULT_RULES = {
  ace: true,
  pickup2: true,
  steal3: true,
  pickup4: true,
  fiveKing: true,
  sixNine: true,
  skip7: true,
  give8: true,
  nope10: true,
  jackSwap: true,
  queenDump: true,
  threeKings: true,
  barviclesPenalty: true
};

function ruleOn(room, key) {
  return room.rules?.[key] !== false;
}

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

function removeDiscardedCardsFromHands(room) {
  // Critical Barvicles law:
  // once a card is on the discard pile, it must never also be in anyone's hand.
  // Snapshot restore can accidentally resurrect played cards, especially 10s.
  const discardedIds = new Set(room.discard.map(c => c.id));
  for (const p of room.players) {
    p.hand = p.hand.filter(c => !discardedIds.has(c.id));
  }
}

function clearNope(room) {
  room.nopeTarget = null;
  room.nopedTarget = null;
}

function normalizeGameState(room) {
  // These states must never overlap.
  // If a pickup chain is active, Queen dump is cancelled/stale.
  if (room.pendingDraw > 0 && room.queenDump?.active) {
    room.queenDump = null;
    room.log.push(`Stale Queen dump cleared because a pickup chain is active.`);
  }

  // Open-table 6/9: if nobody has the required opposite card, the chain ends.
  if (room.sixNine?.active) {
    if (!ruleOn(room, "sixNine") || !anyoneHasRank(room, room.sixNine.nextRank)) {
      const resumeTurn = room.sixNine.resumeTurn ?? room.turn;
      room.sixNine = null;
      room.turn = resumeTurn;
      room.log.push(`6/9 chain ended. Play continues as normal.`);
    }
  }
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

function playerHasRank(player, rank) {
  return !!player && player.hand.some(c => c.rank === rank);
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
  } else {
    room.log.push(`6/9 chain continues. Next card must be ${nextRank}.`);
  }
}

function startSixNineIfNeeded(room, playedRank, playerIndexWhoPlayed) {
  if (!ruleOn(room, "sixNine")) return false;
  if (playedRank !== "6" && playedRank !== "9") return false;

  const nextRank = rankNeededAfter(playedRank);
  const resumeTurn = otherIndex(room, playerIndexWhoPlayed);

  if (!anyoneHasRank(room, nextRank)) {
    room.sixNine = null;
    room.turn = resumeTurn;
    room.log.push(`No ${nextRank} available. 6/9 chain ends.`);
    return false;
  }

  room.sixNine = {
    active: true,
    nextRank,
    resumeTurn,
    starterIndex: playerIndexWhoPlayed
  };

  // Open table: either player may play the required opposite card.
  // Keep the turn visually on the starter until the chain ends.
  room.turn = playerIndexWhoPlayed;
  room.log.push(`6/9 open table started. Anyone can play ${nextRank}.`);
  return true;
}

function canNope(card, room, playerId) {
  if (!ruleOn(room, "nope10")) return false;
  if (card.rank !== "10") return false;
  if (room.nopeTarget && room.nopeTarget.sourcePlayerId !== playerId) return true;
  if (room.nopedTarget) return true;
  return false;
}

function canPickupKingWithFive(card, room) {
  if (!ruleOn(room, "fiveKing")) return false;
  if (card.rank !== "5") return false;
  const t = top(room);
  return t?.rank === "K";
}

function isSixNineChaosCard(card, room) {
  if (!ruleOn(room, "sixNine")) return false;
  if (!room.sixNine?.active) return false;
  return card.rank === room.sixNine.nextRank;
}

function canPlayOn(card, room, playerId) {
  const t = top(room);
  if (!t) return true;

  // 6/9 open table: while active, ONLY the required opposite 6/9 can be played.
  if (room.sixNine?.active) return isSixNineChaosCard(card, room);

  // Pending pickup chain has priority over everything except nope/stacking.
  // Queen dump must not continue while pickup is pending.
  if (room.pendingDraw > 0) {
    if (card.rank === "10") return true;
    if (room.pendingRank && card.rank === room.pendingRank) return true;
    return false;
  }

  // During Queen dump, the Queen player can dump anything without powers.
  if (room.queenDump?.active && room.queenDump.playerId === playerId) return true;

  // 5 can always pick up a King if a King is on top.
  // This is allowed even when the 5 does not match suit/rank.
  if (canPickupKingWithFive(card, room)) return true;

  // 10 can nope almost every special, and nope a nope.
  if (canNope(card, room, playerId)) return true;

  if (card.rank === "A" && ruleOn(room, "ace")) return true;
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
  room.lastFinish = null;
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
  room.lastFinish = {
    winner: winner.name,
    setWon,
    matchWon,
    threeKings: String(reason || "").includes("3 Kings")
  };
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
  if (!ruleOn(room, "barviclesPenalty")) return;
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
    players: [{ id: playerId, socketId, name, hand: [], connected: true, saidBarvicles: false, isBot: false }],
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
    rules: { ...DEFAULT_RULES },
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
  room.players.push({ id: playerId, socketId, name, hand: [], connected: true, saidBarvicles: false, isBot: false });
  room.scores[playerId] = { rounds: 0, sets: 0 };
  room.log.push(`${name} joined.`);
  return playerId;
}


export function addComputerPlayer(code) {
  const room = rooms.get(code);
  if (!room) throw new Error("Room not found");
  if (room.players.length >= 2) throw new Error("Room full");

  const playerId = `bot-${id()}`;
  room.players.push({
    id: playerId,
    socketId: `bot-${code}`,
    name: "BarvBot",
    hand: [],
    connected: true,
    saidBarvicles: false,
    isBot: true
  });
  room.scores[playerId] = { rounds: 0, sets: 0 };
  room.log.push(`BarvBot joined.`);
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

  normalizeGameState(room);

  if (!cardIds?.length) throw new Error("Choose a card");

  const cards = cardIds.map(cid => {
    const idx = findCardIndex(player.hand, cid);
    if (idx === -1) throw new Error("Card not in hand");
    return player.hand[idx];
  });

  const isThreeKingsWin = cards.length === 3 && cards.every(c => c.rank === "K");

  // 3 Kings is the only normal multi-card play now.
  // Queen dump is staged separately, but 3 Kings must still work.
  if (isThreeKingsWin && ruleOn(room, "threeKings")) {
    // Can be played regardless of whose turn it is, top card, suit, or pending effects.
    // It cannot be noped.
    removeCardsFromHandToDiscard(player, room, cards);
    finishRound(room, i, `${player.name} played 3 Kings and wins the round.`);
    return;
  }

  // Queen is now a staged move: play Queen first, then dump three cards separately.
  if (cards.length > 1) {
    throw new Error("Play one card at a time. Queen dump cards are played separately. Only 3 Kings can be played together.");
  }

  const first = cards[0];
  const isNopeMove = first.rank === "10" && canNope(first, room, playerId);
  const isChaosMove = isSixNineChaosCard(first, room);
  const isKingPickupMove = canPickupKingWithFive(first, room);

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
    let forcedTurnAfterNope = null;

    if (room.nopedTarget) {
      const target = room.nopedTarget;

      restoreSnapshot(room, target.after);
      removeDiscardedCardsFromHands(room);
      forcedTurnAfterNope = room.turn;
      room.nopeTarget = target;
      room.nopedTarget = null;
      room.log.push(`${player.name} noped the nope. The original effect stands again.`);

      // The first nope was already played, so it must not come back to hand
      // when we restore the "after original effect" snapshot.
      if (target.nopePlayerId && target.nopeCard) {
        const originalNoper = room.players.find(p => p.id === target.nopePlayerId);
        if (originalNoper) {
          commitPlayedCardAfterRestore(originalNoper, room, target.nopeCard);
        }
      }

      // If the original effect was Queen dump, the dump must go back to the original Queen player.
      if (target.effectName === "Q" && room.queenDump?.active) {
        const queenPlayerIndex = room.players.findIndex(p => p.id === target.sourcePlayerId);
        if (queenPlayerIndex >= 0) {
          room.queenDump.playerId = target.sourcePlayerId;
          room.turn = queenPlayerIndex;
          forcedTurnAfterNope = queenPlayerIndex;
          room.log.push(`Queen dump returns to ${room.players[queenPlayerIndex].name}.`);
        }
      }
    } else if (room.nopeTarget) {
      const target = room.nopeTarget;

      // Store the nope card/player so if the nope gets noped, this 10 stays played too.
      target.nopePlayerId = player.id;
      target.nopeCard = { ...first };

      restoreSnapshot(room, target.before);
      removeDiscardedCardsFromHands(room);
      room.nopedTarget = target;
      room.nopeTarget = null;
      room.log.push(`${player.name} noped ${target.effectName}.`);
    }

    // Important: restoring the snapshot puts the currently played 10 back in hand.
    // Remove it again and put it on the discard pile. Played cards never return.
    commitPlayedCardAfterRestore(player, room, first);

    room.turn = forcedTurnAfterNope ?? otherIndex(room, i);
    if (finishIfAnyPlayerHasNoCards(room)) return;
    return;
  }

  let skipNext = false;
  let specialApplied = false;

  if (first.rank === "A" && ruleOn(room, "ace")) {
    if (!SUITS.includes(chosenSuit)) throw new Error("Ace needs a chosen suit");
    room.currentSuit = chosenSuit;
    room.log.push(`${player.name} changed suit to ${chosenSuit}.`);
    specialApplied = true;
  } else if (first.rank === "2" && ruleOn(room, "pickup2")) {
    room.queenDump = null;
    room.sixNine = null;
    room.pendingDraw += 2;
    room.pendingRank = "2";
    specialApplied = true;
  } else if (first.rank === "4" && ruleOn(room, "pickup4")) {
    room.queenDump = null;
    room.sixNine = null;
    room.pendingDraw += 4;
    room.pendingRank = "4";
    specialApplied = true;
  } else if (first.rank === "7" && ruleOn(room, "skip7")) {
    skipNext = true;
    specialApplied = true;
  } else if (first.rank === "J" && ruleOn(room, "jackSwap")) {
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
  } else if (first.rank === "3" && ruleOn(room, "steal3")) {
    const oi = otherIndex(room, i);
    const other = room.players[oi];
    if (other.hand.length > 0) {
      const stolenIndex = Math.floor(Math.random() * other.hand.length);
      const [stolen] = other.hand.splice(stolenIndex, 1);
      player.hand.push(stolen);
      room.log.push(`${player.name} took a random card from ${other.name}.`);
      specialApplied = true;
    }
  } else if (first.rank === "8" && ruleOn(room, "give8")) {
    const oi = otherIndex(room, i);
    const other = room.players[oi];
    if (player.hand.length > 0) {
      const giftedIndex = Math.floor(Math.random() * player.hand.length);
      const [gifted] = player.hand.splice(giftedIndex, 1);
      other.hand.push(gifted);
      room.log.push(`${player.name} had to give a random card to ${other.name}.`);
      specialApplied = true;
    }
  } else if (first.rank === "Q" && ruleOn(room, "queenDump")) {
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
    startSixNineIfNeeded(room, first.rank, i);
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

  normalizeGameState(room);

  if (i !== room.turn) throw new Error("Not your turn");

  const player = room.players[i];

  if (room.queenDump?.active) {
    throw new Error("Queen dump is active. Dump a card.");
  }

  if (room.sixNine?.active) {
    if (anyoneHasRank(room, room.sixNine.nextRank)) {
      throw new Error(`6/9 open table is active. Anyone can play ${room.sixNine.nextRank}.`);
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

export function updateRules(code, rulesPatch) {
  const room = rooms.get(code);
  if (!room) throw new Error("Room not found");
  room.rules = { ...DEFAULT_RULES, ...(room.rules || {}), ...(rulesPatch || {}) };

  if (!ruleOn(room, "sixNine")) room.sixNine = null;
  if (!ruleOn(room, "queenDump")) room.queenDump = null;
  if (!ruleOn(room, "nope10")) clearNope(room);

  normalizeGameState(room);
  room.log.push(`Rules updated.`);
}


function chooseSuitFromHand(hand) {
  const counts = { "♠": 0, "♥": 0, "♦": 0, "♣": 0 };
  for (const c of hand) if (counts[c.suit] !== undefined) counts[c.suit] += 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function scoreBotCard(card, room, bot) {
  if (card.rank === "10" && canNope(card, room, bot.id)) return 100;
  if (room.pendingDraw > 0 && card.rank === room.pendingRank) return 95;
  if (card.rank === "5" && canPickupKingWithFive(card, room)) return 90;
  if (card.rank === "3" && ruleOn(room, "steal3")) return 80;
  if (card.rank === "7" && ruleOn(room, "skip7")) return 70;
  if (card.rank === "2" && ruleOn(room, "pickup2")) return 65;
  if (card.rank === "4" && ruleOn(room, "pickup4")) return 64;
  if (card.rank === "A" && ruleOn(room, "ace")) return 50;
  if (card.rank === "Q" && ruleOn(room, "queenDump")) return 45;
  if (card.rank === "J" && ruleOn(room, "jackSwap")) return 20;
  if (card.rank === "8" && ruleOn(room, "give8")) return 5;
  return 30;
}

function chooseBotMove(room, botIndex) {
  const bot = room.players[botIndex];

  const kings = bot.hand.filter(c => c.rank === "K");
  if (ruleOn(room, "threeKings") && kings.length >= 3) {
    return { type: "play", cardIds: kings.slice(0, 3).map(c => c.id), chosenSuit: "♠", saidBarvicles: bot.hand.length === 3 };
  }

  let playable = bot.hand.filter(c => canPlayOn(c, room, bot.id));

  if (room.queenDump?.active && room.queenDump.playerId === bot.id) {
    const dumpables = [...playable].sort((a, b) => {
      const penalty = r => r === "K" ? 100 : ["10", "A", "2", "4", "3", "7"].includes(r) ? 20 : 0;
      return penalty(a.rank) - penalty(b.rank);
    });
    if (dumpables[0]) return { type: "play", cardIds: [dumpables[0].id], chosenSuit: dumpables[0].suit, saidBarvicles: bot.hand.length === 1 };
  }

  if (playable.length === 0) return { type: "draw" };

  playable = playable.sort((a, b) => scoreBotCard(b, room, bot) - scoreBotCard(a, room, bot));
  const chosen = playable[0];

  return {
    type: "play",
    cardIds: [chosen.id],
    chosenSuit: chosen.rank === "A" ? chooseSuitFromHand(bot.hand) : chosen.suit,
    saidBarvicles: bot.hand.length === 1
  };
}

export function botTakeTurn(code) {
  const room = rooms.get(code);
  if (!room) throw new Error("Room not found");
  if (room.phase !== "playing") return false;

  normalizeGameState(room);

  let botIndex = room.players.findIndex(p => p.isBot && p.id === room.players[room.turn]?.id);

  // During 6/9 open table, BarvBot may jump in even when the visual turn is not on it.
  if (botIndex === -1 && room.sixNine?.active) {
    botIndex = room.players.findIndex(p => p.isBot && p.hand.some(c => c.rank === room.sixNine.nextRank));
  }

  if (botIndex === -1) return false;

  const bot = room.players[botIndex];
  const move = chooseBotMove(room, botIndex);

  if (move.type === "draw") {
    if (room.sixNine?.active) return false;
    drawCard(code, bot.id);
    return true;
  }

  playCards(code, bot.id, move.cardIds, move.chosenSuit, move.saidBarvicles);
  return true;
}


export function sendChat(code, playerId, text) {
  const room = rooms.get(code);
  if (!room) throw new Error("Room not found");
  const i = playerIndex(room, playerId);
  const player = room.players[i];
  const clean = String(text || "").trim().slice(0, 120);
  if (!clean) return;
  if (!room.chat) room.chat = [];
  room.chat.push({
    id: id(),
    name: player.name,
    text: clean,
    at: Date.now()
  });
  room.chat = room.chat.slice(-30);
}

export function getPublicState(code, playerId) {
  const room = rooms.get(code);
  if (!room) throw new Error("Room not found");

  const i = playerIndex(room, playerId);
  const me = room.players[i];
  const opp = room.players[otherIndex(room, i)] || null;

  room.players.forEach(p => ensureScore(room, p.id));
  normalizeGameState(room);

  return {
    code,
    phase: room.phase,
    you: {
      id: me.id,
      name: me.name,
      hand: me.hand,
      cardCount: me.hand.length,
      saidBarvicles: me.saidBarvicles,
      isBot: !!me.isBot,
      score: room.scores[me.id]?.rounds || 0,
      rounds: room.scores[me.id]?.rounds || 0,
      sets: room.scores[me.id]?.sets || 0
    },
    opponent: opp ? {
      name: opp.name,
      cardCount: opp.hand.length,
      connected: opp.connected,
      isBot: !!opp.isBot,
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
    lastFinish: room.lastFinish || null,
    chat: room.chat || [],
    rules: { ...DEFAULT_RULES, ...(room.rules || {}) },
    scores: room.players.map(p => ({
      name: p.name,
      score: room.scores[p.id]?.rounds || 0,
      rounds: room.scores[p.id]?.rounds || 0,
      sets: room.scores[p.id]?.sets || 0
    })),
    log: room.log.slice(-12)
  };
}
