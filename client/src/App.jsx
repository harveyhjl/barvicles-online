import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import "./style.css";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
const socket = io(SERVER_URL, { transports: ["websocket", "polling"] });

function playTone(type = "turn") {
  // Tiny built-in sound effect using the Web Audio API.
  // No sound files needed. Browser may block sound until user clicks once.
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const now = ctx.currentTime;

    if (type === "yourTurn") {
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.setValueAtTime(880, now + 0.08);
    } else if (type === "theirTurn") {
      osc.frequency.setValueAtTime(330, now);
      osc.frequency.setValueAtTime(260, now + 0.08);
    } else if (type === "win") {
      osc.frequency.setValueAtTime(523, now);
      osc.frequency.setValueAtTime(659, now + 0.08);
      osc.frequency.setValueAtTime(784, now + 0.16);
    } else {
      osc.frequency.setValueAtTime(440, now);
    }

    osc.type = "sine";
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);

    osc.onended = () => ctx.close();
  } catch {
    // Sound failure should never break the game.
  }
}


function suitColour(suit) {
  return suit === "♥" || suit === "♦" ? "red" : "black";
}

function PlayingCard({ card, selected, onClick, small }) {
  if (!card) return <div className="card small">?</div>;
  return (
    <div onClick={onClick} className={`card ${small ? "small" : ""} ${selected ? "selected" : ""} ${suitColour(card.suit)}`}>
      <div>{card.rank}</div>
      <div>{card.suit}</div>
    </div>
  );
}

