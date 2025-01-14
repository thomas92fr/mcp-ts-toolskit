import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";

export const ToolName: string = `get_current_datetime`;

/**
 * Renvoie la date et l'heure courante au format ISO
 * @returns La date et l'heure courante au format ISO string
 */
function getCurrentDateTime(): string {
    return new Date().toISOString();
}

/**
 * Ajoute l'outil au serveur MCP.
 * 
 * @param server Instance du serveur FastMCP
 * @param config Configuration de l'application
 * @param logger Instance du logger pour tracer les opérations
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    //on regarde si l'outil n'est pas interdit
    if(!config.validateTool(ToolName))
        return;

    // Schéma de validation vide car pas de paramètres nécessaires
    const ClientArgsSchema = z.object({});

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: "Returns the current date and time in ISO format",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}'`);

                try {
                    const datetime = getCurrentDateTime();
                    logger.info(`Date et heure courante récupérées: ${datetime}`);
                    return datetime;
                } catch (error) {
                    logger.error(`Erreur lors de la récupération de la date et l'heure:`, error);
                    throw error;
                }
            });
        },
    });
}