import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import fs from "fs/promises";
import { ExtendedLogger } from "../../helpers/logger.js";
import path from "path";
import { minimatch } from "minimatch";

export const ToolName: string = `search_files`;

/**
 * Recherche récursive des fichiers correspondant au pattern
 * 
 * @param rootPath Chemin racine de la recherche
 * @param pattern Pattern de recherche
 * @param excludePatterns Patterns d'exclusion optionnels
 * @param config Configuration de l'application
 * @returns Liste des chemins des fichiers trouvés
 */
async function searchFiles(
    rootPath: string,
    pattern: string,
    excludePatterns: string[] = [],
    config: AppConfig
): Promise<string[]> {
    const results: string[] = [];

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

                // Vérifier le pattern sur le chemin relatif complet
                const globPattern = pattern.includes('*') || pattern.includes('?') ? pattern : `**/${pattern}/**`;
                if (minimatch(relativePath, globPattern, { nocase: true, dot: true })) {
                    results.push(fullPath);
                }

                if (entry.isDirectory()) {
                    await search(fullPath);
                }
            } catch (error) {
                // On ignore les chemins invalides pendant la recherche
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
            .describe('Starting directory path for the search'),
        pattern: z.string()
            .describe(`Search pattern with glob syntax:
            - For recursive search: '**/*.ext' (e.g. '**/*.ts' finds all .ts files in all subdirectories)
            - For current directory: '*.ext' (e.g. '*.ts' finds .ts files only in specified directory)
            - '*' matches multiple characters in filename (e.g. 'test*.ts')
            - '?' matches single character (e.g. 'test?.ts')
            - '**' matches multiple directory levels
            Examples:
            - '**/*.ts' : all TypeScript files in all subdirectories
            - 'src/**/*.js' : all JavaScript files under src/ and its subdirectories
            - '*.txt' : text files in specified directory only
            - '**/test/*' : all files in any 'test' directory
            Search is case-insensitive.`),
        excludePatterns: z.array(z.string())
            .optional()
            .default([])
            .describe('Patterns to exclude from search. Uses same glob syntax as search pattern. Examples: ["**/node_modules/**", "**/*.tmp", "**/build/**"]')
    });

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: "Recursively search for files and directories matching a pattern. " +
          "Searches through all subdirectories from the starting path. " +
          "For a recursive search, use '**/*.extension' pattern (e.g. '**/*.ts' for all TypeScript files). " +
          "For searching in current directory only, use '*.extension'. " +
          "The search is case-insensitive and supports partial names. " +
          "Use quotes around patterns containing special characters. " +
          "Returns full paths to all matching items. " +
          "Only searches within allowed directories.",
        parameters: ClientArgsSchema,
        execute: async (args) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}': `, args);

                try {
                    // Validation du chemin racine
                    const validRootPath = config.validatePath(args.path);
                    
                    // Exécution de la recherche
                    const results = await searchFiles(validRootPath, args.pattern, args.excludePatterns, config);

                    logger.info(`Recherche terminée avec succès. ${results.length} résultats trouvés.`);
                    
                    return results.length > 0 
                        ? results.join("\n")
                        : "Aucun résultat trouvé";

                } catch (error) {
                    logger.error(`Erreur lors de la recherche de fichiers:`, error);
                    throw error;
                }
            });
        },
    });
}