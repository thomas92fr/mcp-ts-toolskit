import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";

// Interfaces pour typer les réponses de l'API
interface BraveWeb {
    web?: {
        results?: Array<{
            title: string;
            description: string;
            url: string;
        }>;
    };
    locations?: {
        results?: Array<{
            id: string;
            title?: string;
        }>;
    };
}

interface BraveLocation {
    id: string;
    name: string;
    address: {
        streetAddress?: string;
        addressLocality?: string;
        addressRegion?: string;
        postalCode?: string;
    };
    coordinates?: {
        latitude: number;
        longitude: number;
    };
    phone?: string;
    rating?: {
        ratingValue?: number;
        ratingCount?: number;
    };
    openingHours?: string[];
    priceRange?: string;
}

interface BravePoiResponse {
    results: BraveLocation[];
}

interface BraveDescription {
    descriptions: {[id: string]: string};
}

export const ToolName: string = `brave_local_search`;

/**
 * Effectue une recherche web pour obtenir les IDs des lieux
 * 
 * @param query Requête de recherche
 * @param count Nombre de résultats souhaités
 * @param apiKey Clé API Brave Search
 * @param ignoreSSLErrors Indique si on ignore les erreurs SSL
 * @param logger Instance du logger
 * @returns Données de la recherche web
 */
async function performInitialSearch(
    query: string,
    count: number,
    apiKey: string,
    ignoreSSLErrors: boolean,
    logger: ExtendedLogger
): Promise<BraveWeb> {
    logger.debug(`Exécution de la recherche initiale`, { query, count });

    const webUrl = new URL('https://api.search.brave.com/res/v1/web/search');
    webUrl.searchParams.set('q', query);
    webUrl.searchParams.set('search_lang', 'en');
    webUrl.searchParams.set('result_filter', 'locations');
    webUrl.searchParams.set('count', Math.min(count, 20).toString());

    const fetchOptions: RequestInit = {
        headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': apiKey
        }
    };

    if (ignoreSSLErrors) {
        logger.debug('SSL verification disabled');
        Object.assign(fetchOptions, {
            agent: new (await import('node:https')).Agent({
                rejectUnauthorized: false
            })
        });
    }

    const response = await fetch(webUrl, fetchOptions);

    if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Erreur API Brave`, { status: response.status, statusText: response.statusText, error: errorText });
        throw new Error(`Brave API error: ${response.status} ${response.statusText}\n${errorText}`);
    }

    return await response.json() as BraveWeb;
}

/**
 * Récupère les détails des POIs à partir des IDs
 */
async function getPoisData(
    ids: string[],
    apiKey: string,
    ignoreSSLErrors: boolean,
    logger: ExtendedLogger
): Promise<BravePoiResponse> {
    logger.debug(`Récupération des détails des POIs`, { count: ids.length });

    const url = new URL('https://api.search.brave.com/res/v1/local/pois');
    ids.filter(Boolean).forEach(id => url.searchParams.append('ids', id));

    const fetchOptions: RequestInit = {
        headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': apiKey
        }
    };

    if (ignoreSSLErrors) {
        Object.assign(fetchOptions, {
            agent: new (await import('node:https')).Agent({
                rejectUnauthorized: false
            })
        });
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Erreur API Brave POIs`, { status: response.status, statusText: response.statusText, error: errorText });
        throw new Error(`Brave API error: ${response.status} ${response.statusText}\n${errorText}`);
    }

    return await response.json() as BravePoiResponse;
}

/**
 * Récupère les descriptions des POIs à partir des IDs
 */
