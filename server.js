// 零依赖留言板后端服务
// 同时托管静态网页 + 提供 /api/board 留言接口
// 数据存储在 board.json 文件中
const http = require('http');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'board.json');
const HTML_FILE = path.join(__dirname, 'mental-health.html');

// 初始化数据文件
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');

function readBoard() {
    try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8') || '[]'); }
    catch { return []; }
}
function writeBoard(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// MIME 类型
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// 敏感词过滤（面向青少年保护）
const badWords = ['自杀','去死','杀','自残','跳楼','吃药死'];
function filterText(t) {
    let r = t || '';
    badWords.forEach(w => { r = r.split(w).join('***'); });
    return r;
}

function sendJson(res, status, data) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(data));
}

function parseBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', c => { body += c; if (body.length > 1e5) req.destroy(); });
        req.on('end', () => {
            try { resolve(JSON.parse(body || '{}')); }
            catch { resolve({}); }
        });
    });
}

const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') { sendJson(res, 200, {}); return; }

    const url = new URL(req.url, `http://localhost`);
    const pathname = url.pathname;

    // ===== API 路由 =====
    if (pathname === '/api/board') {
        if (req.method === 'GET') {
            const all = readBoard();
            const sorted = all.sort((a, b) => b.created_at - a.created_at).slice(0, 50);
            sendJson(res, 200, sorted);
            return;
        }
        if (req.method === 'POST') {
            const body = await parseBody(req);
            const content = filterText((body.content || '').trim()).slice(0, 300);
            if (!content) { sendJson(res, 400, { error: 'empty' }); return; }
            const nick = filterText((body.nick || '').trim()).slice(0, 12) || '匿名小伙伴';
            const emoji = (body.emoji || '🌿').slice(0, 4);
            const all = readBoard();
            const item = {
                id: 'msg_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                nick, emoji, content, hugs: 0, created_at: Date.now()
            };
            all.push(item);
            if (all.length > 500) all.splice(0, all.length - 500);
            writeBoard(all);
            sendJson(res, 200, { ok: true, item });
            return;
        }
    }

    if (pathname === '/api/board/hug' && req.method === 'POST') {
        const body = await parseBody(req);
        const id = body.id;
        const all = readBoard();
        const item = all.find(x => x.id === id);
        if (item) { item.hugs = (item.hugs || 0) + 1; writeBoard(all); sendJson(res, 200, { ok: true, hugs: item.hugs }); }
        else sendJson(res, 404, { error: 'not found' });
        return;
    }

    // ===== 静态文件托管 =====
    let filePath = pathname === '/' ? HTML_FILE : path.join(__dirname, pathname);
    if (!filePath.startsWith(__dirname)) { res.writeHead(403); res.end('Forbidden'); return; }

    const ext = path.extname(filePath);
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>404 Not Found</h1>');
            return;
        }
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
    });
});

// 自动寻找可用端口（从 3000 开始，被占用则 +1）
function listen(port) {
    server.once('error', (e) => {
        if (e.code === 'EADDRINUSE') { listen(port + 1); }
        else { throw e; }
    });
    server.listen(port, '0.0.0.0', () => {
        console.log(`✨ 心绪服务已启动:`);
        console.log(`   网页: http://localhost:${port}/mental-health.html`);
        console.log(`   API:  http://localhost:${port}/api/board`);
        console.log(`   数据: ${DATA_FILE}`);
    });
}
listen(3000);
