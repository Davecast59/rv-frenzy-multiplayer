// RV Frenzy server: serves index.html (the game) AND hosts the multiplayer WebSocket.
const http = require("http");
const url = require("url");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const rooms = new Map(); // roomCode → Set<WebSocket>

// Load index.html once at startup (if present)
let cachedIndex = null;
try {
  cachedIndex = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  console.log("index.html loaded (" + cachedIndex.length + " bytes)");
} catch (e) {
  console.log("index.html not found — serving placeholder.");
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("OK");
  }
  if ((req.url === "/" || req.url === "/index.html") && cachedIndex) {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    });
    return res.end(cachedIndex);
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><html><head><title>RV Frenzy multiplayer</title>
<style>body{font-family:-apple-system,sans-serif;max-width:520px;margin:40px auto;color:#1f3a5f;}h1{color:#c8101e;}</style>
</head><body><h1>RV Frenzy &mdash; Multiplayer Server</h1>
<p>Running. &#x2705;</p>
<p>Active rooms: ${rooms.size}</p></body></html>`);
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const params = url.parse(req.url, true).query;
  const roomCode = String(params.room || "default").toLowerCase().slice(0, 32);
  let room = rooms.get(roomCode);
  if (!room) { room = new Set(); rooms.set(roomCode, room); }

  if (room.size >= 2) {
    try { ws.send(JSON.stringify({ type: "error", reason: "Room is full." })); } catch(e){}
    ws.close(1000, "Room full");
    return;
  }

  room.add(ws);
  ws.roomCode = roomCode;
  const role = room.size === 1 ? "rv" : "biker";

  try {
    ws.send(JSON.stringify({ type: "joined", role, count: room.size, roomId: roomCode }));
  } catch(e){}

  for (const other of room) {
    if (other !== ws && other.readyState === 1) {
      try { other.send(JSON.stringify({ type: "playerCount", count: room.size })); } catch(e){}
    }
  }

  ws.on("message", (data) => {
    const txt = data.toString();
    for (const other of room) {
      if (other !== ws && other.readyState === 1) {
        try { other.send(txt); } catch(e){}
      }
    }
  });

  ws.on("close", () => {
    room.delete(ws);
    if (room.size === 0) { rooms.delete(roomCode); return; }
    for (const other of room) {
      if (other.readyState === 1) {
        try { other.send(JSON.stringify({ type: "playerCount", count: room.size, message: "Other player left" })); } catch(e){}
      }
    }
  });

  ws.on("error", () => { try { ws.close(); } catch(e){} });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("RV Frenzy server listening on port " + PORT));
