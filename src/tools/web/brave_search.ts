import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";

// Interfaces pour typer les réponses de l'API
interface BraveWebResult {
    title?: string;
    description?: string;
    url?: string;
}

interface BraveWebResponse {
    web?: {
        results?: BraveWebResult[];
    };
}

export const ToolName: string = `brave_web_search`;

/**
 * Effectue une recherche web via l'API Brave Search
 * 
 * @param query Requête de recherche
 * @param count Nombre de résultats souhaités (1-20)
 * @param offset Décalage pour la pagination (0-9)
 * @param apiKey Clé API Brave Search
 * @param logger Instance du logger
 * @returns Résultats de la recherche formatés
 */
async function performWebSearch(
    query: string,
    count: number = 10,
    offset: number = 0,
    apiKey: string,
    ignoreSSLErrors: boolean,
    logger: ExtendedLogger
): Promise<string> {
    logger.debug(`Exécution de la recherche web`, { query, count, offset });

    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', Math.min(count, 20).toString());
    url.searchParams.set('offset', offset.toString());

    // Création des options de fetch avec gestion SSL
    const fetchOptions: RequestInit = {
        headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': apiKey
        }
    };

    // Ajout des options SSL si nécessaire
    if (ignoreSSLErrors) {
        logger.debug('SSL verification disabled');
        Object.assign(fetchOptions, {
            agent: new (await import('node:https')).Agent({
                rejectUnauthorized: false
            })
        });
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Erreur API Brave`, { status: response.status, statusText: response.statusText, error: errorText });
        throw new Error(`Brave API error: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const data = await response.json() as BraveWebResponse;
    
    // Extraction et formatage des résultats
    const results = (data.web?.results || []).map((result) => ({
        title: result.title || '',
        description: result.description || '',
        url: result.url || ''
    }));

    logger.debug(`${results.length} résultats obtenus`);

    const formattedResults = results.map(r =>
        `Title: ${r.title}\nDescription: ${r.description}\nURL: ${r.url}`
    ).join('\n\n');

    // Log des résultats formatés
    logger.info(`Résultats de la recherche:\n${formattedResults}`);

    return formattedResults;
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
        query: z.string().max(400).describe("Search query (max 400 chars)"),
        count: z.number().min(1).max(20).default(10).describe("Number of results (1-20, default 10)"),
        offset: z.number().min(0).max(9).default(0).describe("Pagination offset (0-9, default 0)")
    });

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: "Performs a web search using the Brave Search API, ideal for general queries, news, articles, and online content. " +
    "Use this for broad information gathering, recent events, or when you need diverse web sources. " +
    "Supports pagination, content filtering, and freshness controls. " +
    "Maximum 20 results per request, with offset for pagination. ",
        parameters: ClientArgsSchema,
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}':`, args);

                try {
                    const results = await performWebSearch(
                        args.query,
                        args.count,
                        args.offset,
                        config.BraveSearch.ApiKey,
                        config.BraveSearch.IgnoreSSLErrors,
                        logger
                    );

                    logger.info(`Recherche terminée avec succès`);
                    return results;
                } catch (error) {
                    logger.error(`Erreur lors de la recherche:`, error);
                    throw error;
                }
            });
        },
    });
}
