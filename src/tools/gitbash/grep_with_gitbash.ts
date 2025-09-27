import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { spawn } from "child_process";
import { ExtendedLogger } from "../../helpers/logger.js";

export const ToolName: string = `grep_with_gitbash`;

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
        pattern: z.string().describe("Search pattern. Use simple text for best results. For literal special chars use single backslash: \\^ \\$ \\. Examples: 'word', '\\^' (literal ^), 'text_pattern'"),
        filePath: z.string().optional().describe("Specific file to search in (optional)"),
        directory: z.string().optional().describe("Directory to search in recursively (optional)"),
        caseInsensitive: z.boolean().optional().default(false).describe("Case insensitive search"),
        lineNumbers: z.boolean().optional().default(true).describe("Show line numbers in output"),
        recursive: z.boolean().optional().default(false).describe("Search recursively in subdirectories"),
        filePattern: z.string().optional().describe("File pattern to include (e.g., '*.ts', '*.js')"),
        maxResults: z.number().optional().default(100).describe("Maximum number of results to return")
    });

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: "Search for patterns in files using GitBash grep command. Supports regular expressions, " +
            "case insensitive search, line numbers, recursive search, and file pattern filtering. " +
            "Can search in a specific file or recursively in a directory. Only works within allowed directories. " +
            "Works best with simple text patterns. Supports case insensitive search, line numbers, and result limits. " +
            "For literal special characters use single backslash (\\^, \\$, \\.). Avoid complex regex - use simple words instead.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}': `, args);

                // Validation des chemins
                let searchPath: string;
                if (args.filePath) {
                    searchPath = config.validatePath(args.filePath);
                } else if (args.directory) {
                    searchPath = config.validatePath(args.directory);
                } else {
                    throw new Error("Either filePath or directory must be specified");
                }

                // Construction de la commande grep
                let grepCommand = 'grep';

                // Options grep
                if (args.caseInsensitive) {
                    grepCommand += ' -i';
                }
                if (args.lineNumbers) {
                    grepCommand += ' -n';
                }
                if (args.recursive && args.directory) {
                    grepCommand += ' -r';
                }

                // Ajouter le pattern (échapper les guillemets)
                const escapedPattern = args.pattern.replace(/"/g, '\\"');
                grepCommand += ` "${escapedPattern}"`;

                // Ajouter le chemin de recherche
                if (args.filePath) {
                    grepCommand += ` "${searchPath.replace(/\\/g, '/')}"`;
                } else if (args.directory) {
                    if (args.filePattern) {
                        // Utiliser find pour filtrer par pattern de fichier
                        grepCommand = `find "${searchPath.replace(/\\/g, '/')}" -name "${args.filePattern}" -type f -exec grep`;
                        if (args.caseInsensitive) grepCommand += ' -i';
                        if (args.lineNumbers) grepCommand += ' -n';
                        grepCommand += ` "${escapedPattern}" {} +`;
                    } else {
                        grepCommand += ` "${searchPath.replace(/\\/g, '/')}"`;
                    }
                }

                // Limiter les résultats
                if (args.maxResults) {
                    grepCommand += ` | head -n ${args.maxResults}`;
                }

                logger.debug(`Commande grep à exécuter: ${grepCommand}`);

                return new Promise((resolve, reject) => {
                    // Lancement de GitBash avec la commande grep
                    const gitBashProcess = spawn(config.GitBash.GitBashPath, ['-c', grepCommand], {
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
                        if (code === 0 || code === 1) { // 0 = found, 1 = not found (normal for grep)
                            if (stdout.trim() === '') {
                                logger.info(`Aucun résultat trouvé pour le pattern '${args.pattern}'`);
                                resolve(`No matches found for pattern: ${args.pattern}`);
                            } else {
                                logger.info(`Recherche grep terminée avec succès, ${stdout.split('\n').length - 1} lignes trouvées`);
                                resolve(stdout);
                            }
                        } else {
                            const errorMessage = `GitBash grep command failed with code ${code}: ${stderr}`;
                            logger.error(errorMessage);
                            reject(new Error(errorMessage));
                        }
                    });

                    gitBashProcess.on('error', (error) => {
                        logger.error(`Erreur lors de l'exécution de GitBash grep:`, error);
                        reject(error);
                    });

                    // Timeout de 60 secondes pour les recherches
                    setTimeout(() => {
                        gitBashProcess.kill();
                        reject(new Error('GitBash grep command timed out after 60 seconds'));
                    }, 60000);
                });
            });
        },
    });
}