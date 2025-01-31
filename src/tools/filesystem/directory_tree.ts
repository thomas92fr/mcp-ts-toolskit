import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import fs from "fs/promises";
import path from "path";
import { ExtendedLogger } from "../../helpers/logger.js";
import { stringify } from 'yaml'

export const ToolName: string = `directory_tree`;

interface TreeEntry {
    name: string;
    type: 'file' | 'directory';
    children?: TreeEntry[];
}

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
    if(!config.validateTool(ToolName))
        return;

    // Schéma de validation pour les arguments
    const ClientArgsSchema = z.object({
        path: z.string(),
    });

    /**
     * Construit récursivement l'arborescence des fichiers et dossiers
     * @param currentPath Chemin du dossier à analyser
     * @returns Promise avec l'arborescence des fichiers et dossiers
     */
    async function buildTree(currentPath: string): Promise<TreeEntry[]> {
        try {
            const validPath = config.validatePath(currentPath);
            const entries = await fs.readdir(validPath, { withFileTypes: true });
            const result: TreeEntry[] = [];

            for (const entry of entries) {
                const entryData: TreeEntry = {
                    name: entry.name,
                    type: entry.isDirectory() ? 'directory' : 'file'
                };

                if (entry.isDirectory()) {
                    const subPath = path.join(currentPath, entry.name);
                    try {
                        entryData.children = await buildTree(subPath);
                    } catch (error) {
                        logger.error(`Erreur lors de l'analyse du sous-dossier ${subPath}:`, error);
                        entryData.children = []; // Dossier vide en cas d'erreur
                    }
                }

                result.push(entryData);
            }

            return result;

        } catch (error) {
            logger.error(`Erreur lors de l'analyse du dossier ${currentPath}:`, error);
            throw error;
        }
    }

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: "Get a recursive tree view of files and directories as a YAML structure. " +
            "Each entry includes 'name', 'type' (file/directory), and 'children' for directories. " +
            "Files have no children array, while directories always have a children array (which may be empty). " +
            "The output is formatted with 2-space indentation for readability. Only works within allowed directories.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}': `, args);
                
                const treeData = await buildTree(args.path);
                logger.info(`Analyse de l'arborescence terminée avec succès`);
                return stringify(treeData);
               
            });
        },
    });
}