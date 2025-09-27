import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { spawn } from "child_process";
import { ExtendedLogger } from "../../helpers/logger.js";

export const ToolName: string = `ls_with_gitbash`;

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
        directory: z.string().optional().describe("Directory to list (optional, defaults to current working directory)"),
        detailed: z.boolean().optional().default(false).describe("Show detailed information (ls -l)"),
        showHidden: z.boolean().optional().default(false).describe("Show hidden files (ls -a)"),
        humanReadable: z.boolean().optional().default(true).describe("Human readable file sizes (ls -h)"),
        sortBy: z.enum(['name', 'size', 'time', 'extension']).optional().default('name').describe("Sort files by"),
        reverse: z.boolean().optional().default(false).describe("Reverse sort order"),
        recursive: z.boolean().optional().default(false).describe("List subdirectories recursively (ls -R)"),
        filesOnly: z.boolean().optional().default(false).describe("Show only files, not directories"),
        directoriesOnly: z.boolean().optional().default(false).describe("Show only directories, not files"),
        pattern: z.string().optional().describe("Filter results by pattern (e.g., '*.js', 'test*')")
    });

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: "List directory contents using GitBash ls command. Supports detailed view, hidden files, " +
            "different sorting options, recursive listing, and pattern filtering. Can show only files or directories. " +
            "Works with common ls options like -l, -a, -h, -R. Only works within allowed directories.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}': `, args);

                // Validation du chemin (optionnel)
                let listPath = '.';
                if (args.directory) {
                    listPath = config.validatePath(args.directory);
                }

                // Construction de la commande ls
                let lsCommand = 'ls';

                // Options de base
                let options = '';
                if (args.detailed) options += 'l';
                if (args.showHidden) options += 'a';
                if (args.humanReadable && args.detailed) options += 'h';
                if (args.recursive) options += 'R';

                if (options) {
                    lsCommand += ` -${options}`;
                }

                // Tri
                if (args.sortBy === 'size') {
                    lsCommand += ' -S';
                } else if (args.sortBy === 'time') {
                    lsCommand += ' -t';
                } else if (args.sortBy === 'extension') {
                    lsCommand += ' -X';
                }

                // Ordre inverse
                if (args.reverse) {
                    lsCommand += ' -r';
                }

                // Ajouter le chemin
                lsCommand += ` "${listPath.replace(/\\/g, '/')}"`;

                // Filtrage par pattern
                if (args.pattern) {
                    lsCommand += ` | grep "${args.pattern}"`;
                }

                // Filtrage par type
                if (args.filesOnly && !args.directoriesOnly) {
                    // Afficher seulement les fichiers (exclure les lignes commençant par 'd' en mode détaillé)
                    if (args.detailed) {
                        lsCommand += ' | grep -v "^d"';
                    } else {
                        // En mode simple, utiliser find pour filtrer
                        lsCommand = `find "${listPath.replace(/\\/g, '/')}" -maxdepth 1 -type f`;
                        if (args.pattern) {
                            lsCommand += ` -name "${args.pattern}"`;
                        }
                        lsCommand += ' | xargs ls';
                        if (options) lsCommand += ` -${options}`;
                    }
                } else if (args.directoriesOnly && !args.filesOnly) {
                    // Afficher seulement les dossiers
                    if (args.detailed) {
                        lsCommand += ' | grep "^d"';
                    } else {
                        lsCommand = `find "${listPath.replace(/\\/g, '/')}" -maxdepth 1 -type d`;
                        if (args.pattern) {
                            lsCommand += ` -name "${args.pattern}"`;
                        }
                        lsCommand += ' | xargs ls';
                        if (options) lsCommand += ` -${options}`;
                    }
                }

                logger.debug(`Commande ls à exécuter: ${lsCommand}`);

                return new Promise((resolve, reject) => {
                    // Lancement de GitBash avec la commande ls
                    const gitBashProcess = spawn(config.GitBash.GitBashPath, ['-c', lsCommand], {
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
                                logger.info(`Répertoire vide ou aucun fichier correspondant au critère`);
                                resolve(`Directory is empty or no files match the criteria.`);
                            } else {
                                const lineCount = stdout.trim().split('\n').length;
                                logger.info(`Listing terminé avec succès, ${lineCount} éléments trouvés`);
                                resolve(stdout);
                            }
                        } else {
                            const errorMessage = `GitBash ls command failed with code ${code}: ${stderr}`;
                            logger.error(errorMessage);
                            reject(new Error(errorMessage));
                        }
                    });

                    gitBashProcess.on('error', (error) => {
                        logger.error(`Erreur lors de l'exécution de GitBash ls:`, error);
                        reject(error);
                    });

                    // Timeout de 30 secondes
                    setTimeout(() => {
                        gitBashProcess.kill();
                        reject(new Error('GitBash ls command timed out after 30 seconds'));
                    }, 30000);
                });
            });
        },
    });
}