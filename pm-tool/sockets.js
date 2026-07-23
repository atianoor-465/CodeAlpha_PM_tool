// sockets.js - Central place to hold the Socket.io instance and emit helpers.
// Routes require this module to push real-time events without circular imports.

let ioInstance = null;

function setIo(io) {
  ioInstance = io;
}

function emitToProject(projectId, event, payload) {
  if (ioInstance) ioInstance.to(`project:${projectId}`).emit(event, payload);
}

function emitToUser(userId, event, payload) {
  if (ioInstance) ioInstance.to(`user:${userId}`).emit(event, payload);
}

module.exports = { setIo, emitToProject, emitToUser };
