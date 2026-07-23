# CodeAlpha Task 3 — Collaborative Project Management Tool

A full-stack Trello/Asana-style project management web app built with
**Express.js + Socket.io** (Node.js) on the backend and plain **HTML, CSS,
and JavaScript** on the frontend — no frontend framework required, as
permitted by the task brief.

## Features

- 👤 **Auth system** — secure registration/login with bcrypt password hashing + JWT
- 📁 **Group projects** — create project boards, invite teammates by username
- 🗂️ **Task cards** — Kanban board with drag-and-drop between To Do / In Progress / Done
- 🏷️ **Assign tasks** — assignee, priority (low/medium/high), due date, image attachments
- 💬 **Comment & communicate** — real-time comments on every task, with a live typing indicator
- 🔔 **Real-time notifications** — instant in-app + toast notifications when you're assigned a task,
  someone comments, or you're added to a project — powered by **WebSockets (Socket.io)**
- 🔍 **Search, filter & sort** — filter tasks by priority/assignee, search by keyword,
  sort by due date/priority/newest, plus a sortable table "List view" alternative to the board
- 🌗 **Dark / light mode**, animated auth page, fully responsive layout
- 💾 **Database** — persistent JSON-file data store for users, projects, tasks, comments, and notifications
  (zero external setup required; swap in MongoDB/PostgreSQL later by editing `db.js` only)

## Tech Stack

| Layer      | Technology                                        |
|------------|-----------------------------------------------------|
| Frontend   | HTML5, CSS3, Vanilla JavaScript (fetch API + Socket.io client) |
| Backend    | Node.js, Express.js, Socket.io                       |
| Auth       | JSON Web Tokens (JWT) + bcryptjs password hashing (shared over HTTP and WebSocket handshake) |
| Database   | File-based JSON store (`data/db.json`, auto-created) |

## Project Structure

```
pm-tool/
├── server.js                # Express app + HTTP server + Socket.io setup
├── db.js                     # File-based database layer (read/write)
├── sockets.js                 # Socket.io instance + emit-to-room helpers
├── notify.js                   # Creates + pushes real-time notifications
├── middleware/
│   └── auth.js                 # JWT verification middleware (HTTP + sockets)
├── routes/
│   ├── auth.js                  # /api/auth/register, /login, /search-users
│   ├── projects.js               # /api/projects (create, invite members, delete)
│   ├── tasks.js                    # /api/tasks (create, update, reorder, delete)
│   ├── comments.js                  # /api/comments (list, create, delete)
│   └── notifications.js              # /api/notifications (list, mark read)
├── data/db.json                # Auto-created on first run (your local "database")
├── package.json
└── public/
    ├── index.html               # Login / register page
    ├── dashboard.html             # Projects list — stats, search/sort, grid/table views
    ├── board.html                  # Kanban board — tasks, comments, invites, notifications
    ├── css/
    │   ├── style.css               # Shared styles, variables, modals, tables, dark mode
    │   ├── auth.css                 # Animated login/register background
    │   ├── dashboard.css              # Hero banner, project cards, stats
    │   └── board.css                   # Kanban columns, drag & drop, task detail modal
    └── js/
        ├── utils.js                 # Shared fetch wrapper, auth state, toasts, socket helper
        ├── auth.js                    # Login/register logic
        ├── dashboard.js                # Dashboard page logic
        └── board.js                     # Kanban board, drag-drop, comments, real-time logic
```

## How to Run

