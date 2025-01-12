import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import fs from "fs/promises";
import { ExtendedLogger } from "../../helpers/logger.js";

export const ToolName : string = `list_directory`;

/**
* Ajoute l'outil au serveur MCP.
* 
* @param server Instance du serveur FastMCP sur laquelle ajouter l'outil
* @param config Configuration de l'application contenant notamment les répertoires autorisés
* @param logger Instance du logger pour tracer les opérations
* 
*/
export function Add_Tool(server: FastMCP, config: AppConfig, logger : ExtendedLogger) : void {
  
    //on regarde si l'outil n'est pas interdit
    if(!config.validateTool(ToolName))
        return;

    // Schéma de validation pour les arguments
    const ClientArgsSchema = z.object({
        path: z.string(),
    });

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: "Get a detailed listing of all files and directories in a specified path. " +
          "Results clearly distinguish between files and directories with [FILE] and [DIR] " +
          "prefixes. This tool is essential for understanding directory structure and " +
          "finding specific files within a directory. Only works within allowed directories.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}': `, args);
                
             
                // Validation du chemin
                const validPath = config.validatePath(args.path);
                
                // Lecture du contenu du répertoire avec les types d'entrées
                const entries = await fs.readdir(validPath, { withFileTypes: true });
                
                // Formatage du résultat
                const formatted = entries
                    .map((entry) => `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`)
                    .join("\n");

                logger.debug(`Liste du répertoire obtenue avec succès: ${validPath}`);
                return formatted;
            
            });
        },
    });
}