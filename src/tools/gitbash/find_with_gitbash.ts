import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { spawn } from "child_process";
import { ExtendedLogger } from "../../helpers/logger.js";

export const ToolName: string = `find_with_gitbash`;

/**
* Ajoute l'outil au serveur MCP.
*
* @param server Instance du serveur FastMCP sur laquelle ajouter l'outil
* @param config Configuration de l'application contenant notamment les répertoires autorisés et le chemin GitBash
* @param logger Instance du logger pour tracer les opérations
*
*/
export function Add_Tool(server: FastMCP, config: AppConfig, logger: ExtendedLogger): void {

    //on regarde si l'outil n'est pas interdit
    if (!config.validateTool(ToolName))
        return;

    // Vérification que GitBash est configuré
    if (!config.GitBash.GitBashPath) {
        logger.warn(`GitBash path not configured, skipping ${ToolName} tool`);
        return;
    }

    // Schéma de validation pour les arguments
    const ClientArgsSchema = z.object({
        directory: z.string().describe("Directory to search in"),
        name: z.string().optional().describe("File/folder name pattern. Examples: 'file.txt', '*.js', 'test*'"),
        type: z.enum(['file', 'directory', 'both']).optional().default('both').describe("Type of items to find"),
        caseInsensitive: z.boolean().optional().default(false).describe("Case insensitive name matching"),
        maxDepth: z.number().optional().describe("Maximum depth to search (1 = current dir only)"),
        maxResults: z.number().optional().default(100).describe("Maximum number of results to return"),
        minSize: z.string().optional().describe("Minimum file size (e.g., '1k', '10M')"),
        maxSize: z.string().optional().describe("Maximum file size (e.g., '100k', '1G')"),
        newerThan: z.string().optional().describe("Find files newer than this file path"),
        olderThan: z.string().optional().describe("Find files older than this file path")
    });

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: "Find files and directories using GitBash find command. Search by name patterns, file type, " +
            "size, date, and depth. Supports wildcards like *.js or test*. Works best with simple name patterns. " +
            "Can filter by file size (k, M, G) and compare modification times. Only works within allowed directories.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}': `, args);

                // Validation du chemin
                const searchPath = config.validatePath(args.directory);

                // Construction de la commande find
                let findCommand = `find "${searchPath.replace(/\\/g, '/')}"`;

                // Limite de profondeur
                if (args.maxDepth) {
                    findCommand += ` -maxdepth ${args.maxDepth}`;
                }

                // Type de fichier
                if (args.type === 'file') {
                    findCommand += ' -type f';
                } else if (args.type === 'directory') {
                    findCommand += ' -type d';
                }

                // Pattern de nom
                if (args.name) {
                    if (args.caseInsensitive) {
                        findCommand += ` -iname "${args.name}"`;
                    } else {
                        findCommand += ` -name "${args.name}"`;
                    }
                }

                // Taille minimum
                if (args.minSize) {
                    findCommand += ` -size +${args.minSize}`;
                }

                // Taille maximum
                if (args.maxSize) {
                    findCommand += ` -size -${args.maxSize}`;
                }

                // Plus récent qu'un fichier
                if (args.newerThan) {
                    try {
                        const newerPath = config.validatePath(args.newerThan);
                        findCommand += ` -newer "${newerPath.replace(/\\/g, '/')}"`;
                    } catch (error) {
                        logger.warn(`Invalid newerThan path: ${args.newerThan}`);
                    }
                }

                // Plus ancien qu'un fichier
                if (args.olderThan) {
                    try {
                        const olderPath = config.validatePath(args.olderThan);
                        findCommand += ` ! -newer "${olderPath.replace(/\\/g, '/')}"`;
                    } catch (error) {
                        logger.warn(`Invalid olderThan path: ${args.olderThan}`);
                    }
                }

                // Limitation des résultats
                if (args.maxResults) {
                    findCommand += ` | head -n ${args.maxResults}`;
                }

                logger.debug(`Commande find à exécuter: ${findCommand}`);

                return new Promise((resolve, reject) => {
                    // Lancement de GitBash avec la commande find
                    const gitBashProcess = spawn(config.GitBash.GitBashPath, ['-c', findCommand], {
                        stdio: ['pipe', 'pipe', 'pipe'],
                        windowsHide: true
                    });

                    let stdout = '';
                    let stderr = '';

                    gitBashProcess.stdout.on('data', (data) => {
                        stdout += data.toString();
                    });

                    gitBashProcess.stderr.on('data', (data) => {
                        stderr += data.toString();
                    });

                    gitBashProcess.on('close', (code) => {
                        if (code === 0) {
                            if (stdout.trim() === '') {
                                logger.info(`Aucun résultat trouvé pour la recherche find`);
                                resolve(`No files or directories found matching the criteria.`);
                            } else {
                                const resultCount = stdout.trim().split('\n').length;
                                logger.info(`Recherche find terminée avec succès, ${resultCount} résultats trouvés`);
                                resolve(stdout);
                            }
                        } else {
                            const errorMessage = `GitBash find command failed with code ${code}: ${stderr}`;
                            logger.error(errorMessage);
                            reject(new Error(errorMessage));
                        }
                    });

                    gitBashProcess.on('error', (error) => {
                        logger.error(`Erreur lors de l'exécution de GitBash find:`, error);
                        reject(error);
                    });

                    // Timeout de 60 secondes pour les recherches
                    setTimeout(() => {
                        gitBashProcess.kill();
                        reject(new Error('GitBash find command timed out after 60 seconds'));
                    }, 60000);
                });
            });
        },
    });
}