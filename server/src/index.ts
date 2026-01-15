import { Server, Socket } from "socket.io";
import express from "express";
import http from "http";
import cors from "cors";

import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors({ origin: "*" }));
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

const presentUsers = new Map<string, string>();

io.on("connection", (socket: Socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on(
    "room:join",
    ({ roomId, user }: { roomId: string; user: string }) => {
      socket.join(roomId);
      console.log(`${user} joined room: ${roomId}`);

      // this to tell new user that he joined successfully - we can also do io.to(socket.id).emit = does same thing
      socket.emit("room:join", { roomId, user });
      // this one to tell existing users that new user joined
      io.to(roomId).emit("user:joined", { user, id: socket.id, roomId });
    }
  );

  socket.on("room:leave", (roomId) => {
    socket.leave(roomId);
    console.log(`${socket.id} left ${roomId}`);
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
  });

  // ------------ logic of some user joining room of someone who created it  --------------------------------

  // this message will go in room if second user joined the room
  socket.on("user:call", ({ to, offer }) => {
    io.to(to).emit("incomming:call", { from: socket.id, offer });
  });
});

console.log(
  `Socket.IO server running on port http://localhost:${process.env.PORT}`
);

const PORT = process.env.PORT || 3000;

io.engine.on("connection_error", (err) => {
  console.log("ENGINE ERROR");
  console.log(err.code);
  console.log(err.message);
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
