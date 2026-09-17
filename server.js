const express = require('express');
const cors = require('cors');
const { firefox } = require('playwright');

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_SESSIONS = 2;
const SESSION_DURATION_MS = 25 * 60 * 1000;

app.use(cors());
app.use(express.json());

let activeSessions = new Map();

async function closeSession(sessionId) {
    const session = activeSessions.get(sessionId);
    if (!session) return;

    activeSessions.delete(sessionId);
    await session.browser.close().catch(() => {});
}

function cleanupSessions() {
    const now = Date.now();
    for (const [id, session] of activeSessions.entries()) {
        if (now >= session.expiresAt) {
            void closeSession(id);
        }
    }
}

app.get('/api/capacity', (req, res) => {
    cleanupSessions();
    res.json({ activeCount: activeSessions.size, maxCapacity: MAX_SESSIONS });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
    res.json({
        service: 'Celsius Firefox sessions',
        status: 'ok',
        endpoints: ['/health', '/api/capacity', '/api/launch', '/api/terminate']
    });
});

app.post('/api/launch', async (req, res) => {
    cleanupSessions();

    if (activeSessions.size >= MAX_SESSIONS) {
        return res.status(429).json({ error: "Rate limit reached. Maximum 2 active sessions allowed." });
    }

    let browser;
    try {
        browser = await firefox.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();
        if (req.body?.url) {
            await page.goto(req.body.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        }

        const sessionId = Math.random().toString(36).substring(2, 15);
        const expiresAt = Date.now() + SESSION_DURATION_MS;

        activeSessions.set(sessionId, { sessionId, browser, context, page, createdAt: Date.now(), expiresAt });
        setTimeout(() => void closeSession(sessionId), SESSION_DURATION_MS).unref();

        return res.json({
            success: true,
            sessionId,
            browser: 'firefox',
            url: page.url(),
            expiresIn: SESSION_DURATION_MS
        });
    } catch (error) {
        await browser?.close().catch(() => {});
        return res.status(500).json({ error: 'Unable to launch Firefox', details: error.message });
    }
});

app.post('/api/terminate', async (req, res) => {
    cleanupSessions();
    const { sessionId } = req.body;
    if (sessionId && activeSessions.has(sessionId)) {
        await closeSession(sessionId);
    } else if (activeSessions.size > 0) {
        const firstKey = activeSessions.keys().next().value;
        if (firstKey) await closeSession(firstKey);
    }
    res.json({ success: true, activeCount: activeSessions.size });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