1. Install dependencies:
   ```bash
   cd pm-tool
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. Open your browser at **http://localhost:3000**

That's it — the Express server serves both the REST API (`/api/...`), the
WebSocket connection, and the static frontend files, so you only need to run
one process.

> The first time you run it, `data/db.json` is created automatically and
> starts empty. Register two accounts (e.g. in two browser tabs) to try out
> project invites, task assignment, and real-time comments/notifications.
> Delete that file any time to reset the app.

## API Reference

| Method | Endpoint                              | Auth required | Description                              |
|--------|-----------------------------------------|:--------------:|--------------------------------------------|
| POST   | `/api/auth/register`                    | No             | Create a new account                        |
| POST   | `/api/auth/login`                       | No             | Log in, receive a JWT                       |
| GET    | `/api/auth/search-users?q=`             | No             | Search users by name/username (for invites) |
| GET    | `/api/projects`                          | Yes            | List projects you own or are a member of    |
| POST   | `/api/projects`                          | Yes            | Create a project `{ name, description, color }` |
| GET    | `/api/projects/:id`                      | Yes            | Get a single project (with members)         |
| PUT    | `/api/projects/:id`                      | Yes            | Update project (owner only)                 |
| DELETE | `/api/projects/:id`                      | Yes            | Delete project (owner only)                 |
| POST   | `/api/projects/:id/members`              | Yes            | Invite a member by username                 |
| DELETE | `/api/projects/:id/members/:userId`      | Yes            | Remove a member / leave a project           |
| GET    | `/api/tasks?projectId=`                  | Yes            | List tasks (`?search=`, `?status=`, `?priority=`, `?assignee=`, `?sort=`) |
| POST   | `/api/tasks`                             | Yes            | Create a task `{ projectId, title, ... }`   |
| PUT    | `/api/tasks/:id`                         | Yes            | Update a task's fields                      |
| POST   | `/api/tasks/reorder`                     | Yes            | Bulk update status/order (drag-and-drop)    |
| DELETE | `/api/tasks/:id`                         | Yes            | Delete a task                               |
| GET    | `/api/comments/task/:taskId`             | Yes            | List comments on a task                     |
| POST   | `/api/comments/task/:taskId`             | Yes            | Add a comment `{ content }`                 |
| DELETE | `/api/comments/:id`                      | Yes            | Delete own comment                          |
| GET    | `/api/notifications`                     | Yes            | Get recent notifications + unread count     |
| POST   | `/api/notifications/:id/read`            | Yes            | Mark one notification as read               |
| POST   | `/api/notifications/read-all`            | Yes            | Mark all notifications as read              |

All authenticated requests must include:
```
Authorization: Bearer <token>
```

## WebSocket Events (Socket.io)

The client connects with `io({ auth: { token } })` and automatically joins a
personal `user:<id>` room plus any `project:<id>` room it's viewing.

| Event               | Direction        | Payload                          | Purpose                              |
|---------------------|------------------|-----------------------------------|----------------------------------------|
| `join:project`       | Client → Server  | `projectId`                       | Subscribe to live board updates        |
| `task:created`       | Server → Client  | task object                        | New task added to the board            |
| `task:updated`       | Server → Client  | task object                        | Task fields/status changed             |
| `task:deleted`       | Server → Client  | `{ id }`                            | Task removed                           |
| `tasks:reordered`    | Server → Client  | task array                          | Drag-and-drop reorder across columns   |
| `comment:created`    | Server → Client  | `{ taskId, comment }`               | New comment posted live                |
| `typing`             | Both directions  | `{ projectId, taskId, name }`       | Typing indicator while commenting      |
| `notification:new`   | Server → Client  | notification object                 | Real-time notification + toast + bell shake |

## Notes for Extending This Project

- **Swap the database:** Replace the functions in `db.js` with real
  MongoDB (Mongoose) or PostgreSQL (Sequelize/Prisma) queries — no other file
  needs to change since every route only calls `load()` / `save()`.
- **Environment variables:** Set `JWT_SECRET` and `PORT` in a `.env` file for
  production (currently uses sane development defaults).
- **Custom columns:** The board currently uses fixed To Do / In Progress /
  Done columns; extend `VALID_STATUSES` in `routes/tasks.js` and the
  `COLUMNS` array in `public/js/board.js` to support custom columns per project.
- **Scaling WebSockets:** For multiple server instances, add the
  `@socket.io/redis-adapter` so rooms are shared across processes.
- **Deployment:** Works as-is on Render, Railway, Heroku, or a VPS — just run
  `npm install && npm start` with `PORT` set by the platform (make sure the
  platform supports WebSocket connections, not just HTTP).

---
Built for the **CodeAlpha Web Development Internship — Task 3**.
