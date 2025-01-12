// src/tools/web/puppeteer_evaluate.ts
import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import puppeteer, { Browser, Page } from "puppeteer";

export const ToolName: string = `puppeteer_evaluate`;

// État global pour le navigateur
let browser: Browser | undefined;
let page: Page | undefined;

/**
 * S'assure que le navigateur est initialisé
 */
async function ensureBrowser() {
    if (!browser) {
        const npx_args = { headless: false }
        const docker_args = { headless: true, args: ["--no-sandbox", "--single-process", "--no-zygote"] }
        browser = await puppeteer.launch(process.env.DOCKER_CONTAINER ? docker_args : npx_args);
        const pages = await browser.pages();
        page = pages[0];
    }
    return page!;
}

// Interface pour stocker les logs du navigateur et la console originale
declare global {
    interface Window {
        mcpHelper: {
            logs: string[],
            originalConsole: Partial<typeof console>,
        }
    }
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
    if (!config.validateTool(ToolName))
        return;

    // Schéma de validation pour les arguments
    const ClientArgsSchema = z.object({
        script: z.string().min(1),
    });

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: "Execute JavaScript in the browser console",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}': `, args);

                try {
                    const page = await ensureBrowser();

                    // Initialisation de l'environnement de capture des logs
                    await page.evaluate(() => {
                        window.mcpHelper = {
                            logs: [],
                            originalConsole: { ...console },
                        };

                        // Redirection des méthodes de la console
                        ['log', 'info', 'warn', 'error'].forEach(method => {
                            (console as any)[method] = (...args: any[]) => {
                                window.mcpHelper.logs.push(`[${method}] ${args.join(' ')}`);
                                (window.mcpHelper.originalConsole as any)[method](...args);
                            };
                        });
                    });

                    // Exécution du script
                    const result = await page.evaluate(args.script);

                    // Récupération des logs et restauration de la console
                    const logs = await page.evaluate(() => {
                        Object.assign(console, window.mcpHelper.originalConsole);
                        const logs = window.mcpHelper.logs;
                        delete (window as any).mcpHelper;
                        return logs;
                    });

                    logger.debug('Script exécuté avec succès');
                    return `Execution result:\n${JSON.stringify(result, null, 2)}\n\nConsole output:\n${logs.join('\n')}`;

                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    logger.error(`Erreur lors de l'exécution du script:`, { error });
                    throw new Error(`Script execution failed: ${errorMessage}`);
                }
            });
        },
    });

    // Gestion de la fermeture propre du navigateur
    process.on('exit', async () => {
        if (browser) {
            await browser.close();
            browser = undefined;
            page = undefined;
        }
    });
}
