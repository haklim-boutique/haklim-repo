const { Pool } = require('pg');

// Create a PostgreSQL connection pool
const pool = new Pool({

host: 'ep-dark-rice-a8jalgmi-pooler.eastus2.azure.neon.tech',
database:'neondb',
user: 'neondb_owner',
password: 'npg_ulcBIR24rDCK',

ssl: {
  rejectUnauthorized: false, // Option to allow self-signed certificates if necessary
},

  /*
  host: 'localhost',           // PostgreSQL host (usually localhost)
  user: 'postgres',            // PostgreSQL username (adjust as needed)
  password: 'yqY7xb#007@immah', // Your actual PostgreSQL password
  database: 'master_db',       // Your actual database name
  port: 5432,                  // Default PostgreSQL port
  max: 10,                     // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,  */  // Close idle clients after 30 seconds
});

// Log connection success or error
pool.on('connect', () => {
  console.log('Connected to the PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected error on the database client:', err);
  process.exit(1);  // Exit the application if the pool encounters an error
});

// Export the pool for use in other files
module.exports = pool;
  
