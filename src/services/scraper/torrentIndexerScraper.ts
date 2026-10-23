import { Logger } from '../../utils/logger.js';
import { QualityDetector } from '../../lib/qualityDetector.js';
import { analisarMagnet } from '../../magnet/magnetHelper.js';
import { TorrentResult } from './torrentTypes.js';
import { agenteHttps, requisicaoComFallback } from './wordpressScraper.js';

const logger = new Logger('TorrentIndexerScraper');

export interface TorrentIndexerRawResult {
  title?: string;
  original_title?: string;
  magnet_link?: string;
  info_hash?: string;
  seed_count?: number;
  leech_count?: number;
  size?: string;
  date?: string;
  imdb?: string;
  audio?: string[];
  details?: string;
}

export interface TorrentIndexerSearchOptions {
  baseUrl?: string;
  timeout?: number;
  limit?: number;
}

function normalizarBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function extrairIdioma(audio?: string[]): string {
  const idiomas = (audio || []).map(a => a.toLowerCase());
  const portugues = idiomas.some(a => a.includes('português') || a.includes('portugues') || a.includes('brazilian') || a === 'por');
  const ingles = idiomas.some(a => a.includes('inglês') || a.includes('ingles') || a.includes('english') || a === 'eng');
  if (portugues && ingles) return 'Dual Áudio';
  if (portugues) return 'Dublado';
  if (ingles) return 'Legendado';
  return audio?.join(' | ') || 'Desconhecido';
}

function extrairQualidade(titulo: string, fallback: QualityDetector): string {
  return fallback.extractQualityFromFilename(titulo);
}

function extrairTamanhoBytes(tamanho?: string): number {
  if (!tamanho) return 0;
  const match = tamanho.match(/(\d+(?:[.,]\d+)?)\s*(TB|GB|MB|KB)\b/i);
  if (!match) return 0;
  const valor = parseFloat(match[1].replace(',', '.'));
  if (!Number.isFinite(valor)) return 0;
  const unidade = match[2].toUpperCase();
  const multiplicador = unidade === 'TB' ? 1024 ** 4 : unidade === 'GB' ? 1024 ** 3 : unidade === 'MB' ? 1024 ** 2 : 1024;
  return Math.round(valor * multiplicador);
}

function extrairAno(titulo?: string): number | undefined {
  if (!titulo) return undefined;
  const match = titulo.match(/\b(19|20)\d{2}\b/);
  return match ? parseInt(match[0], 10) : undefined;
}

export async function searchTorrentIndexerBludv(
  query: string,
  type: 'movie' | 'series' | 'anime' = 'movie',
  options: TorrentIndexerSearchOptions = {}
): Promise<TorrentResult[]> {
  const baseUrl = normalizarBaseUrl(
    options.baseUrl || process.env.TORRENT_INDEXER_URL?.trim() || 'https://torrent-indexer.darklyn.org'
  );
  const qualidade = QualityDetector.getInstance();
  const limit = Math.max(1, Math.min(options.limit ?? 30, 100));

  try {
    const response = await requisicaoComFallback(`${baseUrl}/indexers/bludv`, {
      timeout: options.timeout ?? 15000,
      params: {
        q: query,
        filter_results: false,
        limit,
      },
    });

    const raw: TorrentIndexerRawResult[] = Array.isArray(response.data?.results)
      ? response.data.results
      : [];

    const resultados: TorrentResult[] = [];
    const hashes = new Set<string>();

    for (const item of raw) {
      const titulo = (item.title || item.original_title || '').trim();
      if (!titulo || !item.magnet_link?.startsWith('magnet:?')) continue;

      const dados = await analisarMagnet(item.magnet_link).catch(() => null);
      const infoHash = (dados?.infoHash || item.info_hash || '').toLowerCase();
      if (!/^[a-f0-9]{40}$/.test(infoHash) || hashes.has(infoHash)) continue;
      hashes.add(infoHash);

      const ano = extrairAno(titulo);
      const idiomas = extrairIdioma(item.audio);

      resultados.push({
        title: titulo,
        magnet: item.magnet_link,
        seeders: Number(item.seed_count) || 0,
        leechers: Number(item.leech_count) || 0,
        size: item.size || 'N/A',
        quality: extrairQualidade(titulo, qualidade),
        provider: 'Torrent Indexer (BLUDV)',
        language: idiomas,
        type,
        relevanceScore: 0.8,
        sizeInBytes: extrairTamanhoBytes(item.size),
        lastUpdated: item.date ? new Date(item.date) : new Date(),
        confidence: 0.75,
        infoHash,
        htmlTitle: item.original_title,
        canonicalName: dados?.nome || undefined,
        years: ano ? [ano] : undefined,
      });
    }

    if (resultados.length === 0) {
      logger.debug('Torrent Indexer retornou zero resultados utilizáveis', { query: query.substring(0, 60) });
    }

    return resultados;
  } catch (error) {
    logger.warn('Torrent Indexer BLUDV falhou', {
      query: query.substring(0, 60),
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
    return [];
  }
}

export { agenteHttps };
