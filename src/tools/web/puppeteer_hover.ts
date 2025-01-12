// src/tools/web/puppeteer_hover.ts
import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import puppeteer, { Browser, Page } from "puppeteer";

export const ToolName: string = `puppeteer_hover`;

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
        selector: z.string().describe("CSS selector for element to hover"),
    });

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: "Hover an element on the page with puppeteer. The element must be visible in the viewport.",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}': `, args);
                
                try {
                    const page = await ensureBrowser();
                    
                    // Attendre que l'élément soit présent dans le DOM
                    await page.waitForSelector(args.selector);
                    
                    // Survoler l'élément
                    await page.hover(args.selector);
                    
                    logger.info(`Survol réussi de l'élément ${args.selector}`);
                    return `Successfully hovered over element: ${args.selector}`;
                    
                } catch (error) {
                    const errorMessage = `Erreur lors du survol de l'élément ${args.selector}: ${error}`;
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
