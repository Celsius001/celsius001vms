const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_SESSIONS = 2;
const SESSION_DURATION_MS = 25 * 60 * 1000;

app.use(cors());
app.use(express.json());

let activeSessions = new Map();

function cleanupSessions() {
    const now = Date.now();
    for (const [id, session] of activeSessions.entries()) {
        if (now >= session.expiresAt) {
            activeSessions.delete(id);
        }
    }
}

app.get('/api/capacity', (req, res) => {
    cleanupSessions();
    res.json({ activeCount: activeSessions.size, maxCapacity: MAX_SESSIONS });
});

app.post('/api/launch', (req, res) => {
    cleanupSessions();

    if (activeSessions.size >= MAX_SESSIONS) {
        return res.status(429).json({ error: "Rate limit reached. Maximum 2 active sessions allowed." });
    }

    const sessionId = Math.random().toString(36).substring(2, 15);
    const expiresAt = Date.now() + SESSION_DURATION_MS;

    activeSessions.set(sessionId, {
        sessionId,
        createdAt: Date.now(),
        expiresAt
    });

    setTimeout(() => {
        if (activeSessions.has(sessionId)) {
            activeSessions.delete(sessionId);
        }
    }, SESSION_DURATION_MS);

    res.json({ success: true, sessionId, expiresIn: SESSION_DURATION_MS });
});

app.post('/api/terminate', (req, res) => {
    cleanupSessions();
    const { sessionId } = req.body;
    if (sessionId && activeSessions.has(sessionId)) {
        activeSessions.delete(sessionId);
    } else if (activeSessions.size > 0) {
        const firstKey = activeSessions.keys().next().value;
        if (firstKey) activeSessions.delete(firstKey);
    }
    res.json({ success: true, activeCount: activeSessions.size });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