function App() {
  const [name, setName] = useState(localStorage.getItem("barviclesName") || "");
  const [roomInput, setRoomInput] = useState("");
  const [roomCode, setRoomCode] = useState(localStorage.getItem("barviclesRoom") || "");
  const [playerId, setPlayerId] = useState(localStorage.getItem("barviclesPlayer") || "");
  const [state, setState] = useState(null);
  const [selected, setSelected] = useState([]);
  const [chosenSuit, setChosenSuit] = useState("♠");
  const [saidBarvicles, setSaidBarvicles] = useState(false);
  const [error, setError] = useState("");
  const [soundOn, setSoundOn] = useState(localStorage.getItem("barviclesSound") !== "off");
  const [previousTurn, setPreviousTurn] = useState(null);
  const [previousWinner, setPreviousWinner] = useState(null);

  React.useEffect(() => {
    socket.on("state", (s) => {
      setState(s);
      setError("");
    });
    socket.on("connect_error", (err) => {
      setError(`Could not connect to server: ${err.message}`);
    });
    return () => {
      socket.off("state");
      socket.off("connect_error");
    };
  }, []);

  React.useEffect(() => {
    if (!state || !soundOn) return;

    const currentTurn = state.isYourTurn ? "you" : "them";

    if (previousTurn !== null && previousTurn !== currentTurn && state.phase === "playing") {
      playTone(state.isYourTurn ? "yourTurn" : "theirTurn");
    }

    if (state.winner && state.winner !== previousWinner) {
      playTone("win");
    }

    setPreviousTurn(currentTurn);
    setPreviousWinner(state.winner || null);
  }, [state?.isYourTurn, state?.winner, state?.phase, soundOn]);

  const selectedCards = useMemo(() => {
    if (!state?.you?.hand) return [];
    return selected.map(id => state.you.hand.find(c => c.id === id)).filter(Boolean);
  }, [selected, state]);

  function saveSession(code, pid) {
    localStorage.setItem("barviclesName", name);
    localStorage.setItem("barviclesRoom", code);
    localStorage.setItem("barviclesPlayer", pid);
    setRoomCode(code);
    setPlayerId(pid);
  }

  function clearLocal() {
    localStorage.removeItem("barviclesName");
    localStorage.removeItem("barviclesRoom");
    localStorage.removeItem("barviclesPlayer");
    setRoomCode("");
    setPlayerId("");
    setState(null);
    setSelected([]);
    setError("");
  }

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    localStorage.setItem("barviclesSound", next ? "on" : "off");
    if (next) playTone("yourTurn");
  }

  function emit(action, payload) {
    setError("");
    socket.emit(action, payload, (res) => {
      if (!res?.ok) setError(res?.error || "Something went wrong");
      if (res?.roomCode && res?.playerId) saveSession(res.roomCode, res.playerId);
    });
  }

  function createRoom() {
    if (!name.trim()) {
      setError("Type your name first.");
      return;
    }
    emit("createRoom", { name });
  }

  function joinRoom() {
    if (!name.trim()) {
      setError("Type your name first.");
      return;
    }
    emit("joinRoom", { roomCode: roomInput, name });
  }

  function startGame() {
    emit("startGame", { roomCode });
  }

  function restartGame() {
    emit("restartGame", { roomCode });
    setSelected([]);
    setSaidBarvicles(false);
  }

  function toggleCard(cardId) {
    setSelected(prev => prev.includes(cardId) ? prev.filter(x => x !== cardId) : [...prev, cardId]);
  }

  function play() {
    emit("playCards", {
      roomCode,
      playerId,
      cardIds: selected,
      chosenSuit,
      saidBarvicles
    });
    setSelected([]);
    setSaidBarvicles(false);
  }

  function draw() {
    emit("drawCard", { roomCode, playerId });
  }

  function callBarvicles() {
    setSaidBarvicles(true);
    emit("callBarvicles", { roomCode, playerId });
  }

  const needsSuit = selectedCards.some(c => c.rank === "A");
  const selectedHasQueen = selectedCards.some(c => c.rank === "Q");
  const selectedThreeKings = selectedCards.length === 3 && selectedCards.every(c => c.rank === "K");
  const selectedHasJack = selectedCards.some(c => c.rank === "J");

  return (
    <div className="app">
      <h1>Barvicles</h1>

      {!roomCode && (
        <div className="panel">
          <h2>Start</h2>
          <div className="row">
            <input placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />
            <button className="primary" onClick={createRoom}>Create room</button>
          </div>
          <hr />
          <div className="row">
            <input placeholder="Room code" value={roomInput} onChange={e => setRoomInput(e.target.value.toUpperCase())} />
            <button className="primary" onClick={joinRoom}>Join room</button>
          </div>
          <p className="hint">Server: {SERVER_URL}</p>
          <button className="secondary" onClick={toggleSound}>{soundOn ? "Sound on" : "Sound off"}</button>
        </div>
      )}

      {roomCode && (
        <div className="panel row">
          <span className="badge">Room: <b>{roomCode}</b></span>
          <span className="badge">Server: {SERVER_URL}</span>
          {state?.phase === "lobby" && <button className="primary" onClick={startGame}>Start game</button>}
          {state?.phase === "finished" && <button className="primary" onClick={restartGame}>Restart game</button>}
          {state?.phase === "playing" && <button className="secondary" onClick={restartGame}>Restart game</button>}
          <button className="danger" onClick={clearLocal}>Reset browser</button>
          <button className="secondary" onClick={toggleSound}>{soundOn ? "Sound on" : "Sound off"}</button>
        </div>
      )}

      {error && <div className="panel error">{error}</div>}

      {state && (
        <>
          <div className="panel">
            <h2>Score</h2>
            <div className="scoreboard">
              {state.scores?.map(s => (
                <div className="score" key={s.name}>{s.name}: {s.score}</div>
              ))}
            </div>
          </div>

          <div className="panel table">
            <div>
              <h2>{state.opponent?.name || "Waiting for opponent"}</h2>
              <p>Cards: <b>{state.opponent?.cardCount ?? 0}</b></p>
              <p>{state.opponent?.connected === false ? "Disconnected" : "Connected"}</p>
            </div>

            <div className="center">
              <p className="notice">{state.winner ? `${state.winner} wins` : state.isYourTurn ? "Your turn" : "Their turn"}</p>
              <p>Top card</p>
              <PlayingCard card={state.topCard} />
              <p>Current suit: <b>{state.currentSuit}</b></p>
              {state.pendingDraw > 0 && <p className="danger badge">Pending pickup: {state.pendingDraw}</p>}
              {(state.topCard?.rank === "6" || state.topCard?.rank === "9") && (
                <p className="badge">6/9 CHAOS: fastest alternate card wins</p>
              )}
              <p>Pickup pile: {state.pickupPileCount}</p>
            </div>

            <div>
              <h2>{state.you.name}</h2>
              <p>Your cards: <b>{state.you.cardCount}</b></p>
              <p>Barvicles called: <b>{state.you.saidBarvicles || saidBarvicles ? "yes" : "no"}</b></p>
            </div>
          </div>

          <div className="panel">
            <h2>Your hand</h2>
            <div className="hand">
              {state.you.hand.map(card => (
                <PlayingCard
                  key={card.id}
                  card={card}
                  selected={selected.includes(card.id)}
                  onClick={() => toggleCard(card.id)}
                />
              ))}
            </div>

            <div className="row">
              {needsSuit && (
                <>
                  <label>Choose suit</label>
                  <select value={chosenSuit} onChange={e => setChosenSuit(e.target.value)}>
                    <option>♠</option>
                    <option>♥</option>
                    <option>♦</option>
                    <option>♣</option>
                  </select>
                </>
              )}
              <button className="primary" disabled={!selected.length} onClick={play}>
                Play selected
              </button>
              <button disabled={!state.isYourTurn} onClick={draw}>Pick up</button>
              <button className="danger" onClick={callBarvicles}>Call Barvicles</button>
            </div>

            {selectedHasQueen && <p className="hint">Queen: select Queen + up to 3 extra cards. Click order does not matter.</p>}
            {selectedThreeKings && <p className="hint">3 Kings selected: instant win.</p>}
            {selectedHasJack && <p className="hint">Warning: Jack always swaps hands. If it is your last card, opponent wins.</p>}
          </div>

          <div className="panel log">
            <h3>Game log</h3>
            {state.log.map((line, i) => <div key={i}>{line}</div>)}
          </div>
        </>
      )}

      {roomCode && !state && (
        <div className="panel">
          <p>Saved room found, but no game state loaded. Press Reset browser.</p>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
