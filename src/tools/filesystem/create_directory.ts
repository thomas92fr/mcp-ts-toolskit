import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import fs from "fs/promises";
import { ExtendedLogger } from "../../helpers/logger.js";

export const ToolName : string = `create_directory`;

/**
* Ajoute l'outil au serveur MCP.
* 
* @param server Instance du serveur FastMCP sur laquelle ajouter l'outil
* @param config Configuration de l'application contenant notamment les répertoires autorisés
* @param logger Instance du logger pour tracer les opérations
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
        description: "Create a new directory or ensure a directory exists. Can create multiple " +
          "nested directories in one operation. If the directory already exists, " +
          "this operation will succeed silently. Perfect for setting up directory " +
          "structures for projects or ensuring required paths exist. Only works within allowed directories.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}': `, args);
                           
                // Validation du chemin
                const validPath = config.validatePath(args.path);
                
                // Création du répertoire avec l'option recursive
                await fs.mkdir(validPath, { recursive: true });
                
                logger.info(`Répertoire créé avec succès: ${validPath}`);
                return `Successfully created directory ${args.path}`;
              
            });
        },
    });
}