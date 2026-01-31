import { Server, Socket } from "socket.io";
import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import { randomBytes } from "crypto";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: "*",
  }),
);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // Allow all for dev
    methods: ["GET", "POST"],
  },
});

const socketToUser = new Map<string, string>();
const socketToMediaState = new Map<
  string,
  { video: boolean; audio: boolean }
>();
const waitingRooms = new Set<string>();

io.on("connection", (socket: Socket) => {
  console.log(`User connected: ${socket.id}`);

  io.emit("users:change", {
    total: io.engine.clientsCount,
  });

  socketToUser.set(socket.id, "Anonymous");
  // Initialize with false/false
  socketToMediaState.set(socket.id, { video: false, audio: false });

  socket.on(
    "room:join",
    ({
      roomId,
      user,
      mediaState,
      ignoreRooms,
    }: {
      roomId: string | null;
      ignoreRooms: string[];
      user: string;
      mediaState: { video: boolean; audio: boolean };
    }) => {
      // check if the room id is null (means user click on `next` button or click on `join` without entering room id
      let finalRoomId = roomId;
      console.log("waitingRooms", waitingRooms);
      if (!finalRoomId) {
        // a first peer in the queue waiting for some other random peer

        let waitingRoomId: string | undefined = undefined;
        if (ignoreRooms.length) {
          waitingRoomId = Array.from(waitingRooms).filter(
            (roomId) => !ignoreRooms.includes(roomId),
          )[0];
          // remove that room from set
          waitingRooms.delete(waitingRooms.values().next().value!);

          // remove room from waitingRooms if the room is empty

          let lastRoom = ignoreRooms[ignoreRooms.length - 1];
          if (!io.sockets.adapter.rooms.get(lastRoom)?.size) {
            console.log("pine remob");
            waitingRooms.delete(lastRoom);
          }
        } else {
          waitingRoomId = waitingRooms.values().next().value;
          waitingRooms.delete(waitingRooms.values().next().value!);
        }
        if (waitingRoomId) {
          // FIFO queue
          finalRoomId = waitingRoomId;
        } else {
          // give user some room with random room id, and add them in waiting list to join some user into their room
          finalRoomId = randomBytes(15).toString("hex");
          waitingRooms.add(finalRoomId);
        }
      }

      // check if in room 2 peers already their, if yes -> then emit - server:err
      if (io.sockets.adapter.rooms.get(finalRoomId)?.size === 2) {
        socket.emit("server:err", {
          message: "This Room is Already FULL!",
        });
        return;
      }

      let existingUser: string | undefined = Array.from(
        io.sockets.adapter.rooms.get(finalRoomId) || [],
      ).pop();

      let existingUserName: string | undefined = socketToUser.get(
        existingUser || "",
      );

      let existingUserMediaState:
        | { video: boolean; audio: boolean }
        | undefined = undefined;
      if (existingUser) {
        existingUserMediaState = socketToMediaState.get(existingUser);
      }

      socketToUser.set(socket.id, user);

      // Update the joiner's state immediately
      if (mediaState) {
        socketToMediaState.set(socket.id, mediaState);
      }

      socket.join(finalRoomId);
      console.log("end----", waitingRooms);

      console.log(`${user} joined room: ${finalRoomId}`);
      // Send existing user details + THEIR media state to the joiner
      //* we sending roomId null, if frontend send room id null othwerwise `finalRoomId`, so user can set his room id given from server to their frontend
      socket.emit("room:join", {
        roomId: roomId ? null : finalRoomId,
        user,
        existingUser,
        existingUserName,
        existingUserMediaState,
      });

      // Notify the room (existing user) about the new guy + send NEW GUY'S media state
      socket.to(finalRoomId).emit("user:joined", {
        user,
        id: socket.id,
        roomId: finalRoomId,
        mediaState: mediaState || { video: false, audio: false },
      });
    },
  );

  socket.on("room:leave", ({ randomMatch, roomId }) => {
    if (io.sockets.adapter.rooms.get(roomId)?.size == 1) {
      console.log("removed from waitingRooms");
      waitingRooms.delete(roomId);
    } else {
      if (randomMatch) {
        waitingRooms.add(roomId);
      }
    }

    socket.leave(roomId);
    io.to(roomId).emit("user:leave", {});
    console.log(`${socket.id} left ${roomId}`);
  });

  socket.on("user:call", ({ to, offer }) => {
    io.to(to).emit("incomming:call", { from: socket.id, offer });
  });

  socket.on("call:accepted", ({ to, ans }) => {
    io.to(to).emit("call:accepted", { from: socket.id, ans });
  });

  socket.on("peer:nego:needed", ({ to, offer }) => {
    io.to(to).emit("peer:nego:needed", { from: socket.id, offer });
  });

  socket.on("peer:nego:done", ({ to, ans }) => {
    io.to(to).emit("peer:nego:final", { from: socket.id, ans });
  });

  socket.on("ice:candidate", ({ to, candidate }) => {
    io.to(to).emit("ice:candidate", { candidate });
  });

  // 🔥 FIXED: Always update server state, even if 'to' is null (User is alone)
  socket.on("media:state", ({ to, mediaState }) => {
    socketToMediaState.set(socket.id, mediaState);

    // Only forward to remote peer if they exist
    if (to) {
      io.to(to).emit("media:state", { from: socket.id, mediaState });
    }
  });

  socket.on("disconnecting", () => {
    io.emit("users:change", {
      total: io.engine.clientsCount,
    });

    // cleanup
    socketToUser.delete(socket.id);

    const rooms = Array.from(socket.rooms);
    rooms.forEach((room) => {
      if (room !== socket.id) {
        socket.to(room).emit("user:leave", {});
        // if this user only in the room, remove from waitingRooms
        if (io.sockets.adapter.rooms.get(room)?.size == 1) {
          console.log("removed from waitingRooms");
          waitingRooms.delete(room);
        }
      }
    });
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected red and angle: ${socket.id}`);
    socketToUser.delete(socket.id);
    socketToMediaState.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
