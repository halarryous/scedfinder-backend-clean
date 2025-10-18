"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const knex_1 = __importDefault(require("knex"));
const config = {
    client: 'pg',
    connection: process.env.DATABASE_URL || {
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: 'password',
        database: 'scedfinder'
    },
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};
const db = (0, knex_1.default)(config);
exports.default = db;
