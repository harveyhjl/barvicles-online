import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import {
  createRoom,
  joinRoom,
  startGame,
  playCards,
  drawCard,
  callBarvicles,
  getPublicState,
  rooms
} from "./game.js";

const app = express();
app.use(cors());
app.get("/", (_, res) => res.send("Barvicles server running"));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

function emitRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  for (const p of room.players) {
    io.to(p.socketId).emit("state", getPublicState(roomCode, p.id));
  }
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
      const playerId = joinRoom(roomCode.toUpperCase(), socket.id, name || "Player 2");
      socket.join(roomCode.toUpperCase());
      cb({ ok: true, roomCode: roomCode.toUpperCase(), playerId });
      emitRoom(roomCode.toUpperCase());
    } catch (err) {
      cb({ ok: false, error: err.message });
    }
  });

  socket.on("startGame", ({ roomCode }, cb) => {
    try {
      startGame(roomCode);
      cb({ ok: true });
      emitRoom(roomCode);
    } catch (err) {
      cb({ ok: false, error: err.message });
    }
  });

  socket.on("playCards", ({ roomCode, playerId, cardIds, chosenSuit, saidBarvicles }, cb) => {
    try {
      playCards(roomCode, playerId, cardIds, chosenSuit, !!saidBarvicles);
      cb({ ok: true });
      emitRoom(roomCode);
    } catch (err) {
      cb({ ok: false, error: err.message });
    }
  });

  socket.on("drawCard", ({ roomCode, playerId }, cb) => {
    try {
      drawCard(roomCode, playerId);
      cb({ ok: true });
      emitRoom(roomCode);
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

  socket.on("disconnect", () => {
    for (const [code, room] of rooms.entries()) {
      const player = room.players.find(p => p.socketId === socket.id);
      if (player) {
        player.connected = false;
        emitRoom(code);
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Barvicles server listening on ${PORT}`));