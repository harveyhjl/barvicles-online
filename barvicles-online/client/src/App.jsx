import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import "./style.css";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
const socket = io(SERVER_URL, { transports: ["websocket", "polling"] });

let sharedAudioContext = null;

function getAudioContext() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!sharedAudioContext) sharedAudioContext = new AudioContext();
  return sharedAudioContext;
}

async function unlockAudio() {
  // Browsers block audio until the user clicks/taps once.
  // This resumes the audio context and plays a tiny silent sound to unlock it.
  try {
    const ctx = getAudioContext();
    if (!ctx) return false;
    if (ctx.state === "suspended") await ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.03);
    return true;
  } catch {
    return false;
  }
}

async function playTone(type = "turn", rank = "") {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const now = ctx.currentTime;

    function blip(freq, offset, duration = 0.16, wave = "square", volume = 0.11) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(freq, now + offset);
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(volume, now + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + duration + 0.03);
    }

    const rankFreq = {
      A: 880, "2": 330, "3": 370, "4": 415, "5": 466,
      "6": 523, "7": 587, "8": 659, "9": 698, "10": 740,
      J: 784, Q: 831, K: 988
    };

    if (type === "yourTurn") {
      blip(740, 0, 0.16);
      blip(980, 0.12, 0.18);
    } else if (type === "theirTurn") {
      blip(360, 0, 0.16, "sawtooth", 0.08);
      blip(280, 0.12, 0.18, "sawtooth", 0.08);
    } else if (type === "card") {
      blip(rankFreq[rank] || 600, 0, 0.12, "square", 0.09);
      blip((rankFreq[rank] || 600) * 1.25, 0.08, 0.12, "triangle", 0.06);
    } else if (type === "draw") {
      blip(220, 0, 0.12, "sawtooth", 0.08);
      blip(180, 0.09, 0.14, "sawtooth", 0.08);
    } else if (type === "win") {
      blip(523, 0, 0.16);
      blip(659, 0.10, 0.16);
      blip(784, 0.20, 0.22);
    } else {
      blip(600, 0, 0.16);
      blip(800, 0.08, 0.18);
    }
  } catch {
    // Never break the game because of sound.
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


function getLeader(state) {
  if (!state?.scores || state.scores.length < 2) return null;
  const [greenPlayer, pinkPlayer] = state.scores;

  const greenSets = greenPlayer.sets ?? 0;
  const pinkSets = pinkPlayer.sets ?? 0;
  const greenRounds = greenPlayer.rounds ?? greenPlayer.score ?? 0;
  const pinkRounds = pinkPlayer.rounds ?? pinkPlayer.score ?? 0;

  if (greenSets === pinkSets && greenRounds === pinkRounds) return "draw";
  if (greenSets !== pinkSets) return greenSets > pinkSets ? "green" : "pink";
  return greenRounds > pinkRounds ? "green" : "pink";
}

function getBackgroundClass(state) {
  const leader = getLeader(state);
  if (leader === "green") return "winning-you";
  if (leader === "pink") return "winning-opponent";
  return "winning-draw";
}

const RULE_LABELS = [
  ["ace", "Ace suit change"],
  ["pickup2", "2 pickup"],
  ["steal3", "3 steal"],
  ["pickup4", "4 pickup"],
  ["fiveKing", "5 picks King"],
  ["sixNine", "6/9 chaos"],
  ["skip7", "7 skip"],
  ["give8", "8 give"],
  ["nope10", "10 nope"],
  ["jackSwap", "Jack swap"],
  ["queenDump", "Queen dump"],
  ["threeKings", "3 Kings win"],
  ["barviclesPenalty", "Barvicles penalty"]
];

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
  const [previousActionId, setPreviousActionId] = useState(null);
  const [audioReady, setAudioReady] = useState(false);
  const [chatText, setChatText] = useState("");

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

    const currentTurn = state.currentPlayerName || (state.isYourTurn ? "you" : "them");
    const actionId = state.lastAction ? `${state.lastAction.at}-${state.lastAction.playerId}-${state.lastAction.type}` : null;

    if (actionId && actionId !== previousActionId) {
      if (state.lastAction.type === "draw") {
        playTone("draw");
      } else {
        playTone("card", state.lastAction.rank);
      }
      setPreviousActionId(actionId);
    }

    if (previousTurn !== null && previousTurn !== currentTurn && state.phase === "playing") {
      playTone(state.isYourTurn ? "yourTurn" : "theirTurn");
    }

    if (state.winner && state.winner !== previousWinner) {
      playTone("win");
    }

    setPreviousTurn(currentTurn);
    setPreviousWinner(state.winner || null);
  }, [state?.currentPlayerName, state?.isYourTurn, state?.winner, state?.phase, state?.lastAction?.at, soundOn]);

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

  async function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    localStorage.setItem("barviclesSound", next ? "on" : "off");

    if (next) {
      const ok = await unlockAudio();
      setAudioReady(ok);
      await playTone("yourTurn");
    }
  }

  async function testSound() {
    const ok = await unlockAudio();
    setAudioReady(ok);
    await playTone("yourTurn");
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

  function addComputerPlayer() {
    emit("addComputerPlayer", { roomCode });
  }

  function startGame() {
    emit("startGame", { roomCode });
  }

  function restartGame() {
    emit("restartGame", { roomCode });
    setSelected([]);
    setSaidBarvicles(false);
  }

  function updateRule(ruleKey, enabled) {
    emit("updateRules", {
      roomCode,
      rules: {
        ...(state?.rules || {}),
        [ruleKey]: enabled
      }
    });
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

  function sendChatMessage(e) {
    e.preventDefault();
    const text = chatText.trim();
    if (!text) return;
    emit("sendChat", { roomCode, playerId, text });
    setChatText("");
  }

  const needsSuit = selectedCards.some(c => c.rank === "A");
  const selectedHasQueen = selectedCards.some(c => c.rank === "Q");
  const selectedThreeKings = selectedCards.length === 3 && selectedCards.every(c => c.rank === "K");
  const selectedHasJack = selectedCards.some(c => c.rank === "J");

  return (
    <div className={`app ${getBackgroundClass(state)}`}>
      {state?.phase === "finished" && state?.lastFinish?.setWon && (
        <div className="fireworks" aria-hidden="true">
          <div className="firework"></div>
          <div className="firework"></div>
          <div className="firework"></div>
          <div className="firework"></div>
        </div>
      )}
      {state?.phase === "finished" && state?.lastFinish?.threeKings && (
        <div className="king-show">👑👑👑 THREE KINGS 👑👑👑</div>
      )}
      <h1>Barvicles</h1>
      {state?.phase === "playing" && (
        <div className={`turn-banner ${state.isYourTurn ? "your-turn" : ""}`}>
          {state.isYourTurn ? "YOUR TURN" : `${state.currentPlayerName || "Someone"}'s turn`}
        </div>
      )}

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
          <button className="secondary" onClick={testSound}>Test sound</button>
          <span className="badge">Audio: {audioReady ? "ready" : "click Test sound"}</span>
        </div>
      )}

      {roomCode && (
        <div className="panel row">
          <span className="badge">Room: <b>{roomCode}</b></span>
          <span className="badge">Server: {SERVER_URL}</span>
          {state?.phase === "lobby" && (state?.playerCount ?? 1) < 4 && <button className="secondary" onClick={addComputerPlayer}>Add Computer</button>}
          {state?.phase === "lobby" && <button className="primary" onClick={startGame}>Start game</button>}
          {state?.phase === "lobby" && <span className="badge">Players: {state?.playerCount ?? 1}/4</span>}
          {state?.phase === "finished" && <button className="primary" onClick={restartGame}>New game</button>}
          {state?.phase === "playing" && <button className="secondary" onClick={restartGame}>New game</button>}
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
                <div className="score" key={s.name}>{s.name}: {s.sets ?? 0} sets, {s.rounds ?? s.score ?? 0}/5 rounds</div>
              ))}
            </div>
            <p className="hint">
              Up to 4 players. Turn order is clockwise by join order.
            </p>
          </div>

          <div className="panel rules-panel">
            <h2>Rule toggles</h2>
            <div className="rules-grid">
              {RULE_LABELS.map(([key, label]) => (
                <label className="rule-toggle" key={key}>
                  <input
                    type="checkbox"
                    checked={state.rules?.[key] !== false}
                    onChange={e => updateRule(key, e.target.checked)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <p className="hint">Use these if a rule glitches mid-game. Both players get the same settings.</p>
          </div>

          <div className="panel table multi-table">
            <div className="players-list">
              <h2>Other players</h2>
              {(state.opponents || []).length === 0 && <p>Waiting for players...</p>}
              {(state.opponents || []).map(p => (
                <div className={`player-chip ${p.isCurrentTurn ? "current" : ""}`} key={p.name}>
                  <b>{p.name} {p.isBot ? "🤖" : ""}</b>
                  <span>Cards: {p.cardCount}</span>
                  <span>{p.isBot ? "Computer" : p.connected === false ? "Disconnected" : "Connected"}</span>
                </div>
              ))}
            </div>

            <div className="center">
              <p className="notice">
                {state.winner ? `${state.winner} wins` : state.isYourTurn ? "YOUR TURN — play or pick up" : `${state.currentPlayerName || "Someone"}'s turn`}
              </p>
              <p>Top card</p>
              <PlayingCard card={state.topCard} />
              <p>Current suit: <b>{state.currentSuit}</b></p>
              {state.pendingDraw > 0 && <p className="danger badge">Pending pickup: {state.pendingDraw}</p>}
              {state.queenDump?.active && (
                <p className="badge">Queen dump: {state.queenDump.remaining} cards left</p>
              )}
              {state.sixNine?.active && (
                <p className="badge">6/9 OPEN TABLE: anyone can play {state.sixNine.nextRank}</p>
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

          <div className="panel chat-panel">
            <h3>Chat</h3>
            <div className="chat-box">
              {(state.chat || []).map(msg => (
                <div className="chat-message" key={msg.id}>
                  <b>{msg.name}:</b> {msg.text}
                </div>
              ))}
            </div>
            <form className="row" onSubmit={sendChatMessage}>
              <input
                maxLength="120"
                placeholder="Short message..."
                value={chatText}
                onChange={e => setChatText(e.target.value)}
              />
              <button className="secondary" type="submit">Send</button>
            </form>
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
