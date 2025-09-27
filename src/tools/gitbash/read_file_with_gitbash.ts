import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { spawn } from "child_process";
import { ExtendedLogger } from "../../helpers/logger.js";

export const ToolName: string = `read_file_with_gitbash`;

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
        filePath: z.string(),
        command: z.enum(['cat', 'head', 'tail']).optional().default('cat'),
        lines: z.number().optional().default(200).describe("Number of lines to display (for head/tail commands)")
    });

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: "Read file content using GitBash Unix commands. This tool allows you to " +
            "read files using Unix commands like cat, head, tail through GitBash on Windows. " +
            "cat: displays entire file, head: first N lines, tail: last N lines. " +
            "Only works within allowed directories.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}': `, args);

                // Validation du chemin
                const validatedPath = config.validatePath(args.filePath);

                // Construction de la commande Unix
                let unixCommand = args.command;
                if (args.lines && (args.command === 'head' || args.command === 'tail')) {
                    unixCommand += ` -n ${args.lines}`;
                }
                unixCommand += ` "${validatedPath.replace(/\\/g, '/')}"`;

                logger.debug(`Commande Unix à exécuter: ${unixCommand}`);

                return new Promise((resolve, reject) => {
                    // Lancement de GitBash avec la commande Unix
                    const gitBashProcess = spawn(config.GitBash.GitBashPath, ['-c', unixCommand], {
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
                            logger.info(`Lecture du fichier ${args.filePath} réussie avec GitBash`);
                            resolve(stdout);
                        } else {
                            const errorMessage = `GitBash command failed with code ${code}: ${stderr}`;
                            logger.error(errorMessage);
                            reject(new Error(errorMessage));
                        }
                    });

                    gitBashProcess.on('error', (error) => {
                        logger.error(`Erreur lors de l'exécution de GitBash:`, error);
                        reject(error);
                    });

                    // Timeout de 30 secondes
                    setTimeout(() => {
                        gitBashProcess.kill();
                        reject(new Error('GitBash command timed out after 30 seconds'));
                    }, 30000);
                });
            });
        },
    });
}