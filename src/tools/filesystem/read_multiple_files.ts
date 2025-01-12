import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import fs from "fs/promises";
import { ExtendedLogger } from "../../helpers/logger.js";

export const ToolName : string = `read_multiple_files`;

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
        paths: z.array(z.string()),
    });

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: "Read the contents of multiple files simultaneously. This is more " +
          "efficient than reading files one by one when you need to analyze " +
          "or compare multiple files. Each file's content is returned with its " +
          "path as a reference. Failed reads for individual files won't stop " +
          "the entire operation. Only works within allowed directories.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}': `, args);
                
                const results = await Promise.all(
                    args.paths.map(async (filePath: string) => {
                        config.validatePath(filePath);
                        
                        try {
                            const content = await fs.readFile(filePath, "utf-8");
                            logger.debug(`Fichier lu avec succès: ${filePath}`);
                            return `${filePath}:\n${content}\n`;
                        } catch (error) {
                            logger.error(`Erreur lors de la lecture du fichier ${filePath}:`, error);
                            throw error;
                        }
                    })
                );

                logger.info(`Lecture des fichiers terminée avec succès`);
                return results.join("\n---\n");
            });
        },
    });
}