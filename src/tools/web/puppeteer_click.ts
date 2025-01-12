// src/tools/web/puppeteer_click.ts
import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import puppeteer, { Browser, Page } from "puppeteer";

export const ToolName: string = `puppeteer_click`;

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
        selector: z.string(),
    });

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: "Click an element on the page using Puppeteer. The element is selected using a CSS selector.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}': `, args);
               
                try {
                    const page = await ensureBrowser();
                    // On attend que l'élément soit présent dans la page
                    await page.waitForSelector(args.selector);
                    // On clique sur l'élément
                    await page.click(args.selector);
                    
                    logger.info(`Clic réussi sur l'élément ${args.selector}`);
                    return `Clicked element: ${args.selector}`;
                } catch (error) {
                    const errorMessage = `Failed to click element ${args.selector}: ${error instanceof Error ? error.message : String(error)}`;
                    logger.error(errorMessage);
                    throw new Error(errorMessage);
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