import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import * as winston from 'winston';
import fs from "fs/promises";
import { generateGuid } from "../../helpers/logger.js";

export const ToolName : string = `read_multiple_files`;

export function Add_Tool(server: FastMCP, config: AppConfig, logger : winston.Logger) : void {
  
    //on regarde si l'outil n'est pas interdit
    if(!config.validateTool(ToolName))
        return;

    // Schéma de validation pour les arguments
    const ReadMultipleFilesArgsSchema = z.object({
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
        parameters: ReadMultipleFilesArgsSchema,
        execute: async (args, context) => {
            const operationId = generateGuid();
            logger.info(`[${operationId}] Appel de l'outil '${ToolName}': `, {operationId, args});
    
            
            const results = await Promise.all(
                args.paths.map(async (filePath: string) => {

                    // Vérification que le chemin est dans un répertoire autorisé
                    config.validatePath(filePath);
                                            
                    // Lecture du fichier
                    const content = await fs.readFile(filePath, "utf-8");
                    return `${filePath}:\n${content}\n`;
                   
                })
            );

            return results.join("\n---\n");
        },
    });
}