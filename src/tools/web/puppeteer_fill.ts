// src/tools/web/puppeteer_fill.ts
import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import puppeteer, { Browser, Page } from "puppeteer";

export const ToolName: string = `puppeteer_fill`;

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
        selector: z.string().min(1),
        value: z.string()
    });

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: "Fill out an input field using Puppeteer. Waits for the element to be present before typing.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}': `, args);
                
                try {
                    const page = await ensureBrowser();
                    await page.waitForSelector(args.selector);
                    await page.type(args.selector, args.value);
                    
                    logger.info(`Champ ${args.selector} rempli avec succès`);
                    return `Filled ${args.selector} with: ${args.value}`;
                    
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    logger.error(`Erreur lors du remplissage du champ ${args.selector}:`, { error: errorMessage });
                    throw new Error(`Failed to fill ${args.selector}: ${errorMessage}`);
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