async function getDescriptionsData(
    ids: string[],
    apiKey: string,
    ignoreSSLErrors: boolean,
    logger: ExtendedLogger
): Promise<BraveDescription> {
    logger.debug(`Récupération des descriptions des POIs`, { count: ids.length });

    const url = new URL('https://api.search.brave.com/res/v1/local/descriptions');
    ids.filter(Boolean).forEach(id => url.searchParams.append('ids', id));

    const fetchOptions: RequestInit = {
        headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': apiKey
        }
    };

    if (ignoreSSLErrors) {
        Object.assign(fetchOptions, {
            agent: new (await import('node:https')).Agent({
                rejectUnauthorized: false
            })
        });
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Erreur API Brave Descriptions`, { status: response.status, statusText: response.statusText, error: errorText });
        throw new Error(`Brave API error: ${response.status} ${response.statusText}\n${errorText}`);
    }

    return await response.json() as BraveDescription;
}

/**
 * Formate les résultats de la recherche locale
 */
function formatLocalResults(poisData: BravePoiResponse, descData: BraveDescription): string {
    return (poisData.results || []).map(poi => {
        const address = [
            poi.address?.streetAddress ?? '',
            poi.address?.addressLocality ?? '',
            poi.address?.addressRegion ?? '',
            poi.address?.postalCode ?? ''
        ].filter(part => part !== '').join(', ') || 'N/A';

        return `Name: ${poi.name}
Address: ${address}
Phone: ${poi.phone || 'N/A'}
Rating: ${poi.rating?.ratingValue ?? 'N/A'} (${poi.rating?.ratingCount ?? 0} reviews)
Price Range: ${poi.priceRange || 'N/A'}
Hours: ${(poi.openingHours || []).join(', ') || 'N/A'}
Description: ${descData.descriptions[poi.id] || 'No description available'}`;
    }).join('\n\n---\n\n') || 'No local results found';
}

/**
 * Effectue une recherche locale complète
 */
async function performLocalSearch(
    query: string,
    count: number = 5,
    apiKey: string,
    ignoreSSLErrors: boolean,
    logger: ExtendedLogger
): Promise<string> {
    logger.debug(`Démarrage de la recherche locale`, { query, count });

    // Recherche initiale pour obtenir les IDs
    const webData = await performInitialSearch(query, count, apiKey, ignoreSSLErrors, logger);
    const locationIds = webData.locations?.results?.filter((r): r is {id: string; title?: string} => r.id != null).map(r => r.id) || [];

    if (locationIds.length === 0) {
        logger.info(`Aucun résultat local trouvé, repli sur la recherche web`);
        // Fallback sur la recherche web
        return (webData.web?.results || [])
            .map(result => `Title: ${result.title}\nDescription: ${result.description}\nURL: ${result.url}`)
            .join('\n\n---\n\n');
    }

    // Récupération des détails et descriptions en parallèle
    const [poisData, descriptionsData] = await Promise.all([
        getPoisData(locationIds, apiKey, ignoreSSLErrors, logger),
        getDescriptionsData(locationIds, apiKey, ignoreSSLErrors, logger)
    ]);

    logger.debug(`Données récupérées avec succès`, {
        poisCount: poisData.results.length,
        descriptionsCount: Object.keys(descriptionsData.descriptions).length
    });

    return formatLocalResults(poisData, descriptionsData);
}

/**
 * Ajoute l'outil au serveur MCP.
 * 
 * @param server Instance du serveur FastMCP sur laquelle ajouter l'outil
 * @param config Configuration de l'application contenant notamment la clé API
 * @param logger Instance du logger pour tracer les opérations
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    
    //on regarde si l'outil n'est pas interdit
    if (!config.validateTool(ToolName))
        return;
        
    // Vérification de la présence de la clé API
    if (!config.BraveSearch.ApiKey) {
        logger.error("Clé API Brave Search manquante dans la configuration");
        return;
    }

    // Schéma de validation pour les arguments
    const ClientArgsSchema = z.object({
        query: z.string().describe("Local search query (e.g. 'pizza near Central Park')"),
        count: z.number().min(1).max(20).default(5).describe("Number of results (1-20, default 5)")
    });

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: "Searches for local businesses and places using Brave's Local Search API. " +
    "Best for queries related to physical locations, businesses, restaurants, services, etc. " +
    "Returns detailed information including:\n" +
    "- Business names and addresses\n" +
    "- Ratings and review counts\n" +
    "- Phone numbers and opening hours\n" +
    "Use this when the query implies 'near me' or mentions specific locations. " +
    "Automatically falls back to web search if no local results are found.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}':`, args);

                try {
                    const results = await performLocalSearch(
                        args.query,
                        args.count,
                        config.BraveSearch.ApiKey,
                        config.BraveSearch.IgnoreSSLErrors,
                        logger
                    );

                    logger.info(`Recherche locale terminée avec succès`);
                    return results;
                } catch (error) {
                    logger.error(`Erreur lors de la recherche locale:`, error);
                    throw error;
                }
            });
        },
    });
}