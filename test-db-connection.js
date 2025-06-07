const postgres = require('postgres');

const url = process.env.POSTGRES_URL;
if (\!url) {
  console.error('POSTGRES_URL not set');
  process.exit(1);
}

console.log('Testing database connection...');

const sql = postgres(url);

sql`SELECT 1 as test`
  .then(result => {
    console.log('Connection successful:', result);
    sql.end();
  })
  .catch(err => {
    console.error('Connection failed:', err.message);
    sql.end();
  });
