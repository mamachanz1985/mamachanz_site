const express = require('express');
const { sql } = require('@vercel/postgres');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// DB初期化チェックとテーブル作成用API
// ※Vercelデプロイ後、一度だけブラウザから /api/init にアクセスしてテーブルを作成します。
app.get('/api/init', async (req, res) => {
    try {
        await sql`CREATE TABLE IF NOT EXISTS inquiries (
            id SERIAL PRIMARY KEY,
            pen_name VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status VARCHAR(50) DEFAULT '未読'
        )`;
        res.json({ success: true, message: "データベースの初期化（テーブル作成）が完了しました。" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// お便り新規投稿
app.post('/api/inquiries', async (req, res) => {
    const { pen_name, message } = req.body;
    if (!pen_name || !message) {
        return res.status(400).json({ error: 'ペンネームとメッセージは必須です。' });
    }
    try {
        const result = await sql`INSERT INTO inquiries (pen_name, message) VALUES (${pen_name}, ${message}) RETURNING id`;
        res.status(201).json({ success: true, id: result.rows[0].id });
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: 'データ保存に失敗しました。' });
    }
});

// お便り一覧取得
app.get('/api/inquiries', async (req, res) => {
    try {
        const { rows } = await sql`SELECT * FROM inquiries ORDER BY created_at DESC`;
        res.json({ inquiries: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'データ取得に失敗しました。' });
    }
});

// お便りCSVエクスポート
app.get('/api/inquiries/export', async (req, res) => {
    try {
        const { rows } = await sql`SELECT * FROM inquiries ORDER BY created_at DESC`;
        
        let csv = '\uFEFF';
        csv += 'ID,ペンネーム,メッセージ,ステータス,送信日時\n';
        rows.forEach(row => {
            const id = row.id;
            const penName = row.pen_name ? row.pen_name.replace(/"/g, '""') : '';
            const message = row.message ? row.message.replace(/"/g, '""') : '';
            const status = row.status || '';
            const createdAt = row.created_at ? new Date(row.created_at).toLocaleString('ja-JP') : '';
            
            csv += `"${id}","${penName}","${message}","${status}","${createdAt}"\n`;
        });
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
        res.setHeader('Content-Disposition', `attachment; filename="mamachanz_inquiries_${dateStr}.csv"`);
        res.send(csv);
    } catch (err) {
         console.error(err);
         res.status(500).send('データエクスポートに失敗しました。');
    }
});

// ステータス更新
app.patch('/api/inquiries/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) {
        return res.status(400).json({ error: 'ステータスを指定してください。' });
    }
    try {
        const result = await sql`UPDATE inquiries SET status = ${status} WHERE id = ${id}`;
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'お便りが見つかりません。' });
        }
        res.json({ success: true, message: 'ステータスが更新されました。' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'ステータス更新に失敗しました。' });
    }
});

// 全件削除（リセット）
app.delete('/api/inquiries/reset', async (req, res) => {
    try {
        // TRUNCATEでデータ削除とIDの初期化を同時に行う
        await sql`TRUNCATE TABLE inquiries RESTART IDENTITY`;
        res.json({ success: true, message: 'すべてのデータを削除しました。' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'データリセットに失敗しました。' });
    }
});

// Vercel Serverless Functionのエントリーポイントとしてエクスポート
module.exports = app;
