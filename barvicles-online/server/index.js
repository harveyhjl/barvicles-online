import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";

import {
  rooms,
  createRoom,
  joinRoom,
  addComputerPlayer,
  startGame,
  restartGame,
  playCards,
  drawCard,
  callBarvicles,
  updateRules,
  botTakeTurn,
  sendChat,
  getPublicState
} from "./game.js";

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3001;

app.get("/", (_req, res) => {
  res.send("Barvicles server is running");
});

function emitRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  for (const p of room.players) {
    if (!p.isBot) {
      io.to(p.socketId).emit("state", getPublicState(roomCode, p.id));
    }
  }
}

function scheduleBotIfNeeded(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.phase !== "playing") return;

  const current = room.players[room.turn];
  const botCanJumpIntoSixNine = room.sixNine?.active && room.players.some(
    p => p.isBot && p.hand.some(c => c.rank === room.sixNine.nextRank)
  );
  if (!current?.isBot && !botCanJumpIntoSixNine) return;

  setTimeout(() => {
    try {
      const moved = botTakeTurn(roomCode);
      if (moved) {
        emitRoom(roomCode);
        scheduleBotIfNeeded(roomCode);
      }
    } catch (err) {
      room.log.push(`BarvBot error: ${err.message}`);
      emitRoom(roomCode);
    }
  }, 700);
}

io.on("connection", (socket) => {
  socket.on("createRoom", ({ name }, cb) => {
    try {
      const { roomCode, playerId } = createRoom(socket.id, name || "Player 1");
      socket.join(roomCode);
      cb({ ok: true, roomCode, playerId });
      emitRoom(roomCode);
    } catch (err) {
      cb({ ok: false, error: err.message });
    }
  });

  socket.on("joinRoom", ({ roomCode, name }, cb) => {
    try {
      const cleanCode = roomCode.toUpperCase().trim();
      const playerId = joinRoom(cleanCode, socket.id, name || "Player 2");
      socket.join(cleanCode);
      cb({ ok: true, roomCode: cleanCode, playerId });
      emitRoom(cleanCode);
    } catch (err) {
      cb({ ok: false, error: err.message });
    }
  });

  socket.on("addComputerPlayer", ({ roomCode }, cb) => {
    try {
      addComputerPlayer(roomCode);
      cb({ ok: true });
      emitRoom(roomCode);
    } catch (err) {
      cb({ ok: false, error: err.message });
    }
  });

  socket.on("startGame", ({ roomCode }, cb) => {
    try {
      startGame(roomCode);
      cb({ ok: true });
      emitRoom(roomCode);
      scheduleBotIfNeeded(roomCode);
    } catch (err) {
      cb({ ok: false, error: err.message });
    }
  });

  socket.on("restartGame", ({ roomCode }, cb) => {
    try {
      restartGame(roomCode);
      cb({ ok: true });
      emitRoom(roomCode);
      scheduleBotIfNeeded(roomCode);
    } catch (err) {
      cb({ ok: false, error: err.message });
    }
  });

  socket.on("playCards", ({ roomCode, playerId, cardIds, chosenSuit, saidBarvicles }, cb) => {
    try {
      playCards(roomCode, playerId, cardIds, chosenSuit, !!saidBarvicles);
      cb({ ok: true });
      emitRoom(roomCode);
      scheduleBotIfNeeded(roomCode);
    } catch (err) {
      cb({ ok: false, error: err.message });
    }
  });

  socket.on("drawCard", ({ roomCode, playerId }, cb) => {
    try {
      drawCard(roomCode, playerId);
      cb({ ok: true });
      emitRoom(roomCode);
      scheduleBotIfNeeded(roomCode);
    } catch (err) {
      cb({ ok: false, error: err.message });
    }
  });

  socket.on("callBarvicles", ({ roomCode, playerId }, cb) => {
    try {
      callBarvicles(roomCode, playerId);
      cb({ ok: true });
      emitRoom(roomCode);
    } catch (err) {
      cb({ ok: false, error: err.message });
    }
  });

  socket.on("updateRules", ({ roomCode, rules }, cb) => {
    try {
      updateRules(roomCode, rules);
      cb({ ok: true });
      emitRoom(roomCode);
      scheduleBotIfNeeded(roomCode);
    } catch (err) {
      cb({ ok: false, error: err.message });
    }
  });

  socket.on("sendChat", ({ roomCode, playerId, text }, cb) => {
    try {
      sendChat(roomCode, playerId, text);
      cb({ ok: true });
      emitRoom(roomCode);
    } catch (err) {
      cb({ ok: false, error: err.message });
    }
  });

  socket.on("getState", ({ roomCode, playerId }, cb) => {
    try {
      cb({ ok: true, state: getPublicState(roomCode, playerId) });
    } catch (err) {
      cb({ ok: false, error: err.message });
    }
  });

  socket.on("disconnect", () => {
    for (const [code, room] of rooms.entries()) {
      const player = room.players.find(p => p.socketId === socket.id);
      if (player) {
        player.connected = false;
        room.log.push(`${player.name} disconnected.`);
        emitRoom(code);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Barvicles server running on port ${PORT}`);
});
