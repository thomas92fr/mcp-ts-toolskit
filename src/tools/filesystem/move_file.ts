import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import fs from "fs/promises";
import { ExtendedLogger } from "../../helpers/logger.js";

export const ToolName: string = `move_file`;

/**
 * Ajoute l'outil au serveur MCP.
 * 
 * @param server Instance du serveur FastMCP sur laquelle ajouter l'outil
 * @param config Configuration de l'application contenant notamment les répertoires autorisés
 * @param logger Instance du logger pour tracer les opérations
 * 
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    //on regarde si l'outil n'est pas interdit
    if (!config.validateTool(ToolName))
        return;

    // Schéma de validation pour les arguments
    const ClientArgsSchema = z.object({
        source: z.string(),
        destination: z.string(),
    });

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: "Move or rename files and directories. Can move files between directories " +
          "and rename them in a single operation. If the destination exists, the " +
          "operation will fail. Works across different directories and can be used " +
          "for simple renaming within the same directory. Both source and destination must be within allowed directories.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}': `, args);

                try {
                    // Validation des chemins source et destination
                    const validSourcePath = config.validatePath(args.source);
                    const validDestPath = config.validatePath(args.destination);

                    // Déplacement du fichier
                    await fs.rename(validSourcePath, validDestPath);
                    
                    logger.info(`Déplacement réussi de ${args.source} vers ${args.destination}`);
                    return `Successfully moved ${args.source} to ${args.destination}`;
                } catch (error) {
                    logger.error(`Erreur lors du déplacement du fichier:`, error);
                    throw error;
                }
            });
        },
    });
}