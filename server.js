const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Serve static files from the current directory
app.use(express.static(path.join(__dirname, '')));

// Initialize SQLite Database
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        // Create table for inquiries if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS inquiries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pen_name TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT '未読'
        )`);
    }
});

// API endpoint to submit a new inquiry
app.post('/api/inquiries', (req, res) => {
    const { pen_name, message } = req.body;
    if (!pen_name || !message) {
        return res.status(400).json({ error: 'ペンネームとメッセージは必須です。' });
    }

    const query = `INSERT INTO inquiries (pen_name, message) VALUES (?, ?)`;
    db.run(query, [pen_name, message], function(err) {
        if (err) {
            console.error(err.message);
            return res.status(500).json({ error: 'データ保存に失敗しました。' });
        }
        res.status(201).json({ success: true, id: this.lastID });
    });
});

// API endpoint to fetch all inquiries (latest first)
app.get('/api/inquiries', (req, res) => {
    db.all(`SELECT * FROM inquiries ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) {
            console.error(err.message);
            return res.status(500).json({ error: 'データ取得に失敗しました。' });
        }
        res.json({ inquiries: rows });
    });
});

// API endpoint to update the status of an inquiry
app.patch('/api/inquiries/:id/status', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) {
        return res.status(400).json({ error: 'ステータスを指定してください。' });
    }

    db.run(`UPDATE inquiries SET status = ? WHERE id = ?`, [status, id], function(err) {
        if (err) {
            console.error(err.message);
            return res.status(500).json({ error: 'ステータス更新に失敗しました。' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'お便りが見つかりません。' });
        }
        res.json({ success: true, message: 'ステータスが更新されました。' });
    });
});

// API endpoint to export inquiries as CSV
app.get('/api/inquiries/export', (req, res) => {
    db.all(`SELECT * FROM inquiries ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) {
             console.error(err.message);
             return res.status(500).send('データ取得に失敗しました。');
        }
        
        // Excelでも文字化けしないように BOM を付与
        let csv = '\uFEFF';
        csv += 'ID,ペンネーム,メッセージ,ステータス,送信日時\n';
        rows.forEach(row => {
            const id = row.id;
            const penName = row.pen_name ? row.pen_name.replace(/"/g, '""') : '';
            const message = row.message ? row.message.replace(/"/g, '""') : '';
            const status = row.status || '';
            const createdAt = row.created_at || '';
            csv += `"${id}","${penName}","${message}","${status}","${createdAt}"\n`;
        });
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
        res.setHeader('Content-Disposition', `attachment; filename="mamachanz_inquiries_${dateStr}.csv"`);
        res.send(csv);
    });
});

// API endpoint to reset (delete all) inquiries
app.delete('/api/inquiries/reset', (req, res) => {
    db.run(`DELETE FROM inquiries`, [], function(err) {
        if (err) {
            console.error(err.message);
            return res.status(500).json({ error: 'データリセットに失敗しました。' });
        }
        // IDも初期化する
        db.run(`DELETE FROM sqlite_sequence WHERE name = 'inquiries'`, [], (err2) => {
             res.json({ success: true, message: 'すべてのデータを削除しました。' });
        });
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
