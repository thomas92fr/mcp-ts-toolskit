import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import fs from "fs/promises";
import { ExtendedLogger } from "../../helpers/logger.js";

export const ToolName: string = `write_file`;

/**
* Ajoute l'outil au serveur MCP.
* 
* @param server Instance du serveur FastMCP sur laquelle ajouter l'outil
* @param config Configuration de l'application contenant notamment les répertoires autorisés
* @param logger Instance du logger pour tracer les opérations
*/
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    
    //on regarde si l'outil n'est pas interdit
    if (!config.validateTool(ToolName))
        return;

    // Schéma de validation pour les arguments
    const ClientArgsSchema = z.object({
        path: z.string(),
        content: z.string(),
    });

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: "Create a new file or completely overwrite an existing file with new content. " +
          "Use with caution as it will overwrite existing files without warning. " +
          "Handles text content with proper encoding. Only works within allowed directories.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}': `, args);

                // Valider le chemin du fichier
                const validPath = config.validatePath(args.path);

                // Écrire le contenu dans le fichier
                await fs.writeFile(validPath, args.content, "utf-8");
                
                logger.info(`Fichier écrit avec succès: ${validPath}`);
                return `Successfully wrote to ${args.path}`;
               
            });
        },
    });
}