import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import fs from "fs/promises";
import { ExtendedLogger } from "../../helpers/logger.js";
import path from "path";
import { minimatch } from "minimatch";

export const ToolName: string = `search_file_content`;

/**
 * Recherche récursive des fichiers dont le contenu correspond à une expression régulière
 * 
 * @param rootPath Chemin racine de la recherche
 * @param regex Expression régulière à rechercher dans le contenu des fichiers
 * @param excludePatterns Patterns d'exclusion optionnels
 * @param config Configuration de l'application
 * @returns Liste des chemins des fichiers trouvés
 */
async function searchFileContent(
    rootPath: string,
    regex: string,
    excludePatterns: string[] = [],
    fileExtensions: string[] = [],
    config: AppConfig
): Promise<string[]> {
    const results: string[] = [];
    const searchRegex = new RegExp(regex);

    async function search(currentPath: string) {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);

            try {
                // Validation du chemin avant traitement
                config.validatePath(fullPath);

                // Vérification des patterns d'exclusion
                const relativePath = path.relative(rootPath, fullPath);
                const shouldExclude = excludePatterns.some(pattern => {
                    const globPattern = pattern.includes('*') ? pattern : `**/${pattern}/**`;
                    return minimatch(relativePath, globPattern, { dot: true });
                });

                if (shouldExclude) {
                    continue;
                }

                if (entry.isFile()) {
                    // Vérifier l'extension du fichier si des extensions sont spécifiées
                    if (fileExtensions.length > 0) {
                        const ext = path.extname(entry.name).toLowerCase();
                        if (!fileExtensions.some(e => ext === (e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`))) {
                            continue;
                        }
                    }
                    
                    // Lecture et vérification du contenu du fichier
                    const content = await fs.readFile(fullPath, 'utf-8');
                    if (searchRegex.test(content)) {
                        results.push(fullPath);
                    }
                } else if (entry.isDirectory()) {
                    await search(fullPath);
                }
            } catch (error) {
                // On ignore les fichiers qui ne peuvent pas être lus ou les chemins invalides
                continue;
            }
        }
    }

    await search(rootPath);
    return results;
}

/**
 * Ajoute l'outil au serveur MCP.
 * 
 * @param server Instance du serveur FastMCP sur laquelle ajouter l'outil
 * @param config Configuration de l'application contenant notamment les répertoires autorisés
 * @param logger Instance du logger pour tracer les opérations
 */
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {
    //on regarde si l'outil n'est pas interdit
    if(!config.validateTool(ToolName))
        return;

    // Schéma de validation pour les arguments
    const ClientArgsSchema = z.object({
        path: z.string()
            .describe('Starting directory path for the content search'),
        regex: z.string()
            .describe('Regular expression pattern to search for in file contents. Supports standard regex syntax (e.g., "error.*exception", "\b\w+@\w+\.\w+\b" for emails)'),
        excludePatterns: z.array(z.string())
            .optional()
            .default([])
            .describe('List of patterns to exclude from the search. Supports glob patterns like **/*.tmp or **/node_modules/**'),
        fileExtensions: z.array(z.string())
            .optional()
            .default([])
            .describe('List of file extensions to search in (e.g., [".ts", "js"]). If empty, searches in all files')
    });

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: "Search for files whose content matches a regular expression pattern. " +
          "Recursively searches through all text files in subdirectories from the starting path. " +
          "Returns full paths to all files containing matches. " +
          "Only searches within allowed directories and readable text files.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}': `, args);

                try {
                    // Validation du chemin racine
                    const validRootPath = config.validatePath(args.path);
                    
                    // Exécution de la recherche
                    const results = await searchFileContent(validRootPath, args.regex, args.excludePatterns, args.fileExtensions, config);

                    
                    
                    const text_result = results.length > 0 
                    ? results.join("\n")
                    : "Aucun fichier trouvé contenant l'expression recherchée";

                    logger.info(`Recherche terminée avec succès. ${results.length} fichiers trouvés.\n${text_result}`);

                    return text_result;

                } catch (error) {
                    logger.error(`Erreur lors de la recherche dans le contenu des fichiers:`, error);
                    throw error;
                }
            });
        },
    });
}
