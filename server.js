// RV Frenzy multiplayer server (Node + ws). Designed to run on Render.
const http = require("http");
const url = require("url");
const { WebSocketServer } = require("ws");

const rooms = new Map(); // roomCode → Set<WebSocket>

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("OK");
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
server.listen(PORT, () => console.log("RV Frenzy multiplayer listening on port " + PORT));
