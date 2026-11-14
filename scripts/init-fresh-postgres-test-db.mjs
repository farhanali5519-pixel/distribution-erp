import pg from 'pg';
import { POSTGRES_CREATE_TABLES_SQL } from '../src/core/database/postgres/schema.js';

const { Client } = pg;

async function init() {
  const rootClient = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5432/postgres' });
  await rootClient.connect();

  console.log('Terminating existing connections to saleflow_test_phase4b if any...');
  await rootClient.query(`
    SELECT pg_terminate_backend(pg_stat_activity.pid)
    FROM pg_stat_activity
    WHERE pg_stat_activity.datname = 'saleflow_test_phase4b'
      AND pid <> pg_backend_pid();
  `);

  console.log('Recreating database saleflow_test_phase4b...');
  await rootClient.query('DROP DATABASE IF EXISTS saleflow_test_phase4b');
  await rootClient.query('CREATE DATABASE saleflow_test_phase4b');
  await rootClient.end();

  console.log('Connecting to fresh saleflow_test_phase4b...');
  const testClient = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5432/saleflow_test_phase4b' });
  await testClient.connect();

  console.log('Executing POSTGRES_CREATE_TABLES_SQL...');
  await testClient.query(POSTGRES_CREATE_TABLES_SQL);

  const res = await testClient.query(`
    SELECT COUNT(*) as count 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  console.log(`Created ${res.rows[0].count} tables in saleflow_test_phase4b successfully!`);

  await testClient.end();
}

init().catch(err => {
  console.error('Failed to init PostgreSQL test DB:', err);
  process.exit(1);
});
