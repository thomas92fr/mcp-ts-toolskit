import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import { ApiResponse, Status } from "./types/types.js";
import { stringify } from 'yaml';

export const ToolName: string = `piapi_get_task_status`;

/**
 * Vérifie l'état d'une tâche PiAPI jusqu'à sa complétion ou son échec
 * 
 * @param taskId ID de la tâche à vérifier
 * @param apiKey Clé API PiAPI.ai
 * @param logger Instance du logger
 * @param checkInterval Intervalle entre chaque vérification en ms (défaut: 2000)
 * @returns Les données de la tâche une fois complétée
 */
export async function checkTaskStatus(
    taskId: string,
    apiKey: string,
    logger: ExtendedLogger,
    checkInterval: number = 2000
): Promise<ApiResponse> {
    const statusUrl = `https://api.piapi.ai/api/v1/task/${taskId}`;

    while (true) {
        const statusResponse = await fetch(statusUrl, {
            headers: { 'X-API-Key': apiKey }
        });
        
        if (!statusResponse.ok) {
            throw new Error(`Failed to check task status: ${statusResponse.statusText}`);
        }
        
        const statusResult = await statusResponse.json() as ApiResponse;
       
        // Conversion du status en majuscules pour correspondre à l'enum
        const status = statusResult.data.status.charAt(0).toUpperCase() + statusResult.data.status.slice(1).toLowerCase() as Status;
        logger.info(`État de la tâche:`, { status });

        switch(status) {
            case Status.Completed:
                logger.info(`Tâche complétée avec succès\n${stringify(statusResult.data)}`);
                return statusResult;
            
            case Status.Failed:
                const errorMessage = statusResult.data.error?.message || 'Unknown error';
                logger.error(`Échec de la tâche:\n${stringify(statusResult.data)}`, { error: errorMessage });
                throw new Error(`Task failed: ${errorMessage}`);
            
            case Status.Pending:
            case Status.Processing:
                // Attendre l'intervalle spécifié avant de réessayer
                await new Promise(resolve => setTimeout(resolve, checkInterval));
                continue;
            
            default:
                throw new Error(`Unknown task status: ${status}`);
        }
    }
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
    if (!config.PiAPI.ApiKey) {
        logger.error("Clé API PiAPI manquante dans la configuration");
        return;
    }

    // Schéma de validation pour les arguments
    const ClientArgsSchema = z.object({
        taskId: z.string().describe("PiAPI task ID to monitor"),
        checkInterval: z.number().min(1000).max(10000).default(2000)
            .describe("Interval between each check in milliseconds (1000-10000, default: 2000)")
    });

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: "Periodically checks the status of a PiAPI task until completion or failure",
        parameters: ClientArgsSchema,
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}':`, args);

                try {
                    const result = await checkTaskStatus(
                        args.taskId,
                        config.PiAPI.ApiKey,
                        logger,
                        args.checkInterval
                    );
                    
                    return stringify(result.data);
                    
                } catch (error) {
                    logger.error(`Erreur lors de la vérification de la tâche:`, error);
                    throw error;
                }
            });
        },
    });
}
