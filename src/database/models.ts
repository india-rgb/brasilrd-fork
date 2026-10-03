// Import estático OBRIGATÓRIO do driver: o Sequelize carrega o dialect 'pg'
// dinamicamente em runtime (_loadDialectModule) e o file-tracer da Vercel não
// inclui o pacote no lambda sem esta referência direta.
import pg from 'pg';
void pg;

import { Sequelize, DataTypes, Model } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const RAW_DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_PUBLIC_URL;

// pg permite que `sslmode` na connection string sobrescreva o objeto SSL
// passado pelo Sequelize. Supabase exige TLS, mas o pooler pode apresentar
// cadeia própria; remove sslmode e controla SSL exclusivamente abaixo.
let DATABASE_URL = RAW_DATABASE_URL;
try {
  if (RAW_DATABASE_URL) {
    const parsedUrl = new URL(RAW_DATABASE_URL);
    parsedUrl.searchParams.delete('sslmode');
    parsedUrl.searchParams.delete('sslcert');
    parsedUrl.searchParams.delete('sslkey');
    parsedUrl.searchParams.delete('sslrootcert');
    DATABASE_URL = parsedUrl.toString();
  }
} catch {
  // Mantém URL original; Sequelize exibirá o erro de conexão se inválida.
}

if (!DATABASE_URL && process.env.NODE_ENV === 'production') {
  throw new Error('URL do banco de dados nao configurada para producao');
}

if (process.env.NODE_ENV !== 'production') {
  console.log('Database URL detectada:', DATABASE_URL ? 'Configurada' : 'Nao configurada');
  if (DATABASE_URL) {
    console.log('Database URL (mascarada):', DATABASE_URL.replace(/:[^:@]+@/, ':****@'));
  }
}

const isRailway = DATABASE_URL?.includes('railway.app') || DATABASE_URL?.includes('railway.internal');
const isRailwayExternal = DATABASE_URL?.includes('railway.app') && !DATABASE_URL?.includes('railway.internal');
const sslEnabled =
  process.env.DB_SSL?.toLowerCase() === 'true' ||
  /[?&]sslmode=require(?:&|$)/i.test(RAW_DATABASE_URL || '') ||
  isRailwayExternal;

const sequelizeConfig: any = {
  logging: false,
  dialect: 'postgres',
  pool: { 
    max: 5,
    min: 1,
    acquire: 30000,
    idle: 10000,
    evict: 10000
  },
  retry: { max: 3, timeout: 10000 }
};

if (DATABASE_URL?.includes('postgres')) {
  sequelizeConfig.dialectOptions = {
    // Supabase pooler usa sslmode=require e pode apresentar cadeia própria.
    // DB_SSL=true também habilita SSL para URLs sem sslmode explícito.
    ssl: sslEnabled ? { require: true, rejectUnauthorized: false } : false
  };
}

const sequelize = DATABASE_URL
  ? new Sequelize(DATABASE_URL, sequelizeConfig)
  : new Sequelize('sqlite::memory:', { logging: false });

if (process.env.NODE_ENV === 'production' && DATABASE_URL) {
  sequelize.authenticate()
    .then(() => console.log('Conexao com PostgreSQL estabelecida'))
    .catch(err => console.error('Erro na conexao PostgreSQL:', err.message));
}

// ═══════════════════════════════════════
// MODELO: Torrent
// ═══════════════════════════════════════

interface TorrentAttributes {
  infoHash: string;
  provider: string;
  title: string;
  size?: number;
  type: string;
  imdbId?: string;
  imdbSeason?: number;
  imdbEpisodeStart?: number;
  imdbEpisodeEnd?: number;
  seeders?: number;
  idioma?: string;
  qualidade?: string;
  uploadDate: Date;
  lastSeen: Date;
  rescrapeAt?: Date | null;
}

class Torrent extends Model<TorrentAttributes> implements TorrentAttributes {
  public infoHash!: string;
  public provider!: string;
  public title!: string;
  public size?: number;
  public type!: string;
  public imdbId?: string;
  public imdbSeason?: number;
  public imdbEpisodeStart?: number;
  public imdbEpisodeEnd?: number;
  public seeders?: number;
  public idioma?: string;
  public qualidade?: string;
  public uploadDate!: Date;
  public lastSeen!: Date;
  public rescrapeAt?: Date | null;
}

Torrent.init(
  {
    infoHash:   { type: DataTypes.STRING(64), primaryKey: true },
    provider:   { type: DataTypes.STRING(50) },
    title:      { type: DataTypes.TEXT },
    size:       { type: DataTypes.BIGINT },
    type:       { type: DataTypes.STRING(10) },
    imdbId:     { type: DataTypes.STRING(32) },
    imdbSeason: { type: DataTypes.INTEGER },
    imdbEpisodeStart: { type: DataTypes.INTEGER },
    imdbEpisodeEnd:   { type: DataTypes.INTEGER },
    seeders:    { type: DataTypes.INTEGER },
    idioma:     { type: DataTypes.STRING(50) },
    qualidade:  { type: DataTypes.STRING(10) },
    uploadDate: { type: DataTypes.DATE },
    lastSeen:   { type: DataTypes.DATE },
    rescrapeAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null }
  },
  {
    sequelize,
    modelName: 'Torrent',
    tableName: 'torrents',
    timestamps: false,
    indexes: [
      { fields: ['seeders'] },
      { fields: ['type'] },
      { fields: ['idioma'] },
      { fields: ['provider'] },
      { fields: ['uploadDate'] },
      { fields: ['imdbId', 'type'] }
    ]
  }
);

export { sequelize, Torrent };
