// src/tools/web/puppeteer_screenshot.ts
import { z } from "zod";
import { FastMCP } from "fastmcp";
import { AppConfig } from "../../models/appConfig.js";
import { ExtendedLogger } from "../../helpers/logger.js";
import puppeteer, { Browser, Page } from "puppeteer";

export const ToolName: string = `puppeteer_screenshot`;

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
        name: z.string().describe("Name for the screenshot"),
        selector: z.string().optional().describe("CSS selector for element to screenshot"),
        width: z.number().optional().describe("Width in pixels (default: 800)"),
        height: z.number().optional().describe("Height in pixels (default: 600)")
    });

    // Ajout de l'outil au serveur
    server.addTool({
        name: ToolName,
        description: "Take a screenshot of the current page or a specific element using Puppeteer",
        parameters: ClientArgsSchema,
        execute: async (args, context) => {
            return logger.withOperationContext(async () => {
                logger.info(`Appel de l'outil '${ToolName}': `, args);

                try {
                    const page = await ensureBrowser();

                    // Configuration de la taille de la fenêtre
                    const width = args.width ?? 800;
                    const height = args.height ?? 600;
                    await page.setViewport({ width, height });

                    // Prise de la capture d'écran
                    const screenshot = await (args.selector ?
                        (await page.$(args.selector))?.screenshot({ encoding: "base64" }) :
                        page.screenshot({ encoding: "base64", fullPage: false }));

                    if (!screenshot) {
                        const errorMessage = args.selector ? 
                            `Element not found: ${args.selector}` : 
                            "Screenshot failed";
                        logger.error(errorMessage);
                        return {
                            content: [{
                                type: "text",
                                text: errorMessage
                            }]
                        };
                    }

                    logger.info(`Capture d'écran réussie: ${args.name}`);
                    return {
                        content: [
                            {
                                type: "image",
                                data: screenshot,
                                mimeType: "image/png"
                            },
                            {
                                type: "text",
                                text: `Screenshot '${args.name}' taken at ${width}x${height}`
                            }
                        ]
                    };
                } catch (error) {
                    const errorMessage = `Error taking screenshot: ${error instanceof Error ? error.message : String(error)}`;
                    logger.error(errorMessage);
                    return {
                        content: [{
                            type: "text",
                            text: errorMessage
                        }]
                    };
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