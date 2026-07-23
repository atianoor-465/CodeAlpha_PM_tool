// notify.js - Helper to create a notification record and push it live via socket.
const { emitToUser } = require('./sockets');

function pushNotification(db, { userId, type, message, link }) {
  const notif = {
    id: db.nextIds.notifications++,
    userId,
    type,
    message,
    link: link || null,
    read: false,
    createdAt: new Date().toISOString()
  };
  db.notifications.unshift(notif);
  emitToUser(userId, 'notification:new', notif);
  return notif;
}

module.exports = { pushNotification };
