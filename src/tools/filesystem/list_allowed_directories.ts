import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import path from "path";

export const ToolName : string = `list_allowed_directories`;

/**
 * Ajoute l'outil list_allowed_directories au serveur MCP
 * @param server Instance du serveur FastMCP
 * @param config Configuration de l'application
 * @param logger Instance du logger
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    //on regarde si l'outil n'est pas interdit
    if(!config.validateTool(ToolName))
        return;
    
    // Enregistrement de l'outil
    server.addTool({
        name: ToolName,
        description: "Liste les répertoires autorisés pour les opérations sur le système de fichiers",
        parameters: z.object({}),
        execute: async (args, context) => {
                    return logger.withOperationContext(async () => {
                        logger.info(`Appel de l'outil '${ToolName}': `, args);
                        
                        const dirs: string[] = config.AllowedDirectories.map(dir => path.resolve(dir));
                        const results = `Répertoires autorisés:\n${dirs.join("\n")}`;
                        logger.info(results);
                        return results;
                    });
                },      
    });
}