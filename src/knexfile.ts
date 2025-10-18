import dotenv from 'dotenv';
dotenv.config();

const config = {
  development: {
    client: 'pg' as const,
    connection: {
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: 'password',
      database: 'scedfinder'
    },
    migrations: {
      tableName: 'knex_migrations'
    }
  },

  production: {
    client: 'pg' as const,
    connection: {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    },
    migrations: {
      tableName: 'knex_migrations'
    }
  }
};

export default config;