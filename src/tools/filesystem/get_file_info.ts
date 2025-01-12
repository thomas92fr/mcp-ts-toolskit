import { FastMCP } from "fastmcp";
import { z } from "zod";
import fs from 'fs/promises';
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";

export const ToolName : string = `get_file_info`;

// Interface pour les informations du fichier
interface FileInfo {
    size: number;
    created: Date;
    modified: Date;
    accessed: Date;
    isDirectory: boolean;
    isFile: boolean;
    permissions: string;
}

/**
 * Récupère les statistiques détaillées d'un fichier
 * @param filePath Chemin du fichier à analyser
 * @returns Informations détaillées sur le fichier
 */
async function getFileStats(filePath: string): Promise<FileInfo> {
    const stats = await fs.stat(filePath);
    return {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        permissions: stats.mode.toString(8).slice(-3),
    };
}

/**
 * Ajoute l'outil get_file_info au serveur MCP
 * @param server Instance du serveur FastMCP
 * @param config Configuration de l'application
 * @param logger Logger pour les événements de l'outil
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger) {
    //on regarde si l'outil n'est pas interdit
    if(!config.validateTool(ToolName))
        return;

    // Schéma pour les arguments de l'outil
    const GetFileInfoArgsSchema = z.object({
        path: z.string().describe("Chemin du fichier ou répertoire à analyser"),
    });

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: "Retrieve detailed metadata about a file or directory. Returns comprehensive " +
          "information including size, creation time, last modified time, permissions, " +
          "and type. This tool is perfect for understanding file characteristics " +
          "without reading the actual content. Only works within allowed directories.",
        parameters: GetFileInfoArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}': `, args);
                
                // Validation des arguments
                const params = GetFileInfoArgsSchema.parse(args);
                
                // Validation du chemin par rapport aux répertoires autorisés
                const validPath = config.validatePath(params.path);
                
                // Obtention des informations du fichier
                const info = await getFileStats(validPath);
                
                // Formatage de la réponse
                const response = Object.entries(info)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join('\n');

                logger.info(response);
                return response;
            });
        },
    });
    
    
}