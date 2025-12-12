const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function migrate() {
    // Standard Supabase Local connection
    const connectionString = 'postgresql://postgres:postgres@localhost:54322/postgres';
    
    const client = new Client({
        connectionString,
    });

    try {
        await client.connect();
        console.log('Connected to database.');

        const files = [
            'supabase/migrations/20241208000003_add_grading_prompt.sql',
            'supabase/migrations/20241208000004_add_course_templates.sql',
            'supabase/migrations/20241212000000_add_executed_prompt.sql',
            'supabase/migrations/20241212000001_add_email_log.sql',
            'supabase/migrations/20241213000000_add_session_date.sql'
        ];

        for (const file of files) {
            const filePath = path.resolve(process.cwd(), file);
            console.log(`Applying: ${file}`);
            try {
                const sql = fs.readFileSync(filePath, 'utf8');
                // Simple split by ; isn't robust for procedures, but fine for simple DDL usually. 
                // However, pg client.query can take the whole string if it's multiple statements? 
                // pg-node usually supports multiple statements in one query call.
                await client.query(sql);
                console.log(`Success: ${file}`);
            } catch (e) {
                console.error(`Error applying ${file}:`, e.message);
                if (e.message.includes('already exists')) {
                    console.log('Ignoring "already exists" error.');
                }
            }
        }
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

migrate();
