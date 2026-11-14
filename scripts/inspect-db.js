const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/sales_distribution.db');
console.log('Customer payments count:', db.prepare('SELECT count(*) as c FROM customer_payments').get());
console.log('Vendor payments count:', db.prepare('SELECT count(*) as c FROM vendor_payments').get());
console.log('Expenses count:', db.prepare('SELECT count(*) as c FROM expenses').get());
console.log('Journal entries count:', db.prepare('SELECT count(*) as c FROM journal_entries').get());
console.log('COA accounts list:', db.prepare('SELECT code, name, type FROM chart_of_accounts ORDER BY code').all());
